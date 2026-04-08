import { useState, useMemo } from 'react'
import { useProject } from '@/contexts/ProjectContext'
import { useParcelas } from '@/hooks/useFinanceiro'
import { useEtapas } from '@/hooks/useEtapas'
import { useItensCompra, usePedidos } from '@/hooks/useCompras'
import { useMedicoes, useDistribuicao } from '@/hooks/useOperacional'
import { useMutuos } from '@/hooks/useMutuos'
import { formatCurrency } from '@/lib/utils'
import { parsearCondicao } from '@/lib/parcelas'
import { ChevronRight, ChevronDown, X, Download } from 'lucide-react'
import FinancialViewFilter, { type FinancialViewMode } from './FinancialViewFilter'

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
  const { data: itens = [] } = useItensCompra()
  const { data: pedidos = [] } = usePedidos()
  const { data: etapas = [] } = useEtapas()
  const { data: mutuos = [] } = useMutuos()
  const { data: distribuicoes = [] } = useDistribuicao()

  const [localMode, setLocalMode] = useState<FinancialViewMode>('pedidos')
  const viewMode = externalMode ?? localMode
  const setViewMode = onViewModeChange ?? setLocalMode

  const [overrides, setOverrides] = useState<Record<string, Override>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<Item | null>(null)

  const toggle = (k: string) => setExpanded(p => ({ ...p, [k]: !p[k] }))

  const weeks = useMemo(() => {
    // 1) Find the earliest date among all data (Medições, Mútuos, Parcelas, Etapas)
    let minDateMs = Date.now()

    const checkDate = (d?: string | null) => {
      if (!d) return
      const t = localDate(d).getTime()
      if (t < minDateMs) minDateMs = t
    }

    medicoes.forEach(m => checkDate(m.data_prevista))
    mutuos.forEach(m => { checkDate(m.data_captacao); m.parcelas?.forEach((p: any) => checkDate(p.data_vencimento)) })
    parcelas.forEach(p => checkDate(p.data_vencimento))
    etapas.forEach(e => checkDate(e.data_inicio_plan))

    // 2) Align to Monday of that earliest week
    const startObj = new Date(minDateMs)
    const dowStart = startObj.getDay()
    startObj.setDate(startObj.getDate() - (dowStart === 0 ? 6 : dowStart - 1))
    startObj.setHours(0, 0, 0, 0)

    // 3) Align to Monday of "now + 6 months" for the end
    const endObj = new Date()
    endObj.setMonth(endObj.getMonth() + 6)
    const dowEnd = endObj.getDay()
    endObj.setDate(endObj.getDate() - (dowEnd === 0 ? 6 : dowEnd - 1))
    endObj.setHours(0, 0, 0, 0)

    // 4) Calculate number of weeks
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
  }, [medicoes, mutuos, parcelas, etapas])

  const items = useMemo(() => {
    const ov = (id: string, date: string, val: number) => {
      const o = overrides[id]
      return {
        d: o?.newDate || date,
        v: o?.newValue ?? val,
        mod: !!(o?.newDate || o?.newValue !== undefined),
      }
    }
    const all: Item[] = []

    const filterPaga = (status: string) => {
      if (viewMode === 'realizado') return status === 'paga' || status === 'quitado';
      // If planejado or pedidos, we want BOTH Realizado AND Planejado. 
      // If we only wanted Planejado, a theoretical viewMode='apenas_planejado' would return status !== 'paga'
      return true;
    }

    medicoes.filter(m => filterPaga(m.status) && m.data_prevista).forEach(m => {
      const dists = distribuicoes.filter(dd => dd.medicao_numero === m.numero)
      if (dists.length > 0) {
        dists.forEach((dist, idx) => {
          const etapa = etapas.find(e => e.id === dist.etapa_id)
          const valFat = Number(dist.valor_liberado_faturamento || 0)
          if (valFat <= 0) return
          const iid = `med-${m.id}-srv-${idx}`
          const { d, v, mod } = ov(iid, m.data_prevista, valFat)
          all.push({
            id: iid, desc: `M${m.numero} — ${etapa?.nome || 'Serviço'}`,
            valor: Number(v), data: d, tipo: 'entrada', modified: mod,
            meta: { cat: 'Cliente', etapa: etapa?.nome, orig: valFat }
          })
        })
      } else {
        const { d, v, mod } = ov(`med-${m.id}`, m.data_prevista, m.valor_planejado)
        all.push({ id: `med-${m.id}`, desc: `Medição nº ${m.numero}`, valor: Number(v), data: d, tipo: 'entrada', modified: mod, meta: { cat: 'Cliente', orig: m.valor_planejado } })
      }
    })

    mutuos.filter(m => m.data_captacao).forEach(m => {
      if (viewMode === 'realizado' && m.data_captacao > new Date().toISOString().split('T')[0]!) return // very rough approximation
      const { d, v, mod } = ov(`mutcap-${m.id}`, m.data_captacao, m.valor_captado)
      all.push({ id: `mutcap-${m.id}`, desc: `Mútuo: ${m.nome}`, valor: Number(v), data: d, tipo: 'entrada', modified: mod, meta: { cat: m.tipo, orig: m.valor_captado } })
    })

    const filteredParcelas = parcelas.filter(p => filterPaga(p.status) && p.data_vencimento)
    filteredParcelas.forEach(p => {
      // Use valor_pago if paga, otherwise full calcVal
      const isPaga = p.status === 'paga'
      const calcVal = isPaga ? Number(p.valor_pago || 0) : Number(p.valor) - Number(p.valor_pago || 0)
      const { d, v, mod } = ov(`par-${p.id}`, isPaga && p.data_pagamento_real ? p.data_pagamento_real : p.data_vencimento, calcVal)
      const ped = pedidos.find(pd => pd.id === p.pedido_id)
      const itemObj = itens.find(i => i.id === ped?.item_compra_id)
      const etapaObj = etapas.find(et => et.id === itemObj?.etapa_id)
      all.push({
        id: `par-${p.id}`, desc: `Parc ${p.numero_parcela} — ${ped?.fornecedor_nome || ''}`, valor: Number(v), data: d, tipo: 'firme', modified: mod,
        meta: { cat: itemObj?.categoria || 'Obra', etapa: etapaObj?.nome, forn: ped?.fornecedor_nome, item: ped?.item_descricao || itemObj?.descricao, orig: calcVal }
      })
    })

    mutuos.forEach(m => {
      ;(m.parcelas || []).filter((p: any) => filterPaga(p.status) && p.data_vencimento).forEach((p: any) => {
        const isPaga = p.status === 'paga'
        const calcVal = isPaga ? Number(p.valor_pago || 0) : Number(p.valor) - Number(p.valor_pago || 0)
        const { d, v, mod } = ov(`mutpar-${p.id}`, isPaga && p.data_pagamento_real ? p.data_pagamento_real : p.data_vencimento, calcVal)
        all.push({ id: `mutpar-${p.id}`, desc: `Mútuo Parc ${p.numero_parcela} — ${m.nome}`, valor: Number(v), data: d, tipo: 'firme', modified: mod, meta: { cat: m.tipo, forn: m.nome, orig: calcVal } })
      })
    })

    const pedMap = new Map<string, number>()
    pedidos.forEach(p => pedMap.set(p.item_compra_id, (pedMap.get(p.item_compra_id) || 0) + Number(p.valor_total_real || 0)))

    itens.forEach(item => {
      const comPed = Math.min(pedMap.get(item.id) || 0, Number(item.valor_total_orcado))
      const semPed = Math.max(0, Number(item.valor_total_orcado) - comPed - Number(item.valor_consumido))
      if (semPed <= 0) return
      const etapa = etapas.find(e => e.id === item.etapa_id)
      const dataOrig = etapa?.data_inicio_plan || ''
      if (!dataOrig) return
      const dias = parsearCondicao(item.cond_pagamento || '')
      const nParts = dias.length
      const dists = distribuicoes.filter(dd => dd.etapa_id === item.etapa_id)
      const casasT = etapa?.casas_total || 1

      const pushBruto = (baseDate: string, ratio: number, suffix: string, dIdx: number) => {
        const valDist = semPed * ratio
        if (valDist <= 0) return
        const perPart = valDist / nParts
        dias.forEach((dd, pIdx) => {
          const dt = localDate(baseDate); dt.setDate(dt.getDate() + dd)
          const dKey = dt.toISOString().split('T')[0]!
          const iid = `bruto-${item.id}-${dIdx}-${pIdx}`
          const { d, v, mod } = ov(iid, dKey, perPart)
          all.push({
            id: iid, desc: `${item.descricao}${suffix}`, valor: Number(v), data: d, tipo: 'bruto', modified: mod,
            meta: { cat: item.categoria || 'Obra', etapa: etapa?.nome, forn: item.fornecedor_nome || '', item: item.descricao, orig: perPart }
          })
        })
      }

      if (dists.length > 0) {
        dists.forEach((dist, dIdx) => pushBruto(dist.data_inicio || dataOrig, dist.casas_planejadas / casasT, ` (${dist.casas_planejadas}un)`, dIdx))
      } else {
        pushBruto(dataOrig, 1, '', 0)
      }
    })

    return all
  }, [parcelas, medicoes, itens, pedidos, etapas, mutuos, distribuicoes, overrides, viewMode])

  const grid = useMemo(() => {
    let acum = currentCompany?.saldo_inicial_caixa || 0

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

  const subRows = (tipo: 'entrada' | 'firme' | 'bruto') => {
    const filtered = items.filter(i => i.tipo === tipo && weeks.some(w => { const t = localDate(i.data).getTime(); return t >= w.s.getTime() && t <= w.e.getTime() }))
    const groups = new Map<string, Item[]>()
    filtered.forEach(i => {
      const k = i.desc
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(i)
    })
    return Array.from(groups.entries()).map(([desc, its]) => (
      <tr key={desc} className="border-b border-muted/40 hover:bg-muted/20 text-[11px]">
        <td className="sticky left-0 z-10 bg-card border-r px-3 py-1.5 pl-8 truncate max-w-[220px] font-medium text-foreground/70" title={desc}>
          {its[0]!.modified && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 -mt-0.5" />}
          {desc}
        </td>
        {grid.map((w, ci) => {
          const match = its.filter(i => { const t = localDate(i.data).getTime(); return t >= w.s.getTime() && t <= w.e.getTime() })
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
    ))
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

      {/* View Mode Filter */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] text-muted-foreground">Visão: {viewMode === 'realizado' ? 'Apenas realizado' : viewMode === 'planejado' ? 'Realizado + Planejado' : 'Realizado + Planejado + Pedidos'}</div>
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
                <th key={i} className="border-r px-2 py-2.5 text-center font-medium w-[110px] min-w-[110px]">
                  <div className="text-[9px] text-muted-foreground">S{i + 1}</div>
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
