import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { toast } from 'sonner'

export interface Etapa {
  id: string
  company_id: string
  codigo: string
  nome: string
  ordem: number
  data_inicio_plan: string | null
  data_fim_plan: string | null
  data_inicio_real: string | null
  data_fim_real: string | null
  casas_total: number
  valor_total_orcado: number
  faturamento_valor_total?: number | null
  faturamento_preco_unitario?: number | null
  status: 'futuro' | 'em_andamento' | 'concluido' | 'atrasado'
  depende_de: string | null
  observacoes: string | null
  created_at: string
}

export type EtapaInsert = Omit<Etapa, 'id' | 'created_at' | 'company_id'> & { company_id?: string }

export function useEtapas() {
  const { currentCompany } = useProject()
  const companyId = currentCompany?.id

  return useQuery({
    queryKey: ['etapas', companyId],
    queryFn: async () => {
      if (!companyId) return []
      const { data, error } = await supabase
        .from('etapas')
        .select('*')
        .eq('company_id', companyId)
        .order('ordem', { ascending: true })

      if (error) throw error
      return (data ?? []) as Etapa[]
    },
    enabled: !!companyId,
  })
}

export function useCreateEtapa() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async (etapa: Partial<EtapaInsert>) => {
      if (!currentCompany) throw new Error('No company selected')
      const { data, error } = await supabase
        .from('etapas')
        .insert({ ...etapa, company_id: currentCompany.id })
        .select()
        .single()

      if (error) throw error
      return data as Etapa
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['etapas'] })
      toast.success('Etapa criada com sucesso')
    },
    onError: (err: Error) => {
      toast.error('Erro ao criar etapa: ' + err.message)
    },
  })
}

export function useUpdateEtapa() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Etapa> & { id: string }) => {
      const { data, error } = await supabase
        .from('etapas')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as Etapa
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['etapas'] })
      toast.success('Etapa atualizada')
    },
    onError: (err: Error) => {
      toast.error('Erro ao atualizar: ' + err.message)
    },
  })
}

export function useDeleteEtapa() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: row } = await supabase.from('etapas').select('company_id, nome').eq('id', id).single()
      const { error } = await supabase.from('etapas').delete().eq('id', id)
      if (error) throw error
      if (row) {
        const { data: { user } } = await supabase.auth.getUser()
        await supabase.from('audit_logs').insert({
          user_id: user?.id, company_id: row.company_id,
          acao: 'DELETE', tabela: 'etapas', registro_id: id,
          dados: { nome: row.nome },
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['etapas'] })
      toast.success('Etapa removida')
    },
    onError: (err: Error) => {
      toast.error('Erro ao remover: ' + err.message)
    },
  })
}
