import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { toast } from 'sonner'

export interface Fornecedor {
  id: string
  company_id: string
  nome: string
  cnpj: string | null
  contato: string | null
  cond_pagamento_padrao: string | null
  observacoes: string | null
  tipo: 'fornecedor' | 'cliente' | 'ambos'
  created_at: string
}

export interface ItemCompra {
  id: string
  company_id: string
  etapa_id: string
  codigo: string
  descricao: string
  tipo: 'MATERIAL' | 'MAO_DE_OBRA' | 'EQUIPAMENTO'
  categoria: string | null
  unidade: string | null
  qtd_por_casa: number | null
  qtd_total: number | null
  custo_unitario_orcado: number
  valor_total_orcado: number
  fornecedor_id: string | null
  cond_pagamento: string | null
  valor_consumido: number
  valor_saldo: number
  deleted_at: string | null
  created_at: string
  // Joined fields
  etapa_nome?: string
  fornecedor_nome?: string
}

// Status válidos no banco (ver CHECK constraint pedidos_status_check).
// 'planejado' é o default da importação; demais refletem o ciclo do pedido.
export type PedidoStatus =
  | 'planejado'
  | 'pedido_enviado'
  | 'entregue'
  | 'parcialmente_pago'
  | 'pago'
  | 'cancelado'

// Pedido "ativo" para fins financeiros: já está no fluxo, deve ter parcelas.
// Apenas 'cancelado' fica de fora.
export const STATUS_PEDIDO_ATIVO: readonly PedidoStatus[] = [
  'planejado',
  'pedido_enviado',
  'entregue',
  'parcialmente_pago',
  'pago',
] as const

export interface Pedido {
  id: string
  company_id: string
  item_compra_id: string
  numero_pedido: number | null
  casas_lote: number | null
  qtd_lote: number | null
  valor_unitario_real: number | null
  valor_total_real: number | null
  fornecedor_id: string | null
  cond_pagamento: string | null
  data_entrega_prevista: string | null
  data_entrega_real: string | null
  status: PedidoStatus
  observacoes: string | null
  created_at: string
  // Joined
  item_descricao?: string
  item_codigo?: string
  fornecedor_nome?: string
}

// ---------------------------------------------------------------------------
// Fornecedores
// ---------------------------------------------------------------------------

export function useFornecedores() {
  const { currentCompany } = useProject()
  const companyId = currentCompany?.id ?? ''

  return useQuery({
    queryKey: ['fornecedores', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fornecedores')
        .select('*')
        .eq('company_id', companyId)
        .order('nome')
      if (error) throw error
      return data as Fornecedor[]
    },
    enabled: !!companyId,
  })
}

export function useCreateFornecedor() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async (fornecedor: Partial<Fornecedor>) => {
      if (!currentCompany) throw new Error('No company')
      const { data, error } = await supabase
        .from('fornecedores')
        .insert({ ...fornecedor, company_id: currentCompany.id })
        .select()
        .single()
      if (error) throw error
      return data as Fornecedor
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fornecedores'] })
      toast.success('Fornecedor criado')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateFornecedor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<Fornecedor> & { id: string }) => {
      const { error } = await supabase.from('fornecedores').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fornecedores'] })
      toast.success('Fornecedor atualizado')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteFornecedor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: row } = await supabase.from('fornecedores').select('company_id, nome').eq('id', id).single()
      
      // Nullify references in itens_compra and pedidos to prevent FK constraint issues
      await supabase.from('itens_compra').update({ fornecedor_id: null }).eq('fornecedor_id', id)
      await supabase.from('pedidos').update({ fornecedor_id: null }).eq('fornecedor_id', id)
      
      const { error } = await supabase.from('fornecedores').delete().eq('id', id)
      if (error) throw error
      if (row) {
        const { data: { user } } = await supabase.auth.getUser()
        await supabase.from('audit_logs').insert({
          user_id: user?.id, company_id: row.company_id,
          acao: 'DELETE', tabela: 'fornecedores', registro_id: id,
          dados: { nome: row.nome },
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fornecedores'] })
      toast.success('Fornecedor excluído')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ---------------------------------------------------------------------------
// Itens de Compra
// ---------------------------------------------------------------------------

export function useItensCompra() {
  const { currentCompany } = useProject()
  const companyId = currentCompany?.id ?? ''

  return useQuery({
    queryKey: ['itens_compra', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('itens_compra')
        .select('*, etapas!inner(nome), fornecedores(nome)')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('codigo')
      if (error) throw error
      return (data ?? []).map((i: Record<string, unknown>) => ({
        ...i,
        etapa_nome: (i.etapas as Record<string, string> | null)?.nome,
        fornecedor_nome: (i.fornecedores as Record<string, string> | null)?.nome,
      })) as ItemCompra[]
    },
    enabled: !!companyId,
  })
}

export function useCreateItemCompra() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async (item: Partial<ItemCompra>) => {
      if (!currentCompany) throw new Error('No company')
      const { data, error } = await supabase
        .from('itens_compra')
        .insert({ ...item, company_id: currentCompany.id })
        .select()
        .single()
      if (error) throw error
      return data as ItemCompra
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['itens_compra'] })
      toast.success('Item criado')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateItemCompra() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ItemCompra> & { id: string }) => {
      const { data, error } = await supabase
        .from('itens_compra')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as ItemCompra
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['itens_compra'] })
      toast.success('Item atualizado')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteItemCompra() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (itemId: string) => {
      // Cascade: parcelas → pedidos → item
      const { data: pedidos } = await supabase
        .from('pedidos').select('id').eq('item_compra_id', itemId)
      if (pedidos && pedidos.length > 0) {
        const pedidoIds = pedidos.map(p => p.id)
        await supabase.from('parcelas').delete().in('pedido_id', pedidoIds)
        await supabase.from('pedidos').delete().in('id', pedidoIds)
      }
      const { error } = await supabase.from('itens_compra').update({ deleted_at: new Date().toISOString() }).eq('id', itemId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['itens_compra'] })
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      toast.success('Item de compra excluído')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------

export function usePedidos() {
  const { currentCompany } = useProject()
  const companyId = currentCompany?.id ?? ''

  return useQuery({
    queryKey: ['pedidos', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pedidos')
        .select('*, itens_compra!inner(descricao, codigo), fornecedores(nome)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((p: Record<string, unknown>) => ({
        ...p,
        item_descricao: (p.itens_compra as Record<string, string> | null)?.descricao,
        item_codigo: (p.itens_compra as Record<string, string> | null)?.codigo,
        fornecedor_nome: (p.fornecedores as Record<string, string> | null)?.nome,
      })) as Pedido[]
    },
    enabled: !!companyId,
  })
}

export function useCreatePedido() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async (pedido: Partial<Pedido>) => {
      if (!currentCompany) throw new Error('No company')
      const { data, error } = await supabase
        .from('pedidos')
        .insert({ ...pedido, company_id: currentCompany.id })
        .select()
        .single()
      if (error) throw error
      return data as Pedido
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      toast.success('Pedido criado')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useCreatePedidoLote() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async (pedidos: Partial<Pedido>[]) => {
      if (!currentCompany) throw new Error('No company')
      const payloads = pedidos.map((p) => ({ ...p, company_id: currentCompany.id }))
      const { data, error } = await supabase
        .from('pedidos')
        .insert(payloads)
        .select()
      if (error) throw error
      return data as Pedido[]
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      toast.success(`${data.length} pedidos criados no lote`)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdatePedido() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Pedido> & { id: string }) => {
      const { data, error } = await supabase
        .from('pedidos')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Pedido
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['itens_compra'] })
      toast.success('Pedido atualizado')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeletePedido() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (pedidoId: string) => {
      const { error: parcelasErr } = await supabase
        .from('parcelas')
        .delete()
        .eq('pedido_id', pedidoId)
        .neq('status', 'paga')
      if (parcelasErr) throw parcelasErr

      const { error: pedidoErr } = await supabase
        .from('pedidos')
        .delete()
        .eq('id', pedidoId)
      if (pedidoErr) throw pedidoErr
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['itens_compra'] })
      toast.success('Pedido excluído')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
