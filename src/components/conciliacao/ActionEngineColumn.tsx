import { useState, useEffect } from 'react'
import { CheckCircle2, Fingerprint, Coins, Sparkles, BookmarkPlus, FileText, Clock, AlertTriangle, Layers, Package, Building2, CreditCard, ChevronRight, ArrowLeftRight, Link } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useFornecedores } from '@/hooks/useCompras'
import { useEtapas } from '@/hooks/useEtapas'
import type { ReconciliationMatch } from '@/lib/reconciliationEngine'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { useCreateBankRule, suggestRuleFromTransaction } from '@/hooks/useBankRules'
import { Parcela, useContasBancarias } from '@/hooks/useFinanceiro'
import { useProject } from '@/contexts/ProjectContext'
import { useQueryClient } from '@tanstack/react-query'


const INPUT = "flex h-9 w-full rounded-md border border-input bg-background/50 px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"

const CATEGORIAS_BASE = [
  'Gestão Local', 'Administrativo', 'Seguro', 'Benefícios',
  'Equipamentos Adicionais', 'Alimentação', 'Transporte',
  'Despesas Acessórias', 'Capital de Giro', 'Taxas e Impostos', 'Marketing'
]

interface ActionEngineColumnProps {
  activeMov: any | null
  activeParcela: Parcela | null
  activeMatch: ReconciliationMatch | null
  savedConcs: any[]
  onSuccess: () => void
  isProcessing: boolean
}

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(d: string): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function statusLabel(status: Parcela['status']): { label: string; cls: string } {
  switch (status) {
    case 'paga': return { label: 'Paga', cls: 'bg-emerald-500/10 text-emerald-600' }
    case 'vencida': return { label: 'Vencida', cls: 'bg-red-500/10 text-red-600' }
    case 'a_vencer': return { label: 'A Vencer', cls: 'bg-amber-500/10 text-amber-600' }
    case 'parcialmente_paga': return { label: 'Parcial', cls: 'bg-blue-500/10 text-blue-600' }
    default: return { label: 'Futura', cls: 'bg-muted text-muted-foreground' }
  }
}

export function ActionEngineColumn({ activeMov, activeParcela, activeMatch, savedConcs, onSuccess, isProcessing }: ActionEngineColumnProps) {
  const [mode, setMode] = useState<'indireto' | 'fantasma' | 'mutuo' | 'transferencia'>('indireto')
  const [isSaving, setIsSaving] = useState(false)
  const [showRuleSuggestion, setShowRuleSuggestion] = useState(false)
  const [ruleSuggestion, setRuleSuggestion] = useState<ReturnType<typeof suggestRuleFromTransaction> | null>(null)
  const { currentCompany } = useProject()
  const qc = useQueryClient()

  const { data: fornecedores = [] } = useFornecedores()
  const { data: etapas = [] } = useEtapas()
  const { data: contasBancarias = [] } = useContasBancarias()
  const createRule = useCreateBankRule()

  // Form states
  const [categoria, setCategoria] = useState('')
  const [descricao, setDescricao] = useState('')
  const [etapaId, setEtapaId] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')
  const [contaDestinoId, setContaDestinoId] = useState('')

  // Drill-down parcela detail
  interface ParcelaDetail {
    etapa_nome?: string; etapa_codigo?: string;
    item_descricao?: string; item_codigo?: string;
    fornecedor_nome?: string; fornecedor_cnpj?: string;
    cond_pagamento?: string; numero_pedido?: number;
  }
  const [parcelaDetail, setParcelaDetail] = useState<ParcelaDetail | null>(null)

  useEffect(() => {
    if (!activeParcela?.pedido_id) { setParcelaDetail(null); return }
    let cancelled = false
    ;(async () => {
      const { data: ped } = await supabase
        .from('pedidos')
        .select(`
          numero_pedido, cond_pagamento, fornecedor_id,
          itens_compra!inner(descricao, codigo, etapa_id, etapas(nome, codigo)),
          fornecedores(nome, cnpj, cond_pagamento_padrao)
        `)
        .eq('id', activeParcela.pedido_id!)
        .single()
      if (cancelled || !ped) return
      const item = ped.itens_compra as any
      const forn = ped.fornecedores as any
      const etapa = item?.etapas as any
      setParcelaDetail({
        etapa_nome: etapa?.nome, etapa_codigo: etapa?.codigo,
        item_descricao: item?.descricao, item_codigo: item?.codigo,
        fornecedor_nome: forn?.nome, fornecedor_cnpj: forn?.cnpj,
        cond_pagamento: ped.cond_pagamento ?? forn?.cond_pagamento_padrao,
        numero_pedido: ped.numero_pedido,
      })
    })()
    return () => { cancelled = true }
  }, [activeParcela?.pedido_id])

  // === ESTADO: NADA SELECIONADO ===
  if (!activeMov && !activeParcela) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 p-8 h-full text-muted-foreground text-center">
        <Fingerprint className="mb-3 h-10 w-10 opacity-20" />
        <h3 className="font-semibold text-sm text-foreground mb-1">Cérebro de Conciliação</h3>
        <p className="text-xs max-w-[200px]">Selecione uma transação do extrato ou uma parcela para ver os detalhes.</p>
        <p className="text-[10px] mt-2 max-w-[240px] text-muted-foreground/60">
          💡 Selecione uma parcela E uma transação simultaneamente para conciliação manual.
        </p>
      </div>
    )
  }

  // === ESTADO: AMBOS SELECIONADOS → CONCILIAÇÃO MANUAL ===
  if (activeMov && activeParcela) {
    const diff = Math.abs(Number(activeMov.valor) - Number(activeParcela.valor))
    const diffPerc = Number(activeParcela.valor) > 0 ? (diff / Number(activeParcela.valor) * 100) : 0

    const handleManualConciliar = async () => {
      if (!currentCompany) return
      setIsSaving(true)
      try {
        // Mark movement as conciliado
        await supabase
          .from('movimentacoes_bancarias')
          .update({ conciliado: true, conciliado_em: new Date().toISOString() })
          .eq('id', activeMov.id)

        // Create conciliacao link
        await supabase.from('conciliacoes').upsert({
          company_id: currentCompany.id,
          movimentacao_id: activeMov.id,
          parcela_id: activeParcela.id,
          status: 'confirmado',
          tipo_match: 'manual',
          confianca: 100,
        }, { onConflict: 'company_id,movimentacao_id' })

        // Update parcela status if needed
        if (activeParcela.status !== 'paga') {
          await supabase.from('parcelas').update({
            status: 'paga',
            valor_pago: activeParcela.valor,
            data_pagamento_real: activeMov.data,
          }).eq('id', activeParcela.id)
        }

        qc.invalidateQueries({ queryKey: ['movimentacoes'] })
        qc.invalidateQueries({ queryKey: ['conciliacoes'] })
        qc.invalidateQueries({ queryKey: ['parcelas'] })
        toast.success('Conciliação manual confirmada!')
        onSuccess()
      } catch (err: any) {
        toast.error('Erro: ' + err.message)
      } finally {
        setIsSaving(false)
      }
    }

    return (
      <div className="flex flex-col rounded-xl border bg-card/60 shadow-sm overflow-hidden backdrop-blur-md h-full">
        <div className="border-b bg-blue-500/5 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Link className="h-4 w-4 text-blue-600" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Conciliação Manual</p>
          </div>
          <p className="text-[10px] text-muted-foreground">Extrato e parcela selecionados simultaneamente</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Extrato side */}
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-[9px] uppercase font-bold text-muted-foreground mb-2">Transação Extrato</p>
            <div className="flex justify-between items-center">
              <p className="text-xs font-medium truncate max-w-[150px]">{activeMov.descricao ?? activeMov.memo_raw ?? '—'}</p>
              <p className="text-sm font-bold tabular-nums">{fmt(Math.abs(Number(activeMov.valor)))}</p>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{fmtDate(activeMov.data)}</p>
          </div>

          {/* Arrow */}
          <div className="flex items-center justify-center">
            <ArrowLeftRight className="h-5 w-5 text-blue-500" />
          </div>

          {/* Parcela side */}
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-[9px] uppercase font-bold text-muted-foreground mb-2">Parcela Sistema</p>
            <div className="flex justify-between items-center">
              <p className="text-xs font-medium truncate max-w-[150px]">{activeParcela.descricao ?? activeParcela.pedido_item ?? '—'}</p>
              <p className="text-sm font-bold tabular-nums">{fmt(Number(activeParcela.valor))}</p>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Venc. {fmtDate(activeParcela.data_vencimento)}</p>
          </div>

          {/* Difference */}
          <div className={`rounded-lg p-3 ${diff < 0.01 ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-amber-500/10 border border-amber-500/20'}`}>
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase">Diferença</span>
              <span className={`text-sm font-bold ${diff < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {fmt(diff)} {diffPerc > 0.01 && `(${diffPerc.toFixed(1)}%)`}
              </span>
            </div>
            {diff < 0.01 && <p className="text-[10px] text-emerald-600 mt-1">✓ Valores idênticos — match perfeito</p>}
          </div>
        </div>

        {/* Action */}
        <div className="border-t p-4">
          <button
            onClick={handleManualConciliar}
            disabled={isSaving}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <CheckCircle2 className="h-4 w-4" />
            {isSaving ? 'Conciliando...' : 'Conciliar Manualmente'}
          </button>
        </div>
      </div>
    )
  }

  // === ESTADO: PARCELA SELECIONADA (sem extrato ativo) ===
  if (!activeMov && activeParcela) {
    const isPaid = activeParcela.status === 'paga' || !!activeParcela.data_pagamento_real
    const st = statusLabel(activeParcela.status)
    const isOverdue = !isPaid && activeParcela.data_vencimento < new Date().toISOString().split('T')[0]!

    return (
      <div className="flex flex-col rounded-xl border bg-card/60 shadow-sm overflow-hidden backdrop-blur-md h-full">
        {/* Header */}
        <div className="border-b bg-card p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Parcela Selecionada</p>
          <div className="flex justify-between items-start gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm truncate" title={activeParcela.descricao || ''}>
                {activeParcela.descricao || '—'}
              </h3>
              {activeParcela.pedido_item && (
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">{activeParcela.pedido_item}</p>
              )}
            </div>
            <div className={`text-sm font-black tabular-nums border rounded-md px-2 py-0.5 flex-shrink-0 ${
              isPaid
                ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20'
                : isOverdue
                  ? 'text-red-600 bg-red-500/10 border-red-500/20'
                  : 'text-amber-600 bg-amber-500/10 border-amber-500/20'
            }`}>
              {fmt(Number(activeParcela.valor))}
            </div>
          </div>
        </div>

        {/* Detalhes */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Detalhes do Título</p>

            {/* Status */}
            <div className="flex items-center justify-between py-2 border-b border-muted/50">
              <span className="text-xs text-muted-foreground">Status</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>
                {st.label}
              </span>
            </div>

            {/* Vencimento */}
            <div className="flex items-center justify-between py-2 border-b border-muted/50">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Vencimento
              </span>
              <span className={`text-xs font-semibold ${isOverdue ? 'text-red-600' : ''}`}>
                {fmtDate(activeParcela.data_vencimento)}
              </span>
            </div>

            {/* Data de Pagamento */}
            {activeParcela.data_pagamento_real && (
              <div className="flex items-center justify-between py-2 border-b border-muted/50">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Data Pagamento
                </span>
                <span className="text-xs font-semibold text-emerald-600">
                  {fmtDate(activeParcela.data_pagamento_real)}
                </span>
              </div>
            )}

            {/* Valor Pago */}
            {!!activeParcela.valor_pago && Number(activeParcela.valor_pago) > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-muted/50">
                <span className="text-xs text-muted-foreground">Valor Pago</span>
                <span className="text-xs font-bold text-emerald-600">
                  {fmt(Number(activeParcela.valor_pago))}
                </span>
              </div>
            )}

            {/* Valor Original (se diferente do pago) */}
            {!!activeParcela.valor_pago && Number(activeParcela.valor_pago) !== Number(activeParcela.valor) && (
              <div className="flex items-center justify-between py-2 border-b border-muted/50">
                <span className="text-xs text-muted-foreground">Valor Original</span>
                <span className="text-xs font-semibold tabular-nums">
                  {fmt(Number(activeParcela.valor))}
                </span>
              </div>
            )}

            {/* Forma de Pagamento */}
            {activeParcela.forma_pagamento && (
              <div className="flex items-center justify-between py-2 border-b border-muted/50">
                <span className="text-xs text-muted-foreground">Forma de Pagamento</span>
                <span className="text-xs font-semibold capitalize">{activeParcela.forma_pagamento}</span>
              </div>
            )}

            {/* Drill-down: Rastreabilidade */}
            {parcelaDetail && (
              <div className="mt-4 rounded-lg border bg-muted/20 p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Rastreabilidade</p>
                <div className="flex flex-wrap items-center gap-1 text-[10px]">
                  {parcelaDetail.etapa_nome && (
                    <>
                      <span className="inline-flex items-center gap-0.5 rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-600 font-medium">
                        <Layers className="h-2.5 w-2.5" />
                        {parcelaDetail.etapa_codigo}: {parcelaDetail.etapa_nome}
                      </span>
                      <ChevronRight className="h-2.5 w-2.5 text-muted-foreground" />
                    </>
                  )}
                  {parcelaDetail.item_descricao && (
                    <>
                      <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-600 font-medium">
                        <Package className="h-2.5 w-2.5" />
                        {parcelaDetail.item_codigo}: {parcelaDetail.item_descricao}
                      </span>
                      <ChevronRight className="h-2.5 w-2.5 text-muted-foreground" />
                    </>
                  )}
                  {parcelaDetail.fornecedor_nome && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-600 font-medium">
                      <Building2 className="h-2.5 w-2.5" />
                      {parcelaDetail.fornecedor_nome}
                    </span>
                  )}
                  {parcelaDetail.cond_pagamento && (
                    <>
                      <ChevronRight className="h-2.5 w-2.5 text-muted-foreground" />
                      <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-primary font-medium">
                        <CreditCard className="h-2.5 w-2.5" />
                        {parcelaDetail.cond_pagamento}
                      </span>
                    </>
                  )}
                  {parcelaDetail.numero_pedido && (
                    <>
                      <ChevronRight className="h-2.5 w-2.5 text-muted-foreground" />
                      <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-foreground font-medium">
                        <FileText className="h-2.5 w-2.5" />
                        Pedido #{parcelaDetail.numero_pedido}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Número da Parcela */}
            {activeParcela.numero_parcela > 1 && (
              <div className="flex items-center justify-between py-2 border-b border-muted/50">
                <span className="text-xs text-muted-foreground">Nº Parcela</span>
                <span className="text-xs font-semibold">#{activeParcela.numero_parcela}</span>
              </div>
            )}
          </div>

          {/* Aviso se vencida */}
          {isOverdue && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
              <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-600 leading-relaxed">
                Esta parcela está vencida. Selecione a transação correspondente no extrato bancário para conciliar.
              </p>
            </div>
          )}

          {/* Instrução quando paga mas não conciliada */}
          {isPaid && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
              <FileText className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                Parcela paga aguardando conciliação com extrato bancário. Selecione a transação correspondente ao lado para vincular.
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // === ESTADO: EXTRATO SELECIONADO ===

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    try {
      const movId = activeMov.id
      const valorAbs = Math.abs(activeMov.valor)
      const dataPag = activeMov.data
      const parsedDesc = descricao || activeMov.descricao || activeMov.memo_raw

      if (mode === 'indireto') {
        if (!categoria || !parsedDesc) throw new Error('Preencha categoria e descrição')
        // 1. Criar Despesa
        const { data: desp, error: errDesp } = await supabase
          .from('despesas_indiretas')
          .insert({
            projeto_id: 'default',
            categoria,
            descricao: parsedDesc,
            fornecedor_id: fornecedorId || null,
            valor_orcado: valorAbs,
            recorrente: false,
            data_inicio: dataPag,
          }).select().single()
        if (errDesp) throw errDesp

        // 2. Criar Parcela (Paga)
        const { data: parc, error: errParc } = await supabase
          .from('parcelas_financeiras')
          .insert({
            projeto_id: 'default',
            despesa_indireta_id: desp.id,
            valor: valorAbs,
            data_vencimento: dataPag,
            tipo: 'pagar',
            status: 'paga',
            data_pagamento_real: dataPag,
            valor_pago_real: valorAbs,
          }).select().single()
        if (errParc) throw errParc

        await linkConciliacao(movId, parc.id)

      } else if (mode === 'fantasma') {
        if (!etapaId || !parsedDesc) throw new Error('Preencha etapa e descrição')

        // 1. Item Flex
        const { data: item, error: errItem } = await supabase
          .from('items')
          .insert({
            projeto_id: 'default',
            etapa_id: etapaId,
            nome: parsedDesc,
            descricao: 'Criado via conciliação rápida',
            unidade: 'vb',
            quantidade_orcada: 1,
            custo_unitario_orcado: valorAbs,
          }).select().single()
        if (errItem) throw errItem

        // 2. Pedido
        const { data: ped, error: errPed } = await supabase
          .from('pedidos_compra')
          .insert({
            projeto_id: 'default',
            item_id: item.id,
            fornecedor_id: fornecedorId || null,
            numero: `CC-${Math.floor(Math.random() * 10000)}`,
            status: 'concluido',
            valor_total: valorAbs,
            data_pedido: dataPag,
          }).select().single()
        if (errPed) throw errPed

        // 3. Parcela
        const { data: parc, error: errParc } = await supabase
          .from('parcelas_financeiras')
          .insert({
            projeto_id: 'default',
            pedido_id: ped.id,
            valor: valorAbs,
            data_vencimento: dataPag,
            tipo: 'pagar',
            status: 'paga',
            data_pagamento_real: dataPag,
            valor_pago_real: valorAbs,
          }).select().single()
        if (errParc) throw errParc

        await linkConciliacao(movId, parc.id)

      } else if (mode === 'mutuo') {
        if (!fornecedorId) throw new Error('Favorecido é obrigatório para mútuos')

        // 1. Criar Mutuo
        const { error: errMut } = await supabase
          .from('mutuos')
          .insert({
            projeto_id: 'default',
            fornecedor_id: fornecedorId,
            nome: `Mútuo/Conciliação`,
            data_captacao: dataPag,
            valor_captado: valorAbs,
            tipo_juros: 'pre',
            taxa_juros: 0,
          }).select().single()
        if (errMut) throw errMut

        await linkConciliacao(movId, null)
      }

      if (mode === 'transferencia') {
        if (!contaDestinoId) throw new Error('Selecione a conta destino')
        // Create matching entry in destination account
        const { error: errEntry } = await supabase
          .from('movimentacoes_bancarias')
          .insert({
            company_id: activeMov.company_id,
            conta_id: contaDestinoId,
            tipo: 'entrada',
            valor: valorAbs,
            data: dataPag,
            descricao: `Transferência de ${activeMov.conta_nome ?? 'outra conta'}`,
            memo_raw: `TRANSF ${activeMov.descricao || ''}`,
            conciliado: true,
            conciliado_em: new Date().toISOString(),
          }).select().single()
        if (errEntry) throw errEntry

        // Mark source movement as conciliado
        await supabase.from('movimentacoes_bancarias')
          .update({
            conciliado: true,
            conciliado_em: new Date().toISOString(),
            observacao: `Transferência para conta ${contaDestinoId}`,
          })
          .eq('id', movId)

        // Link both via conciliacao
        await linkConciliacao(movId, null)
        setContaDestinoId('')
      }

      toast.success('Conciliação manual efetuada com sucesso.')

      // Suggest creating a bank rule
      const memo = activeMov.descricao || activeMov.memo_raw || ''
      if (memo.trim() && mode !== 'transferencia') {
        const suggestion = suggestRuleFromTransaction(memo, activeMov.valor)
        if (categoria) suggestion.categoria = categoria
        setRuleSuggestion(suggestion)
        setShowRuleSuggestion(true)
      }

      onSuccess()
      setDescricao('')
      setCategoria('')
      setEtapaId('')
      setFornecedorId('')
    } catch (err) {
      toast.error('Erro ao classificar: ' + (err as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  async function linkConciliacao(movId: string, parcelaId: string | null) {
    const { data: concData, error: concErr } = await supabase
      .from('conciliacoes')
      .insert({
        projeto_id: 'default',
        movimentacao_id: movId,
        match_type: 'manual',
        confidence: 100,
        status: 'confirmado',
      }).select().single()
    if (concErr) throw concErr

    if (parcelaId) {
      const { error: relErr } = await supabase
        .from('conciliacao_parcelas')
        .insert({
          conciliacao_id: concData.id,
          parcela_id: parcelaId,
          valor_aplicado: Math.abs(activeMov.valor)
        })
      if (relErr) throw relErr
    }

    await supabase.from('movimentacoes_bancarias').update({ conciliado: true }).eq('id', movId)
  }

  const doConfirmMatch = async () => {
    if (!activeMatch) return
    const sc = savedConcs.find(c => c.movimentacao_id === activeMov.id && c.status === 'sugerido')
    if (sc) {
      onSuccess()
    }
  }

  const hasSystemMatch = activeMatch && activeMatch.matchType !== 'none'

  return (
    <div className="flex flex-col rounded-xl border bg-card/60 shadow-sm overflow-hidden backdrop-blur-md">

      <div className="border-b bg-card p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Transação Selecionada</p>
        <div className="flex justify-between items-start gap-4">
          <div>
            <h3 className="font-bold text-sm" title={activeMov.memo_raw}>{activeMov.descricao || activeMov.memo_raw}</h3>
            <p className="text-xs text-muted-foreground">{activeMov.data.split('-').reverse().join('/')}</p>
          </div>
          <div className={`text-sm font-black tabular-nums border rounded-md px-2 py-0.5 ${activeMov.tipo === 'saida' ? 'text-red-600 bg-red-500/10 border-red-500/20' : 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20'}`}>
            {fmt(activeMov.valor)}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

        {/* === ESTADO 1: IA ENCONTROU CORRESPONDÊNCIA === */}
        {hasSystemMatch ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-emerald-700 font-bold mb-2">
              <CheckCircle2 className="h-5 w-5" />
              Sugestão Encontrada ({activeMatch.confidence}%)
            </div>
            <p className="text-[11px] text-emerald-600/80 mb-4 leading-relaxed">
              O motor de conciliação encontrou vínculos compatíveis no sistema para esta transação bancária.
            </p>

            <div className="space-y-2 mb-4 bg-background/50 rounded-lg p-2 border border-emerald-500/10">
              {activeMatch.parcelas.map((mp, i) => (
                <div key={i} className="flex justify-between items-center text-xs">
                  <span className="truncate flex-1 font-medium text-foreground">{mp.parcela.descricao || 'Despesa'}</span>
                  <span className="font-bold text-emerald-600 tabular-nums ml-2">{fmt(mp.valorAplicado)}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={doConfirmMatch}
                disabled={isProcessing}
                className="flex-1 flex justify-center items-center gap-1.5 rounded-lg bg-emerald-600 text-white py-2 text-xs font-bold hover:bg-emerald-700 transition"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar Match
              </button>
            </div>
          </div>
        ) : (
          /* === ESTADO 2: SEM MATCH (AÇÃO MANUAL) === */
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-primary font-bold">
              <Coins className="h-5 w-5" />
              Criar no Sistema
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Nenhuma parcela ativa corresponde a este valor. Classifique a despesa/receita abaixo para embutir no sistema e conciliar simultaneamente.
            </p>

            {/* Mode Tabs */}
            <div className="flex rounded-lg bg-muted/60 p-1 text-xs font-medium">
              <button
                onClick={() => setMode('indireto')}
                className={`flex-1 rounded-md py-1.5 px-2 text-center transition-all ${mode === 'indireto' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:bg-foreground/5'}`}
              >
                Indiretos
              </button>
              <button
                onClick={() => setMode('fantasma')}
                className={`flex-1 rounded-md py-1.5 px-2 text-center transition-all ${mode === 'fantasma' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:bg-foreground/5'}`}
              >
                WBS Obra
              </button>
              <button
                onClick={() => setMode('mutuo')}
                className={`flex-1 rounded-md py-1.5 px-2 text-center transition-all ${mode === 'mutuo' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:bg-foreground/5'}`}
              >
                Mútuos
              </button>
              <button
                onClick={() => setMode('transferencia')}
                className={`flex-1 rounded-md py-1.5 px-2 text-center transition-all ${mode === 'transferencia' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:bg-foreground/5'}`}
              >
                Transferência
              </button>
            </div>

            <form id="acao-form" onSubmit={handleSaveManual} className="space-y-3.5 mt-2">

              {mode === 'indireto' && (
                <>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Categoria (Plano de Contas)</label>
                    <input type="text" list="categorias-list" required value={categoria} onChange={e => setCategoria(e.target.value)} className={INPUT} placeholder="Ex: Gestão Local" />
                    <datalist id="categorias-list">{CATEGORIAS_BASE.map(c => <option key={c} value={c} />)}</datalist>
                  </div>
                </>
              )}

              {mode === 'fantasma' && (
                <>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Etapa (WBS)</label>
                    <SearchableSelect
                      value={etapaId}
                      onChange={setEtapaId}
                      options={etapas.map(et => ({ value: et.id, label: et.nome }))}
                      placeholder="Selecione uma etapa..."
                    />
                  </div>
                </>
              )}

              {mode === 'transferencia' && (
                <>
                  <div className="rounded-lg bg-blue-500/5 border border-blue-500/10 p-3">
                    <p className="text-[10px] font-bold text-blue-600 mb-1">Transferência entre contas</p>
                    <p className="text-[10px] text-muted-foreground">Registra saída nesta conta e entrada na conta destino. Ambas serão auto-conciliadas.</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Conta Destino *</label>
                    <select
                      value={contaDestinoId}
                      onChange={e => setContaDestinoId(e.target.value)}
                      className={INPUT}
                      required
                    >
                      <option value="">Selecione...</option>
                      {contasBancarias
                        .filter(c => c.ativa && c.id !== activeMov?.conta_id)
                        .map(c => <option key={c.id} value={c.id}>{c.nome} ({c.banco})</option>)}
                    </select>
                  </div>
                </>
              )}

              {mode !== 'mutuo' && mode !== 'transferencia' && (
                <div>
                  <label className="mb-1 block text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Descrição Breve</label>
                  <input type="text" value={descricao} onChange={e => setDescricao(e.target.value)} className={INPUT} placeholder={activeMov.descricao || "Item novo"} />
                </div>
              )}

              {mode !== 'transferencia' && (
                <div>
                  <label className="mb-1 block text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                    {mode === 'mutuo' ? 'Favorecido/Fornecedor (Obrigatório)' : 'Fornecedor (Opcional)'}
                  </label>
                  <SearchableSelect
                    value={fornecedorId}
                    onChange={setFornecedorId}
                    options={fornecedores.map(f => ({ value: f.id, label: f.nome }))}
                    placeholder="Buscar fornecedor..."
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isSaving}
                className="w-full mt-4 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isSaving ? 'Registrando...' : 'Classificar e Conciliar'}
              </button>
            </form>
          </div>
        )}

        {/* Rule Suggestion */}
        {showRuleSuggestion && ruleSuggestion && (
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 shadow-sm animate-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-bold mb-2">
              <BookmarkPlus className="h-5 w-5" />
              Criar regra para este padrão?
            </div>
            <p className="text-[11px] text-blue-600/80 dark:text-blue-400/80 mb-3 leading-relaxed">
              Próximas transações com <span className="font-bold">"{ruleSuggestion.padrao_texto}"</span> serão classificadas automaticamente
              {ruleSuggestion.categoria && <> como <span className="font-bold">{ruleSuggestion.categoria}</span></>}.
            </p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!ruleSuggestion.padrao_texto || !ruleSuggestion.nome) return
                  await createRule.mutateAsync({
                    nome: ruleSuggestion.nome,
                    padrao_texto: ruleSuggestion.padrao_texto,
                    tipo_match: ruleSuggestion.tipo_match || 'contains',
                    acao: ruleSuggestion.acao || 'classificar',
                    categoria: ruleSuggestion.categoria ?? null,
                    valor_min: ruleSuggestion.valor_min ?? null,
                    valor_max: ruleSuggestion.valor_max ?? null,
                  })
                  setShowRuleSuggestion(false)
                }}
                disabled={createRule.isPending}
                className="flex-1 flex justify-center items-center gap-1.5 rounded-lg bg-blue-600 text-white py-2 text-xs font-bold hover:bg-blue-700 transition disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {createRule.isPending ? 'Criando...' : 'Criar Regra'}
              </button>
              <button
                onClick={() => setShowRuleSuggestion(false)}
                className="flex-1 rounded-lg border py-2 text-xs font-bold text-muted-foreground hover:bg-muted transition"
              >
                Não, obrigado
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
