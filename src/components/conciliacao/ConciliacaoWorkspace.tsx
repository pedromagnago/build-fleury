import { useState, useCallback, useMemo } from 'react'
import { Parcela } from '@/hooks/useFinanceiro'
import { ReconciliationResult } from '@/hooks/useConciliacao'
import { SystemColumn } from './SystemColumn'
import { BankColumn } from './BankColumn'
import { ActionEngineColumn } from './ActionEngineColumn'
import { BulkActionBar } from './BulkActionBar'

export interface ConciliacaoWorkspaceProps {
  parcelas: Parcela[]
  movimentacoes: any[]
  reconcResult: ReconciliationResult | null
  savedConcs: any[]
  onQuickConciliar: () => void
  isProcessing: boolean
}

export function ConciliacaoWorkspace({
  parcelas,
  movimentacoes,
  reconcResult,
  savedConcs,
  onQuickConciliar,
  isProcessing
}: ConciliacaoWorkspaceProps) {
  const [activeMovId, setActiveMovId] = useState<string | null>(null)
  const [activeParcelaId, setActiveParcelaId] = useState<string | null>(null)
  const [systemFilter, setSystemFilter] = useState<'all' | 'pagas' | 'pendentes'>('pagas')
  
  // Bulk selection state
  const [selectedMovIds, setSelectedMovIds] = useState<Set<string>>(new Set())
  const [selectedParcelaIds, setSelectedParcelaIds] = useState<Set<string>>(new Set())

  const toggleMovSelection = useCallback((id: string) => {
    setSelectedMovIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleParcelaSelection = useCallback((id: string) => {
    setSelectedParcelaIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAllFilteredMovs = useCallback((ids: string[]) => {
    setSelectedMovIds(new Set(ids))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedMovIds(new Set())
    setSelectedParcelaIds(new Set())
  }, [])

  // Build a map: parcela_id -> conciliacao data for confirmed matches
  const confirmedParcelaIds = useMemo(() => {
    const ids = new Set<string>()
    for (const conc of savedConcs) {
      if (conc.status === 'confirmado') {
        for (const link of (conc.conciliacao_parcelas ?? [])) {
          ids.add(link.parcela_id)
        }
      }
    }
    return ids
  }, [savedConcs])

  // Build a map: movimentacao_id -> parcela_ids for reconciled items
  const movToParcelaMap = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const conc of savedConcs) {
      if (conc.status === 'confirmado' || conc.status === 'sugerido') {
        const parcelaIds = (conc.conciliacao_parcelas ?? []).map((l: any) => l.parcela_id)
        if (parcelaIds.length > 0) {
          map.set(conc.movimentacao_id, parcelaIds)
        }
      }
    }
    return map
  }, [savedConcs])

  // Build reverse map: parcela_id -> movimentacao_id
  const parcelaToMovMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const conc of savedConcs) {
      if (conc.status === 'confirmado' || conc.status === 'sugerido') {
        for (const link of (conc.conciliacao_parcelas ?? [])) {
          map.set(link.parcela_id, conc.movimentacao_id)
        }
      }
    }
    return map
  }, [savedConcs])

  // Handle clicking an extrato row -> filter parcelas to its linked ones
  const handleSelectMov = useCallback((id: string) => {
    setActiveMovId(prev => prev === id ? null : id)
    setActiveParcelaId(null) // clear parcela selection when selecting extrato
  }, [])

  // Handle clicking a parcela row -> filter extrato to its linked one
  const handleSelectParcela = useCallback((id: string) => {
    setActiveParcelaId(prev => prev === id ? null : id)
    setActiveMovId(null) // clear extrato selection when selecting parcela
  }, [])

  // When an extrato is selected, find linked parcela IDs (from engine results OR saved concs)
  const linkedParcelaIds = useMemo(() => {
    if (!activeMovId) return []
    // First check reconciliation engine results
    const engineMatch = reconcResult?.matches.find(m => (m.transaction as any)._movId === activeMovId)
    if (engineMatch && engineMatch.parcelas.length > 0) {
      return engineMatch.parcelas.map(p => p.parcela.id)
    }
    // Fall back to saved conciliacoes
    return movToParcelaMap.get(activeMovId) ?? []
  }, [activeMovId, reconcResult, movToParcelaMap])

  // When a parcela is selected, find linked movimentacao ID
  const linkedMovId = useMemo(() => {
    if (!activeParcelaId) return null
    return parcelaToMovMap.get(activeParcelaId) ?? null
  }, [activeParcelaId, parcelaToMovMap])

  // Find active mov and match for the action column
  const effectiveMovId = activeMovId || linkedMovId
  const activeMov = effectiveMovId ? movimentacoes.find((m: any) => m.id === effectiveMovId) : null
  const activeMatch = (reconcResult && effectiveMovId) 
    ? reconcResult.matches.find(m => (m.transaction as any)._movId === effectiveMovId) 
    : null

  // Find active parcela for detail display
  const activeParcela = activeParcelaId ? (parcelas.find(p => p.id === activeParcelaId) ?? null) : null

  const totalSelected = selectedMovIds.size + selectedParcelaIds.size

  return (
    <div className="space-y-3">
      {/* Bulk Action Bar — shown when items are selected */}
      {totalSelected > 0 && (
        <BulkActionBar
          selectedMovIds={selectedMovIds}
          selectedParcelaIds={selectedParcelaIds}
          movimentacoes={movimentacoes}
          reconcResult={reconcResult}
          onClearSelection={clearSelection}
          onSuccess={onQuickConciliar}
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 h-[800px] max-h-[calc(100vh-12rem)]">
        {/* Coluna 1: Parcelas do Sistema */}
        <SystemColumn 
          parcelas={parcelas}
          linkedParcelaIds={linkedParcelaIds}
          confirmedParcelaIds={confirmedParcelaIds}
          filterMode={systemFilter}
          onFilterChange={setSystemFilter}
          selectedIds={selectedParcelaIds}
          onToggleSelect={toggleParcelaSelection}
          activeParcelaId={activeParcelaId}
          onSelectParcela={handleSelectParcela}
        />

        {/* Coluna 2: Extrato Bancário */}
        <BankColumn 
          movimentacoes={movimentacoes}
          reconcResult={reconcResult}
          activeMovId={activeMovId}
          linkedMovId={linkedMovId}
          onSelect={handleSelectMov}
          selectedIds={selectedMovIds}
          onToggleSelect={toggleMovSelection}
          onSelectAllFiltered={selectAllFilteredMovs}
        />

        {/* Coluna 3: Detalhes + Ações */}
        <ActionEngineColumn 
          activeMov={activeMov}
          activeParcela={activeParcela}
          activeMatch={activeMatch ?? null}
          savedConcs={savedConcs}
          onSuccess={() => onQuickConciliar()}
          isProcessing={isProcessing}
        />
      </div>
    </div>
  )
}
