/**
 * Build Fleury — Modal de Edição de Conciliação
 *
 * Permite editar os vínculos de uma conciliação já confirmada nas 4 origens
 * (parcela, medição, parcela de mútuo, mútuo). Ajusta valor_aplicado por
 * vínculo e o saldo/status da origem é recalculado via useUpdateConciliacao
 * (trigger SQL para parcelas; aplicarDeltaOrigem/sincronização para as demais).
 */
import { useState, useMemo, useEffect } from 'react'
import { X, Plus, Trash2, Save, AlertTriangle, Search, ChevronDown, ChevronRight } from 'lucide-react'
import { useUpdateConciliacao, type VinculoPayload, type VinculoOrigem } from '@/hooks/useConciliacao'
import { useParcelas } from '@/hooks/useFinanceiro'
import { useMedicoes } from '@/hooks/useOperacional'
import { useMutuos } from '@/hooks/useMutuos'
import { formatCurrency } from '@/lib/utils'

interface LinkState {
  origem: VinculoOrigem
  origem_id: string
  valor_aplicado: number
  valor_juros: number
  valor_multa: number
  valor_desconto: number
  observacao: string | null
  encargosOpen: boolean
}

interface Candidato {
  origem: VinculoOrigem
  origem_id: string
  descricao: string
  fornecedor: string | null
  data: string | null
  valor: number
  valor_pago: number
  status: string
}

interface Props {
  conciliacao: any
  movimentacao: any
  onClose: () => void
}

const linkKey = (l: { origem: VinculoOrigem; origem_id: string }) => `${l.origem}:${l.origem_id}`

const ORIGEM_BADGE: Record<VinculoOrigem, { label: string; cls: string }> = {
  parcela:       { label: 'Parcela',  cls: 'bg-blue-500/10 text-blue-600' },
  medicao:       { label: 'Medição',  cls: 'bg-emerald-500/10 text-emerald-600' },
  mutuo_parcela: { label: 'Mútuo P.', cls: 'bg-violet-500/10 text-violet-600' },
  mutuo:         { label: 'Mútuo',    cls: 'bg-amber-500/10 text-amber-600' },
}

function inferirOrigemLink(l: any): { origem: VinculoOrigem; origem_id: string } | null {
  if (l.parcela_id) return { origem: 'parcela', origem_id: l.parcela_id }
  if (l.medicao_id) return { origem: 'medicao', origem_id: l.medicao_id }
  if (l.mutuo_parcela_id) return { origem: 'mutuo_parcela', origem_id: l.mutuo_parcela_id }
  if (l.mutuo_id) return { origem: 'mutuo', origem_id: l.mutuo_id }
  return null
}

export function EditConciliacaoDialog({ conciliacao, movimentacao, onClose }: Props) {
  const { data: parcelas = [] } = useParcelas()
  const { data: medicoes = [] } = useMedicoes()
  const { data: mutuos = [] } = useMutuos()
  const update = useUpdateConciliacao()

  const [links, setLinks] = useState<LinkState[]>(() =>
    (conciliacao.conciliacao_parcelas ?? [])
      .map((l: any) => {
        const o = inferirOrigemLink(l)
        if (!o) return null
        return {
          origem: o.origem,
          origem_id: o.origem_id,
          valor_aplicado: Number(l.valor_aplicado),
          valor_juros: Number(l.valor_juros ?? 0),
          valor_multa: Number(l.valor_multa ?? 0),
          valor_desconto: Number(l.valor_desconto ?? 0),
          observacao: l.observacao ?? null,
          encargosOpen: Number(l.valor_juros ?? 0) > 0 || Number(l.valor_multa ?? 0) > 0 || Number(l.valor_desconto ?? 0) > 0,
        }
      })
      .filter((l: LinkState | null): l is LinkState => l !== null)
  )
  const [search, setSearch] = useState('')
  const [showPicker, setShowPicker] = useState(false)

  // Pool unificado das 4 origens (mesmo padrão do ReconciliationSidePanel)
  const candidatos = useMemo(() => {
    const out: Candidato[] = []
    for (const p of parcelas) {
      out.push({
        origem: 'parcela',
        origem_id: p.id,
        descricao: (p as any).pedido_item ?? p.descricao ?? `Parcela P${p.numero_parcela}`,
        fornecedor: (p as any).fornecedor_nome ?? null,
        data: p.data_vencimento,
        valor: Number(p.valor),
        valor_pago: Number(p.valor_pago ?? 0),
        status: p.status,
      })
    }
    for (const m of medicoes) {
      out.push({
        origem: 'medicao',
        origem_id: m.id,
        descricao: `Medição nº ${m.numero}`,
        fornecedor: 'Cliente (Contrato)',
        data: m.data_prevista,
        valor: Number(m.valor_planejado ?? 0),
        valor_pago: Number(m.valor_liberado ?? 0),
        status: m.status,
      })
    }
    for (const mut of (mutuos as any[])) {
      for (const mp of (mut.parcelas ?? []) as any[]) {
        out.push({
          origem: 'mutuo_parcela',
          origem_id: mp.id,
          descricao: `Devolução ${mut.nome} · P${mp.numero_parcela}`,
          fornecedor: mut.fornecedor?.nome ?? mut.instituicao ?? null,
          data: mp.data_vencimento,
          valor: Number(mp.valor ?? 0),
          valor_pago: Number(mp.valor_pago ?? 0),
          status: mp.status,
        })
      }
      out.push({
        origem: 'mutuo',
        origem_id: mut.id,
        descricao: `Captação: ${mut.nome}`,
        fornecedor: mut.fornecedor?.nome ?? mut.instituicao ?? null,
        data: mut.data_captacao,
        valor: Number(mut.valor_captado ?? 0),
        valor_pago: 0,
        status: mut.status ?? 'ativo',
      })
    }
    return out
  }, [parcelas, medicoes, mutuos])

  const candidatoByKey = useMemo(() => {
    const m = new Map<string, Candidato>()
    for (const c of candidatos) m.set(linkKey(c), c)
    return m
  }, [candidatos])

  const totalAplicado = links.reduce((s, l) => s + Number(l.valor_aplicado || 0), 0)
  const totalJuros    = links.reduce((s, l) => s + Number(l.valor_juros    || 0), 0)
  const totalMulta    = links.reduce((s, l) => s + Number(l.valor_multa    || 0), 0)
  const totalDesconto = links.reduce((s, l) => s + Number(l.valor_desconto || 0), 0)
  const totalBruto    = totalAplicado + totalJuros + totalMulta - totalDesconto
  const valorMov = Math.abs(Number(movimentacao?.valor ?? 0))
  const diferenca = valorMov - totalBruto

  const filteredCandidatos = useMemo(() => {
    const selected = new Set(links.map(linkKey))
    const q = search.toLowerCase().trim()
    return candidatos
      .filter(c => !selected.has(linkKey(c)))
      .filter(c => {
        if (!q) return true
        return c.descricao.toLowerCase().includes(q)
          || (c.fornecedor ?? '').toLowerCase().includes(q)
          || String(c.valor).includes(q)
      })
      .slice(0, 15)
  }, [candidatos, links, search])

  const handleAdd = (c: Candidato) => {
    const restante = Math.max(0, c.valor - c.valor_pago)
    const sugerido = Math.min(restante, Math.max(0, diferenca))
    setLinks(prev => [...prev, {
      origem: c.origem,
      origem_id: c.origem_id,
      valor_aplicado: sugerido > 0 ? sugerido : (restante > 0 ? restante : c.valor),
      valor_juros: 0, valor_multa: 0, valor_desconto: 0,
      observacao: null,
      encargosOpen: false,
    }])
    setShowPicker(false)
    setSearch('')
  }

  const handleRemove = (key: string) => {
    setLinks(prev => prev.filter(l => linkKey(l) !== key))
  }

  const handleField = (key: string, field: keyof LinkState, value: number | boolean) => {
    setLinks(prev => prev.map(l => linkKey(l) === key ? { ...l, [field]: value } : l))
  }

  const handleSave = async () => {
    if (links.length === 0) {
      if (!confirm('Remover todos os vínculos deixará esta conciliação sem origem. Continuar?')) return
    }
    const vinculos: VinculoPayload[] = links.map(l => ({
      origem: l.origem,
      origem_id: l.origem_id,
      valor_aplicado: Number(l.valor_aplicado) || 0,
      valor_juros: Number(l.valor_juros) || 0,
      valor_multa: Number(l.valor_multa) || 0,
      valor_desconto: Number(l.valor_desconto) || 0,
      observacao: l.observacao,
    }))
    await update.mutateAsync({ conciliacaoId: conciliacao.id, vinculos })
    onClose()
  }

  // ESC to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-2xl rounded-xl border bg-card shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-base font-bold">Editar Conciliação</h2>
            <p className="text-[11px] text-muted-foreground">
              {movimentacao?.descricao ?? '—'} · {movimentacao?.data ?? ''} ·{' '}
              <span className={movimentacao?.tipo === 'entrada' ? 'text-emerald-600' : 'text-red-500'}>
                {formatCurrency(valorMov)}
              </span>
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {/* Linked origins */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Vínculos ({links.length})
              </p>
              <button onClick={() => setShowPicker(v => !v)}
                className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground hover:opacity-90">
                <Plus className="h-3 w-3" />Adicionar
              </button>
            </div>

            {links.length === 0 && (
              <p className="rounded-md bg-muted/40 p-3 text-center text-xs text-muted-foreground">
                Nenhum vínculo
              </p>
            )}

            <div className="space-y-2">
              {links.map(l => {
                const key = linkKey(l)
                const c = candidatoByKey.get(key)
                const badge = ORIGEM_BADGE[l.origem]
                const totalLinha = Number(l.valor_aplicado) + Number(l.valor_juros) + Number(l.valor_multa) - Number(l.valor_desconto)
                const temEncargos = Number(l.valor_juros) > 0 || Number(l.valor_multa) > 0 || Number(l.valor_desconto) > 0
                return (
                  <div key={key} className="rounded-md border bg-card p-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">
                          <span className={`mr-1.5 rounded px-1 py-0.5 text-[9px] font-bold ${badge.cls}`}>
                            {badge.label}
                          </span>
                          {c?.descricao ?? 'Origem'}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {l.origem === 'mutuo' ? 'Captação' : 'Venc'}: {c?.data ?? '—'} · Valor: {formatCurrency(Number(c?.valor ?? 0))}
                          {l.origem !== 'mutuo' && <>{' · '}{l.origem === 'medicao' ? 'Liberado' : 'Pago'}: {formatCurrency(Number(c?.valor_pago ?? 0))}</>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <input type="number" step="0.01" value={l.valor_aplicado}
                          onChange={(e) => handleField(key, 'valor_aplicado', Number(e.target.value) || 0)}
                          className="w-28 rounded border bg-background px-2 py-1 text-xs text-right font-mono"
                          title="Principal (vai pro saldo pago/liberado da origem)" />
                        <button onClick={() => handleField(key, 'encargosOpen', !l.encargosOpen)}
                          title="Juros / Multa / Desconto"
                          className={`flex items-center gap-0.5 rounded px-1.5 py-1 text-[10px] font-bold transition-colors ${
                            temEncargos ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                        : 'hover:bg-muted text-muted-foreground'
                          }`}>
                          {l.encargosOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          Encargos
                        </button>
                        <button onClick={() => handleRemove(key)}
                          className="rounded p-1 hover:bg-red-500/10 text-red-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {l.encargosOpen && (
                      <div className="mt-2 grid grid-cols-3 gap-2 rounded bg-muted/40 p-2">
                        {(['valor_juros', 'valor_multa', 'valor_desconto'] as const).map(field => (
                          <div key={field} className="flex flex-col gap-0.5">
                            <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                              {field === 'valor_juros' ? 'Juros' : field === 'valor_multa' ? 'Multa' : 'Desconto'}
                            </label>
                            <input type="number" step="0.01" min="0" value={l[field]}
                              onChange={(e) => handleField(key, field, Math.max(0, Number(e.target.value) || 0))}
                              className="w-full rounded border bg-background px-2 py-1 text-xs text-right font-mono" />
                          </div>
                        ))}
                      </div>
                    )}
                    {temEncargos && (
                      <p className="mt-1 text-[10px] text-muted-foreground text-right">
                        Total da linha: <span className="font-mono font-semibold">{formatCurrency(totalLinha)}</span>
                        {' '}(principal + juros + multa − desconto)
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Origin picker (parcelas + medições + mútuos) */}
          {showPicker && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar parcela, medição ou mútuo por descrição, fornecedor ou valor..." autoFocus
                  className="w-full rounded-md border bg-background pl-7 pr-2 py-1.5 text-xs" />
              </div>
              <div className="max-h-60 overflow-auto space-y-1">
                {filteredCandidatos.map(c => {
                  const badge = ORIGEM_BADGE[c.origem]
                  return (
                    <button key={linkKey(c)} onClick={() => handleAdd(c)}
                      className="w-full flex items-center justify-between rounded p-2 hover:bg-card text-left">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs truncate">
                          <span className={`mr-1.5 rounded px-1 py-0.5 text-[9px] font-bold ${badge.cls}`}>
                            {badge.label}
                          </span>
                          {c.descricao}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {c.data ?? '—'} · {c.status}{c.fornecedor ? ` · ${c.fornecedor}` : ''}
                        </p>
                      </div>
                      <span className="text-xs font-mono font-semibold">{formatCurrency(c.valor)}</span>
                    </button>
                  )
                })}
                {filteredCandidatos.length === 0 && (
                  <p className="py-2 text-center text-[11px] text-muted-foreground">
                    Nenhum item encontrado
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="rounded-md border bg-muted/30 p-3 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Valor da movimentação</span>
              <span className="font-mono font-semibold">{formatCurrency(valorMov)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Principal aplicado</span>
              <span className="font-mono font-semibold">{formatCurrency(totalAplicado)}</span>
            </div>
            {(totalJuros > 0 || totalMulta > 0 || totalDesconto > 0) && (
              <>
                {totalJuros > 0 && (
                  <div className="flex justify-between text-xs text-amber-600">
                    <span>+ Juros</span><span className="font-mono">{formatCurrency(totalJuros)}</span>
                  </div>
                )}
                {totalMulta > 0 && (
                  <div className="flex justify-between text-xs text-amber-600">
                    <span>+ Multa</span><span className="font-mono">{formatCurrency(totalMulta)}</span>
                  </div>
                )}
                {totalDesconto > 0 && (
                  <div className="flex justify-between text-xs text-emerald-600">
                    <span>− Desconto</span><span className="font-mono">{formatCurrency(totalDesconto)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs pt-1 border-t border-dashed">
                  <span className="text-muted-foreground">Total bruto</span>
                  <span className="font-mono font-semibold">{formatCurrency(totalBruto)}</span>
                </div>
              </>
            )}
            <div className={`flex justify-between text-sm pt-1 border-t ${
              Math.abs(diferenca) < 0.01 ? 'text-emerald-600' : 'text-amber-600'
            }`}>
              <span className="font-bold">Diferença (mov − total bruto)</span>
              <span className="font-mono font-bold">{formatCurrency(diferenca)}</span>
            </div>
            {Math.abs(diferenca) >= 0.01 && (
              <p className="flex items-start gap-1 pt-1 text-[10px] text-amber-600">
                <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>Use Juros/Multa/Desconto pra fechar o saldo, se a diferença for encargo.</span>
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t p-4">
          <button onClick={onClose}
            className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">Cancelar</button>
          <button onClick={handleSave} disabled={update.isPending}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <Save className="h-3.5 w-3.5" />
            {update.isPending ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}
