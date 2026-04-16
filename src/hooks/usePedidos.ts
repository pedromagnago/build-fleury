/**
 * Build Fleury — Hooks de Conformidade de Pedidos vs Cronograma
 *
 * Colunas reais (verificadas no codebase):
 *   pedidos.cond_pagamento          (não "condicao_pagamento")
 *   fornecedores.cond_pagamento_padrao
 *   cronograma_distribuicao         (não "cronograma_servicos" / "medicoes_metas")
 *     .etapa_id, .medicao_numero, .data_inicio
 *   itens_compra.etapa_id           (join pedido → item → etapa → cronograma)
 *   parcelas                        (tabela real, não parcelas_financeiras)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { localDate, gerarParcelas, regenerarParcelas } from '@/lib/parcelas'
import { writeAuditLog } from '@/lib/auditLog'
import { toast } from 'sonner'

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface ParcelaConformidade {
  id: string
  data_vencimento: string
  valor: number
  status: string
  valor_pago: number
}

export interface PedidoConformidade {
  pedido_id: string
  numero_pedido: number | null
  fornecedor_id: string
  fornecedor_nome: string
  condicao_pagamento: string    // ex: "30/60/90"
  servico_nome: string
  item_codigo: string | null
  valor_total: number
  medicao_numero: number
  data_medicao_inicio: string   // YYYY-MM-DD — data_inicio da quinzena-alvo
  data_entrega_prevista: string // YYYY-MM-DD
  dias_folga: number
  status_conformidade: 'ok' | 'risco' | 'critico'
  parcelas: ParcelaConformidade[]
}

export interface AtualizarConformidadePayload {
  pedido_id: string
  valor_total: number
  nova_data_entrega?: string    // Cenário A
  nova_cond_pagamento?: string  // Cenário B
}

// ─── Tipos internos das rows do Supabase ─────────────────────────────────────

type PedidoRow = {
  id: string
  item_compra_id: string
  fornecedor_id: string | null
  cond_pagamento: string | null
  data_entrega_prevista: string
  valor_total_real: number | null
  numero_pedido: number | null
}

type ItemRow = {
  id: string
  etapa_id: string
  descricao: string
  codigo: string | null
}

type DistribuicaoRow = {
  etapa_id: string
  medicao_numero: number
  data_inicio: string
  data_fim?: string | null
}

type FornecedorRow = {
  id: string
  nome: string
  cond_pagamento_padrao: string | null
}

type ParcelaRow = {
  id: string
  pedido_id: string | null
  valor: number
  data_vencimento: string
  status: string
  valor_pago: number
}

type EtapaRow = {
  id: string
  nome: string
  codigo: string
  ordem: number
}

// ─── Tipos para visão tabela (planilha) ───────────────────────────────────────

export type CellStatus = 'ok' | 'risco' | 'critico' | 'sem_pedido'

export interface CelulaConformidade {
  dias_folga: number | null
  status: CellStatus
  data_inicio: string
}

export interface LinhaTabela {
  etapa_id: string
  etapa_nome: string
  etapa_codigo: string
  etapa_ordem: number
  item_id: string
  item_descricao: string
  item_codigo: string | null
  pedido_id: string | null
  numero_pedido: number | null
  fornecedor_nome: string
  condicao_pagamento: string
  valor_total: number
  data_entrega_prevista: string | null
  por_medicao: { [medicao: number]: CelulaConformidade }
  parcelas: ParcelaConformidade[]
}

export interface TabelaConformidade {
  colunas: Array<{ numero: number; data_inicio: string; data_fim: string | null; dias_ate_inicio: number }>
  linhas: LinhaTabela[]
}

// ─── Tipos para visão agrupada por Medição ────────────────────────────────────

export interface PedidoEmEtapa {
  pedido_id: string
  numero_pedido: number | null
  fornecedor_id: string
  fornecedor_nome: string
  condicao_pagamento: string
  item_descricao: string
  item_codigo: string | null
  valor_total: number
  data_entrega_prevista: string
  dias_folga: number
  status_conformidade: 'ok' | 'risco' | 'critico'
  parcelas: ParcelaConformidade[]
}

export interface EtapaConformidade {
  etapa_id: string
  etapa_nome: string
  etapa_codigo: string
  pedidos: PedidoEmEtapa[]
  status_geral: 'ok' | 'risco' | 'critico' | 'sem_pedidos'
  counts: { ok: number; risco: number; critico: number }
}

export interface MedicaoConformidade {
  medicao_numero: number
  data_inicio: string
  data_fim: string | null
  dias_ate_inicio: number
  etapas: EtapaConformidade[]
  status_geral: 'ok' | 'risco' | 'critico' | 'sem_pedidos'
  counts: { ok: number; risco: number; critico: number; sem_pedidos: number }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function diasFolga(dataEntrega: string, dataMedicao: string): number {
  return Math.round(
    (localDate(dataMedicao).getTime() - localDate(dataEntrega).getTime()) / 86_400_000
  )
}

function calcStatus(dias: number): 'ok' | 'risco' | 'critico' {
  if (dias >= 0) return 'ok'
  if (dias >= -7) return 'risco'
  return 'critico'
}

// ─── usePedidosConformidade ───────────────────────────────────────────────────

export function usePedidosConformidade() {
  const { currentCompany } = useProject()
  const cid = currentCompany?.id

  return useQuery({
    queryKey: ['pedidos_conformidade', cid],
    staleTime: 60_000,
    enabled: !!cid,
    queryFn: async (): Promise<PedidoConformidade[]> => {
      if (!cid) return []

      const [pedRes, itemRes, distRes, fornRes, parcRes] = await Promise.all([
        supabase
          .from('pedidos')
          .select('id, item_compra_id, fornecedor_id, cond_pagamento, data_entrega_prevista, valor_total_real, numero_pedido')
          .eq('company_id', cid)
          .not('data_entrega_prevista', 'is', null),

        supabase
          .from('itens_compra')
          .select('id, etapa_id, descricao, codigo')
          .eq('company_id', cid)
          .is('deleted_at', null),

        supabase
          .from('cronograma_distribuicao')
          .select('etapa_id, medicao_numero, data_inicio')
          .eq('company_id', cid)
          .not('data_inicio', 'is', null)
          .order('medicao_numero', { ascending: true }),

        supabase
          .from('fornecedores')
          .select('id, nome, cond_pagamento_padrao')
          .eq('company_id', cid),

        supabase
          .from('parcelas')
          .select('id, pedido_id, valor, data_vencimento, status, valor_pago')
          .eq('company_id', cid)
          .is('deleted_at', null),
      ])

      if (pedRes.error) throw pedRes.error
      if (itemRes.error) throw itemRes.error
      if (distRes.error) throw distRes.error
      if (fornRes.error) throw fornRes.error
      if (parcRes.error) throw parcRes.error

      const pedidos = (pedRes.data ?? []) as PedidoRow[]
      const itens   = (itemRes.data ?? []) as ItemRow[]
      const dists   = (distRes.data ?? []) as DistribuicaoRow[]
      const forns   = (fornRes.data ?? []) as FornecedorRow[]
      const parcs   = (parcRes.data ?? []) as ParcelaRow[]

      // Lookup maps
      const itemMap = new Map(itens.map(i => [i.id, i]))
      const fornMap = new Map(forns.map(f => [f.id, f]))

      // Etapa → primeiro cronograma (menor medicao_numero com data_inicio)
      const etapaDist = new Map<string, DistribuicaoRow>()
      for (const d of dists) {
        const ex = etapaDist.get(d.etapa_id)
        if (!ex || d.medicao_numero < ex.medicao_numero) etapaDist.set(d.etapa_id, d)
      }

      // Parcelas por pedido_id
      const parcMap = new Map<string, ParcelaConformidade[]>()
      for (const p of parcs) {
        if (!p.pedido_id) continue
        const list = parcMap.get(p.pedido_id) ?? []
        list.push({ id: p.id, data_vencimento: p.data_vencimento, valor: Number(p.valor), status: p.status, valor_pago: Number(p.valor_pago) })
        parcMap.set(p.pedido_id, list)
      }

      const result: PedidoConformidade[] = []

      for (const ped of pedidos) {
        if (!ped.data_entrega_prevista) continue
        const item = itemMap.get(ped.item_compra_id)
        if (!item) continue
        const dist = etapaDist.get(item.etapa_id)
        if (!dist) continue // sem cronograma: não aparece na conferência

        const forn   = ped.fornecedor_id ? fornMap.get(ped.fornecedor_id) : undefined
        const cond   = ped.cond_pagamento ?? forn?.cond_pagamento_padrao ?? ''
        const folga  = diasFolga(ped.data_entrega_prevista, dist.data_inicio)

        result.push({
          pedido_id:             ped.id,
          numero_pedido:         ped.numero_pedido,
          fornecedor_id:         ped.fornecedor_id ?? '',
          fornecedor_nome:       forn?.nome ?? '—',
          condicao_pagamento:    cond,
          servico_nome:          item.descricao,
          item_codigo:           item.codigo,
          valor_total:           Number(ped.valor_total_real ?? 0),
          medicao_numero:        dist.medicao_numero,
          data_medicao_inicio:   dist.data_inicio,
          data_entrega_prevista: ped.data_entrega_prevista,
          dias_folga:            folga,
          status_conformidade:   calcStatus(folga),
          parcelas:              parcMap.get(ped.id) ?? [],
        })
      }

      // Críticos primeiro (menor dias_folga = mais atrasado)
      result.sort((a, b) => a.dias_folga - b.dias_folga)
      return result
    },
  })
}

// ─── useAtualizarPedidoConformidade ──────────────────────────────────────────

export function useAtualizarPedidoConformidade() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async (payload: AtualizarConformidadePayload): Promise<number> => {
      if (!currentCompany) throw new Error('Empresa não selecionada')
      const cid = currentCompany.id

      // 1. Pedido atual
      const { data: ped, error: pedErr } = await supabase
        .from('pedidos')
        .select('id, cond_pagamento, data_entrega_prevista')
        .eq('id', payload.pedido_id)
        .single()
      if (pedErr) throw pedErr

      const dataFinal = payload.nova_data_entrega ?? (ped.data_entrega_prevista as string)
      const condFinal = payload.nova_cond_pagamento ?? (ped.cond_pagamento as string | null) ?? ''

      // 2. Parcelas existentes não deletadas
      const { data: parcAtuais, error: parcErr } = await supabase
        .from('parcelas')
        .select('id, status, valor_pago')
        .eq('pedido_id', payload.pedido_id)
        .is('deleted_at', null)
      if (parcErr) throw parcErr

      const existentes = (parcAtuais ?? []).map(p => ({
        id: p.id as string,
        status: p.status as string,
        valor_pago: Number(p.valor_pago),
      }))

      // 3. Calcular novas parcelas (preservando as já pagas)
      const { parcelasParaDeletar, parcelasParaCriar } = regenerarParcelas({
        pedidoId:            payload.pedido_id,
        companyId:           cid,
        valorTotal:          payload.valor_total,
        condPagamento:       condFinal,
        novaDataEntrega:     localDate(dataFinal),
        parcelasExistentes:  existentes,
      })

      // 4. Soft delete parcelas não pagas
      if (parcelasParaDeletar.length > 0) {
        const { error } = await supabase
          .from('parcelas')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', parcelasParaDeletar)
        if (error) throw error
      }

      // 5. Inserir novas parcelas
      if (parcelasParaCriar.length > 0) {
        const { error } = await supabase.from('parcelas').insert(parcelasParaCriar)
        if (error) throw error
      }

      // 6. Atualizar pedido
      const updates: Record<string, string> = {}
      if (payload.nova_data_entrega)               updates['data_entrega_prevista'] = payload.nova_data_entrega
      if (payload.nova_cond_pagamento !== undefined) updates['cond_pagamento']       = payload.nova_cond_pagamento

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from('pedidos').update(updates).eq('id', payload.pedido_id)
        if (error) throw error
      }

      // 7. Audit log
      await writeAuditLog({
        companyId:   cid,
        tabela:      'pedidos',
        acao:        'UPDATE',
        registroId:  payload.pedido_id,
        dadosAntes:  { data_entrega_prevista: ped.data_entrega_prevista, cond_pagamento: ped.cond_pagamento },
        dadosDepois: updates,
        resumo:      `Conformidade ajustada · ${parcelasParaCriar.length} parcela(s) recalculada(s)`,
      })

      return parcelasParaCriar.length
    },

    onSuccess: (qtd) => {
      toast.success(`Pedido atualizado · ${qtd} parcela(s) recalculada(s)`)
      qc.invalidateQueries({ queryKey: ['pedidos_conformidade'] })
      qc.invalidateQueries({ queryKey: ['medicoes_conformidade'] })
      qc.invalidateQueries({ queryKey: ['tabela_conformidade'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['pedidos'] })
    },
    onError: (err: Error) => toast.error('Erro: ' + err.message),
  })
}

// ─── useMedicoesConformidade ──────────────────────────────────────────────────

export function useMedicoesConformidade() {
  const { currentCompany } = useProject()
  const cid = currentCompany?.id

  return useQuery({
    queryKey: ['medicoes_conformidade', cid],
    staleTime: 60_000,
    enabled: !!cid,
    queryFn: async (): Promise<MedicaoConformidade[]> => {
      if (!cid) return []

      const [pedRes, itemRes, distRes, fornRes, parcRes, etapaRes] = await Promise.all([
        supabase
          .from('pedidos')
          .select('id, item_compra_id, fornecedor_id, cond_pagamento, data_entrega_prevista, valor_total_real, numero_pedido')
          .eq('company_id', cid)
          .not('data_entrega_prevista', 'is', null),

        supabase
          .from('itens_compra')
          .select('id, etapa_id, descricao, codigo')
          .eq('company_id', cid)
          .is('deleted_at', null),

        supabase
          .from('cronograma_distribuicao')
          .select('etapa_id, medicao_numero, data_inicio, data_fim')
          .eq('company_id', cid)
          .not('data_inicio', 'is', null),

        supabase
          .from('fornecedores')
          .select('id, nome, cond_pagamento_padrao')
          .eq('company_id', cid),

        supabase
          .from('parcelas')
          .select('id, pedido_id, valor, data_vencimento, status, valor_pago')
          .eq('company_id', cid)
          .is('deleted_at', null),

        supabase
          .from('etapas')
          .select('id, nome, codigo')
          .eq('company_id', cid),
      ])

      if (pedRes.error)   throw pedRes.error
      if (itemRes.error)  throw itemRes.error
      if (distRes.error)  throw distRes.error
      if (fornRes.error)  throw fornRes.error
      if (parcRes.error)  throw parcRes.error
      if (etapaRes.error) throw etapaRes.error

      const pedidos = (pedRes.data  ?? []) as PedidoRow[]
      const itens   = (itemRes.data ?? []) as ItemRow[]
      const dists   = (distRes.data ?? []) as DistribuicaoRow[]
      const forns   = (fornRes.data ?? []) as FornecedorRow[]
      const parcs   = (parcRes.data ?? []) as ParcelaRow[]
      const etapas  = (etapaRes.data ?? []) as EtapaRow[]

      // Lookup maps
      const fornMap  = new Map(forns.map(f  => [f.id,  f]))
      const etapaMap = new Map(etapas.map(e => [e.id,  e]))

      // item_id → PedidoRow[]
      const itemPedidosMap = new Map<string, PedidoRow[]>()
      for (const ped of pedidos) {
        if (!ped.data_entrega_prevista) continue
        const list = itemPedidosMap.get(ped.item_compra_id) ?? []
        list.push(ped)
        itemPedidosMap.set(ped.item_compra_id, list)
      }

      // etapa_id → ItemRow[]
      const etapaItemsMap = new Map<string, ItemRow[]>()
      for (const item of itens) {
        const list = etapaItemsMap.get(item.etapa_id) ?? []
        list.push(item)
        etapaItemsMap.set(item.etapa_id, list)
      }

      // pedido_id → ParcelaConformidade[]
      const parcMap = new Map<string, ParcelaConformidade[]>()
      for (const p of parcs) {
        if (!p.pedido_id) continue
        const list = parcMap.get(p.pedido_id) ?? []
        list.push({ id: p.id, data_vencimento: p.data_vencimento, valor: Number(p.valor), status: p.status, valor_pago: Number(p.valor_pago) })
        parcMap.set(p.pedido_id, list)
      }

      // Group cronograma_distribuicao by medicao_numero
      type MedInfo = { data_inicio: string; data_fim: string | null; etapa_ids: Set<string> }
      const medicaoMap = new Map<number, MedInfo>()
      for (const dist of dists) {
        const ex = medicaoMap.get(dist.medicao_numero)
        if (!ex) {
          medicaoMap.set(dist.medicao_numero, {
            data_inicio: dist.data_inicio,
            data_fim:    dist.data_fim ?? null,
            etapa_ids:   new Set([dist.etapa_id]),
          })
        } else {
          if (dist.data_inicio < ex.data_inicio) ex.data_inicio = dist.data_inicio
          if (dist.data_fim && (!ex.data_fim || dist.data_fim > ex.data_fim)) ex.data_fim = dist.data_fim
          ex.etapa_ids.add(dist.etapa_id)
        }
      }

      // today as local YYYY-MM-DD
      const d = new Date()
      const todayISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

      const result: MedicaoConformidade[] = []

      for (const [medNum, medInfo] of medicaoMap) {
        const etapasResult: EtapaConformidade[] = []

        for (const etapaId of medInfo.etapa_ids) {
          const etapa      = etapaMap.get(etapaId)
          const etapaItems = etapaItemsMap.get(etapaId) ?? []

          const pedidosResult: PedidoEmEtapa[] = []
          for (const item of etapaItems) {
            const peds = itemPedidosMap.get(item.id) ?? []
            for (const ped of peds) {
              const forn  = ped.fornecedor_id ? fornMap.get(ped.fornecedor_id) : undefined
              const cond  = ped.cond_pagamento ?? forn?.cond_pagamento_padrao ?? ''
              const folga = diasFolga(ped.data_entrega_prevista, medInfo.data_inicio)
              pedidosResult.push({
                pedido_id:             ped.id,
                numero_pedido:         ped.numero_pedido,
                fornecedor_id:         ped.fornecedor_id ?? '',
                fornecedor_nome:       forn?.nome ?? '—',
                condicao_pagamento:    cond,
                item_descricao:        item.descricao,
                item_codigo:           item.codigo,
                valor_total:           Number(ped.valor_total_real ?? 0),
                data_entrega_prevista: ped.data_entrega_prevista,
                dias_folga:            folga,
                status_conformidade:   calcStatus(folga),
                parcelas:              parcMap.get(ped.id) ?? [],
              })
            }
          }

          pedidosResult.sort((a, b) => a.dias_folga - b.dias_folga)

          const cnts = {
            ok:      pedidosResult.filter(p => p.status_conformidade === 'ok').length,
            risco:   pedidosResult.filter(p => p.status_conformidade === 'risco').length,
            critico: pedidosResult.filter(p => p.status_conformidade === 'critico').length,
          }
          const sg: EtapaConformidade['status_geral'] =
            pedidosResult.length === 0 ? 'sem_pedidos' :
            cnts.critico > 0 ? 'critico' :
            cnts.risco   > 0 ? 'risco' : 'ok'

          etapasResult.push({
            etapa_id:    etapaId,
            etapa_nome:  etapa?.nome  ?? `Etapa ${etapaId.slice(0, 6)}`,
            etapa_codigo: etapa?.codigo ?? '—',
            pedidos:     pedidosResult,
            status_geral: sg,
            counts:      cnts,
          })
        }

        const statusOrder: Record<EtapaConformidade['status_geral'], number> = {
          critico: 0, sem_pedidos: 1, risco: 2, ok: 3,
        }
        etapasResult.sort((a, b) => statusOrder[a.status_geral] - statusOrder[b.status_geral])

        const allPeds = etapasResult.flatMap(e => e.pedidos)
        const mCounts = {
          ok:          allPeds.filter(p => p.status_conformidade === 'ok').length,
          risco:       allPeds.filter(p => p.status_conformidade === 'risco').length,
          critico:     allPeds.filter(p => p.status_conformidade === 'critico').length,
          sem_pedidos: etapasResult.filter(e => e.status_geral === 'sem_pedidos').length,
        }
        const mSg: MedicaoConformidade['status_geral'] =
          mCounts.critico     > 0 ? 'critico' :
          mCounts.sem_pedidos > 0 ? 'sem_pedidos' :
          mCounts.risco       > 0 ? 'risco' : 'ok'

        const diasAte = Math.round(
          (localDate(medInfo.data_inicio).getTime() - localDate(todayISO).getTime()) / 86_400_000
        )

        result.push({
          medicao_numero:  medNum,
          data_inicio:     medInfo.data_inicio,
          data_fim:        medInfo.data_fim,
          dias_ate_inicio: diasAte,
          etapas:          etapasResult,
          status_geral:    mSg,
          counts:          mCounts,
        })
      }

      result.sort((a, b) => a.medicao_numero - b.medicao_numero)
      return result
    },
  })
}

// ─── useTabelaConformidade ────────────────────────────────────────────────────

export function useTabelaConformidade() {
  const { currentCompany } = useProject()
  const cid = currentCompany?.id

  return useQuery({
    queryKey: ['tabela_conformidade', cid],
    staleTime: 60_000,
    enabled: !!cid,
    queryFn: async (): Promise<TabelaConformidade> => {
      if (!cid) return { colunas: [], linhas: [] }

      const [pedRes, itemRes, distRes, fornRes, etapaRes, parcRes] = await Promise.all([
        supabase
          .from('pedidos')
          .select('id, item_compra_id, fornecedor_id, cond_pagamento, data_entrega_prevista, valor_total_real, numero_pedido')
          .eq('company_id', cid),

        supabase
          .from('itens_compra')
          .select('id, etapa_id, descricao, codigo')
          .eq('company_id', cid)
          .is('deleted_at', null),

        supabase
          .from('cronograma_distribuicao')
          .select('etapa_id, medicao_numero, data_inicio, data_fim')
          .eq('company_id', cid)
          .not('data_inicio', 'is', null),

        supabase
          .from('fornecedores')
          .select('id, nome, cond_pagamento_padrao')
          .eq('company_id', cid),

        supabase
          .from('etapas')
          .select('id, nome, codigo, ordem')
          .eq('company_id', cid),

        supabase
          .from('parcelas')
          .select('id, pedido_id, valor, data_vencimento, status, valor_pago')
          .eq('company_id', cid)
          .is('deleted_at', null),
      ])

      if (pedRes.error)   throw pedRes.error
      if (itemRes.error)  throw itemRes.error
      if (distRes.error)  throw distRes.error
      if (fornRes.error)  throw fornRes.error
      if (etapaRes.error) throw etapaRes.error
      if (parcRes.error)  throw parcRes.error

      const pedidos = (pedRes.data  ?? []) as PedidoRow[]
      const itens   = (itemRes.data ?? []) as ItemRow[]
      const dists   = (distRes.data ?? []) as DistribuicaoRow[]
      const forns   = (fornRes.data ?? []) as FornecedorRow[]
      const etapas  = (etapaRes.data ?? []) as EtapaRow[]
      const parcs   = (parcRes.data ?? []) as ParcelaRow[]

      // Lookup maps
      const fornMap  = new Map(forns.map(f  => [f.id, f]))
      const etapaMap = new Map(etapas.map(e => [e.id, e]))

      // item_id → PedidoRow[]
      const itemPedidosMap = new Map<string, PedidoRow[]>()
      for (const ped of pedidos) {
        const list = itemPedidosMap.get(ped.item_compra_id) ?? []
        list.push(ped)
        itemPedidosMap.set(ped.item_compra_id, list)
      }

      // pedido_id → ParcelaConformidade[]
      const parcMap = new Map<string, ParcelaConformidade[]>()
      for (const p of parcs) {
        if (!p.pedido_id) continue
        const list = parcMap.get(p.pedido_id) ?? []
        list.push({ id: p.id, data_vencimento: p.data_vencimento, valor: Number(p.valor), status: p.status, valor_pago: Number(p.valor_pago) })
        parcMap.set(p.pedido_id, list)
      }

      // etapa_id → Map<medicao_numero, { data_inicio, data_fim }>
      type MedInfo2 = { data_inicio: string; data_fim: string | null }
      const etapaMedMap = new Map<string, Map<number, MedInfo2>>()
      const globalMedMap = new Map<number, MedInfo2>()
      for (const dist of dists) {
        // etapa level
        if (!etapaMedMap.has(dist.etapa_id)) etapaMedMap.set(dist.etapa_id, new Map())
        etapaMedMap.get(dist.etapa_id)!.set(dist.medicao_numero, {
          data_inicio: dist.data_inicio,
          data_fim: dist.data_fim ?? null,
        })
        // global (for columns)
        const ex = globalMedMap.get(dist.medicao_numero)
        if (!ex) {
          globalMedMap.set(dist.medicao_numero, { data_inicio: dist.data_inicio, data_fim: dist.data_fim ?? null })
        } else {
          if (dist.data_inicio < ex.data_inicio) ex.data_inicio = dist.data_inicio
          if (dist.data_fim && (!ex.data_fim || dist.data_fim > ex.data_fim)) ex.data_fim = dist.data_fim
        }
      }

      // Build columns
      const nd = new Date()
      const todayISO2 = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-${String(nd.getDate()).padStart(2, '0')}`

      const colunas = Array.from(globalMedMap.entries())
        .map(([numero, info]) => ({
          numero,
          data_inicio:     info.data_inicio,
          data_fim:        info.data_fim,
          dias_ate_inicio: Math.round((localDate(info.data_inicio).getTime() - localDate(todayISO2).getTime()) / 86_400_000),
        }))
        .sort((a, b) => a.numero - b.numero)

      // Build rows
      const linhas: LinhaTabela[] = []

      for (const item of itens) {
        const etapa = etapaMap.get(item.etapa_id)
        if (!etapa) continue

        const etapaMeds = etapaMedMap.get(item.etapa_id)
        if (!etapaMeds || etapaMeds.size === 0) continue // item sem medição → não aparece

        const itemPedidos = itemPedidosMap.get(item.id) ?? []

        if (itemPedidos.length === 0) {
          // Sem pedido — uma linha de aviso
          const por_medicao: LinhaTabela['por_medicao'] = {}
          for (const [medNum, medInfo] of etapaMeds) {
            por_medicao[medNum] = { dias_folga: null, status: 'sem_pedido', data_inicio: medInfo.data_inicio }
          }
          linhas.push({
            etapa_id:              item.etapa_id,
            etapa_nome:            etapa.nome,
            etapa_codigo:          etapa.codigo,
            etapa_ordem:           etapa.ordem,
            item_id:               item.id,
            item_descricao:        item.descricao,
            item_codigo:           item.codigo,
            pedido_id:             null,
            numero_pedido:         null,
            fornecedor_nome:       '—',
            condicao_pagamento:    '',
            valor_total:           0,
            data_entrega_prevista: null,
            por_medicao,
            parcelas:              [],
          })
        } else {
          for (const ped of itemPedidos) {
            const forn = ped.fornecedor_id ? fornMap.get(ped.fornecedor_id) : undefined
            const cond = ped.cond_pagamento ?? forn?.cond_pagamento_padrao ?? ''

            const por_medicao: LinhaTabela['por_medicao'] = {}
            for (const [medNum, medInfo] of etapaMeds) {
              if (ped.data_entrega_prevista) {
                const folga = diasFolga(ped.data_entrega_prevista, medInfo.data_inicio)
                por_medicao[medNum] = { dias_folga: folga, status: calcStatus(folga), data_inicio: medInfo.data_inicio }
              } else {
                por_medicao[medNum] = { dias_folga: null, status: 'sem_pedido', data_inicio: medInfo.data_inicio }
              }
            }

            linhas.push({
              etapa_id:              item.etapa_id,
              etapa_nome:            etapa.nome,
              etapa_codigo:          etapa.codigo,
              etapa_ordem:           etapa.ordem,
              item_id:               item.id,
              item_descricao:        item.descricao,
              item_codigo:           item.codigo,
              pedido_id:             ped.id,
              numero_pedido:         ped.numero_pedido,
              fornecedor_nome:       forn?.nome ?? '—',
              condicao_pagamento:    cond,
              valor_total:           Number(ped.valor_total_real ?? 0),
              data_entrega_prevista: ped.data_entrega_prevista,
              por_medicao,
              parcelas:              parcMap.get(ped.id) ?? [],
            })
          }
        }
      }

      linhas.sort((a, b) => {
        if (a.etapa_ordem !== b.etapa_ordem) return a.etapa_ordem - b.etapa_ordem
        return a.item_descricao.localeCompare(b.item_descricao, 'pt-BR')
      })

      return { colunas, linhas }
    },
  })
}
