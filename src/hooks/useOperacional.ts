import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { toast } from 'sonner'

// ─── AVANÇOS ──────────────────────────────────────────
export interface Avanco {
  id: string
  company_id: string
  etapa_id: string
  data_registro: string
  casas_concluidas: number
  registrado_por: string | null
  observacoes: string | null
  fotos: string[] | null
  created_at: string
  // joined
  etapa_nome?: string
  etapa_codigo?: string
}

export function useAvancos() {
  const { currentCompany } = useProject()
  return useQuery({
    queryKey: ['avancos', currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany) return []
      const { data, error } = await supabase
        .from('avancos')
        .select('*, etapas(nome, codigo)')
        .eq('company_id', currentCompany.id)
        .order('data_registro', { ascending: false })
      if (error) throw error
      return (data ?? []).map((a: Record<string, unknown>) => {
        const etapa = a.etapas as Record<string, string> | null
        return { ...a, etapa_nome: etapa?.nome, etapa_codigo: etapa?.codigo }
      }) as Avanco[]
    },
    enabled: !!currentCompany,
  })
}

export function useCreateAvanco() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()
  return useMutation({
    mutationFn: async (avanco: Partial<Avanco>) => {
      if (!currentCompany) throw new Error('No company')
      const { data, error } = await supabase
        .from('avancos')
        .insert({ ...avanco, company_id: currentCompany.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['avancos'] })
      qc.invalidateQueries({ queryKey: ['cronograma_distribuicao'] })
      qc.invalidateQueries({ queryKey: ['medicoes'] })
      toast.success('Avanço registrado')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ─── MEDIÇÕES ─────────────────────────────────────────
export interface Medicao {
  id: string
  company_id: string
  numero: number
  valor_planejado: number
  data_prevista: string
  data_liberacao: string | null
  valor_liberado: number
  status: 'futura' | 'em_medicao' | 'liberada' | 'paga'
  percentual_fisico_meta: number
  percentual_fisico_real: number
  observacoes: string | null
  created_at: string
}

export function useMedicoes() {
  const { currentCompany } = useProject()
  return useQuery({
    queryKey: ['medicoes', currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany) return []
      const { data, error } = await supabase
        .from('medicoes')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('numero')
      if (error) throw error
      return (data ?? []) as Medicao[]
    },
    enabled: !!currentCompany,
  })
}

export function useCreateMedicao() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()
  return useMutation({
    mutationFn: async (m: Partial<Medicao>) => {
      if (!currentCompany) throw new Error('No company')
      const { data, error } = await supabase
        .from('medicoes')
        .insert({ ...m, company_id: currentCompany.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['medicoes'] })
      qc.invalidateQueries({ queryKey: ['medicao_parcelas'] })
      qc.invalidateQueries({ queryKey: ['cronograma_distribuicao'] })
      qc.invalidateQueries({ queryKey: ['conciliacoes'] })
      qc.invalidateQueries({ queryKey: ['conciliacao-links'] })
      toast.success('Medição criada')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateMedicao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Medicao> & { id: string }) => {
      const { data, error } = await supabase.from('medicoes').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['medicoes'] })
      qc.invalidateQueries({ queryKey: ['medicao_parcelas'] })
      qc.invalidateQueries({ queryKey: ['cronograma_distribuicao'] })
      qc.invalidateQueries({ queryKey: ['conciliacoes'] })
      qc.invalidateQueries({ queryKey: ['conciliacao-links'] })
      toast.success('Medição atualizada')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteMedicao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, company_id, numero }: { id: string; company_id: string; numero: number }) => {
      const { count, error: cErr } = await supabase
        .from('conciliacao_parcelas')
        .select('id', { count: 'exact', head: true })
        .eq('medicao_id', id)
      if (cErr) throw cErr
      if ((count ?? 0) > 0) {
        throw new Error(`Medição vinculada a ${count} conciliação(ões) — desfaça antes de excluir.`)
      }

      const { error: dErr } = await supabase
        .from('cronograma_distribuicao')
        .delete()
        .eq('company_id', company_id)
        .eq('medicao_numero', numero)
      if (dErr) throw dErr

      const { error: mErr } = await supabase.from('medicoes').delete().eq('id', id)
      if (mErr) throw mErr
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['medicoes'] })
      qc.invalidateQueries({ queryKey: ['medicao_parcelas'] })
      qc.invalidateQueries({ queryKey: ['cronograma_distribuicao'] })
      qc.invalidateQueries({ queryKey: ['conciliacoes'] })
      qc.invalidateQueries({ queryKey: ['conciliacao-links'] })
      toast.success('Medição excluída')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ─── MOVIMENTAÇÕES BANCÁRIAS ──────────────────────────
export interface Movimentacao {
  id: string
  company_id: string
  conta_id: string
  data: string
  descricao: string
  valor: number
  tipo: 'entrada' | 'saida' | 'transferencia' | 'ajuste'
  categoria: string | null
  parcela_id: string | null
  conciliado: boolean
  conciliado_em: string | null
  observacao: string | null
  created_at: string
}

export function useMovimentacoes() {
  const { currentCompany } = useProject()
  return useQuery({
    queryKey: ['movimentacoes', currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany) return []
      const { data, error } = await supabase
        .from('movimentacoes_bancarias')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('data', { ascending: false })
      if (error) throw error
      return (data ?? []) as Movimentacao[]
    },
    enabled: !!currentCompany,
  })
}

export function useCreateMovimentacao() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()
  return useMutation({
    mutationFn: async (m: Partial<Movimentacao>) => {
      if (!currentCompany) throw new Error('No company')
      const { data, error } = await supabase
        .from('movimentacoes_bancarias')
        .insert({ ...m, company_id: currentCompany.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['movimentacoes'] }); toast.success('Movimentação registrada') },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateMovimentacao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Movimentacao> & { id: string }) => {
      const { data, error } = await supabase.from('movimentacoes_bancarias').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['movimentacoes'] }); toast.success('Movimentação atualizada') },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ─── CENÁRIOS (SIMULADOR) ─────────────────────────────
export interface Cenario {
  id: string
  company_id: string
  nome: string
  descricao: string | null
  ativo: boolean
  criado_por: string | null
  created_at: string
}

export interface CenarioAjuste {
  id: string
  company_id: string
  cenario_id: string
  tipo_ajuste: string
  referencia_id: string | null
  campo_alterado: string
  valor_original: string | null
  valor_novo: string
  justificativa: string | null
  created_at: string
}

export function useCenarios() {
  const { currentCompany } = useProject()
  return useQuery({
    queryKey: ['cenarios', currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany) return []
      const { data, error } = await supabase
        .from('cenarios')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Cenario[]
    },
    enabled: !!currentCompany,
  })
}

export function useCreateCenario() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()
  return useMutation({
    mutationFn: async (c: Partial<Cenario>) => {
      if (!currentCompany) throw new Error('No company')
      const { data, error } = await supabase
        .from('cenarios')
        .insert({ ...c, company_id: currentCompany.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cenarios'] }); toast.success('Cenário criado') },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ─── AUDIT LOGS ───────────────────────────────────────
export interface AuditLog {
  id: string
  company_id: string
  tabela: string
  registro_id: string
  acao: string
  agente: string | null
  usuario_id: string | null
  user_email: string | null
  resumo: string | null
  dados_antes: Record<string, unknown> | null
  dados_depois: Record<string, unknown> | null
  created_at: string
}

export function useAuditLogs() {
  const { currentCompany } = useProject()
  return useQuery({
    queryKey: ['audit_logs', currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany) return []
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as AuditLog[]
    },
    enabled: !!currentCompany,
  })
}


export interface Distribuicao {
  id: string
  company_id: string
  etapa_id: string
  medicao_numero: number
  casas_planejadas: number
  data_inicio: string | null
  data_fim: string | null
  casas_realizadas: number
  valor_liberado_faturamento?: number | null
}

export function useDistribuicao() {
  const { currentCompany } = useProject()
  const cid = currentCompany?.id
  return useQuery({
    queryKey: ['cronograma_distribuicao', cid],
    queryFn: async () => {
      if (!cid) return []
      const { data, error } = await supabase
        .from('cronograma_distribuicao')
        .select('*')
        .eq('company_id', cid)
        .order('medicao_numero')
      if (error) throw error
      return (data ?? []) as Distribuicao[]
    },
    enabled: !!cid,
  })
}

export function useCreateDistribuicao() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()
  return useMutation({
    mutationFn: async (d: Partial<Distribuicao>) => {
      if (!currentCompany) throw new Error('No company')
      const { data, error } = await supabase
        .from('cronograma_distribuicao')
        .insert({ ...d, company_id: currentCompany.id })
        .select()
        .single()
      if (error) throw error
      return data as Distribuicao
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cronograma_distribuicao'] })
      qc.invalidateQueries({ queryKey: ['medicoes'] })
      qc.invalidateQueries({ queryKey: ['medicao_parcelas'] })
      toast.success('Distribuição criada')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateDistribuicao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Distribuicao> & { id: string }) => {
      const { data, error } = await supabase
        .from('cronograma_distribuicao')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Distribuicao
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cronograma_distribuicao'] })
      qc.invalidateQueries({ queryKey: ['medicoes'] })
      qc.invalidateQueries({ queryKey: ['medicao_parcelas'] })
      toast.success('Distribuição atualizada')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteDistribuicao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: row } = await supabase.from('cronograma_distribuicao').select('company_id, etapa_id').eq('id', id).single()
      const { error } = await supabase.from('cronograma_distribuicao').delete().eq('id', id)
      if (error) throw error
      if (row) {
        const { data: { user } } = await supabase.auth.getUser()
        await supabase.from('audit_logs').insert({
          user_id: user?.id, company_id: row.company_id,
          acao: 'DELETE', tabela: 'cronograma_distribuicao', registro_id: id,
          dados: { etapa_id: row.etapa_id },
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cronograma_distribuicao'] })
      qc.invalidateQueries({ queryKey: ['medicoes'] })
      qc.invalidateQueries({ queryKey: ['medicao_parcelas'] })
      toast.success('Distribuição removida')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
