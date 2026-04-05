import { useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAvancos, useCreateAvanco } from '@/hooks/useOperacional'
import { useEtapas } from '@/hooks/useEtapas'
import { formatDate } from '@/lib/utils'
import { HardHat, Plus, X, Check, Search, TrendingUp } from 'lucide-react'

export default function AvancoFisicoPage() {
  const { data: avancos = [], isLoading } = useAvancos()
  const { data: etapas = [] } = useEtapas()
  const createAvanco = useCreateAvanco()
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ etapa_id: '', data_registro: '', casas_concluidas: '', observacoes: '' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createAvanco.mutateAsync({
      etapa_id: form.etapa_id,
      data_registro: form.data_registro,
      casas_concluidas: parseInt(form.casas_concluidas),
      observacoes: form.observacoes || null,
    })
    setShowForm(false)
    setForm({ etapa_id: '', data_registro: '', casas_concluidas: '', observacoes: '' })
  }

  const filtered = avancos.filter((a) =>
    (a.etapa_nome ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (a.observacoes ?? '').toLowerCase().includes(search.toLowerCase())
  )

  // Summary by etapa
  const etapaSummary = etapas.map((et) => {
    const total = avancos.filter((a) => a.etapa_id === et.id).reduce((s, a) => s + a.casas_concluidas, 0)
    return { ...et, casas_executadas: total, percent: et.casas_total > 0 ? (total / et.casas_total) * 100 : 0 }
  }).filter((e) => e.casas_total > 0)

  return (
    <div>
      <PageHeader title="Avanço Físico" description="Registro de progresso por etapa" icon={HardHat} />

      {/* Etapa progress cards */}
      {etapaSummary.length > 0 && (
        <div className="mb-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {etapaSummary.map((e) => (
            <div key={e.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{e.codigo} - {e.nome}</p>
                <span className="text-xs font-bold text-primary">{e.percent.toFixed(0)}%</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{e.casas_executadas} / {e.casas_total} casas</span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(e.percent, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Registrar
        </button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-xl border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Novo Registro de Avanço</h3>
            <button onClick={() => setShowForm(false)} className="rounded-md p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Etapa *</label>
                <select value={form.etapa_id} onChange={(e) => setForm((p) => ({ ...p, etapa_id: e.target.value }))} required className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="">Selecione</option>
                  {etapas.map((e) => <option key={e.id} value={e.id}>{e.codigo} - {e.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Data *</label>
                <input type="date" value={form.data_registro} onChange={(e) => setForm((p) => ({ ...p, data_registro: e.target.value }))} required className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Casas Concluídas *</label>
                <input type="number" min="1" value={form.casas_concluidas} onChange={(e) => setForm((p) => ({ ...p, casas_concluidas: e.target.value }))} required className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Observações</label>
              <textarea value={form.observacoes} onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))} rows={2} className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
              <button type="submit" className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"><Check className="h-4 w-4" />Registrar</button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed">
          <div className="text-center"><TrendingUp className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">Nenhum registro de avanço</p></div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Etapa</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Casas</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Observações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 text-xs">{formatDate(a.data_registro)}</td>
                  <td className="px-4 py-3"><span className="text-xs font-mono text-muted-foreground">{a.etapa_codigo}</span> {a.etapa_nome}</td>
                  <td className="px-4 py-3 text-center font-bold text-primary">{a.casas_concluidas}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{a.observacoes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
