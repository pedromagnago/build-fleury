import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { useMovimentacoes } from '@/hooks/useOperacional'
import { toast } from 'sonner'

export interface Parcela {
  id: string
  company_id: string
  pedido_id: string | null
  despesa_indireta_id: string | null
  numero_parcela: number
  valor: number
  data_vencimento: string
  /** Previsao editavel de pagamento. Default = data_vencimento. Usada em fluxo, dashboard e relatorios quando data_pagamento_real IS NULL. */
  data_prevista_pagamento: string | null
  data_pagamento_real: string | null
  valor_pago: number
  forma_pagamento: string | null
  conta_bancaria_id: string | null
  status: 'futura' | 'a_vencer' | 'paga' | 'vencida' | 'parcialmente_paga'
  /** contratual = parcela do cronograma cond_pagamento; adiantamento = PIX antecipado fora do cronograma */
  tipo?: 'contratual' | 'adiantamento'
  comprovante_path: string | null
  deleted_at: string | null
  created_at: string
  descricao: string | null
  // Joined
  pedido_item?: string
  item_compra_id?: string | null
  observacoes?: string | null
  fornecedor_nome?: string | null
}

export interface ContaBancaria {
  id: string
  company_id: string
  nome: string
  banco: string | null
  agencia: string | null
  conta: string | null
  tipo: string | null
  saldo_inicial: number
  ativa: boolean
  created_at: string
}

export function useParcelas() {
  const { currentCompany } = useProject()
  const companyId = currentCompany?.id

  return useQuery({
    queryKey: ['parcelas', companyId],
    queryFn: async () => {
      if (!companyId) return []
      
      let allData: any[] = []
      let hasMore = true
      let page = 0
      const PAGE_SIZE = 1000

      while (hasMore) {
        const { data, error } = await supabase
          .from('parcelas')
          .select('*, pedidos(numero_pedido, cond_pagamento, data_entrega_prevista, item_compra_id, fornecedor_id, valor_total_real, fornecedores(nome), itens_compra(descricao, etapa_id, valor_total_orcado, valor_consumido, etapas(nome), deleted_at)), despesas_indiretas(descricao, categoria, fornecedor_id, fornecedores(nome), deleted_at)')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .order('data_vencimento', { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

        if (error) throw error
        
        if (data && data.length > 0) {
          allData = [...allData, ...data]
          if (data.length < PAGE_SIZE) {
            hasMore = false
          } else {
            page++
          }
        } else {
          hasMore = false
        }
      }

      return allData
        .filter((p: any) => {
          if (p.pedido_id) {
            if (!p.pedidos || !p.pedidos.itens_compra || p.pedidos.itens_compra.deleted_at) return false
          } else if (p.despesa_indireta_id) {
            if (!p.despesas_indiretas || p.despesas_indiretas.deleted_at) return false
          }
          return true
        })
        .map((p: Record<string, unknown>) => {
        const pedido = p.pedidos as Record<string, unknown> | null
        const item = pedido?.itens_compra as Record<string, any> | null
        const etapa = item?.etapas as Record<string, string> | null
        const despesa = p.despesas_indiretas as Record<string, unknown> | null
        const fornPed = pedido?.fornecedores as Record<string, string> | null
        const fornDesp = despesa?.fornecedores as Record<string, string> | null
        return {
          ...p,
          pedido_item: item?.descricao ?? (despesa?.descricao as string) ?? null,
          item_compra_id: (pedido?.item_compra_id as string) ?? null,
          fornecedor_nome: fornPed?.nome ?? fornDesp?.nome ?? null,
          // Enriquecimento para hierarquia Item → Pedido → Parcela na conciliação
          pedido_numero: (pedido?.numero_pedido as number) ?? null,
          pedido_cond_pagamento: (pedido?.cond_pagamento as string) ?? null,
          pedido_data_entrega: (pedido?.data_entrega_prevista as string) ?? null,
          pedido_valor_total: pedido?.valor_total_real != null ? Number(pedido.valor_total_real) : null,
          etapa_nome: etapa?.nome ?? null,
          item_valor_orcado: item?.valor_total_orcado != null ? Number(item.valor_total_orcado) : null,
          item_valor_consumido: item?.valor_consumido != null ? Number(item.valor_consumido) : null,
        }
      }) as unknown as Parcela[]
    },
    enabled: !!companyId,
  })
}

export function useCreateParcela() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async (parcela: Partial<Parcela>) => {
      if (!currentCompany) throw new Error('No company')
      const { data, error } = await supabase
        .from('parcelas')
        .insert({ ...parcela, company_id: currentCompany.id })
        .select()
        .single()
      if (error) throw error
      return data as Parcela
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      toast.success('Parcela criada')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateParcela() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Parcela> & { id: string }) => {
      const { data, error } = await supabase
        .from('parcelas')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Parcela
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      toast.success('Parcela atualizada')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteParcela() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: row } = await supabase.from('parcelas').select('company_id, valor, numero_parcela').eq('id', id).single()
      const { error } = await supabase.from('parcelas').delete().eq('id', id)
      if (error) throw error
      if (row) {
        const { data: { user } } = await supabase.auth.getUser()
        await supabase.from('audit_logs').insert({
          user_id: user?.id, company_id: row.company_id,
          acao: 'DELETE', tabela: 'parcelas', registro_id: id,
          dados: { valor: row.valor, numero_parcela: row.numero_parcela },
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      toast.success('Parcela excluída com sucesso')
    },
    onError: (err: Error) => toast.error('Erro ao excluir parcela: ' + err.message),
  })
}

/**
 * Saídas conciliadas a mutuo_id (sem mutuo_parcela_id nem parcela_id).
 *
 * São amortizações avulsas — quando o usuário pagou principal de um mútuo via
 * mov bancária mas não vinculou a uma parcela específica do cronograma.
 * Não aparecem em /pagamentos pelas tabelas normais (parcelas/mutuo_parcelas)
 * porque não existem como linha lá. Este hook materializa o registro como uma
 * "parcela virtual" com os mesmos campos para listagem unificada.
 */
export interface AmortizacaoAvulsa {
  id: string                  // = movimentacao_id
  movimentacao_id: string
  mutuo_id: string
  mutuo_nome: string
  data: string
  valor: number
  descricao: string | null
  conta_bancaria_id: string | null
}

export function useAmortizacoesAvulsas() {
  const { currentCompany } = useProject()
  return useQuery({
    queryKey: ['amortizacoes-avulsas', currentCompany?.id],
    queryFn: async (): Promise<AmortizacaoAvulsa[]> => {
      if (!currentCompany) return []
      const { data, error } = await supabase
        .from('conciliacao_parcelas')
        .select(`
          mutuo_id, parcela_id, mutuo_parcela_id, medicao_id,
          conciliacoes!inner(
            company_id, status, movimentacao_id,
            movimentacoes_bancarias!inner(id, data, valor, tipo, descricao, conta_id)
          ),
          mutuos!inner(nome)
        `)
        .not('mutuo_id', 'is', null)
        .is('parcela_id', null)
        .is('mutuo_parcela_id', null)
        .is('medicao_id', null)
      if (error) throw error
      const out: AmortizacaoAvulsa[] = []
      const seen = new Set<string>()
      for (const row of (data ?? []) as any[]) {
        const conc = Array.isArray(row.conciliacoes) ? row.conciliacoes[0] : row.conciliacoes
        if (!conc) continue
        if (conc.company_id !== currentCompany.id) continue
        if (conc.status === 'rejeitado') continue
        const mov = Array.isArray(conc.movimentacoes_bancarias)
          ? conc.movimentacoes_bancarias[0]
          : conc.movimentacoes_bancarias
        if (!mov || mov.tipo !== 'saida') continue
        if (seen.has(mov.id)) continue
        seen.add(mov.id)
        const mut = Array.isArray(row.mutuos) ? row.mutuos[0] : row.mutuos
        out.push({
          id: mov.id,
          movimentacao_id: mov.id,
          mutuo_id: row.mutuo_id,
          mutuo_nome: mut?.nome ?? '—',
          data: mov.data,
          valor: Math.abs(Number(mov.valor || 0)),
          descricao: mov.descricao,
          conta_bancaria_id: mov.conta_id,
        })
      }
      return out.sort((a, b) => b.data.localeCompare(a.data))
    },
    enabled: !!currentCompany,
  })
}

export function useContasBancarias() {
  const { currentCompany } = useProject()
  const companyId = currentCompany?.id

  return useQuery({
    queryKey: ['contas_bancarias', companyId],
    queryFn: async () => {
      if (!companyId) return [] as ContaBancaria[]
      const { data, error } = await supabase
        .from('contas_bancarias')
        .select('*')
        .eq('company_id', companyId)
        .order('nome')
      if (error) throw error
      return (data ?? []) as ContaBancaria[]
    },
    enabled: !!companyId,
  })
}

export function useCreateContaBancaria() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async (conta: Partial<ContaBancaria>) => {
      if (!currentCompany) throw new Error('No company')
      const { data, error } = await supabase
        .from('contas_bancarias')
        .insert({ ...conta, company_id: currentCompany.id })
        .select()
        .single()
      if (error) throw error
      return data as ContaBancaria
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contas_bancarias'] })
      toast.success('Conta bancária criada')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateContaBancaria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ContaBancaria> & { id: string }) => {
      const { data, error } = await supabase
        .from('contas_bancarias')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as ContaBancaria
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contas_bancarias'] })
      toast.success('Conta bancária atualizada')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteContaBancaria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Check if conta has movimentações
      const { count, error: countErr } = await supabase
        .from('movimentacoes_bancarias')
        .select('id', { count: 'exact', head: true })
        .eq('conta_id', id)
      if (countErr) throw countErr
      if ((count ?? 0) > 0) {
        throw new Error(`Conta possui ${count} movimentações. Desative (inativar) ao invés de excluir.`)
      }
      const { error } = await supabase.from('contas_bancarias').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contas_bancarias'] })
      toast.success('Conta bancária excluída')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useEstornarParcela() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (parcelaId: string) => {
      const { data: parcela, error: fetchErr } = await supabase
        .from('parcelas')
        .select('*')
        .eq('id', parcelaId)
        .single()
      if (fetchErr) throw fetchErr

      const { error } = await supabase.from('parcelas').update({
        status: 'a_vencer',
        valor_pago: 0,
        data_pagamento_real: null,
        forma_pagamento: null,
        comprovante_path: null,
      }).eq('id', parcelaId)
      if (error) throw error

      // Audit log
      await supabase.from('audit_logs').insert({
        company_id: parcela.company_id,
        tabela: 'parcelas',
        acao: 'UPDATE',
        agente: 'humano',
        dados_antes: { operacao: 'estorno', id: parcelaId, status: parcela.status, valor_pago: parcela.valor_pago },
        dados_depois: { status: 'a_vencer', valor_pago: 0 },
      })

      return parcela
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['itens_compra'] })
      qc.invalidateQueries({ queryKey: ['movimentacoes'] })
      qc.invalidateQueries({ queryKey: ['dashboard-kpis'] })
      toast.success('Parcela estornada com sucesso')
    },
    onError: (err: Error) => toast.error('Erro ao estornar: ' + err.message),
  })
}

export function useConsolidarParcelas() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async ({ pedidoIds, parcelas: novasParcelas }: {
      pedidoIds: string[]
      parcelas: Array<{ valor: number; data_vencimento: string; numero_parcela: number }>
    }) => {
      if (!currentCompany) throw new Error('No company')
      const cid = currentCompany.id

      // 1. Soft-delete parcelas atuais dos pedidos
      const { error: delErr } = await supabase
        .from('parcelas')
        .update({ deleted_at: new Date().toISOString() })
        .in('pedido_id', pedidoIds)
        .neq('status', 'paga')
      if (delErr) throw delErr

      // 2. Criar parcelas consolidadas (pedido_id = null, com referência nos observacoes)
      const rows = novasParcelas.map(p => ({
        company_id: cid,
        pedido_id: null,
        numero_parcela: p.numero_parcela,
        valor: p.valor,
        data_vencimento: p.data_vencimento,
        status: 'futura',
        descricao: `Consolidado: ${pedidoIds.length} pedidos`,
        observacoes: JSON.stringify({ consolidado: true, pedido_ids: pedidoIds }),
      }))
      const { data, error: insErr } = await supabase.from('parcelas').insert(rows).select()
      if (insErr) throw insErr

      // 3. Audit log
      await supabase.from('audit_logs').insert({
        company_id: cid,
        tabela: 'parcelas',
        acao: 'INSERT',
        agente: 'humano',
        dados_depois: {
          operacao: 'consolidar_pedidos',
          pedido_ids: pedidoIds,
          parcelas_criadas: novasParcelas.length,
          valor_total: novasParcelas.reduce((s, p) => s + p.valor, 0),
        },
      })

      return data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      toast.success(`${vars.pedidoIds.length} pedidos consolidados com sucesso`)
    },
    onError: (err: Error) => toast.error('Erro na consolidação: ' + err.message),
  })
}

/** Hook para calcular saldo de contas bancárias (extrato vs sistema) */
export function useSaldoContas() {
  const { data: contas = [] } = useContasBancarias()
  const { data: movs = [] } = useMovimentacoes()

  return useMemo(() => {
    return contas.map(conta => {
      const contaMovs = movs.filter((m: any) => m.conta_id === conta.id)
      const totalEntradas = contaMovs.filter((m: any) => m.tipo === 'entrada').reduce((s, m: any) => s + Number(m.valor), 0)
      const totalSaidas = contaMovs.filter((m: any) => m.tipo === 'saida').reduce((s, m: any) => s + Number(m.valor), 0)
      const saldoSistema = conta.saldo_inicial + totalEntradas - totalSaidas

      // Último saldo do extrato (movimentação mais recente com saldo_acumulado)
      const lastMov = contaMovs
        .filter((m: any) => m.saldo_acumulado != null && Number(m.saldo_acumulado) !== 0)
        .sort((a: any, b: any) => (b.data ?? '').localeCompare(a.data ?? ''))[0]
      const saldoExtrato = lastMov ? Number((lastMov as any).saldo_acumulado) : null

      const conciliadas = contaMovs.filter((m: any) => m.conciliado).length
      const pendentes = contaMovs.filter((m: any) => !m.conciliado).length

      return {
        conta_id: conta.id,
        conta_nome: conta.nome,
        banco: conta.banco,
        saldo_inicial: conta.saldo_inicial,
        total_entradas: totalEntradas,
        total_saidas: totalSaidas,
        saldo_sistema: saldoSistema,
        saldo_extrato: saldoExtrato,
        diferenca: saldoExtrato != null ? saldoSistema - saldoExtrato : null,
        movimentacoes_total: contaMovs.length,
        conciliadas,
        pendentes,
      }
    })
  }, [contas, movs])
}

// Dashboard KPIs
export interface DashboardKPIs {
  totalOrcado: number
  totalConsumido: number
  totalPago: number
  saldoOrcamento: number
  percentualConsumido: number
  percentualPago: number
  parcelasVencidas: number
  parcelasAVencer: number
  valorVencido: number
  valorAVencer: number
  etapasTotal: number
  etapasAndamento: number
  etapasConcluidas: number
  faturamentoContrato: number
  custoContrato: number
  margemPrevista: number
  // Level 1/Level 2 coverage
  comPedido: number
  semPedido: number
  planejadoFirme: number
  planejadoBruto: number
  coberturaPercent: number
}

export function useDashboardKPIs() {
  const { currentCompany } = useProject()
  const companyId = currentCompany?.id

  return useQuery({
    queryKey: ['dashboard-kpis', companyId],
    queryFn: async (): Promise<DashboardKPIs> => {
      if (!companyId) throw new Error('No company')

      const [itensRes, parcelasRes, etapasRes, pedidosRes] = await Promise.all([
        supabase.from('itens_compra').select('id, valor_total_orcado, valor_consumido').eq('company_id', companyId).is('deleted_at', null),
        // pedidos.deleted_at não existe (filtro era no-op). Removido. Cancelados saem via status.
        supabase.from('parcelas').select('valor, data_vencimento, data_prevista_pagamento, data_pagamento_real, status, valor_pago, pedidos!inner(status, itens_compra(deleted_at))').eq('company_id', companyId).is('deleted_at', null),
        supabase.from('etapas').select('status').eq('company_id', companyId),
        // Filtra pedidos cancelados via status (não há soft-delete em pedidos).
        supabase.from('pedidos').select('item_compra_id, valor_total_real, status').eq('company_id', companyId),
      ])

      const itens = (itensRes.data ?? []) as Array<{ id: string; valor_total_orcado: number; valor_consumido: number }>
      const rawParcelas = (parcelasRes.data ?? []) as Array<any>
      // Exclui parcelas cujo item_compra está soft-deletado OU cujo pedido está cancelado
      const parcelas = rawParcelas
        .filter(p => !p.pedidos?.itens_compra?.deleted_at)
        .filter(p => p.pedidos?.status !== 'cancelado')
        .map(p => ({
          valor: p.valor, data_vencimento: p.data_vencimento, data_prevista_pagamento: p.data_prevista_pagamento, data_pagamento_real: p.data_pagamento_real, status: p.status, valor_pago: p.valor_pago
        })) as Array<{ valor: number; data_vencimento: string; data_prevista_pagamento: string | null; data_pagamento_real: string | null; status: string; valor_pago: number }>
      const etapas = (etapasRes.data ?? []) as Array<{ status: string }>
      const rawPedidos = (pedidosRes.data ?? []) as Array<any>

      // Conta apenas pedidos que mapeiam a itens ativos E não estão cancelados
      const validItemIds = new Set(itens.map(i => i.id));
      const pedidos = rawPedidos
        .filter(p => validItemIds.has(p.item_compra_id))
        .filter(p => p.status !== 'cancelado')

      const totalOrcado = itens.reduce((s, i) => s + (i.valor_total_orcado ?? 0), 0)
      const totalConsumido = pedidos.reduce((s, p) => s + (p.valor_total_real ?? 0), 0)
      const totalPago = parcelas.filter(p => p.status === 'paga').reduce((s, p) => s + (p.valor_pago ?? 0), 0)

      // Level 1/Level 2 coverage
      const pedidosPorItem = new Map<string, number>()
      for (const p of pedidos) {
        pedidosPorItem.set(p.item_compra_id, (pedidosPorItem.get(p.item_compra_id) ?? 0) + (p.valor_total_real ?? 0))
      }
      const comPedido = itens.reduce((s, i) => s + Math.min(pedidosPorItem.get(i.id) ?? 0, i.valor_total_orcado ?? 0), 0)
      const semPedido = Math.max(0, totalOrcado - comPedido)
      const planejadoFirme = Math.max(0, comPedido - totalConsumido)
      const planejadoBruto = semPedido
      const coberturaPercent = totalOrcado > 0 ? (comPedido / totalOrcado) * 100 : 0

      const today = new Date().toISOString().split('T')[0]
      const limit30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]!
      // Data efetiva: se ja paga, usa data_pagamento_real; senao, prevista_pagamento -> vencimento
      const efetiva = (p: { data_vencimento?: string | null; data_prevista_pagamento?: string | null; data_pagamento_real?: string | null }) =>
        p.data_pagamento_real || p.data_prevista_pagamento || p.data_vencimento || ''
      const vencidas = parcelas.filter((p) => p.status !== 'paga' && efetiva(p) < (today ?? ''))
      const aVencer = parcelas.filter((p) => p.status !== 'paga' && efetiva(p) >= (today ?? '') && efetiva(p) <= limit30)

      const faturamento = currentCompany?.faturamento_contrato ?? 0
      const custo = currentCompany?.custo_total_contrato ?? 0

      return {
        totalOrcado,
        totalConsumido,
        totalPago,
        saldoOrcamento: totalOrcado - totalConsumido,
        percentualConsumido: totalOrcado > 0 ? (totalConsumido / totalOrcado) * 100 : 0,
        percentualPago: totalOrcado > 0 ? (totalPago / totalOrcado) * 100 : 0,
        parcelasVencidas: vencidas.length,
        parcelasAVencer: aVencer.length,
        valorVencido: vencidas.reduce((s, p) => s + p.valor - p.valor_pago, 0),
        valorAVencer: aVencer.reduce((s, p) => s + p.valor - p.valor_pago, 0),
        etapasTotal: etapas.length,
        etapasAndamento: etapas.filter((e) => e.status === 'em_andamento').length,
        etapasConcluidas: etapas.filter((e) => e.status === 'concluido').length,
        faturamentoContrato: faturamento,
        custoContrato: custo,
        margemPrevista: faturamento > 0 ? ((faturamento - custo) / faturamento) * 100 : 0,
        comPedido,
        semPedido,
        planejadoFirme,
        planejadoBruto,
        coberturaPercent,
      }
    },
    enabled: !!companyId,
    refetchInterval: 60000,
  })
}

// ============================================================================
// F3.1 + F3.3: Orçamento Realizado — fonte de verdade única para o "consumido"
// ============================================================================
// Em vez de confiar no campo materializado itens_compra.valor_consumido (que
// depende de triggers e historicamente sai dessincronizado), este hook deriva
// quatro camadas a partir das fontes operacionais reais (pedidos + parcelas),
// excluindo cancelados e soft-deletes:
//
//   orcado       = itens_compra.valor_total_orcado                  (do orçamento)
//   comprometido = SUM(pedidos.valor_total_real) [não cancelados]   (todos pedidos vivos)
//   recebido     = SUM(pedidos.valor_total_real) status >= entregue (pedidos com NF)
//   pago         = SUM(parcelas.valor_pago) status = paga
//
// O alinhamento `valor_consumido_db` vs `comprometido` permite detectar
// divergências e mostrar banner pro operador (F4.4 health-check).

export interface ItemOrcamentoRealizado {
  item_id: string
  orcado: number
  comprometido: number
  recebido: number
  pago: number
  saldo: number               // orcado - comprometido
  valor_consumido_db: number  // o que está em itens_compra.valor_consumido
  divergente: boolean         // true se valor_consumido_db ≠ comprometido (tol R$0,01)
}

export interface OrcamentoRealizadoSnapshot {
  porItem: Map<string, ItemOrcamentoRealizado>
  totais: {
    orcado: number
    comprometido: number
    recebido: number
    pago: number
    saldo: number
  }
  divergencias: number  // quantidade de itens com valor_consumido_db ≠ comprometido
}

// (Antes existia STATUS_RECEBIDO aqui; com a migration split_pedidos_header_e_itens
// o "recebido" passou a ser derivado de pedido_itens.qtd_recebida, não do status.)

// ============================================================================
// F4.3: Reconciliação NF → Pedido → Parcela → Pagamento
// ============================================================================
// Objetivo: dado um período, mostrar cada NF aplicada e todas as suas
// derivações operacionais (pedido criado, parcelas geradas, pagamentos),
// destacando quebras de consistência:
//   - linha de NF sem pedido vinculado
//   - pedido criado por NF mas sem parcelas
//   - SUM(parcelas) ≠ valor_total_real do pedido
//   - parcela paga sem comprovante / conciliação

export interface ReconciliacaoParcela {
  id: string
  numero_parcela: number
  valor: number
  valor_pago: number
  status: string
  data_vencimento: string
  data_pagamento_real: string | null
}
export interface ReconciliacaoLinha {
  match_id: string
  ordem: number | null
  descricao_original: string
  quantidade: number | null
  valor_unitario: number | null
  valor_total: number | null
  acao: string
  item_compra_id: string | null
  pedido_criado_id: string | null
  pedido_substituido_id: string | null
  numero_pedido: string | null
  pedido_status: string | null
  pedido_valor_total: number | null
  parcelas: ReconciliacaoParcela[]
  total_parcelado: number
  total_pago: number
  inconsistencias: string[]
}
export interface ReconciliacaoNF {
  doc_id: string
  numero_doc: string | null
  serie: string | null
  data_emissao: string | null
  fornecedor_nome: string | null
  fornecedor_cnpj: string | null
  valor_total: number | null
  status: string | null
  applied_at: string | null
  linhas: ReconciliacaoLinha[]
  soma_linhas: number
  diferenca_nf: number
  inconsistencias: string[]
}

export function useReconciliacao(filtros?: { dataInicio?: string; dataFim?: string }) {
  const { currentCompany } = useProject()
  const companyId = currentCompany?.id
  return useQuery({
    queryKey: ['reconciliacao', companyId, filtros?.dataInicio, filtros?.dataFim],
    queryFn: async (): Promise<ReconciliacaoNF[]> => {
      if (!companyId) throw new Error('No company')
      // 1) NFs aplicadas no período (recepcao_docs)
      let q = supabase.from('recepcao_docs')
        .select('id, numero_doc, serie, data_emissao, fornecedor_nome, fornecedor_cnpj, valor_total, status, applied_at')
        .eq('company_id', companyId)
        .eq('status', 'aplicado')
        .order('data_emissao', { ascending: false })
      if (filtros?.dataInicio) q = q.gte('data_emissao', filtros.dataInicio)
      if (filtros?.dataFim) q = q.lte('data_emissao', filtros.dataFim)
      const { data: docs, error: docsErr } = await q
      if (docsErr) throw docsErr
      const docList = (docs ?? []) as any[]
      if (docList.length === 0) return []
      const docIds = docList.map(d => d.id)
      // 2) Matches dessas NFs
      const { data: matches, error: matchesErr } = await supabase.from('recepcao_matches')
        .select('id, doc_id, ordem, descricao_original, quantidade, valor_unitario, valor_total, acao, item_compra_id, pedido_criado_id, pedido_substituido_id')
        .in('doc_id', docIds)
      if (matchesErr) throw matchesErr
      const matchList = (matches ?? []) as any[]
      // 3) Pedidos referenciados
      const pedidoIds = Array.from(new Set(matchList.flatMap(m => [m.pedido_criado_id, m.pedido_substituido_id].filter(Boolean)))) as string[]
      const pedidosMap = new Map<string, { numero_pedido: string | null; status: string | null; valor_total_real: number | null }>()
      if (pedidoIds.length > 0) {
        const { data: peds } = await supabase.from('pedidos')
          .select('id, numero_pedido, status, valor_total_real')
          .in('id', pedidoIds)
        for (const p of (peds ?? []) as any[]) pedidosMap.set(p.id, p)
      }
      // 4) Parcelas dos pedidos
      const parcelasPorPedido = new Map<string, ReconciliacaoParcela[]>()
      if (pedidoIds.length > 0) {
        const { data: pars } = await supabase.from('parcelas')
          .select('id, pedido_id, numero_parcela, valor, valor_pago, status, data_vencimento, data_pagamento_real')
          .in('pedido_id', pedidoIds)
          .is('deleted_at', null)
        for (const par of (pars ?? []) as any[]) {
          const arr = parcelasPorPedido.get(par.pedido_id) ?? []
          arr.push({
            id: par.id, numero_parcela: par.numero_parcela, valor: par.valor, valor_pago: par.valor_pago ?? 0,
            status: par.status, data_vencimento: par.data_vencimento, data_pagamento_real: par.data_pagamento_real,
          })
          parcelasPorPedido.set(par.pedido_id, arr)
        }
      }
      // 5) Monta a estrutura final, computando inconsistências
      const matchesPorDoc = new Map<string, any[]>()
      for (const m of matchList) {
        const arr = matchesPorDoc.get(m.doc_id) ?? []
        arr.push(m)
        matchesPorDoc.set(m.doc_id, arr)
      }
      return docList.map(d => {
        const linhasRaw = matchesPorDoc.get(d.id) ?? []
        const linhas: ReconciliacaoLinha[] = linhasRaw.map(m => {
          const pedidoId = m.pedido_criado_id ?? m.pedido_substituido_id
          const ped = pedidoId ? pedidosMap.get(pedidoId) : undefined
          const parcelas = pedidoId ? (parcelasPorPedido.get(pedidoId) ?? []) : []
          const totalParcelado = parcelas.reduce((s, p) => s + (p.valor ?? 0), 0)
          const totalPago = parcelas.reduce((s, p) => s + (p.valor_pago ?? 0), 0)
          const inc: string[] = []
          if (m.acao !== 'ignorar' && m.acao !== 'criar_item' && !pedidoId) inc.push('linha sem pedido vinculado')
          if (pedidoId && ped && parcelas.length === 0) inc.push('pedido sem parcelas')
          if (pedidoId && ped && parcelas.length > 0 && ped.valor_total_real != null && Math.abs(totalParcelado - ped.valor_total_real) > 0.01) inc.push(`SUM(parcelas) ${totalParcelado.toFixed(2)} ≠ pedido ${ped.valor_total_real.toFixed(2)}`)
          return {
            match_id: m.id,
            ordem: m.ordem,
            descricao_original: m.descricao_original,
            quantidade: m.quantidade,
            valor_unitario: m.valor_unitario,
            valor_total: m.valor_total,
            acao: m.acao,
            item_compra_id: m.item_compra_id,
            pedido_criado_id: m.pedido_criado_id,
            pedido_substituido_id: m.pedido_substituido_id,
            numero_pedido: ped?.numero_pedido ?? null,
            pedido_status: ped?.status ?? null,
            pedido_valor_total: ped?.valor_total_real ?? null,
            parcelas,
            total_parcelado: totalParcelado,
            total_pago: totalPago,
            inconsistencias: inc,
          }
        })
        const somaLinhas = linhas.reduce((s, l) => s + (l.valor_total ?? 0), 0)
        const diferencaNf = (d.valor_total ?? 0) - somaLinhas
        const incDoc: string[] = []
        if (Math.abs(diferencaNf) > 0.01) incDoc.push(`Soma linhas ≠ total NF (${diferencaNf.toFixed(2)})`)
        if (linhas.some(l => l.inconsistencias.length > 0)) incDoc.push('linhas com inconsistência')
        return {
          doc_id: d.id, numero_doc: d.numero_doc, serie: d.serie, data_emissao: d.data_emissao,
          fornecedor_nome: d.fornecedor_nome, fornecedor_cnpj: d.fornecedor_cnpj,
          valor_total: d.valor_total, status: d.status, applied_at: d.applied_at,
          linhas, soma_linhas: somaLinhas, diferenca_nf: diferencaNf, inconsistencias: incDoc,
        }
      })
    },
    enabled: !!companyId,
  })
}

export function useOrcamentoRealizado() {
  const { currentCompany } = useProject()
  const companyId = currentCompany?.id
  return useQuery({
    queryKey: ['orcamento-realizado', companyId],
    queryFn: async (): Promise<OrcamentoRealizadoSnapshot> => {
      if (!companyId) throw new Error('No company')
      // Pós-migration split_pedidos_header_e_itens: soma vem de pedido_itens
      // (fonte granular). Cada pedido legacy tem 1 pedido_item (backfill), e
      // pedidos novos podem ter N — o cálculo continua correto em ambos.
      //
      // Notas:
      // - `pedidos.deleted_at` não existe (filtro legacy era no-op silencioso).
      //   Removido. Cancelamento é via status='cancelado'.
      // - `recebido` = SUM(qtd_recebida × valor_unitario_real) — reflete o
      //   consumo real por item, não mais derivado do status do pedido.
      //   Antes era binário (entregue+ contava 100%, senão 0); agora é proporcional.
      const [itensRes, pedidoItensRes, parcelasRes] = await Promise.all([
        supabase.from('itens_compra')
          .select('id, valor_total_orcado, valor_consumido')
          .eq('company_id', companyId).is('deleted_at', null),
        supabase.from('pedido_itens')
          .select(`
            item_compra_id, qtd, valor_unitario_real, valor_total_real, qtd_recebida,
            pedidos!inner(company_id, status)
          `)
          .eq('pedidos.company_id', companyId),
        supabase.from('parcelas')
          .select('valor_pago, status, pedidos!inner(company_id, item_compra_id, status)')
          .eq('company_id', companyId).is('deleted_at', null),
      ])
      const itens = (itensRes.data ?? []) as Array<{ id: string; valor_total_orcado: number; valor_consumido: number }>
      const pedidoItens = (pedidoItensRes.data ?? []) as Array<any>
      const parcelas = (parcelasRes.data ?? []) as Array<any>

      const porItem = new Map<string, ItemOrcamentoRealizado>()
      // Inicializa com os itens vivos (mesmo sem pedidos)
      for (const it of itens) {
        porItem.set(it.id, {
          item_id: it.id,
          orcado: it.valor_total_orcado ?? 0,
          comprometido: 0,
          recebido: 0,
          pago: 0,
          saldo: it.valor_total_orcado ?? 0,
          valor_consumido_db: it.valor_consumido ?? 0,
          divergente: false,
        })
      }
      // Soma pedido_itens em pedidos não cancelados:
      //   comprometido = valor_total_real do item
      //   recebido = qtd_recebida × valor_unitario_real (proporcional ao consumo real)
      for (const pi of pedidoItens) {
        const ped = pi.pedidos
        if (!ped || ped.status === 'cancelado') continue
        const linha = porItem.get(pi.item_compra_id)
        if (!linha) continue
        // fora_orcamento: sobra de "Consumir previsão" com estouro permitido. Não infla comprometido.
        const foraOrcamento = (pi as { fora_orcamento?: boolean }).fora_orcamento === true
        if (!foraOrcamento) linha.comprometido += Number(pi.valor_total_real ?? 0)
        const qtdRec = Number(pi.qtd_recebida ?? 0)
        const vu = Number(pi.valor_unitario_real ?? 0)
        linha.recebido += qtdRec * vu
      }
      // Pago: parcelas pagas de pedidos não cancelados, agrupadas pelo item legacy do pedido
      // (na Fase 4 isso vira proporcional por item — mas hoje cada pedido tem 1 item dominante).
      for (const par of parcelas) {
        const ped = par.pedidos
        if (!ped || ped.status === 'cancelado') continue
        if (par.status !== 'paga') continue
        const linha = porItem.get(ped.item_compra_id)
        if (!linha) continue
        linha.pago += par.valor_pago ?? 0
      }
      // Finaliza saldo e flag de divergência
      let divergencias = 0
      const totais = { orcado: 0, comprometido: 0, recebido: 0, pago: 0, saldo: 0 }
      for (const linha of porItem.values()) {
        linha.saldo = linha.orcado - linha.comprometido
        linha.divergente = Math.abs(linha.valor_consumido_db - linha.comprometido) > 0.01
        if (linha.divergente) divergencias++
        totais.orcado += linha.orcado
        totais.comprometido += linha.comprometido
        totais.recebido += linha.recebido
        totais.pago += linha.pago
      }
      totais.saldo = totais.orcado - totais.comprometido
      return { porItem, totais, divergencias }
    },
    enabled: !!companyId,
    refetchInterval: 60000,
  })
}
