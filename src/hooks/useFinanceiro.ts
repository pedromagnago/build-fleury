import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { toast } from 'sonner'

export interface Parcela {
  id: string
  company_id: string
  pedido_id: string | null
  despesa_indireta_id: string | null
  numero_parcela: number
  valor: number
  data_vencimento: string
  data_pagamento_real: string | null
  valor_pago: number
  forma_pagamento: string | null
  conta_bancaria_id: string | null
  status: 'futura' | 'a_vencer' | 'paga' | 'vencida' | 'parcialmente_paga'
  comprovante_path: string | null
  deleted_at: string | null
  created_at: string
  // Joined
  pedido_item?: string
  item_compra_id?: string | null
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
      const { data, error } = await supabase
        .from('parcelas')
        .select('*, pedidos(item_compra_id, itens_compra(descricao, deleted_at)), despesas_indiretas(descricao, categoria, deleted_at)')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('data_vencimento', { ascending: true })

      if (error) throw error
      return (data ?? [])
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
        const item = pedido?.itens_compra as Record<string, string> | null
        const despesa = p.despesas_indiretas as Record<string, string> | null
        return { 
          ...p, 
          pedido_item: item?.descricao ?? despesa?.descricao ?? null,
          item_compra_id: (pedido?.item_compra_id as string) ?? null
        }
      }) as Parcela[]
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

export function useContasBancarias() {
  const { currentCompany } = useProject()
  const companyId = currentCompany?.id

  return useQuery({
    queryKey: ['contas_bancarias', companyId],
    queryFn: async () => {
      if (!companyId) return []
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

// Dashboard KPIs
export interface DashboardKPIs {
  totalOrcado: number
  totalConsumido: number
  saldoOrcamento: number
  percentualConsumido: number
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
        supabase.from('parcelas').select('valor, data_vencimento, status, valor_pago, pedidos!inner(itens_compra(deleted_at))').eq('company_id', companyId).is('deleted_at', null),
        supabase.from('etapas').select('status').eq('company_id', companyId),
        supabase.from('pedidos').select('item_compra_id, valor_total_real').eq('company_id', companyId),
      ])

      const itens = (itensRes.data ?? []) as Array<{ id: string; valor_total_orcado: number; valor_consumido: number }>
      const rawParcelas = (parcelasRes.data ?? []) as Array<any>
      const parcelas = rawParcelas.filter(p => !p.pedidos?.itens_compra?.deleted_at).map(p => ({
        valor: p.valor, data_vencimento: p.data_vencimento, status: p.status, valor_pago: p.valor_pago
      })) as Array<{ valor: number; data_vencimento: string; status: string; valor_pago: number }>
      const etapas = (etapasRes.data ?? []) as Array<{ status: string }>
      const rawPedidos = (pedidosRes.data ?? []) as Array<any>
      
      const totalOrcado = itens.reduce((s, i) => s + (i.valor_total_orcado ?? 0), 0)
      const totalConsumido = itens.reduce((s, i) => s + (i.valor_consumido ?? 0), 0)

      // Only count pedidos logic that map to active items
      const validItemIds = new Set(itens.map(i => i.id));
      const pedidos = rawPedidos.filter(p => validItemIds.has(p.item_compra_id))

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
      const vencidas = parcelas.filter((p) => p.status !== 'paga' && p.data_vencimento < (today ?? ''))
      const aVencer = parcelas.filter((p) => p.status !== 'paga' && p.data_vencimento >= (today ?? '') && p.data_vencimento <= new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]!)

      const faturamento = currentCompany?.faturamento_contrato ?? 0
      const custo = currentCompany?.custo_total_contrato ?? 0

      return {
        totalOrcado,
        totalConsumido,
        saldoOrcamento: totalOrcado - totalConsumido,
        percentualConsumido: totalOrcado > 0 ? (totalConsumido / totalOrcado) * 100 : 0,
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
