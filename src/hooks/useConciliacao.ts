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
import {
  exportConciliacaoXlsx,
  type RealizadoRow, type AbertoRow, type NaoConciliadaRow, type ExtratoRow,
} from '@/lib/exportConciliacaoXlsx'

// ─── Re-exports ─────────────────────────────────────────────
export type { StandardTransaction, ParseResult, PayableReceivable, ReconciliationResult }
export { parseStatement, readFileAsText, reconcile }
export type { ReconciliationConfig }

// ─── Constants ──────────────────────────────────────────────
// Status que indicam que a conciliação "tomou efeito": a parcela conta como
// baixada e a mov conta como conciliada.
// - 'confirmado' vem do match com extrato bancário
// - 'aprovado' vem das baixas-em-lote (Pagamentos > Pagar), Quitar e amortização
// O DB já trata os dois iguais via trigger (migration 20260512190000). Esta
// constante existe pra evitar que telas/agregações esqueçam de incluir
// 'aprovado' — bug recorrente que causava duplicação no extrato.
export type ConciliacaoStatus = 'sugerido' | 'confirmado' | 'aprovado' | 'rejeitado'
export const STATUS_CONCILIADO = new Set<ConciliacaoStatus>(['confirmado', 'aprovado'])

// ─── Types ──────────────────────────────────────────────────

export interface Conciliacao {
  id: string
  company_id: string
  movimentacao_id: string
  match_type: string
  confidence: number
  diferenca: number
  status: ConciliacaoStatus
  created_at: string
}

// ─── Shared Links Query ─────────────────────────────────────
// Única fonte de dados para conciliações × movs × origens.
// Consumida por useCashFlowEvents, useHealthChecks e useEquacoesContabeis
// para que os 3 leiam do mesmo cache (key 'conciliacao-links') e sejam
// invalidados em conjunto por qualquer mutação de conciliação.

export interface ConciliacaoLink {
  conciliacao_id: string
  movimentacao_id: string
  status: string
  parcela_id: string | null
  mutuo_id: string | null
  mutuo_parcela_id: string | null
  medicao_id: string | null
  mov_valor: number
  mov_tipo: string
  valor_aplicado: number
}

export interface ConciliacaoLinksResult {
  /** Flat: 1 row por (conciliação × origem). Usado por useEquacoesContabeis. */
  links: ConciliacaoLink[]
  /** Set de movimentacao_ids com ao menos uma conciliação ativa. Usado para deduplicação. */
  movsConciliadasIds: Set<string>
  /** Estrutura aninhada original (conciliação → conciliacao_parcelas). Usado por useCashFlowEvents e useHealthChecks. */
  rawRows: Array<{
    movimentacao_id: string
    status: string
    conciliacao_parcelas: Array<{
      parcela_id: string | null
      mutuo_parcela_id: string | null
      mutuo_id: string | null
      medicao_id: string | null
      valor_aplicado: number
    }>
  }>
}

export function useConciliacaoLinks() {
  const { currentCompany } = useProject()
  return useQuery<ConciliacaoLinksResult>({
    queryKey: ['conciliacao-links', currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany) return { links: [], movsConciliadasIds: new Set(), rawRows: [] }
      const { data, error } = await supabase
        .from('conciliacoes')
        .select(`
          id, status, movimentacao_id,
          movimentacoes_bancarias!inner(valor, tipo),
          conciliacao_parcelas(parcela_id, mutuo_id, mutuo_parcela_id, medicao_id, valor_aplicado)
        `)
        .eq('company_id', currentCompany.id)
        .neq('status', 'rejeitado')
      if (error) throw error

      const links: ConciliacaoLink[] = []
      const movsConciliadasIds = new Set<string>()
      const rawRows: ConciliacaoLinksResult['rawRows'] = []

      for (const c of (data ?? []) as any[]) {
        movsConciliadasIds.add(c.movimentacao_id)
        const mov = Array.isArray(c.movimentacoes_bancarias)
          ? c.movimentacoes_bancarias[0]
          : c.movimentacoes_bancarias
        rawRows.push({
          movimentacao_id: c.movimentacao_id,
          status: c.status,
          conciliacao_parcelas: c.conciliacao_parcelas ?? [],
        })
        for (const cp of (c.conciliacao_parcelas ?? [])) {
          links.push({
            conciliacao_id: c.id,
            movimentacao_id: c.movimentacao_id,
            status: c.status,
            parcela_id: cp.parcela_id,
            mutuo_id: cp.mutuo_id,
            mutuo_parcela_id: cp.mutuo_parcela_id,
            medicao_id: cp.medicao_id,
            mov_valor: Number(mov?.valor ?? 0),
            mov_tipo: String(mov?.tipo ?? ''),
            valor_aplicado: Number(cp.valor_aplicado ?? 0),
          })
        }
      }

      return { links, movsConciliadasIds, rawRows }
    },
    enabled: !!currentCompany,
  })
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
        .select('*, conciliacao_parcelas(parcela_id, medicao_id, mutuo_parcela_id, mutuo_id, valor_aplicado, valor_juros, valor_multa, valor_desconto, observacao)')
        .eq('company_id', currentCompany.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as (Conciliacao & {
        conciliacao_parcelas: {
          parcela_id: string | null
          medicao_id: string | null
          mutuo_parcela_id: string | null
          mutuo_id: string | null
          valor_aplicado: number
          valor_juros: number
          valor_multa: number
          valor_desconto: number
          observacao: string | null
        }[]
      })[]
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

      // ── Reimport idempotente por chave funcional ──
      // Em vez de confiar apenas no FITID (formato muda, alguns bancos reusam), comparamos
      // (conta, data, valor, tipo, descricao). Se a quantidade de movs com essa chave já
      // existe no banco igual à do OFX, não insere nada. Se o OFX tem mais, insere só o excedente.
      const chaveFuncional = (date: string, valor: number, tipo: 'entrada'|'saida', descricao: string) =>
        `${date}|${Math.round(Math.abs(valor) * 100)}|${tipo}|${(descricao || '').trim().toUpperCase()}`

      const ordered = [...transactions].sort((a, b) => a.date.localeCompare(b.date))
      const startDate = ordered[0]?.date
      const endDate   = ordered[ordered.length - 1]?.date

      // Busca movs existentes no período e conta
      const { data: existentes } = await supabase
        .from('movimentacoes_bancarias')
        .select('data, valor, tipo, descricao')
        .eq('company_id', currentCompany.id)
        .eq('conta_id', contaId)
        .gte('data', startDate || '2000-01-01')
        .lte('data', endDate || '2999-12-31')

      const contagemExistente = new Map<string, number>()
      for (const m of (existentes ?? [])) {
        const k = chaveFuncional(m.data as string, Number(m.valor), m.tipo as 'entrada'|'saida', (m.descricao as string) ?? '')
        contagemExistente.set(k, (contagemExistente.get(k) ?? 0) + 1)
      }

      // Decide quais inserir (só o excedente sobre o que já existe)
      const contagemNova = new Map<string, number>()
      const rows: any[] = []
      for (let idx = 0; idx < transactions.length; idx++) {
        const txn = transactions[idx]!
        const tipo = txn.type === 'credit' ? 'entrada' : 'saida'
        const k = chaveFuncional(txn.date, txn.amount, tipo, txn.memoClean)
        const jaTem = contagemExistente.get(k) ?? 0
        const novoAte = (contagemNova.get(k) ?? 0) + 1
        contagemNova.set(k, novoAte)
        if (novoAte <= jaTem) {
          skipped++
          continue
        }
        const base = txn.fitid || `gen_${txn.date}_${idx}`
        const centavos = Math.abs(Math.round(txn.amount * 100))
        // Detector heurístico de transferência interna: se a descrição menciona
        // 'transferência' OU expressões equivalentes ('PAG Boleto', 'PIX Recebido'
        // sem entidade conhecida), classifica numa categoria fixa pra que a
        // auditoria contábil isole essas movs do gap real do extrato.
        const memo = (txn.memoClean ?? '').toLowerCase()
        const memoRaw = (txn.memoRaw ?? '').toLowerCase()
        const isTransferencia =
          memo.includes('transferência') ||
          memo.includes('transferencia') ||
          memoRaw.includes('transferência') ||
          memoRaw.includes('transferencia')
        const categoria = isTransferencia
          ? (tipo === 'entrada' ? 'Entrada de Transferência' : 'Saída de Transferência')
          : null
        rows.push({
          company_id: currentCompany.id,
          conta_id: contaId,
          data: txn.date,
          descricao: txn.memoClean,
          valor: Math.abs(txn.amount),
          tipo,
          categoria,
          fitid: `${base}_${centavos}_${Date.now()}_${idx}`,
          memo_raw: txn.memoRaw,
          saldo_acumulado: txn.balance,
          origem: txn.source,
          conciliado: false,
        })
      }

      const BATCH_SIZE = 50
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)
        const { error, count } = await supabase
          .from('movimentacoes_bancarias')
          .insert(batch, { count: 'exact' })
        if (error) {
          errors.push(`Batch ${Math.floor(i / BATCH_SIZE)}: ${error.message}`)
        } else {
          inserted += count ?? batch.length
        }
      }

      // Auto-reconciliação de parcelas órfãs: após inserir movs, tenta casar parcelas pagas
      // (sem conciliação) com movs recém-importadas pela combinação conta+data+valor+tipo.
      // Isso evita linhas fantasmas "Pagamento registrado sem extrato" após o reimport.
      let autoReconciled = 0
      try {
        const { data: orfas } = await supabase
          .from('parcelas')
          .select('id, valor_pago, conta_bancaria_id, data_pagamento_real')
          .eq('company_id', currentCompany.id)
          .eq('conta_bancaria_id', contaId)
          .in('status', ['paga', 'parcialmente_paga'])
          .not('data_pagamento_real', 'is', null)
          .gte('data_pagamento_real', meta.startDate || '2000-01-01')
          .lte('data_pagamento_real', meta.endDate || '2999-12-31')

        for (const p of (orfas ?? [])) {
          // Parcela já vinculada a uma conciliação? pula
          const { data: existingLink } = await supabase
            .from('conciliacao_parcelas')
            .select('conciliacao_id')
            .eq('parcela_id', p.id)
            .limit(1)
            .maybeSingle()
          if (existingLink) continue

          // Procura mov bancária compatível e ainda não conciliada
          const { data: movs } = await supabase
            .from('movimentacoes_bancarias')
            .select('id, valor, data, conciliado')
            .eq('company_id', currentCompany.id)
            .eq('conta_id', contaId)
            .eq('data', p.data_pagamento_real!)
            .eq('tipo', 'saida')
            .eq('conciliado', false)

          const valPago = Number(p.valor_pago || 0)
          const match = (movs ?? []).find(m => Math.abs(Number(m.valor) - valPago) < 0.005)
          if (!match) continue

          const { data: conc } = await supabase.from('conciliacoes').insert({
            company_id: currentCompany.id,
            movimentacao_id: match.id,
            match_type: 'auto_orfa_reimport',
            confidence: 100,
            diferenca: 0,
            status: 'confirmado',
          }).select('id').single()
          if (!conc) continue

          await supabase.from('conciliacao_parcelas').insert({
            conciliacao_id: conc.id,
            parcela_id: p.id,
            valor_aplicado: valPago,
          })
          await supabase.from('movimentacoes_bancarias').update({
            conciliado: true,
            conciliado_em: new Date().toISOString(),
            parcela_id: p.id,
          }).eq('id', match.id)
          autoReconciled++
        }
      } catch (e) {
        console.warn('Auto-reconcile falhou (não crítico):', (e as Error).message)
      }

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
          auto_reconciled: autoReconciled,
          total: transactions.length,
        },
      })

      return { inserted, skipped, errors, meta, autoReconciled }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['movimentacoes'] })
      qc.invalidateQueries({ queryKey: ['conciliacoes'] })
      qc.invalidateQueries({ queryKey: ['conciliacao-links'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      const reconcileMsg = result.autoReconciled > 0 ? ` · ${result.autoReconciled} reconciliadas automaticamente` : ''
      toast.success(`Importadas ${result.inserted} transações (${result.skipped} duplicadas ignoradas)${reconcileMsg}`)
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

      // Incluir MÚTUOS de entrada (captações = receber) e devolução (= pagar) na conciliação
      const { data: mutuos } = await supabase
        .from('mutuos')
        .select('*, mutuo_parcelas(*), fornecedores(nome)')
        .eq('company_id', currentCompany.id)
      
      for (const mut of (mutuos ?? []) as any[]) {
        // Captação = entrada de dinheiro → tipo 'receber'
        if (mut.tipo === 'captacao' || mut.valor_captado) {
          payables.push({
            id: `mut-cap-${mut.id}`,
            valor: Number(mut.valor_captado || 0),
            dataVencimento: mut.data_captacao,
            dataPagamento: mut.data_captacao, // captação já ocorreu
            valorPago: Number(mut.valor_captado || 0),
            status: 'paga',
            descricao: `Mútuo Captação: ${mut.nome}`,
            fornecedorNome: mut.fornecedores?.nome ?? null,
            documentoRef: null,
            tipo: 'receber',
          })
        }
        
        // Parcelas de devolução = saída de dinheiro → tipo 'pagar'
        for (const mp of (mut.mutuo_parcelas ?? []) as any[]) {
          payables.push({
            id: `mut-parc-${mp.id}`,
            valor: Number(mp.valor),
            dataVencimento: mp.data_vencimento,
            dataPagamento: mp.data_pagamento_real || null,
            valorPago: mp.valor_pago ? Number(mp.valor_pago) : null,
            status: mp.status,
            descricao: `Mútuo Devolução: ${mut.nome} - P${mp.numero_parcela}`,
            fornecedorNome: mut.fornecedores?.nome ?? null,
            documentoRef: null,
            tipo: 'pagar',
          })
        }
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
      qc.invalidateQueries({ queryKey: ['conciliacao-links'] })
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
      const { data: conc, error: concErr } = await supabase
        .from('conciliacoes')
        .select('*, conciliacao_parcelas(parcela_id, valor_aplicado)')
        .eq('id', conciliacaoId)
        .single()
      if (concErr) throw concErr

      // Guard: verifica overpayment antes de confirmar — evita que parcela
      // acumule valor_pago > valor face quando a mesma movimentação foi
      // erroneamente conciliada a uma parcela já quitada.
      for (const link of (conc.conciliacao_parcelas ?? [])) {
        if (!link.parcela_id) continue
        const { data: par } = await supabase
          .from('parcelas')
          .select('valor, valor_pago, status')
          .eq('id', link.parcela_id)
          .single()
        if (!par) continue
        const novoTotal = Number(par.valor_pago || 0) + Number(link.valor_aplicado || 0)
        if (novoTotal > Number(par.valor) + 0.01) {
          throw new Error(
            `Pagamento excederia o valor da parcela (face R$ ${Number(par.valor).toFixed(2)}, ` +
            `já conciliado R$ ${Number(par.valor_pago).toFixed(2)}, ` +
            `aplicando R$ ${Number(link.valor_aplicado).toFixed(2)}). ` +
            `Verifique se esta movimentação já foi conciliada em outro pedido.`
          )
        }
      }

      const { data: mov } = await supabase
        .from('movimentacoes_bancarias')
        .select('data, conta_id, descricao, memo_raw')
        .eq('id', conc.movimentacao_id)
        .single()
      const dataPgto = (mov?.data as string) || new Date().toISOString().split('T')[0]!
      const contaId = (mov as any)?.conta_id || null
      const formaInferida = inferirFormaPagamento((mov as any)?.descricao, (mov as any)?.memo_raw)

      await supabase.from('conciliacoes').update({ status: 'confirmado' }).eq('id', conciliacaoId)

      await supabase.from('movimentacoes_bancarias').update({
        conciliado: true,
        conciliado_em: new Date().toISOString(),
        parcela_id: conc.conciliacao_parcelas?.[0]?.parcela_id ?? null,
      }).eq('id', conc.movimentacao_id)

      // IMPORTANTE: NÃO escrever valor_pago nem status aqui.
      // A trigger SQL trg_sync_parcela_por_status_conciliacao (disparada pelo
      // UPDATE conciliacoes acima) já recalcula valor_pago = SUM(valor_aplicado)
      // e o status correto. Antes este loop somava valor_aplicado em cima do
      // valor_pago já recalculado pela trigger, gerando duplicação contábil
      // ("delta em dobro" — bug visto em ~12 parcelas em produção).
      // Aqui só persistimos campos que a trigger NÃO toca: forma_pagamento,
      // conta_bancaria_id e (se ainda nulo) data_pagamento_real.
      for (const link of (conc.conciliacao_parcelas ?? [])) {
        const { data: parcela } = await supabase
          .from('parcelas')
          .select('data_pagamento_real, forma_pagamento, conta_bancaria_id')
          .eq('id', link.parcela_id)
          .single()
        if (!parcela) continue

        await supabase.from('parcelas').update({
          data_pagamento_real: parcela.data_pagamento_real ?? dataPgto,
          forma_pagamento: parcela.forma_pagamento ?? formaInferida,
          conta_bancaria_id: parcela.conta_bancaria_id ?? contaId,
        }).eq('id', link.parcela_id)
      }

      return conc
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conciliacoes'] })
      qc.invalidateQueries({ queryKey: ['conciliacao-links'] })
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
      // Busca mov e links antes de apagar — precisamos limpar campos residuais da mov.
      const { data: conc } = await supabase
        .from('conciliacoes')
        .select('movimentacao_id')
        .eq('id', conciliacaoId)
        .single()

      // Remove links e a própria conciliação (evita estado zombie com link órfão).
      await supabase.from('conciliacao_parcelas').delete().eq('conciliacao_id', conciliacaoId)
      await supabase.from('conciliacoes').delete().eq('id', conciliacaoId)

      // Limpa campos residuais da mov se ela não tiver outra conciliação confirmada.
      if (conc?.movimentacao_id) {
        const { data: outra } = await supabase
          .from('conciliacoes')
          .select('id')
          .eq('movimentacao_id', conc.movimentacao_id)
          .eq('status', 'confirmado')
          .limit(1)
          .maybeSingle()
        if (!outra) {
          await supabase.from('movimentacoes_bancarias').update({
            conciliado: false,
            conciliado_em: null,
            parcela_id: null,
            categoria: null,
          }).eq('id', conc.movimentacao_id)
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conciliacoes'] })
      qc.invalidateQueries({ queryKey: ['conciliacao-links'] })
      qc.invalidateQueries({ queryKey: ['movimentacoes'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      toast.success('Sugestão rejeitada')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// Infere forma de pagamento a partir do memo da movimentação bancária
function inferirFormaPagamento(descricao?: string | null, memoRaw?: string | null): string | null {
  const texto = `${descricao ?? ''} ${memoRaw ?? ''}`.toUpperCase()
  if (/\bPIX\b/.test(texto)) return 'PIX'
  if (/\bTED\b/.test(texto)) return 'Transferência'
  if (/\bDOC\b/.test(texto)) return 'Transferência'
  if (/\bTEV\b|\bTRANSFER/.test(texto)) return 'Transferência'
  if (/\bBOLETO\b|\bCOB\b/.test(texto)) return 'Boleto'
  if (/\bCHEQUE\b/.test(texto)) return 'Cheque'
  if (/\bCART[AÃ]O\b/.test(texto)) return 'Cartão'
  if (/\bDINHEIRO\b|\bSAQUE\b/.test(texto)) return 'Dinheiro'
  return null
}

// ─── Undo Confirmed Reconciliation ──────────────────────────

async function computeParcelaStatus(
  parcelaId: string,
  novoValorPago: number,
  dataPgto?: string,
): Promise<{ status: string; data_pagamento_real: string | null }> {
  const { data: p } = await supabase
    .from('parcelas')
    .select('valor, data_vencimento, data_prevista_pagamento, data_pagamento_real')
    .eq('id', parcelaId)
    .single()
  if (!p) return { status: 'a_vencer', data_pagamento_real: null }

  const total = Number(p.valor)
  const today = new Date().toISOString().split('T')[0]!
  const dataEfetiva = dataPgto || p.data_pagamento_real || today

  if (novoValorPago <= 0.005) {
    const dataReferencia = (p as any).data_prevista_pagamento || p.data_vencimento
    const vencida = dataReferencia < today
    return { status: vencida ? 'vencida' : 'a_vencer', data_pagamento_real: null }
  }
  if (novoValorPago < total - 0.005) {
    return { status: 'parcialmente_paga', data_pagamento_real: p.data_pagamento_real ?? dataEfetiva }
  }
  return { status: 'paga', data_pagamento_real: dataEfetiva }
}

// ─── Helpers para v\u00ednculos polim\u00f3rficos (N:N com 4 tipos de origem) ─────
export type VinculoOrigem = 'parcela' | 'medicao' | 'mutuo_parcela' | 'mutuo'
export interface VinculoPayload {
  origem: VinculoOrigem
  origem_id: string
  valor_aplicado: number
  /** Juros sobre atraso. Não infla valor_pago da origem (trigger soma só valor_aplicado). */
  valor_juros?: number
  /** Multa sobre atraso. Idem juros. */
  valor_multa?: number
  /** Desconto por antecipação. Idem. */
  valor_desconto?: number
  observacao?: string | null
}

// Buscar categoria da origem (etapa/item/categoria da despesa/nome do m\u00fatuo)
async function buscarCategoriaOrigem(origem: VinculoOrigem, origemId: string): Promise<string | null> {
  if (origem === 'parcela') {
    const { data } = await supabase.from('parcelas')
      .select('pedidos(itens_compra(descricao, etapas(nome))), despesas_indiretas(categoria, descricao)')
      .eq('id', origemId).single()
    if (!data) return null
    const etapa = (data as any).pedidos?.itens_compra?.etapas?.nome
    const itemDesc = (data as any).pedidos?.itens_compra?.descricao
    const despCat = (data as any).despesas_indiretas?.categoria
    const despDesc = (data as any).despesas_indiretas?.descricao
    return etapa ? `${etapa}${itemDesc ? ' - ' + itemDesc : ''}` : (despCat ?? despDesc ?? null)
  }
  if (origem === 'medicao') return 'Medi\u00e7\u00e3o - Contrato'
  if (origem === 'mutuo_parcela') {
    const { data } = await supabase.from('mutuo_parcelas')
      .select('mutuos(nome, categoria)').eq('id', origemId).single()
    if (!data) return null
    const mut = (data as any).mutuos
    return mut ? `${mut.categoria ?? 'M\u00fatuo'} - ${mut.nome}` : 'Devolu\u00e7\u00e3o M\u00fatuo'
  }
  if (origem === 'mutuo') {
    const { data } = await supabase.from('mutuos').select('nome, categoria').eq('id', origemId).single()
    if (!data) return null
    return `${(data as any).categoria ?? 'M\u00fatuo'} - ${(data as any).nome}`
  }
  return null
}

// Aplica delta (pode ser negativo ao desfazer) no valor_pago da origem e atualiza status
async function aplicarDeltaOrigem(
  origem: VinculoOrigem,
  origemId: string,
  delta: number,
  dataPgto: string,
) {
  if (Math.abs(delta) < 0.005) return

  if (origem === 'parcela') {
    // NÃO atualizar valor_pago / status aqui: a trigger SQL trg_sync_parcela_valor_pago
    // (em conciliacao_parcelas) recalcula tudo via SUM(valor_aplicado) ao detectar
    // INSERT/UPDATE/DELETE no link. Escrever incremental aqui geraria duplicação
    // contábil ("delta em dobro"). Apenas atualizamos data_pagamento_real quando
    // ainda não há (a trigger preserva o valor existente, mas não cria do zero).
    if (delta > 0) {
      const { data: p } = await supabase.from('parcelas').select('data_pagamento_real').eq('id', origemId).single()
      if (p && !p.data_pagamento_real) {
        await supabase.from('parcelas').update({ data_pagamento_real: dataPgto }).eq('id', origemId)
      }
    }
  }
  else if (origem === 'mutuo_parcela') {
    const { data: mp } = await supabase.from('mutuo_parcelas').select('valor, valor_pago, data_vencimento').eq('id', origemId).single()
    if (!mp) return
    const novoPago = Math.max(0, (Number(mp.valor_pago) || 0) + delta)
    const total = Number(mp.valor)
    const today = new Date().toISOString().split('T')[0]!
    const novoStatus = novoPago <= 0.005 ? (mp.data_vencimento < today ? 'vencida' : 'pendente')
      : novoPago >= total - 0.005 ? 'paga' : 'parcialmente_paga'
    await supabase.from('mutuo_parcelas').update({
      valor_pago: novoPago, status: novoStatus,
      data_pagamento_real: novoPago > 0 ? dataPgto : null,
    }).eq('id', origemId)
  }
  else if (origem === 'medicao') {
    const { data: m } = await supabase.from('medicoes').select('valor_planejado, valor_liberado').eq('id', origemId).single()
    if (!m) return
    const novoLiberado = Math.max(0, (Number(m.valor_liberado) || 0) + delta)
    const total = Number(m.valor_planejado) || 0
    const novoStatus = novoLiberado <= 0.005 ? 'futura'
      : novoLiberado >= total - 0.005 ? 'paga' : 'liberada'
    await supabase.from('medicoes').update({
      valor_liberado: novoLiberado, status: novoStatus,
      data_liberacao: novoLiberado > 0 ? dataPgto : null,
    }).eq('id', origemId)
  }
  else if (origem === 'mutuo') {
    // Captação de mútuo: aplica delta no valor_captado "efetivamente recebido" via data_captacao.
    // Semântica: quando delta > 0 confirma recebimento (atualiza data_captacao + status ativo);
    // delta < 0 reverte (nada muda no valor_captado, apenas limpa observação de conciliação).
    if (delta > 0) {
      await supabase.from('mutuos').update({
        data_captacao: dataPgto,
        status: 'ativo',
      }).eq('id', origemId)
    }
  }
}

// Infere tipo de origem de um link de conciliacao_parcelas
function inferirOrigem(link: any): { origem: VinculoOrigem; origem_id: string } | null {
  if (link.parcela_id) return { origem: 'parcela', origem_id: link.parcela_id }
  if (link.medicao_id) return { origem: 'medicao', origem_id: link.medicao_id }
  if (link.mutuo_parcela_id) return { origem: 'mutuo_parcela', origem_id: link.mutuo_parcela_id }
  if (link.mutuo_id) return { origem: 'mutuo', origem_id: link.mutuo_id }
  return null
}

// Monta row para insert em conciliacao_parcelas baseado na origem
function buildLinkRow(conciliacaoId: string, v: VinculoPayload) {
  const base: any = {
    conciliacao_id: conciliacaoId,
    valor_aplicado: v.valor_aplicado,
    valor_juros: v.valor_juros ?? 0,
    valor_multa: v.valor_multa ?? 0,
    valor_desconto: v.valor_desconto ?? 0,
    observacao: v.observacao || null,
  }
  if (v.origem === 'parcela') base.parcela_id = v.origem_id
  else if (v.origem === 'medicao') base.medicao_id = v.origem_id
  else if (v.origem === 'mutuo_parcela') base.mutuo_parcela_id = v.origem_id
  else if (v.origem === 'mutuo') base.mutuo_id = v.origem_id
  return base
}

const round2 = (n: number) => Math.round(n * 100) / 100

// Expande um vínculo a uma parcela de pedido em N vínculos (consumo FIFO).
// Pagamento abate a parcela escolhida primeiro; se exceder o saldo dela, segue
// para a próxima em aberto na ordem (numero_parcela, data_vencimento). Se ainda
// sobrar após esgotar todas, cria parcela extra no pedido e soma ao valor_total_real.
// Vínculos a outras origens (medicao, mutuo, parcela de despesa indireta) passam
// sem alteração.
async function expandirVinculoParcelaFifo(
  v: VinculoPayload,
  dataPgto: string,
  companyId: string,
): Promise<VinculoPayload[]> {
  if (v.origem !== 'parcela') return [v]
  const { data: p } = await supabase.from('parcelas')
    .select('pedido_id').eq('id', v.origem_id).single()
  if (!p?.pedido_id) return [v]

  const { data: abertasRaw } = await supabase.from('parcelas')
    .select('id, numero_parcela, valor, valor_pago, data_vencimento')
    .eq('pedido_id', p.pedido_id)
    .neq('status', 'paga')
    .order('numero_parcela', { ascending: true })
    .order('data_vencimento', { ascending: true })
  const abertas = (abertasRaw ?? []) as Array<{ id: string; numero_parcela: number; valor: number; valor_pago: number | null; data_vencimento: string }>
  if (abertas.length === 0) return [v]

  const idx = abertas.findIndex(x => x.id === v.origem_id)
  const ordenadas = idx > 0
    ? [abertas[idx]!, ...abertas.slice(0, idx), ...abertas.slice(idx + 1)]
    : abertas

  let restante = round2(Number(v.valor_aplicado))
  const out: VinculoPayload[] = []
  // Encargos vão no PRIMEIRO link do FIFO (vínculo original); transbordos recebem 0.
  let encargosRestantes = {
    juros: Number(v.valor_juros ?? 0),
    multa: Number(v.valor_multa ?? 0),
    desconto: Number(v.valor_desconto ?? 0),
  }
  for (const par of ordenadas) {
    if (restante <= 0.005) break
    const saldo = round2(Number(par.valor) - Number(par.valor_pago ?? 0))
    if (saldo <= 0.005) continue
    const aplicar = Math.min(saldo, restante)
    out.push({
      origem: 'parcela', origem_id: par.id, valor_aplicado: round2(aplicar),
      valor_juros: encargosRestantes.juros,
      valor_multa: encargosRestantes.multa,
      valor_desconto: encargosRestantes.desconto,
      observacao: v.observacao ?? null,
    })
    encargosRestantes = { juros: 0, multa: 0, desconto: 0 }
    restante = round2(restante - aplicar)
  }

  if (restante > 0.005) {
    const { data: ult } = await supabase.from('parcelas')
      .select('numero_parcela').eq('pedido_id', p.pedido_id)
      .order('numero_parcela', { ascending: false }).limit(1).maybeSingle()
    const proximoNum = (ult?.numero_parcela ?? 0) + 1
    const { data: nova } = await supabase.from('parcelas').insert({
      company_id: companyId,
      pedido_id: p.pedido_id,
      numero_parcela: proximoNum,
      valor: restante,
      valor_pago: 0,
      data_vencimento: dataPgto,
      status: 'futura',
      tipo: 'contratual',
    } as any).select('id').single()
    if (nova) {
      out.push({
        origem: 'parcela', origem_id: nova.id, valor_aplicado: round2(restante),
        valor_juros: encargosRestantes.juros,
        valor_multa: encargosRestantes.multa,
        valor_desconto: encargosRestantes.desconto,
        observacao: v.observacao ?? null,
      })
      const { data: ped } = await supabase.from('pedidos')
        .select('valor_total_real').eq('id', p.pedido_id).single()
      if (ped) {
        await supabase.from('pedidos').update({
          valor_total_real: round2((Number(ped.valor_total_real) || 0) + restante),
        }).eq('id', p.pedido_id)
      }
    }
  }

  return out.length > 0 ? out : [v]
}

export function useUndoConciliacao() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async (conciliacaoId: string) => {
      if (!currentCompany) throw new Error('No company')

      const { data: conc, error: concErr } = await supabase
        .from('conciliacoes')
        .select('*, conciliacao_parcelas(parcela_id, medicao_id, mutuo_parcela_id, mutuo_id, valor_aplicado)')
        .eq('id', conciliacaoId)
        .single()
      if (concErr) throw concErr
      if (!conc) throw new Error('Conciliação não encontrada')

      const snapshot = { ...conc }
      const today = new Date().toISOString().split('T')[0]!

      await supabase.from('movimentacoes_bancarias').update({
        conciliado: false,
        conciliado_em: null,
        parcela_id: null,
      }).eq('id', conc.movimentacao_id)

      for (const link of (conc.conciliacao_parcelas ?? []) as any[]) {
        const origem = inferirOrigem(link)
        if (!origem) continue
        // Delta negativo (reverte valor_pago)
        await aplicarDeltaOrigem(origem.origem, origem.origem_id, -Number(link.valor_aplicado), today)
      }

      await supabase.from('conciliacao_parcelas').delete().eq('conciliacao_id', conciliacaoId)
      await supabase.from('conciliacoes').delete().eq('id', conciliacaoId)

      // Fix B: após o trigger recalcular valor_pago a partir dos links restantes,
      // limpa data_pagamento_real nas parcelas que ficaram zeradas. O trigger não
      // toca esse campo — sem esta limpeza a parcela volta a 'a_vencer' mas ainda
      // exibe a data de pagamento anterior, confundindo o operador.
      const parcelaIdsUndo = (conc.conciliacao_parcelas ?? [])
        .filter((l: any) => l.parcela_id)
        .map((l: any) => l.parcela_id as string)
      if (parcelaIdsUndo.length > 0) {
        const { data: parcelasAposUndo } = await supabase
          .from('parcelas')
          .select('id, valor_pago')
          .in('id', parcelaIdsUndo)
        for (const p of (parcelasAposUndo ?? [])) {
          if (Number(p.valor_pago || 0) <= 0.005) {
            await supabase.from('parcelas').update({ data_pagamento_real: null }).eq('id', p.id)
          }
        }
      }

      await supabase.from('audit_logs').insert({
        company_id: currentCompany.id,
        tabela: 'conciliacoes',
        registro_id: conciliacaoId,
        acao: 'UNDO',
        agente: 'usuario',
        dados_antes: snapshot,
        dados_depois: { type: 'undo_conciliacao', motivo: 'Desfeito pelo usuário' },
      })

      return snapshot
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conciliacoes'] })
      qc.invalidateQueries({ queryKey: ['conciliacao-links'] })
      qc.invalidateQueries({ queryKey: ['movimentacoes'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['medicoes'] })
      qc.invalidateQueries({ queryKey: ['mutuos'] })
      toast.success('Conciliação desfeita')
    },
    onError: (err: Error) => toast.error('Erro ao desfazer: ' + err.message),
  })
}

// ─── Edit Confirmed Reconciliation ──────────────────────────

export interface UpdateConciliacaoPayload {
  conciliacaoId: string
  // Novo formato polim\u00f3rfico (preferido)
  vinculos?: VinculoPayload[]
  // Legado (mantido por compatibilidade)
  parcelas?: { parcela_id: string; valor_aplicado: number }[]
}

export function useUpdateConciliacao() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async ({ conciliacaoId, vinculos, parcelas: parcelasLegacy }: UpdateConciliacaoPayload) => {
      if (!currentCompany) throw new Error('No company')

      const novosVinculos: VinculoPayload[] = vinculos ?? (parcelasLegacy ?? []).map(p => ({
        origem: 'parcela' as VinculoOrigem,
        origem_id: p.parcela_id,
        valor_aplicado: p.valor_aplicado,
      }))

      const { data: conc, error: concErr } = await supabase
        .from('conciliacoes')
        .select('*, conciliacao_parcelas(parcela_id, medicao_id, mutuo_parcela_id, mutuo_id, valor_aplicado)')
        .eq('id', conciliacaoId)
        .single()
      if (concErr) throw concErr
      if (!conc) throw new Error('Conciliação não encontrada')

      const { data: movData0 } = await supabase
        .from('movimentacoes_bancarias')
        .select('data')
        .eq('id', conc.movimentacao_id)
        .single()
      const dataPgto = (movData0?.data as string) || new Date().toISOString().split('T')[0]!
      const snapshot = { ...conc }

      // Mapa de links antigos por chave `${origem}:${id}` → valor_aplicado
      const antigoMap = new Map<string, number>()
      for (const link of (conc.conciliacao_parcelas ?? []) as any[]) {
        const o = inferirOrigem(link); if (!o) continue
        antigoMap.set(`${o.origem}:${o.origem_id}`, Number(link.valor_aplicado))
      }
      const novoMap = new Map<string, { payload: VinculoPayload; valor: number }>()
      for (const v of novosVinculos) {
        novoMap.set(`${v.origem}:${v.origem_id}`, { payload: v, valor: Number(v.valor_aplicado) })
      }

      const chavesAfetadas = new Set([...antigoMap.keys(), ...novoMap.keys()])

      for (const chave of chavesAfetadas) {
        const antigo = antigoMap.get(chave) ?? 0
        const novo = novoMap.get(chave)?.valor ?? 0
        const delta = novo - antigo
        if (Math.abs(delta) < 0.005) continue

        const [origem, origem_id] = chave.split(':') as [VinculoOrigem, string]
        await aplicarDeltaOrigem(origem, origem_id, delta, dataPgto)
      }

      await supabase.from('conciliacao_parcelas').delete().eq('conciliacao_id', conciliacaoId)
      if (novosVinculos.length > 0) {
        await supabase.from('conciliacao_parcelas').insert(
          novosVinculos.map(v => buildLinkRow(conciliacaoId, v))
        )
      }

      // movimentacoes.parcela_id + categoria propagada do primeiro v\u00ednculo
      const primeiro = novosVinculos[0]
      const categoriaOrigem = primeiro
        ? await buscarCategoriaOrigem(primeiro.origem, primeiro.origem_id)
        : null
      await supabase.from('movimentacoes_bancarias').update({
        parcela_id: primeiro?.origem === 'parcela' ? primeiro.origem_id : null,
        ...(categoriaOrigem ? { categoria: categoriaOrigem } : {}),
      }).eq('id', conc.movimentacao_id)

      const { data: movData } = await supabase
        .from('movimentacoes_bancarias')
        .select('valor')
        .eq('id', conc.movimentacao_id)
        .single()
      const totalAplicado = novosVinculos.reduce((s, v) => s + Number(v.valor_aplicado), 0)
      const diferenca = movData ? Number(movData.valor) - totalAplicado : 0

      await supabase.from('conciliacoes').update({
        diferenca,
        match_type: 'manual_edit',
      }).eq('id', conciliacaoId)

      await supabase.from('audit_logs').insert({
        company_id: currentCompany.id,
        tabela: 'conciliacoes',
        registro_id: conciliacaoId,
        acao: 'UPDATE',
        agente: 'usuario',
        dados_antes: snapshot,
        dados_depois: { type: 'edit_conciliacao', novos_vinculos: novosVinculos, diferenca },
      })

      return conciliacaoId
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conciliacoes'] })
      qc.invalidateQueries({ queryKey: ['conciliacao-links'] })
      qc.invalidateQueries({ queryKey: ['movimentacoes'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['medicoes'] })
      qc.invalidateQueries({ queryKey: ['mutuos'] })
      toast.success('Conciliação atualizada')
    },
    onError: (err: Error) => toast.error('Erro ao atualizar: ' + err.message),
  })
}

// Hook para CRIAR concilia\u00e7\u00e3o nova (mov sem vinculo pr\u00e9vio)
export interface CreateConciliacaoPayload {
  movimentacaoId: string
  vinculos: VinculoPayload[]
  matchType?: string
  dataPgto: string
  /** IDs de movimenta\u00e7\u00f5es fantasma (Pgto lote / Quitar parcela) que ser\u00e3o
   * absorvidas por este movimento real. Suas concilia\u00e7\u00f5es e CPs s\u00e3o exclu\u00eddas
   * ap\u00f3s a cria\u00e7\u00e3o do v\u00ednculo principal \u2014 o trigger SQL recalcula valor_pago
   * automaticamente (CPs com conciliacoes.status='aprovado' n\u00e3o entram na soma). */
  phantomMovIds?: string[]
}
export function useCreateConciliacao() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async ({ movimentacaoId, vinculos, matchType = 'manual_ui', dataPgto, phantomMovIds }: CreateConciliacaoPayload) => {
      if (!currentCompany) throw new Error('No company')
      if (vinculos.length === 0) throw new Error('Sem v\u00ednculos')

      const { data: mov } = await supabase
        .from('movimentacoes_bancarias')
        .select('valor, conta_id, descricao, memo_raw')
        .eq('id', movimentacaoId)
        .single()
      const valorMov = Number(mov?.valor ?? 0)
      const totalAplicado = vinculos.reduce((s, v) => s + Number(v.valor_aplicado), 0)
      const diferenca = valorMov - totalAplicado
      const contaId = (mov as any)?.conta_id || null
      const formaInferida = inferirFormaPagamento((mov as any)?.descricao, (mov as any)?.memo_raw)

      const { data: conc, error } = await supabase.from('conciliacoes').insert({
        company_id: currentCompany.id,
        movimentacao_id: movimentacaoId,
        match_type: matchType,
        confidence: 100,
        diferenca,
        status: 'confirmado',
      }).select('id').single()
      if (error) throw error
      if (!conc) throw new Error('Falha ao criar concilia\u00e7\u00e3o')

      // Consumo FIFO: cada vínculo a parcela de pedido vira N vínculos (uma por
      // parcela consumida em ordem). O plano de parcelas não é alterado pelo
      // pagamento — apenas valor_pago é sincronizado pelo trigger SQL a partir
      // dos vínculos. Se o pagamento exceder o saldo total do pedido, uma parcela
      // extra é criada e somada ao valor_total_real.
      const vinculosFinal: VinculoPayload[] = []
      for (const v of vinculos) {
        const expandido = await expandirVinculoParcelaFifo(v, dataPgto, currentCompany.id)
        vinculosFinal.push(...expandido)
      }

      await supabase.from('conciliacao_parcelas').insert(
        vinculosFinal.map(v => buildLinkRow(conc.id, v))
      )

      // Aplica delta positivo (adiciona valor_pago na origem)
      for (const v of vinculosFinal) {
        await aplicarDeltaOrigem(v.origem, v.origem_id, v.valor_aplicado, dataPgto)
        // Rastreabilidade: grava conta+forma na parcela quando ainda não tem
        if (v.origem === 'parcela') {
          const { data: p } = await supabase.from('parcelas')
            .select('forma_pagamento, conta_bancaria_id').eq('id', v.origem_id).single()
          await supabase.from('parcelas').update({
            forma_pagamento: p?.forma_pagamento ?? formaInferida,
            conta_bancaria_id: p?.conta_bancaria_id ?? contaId,
          }).eq('id', v.origem_id)
        }
      }

      const primeiro = vinculosFinal[0]!
      // Propagar categoria da origem para a mov banc\u00e1ria
      const categoriaOrigem = await buscarCategoriaOrigem(primeiro.origem, primeiro.origem_id)
      await supabase.from('movimentacoes_bancarias').update({
        conciliado: true,
        conciliado_em: new Date().toISOString(),
        parcela_id: primeiro.origem === 'parcela' ? primeiro.origem_id : null,
        ...(categoriaOrigem ? { categoria: categoriaOrigem } : {}),
      }).eq('id', movimentacaoId)

      // Absorve movimenta\u00e7\u00f5es fantasma (Pgto lote / Quitar) \u2014 apaga conciliacoes
      // 'aprovado', seus CPs e a mov fantasma. parcelas.valor_pago j\u00e1 reflete
      // o v\u00ednculo confirmado; os CPs deletados eram 'aprovado' (n\u00e3o somados).
      if (phantomMovIds && phantomMovIds.length > 0) {
        const { data: phantomConcs } = await supabase
          .from('conciliacoes')
          .select('id')
          .in('movimentacao_id', phantomMovIds)
        const phantomConcIds = (phantomConcs ?? []).map((c: any) => c.id)
        if (phantomConcIds.length > 0) {
          await supabase.from('conciliacao_parcelas').delete().in('conciliacao_id', phantomConcIds)
          await supabase.from('conciliacoes').delete().in('id', phantomConcIds)
        }
        await supabase.from('movimentacoes_bancarias').delete().in('id', phantomMovIds)
      }

      return conc.id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conciliacoes'] })
      qc.invalidateQueries({ queryKey: ['conciliacao-links'] })
      qc.invalidateQueries({ queryKey: ['movimentacoes'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['medicoes'] })
      qc.invalidateQueries({ queryKey: ['mutuos'] })
      toast.success('V\u00ednculo criado')
    },
    onError: (err: Error) => toast.error('Erro ao vincular: ' + err.message),
  })
}

// ─── Lançamento Manual (sem OFX) ────────────────────────────

export interface LancamentoManualPayload {
  conta_id: string
  data: string
  valor: number
  tipo: 'entrada' | 'saida'
  descricao: string
  parcela_id?: string | null
  /** Vínculo opcional polimórfico para criar a conciliação; suporta parcela, medição, mutuo ou mutuo_parcela */
  vinculo?: { tipo: 'parcela' | 'medicao' | 'mutuo' | 'mutuo_parcela'; id: string } | null
  categoria?: string | null
  observacao?: string | null
  auto_conciliar?: boolean
}

export function useCreateMovimentoManual() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async (payload: LancamentoManualPayload) => {
      if (!currentCompany) throw new Error('No company')

      const fitid = `manual_${payload.conta_id}_${payload.data}_${Date.now()}`
      const row = {
        company_id: currentCompany.id,
        conta_id: payload.conta_id,
        data: payload.data,
        descricao: payload.descricao,
        valor: Math.abs(payload.valor),
        tipo: payload.tipo,
        fitid,
        memo_raw: payload.descricao,
        saldo_acumulado: null,
        origem: 'manual',
        conciliado: payload.auto_conciliar ?? !!payload.parcela_id,
        conciliado_em: (payload.auto_conciliar || payload.parcela_id) ? new Date().toISOString() : null,
        parcela_id: payload.parcela_id ?? null,
        categoria: payload.categoria ?? null,
        observacao: payload.observacao ?? null,
      }

      const { data: mov, error } = await supabase
        .from('movimentacoes_bancarias')
        .insert(row)
        .select('*')
        .single()
      if (error) throw error

      // Vínculo polimórfico: parcela / medicao / mutuo_parcela / mutuo.
      // Mantém compat com payload.parcela_id antigo.
      const vinculo = payload.vinculo ?? (payload.parcela_id ? { tipo: 'parcela' as const, id: payload.parcela_id } : null)
      if (vinculo) {
        const { data: conc } = await supabase.from('conciliacoes').insert({
          company_id: currentCompany.id,
          movimentacao_id: mov.id,
          match_type: 'manual_lancamento',
          confidence: 100,
          diferenca: 0,
          status: 'confirmado',
        }).select('id').single()

        if (conc) {
          const valorAplicado = Math.abs(payload.valor)
          const linkRow: any = { conciliacao_id: conc.id, valor_aplicado: valorAplicado }
          if (vinculo.tipo === 'parcela')        linkRow.parcela_id        = vinculo.id
          else if (vinculo.tipo === 'medicao')   linkRow.medicao_id        = vinculo.id
          else if (vinculo.tipo === 'mutuo_parcela') linkRow.mutuo_parcela_id = vinculo.id
          else if (vinculo.tipo === 'mutuo')     linkRow.mutuo_id          = vinculo.id
          await supabase.from('conciliacao_parcelas').insert(linkRow)
          // O trigger SQL trg_sync_parcela_valor_pago só recalcula parcelas de pedido.
          // Para medicao/mutuo_parcela/mutuo precisamos chamar aplicarDeltaOrigem manualmente,
          // senão o valor_pago/status da origem nunca atualiza.
          const origem: VinculoOrigem =
            vinculo.tipo === 'parcela' ? 'parcela' :
            vinculo.tipo === 'medicao' ? 'medicao' :
            vinculo.tipo === 'mutuo_parcela' ? 'mutuo_parcela' : 'mutuo'
          await aplicarDeltaOrigem(origem, vinculo.id, valorAplicado, payload.data)
        }
      }

      await supabase.from('audit_logs').insert({
        company_id: currentCompany.id,
        tabela: 'movimentacoes_bancarias',
        registro_id: mov.id,
        acao: 'INSERT_MANUAL',
        agente: 'usuario',
        dados_depois: { type: 'lancamento_manual', ...row },
      })

      return mov
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['movimentacoes'] })
      qc.invalidateQueries({ queryKey: ['conciliacoes'] })
      qc.invalidateQueries({ queryKey: ['conciliacao-links'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['medicoes'] })
      qc.invalidateQueries({ queryKey: ['mutuos'] })
      toast.success('Lançamento manual criado')
    },
    onError: (err: Error) => toast.error('Erro ao criar lançamento: ' + err.message),
  })
}

export function useDeleteMovimento() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async (movId: string) => {
      if (!currentCompany) throw new Error('No company')

      const { data: mov } = await supabase
        .from('movimentacoes_bancarias')
        .select('*')
        .eq('id', movId)
        .single()
      if (!mov) throw new Error('Movimento não encontrado')

      // Busca todos os 4 tipos de vínculo — não só parcela_id
      const { data: concs } = await supabase
        .from('conciliacoes')
        .select('*, conciliacao_parcelas(parcela_id, medicao_id, mutuo_parcela_id, mutuo_id, valor_aplicado)')
        .eq('movimentacao_id', movId)

      const today = new Date().toISOString().split('T')[0]!

      for (const conc of (concs ?? []) as any[]) {
        for (const link of (conc.conciliacao_parcelas ?? [])) {
          const origem = inferirOrigem(link)
          if (!origem) continue

          if (origem.origem === 'parcela') {
            // Para parcelas: reverte valor_pago + limpa data_pagamento_real via computeParcelaStatus.
            // O trigger trg_sync_parcela_valor_pago vai recalcular valor_pago a partir de
            // SUM(valor_aplicado) quando deletarmos conciliacao_parcelas abaixo, mas não limpa
            // data_pagamento_real — fazemos isso manualmente aqui.
            const { data: p } = await supabase
              .from('parcelas')
              .select('valor_pago')
              .eq('id', origem.origem_id)
              .single()
            if (p) {
              const novoPago = Math.max(0, (Number(p.valor_pago) || 0) - Number(link.valor_aplicado))
              const { status, data_pagamento_real } = await computeParcelaStatus(origem.origem_id, novoPago)
              await supabase.from('parcelas').update({
                valor_pago: novoPago, status, data_pagamento_real,
              }).eq('id', origem.origem_id)
            }
          } else {
            // Para medição / mutuo_parcela / mutuo: não há trigger — reverte via aplicarDeltaOrigem.
            await aplicarDeltaOrigem(origem.origem, origem.origem_id, -Number(link.valor_aplicado), today)
          }
        }
        await supabase.from('conciliacao_parcelas').delete().eq('conciliacao_id', conc.id)
        await supabase.from('conciliacoes').delete().eq('id', conc.id)
      }

      await supabase.from('movimentacoes_bancarias').delete().eq('id', movId)

      await supabase.from('audit_logs').insert({
        company_id: currentCompany.id,
        tabela: 'movimentacoes_bancarias',
        registro_id: movId,
        acao: 'DELETE',
        agente: 'usuario',
        dados_antes: mov,
      })

      return mov
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['movimentacoes'] })
      qc.invalidateQueries({ queryKey: ['conciliacoes'] })
      qc.invalidateQueries({ queryKey: ['conciliacao-links'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['medicoes'] })
      qc.invalidateQueries({ queryKey: ['mutuos'] })
      toast.success('Movimento excluído')
    },
    onError: (err: Error) => toast.error('Erro ao excluir: ' + err.message),
  })
}

// ─── Undo History (Audit Trail) ─────────────────────────────

export function useConciliacaoHistory() {
  const { currentCompany } = useProject()
  return useQuery({
    queryKey: ['conciliacao_history', currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany) return []
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('company_id', currentCompany.id)
        .eq('tabela', 'conciliacoes')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data ?? []
    },
    enabled: !!currentCompany,
  })
}

// ─── Export XLSX (Realizado + Aberto + Movs sem conciliação) ─

/**
 * Exporta para XLSX as conciliações com seus vínculos polimórficos resolvidos,
 * tudo que está em aberto (saldo > 0) e as movs bancárias sem conciliação.
 * Lê das views `vw_conciliacao_realizado`, `vw_planejado_aberto` e
 * `vw_movimentacoes_nao_conciliadas`.
 */
export function useExportConciliacao() {
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async () => {
      if (!currentCompany) throw new Error('No company')

      const [realizadoRes, abertoRes, ncRes, extratoRes] = await Promise.all([
        supabase
          .from('vw_conciliacao_realizado')
          .select('*')
          .eq('company_id', currentCompany.id)
          .order('data_mov', { ascending: false }),
        supabase
          .from('vw_planejado_aberto')
          .select('*')
          .eq('company_id', currentCompany.id)
          .order('data_prevista', { ascending: true, nullsFirst: false }),
        supabase
          .from('vw_movimentacoes_nao_conciliadas')
          .select('*')
          .eq('company_id', currentCompany.id)
          .order('data_mov', { ascending: false }),
        supabase
          .from('vw_extrato_completo')
          .select('*')
          .eq('company_id', currentCompany.id)
          .order('data_mov', { ascending: true }),
      ])

      if (realizadoRes.error) throw realizadoRes.error
      if (abertoRes.error)    throw abertoRes.error
      if (ncRes.error)        throw ncRes.error
      if (extratoRes.error)   throw extratoRes.error

      const realizado       = (realizadoRes.data ?? []) as unknown as RealizadoRow[]
      const aberto          = (abertoRes.data ?? []) as unknown as AbertoRow[]
      const naoConciliadas  = (ncRes.data ?? []) as unknown as NaoConciliadaRow[]
      const extrato         = (extratoRes.data ?? []) as unknown as ExtratoRow[]

      exportConciliacaoXlsx({
        realizado,
        aberto,
        naoConciliadas,
        extrato,
        filename: `conciliacao_${currentCompany.id.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}`,
      })

      return {
        realizado: realizado.length,
        aberto: aberto.length,
        naoConciliadas: naoConciliadas.length,
        extrato: extrato.length,
      }
    },
    onSuccess: (r) => {
      toast.success(
        `Exportado: ${r.extrato} movs no extrato · ${r.realizado} vínculos · ${r.aberto} em aberto · ${r.naoConciliadas} sem conciliação`,
      )
    },
    onError: (err: Error) => toast.error('Erro ao exportar: ' + err.message),
  })
}
