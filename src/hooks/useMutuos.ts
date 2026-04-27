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
  /** Soma de valor_aplicado onde a mov é de ENTRADA (dinheiro entrou no caixa via extrato) */
  valor_conciliado_entrada?: number
  /** Soma de valor_aplicado onde a mov é de SAÍDA (dinheiro saiu do caixa via extrato) */
  valor_conciliado_saida?: number
  /** @deprecated mantido pra compat — soma total (entrada + saída) */
  valor_conciliado?: number
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

      // Fetch mutuos, parcelas e valores ja conciliados (conciliacao_parcelas.mutuo_id)
      // Agora diferencia entrada vs saída pela direção da mov bancária.
      const [mutuosRes, parcelasRes, conciliadoRes] = await Promise.all([
        supabase.from('mutuos').select('*, fornecedor:fornecedores(id, nome)').eq('company_id', companyId).neq('categoria', 'STUB_Dedupe').order('created_at', { ascending: false }),
        supabase.from('mutuo_parcelas').select('*').eq('company_id', companyId).order('numero_parcela'),
        supabase
          .from('conciliacao_parcelas')
          .select('mutuo_id, valor_aplicado, conciliacoes!inner(company_id, status, movimentacoes_bancarias!inner(tipo))')
          .not('mutuo_id', 'is', null),
      ])
      if (mutuosRes.error) throw mutuosRes.error
      if (parcelasRes.error) throw parcelasRes.error

      const parcByMutuo = new Map<string, MutuoParcela[]>()
      for (const p of (parcelasRes.data ?? []) as MutuoParcela[]) {
        const arr = parcByMutuo.get(p.mutuo_id) ?? []
        arr.push(p)
        parcByMutuo.set(p.mutuo_id, arr)
      }

      const entradaPorMutuo = new Map<string, number>()
      const saidaPorMutuo = new Map<string, number>()
      for (const cp of (conciliadoRes.data ?? []) as any[]) {
        const conc = Array.isArray(cp.conciliacoes) ? cp.conciliacoes[0] : cp.conciliacoes
        if (!conc || conc.company_id !== companyId || conc.status !== 'confirmado') continue
        const mov = Array.isArray(conc.movimentacoes_bancarias) ? conc.movimentacoes_bancarias[0] : conc.movimentacoes_bancarias
        if (!mov) continue
        const val = Number(cp.valor_aplicado)
        if (mov.tipo === 'entrada') {
          entradaPorMutuo.set(cp.mutuo_id, (entradaPorMutuo.get(cp.mutuo_id) ?? 0) + val)
        } else {
          saidaPorMutuo.set(cp.mutuo_id, (saidaPorMutuo.get(cp.mutuo_id) ?? 0) + val)
        }
      }

      return ((mutuosRes.data ?? []) as Extract<typeof mutuosRes.data, any[]>).map((m) => {
        const entrada = entradaPorMutuo.get(m.id) ?? 0
        const saida = saidaPorMutuo.get(m.id) ?? 0
        return {
          ...m,
          fornecedor: Array.isArray(m.fornecedor) ? m.fornecedor[0] : m.fornecedor,
          parcelas: parcByMutuo.get(m.id) ?? [],
          valor_conciliado_entrada: entrada,
          valor_conciliado_saida: saida,
          valor_conciliado: entrada + saida,  // compat
        }
      }) as Mutuo[]
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
      contaBancariaId?: string | null
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

      // Garante paridade: o que aparece como mutuo no plano tambem aparece no extrato.
      // IDEMPOTENTE: tenta achar mov bancaria ja existente compativel (mesma conta,
      // valor, tipo, data ±3d). Se achar, conecta o mutuo a ELA. Senao, cria nova.
      const cat = String((input.mutuo as any).categoria ?? '').toLowerCase()
      const tipoMov: 'entrada' | 'saida' = cat.includes('adiantamento') && cat.includes('feito') ? 'saida' : 'entrada'
      const valor = Number((input.mutuo as any).valor_captado || 0)
      const data = (input.mutuo as any).data_captacao
      if (input.contaBancariaId && valor > 0 && data) {
        // Busca mov compativel sem link polimorfico (preferencia) ou qualquer mov compativel
        const dataObj = new Date(data + 'T00:00:00')
        const dataIni = new Date(dataObj.getTime() - 3 * 86400000).toISOString().split('T')[0]!
        const dataFim = new Date(dataObj.getTime() + 3 * 86400000).toISOString().split('T')[0]!
        const { data: candidatas } = await supabase
          .from('movimentacoes_bancarias')
          .select('id, data')
          .eq('company_id', companyId)
          .eq('conta_id', input.contaBancariaId)
          .eq('tipo', tipoMov)
          .eq('valor', valor)
          .gte('data', dataIni)
          .lte('data', dataFim)
        const movExistente = (candidatas ?? []).sort((a: any, b: any) =>
          Math.abs(new Date(a.data + 'T00:00:00').getTime() - dataObj.getTime()) -
          Math.abs(new Date(b.data + 'T00:00:00').getTime() - dataObj.getTime())
        )[0]
        let movId: string | null = movExistente?.id ?? null

        if (!movId) {
          const { data: movRow, error: eMov } = await supabase.from('movimentacoes_bancarias').insert({
            company_id: companyId,
            conta_id: input.contaBancariaId,
            data,
            descricao: `Mútuo: ${(input.mutuo as any).nome ?? 'OPERAÇÃO'}`,
            valor,
            tipo: tipoMov,
          }).select('id').single()
          if (eMov) throw eMov
          movId = movRow?.id ?? null
        }

        if (movId) {
          // Reusa conciliacao existente da mov, ou cria
          const { data: concExistente } = await supabase
            .from('conciliacoes').select('id').eq('movimentacao_id', movId).limit(1).maybeSingle()
          let concId: string | null = concExistente?.id ?? null
          if (!concId) {
            const { data: concRow, error: eConc } = await supabase.from('conciliacoes').insert({
              company_id: companyId,
              movimentacao_id: movId,
              match_type: 'manual',
              confidence: 100,
              status: 'aprovado',
            }).select('id').single()
            if (eConc) throw eConc
            concId = concRow?.id ?? null
          }
          if (concId) {
            await supabase.from('conciliacao_parcelas').insert({
              conciliacao_id: concId,
              mutuo_id: mutuo.id,
              valor_aplicado: valor,
            })
          }
        }
      }

      return mutuo as Mutuo
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mutuos'] })
      qc.invalidateQueries({ queryKey: ['movimentacoes'] })
      qc.invalidateQueries({ queryKey: ['conciliacoes'] })
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
