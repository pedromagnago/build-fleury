import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { toast } from 'sonner'

export interface Adiantamento {
  id: string
  company_id: string
  pedido_id: string
  fornecedor_id: string | null
  valor: number
  data_pagamento: string | null
  data_prevista_abatimento: string | null
  valor_abatido: number
  status: 'pendente' | 'parcialmente_abatido' | 'abatido'
  conta_bancaria_id: string | null
  forma_pagamento: string | null
  observacao: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  // Joined
  fornecedor?: { id: string; nome: string } | null
  pedido?: {
    id: string
    numero_pedido: number | null
    fornecedor_id: string | null
    fornecedores?: { nome: string } | null
  } | null
}

export interface AdiantamentoInsert {
  pedido_id: string
  fornecedor_id?: string | null
  valor: number
  data_pagamento?: string | null
  data_prevista_abatimento?: string | null
  conta_bancaria_id?: string | null
  forma_pagamento?: string | null
  observacao?: string | null
}

export interface AdiantamentoUpdate {
  fornecedor_id?: string | null
  valor?: number
  data_pagamento?: string | null
  data_prevista_abatimento?: string | null
  valor_abatido?: number
  conta_bancaria_id?: string | null
  forma_pagamento?: string | null
  observacao?: string | null
}

const QUERY_KEY = 'adiantamentos'

const INVALIDATE_KEYS = [
  QUERY_KEY,
  'conciliacoes',
  'movimentacoes',
  'parcelas',
  'pedidos',
]

export function useAdiantamentos() {
  const { currentCompany } = useProject()
  const companyId = currentCompany?.id

  return useQuery({
    queryKey: [QUERY_KEY, companyId],
    queryFn: async () => {
      if (!companyId) return [] as Adiantamento[]
      const { data, error } = await supabase
        .from('adiantamentos')
        .select(`
          *,
          fornecedor:fornecedores(id, nome),
          pedido:pedidos(
            id, numero_pedido, fornecedor_id,
            fornecedores(nome)
          )
        `)
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Adiantamento[]
    },
    enabled: !!companyId,
    staleTime: 30_000,
  })
}

export function useCreateAdiantamento() {
  const { currentCompany } = useProject()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: AdiantamentoInsert) => {
      const companyId = currentCompany?.id
      if (!companyId) throw new Error('Sem projeto selecionado')
      const { data, error } = await supabase
        .from('adiantamentos')
        .insert({ ...input, company_id: companyId })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      INVALIDATE_KEYS.forEach(k => qc.invalidateQueries({ queryKey: [k] }))
      toast.success('Adiantamento registrado')
    },
    onError: (err: Error) => toast.error('Erro ao registrar: ' + err.message),
  })
}

export function useUpdateAdiantamento() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...patch }: AdiantamentoUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('adiantamentos')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      INVALIDATE_KEYS.forEach(k => qc.invalidateQueries({ queryKey: [k] }))
      toast.success('Adiantamento atualizado')
    },
    onError: (err: Error) => toast.error('Erro ao atualizar: ' + err.message),
  })
}

export function useDeleteAdiantamento() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('adiantamentos')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      INVALIDATE_KEYS.forEach(k => qc.invalidateQueries({ queryKey: [k] }))
      toast.success('Adiantamento excluído')
    },
    onError: (err: Error) => toast.error('Erro ao excluir: ' + err.message),
  })
}

/** Abate um adiantamento: incrementa valor_abatido (trigger recalcula status) */
export function useAbaterAdiantamento() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, valorAbatimento }: { id: string; valorAbatimento: number }) => {
      // Lê o valor_abatido atual e soma
      const { data: atual, error: errLer } = await supabase
        .from('adiantamentos')
        .select('valor_abatido')
        .eq('id', id)
        .single()
      if (errLer) throw errLer
      const novoAbatido = (Number(atual.valor_abatido) || 0) + valorAbatimento
      const { data, error } = await supabase
        .from('adiantamentos')
        .update({ valor_abatido: novoAbatido })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      INVALIDATE_KEYS.forEach(k => qc.invalidateQueries({ queryKey: [k] }))
      toast.success('Abatimento registrado')
    },
    onError: (err: Error) => toast.error('Erro no abatimento: ' + err.message),
  })
}
