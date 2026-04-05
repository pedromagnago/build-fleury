import { useState, useMemo, useRef, useCallback } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { useSimulador } from '@/hooks/useSimulador'
import { formatCurrency, formatDate } from '@/lib/utils'
import { localDate } from '@/lib/parcelas'
import type { CashFlowPoint, SimMetrics, SimEtapa, ParcelaImpacto } from '@/lib/simuladorEngine'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import {
  FlaskConical, Plus, ChevronDown, ChevronRight, GripHorizontal,
  Undo2, Redo2, RotateCcw, Play, GitCompareArrows, CalendarClock,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, X, Clock, ArrowRight,
} from 'lucide-react'

const DAY_MS = 86_400_000

// ═══════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════

export default function SimuladorPage() {
  const sim = useSimulador()
  const [showCompare, setShowCompare] = useState(false)
  const [showApply, setShowApply] = useState(false)
  const [newName, setNewName] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [applyConfirm, setApplyConfirm] = useState('')

  const isCustom = sim.state.cenarioTipo === 'custom'
  const hasChanges = sim.state.adjustments.length > 0

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
      {/* ═══ TOP BAR ═══ */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-3">
        <PageHeader title="Simulador" description="E se...?" icon={FlaskConical} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Scenario selector */}
          <select
            value={sim.state.cenarioId ?? '__base__'}
            onChange={(e) => sim.loadCenario(e.target.value === '__base__' ? null : e.target.value)}
            className="rounded-lg border bg-background px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="__base__">📊 Base (Real)</option>
            {sim.cenariosList.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.tipo === 'aplicado' ? '✅' : '🔬'} {c.nome}
              </option>
            ))}
          </select>

          {/* New scenario */}
          {showNewForm ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome do cenário"
                className="w-40 rounded-lg border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) {
                    sim.salvarCenario.mutate(newName.trim())
                    setNewName(''); setShowNewForm(false)
                  }
                }}
              />
              <button onClick={() => { if (newName.trim()) { sim.salvarCenario.mutate(newName.trim()); setNewName(''); setShowNewForm(false) } }}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">Salvar</button>
              <button onClick={() => setShowNewForm(false)} className="rounded-md p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <button onClick={() => setShowNewForm(true)} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent">
              <Plus className="h-3.5 w-3.5" /> Novo cenário
            </button>
          )}

          <button onClick={() => setShowCompare(!showCompare)} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent">
            <GitCompareArrows className="h-3.5 w-3.5" /> Comparar
          </button>

          {/* Apply to real */}
          {(isCustom || hasChanges) && (
            <button onClick={() => setShowApply(true)} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
              <Play className="h-3.5 w-3.5" /> Aplicar ao real
            </button>
          )}

          {/* Changes badge */}
          {sim.numChanges > 0 && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {sim.numChanges} alteração{sim.numChanges > 1 ? 'ões' : ''}
            </span>
          )}

          {/* Undo/Redo */}
          <div className="flex items-center border-l pl-2">
            <button onClick={sim.undo} disabled={sim.state.undoStack.length === 0}
              className="rounded-md p-1.5 hover:bg-accent disabled:opacity-30" title="Ctrl+Z"><Undo2 className="h-3.5 w-3.5" /></button>
            <button onClick={sim.redo} disabled={sim.state.redoStack.length === 0}
              className="rounded-md p-1.5 hover:bg-accent disabled:opacity-30" title="Ctrl+Shift+Z"><Redo2 className="h-3.5 w-3.5" /></button>
            {hasChanges && (
              <button onClick={sim.reset} className="rounded-md p-1.5 hover:bg-accent" title="Restaurar tudo"><RotateCcw className="h-3.5 w-3.5" /></button>
            )}
          </div>
        </div>
      </div>

      {/* ═══ FIRST ACCESS BANNER ═══ */}
      {sim.isBase && sim.cenariosList.length === 0 && (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <FlaskConical className="h-8 w-8 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Este é o fluxo de caixa atual do seu projeto.</p>
            <p className="text-xs text-muted-foreground">Crie um cenário para testar mudanças no cronograma sem afetar os dados reais.</p>
          </div>
          <button onClick={() => setShowNewForm(true)} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            Criar meu primeiro cenário
          </button>
        </div>
      )}

      {/* ═══ MAIN SPLIT ═══ */}
      <div className="flex flex-1 gap-0 overflow-hidden max-lg:flex-col">
        {/* LEFT PANEL */}
        <div className="flex w-full flex-col overflow-y-auto border-r lg:w-[45%]">
          <QuickActions onMove={sim.moverTodasEtapas} />
          <AccordionSection title="Cronograma" icon={<CalendarClock className="h-4 w-4" />} defaultOpen>
            <MiniGantt etapas={sim.cenarioSnapshot.etapas} medicoes={sim.cenarioSnapshot.medicoes} onMove={sim.moverEtapa} />
          </AccordionSection>
          <AccordionSection title="Negociações" icon={<GripHorizontal className="h-4 w-4" />}>
            <NegociacoesPanel fornecedores={sim.cenarioSnapshot.fornecedores} onAlter={sim.alterarCondFornecedor} />
          </AccordionSection>
          <AccordionSection title="Medições" icon={<Clock className="h-4 w-4" />}>
            <MedicoesPanel medicoes={sim.cenarioSnapshot.medicoes} onAdiar={sim.adiarMedicao} />
          </AccordionSection>
        </div>

        {/* RIGHT PANEL */}
        <div className="flex w-full flex-col overflow-y-auto lg:w-[55%]">
          {showCompare ? (
            <CompareView sim={sim} />
          ) : (
            <>
              <CashFlowChart baseCF={sim.baseCashFlow} cenarioCF={sim.cenarioCashFlow} />
              <MetricCards base={sim.baseMetrics} cenario={sim.cenarioMetrics} />
              <ImpactTable impacto={sim.impacto} />
            </>
          )}
        </div>
      </div>

      {/* ═══ APPLY MODAL ═══ */}
      {showApply && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <h3 className="text-lg font-bold">Aplicar cenário ao cronograma real</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Isso vai alterar o cronograma real do projeto.{' '}
              <b>{sim.cenarioSnapshot.etapas.filter(e => e.modified).length} etapas</b> serão movidas e{' '}
              <b>{sim.cenarioSnapshot.parcelas.filter(p => p.modified).length} parcelas</b> recalculadas.
            </p>
            <div className="mt-4">
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Digite <b>APLICAR</b> para confirmar
              </label>
              <input value={applyConfirm} onChange={e => setApplyConfirm(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setShowApply(false); setApplyConfirm('') }}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
              <button disabled={applyConfirm !== 'APLICAR'}
                onClick={() => { sim.aplicarAoReal.mutate(); setShowApply(false); setApplyConfirm('') }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40">
                Confirmar aplicação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Quick Actions
// ═══════════════════════════════════════════════════════════════

function QuickActions({ onMove }: { onMove: (d: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Atalhos:</span>
      {[{ label: '-1 sem', d: -7 }, { label: '+1 sem', d: 7 }, { label: '+2 sem', d: 14 }].map(({ label, d }) => (
        <button key={d} onClick={() => onMove(d)}
          className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${d > 0 ? 'hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950' : 'hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950'}`}>
          {label}
        </button>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Accordion
// ═══════════════════════════════════════════════════════════════

function AccordionSection({ title, icon, defaultOpen = false, children }: {
  title: string; icon?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold hover:bg-accent/30">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {icon} {title}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Mini Gantt
// ═══════════════════════════════════════════════════════════════

function MiniGantt({ etapas, medicoes, onMove }: {
  etapas: SimEtapa[]; medicoes: any[]; onMove: (id: string, delta: number) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchDays, setBatchDays] = useState('')
  const [editingEtapa, setEditingEtapa] = useState<string | null>(null)
  const [editDays, setEditDays] = useState('')

  // Calculate time range
  const withDates = etapas.filter(e => e.sim_data_inicio)
  if (withDates.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">Nenhuma etapa com data planejada</p>
  }

  const allStarts = withDates.map(e => localDate(e.sim_data_inicio!).getTime())
  const allEnds = withDates.map(e => e.sim_data_fim ? localDate(e.sim_data_fim).getTime() : localDate(e.sim_data_inicio!).getTime() + 30 * DAY_MS)
  const minDate = Math.min(...allStarts) - 7 * DAY_MS
  const maxDate = Math.max(...allEnds) + 14 * DAY_MS
  const totalDays = Math.max(30, Math.round((maxDate - minDate) / DAY_MS))
  const pxPerDay = 4

  const toggleSelect = (id: string) => {
    const n = new Set(selected)
    n.has(id) ? n.delete(id) : n.add(id)
    setSelected(n)
  }

  const batchMove = () => {
    const d = parseInt(batchDays)
    if (isNaN(d)) return
    selected.forEach(id => onMove(id, d))
    setBatchDays('')
  }

  return (
    <div>
      {/* Batch actions */}
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-muted/50 p-2 text-xs">
          <span className="font-medium">{selected.size} selecionada(s)</span>
          <input type="number" placeholder="±dias" value={batchDays} onChange={e => setBatchDays(e.target.value)}
            className="w-16 rounded border bg-background px-2 py-1 text-xs focus:outline-none"
            onKeyDown={e => e.key === 'Enter' && batchMove()} />
          <button onClick={batchMove} className="rounded bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground">Mover</button>
          <button onClick={() => { selected.forEach(id => onMove(id, 0)); setSelected(new Set()) }}
            className="rounded border px-2 py-1 text-[10px]">Restaurar</button>
        </div>
      )}

      {/* Gantt */}
      <div className="overflow-x-auto rounded-lg border">
        <div style={{ minWidth: totalDays * pxPerDay + 200 }}>
          {/* Header weeks */}
          <div className="flex h-6 border-b bg-muted/30">
            <div className="w-[200px] shrink-0" />
            <div className="relative flex-1">
              {Array.from({ length: Math.ceil(totalDays / 7) }).map((_, i) => {
                const d = new Date(minDate + i * 7 * DAY_MS)
                return (
                  <div key={i} className="absolute top-0 text-[9px] text-muted-foreground" style={{ left: i * 7 * pxPerDay }}>
                    {String(d.getDate()).padStart(2, '0')}/{String(d.getMonth() + 1).padStart(2, '0')}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Etapa rows */}
          {etapas.map(et => {
            const hasOrigDate = !!et.data_inicio_plan
            const hasSimDate = !!et.sim_data_inicio
            if (!hasOrigDate) return null

            const origStart = (localDate(et.data_inicio_plan!).getTime() - minDate) / DAY_MS
            const origEnd = et.data_fim_plan ? (localDate(et.data_fim_plan).getTime() - minDate) / DAY_MS : origStart + 14
            const origW = Math.max(2, origEnd - origStart)

            const simStart = hasSimDate ? (localDate(et.sim_data_inicio!).getTime() - minDate) / DAY_MS : origStart
            const simEnd = et.sim_data_fim ? (localDate(et.sim_data_fim!).getTime() - minDate) / DAY_MS : simStart + origW
            const simW = Math.max(2, simEnd - simStart)

            return (
              <div key={et.id} className="group flex h-9 items-center border-b hover:bg-muted/20">
                {/* Label */}
                <div className="flex w-[200px] shrink-0 items-center gap-1.5 px-2">
                  <input type="checkbox" checked={selected.has(et.id)} onChange={() => toggleSelect(et.id)}
                    className="h-3 w-3 rounded accent-primary" />
                  <span className="truncate text-[11px] font-medium">{et.codigo} {et.nome}</span>
                  {et.modified && <span className="ml-auto text-[9px] font-bold text-emerald-600">{et.delta_dias > 0 ? '+' : ''}{et.delta_dias}d</span>}
                </div>

                {/* Bars */}
                <div className="relative flex-1">
                  {/* Original (gray dashed) */}
                  <div className="absolute top-[14px] h-[3px] rounded-full border border-dashed border-muted-foreground/30 bg-muted-foreground/10"
                    style={{ left: origStart * pxPerDay, width: origW * pxPerDay }} />

                  {/* Simulated bar */}
                  <div
                    className={`absolute top-[10px] h-[11px] cursor-grab rounded-md shadow-sm transition-all duration-200 ${et.modified ? 'bg-emerald-500/80 ring-1 ring-emerald-400' : 'bg-sky-500/70'}`}
                    style={{ left: simStart * pxPerDay, width: simW * pxPerDay }}
                    title={et.modified ? `${et.delta_dias > 0 ? '+' : ''}${et.delta_dias} dias` : 'Arrastar para mover'}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      const startX = e.clientX
                      const handleMove = (ev: MouseEvent) => {
                        const dx = ev.clientX - startX
                        const deltaDays = Math.round(dx / pxPerDay)
                        if (deltaDays !== 0) onMove(et.id, et.delta_dias + deltaDays)
                      }
                      const handleUp = () => { document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp) }
                      document.addEventListener('mousemove', handleMove)
                      document.addEventListener('mouseup', handleUp)
                    }}
                  />

                  {/* Quick edit icon */}
                  <button
                    className="absolute top-[6px] opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary text-[10px]"
                    style={{ left: (simStart + simW) * pxPerDay + 6 }}
                    onClick={() => { setEditingEtapa(editingEtapa === et.id ? null : et.id); setEditDays(String(et.delta_dias || '')) }}
                  >⋯</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Quick edit popover */}
      {editingEtapa && (
        <div className="mt-2 rounded-lg border bg-card p-3 shadow-md">
          <div className="mb-2 text-xs font-semibold">{etapas.find(e => e.id === editingEtapa)?.nome}</div>
          <div className="flex items-center gap-2">
            <input type="number" value={editDays} onChange={e => setEditDays(e.target.value)} placeholder="±dias"
              className="w-20 rounded border bg-background px-2 py-1 text-sm focus:outline-none"
              onKeyDown={e => { if (e.key === 'Enter') { onMove(editingEtapa!, parseInt(editDays) || 0); setEditingEtapa(null) } }} />
            <button onClick={() => { onMove(editingEtapa!, parseInt(editDays) || 0); setEditingEtapa(null) }}
              className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground">Aplicar</button>
            <button onClick={() => { onMove(editingEtapa!, 0); setEditingEtapa(null) }}
              className="rounded border px-3 py-1 text-xs">Restaurar</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Negociações Panel
// ═══════════════════════════════════════════════════════════════

function NegociacoesPanel({ fornecedores, onAlter }: {
  fornecedores: any[]; onAlter: (id: string, cond: string) => void
}) {
  if (fornecedores.length === 0) return <p className="py-4 text-center text-xs text-muted-foreground">Nenhum fornecedor cadastrado</p>

  return (
    <div className="space-y-2">
      {fornecedores.map(f => (
        <div key={f.id} className={`flex items-center gap-3 rounded-lg border p-2.5 text-sm ${f.modified ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20' : ''}`}>
          <div className="flex-1">
            <p className="font-medium text-[12px]">{f.nome}</p>
            <p className="text-[10px] text-muted-foreground">Atual: {f.cond_pagamento_padrao || 'à vista'}</p>
          </div>
          <input
            defaultValue={f.sim_cond_pagamento ?? f.cond_pagamento_padrao ?? ''}
            placeholder="Ex: 30/60/90"
            className="w-28 rounded border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            onBlur={(e) => {
              const val = e.target.value.trim()
              if (val && val !== (f.cond_pagamento_padrao ?? '')) onAlter(f.id, val)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
          {f.modified && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">alterado</span>}
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Medições Panel
// ═══════════════════════════════════════════════════════════════

function MedicoesPanel({ medicoes, onAdiar }: {
  medicoes: any[]; onAdiar: (id: string, data: string) => void
}) {
  const futuras = medicoes.filter(m => m.status !== 'liberada' && m.status !== 'paga')
  if (futuras.length === 0) return <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma medição futura</p>

  return (
    <div className="space-y-2">
      {futuras.map(m => (
        <div key={m.id} className={`flex items-center gap-3 rounded-lg border p-2.5 ${m.modified ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20' : ''}`}>
          <div className="flex-1">
            <p className="text-xs font-medium">Medição {m.numero}</p>
            <p className="text-[10px] text-muted-foreground">{formatCurrency(m.valor_planejado)} | Prevista: {formatDate(m.data_prevista)}</p>
          </div>
          <input type="date" defaultValue={m.sim_data_prevista}
            className="rounded border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            onChange={(e) => { if (e.target.value) onAdiar(m.id, e.target.value) }} />
          {m.modified && <span className="text-[9px] font-bold text-amber-600">
            {m.delta_dias > 0 ? '+' : ''}{m.delta_dias}d
          </span>}
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Cash Flow Chart
// ═══════════════════════════════════════════════════════════════

function CashFlowChart({ baseCF, cenarioCF }: { baseCF: CashFlowPoint[]; cenarioCF: CashFlowPoint[] }) {
  const [viewMode, setViewMode] = useState<'consolidado' | 'maturidade'>('consolidado')

  // Merge base and cenário into chart data
  const chartData = useMemo(() => {
    const baseMap = new Map(baseCF.map(p => [p.date, p]))
    const cenarioMap = new Map(cenarioCF.map(p => [p.date, p]))
    const allDates = new Set([...baseMap.keys(), ...cenarioMap.keys()])
    return [...allDates].sort().map(date => {
      const b = baseMap.get(date)
      const c = cenarioMap.get(date)
      return {
        date,
        label: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
        saldoBase: b?.saldo ?? null,
        saldoCenario: c?.saldo ?? null,
        saidasFirme: c ? -(c.saidasFirme) : null,
        saidasBruto: c ? -(c.saidasBruto) : null,
        entradas: c?.entradas ?? null,
      }
    })
  }, [baseCF, cenarioCF])

  if (chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Sem dados de fluxo de caixa. Cadastre etapas com datas e itens de compra.
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Fluxo de Caixa Projetado</h3>
        <div className="flex rounded-lg border text-[10px]">
          <button onClick={() => setViewMode('consolidado')}
            className={`px-2.5 py-1 font-medium transition-colors ${viewMode === 'consolidado' ? 'bg-primary/10 text-primary' : 'hover:bg-accent'}`}>Consolidado</button>
          <button onClick={() => setViewMode('maturidade')}
            className={`px-2.5 py-1 font-medium transition-colors ${viewMode === 'maturidade' ? 'bg-primary/10 text-primary' : 'hover:bg-accent'}`}>Por maturidade</button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
          <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
          <RTooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)' }}
            formatter={(value: number, name: string) => [formatCurrency(value), name]}
            labelFormatter={(label: string) => `Semana de ${label}`}
          />
          <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5} />

          {viewMode === 'consolidado' ? (
            <>
              <Line type="monotone" dataKey="saldoBase" name="Base" stroke="#9ca3af" strokeDasharray="6 3" strokeWidth={2} dot={false} animationDuration={300} />
              <Area type="monotone" dataKey="saldoCenario" name="Cenário" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.12} strokeWidth={2} dot={false} animationDuration={300} />
            </>
          ) : (
            <>
              <Line type="monotone" dataKey="saldoBase" name="Base" stroke="#9ca3af" strokeDasharray="6 3" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="saidasFirme" name="Saídas Firmes" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={1.5} dot={false} stackId="saidas" />
              <Area type="monotone" dataKey="saidasBruto" name="Saídas Projetadas" stroke="#93c5fd" fill="#93c5fd" fillOpacity={0.1} strokeWidth={1.5} strokeDasharray="4 2" dot={false} stackId="saidas" />
              <Area type="monotone" dataKey="entradas" name="Entradas" stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeWidth={1.5} dot={false} />
            </>
          )}
          <Legend wrapperStyle={{ fontSize: 10 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Metric Cards
// ═══════════════════════════════════════════════════════════════

function MetricCards({ base, cenario }: { base: SimMetrics; cenario: SimMetrics }) {
  const cards = [
    {
      label: 'Saldo mínimo', value: formatCurrency(cenario.saldoMinimo.valor),
      sub: cenario.saldoMinimo.data ? formatDate(cenario.saldoMinimo.data) : '—',
      delta: cenario.saldoMinimo.valor - base.saldoMinimo.valor,
      better: cenario.saldoMinimo.valor >= base.saldoMinimo.valor,
    },
    {
      label: 'Dias negativos', value: `${cenario.diasNegativos}`,
      sub: base.diasNegativos !== cenario.diasNegativos ? `vs ${base.diasNegativos} base` : 'igual ao base',
      delta: base.diasNegativos - cenario.diasNegativos,
      better: cenario.diasNegativos <= base.diasNegativos,
    },
    {
      label: 'Pior semana', value: formatCurrency(cenario.piorSemana.valor),
      sub: cenario.piorSemana.semana ? formatDate(cenario.piorSemana.semana) : '—',
      delta: base.piorSemana.valor - cenario.piorSemana.valor,
      better: cenario.piorSemana.valor <= base.piorSemana.valor,
    },
    {
      label: 'Data crítica', value: cenario.dataCritica ? formatDate(cenario.dataCritica) : 'Nenhuma',
      sub: cenario.dataCritica ? 'Primeiro saldo negativo' : 'Sempre positivo',
      delta: cenario.dataCritica ? -1 : (base.dataCritica ? 1 : 0),
      better: !cenario.dataCritica || (!base.dataCritica && !cenario.dataCritica),
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 px-4 lg:grid-cols-4">
      {cards.map(c => (
        <div key={c.label} className={`rounded-xl border p-3 ${c.delta > 0 ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20' : c.delta < 0 ? 'border-red-200 bg-red-50/50 dark:bg-red-950/20' : ''}`}>
          <p className="text-[10px] font-medium text-muted-foreground">{c.label}</p>
          <div className="mt-1 flex items-center gap-1">
            {c.delta > 0 && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
            {c.delta < 0 && <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
            {c.delta === 0 && <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className="text-sm font-bold">{c.value}</span>
          </div>
          <p className="mt-0.5 text-[9px] text-muted-foreground">{c.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Impact Table
// ═══════════════════════════════════════════════════════════════

function ImpactTable({ impacto }: { impacto: ParcelaImpacto[] }) {
  const [onlyChanged, setOnlyChanged] = useState(true)
  const shown = onlyChanged ? impacto.filter(p => p.delta_dias !== 0) : impacto

  const totalVal = shown.reduce((s, p) => s + p.valor, 0)

  return (
    <div className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Parcelas afetadas ({shown.length})</h3>
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <input type="checkbox" checked={onlyChanged} onChange={e => setOnlyChanged(e.target.checked)} className="h-3 w-3 accent-primary" />
          Só alteradas
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma parcela alterada neste cenário.</p>
      ) : (
        <>
          <div className="max-h-52 overflow-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-left">
                <tr>
                  <th className="px-3 py-1.5">Fornecedor</th>
                  <th className="px-3 py-1.5">Etapa</th>
                  <th className="px-3 py-1.5 text-right">Valor</th>
                  <th className="px-3 py-1.5">Base → Cenário</th>
                  <th className="px-3 py-1.5 text-right">Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.slice(0, 50).map((p, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-3 py-1.5 font-medium">{p.fornecedor_nome}</td>
                    <td className="px-3 py-1.5">{p.etapa_nome}</td>
                    <td className="px-3 py-1.5 text-right">{formatCurrency(p.valor)}</td>
                    <td className="px-3 py-1.5">
                      <span className="text-muted-foreground">{formatDate(p.vencimento_base)}</span>
                      <ArrowRight className="mx-1 inline h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{formatDate(p.vencimento_cenario)}</span>
                    </td>
                    <td className={`px-3 py-1.5 text-right font-bold ${p.delta_dias > 0 ? 'text-red-500' : p.delta_dias < 0 ? 'text-emerald-500' : ''}`}>
                      {p.delta_dias > 0 ? '+' : ''}{p.delta_dias}d
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {shown.length} parcelas alteradas | {formatCurrency(totalVal)} deslocados
          </p>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Compare View
// ═══════════════════════════════════════════════════════════════

function CompareView({ sim }: { sim: ReturnType<typeof useSimulador> }) {
  const colors = ['#3b82f6', '#10b981', '#f97316']

  // For simplicity, compare Base vs current scenario
  const chartData = useMemo(() => {
    const baseMap = new Map(sim.baseCashFlow.map(p => [p.date, p]))
    const cenMap = new Map(sim.cenarioCashFlow.map(p => [p.date, p]))
    const allDates = new Set([...baseMap.keys(), ...cenMap.keys()])
    return [...allDates].sort().map(date => ({
      date, label: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
      base: baseMap.get(date)?.saldo ?? null,
      cenario: cenMap.get(date)?.saldo ?? null,
    }))
  }, [sim.baseCashFlow, sim.cenarioCashFlow])

  const bm = sim.baseMetrics
  const cm = sim.cenarioMetrics

  const rows = [
    { label: 'Saldo mínimo', base: formatCurrency(bm.saldoMinimo.valor), cen: formatCurrency(cm.saldoMinimo.valor), better: cm.saldoMinimo.valor >= bm.saldoMinimo.valor },
    { label: 'Dias negativos', base: String(bm.diasNegativos), cen: String(cm.diasNegativos), better: cm.diasNegativos <= bm.diasNegativos },
    { label: 'Data crítica', base: bm.dataCritica ? formatDate(bm.dataCritica) : '—', cen: cm.dataCritica ? formatDate(cm.dataCritica) : '—', better: !cm.dataCritica },
    { label: 'Custo total', base: formatCurrency(bm.custoTotal), cen: formatCurrency(cm.custoTotal), better: cm.custoTotal <= bm.custoTotal },
  ]

  return (
    <div className="p-4">
      <h3 className="mb-3 text-sm font-semibold">Comparação: Base vs {sim.state.cenarioNome}</h3>
      <ResponsiveContainer width="100%" height={250}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
          <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
          <RTooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number) => formatCurrency(v)} />
          <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="base" name="Base" stroke="#9ca3af" strokeDasharray="6 3" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="cenario" name={sim.state.cenarioNome} stroke={colors[0]} strokeWidth={2} dot={false} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
        </ComposedChart>
      </ResponsiveContainer>

      <table className="mt-4 w-full text-xs">
        <thead>
          <tr className="border-b">
            <th className="pb-2 text-left font-semibold">Métrica</th>
            <th className="pb-2 text-right font-semibold">Base</th>
            <th className="pb-2 text-right font-semibold">{sim.state.cenarioNome}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map(r => (
            <tr key={r.label}>
              <td className="py-2 font-medium">{r.label}</td>
              <td className="py-2 text-right text-muted-foreground">{r.base}</td>
              <td className={`py-2 text-right font-bold ${r.better ? 'text-emerald-600' : 'text-red-500'}`}>{r.cen}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
