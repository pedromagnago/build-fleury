import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { X } from 'lucide-react'

interface BaixaRow {
  mov_data: string
  conta_id: string
  mov_descricao: string | null
  valor_aplicado: number
}

interface Props {
  /** Campo de filtro na tabela conciliacao_parcelas */
  filterField: 'parcela_id' | 'mutuo_parcela_id'
  /** IDs a filtrar (.in) */
  filterValues: string[]
  titulo: string
  contasMap: Map<string, string>
  onClose: () => void
}

export function BaixasDrawer({ filterField, filterValues, titulo, contasMap, onClose }: Props) {
  const [baixas, setBaixas] = useState<BaixaRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (filterValues.length === 0) { setLoading(false); return }
    setLoading(true)
    ;(async () => {
      const { data } = await supabase
        .from('conciliacao_parcelas')
        .select(`valor_aplicado, conciliacoes!inner(status, movimentacoes_bancarias!inner(data, valor, descricao, conta_id))`)
        .in(filterField, filterValues)
      const rows: BaixaRow[] = []
      for (const row of (data ?? []) as any[]) {
        const c = Array.isArray(row.conciliacoes) ? row.conciliacoes[0] : row.conciliacoes
        if (!c || c.status === 'rejeitado') continue
        const m = Array.isArray(c.movimentacoes_bancarias) ? c.movimentacoes_bancarias[0] : c.movimentacoes_bancarias
        if (!m) continue
        rows.push({ mov_data: m.data, conta_id: m.conta_id, mov_descricao: m.descricao, valor_aplicado: Number(row.valor_aplicado) })
      }
      rows.sort((a, b) => a.mov_data.localeCompare(b.mov_data))
      setBaixas(rows)
      setLoading(false)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterField, filterValues.join(',')])

  const total = baixas.reduce((s, r) => s + r.valor_aplicado, 0)

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/20" onClick={onClose} />
      <div className="w-[420px] bg-card border-l shadow-xl flex flex-col">
        <div className="flex items-start justify-between border-b px-4 py-3 gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm">Histórico de Baixas</p>
            <p className="text-xs text-muted-foreground truncate max-w-[340px]" title={titulo}>{titulo}</p>
          </div>
          <button onClick={onClose} className="flex-none rounded p-1 hover:bg-muted mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Carregando…</div>
          ) : baixas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center px-6">
              <p className="text-sm">Nenhuma baixa via conciliação</p>
              <p className="text-xs mt-1">Pode ter sido registrado manualmente via campo valor pago</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 z-10">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Data</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Conta</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Descrição</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Valor</th>
                </tr>
              </thead>
              <tbody>
                {baixas.map((b, i) => (
                  <tr key={i} className="border-b hover:bg-muted/20">
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{formatDate(b.mov_data)}</td>
                    <td className="px-3 py-2 max-w-[90px]">
                      <span className="truncate block" title={contasMap.get(b.conta_id) ?? b.conta_id}>
                        {contasMap.get(b.conta_id) ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[140px]">
                      <span className="truncate block" title={b.mov_descricao ?? undefined}>{b.mov_descricao || '—'}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-600 whitespace-nowrap">
                      {formatCurrency(b.valor_aplicado)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {baixas.length > 0 && (
          <div className="border-t px-4 py-2.5 flex items-center justify-between text-xs bg-muted/30">
            <span className="text-muted-foreground">{baixas.length} baixa{baixas.length !== 1 ? 's' : ''}</span>
            <span className="font-semibold text-emerald-600 tabular-nums">{formatCurrency(total)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
