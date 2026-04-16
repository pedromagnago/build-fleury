import { useState } from 'react'
import { X, CheckCircle2, EyeOff, Tag, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ReconciliationResult } from '@/hooks/useConciliacao'
import { useCreateBankRule, suggestRuleFromTransaction } from '@/hooks/useBankRules'

interface BulkActionBarProps {
  selectedMovIds: Set<string>
  selectedParcelaIds: Set<string>
  movimentacoes: any[]
  reconcResult: ReconciliationResult | null
  onClearSelection: () => void
  onSuccess: () => void
}

export function BulkActionBar({
  selectedMovIds,
  selectedParcelaIds,
  movimentacoes,
  reconcResult,
  onClearSelection,
  onSuccess,
}: BulkActionBarProps) {
  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const createRule = useCreateBankRule()
  const [processing, setProcessing] = useState(false)
  const [showCategorize, setShowCategorize] = useState(false)
  const [categoria, setCategoria] = useState('')

  const totalMovs = selectedMovIds.size
  const totalParcelas = selectedParcelaIds.size

  // Bulk confirm suggested matches
  const handleBulkConfirm = async () => {
    if (!currentCompany || !reconcResult) return
    setProcessing(true)
    try {
      let confirmed = 0
      for (const movId of selectedMovIds) {
        const match = reconcResult.matches.find(m => (m.transaction as any)._movId === movId)
        if (!match || match.matchType === 'none') continue

        // Mark movement as conciliado
        await supabase
          .from('movimentacoes_bancarias')
          .update({ conciliado: true, conciliado_em: new Date().toISOString() })
          .eq('id', movId)

        // Update conciliacao status
        await supabase
          .from('conciliacoes')
          .update({ status: 'confirmado' })
          .eq('movimentacao_id', movId)
          .eq('company_id', currentCompany.id)
          .eq('status', 'sugerido')

        confirmed++
      }

      qc.invalidateQueries({ queryKey: ['movimentacoes'] })
      qc.invalidateQueries({ queryKey: ['conciliacoes'] })
      toast.success(`${confirmed} conciliações confirmadas`)
      onClearSelection()
      onSuccess()
    } catch (err: any) {
      toast.error('Erro: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  // Bulk ignore
  const handleBulkIgnore = async () => {
    if (!currentCompany) return
    setProcessing(true)
    try {
      for (const movId of selectedMovIds) {
        await supabase
          .from('movimentacoes_bancarias')
          .update({ conciliado: true, conciliado_em: new Date().toISOString(), observacao: 'Ignorado em lote' })
          .eq('id', movId)
      }
      qc.invalidateQueries({ queryKey: ['movimentacoes'] })
      toast.success(`${totalMovs} movimentações marcadas como ignoradas`)
      onClearSelection()
      onSuccess()
    } catch (err: any) {
      toast.error('Erro: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  // Bulk categorize + create rule
  const handleBulkCategorize = async () => {
    if (!currentCompany || !categoria.trim()) return
    setProcessing(true)
    try {
      // Categorize selected movements
      for (const movId of selectedMovIds) {
        await supabase
          .from('movimentacoes_bancarias')
          .update({ categoria: categoria.trim() })
          .eq('id', movId)
      }

      // Suggest creating a rule based on first selected
      const firstMov = movimentacoes.find(m => selectedMovIds.has(m.id))
      if (firstMov) {
        const suggestion = suggestRuleFromTransaction(
          firstMov.descricao || firstMov.memo_raw || '',
          Number(firstMov.valor)
        )
        
        // Auto-create rule if more than 3 similar items selected
        if (totalMovs >= 3 && suggestion.padrao_texto) {
          await createRule.mutateAsync({
            nome: `Regra: ${categoria.trim()}`,
            padrao_texto: suggestion.padrao_texto,
            tipo_match: 'contains',
            acao: 'classificar',
            categoria: categoria.trim(),
          })
        }
      }

      qc.invalidateQueries({ queryKey: ['movimentacoes'] })
      toast.success(`${totalMovs} movimentações classificadas como "${categoria}"`)
      setShowCategorize(false)
      setCategoria('')
      onClearSelection()
    } catch (err: any) {
      toast.error('Erro: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  // Count how many selected have valid matches
  const matchedCount = Array.from(selectedMovIds).filter(id => {
    const match = reconcResult?.matches.find(m => (m.transaction as any)._movId === id)
    return match && match.matchType !== 'none'
  }).length

  return (
    <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/80 dark:bg-blue-950/30 dark:border-blue-800 p-3 shadow-sm animate-in slide-in-from-top-2 duration-200">
      {/* Selection info */}
      <div className="flex items-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-300">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] font-bold">
          {totalMovs + totalParcelas}
        </span>
        <span>
          {totalMovs > 0 && `${totalMovs} movimentação(ões)`}
          {totalMovs > 0 && totalParcelas > 0 && ' + '}
          {totalParcelas > 0 && `${totalParcelas} parcela(s)`}
        </span>
      </div>

      <div className="h-5 w-px bg-blue-200 dark:bg-blue-700" />

      {/* Actions */}
      {!showCategorize ? (
        <div className="flex items-center gap-2">
          {matchedCount > 0 && (
            <button
              onClick={handleBulkConfirm}
              disabled={processing}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Confirmar Matches ({matchedCount})
            </button>
          )}

          <button
            onClick={handleBulkIgnore}
            disabled={processing || totalMovs === 0}
            className="flex items-center gap-1.5 rounded-lg border border-muted px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <EyeOff className="h-3.5 w-3.5" />
            Ignorar
          </button>

          <button
            onClick={() => setShowCategorize(true)}
            disabled={processing || totalMovs === 0}
            className="flex items-center gap-1.5 rounded-lg border border-muted px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Tag className="h-3.5 w-3.5" />
            Classificar
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            value={categoria}
            onChange={e => setCategoria(e.target.value)}
            placeholder="Ex: Tarifa Bancária, Material..."
            className="rounded-md border bg-background px-3 py-1.5 text-xs w-48 focus:ring-1 focus:ring-blue-500 outline-none"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleBulkCategorize()}
          />
          <button
            onClick={handleBulkCategorize}
            disabled={!categoria.trim() || processing}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Aplicar'}
          </button>
          <button onClick={() => setShowCategorize(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Close */}
      <button onClick={onClearSelection} className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
