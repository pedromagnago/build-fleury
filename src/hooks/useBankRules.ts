/**
 * Build Fleury — Hook de Regras Bancárias
 *
 * CRUD + aplicação de regras de conciliação bancária.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { toast } from 'sonner'

export interface BankRuleRow {
  id: string
  company_id: string
  nome: string
  padrao_texto: string
  tipo_match: 'contains' | 'exact' | 'regex'
  valor_min: number | null
  valor_max: number | null
  acao: 'classificar' | 'ignorar' | 'auto_conciliar'
  categoria: string | null
  fornecedor_id: string | null
  descricao_padrao: string | null
  auto_aplicar: boolean
  vezes_aplicada: number
  created_at: string
}

// ─── List Rules ─────────────────────────────────────────────

export function useBankRules() {
  const { currentCompany } = useProject()
  return useQuery({
    queryKey: ['bank-rules', currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany) return []
      const { data, error } = await supabase
        .from('regras_conciliacao')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as BankRuleRow[]
    },
    enabled: !!currentCompany,
  })
}

// ─── Create Rule ────────────────────────────────────────────

interface CreateRuleInput {
  nome: string
  padrao_texto: string
  tipo_match?: 'contains' | 'exact' | 'regex'
  valor_min?: number | null
  valor_max?: number | null
  acao?: 'classificar' | 'ignorar' | 'auto_conciliar'
  categoria?: string | null
  fornecedor_id?: string | null
  descricao_padrao?: string | null
  auto_aplicar?: boolean
}

export function useCreateBankRule() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async (input: CreateRuleInput) => {
      if (!currentCompany) throw new Error('No company')
      const { data, error } = await supabase
        .from('regras_conciliacao')
        .insert({
          company_id: currentCompany.id,
          nome: input.nome,
          padrao_texto: input.padrao_texto,
          tipo_match: input.tipo_match || 'contains',
          valor_min: input.valor_min ?? null,
          valor_max: input.valor_max ?? null,
          acao: input.acao || 'classificar',
          categoria: input.categoria ?? null,
          fornecedor_id: input.fornecedor_id ?? null,
          descricao_padrao: input.descricao_padrao ?? null,
          auto_aplicar: input.auto_aplicar ?? true,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-rules'] })
      toast.success('Regra criada com sucesso')
    },
    onError: (err: Error) => toast.error('Erro ao criar regra: ' + err.message),
  })
}

// ─── Update Rule ────────────────────────────────────────────

export function useUpdateBankRule() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CreateRuleInput> & { id: string }) => {
      const { error } = await supabase
        .from('regras_conciliacao')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-rules'] })
      toast.success('Regra atualizada')
    },
    onError: (err: Error) => toast.error('Erro ao atualizar regra: ' + err.message),
  })
}

// ─── Delete Rule ────────────────────────────────────────────

export function useDeleteBankRule() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('regras_conciliacao')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-rules'] })
      toast.success('Regra removida')
    },
    onError: (err: Error) => toast.error('Erro ao remover regra: ' + err.message),
  })
}

// ─── Helper: suggest rule from transaction ──────────────────

export function suggestRuleFromTransaction(description: string, amount: number): Partial<CreateRuleInput> {
  const absAmount = Math.abs(amount)
  const desc = description.trim()

  // Common bank fee patterns
  const feePatterns = [
    { pattern: /administra.+local/i, nome: 'Tarifa Administração', cat: 'Tarifa Bancária' },
    { pattern: /ted|pix|doc/i, nome: 'Tarifa TED/PIX', cat: 'Tarifa Bancária' },
    { pattern: /iof/i, nome: 'IOF', cat: 'Imposto' },
    { pattern: /juros?\s*(mora|atraso)/i, nome: 'Juros de Mora', cat: 'Juros e Multas' },
    { pattern: /multa/i, nome: 'Multa', cat: 'Juros e Multas' },
    { pattern: /rendimento|juros?\s*remun/i, nome: 'Rendimento', cat: 'Receita Financeira' },
  ]

  for (const fp of feePatterns) {
    if (fp.pattern.test(desc)) {
      return {
        nome: fp.nome,
        padrao_texto: desc.split(/\s+/).slice(0, 3).join(' '),
        tipo_match: 'contains',
        acao: 'classificar',
        categoria: fp.cat,
        valor_min: absAmount > 1 ? absAmount * 0.5 : null,
        valor_max: absAmount > 1 ? absAmount * 2.0 : null,
      }
    }
  }

  // Generic suggestion
  return {
    nome: desc.slice(0, 50),
    padrao_texto: desc.split(/\s+/).slice(0, 3).join(' '),
    tipo_match: 'contains',
    acao: 'classificar',
    categoria: null,
  }
}
