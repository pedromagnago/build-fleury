/**
 * useAcordos — renegociação de parcelas (plano de pagamento consolidado).
 *
 * Um acordo agrupa o saldo aberto de N parcelas originais (de NFs/pedidos
 * distintos) num cronograma novo. As originais ficam status='renegociada'
 * (fora do fluxo projetado); as parcelas do acordo são parcelas reais em
 * `parcelas` (acordo_id preenchido) — conciliáveis e projetáveis normalmente.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { toast } from 'sonner'

export interface AcordoParcela {
  id: string
  numero_parcela: number
  valor: number
  valor_pago: number
  status: string
  data_vencimento: string
  data_prevista_pagamento: string | null
  deleted_at: string | null
}

export interface AcordoOrigem {
  id: string
  parcela_id: string
  valor_renegociado: number
  status_anterior: string
  parcela?: {
    numero_parcela: number
    descricao: string | null
    valor: number
    valor_pago: number
    pedido_id: string | null
    nf_origem_id: string | null
  } | null
}

export interface Acordo {
  id: string
  company_id: string
  nome: string
  fornecedor_id: string | null
  fornecedor_nome: string | null
  data_acordo: string
  valor_total: number
  status: 'ativo' | 'quitado' | 'cancelado'
  observacoes: string | null
  created_at: string
  parcelas: AcordoParcela[]
  origens: AcordoOrigem[]
}

export function useAcordos() {
  const { currentCompany } = useProject()
  const companyId = currentCompany?.id

  return useQuery({
    queryKey: ['acordos', companyId],
    queryFn: async (): Promise<Acordo[]> => {
      if (!companyId) return []
      const { data, error } = await supabase
        .from('acordos')
        .select(`
          *,
          parcelas(id, numero_parcela, valor, valor_pago, status, data_vencimento, data_prevista_pagamento, deleted_at),
          acordo_origens(id, parcela_id, valor_renegociado, status_anterior, parcelas(numero_parcela, descricao, valor, valor_pago, pedido_id, nf_origem_id))
        `)
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((a: any) => ({
        ...a,
        valor_total: Number(a.valor_total),
        parcelas: ((a.parcelas ?? []) as any[])
          .filter(p => !p.deleted_at)
          .map(p => ({ ...p, valor: Number(p.valor), valor_pago: Number(p.valor_pago || 0) }))
          .sort((x, y) => x.numero_parcela - y.numero_parcela),
        origens: ((a.acordo_origens ?? []) as any[]).map(o => ({
          id: o.id,
          parcela_id: o.parcela_id,
          valor_renegociado: Number(o.valor_renegociado),
          status_anterior: o.status_anterior,
          parcela: o.parcelas ?? null,
        })),
      })) as Acordo[]
    },
    enabled: !!companyId,
  })
}

// Toda mutação de acordo mexe em parcelas + fluxo + equações — invalida o set completo.
function invalidateFinanceiro(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ['acordos', 'parcelas', 'pedidos', 'conciliacoes', 'conciliacao-links', 'movimentacoes', 'dashboard-kpis', 'orcamento-realizado']) {
    qc.invalidateQueries({ queryKey: [key] })
  }
}

export interface CriarAcordoInput {
  nome: string
  parcelaIds: string[]
  cronograma: Array<{ valor: number; data_vencimento: string }>
  fornecedorNome?: string | null
  fornecedorId?: string | null
  observacoes?: string | null
}

export function useCriarAcordo() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async (input: CriarAcordoInput) => {
      if (!currentCompany) throw new Error('Nenhuma empresa selecionada')
      const { data, error } = await supabase.rpc('criar_acordo', {
        p_company_id: currentCompany.id,
        p_nome: input.nome,
        p_parcela_ids: input.parcelaIds,
        p_cronograma: input.cronograma,
        p_fornecedor_nome: input.fornecedorNome ?? null,
        p_fornecedor_id: input.fornecedorId ?? null,
        p_observacoes: input.observacoes ?? null,
      })
      if (error) throw error
      return data as { acordo_id: string; valor_total: number; parcelas_renegociadas: number; parcelas_criadas: number }
    },
    onSuccess: (res) => {
      invalidateFinanceiro(qc)
      toast.success(`Acordo criado: ${res.parcelas_renegociadas} parcela(s) renegociada(s) em ${res.parcelas_criadas} nova(s)`)
    },
    onError: (err: Error) => toast.error('Erro ao criar acordo: ' + err.message),
  })
}

export function useCancelarAcordo() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (acordoId: string) => {
      const { data, error } = await supabase.rpc('cancelar_acordo', { p_acordo_id: acordoId })
      if (error) throw error
      return data as { acordo_id: string; parcelas_restauradas: number }
    },
    onSuccess: (res) => {
      invalidateFinanceiro(qc)
      toast.success(`Acordo cancelado — ${res.parcelas_restauradas} parcela(s) original(is) restaurada(s)`)
    },
    onError: (err: Error) => toast.error('Erro ao cancelar acordo: ' + err.message),
  })
}
