import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useProject } from '@/contexts/ProjectContext'
import { useItensCompra, useFornecedores, usePedidos, type ItemCompra, type Fornecedor } from '@/hooks/useCompras'
import { useEtapas } from '@/hooks/useEtapas'
import { supabase } from '@/lib/supabase'
import { gerarParcelas, parsearCondicao, localDate } from '@/lib/parcelas'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import {
  X, ChevronRight, ChevronLeft, Check, Filter,
  Boxes, Loader2, AlertTriangle,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────
const INPUT = 'w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'
const LABEL = 'mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground'

interface LoteConfig {
  casas: number
  dataEntrega: string
}

const PATTERNS: Array<{ id: string; label: string; lotesDefault: number[] }> = [
  { id: '2x32', label: '2 lotes (32+32)', lotesDefault: [32, 32] },
  { id: '3x', label: '3 lotes (24+20+20)', lotesDefault: [24, 20, 20] },
  { id: '4x16', label: '4 lotes (16+16+16+16)', lotesDefault: [16, 16, 16, 16] },
  { id: 'custom', label: 'Personalizado', lotesDefault: [32] },
]

// ─── Main Component ───────────────────────────────────
export default function GerarPedidosWizard({ onClose }: { onClose: () => void }) {
  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const { data: itens = [] } = useItensCompra()
  const { data: etapas = [] } = useEtapas()
  const { data: fornecedores = [] } = useFornecedores()
  const { data: pedidosExistentes = [] } = usePedidos()

  const [step, setStep] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [filterEtapa, setFilterEtapa] = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [filterSemPedido, setFilterSemPedido] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  const [pattern, setPattern] = useState('2x32')
  const [lotes, setLotes] = useState<LoteConfig[]>([
    { casas: 32, dataEntrega: '' },
    { casas: 32, dataEntrega: '' },
  ])
  const [useItemConfig, setUseItemConfig] = useState(true)
  const [overrideFornecedor, setOverrideFornecedor] = useState('')
  const [overrideCond, setOverrideCond] = useState('')

  const [generating, setGenerating] = useState(false)

  // ── Step 1: Filtered items ──────────────────────────
  const itensSemPedido = useMemo(() => {
    const idsComPedido = new Set(pedidosExistentes.map((p) => p.item_compra_id))
    return new Set(itens.filter((i) => !idsComPedido.has(i.id)).map((i) => i.id))
  }, [itens, pedidosExistentes])

  const filteredItens = useMemo(() => {
    return itens.filter((i) => {
      if (filterSemPedido && !itensSemPedido.has(i.id)) return false
      if (filterEtapa && i.etapa_id !== filterEtapa) return false
      if (filterTipo && i.tipo !== filterTipo) return false
      if (searchTerm) {
        const s = searchTerm.toLowerCase()
        if (!i.descricao.toLowerCase().includes(s) && !i.codigo.toLowerCase().includes(s)) return false
      }
      return true
    })
  }, [itens, filterSemPedido, filterEtapa, filterTipo, searchTerm, itensSemPedido])

  const toggleAll = () => {
    if (selectedIds.size === filteredItens.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredItens.map((i) => i.id)))
    }
  }

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAllSemPedido = () => {
    setSelectedIds(new Set(itens.filter((i) => itensSemPedido.has(i.id)).map((i) => i.id)))
  }

  // ── Step 2: Pattern change ──────────────────────────
  const handlePatternChange = (patternId: string) => {
    setPattern(patternId)
    const found = PATTERNS.find((p) => p.id === patternId)
    if (found) {
      setLotes(found.lotesDefault.map((c) => ({ casas: c, dataEntrega: '' })))
    }
  }

  const updateLote = (idx: number, field: keyof LoteConfig, value: string | number) => {
    setLotes((prev) => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  const addLote = () => setLotes((prev) => [...prev, { casas: 16, dataEntrega: '' }])
  const removeLote = (idx: number) => setLotes((prev) => prev.filter((_, i) => i !== idx))

  const totalCasasLotes = lotes.reduce((s, l) => s + (l.casas || 0), 0)
  const casasProjeto = currentCompany?.qtd_casas ?? 64

  // ── Step 3: Preview ─────────────────────────────────
  const previewPedidos = useMemo(() => {
    const selected = itens.filter((i) => selectedIds.has(i.id))
    const rows: Array<{
      item: ItemCompra
      loteNum: number
      casas: number
      qtd: number
      valorUnit: number
      valorTotal: number
      fornecedor: Fornecedor | null
      condPagamento: string
      dataEntrega: string
      parcelasCount: number
    }> = []

    for (const item of selected) {
      const fornecedor = useItemConfig
        ? fornecedores.find((f) => f.id === item.fornecedor_id) ?? null
        : fornecedores.find((f) => f.id === overrideFornecedor) ?? null
      const cond = useItemConfig
        ? item.cond_pagamento ?? ''
        : overrideCond

      for (let li = 0; li < lotes.length; li++) {
        const lote = lotes[li]!
        const qtdPorCasa = item.qtd_por_casa ?? 0
        const qtd = Math.round(lote.casas * qtdPorCasa * 100) / 100
        const valorUnit = item.custo_unitario_orcado ?? 0
        const valorTotal = Math.round(qtd * valorUnit * 100) / 100
        const parcelasCount = cond ? parsearCondicao(cond).length : 1

        rows.push({
          item,
          loteNum: li + 1,
          casas: lote.casas,
          qtd,
          valorUnit,
          valorTotal,
          fornecedor,
          condPagamento: cond,
          dataEntrega: lote.dataEntrega,
          parcelasCount,
        })
      }
    }
    return rows
  }, [selectedIds, itens, lotes, useItemConfig, overrideFornecedor, overrideCond, fornecedores])

  const totalPedidos = previewPedidos.length
  const totalValor = previewPedidos.reduce((s, p) => s + p.valorTotal, 0)
  const totalParcelas = previewPedidos.reduce((s, p) => s + p.parcelasCount, 0)

  // ── Generate ────────────────────────────────────────
  const handleGenerate = async () => {
    if (!currentCompany) return
    setGenerating(true)

    let successPedidos = 0
    let successParcelas = 0
    const errors: string[] = []

    for (const row of previewPedidos) {
      try {
        const { data: pedido, error: pedidoErr } = await supabase
          .from('pedidos')
          .insert({
            company_id: currentCompany.id,
            item_compra_id: row.item.id,
            casas_lote: row.casas,
            qtd_lote: row.qtd,
            valor_unitario_real: row.valorUnit,
            valor_total_real: row.valorTotal,
            fornecedor_id: row.fornecedor?.id ?? null,
            cond_pagamento: row.condPagamento || null,
            data_entrega_prevista: row.dataEntrega || null,
            status: 'planejado',
          })
          .select()
          .single()

        if (pedidoErr) throw pedidoErr
        successPedidos++

        if (row.valorTotal > 0 && pedido) {
          const fallbackData = new Date()
          fallbackData.setDate(fallbackData.getDate() + 30)

          const parcelas = gerarParcelas({
            pedidoId: pedido.id,
            companyId: currentCompany.id,
            valorTotal: row.valorTotal,
            condPagamento: row.condPagamento || 'à vista',
            dataEntrega: row.dataEntrega ? localDate(row.dataEntrega) : fallbackData,
          })
          if (parcelas.length > 0) {
            const { error: parcErr } = await supabase.from('parcelas').insert(parcelas)
            if (parcErr) throw parcErr
            successParcelas += parcelas.length
          }
        }
      } catch (err) {
        errors.push(`${row.item.codigo} (Lote ${row.loteNum}): ${err instanceof Error ? err.message : 'Erro'}`)
      }
    }

    setGenerating(false)
    qc.invalidateQueries({ queryKey: ['pedidos'] })
    qc.invalidateQueries({ queryKey: ['parcelas'] })
    qc.invalidateQueries({ queryKey: ['onboarding-status'] })

    if (successPedidos > 0) {
      toast.success(`${successPedidos} pedidos criados, ${successParcelas} parcelas geradas`)
    }
    if (errors.length > 0) {
      toast.error(`${errors.length} erro(s) na geração`)
      console.error('Erros:', errors)
    }
    if (errors.length === 0) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <Boxes className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Gerar Pedidos Automáticos</h2>
              <p className="text-[10px] text-muted-foreground">Passo {step} de 3</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1 border-b px-6 py-2">
          {['Selecionar Itens', 'Configurar Lotes', 'Preview & Gerar'].map((label, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                step > i + 1 ? 'bg-emerald-500 text-white' :
                step === i + 1 ? 'bg-primary text-primary-foreground' :
                'bg-muted text-muted-foreground'
              }`}>
                {step > i + 1 ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className={`text-xs ${step === i + 1 ? 'font-medium' : 'text-muted-foreground'}`}>{label}</span>
              {i < 2 && <ChevronRight className="mx-1 h-3 w-3 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <Step1
              filteredItens={filteredItens}
              selectedIds={selectedIds}
              toggleAll={toggleAll}
              toggleOne={toggleOne}
              selectAllSemPedido={selectAllSemPedido}
              itensSemPedido={itensSemPedido}
              etapas={etapas}
              filterEtapa={filterEtapa}
              setFilterEtapa={setFilterEtapa}
              filterTipo={filterTipo}
              setFilterTipo={setFilterTipo}
              filterSemPedido={filterSemPedido}
              setFilterSemPedido={setFilterSemPedido}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
            />
          )}

          {step === 2 && (
            <Step2
              pattern={pattern}
              handlePatternChange={handlePatternChange}
              lotes={lotes}
              updateLote={updateLote}
              addLote={addLote}
              removeLote={removeLote}
              totalCasasLotes={totalCasasLotes}
              casasProjeto={casasProjeto}
              useItemConfig={useItemConfig}
              setUseItemConfig={setUseItemConfig}
              overrideFornecedor={overrideFornecedor}
              setOverrideFornecedor={setOverrideFornecedor}
              overrideCond={overrideCond}
              setOverrideCond={setOverrideCond}
              fornecedores={fornecedores}
            />
          )}

          {step === 3 && (
            <Step3
              previewPedidos={previewPedidos}
              totalPedidos={totalPedidos}
              totalValor={totalValor}
              totalParcelas={totalParcelas}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-3">
          <div className="text-xs text-muted-foreground">
            {step === 1 && `${selectedIds.size} item(ns) selecionado(s)`}
            {step === 2 && `${lotes.length} lote(s) • ${totalCasasLotes} casas`}
            {step === 3 && `${totalPedidos} pedidos • ${formatCurrency(totalValor)} • ${totalParcelas} parcelas`}
          </div>
          <div className="flex gap-2">
            {step > 1 && (
              <button onClick={() => setStep((s) => s - 1)} className="flex items-center gap-1 rounded-lg border px-4 py-2 text-sm hover:bg-accent">
                <ChevronLeft className="h-4 w-4" /> Voltar
              </button>
            )}
            {step < 3 && (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={step === 1 && selectedIds.size === 0}
                className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                Avançar <ChevronRight className="h-4 w-4" />
              </button>
            )}
            {step === 3 && (
              <button
                onClick={handleGenerate}
                disabled={generating || totalPedidos === 0}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {generating ? 'Gerando...' : 'Gerar Pedidos'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Step 1 — Select Items
// ═══════════════════════════════════════════════════════════════
function Step1(props: {
  filteredItens: ItemCompra[]
  selectedIds: Set<string>
  toggleAll: () => void
  toggleOne: (id: string) => void
  selectAllSemPedido: () => void
  itensSemPedido: Set<string>
  etapas: Array<{ id: string; codigo: string; nome: string }>
  filterEtapa: string
  setFilterEtapa: (v: string) => void
  filterTipo: string
  setFilterTipo: (v: string) => void
  filterSemPedido: boolean
  setFilterSemPedido: (v: boolean) => void
  searchTerm: string
  setSearchTerm: (v: string) => void
}) {
  const { filteredItens, selectedIds, toggleAll, toggleOne, selectAllSemPedido, itensSemPedido } = props
  const allSelected = filteredItens.length > 0 && selectedIds.size === filteredItens.length

  return (
    <>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[160px]">
          <label className={LABEL}>Buscar</label>
          <input type="text" value={props.searchTerm} onChange={(e) => props.setSearchTerm(e.target.value)} placeholder="Código ou descrição..." className={INPUT} />
        </div>
        <div className="min-w-[160px]">
          <label className={LABEL}>Etapa</label>
          <select value={props.filterEtapa} onChange={(e) => props.setFilterEtapa(e.target.value)} className={INPUT}>
            <option value="">Todas</option>
            {props.etapas.map((e) => <option key={e.id} value={e.id}>{e.codigo} - {e.nome}</option>)}
          </select>
        </div>
        <div className="min-w-[120px]">
          <label className={LABEL}>Tipo</label>
          <select value={props.filterTipo} onChange={(e) => props.setFilterTipo(e.target.value)} className={INPUT}>
            <option value="">Todos</option>
            <option value="MATERIAL">Material</option>
            <option value="MAO_DE_OBRA">Mão de Obra</option>
            <option value="EQUIPAMENTO">Equipamento</option>
          </select>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs">
          <input type="checkbox" checked={props.filterSemPedido} onChange={(e) => props.setFilterSemPedido(e.target.checked)} className="rounded" />
          <Filter className="h-3 w-3" /> Sem pedidos ({itensSemPedido.size})
        </label>
        <button onClick={selectAllSemPedido} className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10">
          Selecionar todos sem pedido
        </button>
      </div>

      {/* Table */}
      <div className="max-h-[400px] overflow-auto rounded-xl border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className="w-10 px-3 py-2.5 text-center">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
              </th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase">Código</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase">Descrição</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase">Tipo</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase">Fornecedor</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase">Qtd/Casa</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase">Unit. (R$)</th>
              <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase">Cond.</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredItens.map((item) => (
              <tr
                key={item.id}
                onClick={() => toggleOne(item.id)}
                className={`cursor-pointer transition-colors ${selectedIds.has(item.id) ? 'bg-primary/5' : 'hover:bg-muted/30'}`}
              >
                <td className="px-3 py-2 text-center">
                  <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleOne(item.id)} className="rounded" />
                </td>
                <td className="px-3 py-2 font-mono text-[10px]">{item.codigo}</td>
                <td className="max-w-[200px] truncate px-3 py-2">{item.descricao}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                    item.tipo === 'MATERIAL' ? 'bg-blue-500/10 text-blue-600' :
                    item.tipo === 'MAO_DE_OBRA' ? 'bg-amber-500/10 text-amber-600' :
                    'bg-orange-500/10 text-orange-600'
                  }`}>{item.tipo === 'MAO_DE_OBRA' ? 'M.O.' : item.tipo === 'MATERIAL' ? 'MAT' : 'EQP'}</span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{item.fornecedor_nome ?? '—'}</td>
                <td className="px-3 py-2 text-right">{item.qtd_por_casa ?? '—'}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(item.custo_unitario_orcado)}</td>
                <td className="px-3 py-2 text-center font-mono text-[10px] text-muted-foreground">{item.cond_pagamento ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredItens.length === 0 && (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
            Nenhum item encontrado com os filtros atuais
          </div>
        )}
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// Step 2 — Configure Lots
// ═══════════════════════════════════════════════════════════════
function Step2(props: {
  pattern: string
  handlePatternChange: (v: string) => void
  lotes: LoteConfig[]
  updateLote: (idx: number, field: keyof LoteConfig, value: string | number) => void
  addLote: () => void
  removeLote: (idx: number) => void
  totalCasasLotes: number
  casasProjeto: number
  useItemConfig: boolean
  setUseItemConfig: (v: boolean) => void
  overrideFornecedor: string
  setOverrideFornecedor: (v: string) => void
  overrideCond: string
  setOverrideCond: (v: string) => void
  fornecedores: Fornecedor[]
}) {
  return (
    <div className="space-y-5">
      {/* Pattern selector */}
      <div>
        <label className={LABEL}>Padrão de Loteamento</label>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {PATTERNS.map((p) => (
            <button
              key={p.id}
              onClick={() => props.handlePatternChange(p.id)}
              className={`rounded-xl border p-3 text-left transition-all ${
                props.pattern === p.id
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'hover:border-foreground/20'
              }`}
            >
              <p className="text-xs font-semibold">{p.label}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {p.lotesDefault.join(' + ')} = {p.lotesDefault.reduce((a, b) => a + b, 0)} casas
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Lotes config */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className={LABEL}>Configuração dos Lotes</label>
          <div className="flex items-center gap-2">
            {props.totalCasasLotes !== props.casasProjeto && (
              <span className="flex items-center gap-1 text-[10px] text-amber-500">
                <AlertTriangle className="h-3 w-3" />
                {props.totalCasasLotes}/{props.casasProjeto} casas
              </span>
            )}
            {props.totalCasasLotes === props.casasProjeto && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-500">
                <Check className="h-3 w-3" /> {props.totalCasasLotes} casas ✓
              </span>
            )}
          </div>
        </div>
        <div className="space-y-2">
          {props.lotes.map((lote, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                {i + 1}
              </span>
              <div className="flex-1">
                <label className={LABEL}>Casas</label>
                <input
                  type="number"
                  step="any"
                  value={lote.casas}
                  onChange={(e) => props.updateLote(i, 'casas', parseFloat(e.target.value.replace(',', '.')) || 0)}
                  className={`${INPUT} w-24`}
                />
              </div>
              <div className="flex-1">
                <label className={LABEL}>Data Entrega Prevista</label>
                <input
                  type="date"
                  value={lote.dataEntrega}
                  onChange={(e) => props.updateLote(i, 'dataEntrega', e.target.value)}
                  className={INPUT}
                />
              </div>
              {props.lotes.length > 1 && (
                <button onClick={() => props.removeLote(i)} className="mt-4 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {props.pattern === 'custom' && (
          <button onClick={props.addLote} className="mt-2 text-xs font-medium text-primary hover:underline">
            + Adicionar lote
          </button>
        )}
      </div>

      {/* Override config */}
      <div className="rounded-xl border p-4">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={props.useItemConfig}
            onChange={(e) => props.setUseItemConfig(e.target.checked)}
            className="rounded"
          />
          Usar fornecedor e condição de pagamento de cada item
        </label>
        {!props.useItemConfig && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className={LABEL}>Fornecedor (todos)</label>
              <select 
                value={props.overrideFornecedor} 
                onChange={(e) => {
                  const val = e.target.value
                  props.setOverrideFornecedor(val)
                  const f = props.fornecedores.find(x => x.id === val)
                  if (f && f.cond_pagamento_padrao) {
                    props.setOverrideCond(f.cond_pagamento_padrao)
                  }
                }} 
                className={INPUT}
              >
                <option value="">Selecione</option>
                {props.fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Cond. Pagamento (todos)</label>
              <input type="text" value={props.overrideCond} onChange={(e) => props.setOverrideCond(e.target.value)} placeholder="30/60" className={INPUT} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Step 3 — Preview & Generate
// ═══════════════════════════════════════════════════════════════
function Step3(props: {
  previewPedidos: Array<{
    item: ItemCompra; loteNum: number; casas: number; qtd: number; valorUnit: number;
    valorTotal: number; fornecedor: Fornecedor | null; condPagamento: string; dataEntrega: string; parcelasCount: number;
  }>
  totalPedidos: number
  totalValor: number
  totalParcelas: number
}) {
  return (
    <>
      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-primary/5 p-3 text-center">
          <p className="text-[10px] font-medium uppercase text-muted-foreground">Pedidos</p>
          <p className="text-xl font-bold text-primary">{props.totalPedidos}</p>
        </div>
        <div className="rounded-xl border bg-emerald-500/5 p-3 text-center">
          <p className="text-[10px] font-medium uppercase text-muted-foreground">Valor Total</p>
          <p className="text-xl font-bold text-emerald-600">{formatCurrency(props.totalValor)}</p>
        </div>
        <div className="rounded-xl border bg-amber-500/5 p-3 text-center">
          <p className="text-[10px] font-medium uppercase text-muted-foreground">Parcelas</p>
          <p className="text-xl font-bold text-amber-600">{props.totalParcelas}</p>
        </div>
      </div>

      {/* Preview table */}
      <div className="max-h-[350px] overflow-auto rounded-xl border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase">Item</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase">Descrição</th>
              <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase">Lote</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase">Casas</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase">Qtd</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase">Unit.</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase">Total</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase">Fornecedor</th>
              <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase">Cond.</th>
              <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase">Entrega</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {props.previewPedidos.map((row, i) => (
              <tr key={i} className="hover:bg-muted/20">
                <td className="px-3 py-2 font-mono text-[10px]">{row.item.codigo}</td>
                <td className="max-w-[160px] truncate px-3 py-2">{row.item.descricao}</td>
                <td className="px-3 py-2 text-center">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">#{row.loteNum}</span>
                </td>
                <td className="px-3 py-2 text-right">{row.casas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right">{row.qtd.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(row.valorUnit)}</td>
                <td className="px-3 py-2 text-right font-medium">{formatCurrency(row.valorTotal)}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.fornecedor?.nome ?? '—'}</td>
                <td className="px-3 py-2 text-center font-mono text-[10px]">{row.condPagamento || '—'}</td>
                <td className="px-3 py-2 text-center">{row.dataEntrega ? localDate(row.dataEntrega).toLocaleDateString('pt-BR') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {props.totalPedidos === 0 && (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
            Nenhum pedido para gerar. Volte e configure os lotes.
          </div>
        )}
      </div>
    </>
  )
}
