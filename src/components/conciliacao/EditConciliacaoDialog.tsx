/**
 * Build Fleury — Modal de Edição de Conciliação
 *
 * Permite editar as parcelas vinculadas a uma conciliação já confirmada.
 * Ajusta valor_aplicado por parcela e recalcula status/valor_pago automaticamente.
 */
import { useState, useMemo, useEffect } from 'react'
import { X, Plus, Trash2, Save, AlertTriangle, Search } from 'lucide-react'
import { useUpdateConciliacao } from '@/hooks/useConciliacao'
import { useParcelas } from '@/hooks/useFinanceiro'
import { formatCurrency } from '@/lib/utils'

interface Props {
  conciliacao: any
  movimentacao: any
  onClose: () => void
}

export function EditConciliacaoDialog({ conciliacao, movimentacao, onClose }: Props) {
  const { data: parcelas = [] } = useParcelas()
  const update = useUpdateConciliacao()

  const [links, setLinks] = useState<{ parcela_id: string; valor_aplicado: number }[]>(() =>
    (conciliacao.conciliacao_parcelas ?? []).map((l: any) => ({
      parcela_id: l.parcela_id,
      valor_aplicado: Number(l.valor_aplicado),
    }))
  )
  const [search, setSearch] = useState('')
  const [showPicker, setShowPicker] = useState(false)

  const parcelaById = useMemo(() => {
    const m = new Map<string, any>()
    for (const p of parcelas) m.set(p.id, p)
    return m
  }, [parcelas])

  const totalAplicado = links.reduce((s, l) => s + Number(l.valor_aplicado || 0), 0)
  const valorMov = Math.abs(Number(movimentacao?.valor ?? 0))
  const diferenca = valorMov - totalAplicado

  const filteredParcelas = useMemo(() => {
    const selected = new Set(links.map(l => l.parcela_id))
    const q = search.toLowerCase().trim()
    return parcelas
      .filter(p => !selected.has(p.id))
      .filter(p => {
        if (!q) return true
        return (p.pedido_item ?? '').toLowerCase().includes(q)
          || (p.descricao ?? '').toLowerCase().includes(q)
          || String(p.valor).includes(q)
      })
      .slice(0, 15)
  }, [parcelas, links, search])

  const handleAdd = (parcelaId: string) => {
    const p = parcelaById.get(parcelaId)
    if (!p) return
    const jaAplicado = Number(p.valor_pago) || 0
    const restante = Math.max(0, Number(p.valor) - jaAplicado)
    const sugerido = Math.min(restante, Math.max(0, diferenca))
    setLinks(prev => [...prev, { parcela_id: parcelaId, valor_aplicado: sugerido > 0 ? sugerido : Number(p.valor) }])
    setShowPicker(false)
    setSearch('')
  }

  const handleRemove = (parcelaId: string) => {
    setLinks(prev => prev.filter(l => l.parcela_id !== parcelaId))
  }

  const handleValor = (parcelaId: string, valor: number) => {
    setLinks(prev => prev.map(l => l.parcela_id === parcelaId ? { ...l, valor_aplicado: valor } : l))
  }

  const handleSave = async () => {
    if (links.length === 0) {
      if (!confirm('Remover todas as parcelas deixará esta conciliação sem vínculos. Continuar?')) return
    }
    await update.mutateAsync({ conciliacaoId: conciliacao.id, parcelas: links })
    onClose()
  }

  // ESC to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-2xl rounded-xl border bg-card shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-base font-bold">Editar Conciliação</h2>
            <p className="text-[11px] text-muted-foreground">
              {movimentacao?.descricao ?? '—'} · {movimentacao?.data ?? ''} ·{' '}
              <span className={movimentacao?.tipo === 'entrada' ? 'text-emerald-600' : 'text-red-500'}>
                {formatCurrency(valorMov)}
              </span>
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {/* Linked parcels */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Parcelas Vinculadas ({links.length})
              </p>
              <button onClick={() => setShowPicker(v => !v)}
                className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground hover:opacity-90">
                <Plus className="h-3 w-3" />Adicionar
              </button>
            </div>

            {links.length === 0 && (
              <p className="rounded-md bg-muted/40 p-3 text-center text-xs text-muted-foreground">
                Nenhuma parcela vinculada
              </p>
            )}

            <div className="space-y-2">
              {links.map(l => {
                const p = parcelaById.get(l.parcela_id)
                return (
                  <div key={l.parcela_id} className="flex items-center gap-2 rounded-md border bg-card p-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">
                        {p?.pedido_item ?? p?.descricao ?? 'Parcela'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Venc: {p?.data_vencimento ?? '—'} · Valor: {formatCurrency(Number(p?.valor ?? 0))}
                        {' · '}Pago: {formatCurrency(Number(p?.valor_pago ?? 0))}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <input type="number" step="0.01" value={l.valor_aplicado}
                        onChange={(e) => handleValor(l.parcela_id, Number(e.target.value) || 0)}
                        className="w-28 rounded border bg-background px-2 py-1 text-xs text-right font-mono" />
                      <button onClick={() => handleRemove(l.parcela_id)}
                        className="rounded p-1 hover:bg-red-500/10 text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Parcel picker */}
          {showPicker && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar parcela por descrição ou valor..." autoFocus
                  className="w-full rounded-md border bg-background pl-7 pr-2 py-1.5 text-xs" />
              </div>
              <div className="max-h-60 overflow-auto space-y-1">
                {filteredParcelas.map(p => (
                  <button key={p.id} onClick={() => handleAdd(p.id)}
                    className="w-full flex items-center justify-between rounded p-2 hover:bg-card text-left">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs truncate">{p.pedido_item ?? p.descricao ?? 'Parcela'}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {p.data_vencimento} · {p.status}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-semibold">{formatCurrency(Number(p.valor))}</span>
                  </button>
                ))}
                {filteredParcelas.length === 0 && (
                  <p className="py-2 text-center text-[11px] text-muted-foreground">
                    Nenhuma parcela encontrada
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="rounded-md border bg-muted/30 p-3 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Valor da movimentação</span>
              <span className="font-mono font-semibold">{formatCurrency(valorMov)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Total aplicado</span>
              <span className="font-mono font-semibold">{formatCurrency(totalAplicado)}</span>
            </div>
            <div className={`flex justify-between text-sm pt-1 border-t ${
              Math.abs(diferenca) < 0.01 ? 'text-emerald-600' : 'text-amber-600'
            }`}>
              <span className="font-bold">Diferença</span>
              <span className="font-mono font-bold">{formatCurrency(diferenca)}</span>
            </div>
            {Math.abs(diferenca) >= 0.01 && (
              <p className="flex items-start gap-1 pt-1 text-[10px] text-amber-600">
                <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>Diferença será registrada na conciliação. Ajuste os valores para zerar, se for o caso.</span>
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t p-4">
          <button onClick={onClose}
            className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">Cancelar</button>
          <button onClick={handleSave} disabled={update.isPending}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <Save className="h-3.5 w-3.5" />
            {update.isPending ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}
