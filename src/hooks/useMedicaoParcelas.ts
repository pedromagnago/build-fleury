import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { toast } from 'sonner'

export interface MedicaoParcela {
  id: string
  company_id: string
  medicao_id: string
  numero_parcela: number
  valor: number
  data_vencimento: string
  data_prevista_recebimento: string | null
  data_recebimento_real: string | null
  valor_recebido: number
  status: 'futura' | 'a_receber' | 'recebida' | 'vencida' | 'parcialmente_recebida'
  forma_recebimento: string | null
  conta_bancaria_id: string | null
  observacao: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  // Joined
  medicao?: {
    id: string
    numero: number
    valor_planejado: number
    valor_liberado: number
    data_prevista: string
    status: string
  } | null
}

export interface MedicaoParcelaInsert {
  medicao_id: string
  numero_parcela?: number
  valor: number
  data_vencimento: string
  data_prevista_recebimento?: string | null
  forma_recebimento?: string | null
  conta_bancaria_id?: string | null
  observacao?: string | null
}

export interface MedicaoParcelaUpdate {
  numero_parcela?: number
  valor?: number
  data_vencimento?: string
  data_prevista_recebimento?: string | null
  data_recebimento_real?: string | null
  valor_recebido?: number
  forma_recebimento?: string | null
  conta_bancaria_id?: string | null
  observacao?: string | null
}

const QUERY_KEY = 'medicao_parcelas'

const INVALIDATE_KEYS = [
  QUERY_KEY,
  'medicoes',
  'conciliacoes',
  'movimentacoes',
]

export function useMedicaoParcelas(medicaoId?: string) {
  const { currentCompany } = useProject()
  const companyId = currentCompany?.id

  return useQuery({
    queryKey: [QUERY_KEY, companyId, medicaoId],
    queryFn: async () => {
      if (!companyId) return [] as MedicaoParcela[]
      let q = supabase
        .from('medicao_parcelas')
        .select(`
          *,
          medicao:medicoes(
            id, numero, valor_planejado, valor_liberado,
            data_prevista, status
          )
        `)
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('data_vencimento', { ascending: true })

      if (medicaoId) q = q.eq('medicao_id', medicaoId)

      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as MedicaoParcela[]
    },
    enabled: !!companyId,
    staleTime: 30_000,
  })
}

export function useCreateMedicaoParcela() {
  const { currentCompany } = useProject()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: MedicaoParcelaInsert) => {
      const companyId = currentCompany?.id
      if (!companyId) throw new Error('Sem projeto selecionado')
      const { data, error } = await supabase
        .from('medicao_parcelas')
        .insert({ ...input, company_id: companyId })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      INVALIDATE_KEYS.forEach(k => qc.invalidateQueries({ queryKey: [k] }))
      toast.success('Parcela de recebimento criada')
    },
    onError: (err: Error) => toast.error('Erro ao criar: ' + err.message),
  })
}

export function useUpdateMedicaoParcela() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...patch }: MedicaoParcelaUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('medicao_parcelas')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      INVALIDATE_KEYS.forEach(k => qc.invalidateQueries({ queryKey: [k] }))
      toast.success('Parcela atualizada')
    },
    onError: (err: Error) => toast.error('Erro ao atualizar: ' + err.message),
  })
}

export function useDeleteMedicaoParcela() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('medicao_parcelas')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      INVALIDATE_KEYS.forEach(k => qc.invalidateQueries({ queryKey: [k] }))
      toast.success('Parcela excluída')
    },
    onError: (err: Error) => toast.error('Erro ao excluir: ' + err.message),
  })
}

/** Registra recebimento: incrementa valor_recebido (trigger recalcula status) */
export function useRegistrarRecebimento() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      valorRecebimento,
      dataRecebimento,
      formaRecebimento,
      contaBancariaId,
    }: {
      id: string
      valorRecebimento: number
      dataRecebimento?: string
      formaRecebimento?: string
      contaBancariaId?: string
    }) => {
      const { data: atual, error: errLer } = await supabase
        .from('medicao_parcelas')
        .select('valor_recebido')
        .eq('id', id)
        .single()
      if (errLer) throw errLer

      const novoRecebido = (Number(atual.valor_recebido) || 0) + valorRecebimento
      const { data, error } = await supabase
        .from('medicao_parcelas')
        .update({
          valor_recebido: novoRecebido,
          ...(dataRecebimento ? { data_recebimento_real: dataRecebimento } : {}),
          ...(formaRecebimento ? { forma_recebimento: formaRecebimento } : {}),
          ...(contaBancariaId ? { conta_bancaria_id: contaBancariaId } : {}),
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      INVALIDATE_KEYS.forEach(k => qc.invalidateQueries({ queryKey: [k] }))
      toast.success('Recebimento registrado')
    },
    onError: (err: Error) => toast.error('Erro no recebimento: ' + err.message),
  })
}
