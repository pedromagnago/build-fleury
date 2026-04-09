import React, { useState, useMemo } from 'react'
import { useProject } from '@/contexts/ProjectContext'
import { useParcelas } from '@/hooks/useFinanceiro'
import { useEtapas } from '@/hooks/useEtapas'
import { useMedicoes } from '@/hooks/useOperacional'
import { useMutuos } from '@/hooks/useMutuos'
import { formatCurrency } from '@/lib/utils'
import { ChevronRight, ChevronDown, X, Download, Calendar, CalendarDays } from 'lucide-react'
import FinancialViewFilter, { type FinancialViewMode } from './FinancialViewFilter'
import { useCashFlowEvents } from '@/hooks/useCashFlowEvents'

type Periodicity = 'dia' | 'semana'

const localDate = (iso: string) => {
  if (!iso) return new Date()
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y ?? 2024, (m ?? 1) - 1, d ?? 1)
}

const fc = (v: number) => v === 0 ? '-' : formatCurrency(v)

type Override = { newDate?: string; newValue?: number }

type Item = {
  id: string
  desc: string
  valor: number
  data: string
  tipo: 'entrada' | 'firme' | 'bruto'
  modified?: boolean
  meta?: { cat?: string; etapa?: string; forn?: string; item?: string; orig?: number }
}

interface SimuladorProps {
  viewMode?: FinancialViewMode
  onViewModeChange?: (mode: FinancialViewMode) => void
}

export default function SimuladorPanel({ viewMode: externalMode, onViewModeChange }: SimuladorProps = {}) {
  const { currentCompany } = useProject()
  const { data: parcelas = [] } = useParcelas()
  const { data: medicoes = [] } = useMedicoes()
  const { data: etapas = [] } = useEtapas()
  const { data: mutuos = [] } = useMutuos()

  const [localMode, setLocalMode] = useState<FinancialViewMode>('pedidos')
  const viewMode = externalMode ?? localMode
  const setViewMode = onViewModeChange ?? setLocalMode

  const { events: cashFlowEvents, saldoInicial } = useCashFlowEvents(viewMode)

  const [overrides, setOverrides] = useState<Record<string, Override>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<Item | null>(null)
  const [periodicity, setPeriodicity] = useState<Periodicity>('semana')

  const toggle = (k: string) => setExpanded(p => ({ ...p, [k]: !p[k] }))

  // Generate time buckets based on periodicity
  const weeks = useMemo(() => {
    // 1) Find earliest and latest dates among all data
    let minDateMs = Date.now()
    let maxDateMs = Date.now()

    const checkDate = (d?: string | null) => {
      if (!d) return
      const t = localDate(d).getTime()
      if (t < minDateMs) minDateMs = t
      if (t > maxDateMs) maxDateMs = t
    }

    medicoes.forEach(m => checkDate(m.data_prevista))
    mutuos.forEach(m => { checkDate(m.data_captacao); m.parcelas?.forEach((p: any) => checkDate(p.data_vencimento)) })
    parcelas.forEach(p => checkDate(p.data_vencimento))
    etapas.forEach(e => checkDate(e.data_inicio_plan))

    if (periodicity === 'dia') {
      // Daily buckets: from earliest to now + 3 months
      const startObj = new Date(minDateMs)
      startObj.setHours(0, 0, 0, 0)
      const endObj = new Date()
      endObj.setMonth(endObj.getMonth() + 3)
      endObj.setHours(0, 0, 0, 0)
      const diffMs = endObj.getTime() - startObj.getTime()
      const length = Math.max(30, Math.ceil(diffMs / (24 * 60 * 60 * 1000)) + 1)

      return Array.from({ length }, (_, i) => {
        const s = new Date(startObj)
        s.setDate(startObj.getDate() + i)
        const e = new Date(s) // same day
        return {
          s, e,
          iso0: s.toISOString().split('T')[0]!,
          iso1: s.toISOString().split('T')[0]!,
          lbl: `${String(s.getDate()).padStart(2, '0')}/${String(s.getMonth() + 1).padStart(2, '0')}`,
        }
      })
    }

    // Weekly buckets (default)
    const startObj = new Date(minDateMs)
    const dowStart = startObj.getDay()
    startObj.setDate(startObj.getDate() - (dowStart === 0 ? 6 : dowStart - 1))
    startObj.setHours(0, 0, 0, 0)

    const endObj = new Date()
    endObj.setMonth(endObj.getMonth() + 6)
    const dowEnd = endObj.getDay()
    endObj.setDate(endObj.getDate() - (dowEnd === 0 ? 6 : dowEnd - 1))
    endObj.setHours(0, 0, 0, 0)

    const diffMs = endObj.getTime() - startObj.getTime()
    const length = Math.max(24, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1)

    return Array.from({ length }, (_, i) => {
      const s = new Date(startObj)
      s.setDate(startObj.getDate() + i * 7)
      const e = new Date(s)
      e.setDate(s.getDate() + 6)
      return {
        s, e,
        iso0: s.toISOString().split('T')[0]!,
        iso1: e.toISOString().split('T')[0]!,
        lbl: `${String(s.getDate()).padStart(2, '0')}/${String(s.getMonth() + 1).padStart(2, '0')}`,
      }
    })
  }, [medicoes, mutuos, parcelas, etapas, periodicity])

  // Convert shared events to Item[] with override support
  const items = useMemo(() => {
    return cashFlowEvents.map(ev => {
      const o = overrides[ev.id]
      const mod = !!(o?.newDate || o?.newValue !== undefined)
      return {
        id: ev.id,
        desc: ev.meta.desc,
        valor: o?.newValue ?? ev.valor,
        data: o?.newDate || ev.date,
        tipo: ev.type,
        modified: mod,
        meta: { cat: ev.meta.cat, etapa: ev.meta.etapa, forn: ev.meta.forn, item: ev.meta.item, orig: ev.valor }
      } as Item
    })
  }, [cashFlowEvents, overrides])

  const grid = useMemo(() => {
    let acum = saldoInicial

    const firstWeekStart = weeks[0]?.iso0 || ''
    const past = items.filter(i => i.data < firstWeekStart)
    acum += past.filter(i => i.tipo === 'entrada').reduce((s, i) => s + i.valor, 0)
    acum -= past.filter(i => i.tipo === 'firme').reduce((s, i) => s + i.valor, 0)
    acum -= past.filter(i => i.tipo === 'bruto').reduce((s, i) => s + i.valor, 0)

    return weeks.map(w => {
      const inW = (d: string) => { if (!d) return false; const t = localDate(d).getTime(); return t >= w.s.getTime() && t <= w.e.getTime() }
      const ent = items.filter(i => i.tipo === 'entrada' && inW(i.data))
      const fir = items.filter(i => i.tipo === 'firme' && inW(i.data))
      const bru = items.filter(i => i.tipo === 'bruto' && inW(i.data))
      const sEnt = ent.reduce((s, i) => s + i.valor, 0)
      const sFir = fir.reduce((s, i) => s + i.valor, 0)
      const sBru = bru.reduce((s, i) => s + i.valor, 0)
      const delta = sEnt - sFir - sBru
      acum += delta
      return { ...w, sEnt, sFir, sBru, delta, acum, ent, fir, bru }
    })
  }, [weeks, items, currentCompany, parcelas])

  const numOv = Object.keys(overrides).length

  // Helper: sum items in a week
  const weekSum = (its: Item[], w: typeof grid[0]) =>
    its.filter(i => { const t = localDate(i.data).getTime(); return t >= w.s.getTime() && t <= w.e.getTime() }).reduce((s, i) => s + i.valor, 0)

  const weekMatch = (its: Item[], w: typeof grid[0]) =>
    its.filter(i => { const t = localDate(i.data).getTime(); return t >= w.s.getTime() && t <= w.e.getTime() })

  // 3-level hierarchy: Etapa → Fornecedor → Item
  const subRows = (tipo: 'entrada' | 'firme' | 'bruto') => {
    const filtered = items.filter(i => i.tipo === tipo && weeks.some(w => { const t = localDate(i.data).getTime(); return t >= w.s.getTime() && t <= w.e.getTime() }))

    // Level 1: Group by Etapa
    const etapaGroups = new Map<string, Item[]>()
    filtered.forEach(i => {
      const k = i.meta?.etapa || 'Outros'
      if (!etapaGroups.has(k)) etapaGroups.set(k, [])
      etapaGroups.get(k)!.push(i)
    })

    const rows: React.ReactNode[] = []

    for (const [etapa, etapaItems] of Array.from(etapaGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const etapaKey = `${tipo}-et-${etapa}`

      // ── Etapa row ──
      rows.push(
        <tr key={etapaKey} className="border-b border-muted/40 hover:bg-muted/20 text-[11px] cursor-pointer" onClick={() => toggle(etapaKey)}>
          <td className="sticky left-0 z-10 bg-card border-r px-3 py-1.5 pl-7 font-semibold text-foreground/80">
            <span className="flex items-center gap-1.5">
              {expanded[etapaKey] ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
              <span className="truncate" title={etapa}>📋 {etapa}</span>
            </span>
          </td>
          {grid.map((w, ci) => {
            const sum = weekSum(etapaItems, w)
            return (
              <td key={ci} className="border-r px-2 py-1.5 text-right tabular-nums font-medium">
                {sum > 0 ? formatCurrency(sum) : <span className="text-muted-foreground/20">-</span>}
              </td>
            )
          })}
        </tr>
      )

      if (!expanded[etapaKey]) continue

      // Level 2: Group by Fornecedor within Etapa
      const fornGroups = new Map<string, Item[]>()
      etapaItems.forEach(i => {
        const k = i.meta?.forn || i.meta?.cat || 'Direto'
        if (!fornGroups.has(k)) fornGroups.set(k, [])
        fornGroups.get(k)!.push(i)
      })

      for (const [forn, fornItems] of Array.from(fornGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
        const fornKey = `${tipo}-et-${etapa}-fn-${forn}`

        // ── Fornecedor row ──
        rows.push(
          <tr key={fornKey} className="border-b border-muted/30 hover:bg-muted/15 text-[11px] cursor-pointer" onClick={() => toggle(fornKey)}>
            <td className="sticky left-0 z-10 bg-card border-r px-3 py-1.5 pl-11 font-medium text-foreground/70">
              <span className="flex items-center gap-1.5">
                {expanded[fornKey] ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                <span className="truncate" title={forn}>🏢 {forn}</span>
              </span>
            </td>
            {grid.map((w, ci) => {
              const sum = weekSum(fornItems, w)
              return (
                <td key={ci} className="border-r px-2 py-1.5 text-right tabular-nums text-foreground/70">
                  {sum > 0 ? formatCurrency(sum) : <span className="text-muted-foreground/20">-</span>}
                </td>
              )
            })}
          </tr>
        )

        if (!expanded[fornKey]) continue

        // Level 3: Individual items within Fornecedor
        const itemGroups = new Map<string, Item[]>()
        fornItems.forEach(i => {
          const k = i.desc
          if (!itemGroups.has(k)) itemGroups.set(k, [])
          itemGroups.get(k)!.push(i)
        })

        for (const [desc, its] of itemGroups) {
          rows.push(
            <tr key={`${fornKey}-${desc}`} className="border-b border-muted/20 hover:bg-muted/10 text-[11px]">
              <td className="sticky left-0 z-10 bg-card border-r px-3 py-1.5 pl-[60px] truncate max-w-[220px] text-foreground/60" title={desc}>
                {its[0]!.modified && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 -mt-0.5" />}
                {desc}
              </td>
              {grid.map((w, ci) => {
                const match = weekMatch(its, w)
                const sum = match.reduce((s, i) => s + i.valor, 0)
                return (
                  <td
                    key={ci}
                    className={`border-r px-2 py-1.5 text-right tabular-nums cursor-pointer hover:bg-primary/5 ${match.some(m => m.modified) ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}`}
                    onClick={() => match.length > 0 && setEditing(match[0] ?? null)}
                  >
                    {sum > 0 ? formatCurrency(sum) : <span className="text-muted-foreground/20">-</span>}
                  </td>
                )
              })}
            </tr>
          )
        }
      }
    }

    return rows
  }

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 16rem)' }}>
      {/* Popover de edição */}
      {editing && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setEditing(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[340px] rounded-lg border bg-card p-4 shadow-2xl">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">{editing.meta?.cat}</p>
                <p className="text-sm font-semibold truncate">{editing.desc}</p>
                {editing.meta?.etapa && <p className="text-[10px] text-muted-foreground">Etapa: {editing.meta.etapa}</p>}
                {editing.meta?.item && <p className="text-[10px] text-muted-foreground">Item: {editing.meta.item}</p>}
              </div>
              <button onClick={() => setEditing(null)} className="p-1 rounded hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">Valor (R$)</label>
                <input type="number" value={editing.valor} onChange={e => { setOverrides(p => ({ ...p, [editing.id]: { ...p[editing.id], newValue: Number(e.target.value) } })); setEditing({ ...editing, valor: Number(e.target.value), modified: true }) }} className="w-full border rounded px-2 py-1.5 text-sm bg-background focus:ring-1 focus:ring-primary focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">Data</label>
                <input type="date" value={editing.data} onChange={e => { setOverrides(p => ({ ...p, [editing.id]: { ...p[editing.id], newDate: e.target.value } })); setEditing({ ...editing, data: e.target.value, modified: true }) }} className="w-full border rounded px-2 py-1.5 text-sm bg-background focus:ring-1 focus:ring-primary focus:outline-none" />
              </div>
            </div>
            {editing.modified && editing.meta?.orig !== undefined && (
              <p className="text-[10px] text-muted-foreground mt-2">Original: <span className="line-through">{formatCurrency(editing.meta.orig)}</span></p>
            )}
            <button onClick={() => setEditing(null)} className="w-full mt-3 bg-primary text-primary-foreground rounded py-1.5 text-xs font-semibold hover:bg-primary/90">OK</button>
          </div>
        </>
      )}

      {/* View Mode Filter + Periodicity */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="text-[10px] text-muted-foreground">Visão: {viewMode === 'realizado' ? 'Apenas realizado' : viewMode === 'planejado' ? 'Realizado + Planejado' : 'Realizado + Planejado + Pedidos'}</div>
          {/* Periodicity toggle */}
          <div className="flex items-center rounded-lg border bg-muted/30 p-0.5 gap-0.5">
            <button
              onClick={() => setPeriodicity('dia')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                periodicity === 'dia' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Calendar className="h-3 w-3" /> Dia
            </button>
            <button
              onClick={() => setPeriodicity('semana')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                periodicity === 'semana' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <CalendarDays className="h-3 w-3" /> Semana
            </button>
          </div>
        </div>
        <FinancialViewFilter value={viewMode} onChange={setViewMode} />
      </div>

      {/* Header */}
      {numOv > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2 rounded-lg border bg-amber-50/50 dark:bg-amber-900/10">
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">{numOv} simulações</span>
          <button onClick={() => setOverrides({})} className="text-[10px] underline text-muted-foreground">Limpar</button>
          <button className="flex items-center gap-1 bg-emerald-600 text-white rounded px-3 py-1.5 text-[10px] font-semibold hover:bg-emerald-700 ml-auto"><Download className="h-3 w-3" /> Exportar</button>
        </div>
      )}

      {/* Tabela */}
      <div className="flex-1 overflow-auto rounded-xl border">
        <table className="border-collapse text-xs min-w-max">
          <thead className="sticky top-0 z-30 bg-muted/80 backdrop-blur">
            <tr className="border-b">
              <th className="sticky left-0 z-40 bg-muted/90 border-r px-3 py-2.5 text-left text-[10px] font-bold uppercase text-muted-foreground tracking-wider w-[220px] min-w-[220px]">Categoria</th>
              {grid.map((w, i) => (
                <th key={i} className={`border-r px-2 py-2.5 text-center font-medium ${periodicity === 'dia' ? 'w-[80px] min-w-[80px]' : 'w-[110px] min-w-[110px]'}`}>
                  <div className="text-[9px] text-muted-foreground">{periodicity === 'dia' ? `D${i + 1}` : `S${i + 1}`}</div>
                  <div className="text-[10px] mt-0.5">{w.lbl}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* ENTRADAS */}
            <tr className="border-b bg-emerald-50/40 dark:bg-emerald-950/10 font-semibold cursor-pointer hover:bg-emerald-50/60" onClick={() => toggle('ent')}>
              <td className="sticky left-0 z-10 bg-emerald-50/60 dark:bg-emerald-950/20 border-r px-3 py-2.5 flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                {expanded.ent ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                (+) Entradas
              </td>
              {grid.map((w, i) => (
                <td key={i} className="border-r px-2 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{fc(w.sEnt)}</td>
              ))}
            </tr>
            {expanded.ent && subRows('entrada')}

            {/* SAÍDAS FIRMES */}
            <tr className="border-b bg-red-50/40 dark:bg-red-950/10 font-semibold cursor-pointer hover:bg-red-50/60" onClick={() => toggle('fir')}>
              <td className="sticky left-0 z-10 bg-red-50/60 dark:bg-red-950/20 border-r px-3 py-2.5 flex items-center gap-1.5 text-red-700 dark:text-red-400">
                {expanded.fir ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                (-) Pedidos
              </td>
              {grid.map((w, i) => (
                <td key={i} className="border-r px-2 py-2.5 text-right tabular-nums text-red-700 dark:text-red-400">{fc(w.sFir)}</td>
              ))}
            </tr>
            {expanded.fir && subRows('firme')}

            {/* SAÍDAS BRUTAS */}
            <tr className="border-b bg-orange-50/40 dark:bg-orange-950/10 font-semibold cursor-pointer hover:bg-orange-50/60" onClick={() => toggle('bru')}>
              <td className="sticky left-0 z-10 bg-orange-50/60 dark:bg-orange-950/20 border-r px-3 py-2.5 flex items-center gap-1.5 text-orange-700 dark:text-orange-400">
                {expanded.bru ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                (-) Previsto (Bruto)
              </td>
              {grid.map((w, i) => (
                <td key={i} className="border-r px-2 py-2.5 text-right tabular-nums text-orange-700 dark:text-orange-400">{fc(w.sBru)}</td>
              ))}
            </tr>
            {expanded.bru && subRows('bruto')}

            {/* SEPARADOR */}
            <tr className="h-1.5 bg-muted/30"><td colSpan={25} /></tr>

            {/* SALDO SEMANA */}
            <tr className="border-y font-semibold bg-muted/10">
              <td className="sticky left-0 z-10 bg-muted/20 border-r px-3 py-2.5 text-[10px] uppercase text-muted-foreground font-bold">Saldo na Semana</td>
              {grid.map((w, i) => (
                <td key={i} className={`border-r px-2 py-2.5 text-right tabular-nums ${w.delta < 0 ? 'text-red-600' : ''}`}>{formatCurrency(w.delta)}</td>
              ))}
            </tr>

            {/* SALDO ACUMULADO */}
            <tr className="border-b-2 border-primary/30 font-bold text-sm bg-primary/5">
              <td className="sticky left-0 z-10 bg-primary/10 border-r px-3 py-3 text-primary uppercase text-[11px]">💰 Saldo Projetado</td>
              {grid.map((w, i) => (
                <td key={i} className={`border-r px-2 py-3 text-right tabular-nums ${w.acum < 0 ? 'text-red-600 bg-red-50/50 dark:bg-red-950/20' : ''}`}>{formatCurrency(w.acum)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
