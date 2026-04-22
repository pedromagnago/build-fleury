import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { toast } from 'sonner'

export interface Mutuo {
  id: string
  company_id: string
  nome: string
  tipo: 'MÚTUO' | 'EMPRÉSTIMO' | 'FINANCIAMENTO' | 'CARTÃO' | 'OUTRO'
  categoria: string
  instituicao: string | null
  fornecedor_id: string | null
  valor_captado: number
  data_captacao: string
  taxa_juros_mensal: number
  observacoes: string | null
  status: 'ativo' | 'quitado' | 'inadimplente'
  created_at: string
  updated_at: string
  parcelas?: MutuoParcela[]
  fornecedor?: { id: string; nome: string } | null
}

export interface MutuoParcela {
  id: string
  company_id: string
  mutuo_id: string
  numero_parcela: number
  valor: number
  data_vencimento: string
  data_pagamento_real: string | null
  valor_pago: number
  status: 'pendente' | 'paga' | 'vencida' | 'parcialmente_paga'
  observacoes: string | null
  created_at: string
}

export function useMutuos() {
  const { currentCompany } = useProject()
  const companyId = currentCompany?.id

  return useQuery({
    queryKey: ['mutuos', companyId],
    queryFn: async () => {
      if (!companyId) return []

      // Fetch mutuos and parcelas separately to avoid PostgREST embed issues
      const [mutuosRes, parcelasRes] = await Promise.all([
        supabase.from('mutuos').select('*, fornecedor:fornecedores(id, nome)').eq('company_id', companyId).neq('categoria', 'STUB_Dedupe').order('created_at', { ascending: false }),
        supabase.from('mutuo_parcelas').select('*').eq('company_id', companyId).order('numero_parcela'),
      ])
      if (mutuosRes.error) throw mutuosRes.error
      if (parcelasRes.error) throw parcelasRes.error

      const parcByMutuo = new Map<string, MutuoParcela[]>()
      for (const p of (parcelasRes.data ?? []) as MutuoParcela[]) {
        const arr = parcByMutuo.get(p.mutuo_id) ?? []
        arr.push(p)
        parcByMutuo.set(p.mutuo_id, arr)
      }

      return ((mutuosRes.data ?? []) as Extract<typeof mutuosRes.data, any[]>).map((m) => ({
        ...m,
        fornecedor: Array.isArray(m.fornecedor) ? m.fornecedor[0] : m.fornecedor,
        parcelas: parcByMutuo.get(m.id) ?? [],
      })) as Mutuo[]
    },
    enabled: !!companyId,
  })
}

export function useCreateMutuo() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async (input: {
      mutuo: Partial<Mutuo>
      parcelas: Array<{ valor: number; data_vencimento: string }>
    }) => {
      if (!currentCompany) throw new Error('Sem empresa selecionada')
      const companyId = currentCompany.id

      // Insert mutuo
      const { data: mutuo, error: mutErr } = await supabase
        .from('mutuos')
        .insert({ ...input.mutuo, company_id: companyId })
        .select()
        .single()
      if (mutErr) throw mutErr

      // Insert parcelas
      if (input.parcelas.length > 0) {
        const parcRows = input.parcelas.map((p, i) => ({
          company_id: companyId,
          mutuo_id: mutuo.id,
          numero_parcela: i + 1,
          valor: p.valor,
          data_vencimento: p.data_vencimento,
          status: 'pendente',
        }))
        const { error: parErr } = await supabase.from('mutuo_parcelas').insert(parcRows)
        if (parErr) throw parErr
      }

      return mutuo as Mutuo
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mutuos'] })
      qc.invalidateQueries({ queryKey: ['dashboard-kpis'] })
      toast.success('Mútuo cadastrado com sucesso')
    },
    onError: (err: Error) => toast.error('Erro ao cadastrar: ' + err.message),
  })
}

export function useDeleteMutuo() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('mutuos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mutuos'] })
      qc.invalidateQueries({ queryKey: ['dashboard-kpis'] })
      toast.success('Mútuo excluído')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useBatchDeleteMutuos() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('mutuos').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: (_, ids) => {
      qc.invalidateQueries({ queryKey: ['mutuos'] })
      qc.invalidateQueries({ queryKey: ['dashboard-kpis'] })
      toast.success(`${ids.length} mútuos excluídos.`)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useBatchUpdateMutuosCategory() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ ids, categoria }: { ids: string[]; categoria: string }) => {
      const { error } = await supabase.from('mutuos').update({ categoria }).in('id', ids)
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['mutuos'] })
      toast.success(`Categoria atualizada para ${variables.ids.length} mútuos.`)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateMutuoParcela() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<MutuoParcela> & { id: string }) => {
      const { error } = await supabase
        .from('mutuo_parcelas')
        .update(updates)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mutuos'] })
      qc.invalidateQueries({ queryKey: ['dashboard-kpis'] })
      toast.success('Parcela atualizada')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useCreateMutuoParcela() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async (input: { mutuo_id: string; valor: number; data_vencimento: string; numero_parcela: number }) => {
      if (!currentCompany) throw new Error('Sem empresa selecionada')
      const { error } = await supabase.from('mutuo_parcelas').insert({
        company_id: currentCompany.id,
        mutuo_id: input.mutuo_id,
        numero_parcela: input.numero_parcela,
        valor: input.valor,
        data_vencimento: input.data_vencimento,
        status: 'pendente',
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mutuos'] })
      qc.invalidateQueries({ queryKey: ['dashboard-kpis'] })
      toast.success('Parcela adicionada')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteMutuoParcela() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('mutuo_parcelas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mutuos'] })
      qc.invalidateQueries({ queryKey: ['dashboard-kpis'] })
      toast.success('Parcela excluída')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateMutuo() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Mutuo> & { id: string }) => {
      const { error } = await supabase
        .from('mutuos')
        .update(updates)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mutuos'] })
      qc.invalidateQueries({ queryKey: ['dashboard-kpis'] })
      toast.success('Mútuo atualizado')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// Summary for dashboard
export function useMutuosSummary() {
  const { currentCompany } = useProject()
  const companyId = currentCompany?.id

  return useQuery({
    queryKey: ['mutuos-summary', companyId],
    queryFn: async () => {
      if (!companyId) return null
      const [mutuosRes, parcelasRes] = await Promise.all([
        supabase.from('mutuos').select('id, valor_captado, status').eq('company_id', companyId).neq('categoria', 'STUB_Dedupe'),
        supabase.from('mutuo_parcelas').select('valor, valor_pago, status').eq('company_id', companyId),
      ])
      if (mutuosRes.error) throw mutuosRes.error
      if (parcelasRes.error) throw parcelasRes.error

      const mutuos = mutuosRes.data ?? []
      const parcelas = (parcelasRes.data ?? []) as Array<{ valor: number; valor_pago: number; status: string }>

      const totalCaptado = mutuos.reduce((s, m) => s + (Number(m.valor_captado) || 0), 0)
      let totalDevolvido = 0
      let totalPendente = 0

      for (const p of parcelas) {
        totalDevolvido += Number(p.valor_pago) || 0
        if (p.status !== 'paga') totalPendente += (Number(p.valor) || 0) - (Number(p.valor_pago) || 0)
      }

      return {
        totalCaptado,
        totalDevolvido,
        totalPendente,
        custoFinanceiro: totalDevolvido + totalPendente - totalCaptado,
        qtdMutuos: mutuos.length,
      }
    },
    enabled: !!companyId,
  })
}
