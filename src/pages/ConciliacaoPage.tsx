import { useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { useMovimentacoes, useCreateMovimentacao, useUpdateMovimentacao } from '@/hooks/useOperacional'
import { useContasBancarias } from '@/hooks/useFinanceiro'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeftRight, Plus, X, Check, Search, CheckCircle2, CircleDot } from 'lucide-react'

export default function ConciliacaoPage() {
  const { data: movs = [], isLoading } = useMovimentacoes()
  const { data: contas = [] } = useContasBancarias()
  const createMov = useCreateMovimentacao()
  const updateMov = useUpdateMovimentacao()
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [filterConciliado, setFilterConciliado] = useState<'' | 'sim' | 'nao'>('')
  const [form, setForm] = useState({ conta_id: '', data: '', descricao: '', valor: '', tipo: 'debito', categoria: '' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createMov.mutateAsync({
      conta_id: form.conta_id,
      data: form.data,
      descricao: form.descricao,
      valor: parseFloat(form.valor),
      tipo: form.tipo as 'credito' | 'debito',
      categoria: form.categoria || null,
    })
    setShowForm(false)
    setForm({ conta_id: '', data: '', descricao: '', valor: '', tipo: 'debito', categoria: '' })
  }

  const toggleConciliado = (id: string, current: boolean) => {
    updateMov.mutate({
      id,
      conciliado: !current,
      conciliado_em: !current ? new Date().toISOString() : null,
    })
  }

  const filtered = movs.filter((m) => {
    const matchSearch = m.descricao.toLowerCase().includes(search.toLowerCase())
    const matchConc = !filterConciliado || (filterConciliado === 'sim' ? m.conciliado : !m.conciliado)
    return matchSearch && matchConc
  })

  const totals = filtered.reduce(
    (acc, m) => ({
      creditos: acc.creditos + (m.tipo === 'credito' ? m.valor : 0),
      debitos: acc.debitos + (m.tipo === 'debito' ? m.valor : 0),
      conciliados: acc.conciliados + (m.conciliado ? 1 : 0),
    }),
    { creditos: 0, debitos: 0, conciliados: 0 }
  )

  return (
    <div>
      <PageHeader title="Conciliação" description="Movimentações bancárias" icon={ArrowLeftRight} />

      <div className="mb-6 grid grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Créditos</p>
          <p className="mt-1 text-xl font-bold text-emerald-500">{formatCurrency(totals.creditos)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Débitos</p>
          <p className="mt-1 text-xl font-bold text-red-500">{formatCurrency(totals.debitos)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Saldo</p>
          <p className="mt-1 text-xl font-bold">{formatCurrency(totals.creditos - totals.debitos)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Conciliados</p>
          <p className="mt-1 text-xl font-bold">{totals.conciliados} / {filtered.length}</p>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <select value={filterConciliado} onChange={(e) => setFilterConciliado(e.target.value as '' | 'sim' | 'nao')} className="rounded-lg border bg-background px-3 py-2 text-sm">
          <option value="">Todos</option><option value="sim">Conciliados</option><option value="nao">Pendentes</option>
        </select>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Nova
        </button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-xl border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Nova Movimentação</h3>
            <button onClick={() => setShowForm(false)} className="rounded-md p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div><label className="mb-1 block text-xs font-medium text-muted-foreground">Conta *</label>
                <select value={form.conta_id} onChange={(e) => setForm((p) => ({ ...p, conta_id: e.target.value }))} required className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="">Selecione</option>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div><label className="mb-1 block text-xs font-medium text-muted-foreground">Data *</label><input type="date" value={form.data} onChange={(e) => setForm((p) => ({ ...p, data: e.target.value }))} required className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" /></div>
              <div><label className="mb-1 block text-xs font-medium text-muted-foreground">Tipo</label>
                <select value={form.tipo} onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value }))} className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="debito">Débito</option><option value="credito">Crédito</option>
                </select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div><label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição *</label><input type="text" value={form.descricao} onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} required className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" /></div>
              <div><label className="mb-1 block text-xs font-medium text-muted-foreground">Valor (R$) *</label><input type="number" step="0.01" value={form.valor} onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))} required className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" /></div>
              <div><label className="mb-1 block text-xs font-medium text-muted-foreground">Categoria</label><input type="text" value={form.categoria} onChange={(e) => setForm((p) => ({ ...p, categoria: e.target.value }))} placeholder="Ex: Material, MO" className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" /></div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
              <button type="submit" className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"><Check className="h-4 w-4" />Criar</button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed"><p className="text-sm text-muted-foreground">Nenhuma movimentação encontrada</p></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground w-10">✓</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Descrição</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Categoria</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((m) => (
                <tr key={m.id} className={`hover:bg-muted/30 ${m.conciliado ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleConciliado(m.id, m.conciliado)} className="rounded-md p-1 hover:bg-accent">
                      {m.conciliado ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <CircleDot className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs">{formatDate(m.data)}</td>
                  <td className="px-4 py-3 font-medium">{m.descricao}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{m.categoria ?? '—'}</td>
                  <td className={`px-4 py-3 text-right font-medium ${m.tipo === 'credito' ? 'text-emerald-500' : 'text-red-500'}`}>
                    {m.tipo === 'credito' ? '+' : '-'}{formatCurrency(m.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
