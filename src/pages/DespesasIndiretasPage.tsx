import { useState, useMemo } from 'react'
import { Plus, Search, Calendar, RefreshCcw, Building2, Edit2, Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useDespesasIndiretas, DespesaIndireta } from '@/hooks/useDespesasIndiretas'
import { DespesaIndiretaModal } from '@/components/despesas-indiretas/DespesaIndiretaModal'

function formatCurrency(v: number | string | null | undefined): string {
  if (v == null || isNaN(Number(v))) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))
}

const tableHeader = 'text-[10px] font-semibold tracking-wider text-muted-foreground uppercase py-3 px-4 text-left border-b bg-muted/30'
const tableCell = 'px-4 py-3 align-middle text-sm border-b'

export default function DespesasIndiretasPage() {
  const { despesas, isLoading, deleteDespesa } = useDespesasIndiretas()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingDespesa, setEditingDespesa] = useState<DespesaIndireta | null>(null)
  
  const filteredDespesas = useMemo(() => {
    let result = despesas
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(d => 
        d.descricao.toLowerCase().includes(q) || 
        d.categoria.toLowerCase().includes(q) ||
        d.fornecedor_nome?.toLowerCase().includes(q)
      )
    }
    return result
  }, [despesas, search])

  // Group by categoria
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof filteredDespesas>()
    filteredDespesas.forEach(d => {
      const g = groups.get(d.categoria) || []
      g.push(d)
      groups.set(d.categoria, g)
    })
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredDespesas])

  const handleEdit = (d: DespesaIndireta) => {
    setEditingDespesa(d)
    setModalOpen(true)
  }

  const handleDelete = async (d: DespesaIndireta) => {
    if (confirm(`Excluir a despesa "${d.descricao}"? As parcelas futuras serão pagadas.`)) {
      await deleteDespesa(d.id)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 lg:px-8 bg-background/50 backdrop-blur-sm z-10 sticky top-0">
        <h1 className="text-lg font-semibold tracking-tight">Custos Indiretos</h1>
        <button
          onClick={() => { setEditingDespesa(null); setModalOpen(true) }}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nova Despesa</span>
        </button>
      </header>

      <div className="flex-1 overflow-auto p-4 lg:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar despesas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-md border border-input pl-9 pr-4 text-sm bg-background shadow-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              />
            </div>
          </div>

          {!isLoading && grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center text-muted-foreground bg-muted/10">
              <Building2 className="mb-4 h-8 w-8 opacity-20" />
              <p className="mb-1 text-sm font-medium text-foreground">Nenhuma despesa encontrada</p>
              <p className="text-xs">Clique no botão acima para adicionar um custo indireto.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {grouped.map(([categoria, items]) => {
                const orcadoGrp = items.reduce((s, i) => s + Number(i.valor_orcado), 0)
                const consumGrp = items.reduce((s, i) => s + Number(i.valor_consumido), 0)

                return (
                  <div key={categoria} className="rounded-xl border bg-card shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-3">
                      <h3 className="font-semibold text-sm flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary/60"></span>
                        {categoria}
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ml-2">
                          {items.length} itens
                        </span>
                      </h3>
                      <div className="flex gap-4 text-xs">
                        <span className="text-muted-foreground">Orçado: <span className="font-medium text-foreground">{formatCurrency(orcadoGrp)}</span></span>
                        <span className="text-muted-foreground">Consumido: <span className="font-medium text-foreground">{formatCurrency(consumGrp)}</span></span>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr>
                            <th className={tableHeader}>Descrição</th>
                            <th className={tableHeader}>Período / Recorrência</th>
                            <th className={tableHeader}>Orçado</th>
                            <th className={tableHeader}>Consumido</th>
                            <th className={tableHeader}>Saldo</th>
                            <th className={`${tableHeader} w-10`}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map(d => (
                            <tr key={d.id} className="hover:bg-muted/10 transition-colors group">
                              <td className={tableCell}>
                                <div className="font-medium text-foreground">{d.descricao}</div>
                                {d.fornecedor_nome && <div className="text-xs text-muted-foreground mt-0.5">{d.fornecedor_nome}</div>}
                              </td>
                              <td className={tableCell}>
                                <div className="flex flex-col gap-1">
                                  {d.recorrente ? (
                                    <span className="inline-flex w-fit items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-900/30 dark:text-blue-300">
                                      <RefreshCcw className="h-3 w-3" />
                                      {d.frequencia}
                                    </span>
                                  ) : (
                                    <span className="inline-flex w-fit items-center gap-1 rounded bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10 dark:bg-slate-800 dark:text-slate-400">
                                      Pontual
                                    </span>
                                  )}
                                  {d.data_inicio && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                      <Calendar className="h-3 w-3" />
                                      {format(parseISO(d.data_inicio), 'dd/MMM/yy', { locale: ptBR })}
                                      {d.data_fim && ` até ${format(parseISO(d.data_fim), 'dd/MMM/yy', { locale: ptBR })}`}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className={`${tableCell} tabular-nums font-medium`}>{formatCurrency(d.valor_orcado)}</td>
                              <td className={`${tableCell} tabular-nums`}>{formatCurrency(d.valor_consumido)}</td>
                              <td className={`${tableCell} tabular-nums font-medium ${Number(d.valor_saldo) < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{formatCurrency(d.valor_saldo)}</td>
                              <td className={tableCell}>
                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => handleEdit(d)} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
                                    <Edit2 className="h-4 w-4" />
                                  </button>
                                  <button onClick={() => handleDelete(d)} className="p-1 hover:bg-red-50 rounded text-muted-foreground hover:text-red-500">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <DespesaIndiretaModal 
          onClose={() => setModalOpen(false)} 
          initialData={editingDespesa} 
        />
      )}
    </div>
  )
}
