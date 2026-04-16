/**
 * Build Fleury — Hook de Conciliação
 *
 * Operações: importar extrato, rodar conciliação, confirmar/rejeitar matches.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { toast } from 'sonner'
import { parseStatement, readFileAsText, type StandardTransaction, type ParseResult } from '@/lib/ofxParser'
import { reconcile, type PayableReceivable, type ReconciliationResult, type ReconciliationConfig } from '@/lib/reconciliationEngine'

// ─── Re-exports ─────────────────────────────────────────────
export type { StandardTransaction, ParseResult, PayableReceivable, ReconciliationResult }
export { parseStatement, readFileAsText, reconcile }
export type { ReconciliationConfig }

// ─── Types ──────────────────────────────────────────────────

export interface Conciliacao {
  id: string
  company_id: string
  movimentacao_id: string
  match_type: string
  confidence: number
  diferenca: number
  status: 'sugerido' | 'confirmado' | 'rejeitado'
  created_at: string
}

// ─── Queries ────────────────────────────────────────────────

export function useConciliacoes() {
  const { currentCompany } = useProject()
  return useQuery({
    queryKey: ['conciliacoes', currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany) return []
      const { data, error } = await supabase
        .from('conciliacoes')
        .select('*, conciliacao_parcelas(parcela_id, valor_aplicado)')
        .eq('company_id', currentCompany.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as (Conciliacao & { conciliacao_parcelas: { parcela_id: string; valor_aplicado: number }[] })[]
    },
    enabled: !!currentCompany,
  })
}

// ─── Import Extrato ─────────────────────────────────────────

export function useImportExtrato() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async ({ parseResult, contaId }: { parseResult: ParseResult; contaId: string }) => {
      if (!currentCompany) throw new Error('No company')
      const { transactions, meta } = parseResult

      let inserted = 0
      let skipped = 0
      const errors: string[] = []

      // Batch insert with deduplication via ON CONFLICT
      const BATCH_SIZE = 50
      const rows = transactions.map((txn, idx) => ({
        company_id: currentCompany.id,
        conta_id: contaId,
        data: txn.date,
        descricao: txn.memoClean,
        valor: Math.abs(txn.amount),
        tipo: txn.type === 'credit' ? 'entrada' : 'saida',
        fitid: txn.fitid || `gen_${txn.date}_${idx}_${Math.abs(txn.amount)}`,
        memo_raw: txn.memoRaw,
        saldo_acumulado: txn.balance,
        origem: txn.source,
        conciliado: false,
      }))

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)
        const { error, count } = await supabase
          .from('movimentacoes_bancarias')
          .upsert(batch, { onConflict: 'conta_id,fitid', ignoreDuplicates: true, count: 'exact' })

        if (error) {
          errors.push(`Batch ${Math.floor(i / BATCH_SIZE)}: ${error.message}`)
        } else {
          inserted += count ?? batch.length
        }
      }
      skipped = transactions.length - inserted

      // Audit log
      await supabase.from('audit_logs').insert({
        company_id: currentCompany.id,
        tabela: 'movimentacoes_bancarias',
        acao: 'INSERT',
        agente: 'sistema',
        dados_depois: {
          type: 'import_extrato',
          bank: meta.bankId,
          account: meta.accountId,
          period: `${meta.startDate} → ${meta.endDate}`,
          inserted,
          skipped,
          total: transactions.length,
        },
      })

      return { inserted, skipped, errors, meta }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['movimentacoes'] })
      toast.success(`Importadas ${result.inserted} transações (${result.skipped} duplicadas ignoradas)`)
    },
    onError: (err: Error) => toast.error('Erro na importação: ' + err.message),
  })
}

// ─── Run Reconciliation ─────────────────────────────────────

export function useRunConciliacao() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async (config?: Partial<ReconciliationConfig>) => {
      if (!currentCompany) throw new Error('No company')

      // 1. Buscar movimentações não conciliadas
      const { data: movs, error: movErr } = await supabase
        .from('movimentacoes_bancarias')
        .select('*')
        .eq('company_id', currentCompany.id)
        .eq('conciliado', false)
        .order('data', { ascending: true })
      if (movErr) throw movErr

      // 2. Buscar TODAS as parcelas (pagas + pendentes) para matching completo
      const { data: parcelas, error: parcErr } = await supabase
        .from('parcelas')
        .select('*, pedidos(itens_compra(descricao, deleted_at), fornecedor_id, fornecedores(nome)), despesas_indiretas(descricao, categoria, deleted_at)')
        .eq('company_id', currentCompany.id)
        .is('deleted_at', null)
      if (parcErr) throw parcErr

      // 3. Buscar medições (contas a receber) — todas
      const { data: medicoes, error: medErr } = await supabase
        .from('medicoes')
        .select('*')
        .eq('company_id', currentCompany.id)
      if (medErr) throw medErr

      // 4. Buscar regras bancárias
      const { data: regras } = await supabase
        .from('regras_conciliacao')
        .select('*')
        .eq('company_id', currentCompany.id)
        .eq('auto_aplicar', true)
        .order('created_at', { ascending: true })

      // 5. Converter movimentações → StandardTransaction
      const transactions: StandardTransaction[] = (movs ?? []).map((m: any) => ({
        fitid: m.fitid || m.id,
        date: m.data,
        amount: m.tipo === 'saida' ? -Number(m.valor) : Number(m.valor),
        type: m.tipo === 'saida' ? 'debit' as const : 'credit' as const,
        memoRaw: m.memo_raw || m.descricao || '',
        memoClean: m.descricao || '',
        balance: Number(m.saldo_acumulado) || 0,
        source: (m.origem || 'ofx') as 'ofx' | 'json',
        _movId: m.id,
      }))

      // 6. Converter parcelas → PayableReceivable (pagas + pendentes)
      const payables: PayableReceivable[] = []
      for (const p of (parcelas ?? []) as any[]) {
        const pedido = p.pedidos
        const item = pedido?.itens_compra
        if (item?.deleted_at) continue
        const desp = p.despesas_indiretas
        if (desp?.deleted_at) continue

        payables.push({
          id: p.id,
          valor: Number(p.valor),
          dataVencimento: p.data_vencimento,
          dataPagamento: p.data_pagamento_real || null,
          valorPago: p.valor_pago ? Number(p.valor_pago) : null,
          status: p.status,
          descricao: item?.descricao ?? desp?.descricao ?? p.descricao ?? null,
          fornecedorNome: pedido?.fornecedores?.nome ?? null,
          documentoRef: null,
          tipo: 'pagar',
        })
      }

      // Incluir medições como "contas a receber"
      for (const m of (medicoes ?? []) as any[]) {
        payables.push({
          id: `med-${m.id}`,
          valor: Number(m.valor_liberado || m.valor_planejado || 0),
          dataVencimento: m.data_liberacao || m.data_prevista,
          dataPagamento: m.status === 'paga' ? m.data_liberacao : null,
          valorPago: m.status === 'paga' ? Number(m.valor_liberado || 0) : null,
          status: m.status,
          descricao: `Medição nº ${m.numero}`,
          fornecedorNome: 'Cliente',
          documentoRef: null,
          tipo: 'receber',
        })
      }

      // 7. Converter regras bancárias → BankRule[]
      const bankRules = (regras ?? []).map((r: any) => ({
        id: r.id,
        padraoTexto: r.padrao_texto,
        tipoMatch: r.tipo_match || 'contains',
        valorMin: r.valor_min ? Number(r.valor_min) : null,
        valorMax: r.valor_max ? Number(r.valor_max) : null,
        acao: r.acao || 'classificar',
        categoria: r.categoria,
        fornecedorNome: null, // TODO: join fornecedor if needed
        descricaoPadrao: r.descricao_padrao,
      }))

      // 8. Rodar engine com regras
      const result = reconcile(transactions, payables, { ...config, bankRules })

      // 9. Salvar sugestões no banco
      await supabase
        .from('conciliacoes')
        .delete()
        .eq('company_id', currentCompany.id)
        .eq('status', 'sugerido')

      for (const match of result.matches) {
        if (match.matchType === 'none') continue
        const movId = (match.transaction as any)._movId
        if (!movId) continue

        const { data: conc, error: concErr } = await supabase.from('conciliacoes').insert({
          company_id: currentCompany.id,
          movimentacao_id: movId,
          match_type: match.matchType,
          confidence: match.confidence,
          diferenca: match.diferenca,
          status: 'sugerido',
        }).select('id').single()

        if (concErr) { console.warn('Erro ao salvar conciliação:', concErr.message); continue }
        if (!conc) continue

        // Salvar vínculos com parcelas
        const links = match.parcelas
          .filter(mp => !mp.parcela.id.startsWith('med-'))
          .map(mp => ({
            conciliacao_id: conc.id,
            parcela_id: mp.parcela.id,
            valor_aplicado: mp.valorAplicado,
          }))
        if (links.length > 0) {
          await supabase.from('conciliacao_parcelas').insert(links)
        }

        // Incrementar contagem de uso da regra se aplicável
        if (match.matchType === 'rule') {
          const ruleId = bankRules.find(r => {
            const memo = (match.transaction.memoRaw + ' ' + match.transaction.memoClean)
            const norm = memo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
            return norm.includes(r.padraoTexto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''))
          })?.id
          if (ruleId) {
            await supabase.rpc('increment_rule_count', { rule_id: ruleId })
          }
        }
      }

      return result
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['conciliacoes'] })
      qc.invalidateQueries({ queryKey: ['movimentacoes'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      const s = result.stats
      const parts = []
      if (s.rule > 0) parts.push(`${s.rule} por regra`)
      if (s.exact > 0) parts.push(`${s.exact} exatos`)
      if (s.key > 0) parts.push(`${s.key} por chave`)
      if (s.grouped > 0) parts.push(`${s.grouped} agrupados`)
      if (s.partial > 0) parts.push(`${s.partial} parciais`)
      if (s.noMatch > 0) parts.push(`${s.noMatch} sem match`)
      toast.success(`Conciliação: ${parts.join(', ')}`)
    },
    onError: (err: Error) => toast.error('Erro na conciliação: ' + err.message),
  })
}

// ─── Confirm/Reject ─────────────────────────────────────────

export function useConfirmConciliacao() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (conciliacaoId: string) => {
      // 1. Buscar conciliação e seus vínculos
      const { data: conc, error: concErr } = await supabase
        .from('conciliacoes')
        .select('*, conciliacao_parcelas(parcela_id, valor_aplicado)')
        .eq('id', conciliacaoId)
        .single()
      if (concErr) throw concErr

      // 2. Marcar conciliação como confirmada
      await supabase.from('conciliacoes').update({ status: 'confirmado' }).eq('id', conciliacaoId)

      // 3. Marcar movimentação como conciliada
      await supabase.from('movimentacoes_bancarias').update({
        conciliado: true,
        conciliado_em: new Date().toISOString(),
        parcela_id: conc.conciliacao_parcelas?.[0]?.parcela_id ?? null,
      }).eq('id', conc.movimentacao_id)

      // 4. Atualizar parcelas para paga
      for (const link of (conc.conciliacao_parcelas ?? [])) {
        const { data: parcela } = await supabase.from('parcelas').select('valor, valor_pago').eq('id', link.parcela_id).single()
        if (!parcela) continue

        const novoPago = (Number(parcela.valor_pago) || 0) + link.valor_aplicado
        const totalValor = Number(parcela.valor)
        const novoStatus = novoPago >= totalValor ? 'paga' : 'parcialmente_paga'

        await supabase.from('parcelas').update({
          status: novoStatus,
          valor_pago: novoPago,
          data_pagamento_real: new Date().toISOString().split('T')[0],
        }).eq('id', link.parcela_id)
      }

      return conc
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conciliacoes'] })
      qc.invalidateQueries({ queryKey: ['movimentacoes'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      toast.success('Conciliação confirmada')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useRejectConciliacao() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (conciliacaoId: string) => {
      await supabase.from('conciliacoes').update({ status: 'rejeitado' }).eq('id', conciliacaoId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conciliacoes'] })
      toast.success('Sugestão rejeitada')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
