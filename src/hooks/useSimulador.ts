/**
 * Build Fleury — useSimulador hook
 *
 * Carrega dados base, gerencia estado do cenário via useReducer,
 * e recalcula snapshot/cashflow/métricas via useMemo.
 */

import { useReducer, useMemo, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { toast } from 'sonner'
import {
  buildBaseSnapshot, applyAdjustments, computeCashFlow, computeMetrics,
  diffParcelas, countChanges,
  type SimSnapshot, type Adjustment, type CashFlowPoint, type SimMetrics, type ParcelaImpacto,
} from '@/lib/simuladorEngine'

// ═══════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════

interface SimState {
  cenarioId: string | null      // null = "Base"
  cenarioNome: string
  cenarioTipo: string           // 'base' | 'custom' | 'aplicado'
  adjustments: Adjustment[]
  undoStack: Adjustment[][]
  redoStack: Adjustment[][]
}

type SimAction =
  | { type: 'ADD_ADJUSTMENT'; adjustment: Adjustment }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESET' }
  | { type: 'LOAD_CENARIO'; id: string | null; nome: string; tipo: string; adjustments: Adjustment[] }
  | { type: 'NEW_CENARIO'; nome: string }
  | { type: 'SET_ADJUSTMENTS'; adjustments: Adjustment[] }

const MAX_UNDO = 20

function reducer(state: SimState, action: SimAction): SimState {
  switch (action.type) {
    case 'ADD_ADJUSTMENT': {
      const adj = action.adjustment
      // Replace existing adjustment for same target, or add new
      let newAdj = [...state.adjustments]
      const existIdx = newAdj.findIndex(a => {
        if (a.type !== adj.type) return false
        if (a.type === 'mover_etapa' && adj.type === 'mover_etapa') return a.etapaId === adj.etapaId
        if (a.type === 'alterar_cond_fornecedor' && adj.type === 'alterar_cond_fornecedor') return a.fornecedorId === adj.fornecedorId
        if (a.type === 'adiar_medicao' && adj.type === 'adiar_medicao') return a.medicaoId === adj.medicaoId
        return false
      })
      if (existIdx >= 0) {
        // Remove if delta is 0
        if (adj.type === 'mover_etapa' && adj.deltaDias === 0) {
          newAdj.splice(existIdx, 1)
        } else {
          newAdj[existIdx] = adj
        }
      } else {
        if (adj.type === 'mover_etapa' && adj.deltaDias === 0) return state
        newAdj.push(adj)
      }
      const undoStack = [...state.undoStack, state.adjustments].slice(-MAX_UNDO)
      return { ...state, adjustments: newAdj, undoStack, redoStack: [] }
    }
    case 'UNDO': {
      if (state.undoStack.length === 0) return state
      const prev = state.undoStack[state.undoStack.length - 1]!
      return {
        ...state,
        adjustments: prev,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, state.adjustments],
      }
    }
    case 'REDO': {
      if (state.redoStack.length === 0) return state
      const next = state.redoStack[state.redoStack.length - 1]!
      return {
        ...state,
        adjustments: next,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, state.adjustments],
      }
    }
    case 'RESET':
      return { ...state, adjustments: [], undoStack: [...state.undoStack, state.adjustments].slice(-MAX_UNDO), redoStack: [] }
    case 'LOAD_CENARIO':
      return { cenarioId: action.id, cenarioNome: action.nome, cenarioTipo: action.tipo, adjustments: action.adjustments, undoStack: [], redoStack: [] }
    case 'NEW_CENARIO':
      return { cenarioId: null, cenarioNome: action.nome, cenarioTipo: 'custom', adjustments: [], undoStack: [], redoStack: [] }
    case 'SET_ADJUSTMENTS':
      return { ...state, adjustments: action.adjustments }
    default:
      return state
  }
}

// ═══════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════

export function useSimulador() {
  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const cid = currentCompany?.id ?? ''

  const [state, dispatch] = useReducer(reducer, {
    cenarioId: null, cenarioNome: 'Base', cenarioTipo: 'base',
    adjustments: [], undoStack: [], redoStack: [],
  })

  // ─── Load base data ───────────────────────────────────
  const { data: etapas = [] } = useQuery({
    queryKey: ['sim-etapas', cid],
    queryFn: async () => {
      const { data } = await supabase.from('etapas').select('*').eq('company_id', cid).order('ordem')
      return data ?? []
    },
    enabled: !!cid, staleTime: 300_000,
  })

  const { data: pedidosRaw = [] } = useQuery({
    queryKey: ['sim-pedidos', cid],
    queryFn: async () => {
      const { data } = await supabase
        .from('pedidos')
        .select('*, itens_compra!inner(descricao, codigo, etapa_id), fornecedores(nome)')
        .eq('company_id', cid)
      return (data ?? []).map((p: any) => ({
        ...p,
        etapa_id: p.itens_compra?.etapa_id ?? '',
        item_descricao: p.itens_compra?.descricao ?? '',
        item_codigo: p.itens_compra?.codigo ?? '',
        fornecedor_nome: p.fornecedores?.nome ?? null,
      }))
    },
    enabled: !!cid, staleTime: 300_000,
  })

  const { data: parcelasRaw = [] } = useQuery({
    queryKey: ['sim-parcelas', cid],
    queryFn: async () => {
      const { data } = await supabase
        .from('parcelas')
        .select('*, pedidos(fornecedores(nome), itens_compra(descricao, etapas(nome)))')
        .eq('company_id', cid).is('deleted_at', null)
      return (data ?? []).map((p: any) => ({
        ...p,
        fornecedor_nome: p.pedidos?.fornecedores?.nome ?? null,
        etapa_nome: p.pedidos?.itens_compra?.etapas?.nome ?? null,
      }))
    },
    enabled: !!cid, staleTime: 300_000,
  })

  const { data: medicoes = [] } = useQuery({
    queryKey: ['sim-medicoes', cid],
    queryFn: async () => {
      const { data } = await supabase.from('medicoes').select('*').eq('company_id', cid).order('numero')
      return data ?? []
    },
    enabled: !!cid, staleTime: 300_000,
  })

  const { data: fornecedores = [] } = useQuery({
    queryKey: ['sim-fornecedores', cid],
    queryFn: async () => {
      const { data } = await supabase.from('fornecedores').select('*').eq('company_id', cid).order('nome')
      return data ?? []
    },
    enabled: !!cid, staleTime: 300_000,
  })

  const { data: itensCompra = [] } = useQuery({
    queryKey: ['sim-itens', cid],
    queryFn: async () => {
      const { data } = await supabase
        .from('itens_compra')
        .select('*, etapas(nome), fornecedores(nome)')
        .eq('company_id', cid).is('deleted_at', null)
      return (data ?? []).map((i: any) => ({
        ...i,
        etapa_nome: i.etapas?.nome ?? null,
        fornecedor_nome: i.fornecedores?.nome ?? null,
      }))
    },
    enabled: !!cid, staleTime: 300_000,
  })

  const { data: cenariosList = [] } = useQuery({
    queryKey: ['cenarios', cid],
    queryFn: async () => {
      const { data } = await supabase.from('cenarios').select('*').eq('company_id', cid).order('created_at', { ascending: false })
      return data ?? []
    },
    enabled: !!cid,
  })

  // ─── Computed ─────────────────────────────────────────

  const baseSnapshot = useMemo(() =>
    buildBaseSnapshot(etapas, pedidosRaw, parcelasRaw, medicoes, fornecedores, itensCompra, currentCompany?.saldo_inicial_caixa ?? 0),
    [etapas, pedidosRaw, parcelasRaw, medicoes, fornecedores, itensCompra, currentCompany?.saldo_inicial_caixa],
  )

  const cenarioSnapshot = useMemo(() =>
    applyAdjustments(baseSnapshot, state.adjustments),
    [baseSnapshot, state.adjustments],
  )

  const baseCashFlow = useMemo(() => computeCashFlow(baseSnapshot, false), [baseSnapshot])
  const cenarioCashFlow = useMemo(() => computeCashFlow(cenarioSnapshot, true), [cenarioSnapshot])
  const baseMetrics = useMemo(() => computeMetrics(baseCashFlow), [baseCashFlow])
  const cenarioMetrics = useMemo(() => computeMetrics(cenarioCashFlow), [cenarioCashFlow])
  const impacto = useMemo(() => diffParcelas(cenarioSnapshot), [cenarioSnapshot])
  const numChanges = useMemo(() => countChanges(cenarioSnapshot), [cenarioSnapshot])

  // ─── Actions ──────────────────────────────────────────

  const moverEtapa = useCallback((etapaId: string, deltaDias: number) => {
    dispatch({ type: 'ADD_ADJUSTMENT', adjustment: { type: 'mover_etapa', etapaId, deltaDias } })
  }, [])

  const alterarCondFornecedor = useCallback((fornecedorId: string, novaCond: string) => {
    dispatch({ type: 'ADD_ADJUSTMENT', adjustment: { type: 'alterar_cond_fornecedor', fornecedorId, novaCond } })
  }, [])

  const adiarMedicao = useCallback((medicaoId: string, novaData: string) => {
    dispatch({ type: 'ADD_ADJUSTMENT', adjustment: { type: 'adiar_medicao', medicaoId, novaData } })
  }, [])

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), [])
  const redo = useCallback(() => dispatch({ type: 'REDO' }), [])
  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])

  const moverTodasEtapas = useCallback((deltaDias: number) => {
    const adjs: Adjustment[] = etapas.filter(e => e.data_inicio_plan).map(e => ({
      type: 'mover_etapa' as const, etapaId: e.id, deltaDias,
    }))
    dispatch({ type: 'SET_ADJUSTMENTS', adjustments: adjs })
  }, [etapas])

  // ─── Keyboard shortcuts ──────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Z') { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  // ─── Cenário CRUD ─────────────────────────────────────

  const loadCenario = useCallback(async (cenarioId: string | null) => {
    if (!cenarioId) {
      dispatch({ type: 'LOAD_CENARIO', id: null, nome: 'Base', tipo: 'base', adjustments: [] })
      return
    }
    const c = cenariosList.find(c => c.id === cenarioId)
    if (!c) return
    const { data: ajustes } = await supabase.from('cenario_ajustes').select('*').eq('cenario_id', cenarioId)
    const adjs: Adjustment[] = (ajustes ?? []).map((a: any) => {
      if (a.tipo_ajuste === 'mover_etapa') return { type: 'mover_etapa', etapaId: a.referencia_id, deltaDias: a.delta_dias ?? 0 }
      if (a.tipo_ajuste === 'alterar_cond_fornecedor') return { type: 'alterar_cond_fornecedor', fornecedorId: a.referencia_id, novaCond: a.valor_novo ?? '' }
      return { type: 'adiar_medicao', medicaoId: a.referencia_id, novaData: a.valor_novo ?? '' }
    }) as Adjustment[]
    dispatch({ type: 'LOAD_CENARIO', id: cenarioId, nome: c.nome, tipo: c.tipo ?? 'custom', adjustments: adjs })
  }, [cenariosList])

  const salvarCenario = useMutation({
    mutationFn: async (nome: string) => {
      if (!currentCompany) throw new Error('No company')
      const { data: cenario, error } = await supabase.from('cenarios')
        .insert({ company_id: currentCompany.id, nome, tipo: 'custom' }).select().single()
      if (error) throw error
      // Save adjustments
      if (state.adjustments.length > 0) {
        const rows = state.adjustments.map(a => ({
          company_id: currentCompany.id, cenario_id: cenario.id,
          tipo_ajuste: a.type === 'mover_etapa' ? 'mover_etapa' : a.type === 'alterar_cond_fornecedor' ? 'alterar_cond_fornecedor' : 'adiar_medicao',
          referencia_tipo: a.type === 'mover_etapa' ? 'etapa' : a.type === 'alterar_cond_fornecedor' ? 'fornecedor' : 'medicao',
          referencia_id: a.type === 'mover_etapa' ? a.etapaId : a.type === 'alterar_cond_fornecedor' ? a.fornecedorId : a.medicaoId,
          valor_novo: a.type === 'mover_etapa' ? String(a.deltaDias) : a.type === 'alterar_cond_fornecedor' ? a.novaCond : a.novaData,
          delta_dias: a.type === 'mover_etapa' ? a.deltaDias : 0,
        }))
        await supabase.from('cenario_ajustes').insert(rows)
      }
      dispatch({ type: 'LOAD_CENARIO', id: cenario.id, nome, tipo: 'custom', adjustments: state.adjustments })
      return cenario
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cenarios'] }); toast.success('Cenário salvo') },
    onError: (e: Error) => toast.error(e.message),
  })

  const aplicarAoReal = useMutation({
    mutationFn: async () => {
      if (!currentCompany) throw new Error('No company')
      // Apply etapa moves
      for (const et of cenarioSnapshot.etapas) {
        if (!et.modified) continue
        await supabase.from('etapas').update({
          data_inicio_plan: et.sim_data_inicio, data_fim_plan: et.sim_data_fim,
        }).eq('id', et.id)
      }
      // Apply pedido date moves
      for (const ped of cenarioSnapshot.pedidos) {
        if (!ped.modified) continue
        await supabase.from('pedidos').update({ data_entrega_prevista: ped.sim_data_entrega }).eq('id', ped.id)
      }
      // Apply parcela date/value changes
      for (const parc of cenarioSnapshot.parcelas) {
        if (!parc.modified) continue
        await supabase.from('parcelas').update({
          data_vencimento: parc.sim_data_vencimento, valor: parc.sim_valor,
        }).eq('id', parc.id)
      }
      // Mark cenário as applied
      if (state.cenarioId) {
        await supabase.from('cenarios').update({ tipo: 'aplicado' }).eq('id', state.cenarioId)
      }
      // Audit log
      await supabase.from('audit_logs').insert({
        company_id: currentCompany.id, tabela: 'cenarios',
        registro_id: state.cenarioId ?? 'direto', acao: 'aplicar_cenario',
        agente: 'simulador',
        dados_depois: { etapas_movidas: cenarioSnapshot.etapas.filter(e => e.modified).length, parcelas_recalculadas: cenarioSnapshot.parcelas.filter(p => p.modified).length },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['etapas'] })
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['cenarios'] })
      qc.invalidateQueries({ queryKey: ['sim-etapas'] })
      qc.invalidateQueries({ queryKey: ['sim-pedidos'] })
      qc.invalidateQueries({ queryKey: ['sim-parcelas'] })
      toast.success('Cenário aplicado ao cronograma real!')
      dispatch({ type: 'LOAD_CENARIO', id: null, nome: 'Base', tipo: 'base', adjustments: [] })
    },
    onError: (e: Error) => toast.error('Erro ao aplicar: ' + e.message),
  })

  return {
    // State
    state, cenariosList, numChanges,
    isBase: state.cenarioTipo === 'base' && state.adjustments.length === 0,
    // Data
    baseSnapshot, cenarioSnapshot,
    baseCashFlow, cenarioCashFlow,
    baseMetrics, cenarioMetrics,
    impacto,
    // Actions
    moverEtapa, alterarCondFornecedor, adiarMedicao,
    undo, redo, reset, moverTodasEtapas,
    loadCenario, salvarCenario, aplicarAoReal,
    dispatch,
  }
}
