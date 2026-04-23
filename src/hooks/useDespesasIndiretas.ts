import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { toast } from 'sonner'
import { addMonths, addWeeks, format, isBefore, isEqual } from 'date-fns'
import { parsearCondicao } from '@/lib/parcelas'

export interface DespesaIndireta {
  id: string
  company_id: string
  categoria: string
  descricao: string
  valor_orcado: number
  valor_consumido: number
  valor_saldo: number
  recorrente: boolean
  frequencia: 'mensal' | 'quinzenal' | 'semanal' | 'pontual' | null
  cond_pagamento: string | null   // "30/60/90" para despesa pontual parcelada
  data_inicio: string | null
  data_fim: string | null
  fornecedor_id: string | null
  observacoes: string | null
  ativo: boolean
  created_at: string
  // joined
  fornecedor_nome?: string
}

export type CreateDespesaIndiretaInput = Omit<
  DespesaIndireta,
  'id' | 'company_id' | 'valor_saldo' | 'created_at' | 'ativo' | 'fornecedor_nome' | 'valor_consumido'
>

export type UpdateDespesaIndiretaInput = Partial<CreateDespesaIndiretaInput> & { id: string }

export function useDespesasIndiretas() {
  const { currentCompany } = useProject()
  const queryClient = useQueryClient()

  // Queries
  const { data: despesas = [], isLoading } = useQuery({
    queryKey: ['despesas_indiretas', currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany) return []
      const { data, error } = await supabase
        .from('despesas_indiretas')
        .select(`
          *,
          fornecedores ( nome )
        `)
        .eq('company_id', currentCompany.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error

      return (data || []).map(d => ({
        ...d,
        fornecedor_nome: d.fornecedores?.nome,
      })) as DespesaIndireta[]
    },
    enabled: !!currentCompany,
  })

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (input: CreateDespesaIndiretaInput) => {
      if (!currentCompany) throw new Error('Projeto não selecionado')

      // Insert despesa
      const { data: despesa, error } = await supabase
        .from('despesas_indiretas')
        .insert({
          ...input,
          company_id: currentCompany.id,
        })
        .select()
        .single()

      if (error) throw error

      // Generate parcelas based on recurrence
      await generateParcelas(despesa as DespesaIndireta, currentCompany.id)

      return despesa
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['despesas_indiretas', currentCompany?.id] })
      queryClient.invalidateQueries({ queryKey: ['parcelas', currentCompany?.id] })
      toast.success('Despesa indireta criada com sucesso!')
    },
    onError: (error) => {
      console.error(error)
      toast.error('Erro ao criar despesa indireta')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (input: UpdateDespesaIndiretaInput) => {
      if (!currentCompany) throw new Error('Projeto não selecionado')

      // Pegar despesa atual para audit_log futuramente ou repensar parcelas
      const { data: oldData, error: fetchErr } = await supabase
        .from('despesas_indiretas')
        .select('*')
        .eq('id', input.id)
        .single()

      if (fetchErr) throw fetchErr

      const { data: updated, error } = await supabase
        .from('despesas_indiretas')
        .update(input)
        .eq('id', input.id)
        .select()
        .single()

      if (error) throw error

      // Se mudou orçado, datas, recorrência ou condição, apagar parcelas "planejadas" (status futura) e regerar
      const mudouOrcado = oldData.valor_orcado !== updated.valor_orcado
      const mudouRecorrencia = oldData.recorrente !== updated.recorrente || oldData.frequencia !== updated.frequencia
      const mudouDatas = oldData.data_inicio !== updated.data_inicio || oldData.data_fim !== updated.data_fim
      const mudouCond = (oldData.cond_pagamento ?? null) !== (updated.cond_pagamento ?? null)

      if (mudouOrcado || mudouRecorrencia || mudouDatas || mudouCond) {
        // Deletar só parcelas 'futura'. Se tem 'paga', ignora
        await supabase
          .from('parcelas')
          .delete()
          .eq('despesa_indireta_id', updated.id)
          .eq('status', 'futura')

        // Gerar o saldo restante com as novas parcelas
        await generateParcelas(updated as DespesaIndireta, currentCompany.id, true)
      }

      return updated
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['despesas_indiretas', currentCompany?.id] })
      queryClient.invalidateQueries({ queryKey: ['parcelas', currentCompany?.id] })
      toast.success('Despesa indireta atualizada com sucesso!')
    },
    onError: (error) => {
      console.error(error)
      toast.error('Erro ao atualizar despesa indireta')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!currentCompany) throw new Error('Projeto não selecionado')

      // Soft delete despesa
      const { error } = await supabase
        .from('despesas_indiretas')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error

      // Deletar parcelas futuras dessa despesa
      await supabase
        .from('parcelas')
        .delete()
        .eq('despesa_indireta_id', id)
        .eq('status', 'futura')

      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['despesas_indiretas', currentCompany?.id] })
      queryClient.invalidateQueries({ queryKey: ['parcelas', currentCompany?.id] })
      toast.success('Despesa indireta excluída!')
    },
    onError: (error) => {
      console.error(error)
      toast.error('Erro ao excluir despesa indireta')
    },
  })

  // Helper local para não expor a mutação
  async function generateParcelas(despesa: DespesaIndireta, companyId: string, isUpdate = false) {
    if (!despesa.data_inicio) return

    let datasParaGerar: string[] = []

    if (!despesa.recorrente) {
      if (despesa.cond_pagamento && despesa.cond_pagamento.trim()) {
        // Despesa PONTUAL parcelada: gera parcelas nos dias indicados (ex: "30/60/90")
        const dias = parsearCondicao(despesa.cond_pagamento)
        const base = new Date(despesa.data_inicio + 'T00:00:00')
        datasParaGerar = dias.map(d => {
          const dt = new Date(base)
          dt.setDate(dt.getDate() + d)
          return format(dt, 'yyyy-MM-dd')
        })
      } else {
        // Despesa pontual à vista: 1 parcela única
        datasParaGerar = [despesa.data_inicio]
      }
    } else {
      if (!despesa.data_fim || !despesa.frequencia) return

      let currentDate = new Date(despesa.data_inicio + 'T00:00:00')
      const endDate = new Date(despesa.data_fim + 'T00:00:00')

      while (isBefore(currentDate, endDate) || isEqual(currentDate, endDate)) {
        datasParaGerar.push(format(currentDate, 'yyyy-MM-dd'))

        switch (despesa.frequencia) {
          case 'mensal':
            currentDate = addMonths(currentDate, 1)
            break
          case 'quinzenal':
            currentDate = addWeeks(currentDate, 2)
            break
          case 'semanal':
            currentDate = addWeeks(currentDate, 1)
            break
          default:
            currentDate = addMonths(currentDate, 1)
        }
      }
    }

    if (datasParaGerar.length === 0) return

    // Se é atualização, descobrir quanto já foi pago para não regerar 
    // a parte do valor que já consta nas parcelas 'pagas'
    let valorAlvo = despesa.valor_orcado
    
    if (isUpdate) {
      const { data: pagas } = await supabase
        .from('parcelas')
        .select('valor')
        .eq('despesa_indireta_id', despesa.id)
        .eq('status', 'paga')
      
      const totalPago = (pagas || []).reduce((acc, p) => acc + Number(p.valor), 0)
      valorAlvo = Math.max(0, despesa.valor_orcado - totalPago)
      
      // Também descontar o número de parcelas já pagas do `datasParaGerar`
      // para distribuir "pra frente". Para simplificar, vou manter a quantidade 
      // de datas que foram projetadas a partir de HOJE. No mundo ideal o 
      // array de datas gerado só pega as datas futuras:
      const pagasCount = pagas?.length || 0
      datasParaGerar = datasParaGerar.slice(pagasCount)
    }

    if (datasParaGerar.length === 0 || valorAlvo <= 0) return

    const parcelas = datasParaGerar.map((dt, idx) => ({
      company_id: companyId,
      despesa_indireta_id: despesa.id,
      numero_parcela: isUpdate ? idx + 1 /* fixme */ : idx + 1,
      valor: Number((valorAlvo / datasParaGerar.length).toFixed(2)),
      data_vencimento: dt,
      status: 'futura'
    }))

    // Corrigir arredondamento na última parcela se houver dízima
    const soma = parcelas.reduce((acc, p) => acc + p.valor, 0)
    const diff = Number((valorAlvo - soma).toFixed(2))
    if (diff !== 0 && parcelas.length > 0) {
      const lastParcela = parcelas[parcelas.length - 1]
      if (lastParcela) lastParcela.valor += diff
    }

    const { error: insertErr } = await supabase.from('parcelas').insert(parcelas)
    if (insertErr) {
      console.error('Erro ao gerar parcelas indiretas:', insertErr)
    }
  }

  // Bulk update — update a set of fields for multiple IDs at once
  const bulkUpdateFields = async (ids: string[], fields: Record<string, any>) => {
    if (!currentCompany || ids.length === 0) return
    const { error } = await supabase
      .from('despesas_indiretas')
      .update(fields)
      .in('id', ids)
    if (error) {
      console.error('Bulk update error:', error)
      toast.error('Erro ao atualizar em lote')
      throw error
    }
    queryClient.invalidateQueries({ queryKey: ['despesas_indiretas', currentCompany.id] })
    queryClient.invalidateQueries({ queryKey: ['parcelas', currentCompany.id] })
    toast.success(`${ids.length} itens atualizados com sucesso!`)
  }

  // Bulk delete — soft-delete multiple despesas and remove their future parcelas
  const bulkDelete = async (ids: string[]) => {
    if (!currentCompany || ids.length === 0) return
    // Delete future parcelas
    await supabase.from('parcelas').delete().in('despesa_indireta_id', ids).eq('status', 'futura')
    // Soft-delete
    const { error } = await supabase
      .from('despesas_indiretas')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
    if (error) {
      console.error('Bulk delete error:', error)
      toast.error('Erro ao excluir em lote')
      throw error
    }
    queryClient.invalidateQueries({ queryKey: ['despesas_indiretas', currentCompany.id] })
    queryClient.invalidateQueries({ queryKey: ['parcelas', currentCompany.id] })
    toast.success(`${ids.length} itens excluídos com sucesso!`)
  }

  return {
    despesas,
    isLoading,
    createDespesa: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateDespesa: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    deleteDespesa: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    bulkUpdateFields,
    bulkDelete,
  }
}
