import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/ui/PageHeader'
import { useMedicoes, useCreateMedicao, useUpdateMedicao, useDistribuicao, type Medicao } from '@/hooks/useOperacional'
import { useEtapas } from '@/hooks/useEtapas'
import { useProject } from '@/contexts/ProjectContext'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, formatPercent } from '@/lib/utils'
import { localDate } from '@/lib/parcelas'
import { exportToExcel } from '@/lib/exportExcel'
import { useMedicaoParcelas, useUpdateMedicaoParcela, type MedicaoParcela } from '@/hooks/useMedicaoParcelas'
import { useContasBancarias } from '@/hooks/useFinanceiro'

import BulkActionBar, { BulkButton } from '@/components/BulkActionBar'
import { useSelection } from '@/hooks/useSelection'
import { toast } from 'sonner'
import {
  ClipboardCheck, Plus, X, Check, Search, CalendarClock,
  Download, Flag, ChevronRight, ChevronDown, Banknote,
  Clock, CheckCircle2, AlertTriangle, TrendingDown,
} from 'lucide-react'
import { useTour } from '@/lib/tours/useTour'
import { pageTours } from '@/lib/tours/page-tours'

const STATUS_CONFIG: Record<string, { label: string; color: string; order: number }> = {
  futura:     { label: 'Futura',     color: 'bg-slate-500/10 text-slate-500',    order: 0 },
  em_medicao: { label: 'Em Medição', color: 'bg-blue-500/10 text-blue-500',      order: 1 },
  liberada:   { label: 'Liberada',   color: 'bg-emerald-500/10 text-emerald-600', order: 2 },
  paga:       { label: 'Paga',       color: 'bg-amber-500/10 text-amber-600',    order: 3 },
}

// ─── Tab: Parcelas de Recebimento ────────────────────────────────────────────

const SP: Record<string, { label: string; Icon: typeof Clock; bg: string; text: string }> = {
  futura:                { label:'Futura',          Icon:Clock,          bg:'bg-slate-100 dark:bg-slate-800',      text:'text-slate-600 dark:text-slate-400'   },
  a_receber:             { label:'A Receber',       Icon:TrendingDown,   bg:'bg-blue-100 dark:bg-blue-900/30',     text:'text-blue-700 dark:text-blue-400'     },
  recebida:              { label:'Recebida',        Icon:CheckCircle2,   bg:'bg-emerald-100 dark:bg-emerald-900/30',text:'text-emerald-700 dark:text-emerald-400'},
  vencida:               { label:'Vencida',         Icon:AlertTriangle,  bg:'bg-red-100 dark:bg-red-900/30',       text:'text-red-700 dark:text-red-400'       },
  parcialmente_recebida: { label:'Parc. Recebida',  Icon:ChevronDown,    bg:'bg-amber-100 dark:bg-amber-900/30',   text:'text-amber-700 dark:text-amber-400'   },
}

// Modal de baixa
function BaixaParcelaModal({ parcela, onClose }: { parcela: MedicaoParcela; onClose: ()=>void }) {
  const { data: contas = [] } = useContasBancarias()
  const update = useUpdateMedicaoParcela()
  const saldo = parcela.valor - parcela.valor_recebido
  const today = new Date().toISOString().split('T')[0]!
  const [form, setForm] = useState({
    valor_recebido: saldo.toFixed(2),
    data_recebimento_real: today,
    forma_recebimento: parcela.forma_recebimento ?? '',
    conta_bancaria_id: parcela.conta_bancaria_id ?? '',
  })

  async function handleConfirm() {
    const v = parseFloat(form.valor_recebido)
    if (!v || v <= 0) return
    await update.mutateAsync({
      id: parcela.id,
      valor_recebido: (parcela.valor_recebido + v),
      data_recebimento_real: form.data_recebimento_real || null,
      forma_recebimento: form.forma_recebimento || null,
      conta_bancaria_id: form.conta_bancaria_id || null,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-semibold">Registrar Recebimento</h2>
            <p className="text-xs text-muted-foreground">Medição {parcela.medicao?.numero} · Parc. {parcela.numero_parcela}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted"><X className="h-4 w-4"/></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Valor total</span><span className="font-semibold">{formatCurrency(parcela.valor)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Já recebido</span><span className="text-emerald-700 font-semibold">{formatCurrency(parcela.valor_recebido)}</span></div>
            <div className="flex justify-between border-t mt-2 pt-2"><span className="text-muted-foreground">Saldo a receber</span><span className="font-bold text-amber-700">{formatCurrency(saldo)}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor recebido *</label>
              <input type="number" min="0.01" step="0.01" max={saldo}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-right font-mono"
                value={form.valor_recebido} onChange={e=>setForm(f=>({...f,valor_recebido:e.target.value}))} autoFocus/>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Data recebimento</label>
              <input type="date" className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={form.data_recebimento_real} onChange={e=>setForm(f=>({...f,data_recebimento_real:e.target.value}))}/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Forma de Recebimento</label>
              <select className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={form.forma_recebimento} onChange={e=>setForm(f=>({...f,forma_recebimento:e.target.value}))}>
                <option value="">—</option>
                {['PIX','TED','DOC','Boleto','Cheque'].map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Conta Bancária</label>
              <select className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={form.conta_bancaria_id} onChange={e=>setForm(f=>({...f,conta_bancaria_id:e.target.value}))}>
                <option value="">—</option>
                {contas.filter(c=>c.ativa).map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
          <button onClick={handleConfirm} disabled={update.isPending || !parseFloat(form.valor_recebido)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {update.isPending ? 'Salvando…' : 'Confirmar Recebimento'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ParcelasRecebimentoTab() {
  const { data: parcelas = [] } = useMedicaoParcelas()
  const update = useUpdateMedicaoParcela()
  const selection = useSelection()

  const [statusFiltro, setStatusFiltro] = useState<string>('todos')
  const [tempoFiltro, setTempoFiltro] = useState<string>('todos')
  const [baixando, setBaixando] = useState<MedicaoParcela | null>(null)

  const today = new Date().toISOString().split('T')[0]!
  const in30  = new Date(Date.now() + 30*86400000).toISOString().split('T')[0]!

  const kpi = useMemo(() => ({
    totalPrevisto: parcelas.reduce((s,p)=>s+p.valor,0),
    totalRecebido: parcelas.reduce((s,p)=>s+p.valor_recebido,0),
    aReceber:      parcelas.filter(p=>p.status!=='recebida').reduce((s,p)=>s+(p.valor-p.valor_recebido),0),
    totalVencido:  parcelas.filter(p=>p.status==='vencida').reduce((s,p)=>s+(p.valor-p.valor_recebido),0),
    countVencidas: parcelas.filter(p=>p.status==='vencida').length,
  }), [parcelas])

  const filtered = useMemo(() => {
    return parcelas.filter(p => {
      if (statusFiltro !== 'todos' && p.status !== statusFiltro) return false
      if (tempoFiltro === 'vencida' && p.status !== 'vencida') return false
      if (tempoFiltro === 'hoje' && p.data_prevista_recebimento !== today) return false
      if (tempoFiltro === 'proximo30') {
        const d = p.data_prevista_recebimento
        if (!d || d < today || d > in30) return false
      }
      return true
    })
  }, [parcelas, statusFiltro, tempoFiltro, today, in30])

  const selectedItems = filtered.filter(p => selection.isSelected(p.id))
  const bulkPendente = selectedItems.reduce((s,p)=>s+(p.valor-p.valor_recebido),0)

  async function handleBulkBaixar() {
    for (const p of selectedItems.filter(p=>p.status!=='recebida')) {
      const saldo = p.valor - p.valor_recebido
      if (saldo > 0) {
        await update.mutateAsync({ id:p.id, valor_recebido: p.valor, data_recebimento_real: today })
      }
    }
    selection.clear()
    toast.success(`${selectedItems.length} parcela(s) baixada(s)`)
  }

  function fmtDt(iso: string | null | undefined) {
    if (!iso) return '—'
    return new Date(iso+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'})
  }

  const TEMPO_OPTS = [
    {key:'todos',     label:'Todas'},
    {key:'vencida',   label:'Vencidas'},
    {key:'hoje',      label:'Hoje'},
    {key:'proximo30', label:'Próx. 30d'},
    {key:'recebida',  label:'Recebidas'},
  ]

  return (
    <div className="space-y-4">
      {/* KPI Cards — clicáveis para filtrar */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label:'A Receber',     value:kpi.aReceber,      tone:'blue',    filter:()=>setStatusFiltro('a_receber') },
          { label:'Recebido',      value:kpi.totalRecebido,  tone:'emerald', filter:()=>setStatusFiltro('recebida')  },
          { label:'Vencido',       value:kpi.totalVencido,   tone:kpi.totalVencido>0.5?'red':'default', filter:()=>{setStatusFiltro('vencida'); setTempoFiltro('vencida')} },
          { label:'Total Previsto',value:kpi.totalPrevisto,  tone:'default', filter:()=>{setStatusFiltro('todos'); setTempoFiltro('todos')} },
        ].map(k=>(
          <button key={k.label} onClick={k.filter}
            className={`rounded-xl border p-4 text-left hover:brightness-95 transition-all ${
              k.tone==='blue'?'border-blue-500/30 bg-blue-500/5':
              k.tone==='emerald'?'border-emerald-500/30 bg-emerald-500/5':
              k.tone==='red'?'border-red-500/30 bg-red-500/5':'border-border bg-card'
            }`}>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{k.label}</div>
            <div className={`mt-1 text-xl font-bold tabular-nums ${
              k.tone==='blue'?'text-blue-700 dark:text-blue-400':
              k.tone==='emerald'?'text-emerald-700 dark:text-emerald-400':
              k.tone==='red'?'text-red-600':''
            }`}>{formatCurrency(k.value)}</div>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Filtros de tempo */}
        <div className="flex gap-0.5 rounded-lg border p-0.5">
          {TEMPO_OPTS.map(o=>(
            <button key={o.key} onClick={()=>{setTempoFiltro(o.key); if(o.key==='recebida')setStatusFiltro('recebida'); else if(o.key!=='todos')setStatusFiltro('todos')}}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tempoFiltro===o.key?'bg-primary text-primary-foreground':'text-muted-foreground hover:text-foreground'
              }`}>{o.label}</button>
          ))}
        </div>

        {/* Sel. vencidas */}
        {kpi.countVencidas > 0 && (
          <button
            onClick={()=>selection.selectAll(parcelas.filter(p=>p.status==='vencida').map(p=>p.id))}
            className="rounded-lg border border-red-400 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-500/10">
            Sel. vencidas ({kpi.countVencidas})
          </button>
        )}
      </div>

      {/* Status pills */}
      <div className="flex flex-wrap gap-1.5">
        {(['todos',...Object.keys(SP)] as string[]).map(s=>{
          const count = s==='todos' ? filtered.length : filtered.filter(p=>p.status===s).length
          const cfg = s==='todos' ? null : SP[s]
          return (
            <button key={s} onClick={()=>setStatusFiltro(s)}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFiltro===s?'bg-primary text-primary-foreground':'border hover:bg-muted'
              }`}>
              {cfg && <cfg.Icon className="h-3 w-3"/>}
              {s==='todos'?'Todos':cfg?.label} <span className="opacity-70">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Tabela */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border py-14 text-center">
          <Banknote className="mx-auto h-10 w-10 text-muted-foreground/30"/>
          <p className="mt-3 text-sm text-muted-foreground">
            {statusFiltro !== 'todos' || tempoFiltro !== 'todos'
              ? 'Nenhum resultado para os filtros'
              : 'Nenhuma parcela de recebimento gerada'}
          </p>
          {statusFiltro === 'todos' && tempoFiltro === 'todos' && (
            <p className="mt-1 text-xs text-muted-foreground/70">Parcelas são criadas automaticamente quando uma medição é liberada</p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/80">
              <tr className="text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-3 w-9">
                  <input type="checkbox"
                    checked={selection.count>0&&selection.count===filtered.length}
                    onChange={()=>selection.toggleAll(filtered.map(p=>p.id))}
                    className="h-3.5 w-3.5 rounded accent-primary cursor-pointer"/>
                </th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Medição</th>
                <th className="px-3 py-3 text-right">Valor</th>
                <th className="px-3 py-3 text-right">Recebido</th>
                <th className="px-3 py-3 text-right">Saldo</th>
                <th className="px-3 py-3">Vencimento</th>
                <th className="px-3 py-3">Prev. Recebimento</th>
                <th className="px-3 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map(p => {
                const saldo = p.valor - p.valor_recebido
                const pct   = p.valor > 0 ? (p.valor_recebido / p.valor) * 100 : 0
                const cfg   = SP[p.status] ?? SP.futura
                const Ico   = cfg.Icon
                const dtVenc= p.data_vencimento
                const dtPrev= p.data_prevista_recebimento
                const dtReal= p.data_recebimento_real
                const vencida = dtVenc && p.status!=='recebida' && dtVenc < today
                const hojeVenc= dtVenc === today
                return (
                  <tr key={p.id} className={`border-b border-border/40 hover:bg-muted/20 transition-colors ${selection.isSelected(p.id)?'bg-primary/5':''}`}>
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={selection.isSelected(p.id)} onChange={()=>selection.toggle(p.id)}
                        className="h-3.5 w-3.5 rounded accent-primary cursor-pointer"/>
                    </td>

                    {/* Status chip */}
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
                        <Ico className="h-3 w-3"/>{cfg.label}
                      </span>
                    </td>

                    {/* Medição */}
                    <td className="px-3 py-3">
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                        MED {p.medicao?.numero ?? '—'}
                      </span>
                      <div className="mt-0.5 text-xs text-muted-foreground">Parc. {p.numero_parcela}</div>
                    </td>

                    {/* Valor */}
                    <td className="px-3 py-3 text-right tabular-nums font-medium">{formatCurrency(p.valor)}</td>

                    {/* Recebido + barra */}
                    <td className="px-3 py-3 text-right">
                      <div className="text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">{formatCurrency(p.valor_recebido)}</div>
                      {pct > 0 && pct < 100 && (
                        <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500" style={{width:`${pct}%`}}/>
                        </div>
                      )}
                    </td>

                    {/* Saldo */}
                    <td className="px-3 py-3 text-right">
                      <span className={`font-semibold tabular-nums ${saldo>0.5?'text-amber-700 dark:text-amber-400':'text-muted-foreground'}`}>
                        {formatCurrency(saldo)}
                      </span>
                    </td>

                    {/* Vencimento com VENC/HOJE */}
                    <td className="px-3 py-3 text-sm">
                      {dtVenc ? (
                        <div>
                          <div className="flex items-center gap-1">
                            {fmtDt(dtVenc)}
                            {vencida && <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">VENC</span>}
                            {!vencida && hojeVenc && <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">HOJE</span>}
                          </div>
                        </div>
                      ) : '—'}
                    </td>

                    {/* Data prevista */}
                    <td className="px-3 py-3 text-sm text-muted-foreground">{fmtDt(dtPrev)}</td>

                    {/* Ações */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        {/* Baixar */}
                        {p.status !== 'recebida' && (
                          <button onClick={()=>setBaixando(p)}
                            className="rounded-lg border border-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-600 hover:text-white dark:text-emerald-400 transition-colors">
                            Baixar
                          </button>
                        )}
                        {/* Estornar */}
                        {p.status === 'recebida' && (
                          <button onClick={()=>{
                            if(!confirm('Estornar recebimento?')) return
                            update.mutate({id:p.id, valor_recebido:0, data_recebimento_real:null})
                          }}
                            className="rounded-lg border border-amber-500 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-500 hover:text-white dark:text-amber-400 transition-colors">
                            Estornar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar
        count={selection.count}
        onClear={selection.clear}
        summary={[
          { label:'Pendente', value:formatCurrency(bulkPendente), tone:'amber' },
          { label:'Selecionadas', value:String(selection.count), tone:'primary' },
        ]}
      >
        <BulkButton icon={CheckCircle2} label="Baixar em lote" onClick={handleBulkBaixar}/>
        <BulkButton icon={Download} label="Exportar" onClick={()=>{
          const csv = ['Medição;Parcela;Valor;Recebido;Saldo;Status;Vencimento', ...selectedItems.map(p=>`${p.medicao?.numero};${p.numero_parcela};${p.valor};${p.valor_recebido};${(p.valor-p.valor_recebido).toFixed(2)};${p.status};${p.data_vencimento??''}`)]
          const url = URL.createObjectURL(new Blob([csv.join('\n')],{type:'text/csv'}))
          Object.assign(document.createElement('a'),{href:url,download:'parcelas_recebimento.csv'}).click()
        }}/>
      </BulkActionBar>

      {/* Modal de baixa */}
      {baixando && <BaixaParcelaModal parcela={baixando} onClose={()=>setBaixando(null)}/>}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function MedicoesPage() {
  const { restartTour } = useTour('medicoes', pageTours.medicoes)
  const {  } = useProject()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'medicoes' | 'recebimentos'>('medicoes')
  const { data: medicoes = [], isLoading } = useMedicoes()
  const { data: distribuicoes = [] } = useDistribuicao()
  const { data: etapas = [] } = useEtapas()
  const createMedicao = useCreateMedicao()
  const updateMedicao = useUpdateMedicao()
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})
  const selection = useSelection()


  const toggleRow = (id: string) => setExpandedRows(p => ({ ...p, [id]: !p[id] }))

  // Agrupar distribuições por medição_numero
  const distByMedicao = useMemo(() => {
    const map = new Map<number, typeof distribuicoes>()
    distribuicoes.forEach(d => {
      const arr = map.get(d.medicao_numero) ?? []
      arr.push(d)
      map.set(d.medicao_numero, arr)
    })
    return map
  }, [distribuicoes])

  // Map etapa_id → etapa
  const etapaMap = useMemo(() => {
    const m = new Map<string, { nome: string; codigo: string; faturamento_preco_unitario?: number }>()
    etapas.forEach(e => m.set(e.id, { nome: e.nome, codigo: e.codigo, faturamento_preco_unitario: e.faturamento_preco_unitario ?? undefined }))
    return m
  }, [etapas])



  const [bulkModal, setBulkModal] = useState<'status' | 'adiar' | null>(null)

  const [form, setForm] = useState({
    numero: '', valor_planejado: '', data_prevista: '',
    percentual_fisico_meta: '', observacoes: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createMedicao.mutateAsync({
      numero: parseInt(form.numero),
      valor_planejado: parseFloat(form.valor_planejado),
      data_prevista: form.data_prevista,
      percentual_fisico_meta: form.percentual_fisico_meta ? parseFloat(form.percentual_fisico_meta) : 0,
      observacoes: form.observacoes || null,
      status: 'futura',
    })
    setShowForm(false)
    setForm({ numero: '', valor_planejado: '', data_prevista: '', percentual_fisico_meta: '', observacoes: '' })
  }

  // KPIs
  const totalPlanejado = medicoes.reduce((s, m) => s + m.valor_planejado, 0)
  const totalLiberado = medicoes.reduce((s, m) => s + m.valor_liberado, 0)
  const totalServicos = useMemo(() => {
    let t = 0
    distribuicoes.forEach(d => { t += Number(d.valor_liberado_faturamento || 0) })
    return t
  }, [distribuicoes])
  const avgFisico = medicoes.length > 0
    ? medicoes.reduce((s, m) => s + m.percentual_fisico_real, 0) / medicoes.length : 0

  const selectedMedicoes = useMemo(
    () => medicoes.filter(m => selection.selected.has(m.id)),
    [medicoes, selection.selected],
  )

  const handleBulkExport = () => {
    const data = (selectedMedicoes.length > 0 ? selectedMedicoes : medicoes).map(m => ({
      '#': m.numero, 'Planejado': m.valor_planejado, 'Liberado': m.valor_liberado,
      'Data Prevista': m.data_prevista, '% Meta': m.percentual_fisico_meta,
      '% Real': m.percentual_fisico_real, 'Status': m.status,
    }))
    exportToExcel(data, `medicoes_${new Date().toISOString().split('T')[0]}`, 'Medições')
    toast.success(`${data.length} medições exportadas`)
  }

  const filteredMedicoes = useMemo(() => {
    if (!search) return medicoes
    const q = search.toLowerCase()
    return medicoes.filter(m =>
      String(m.numero).includes(q) ||
      m.status.toLowerCase().includes(q)
    )
  }, [medicoes, search])

  return (
    <div>
      <PageHeader title="Medições" description="Controle de medições do contrato — receitas por serviço" icon={ClipboardCheck} onHelp={restartTour} />

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Planejado</p>
          <p className="mt-1 text-xl font-bold">{formatCurrency(totalPlanejado)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Liberado</p>
          <p className="mt-1 text-xl font-bold text-emerald-500">{formatCurrency(totalLiberado)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Receita Serviços</p>
          <p className="mt-1 text-xl font-bold text-blue-500">{formatCurrency(totalServicos)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">% Físico Médio</p>
          <p className="mt-1 text-xl font-bold text-amber-500">{formatPercent(avgFisico)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b">
        {([
          { key: 'medicoes',     label: 'Medições',                icon: ClipboardCheck },
          { key: 'recebimentos', label: 'Parcelas de Recebimento', icon: Banknote },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Parcelas de Recebimento */}
      {activeTab === 'recebimentos' && <ParcelasRecebimentoTab />}

      {/* Tab: Medições (conteúdo original) */}
      {activeTab === 'medicoes' && <>

      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nº ou status..." className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>

        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Nova Medição
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="mb-4 rounded-xl border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Nova Medição</h3>
            <button onClick={() => setShowForm(false)} className="rounded-md p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div><label className="mb-1 block text-xs font-medium text-muted-foreground">Nº *</label><input type="number" min="1" value={form.numero} onChange={(e) => setForm((p) => ({ ...p, numero: e.target.value }))} required className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" /></div>
              <div><label className="mb-1 block text-xs font-medium text-muted-foreground">Valor Planejado (R$) *</label><input type="number" step="0.01" value={form.valor_planejado} onChange={(e) => setForm((p) => ({ ...p, valor_planejado: e.target.value }))} required className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" /></div>
              <div><label className="mb-1 block text-xs font-medium text-muted-foreground">Data Prevista *</label><input type="date" value={form.data_prevista} onChange={(e) => setForm((p) => ({ ...p, data_prevista: e.target.value }))} required className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" /></div>
              <div><label className="mb-1 block text-xs font-medium text-muted-foreground">% Físico Meta</label><input type="number" step="0.1" min="0" max="100" value={form.percentual_fisico_meta} onChange={(e) => setForm((p) => ({ ...p, percentual_fisico_meta: e.target.value }))} className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" /></div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
              <button type="submit" className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"><Check className="h-4 w-4" />Criar</button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : filteredMedicoes.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed"><p className="text-sm text-muted-foreground">Nenhuma medição cadastrada</p></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="tbl-bf w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-3 text-center w-8">
                  <input type="checkbox"
                    checked={selection.count === filteredMedicoes.length && filteredMedicoes.length > 0}
                    onChange={() => selection.toggleAll(filteredMedicoes.map(m => m.id))}
                    className="h-3.5 w-3.5 rounded accent-primary" />
                </th>
                <th className="px-2 py-3 text-center w-8"></th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">#</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Planejado</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Liberado</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Serviços</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Prevista</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Liberação</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">% Meta</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">% Real</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredMedicoes.map((m) => {
                const cfg = STATUS_CONFIG[m.status] ?? STATUS_CONFIG['futura']!
                const dists = distByMedicao.get(m.numero) ?? []
                const isExpanded = expandedRows[m.id]
                const servicosValor = dists.reduce((s, d) => s + Number(d.valor_liberado_faturamento || 0), 0)

                return (
                  <>
                    <tr key={m.id} className={`hover:bg-muted/30 ${selection.isSelected(m.id) ? 'bg-primary/5' : ''}`}>
                      <td className="px-3 py-3 text-center">
                        <input type="checkbox"
                          checked={selection.isSelected(m.id)}
                          onChange={() => selection.toggle(m.id)}
                          className="h-3.5 w-3.5 rounded accent-primary" />
                      </td>
                      <td className="px-2 py-3 text-center">
                        {dists.length > 0 && (
                          <button onClick={() => toggleRow(m.id)} className="rounded p-0.5 hover:bg-accent">
                            {isExpanded
                              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-bold">{m.numero}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(m.valor_planejado)}</td>
                      <td className="px-4 py-3 text-right text-emerald-500">{m.valor_liberado ? formatCurrency(m.valor_liberado) : '—'}</td>
                      <td className="px-4 py-3 text-right text-blue-500">
                        {servicosValor > 0 ? formatCurrency(servicosValor) : <span className="text-muted-foreground text-xs">{dists.length} serv.</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-xs">{formatDate(m.data_prevista)}</td>
                      <td className="px-4 py-3 text-center text-xs">{m.data_liberacao ? formatDate(m.data_liberacao) : '—'}</td>
                      <td className="px-4 py-3 text-center text-xs">{formatPercent(m.percentual_fisico_meta)}</td>
                      <td className="px-4 py-3 text-center text-xs font-medium">{formatPercent(m.percentual_fisico_real)}</td>
                      <td className="px-4 py-3 text-center">
                        <select
                          value={m.status}
                          onChange={(e) => updateMedicao.mutate({ id: m.id, status: e.target.value as Medicao['status'] })}
                          className={`rounded-full border-0 px-2 py-0.5 text-[10px] font-medium ${cfg.color}`}
                        >
                          <option value="futura">Futura</option>
                          <option value="em_medicao">Em Medição</option>
                          <option value="liberada">Liberada</option>
                          <option value="paga">Paga</option>
                        </select>
                      </td>
                    </tr>
                    {/* Expanded service rows */}
                    {isExpanded && dists.map(d => {
                      const etapa = etapaMap.get(d.etapa_id)
                      return (
                        <tr key={`dist-${d.id}`} className="bg-muted/10 border-b border-muted/30">
                          <td></td>
                          <td></td>
                          <td className="px-4 py-2 text-center text-muted-foreground text-[10px]">↳</td>
                          <td colSpan={2} className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-muted-foreground">{etapa?.codigo || '?'}</span>
                              <span className="text-xs font-medium truncate max-w-[200px]">{etapa?.nome || 'Serviço não encontrado'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right text-xs text-blue-500 font-medium">
                            {d.valor_liberado_faturamento ? formatCurrency(Number(d.valor_liberado_faturamento)) : '—'}
                          </td>
                          <td colSpan={2} className="px-4 py-2 text-center">
                            <div className="flex items-center justify-center gap-4 text-[10px]">
                              <span className="text-muted-foreground">Plan: <strong>{d.casas_planejadas}</strong></span>
                              <span className={d.casas_realizadas > 0 ? 'text-emerald-500 font-semibold' : 'text-muted-foreground'}>
                                Real: <strong>{d.casas_realizadas}</strong>
                              </span>
                            </div>
                          </td>
                          <td colSpan={2} className="px-4 py-2 text-center">
                            {d.casas_planejadas > 0 && (
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-emerald-500 transition-all"
                                    style={{ width: `${Math.min(100, (d.casas_realizadas / d.casas_planejadas) * 100)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-medium text-muted-foreground w-8">
                                  {Math.round((d.casas_realizadas / d.casas_planejadas) * 100)}%
                                </span>
                              </div>
                            )}
                          </td>
                          <td></td>
                        </tr>
                      )
                    })}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar count={selection.count} onClear={selection.clear}>
        <BulkBtn icon={Flag} label="Alterar status" onClick={() => setBulkModal('status')} />
        <BulkBtn icon={CalendarClock} label="Adiar datas" onClick={() => setBulkModal('adiar')} />
        <BulkBtn icon={Download} label="Exportar" onClick={handleBulkExport} />
      </BulkActionBar>

      {/* Modais */}
      {bulkModal === 'status' && <BulkStatusModal medicoes={selectedMedicoes} onClose={() => setBulkModal(null)} onDone={() => { selection.clear(); qc.invalidateQueries({ queryKey: ['medicoes'] }) }} />}
      {bulkModal === 'adiar' && <BulkAdiarModal medicoes={selectedMedicoes} onClose={() => setBulkModal(null)} onDone={() => { selection.clear(); qc.invalidateQueries({ queryKey: ['medicoes'] }) }} />}

      </> /* fim tab medicoes */}
    </div>
  )
}

// ---------------------------------------------------------------------------
function BulkBtn({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-accent">
      <Icon className="h-3.5 w-3.5" />{label}
    </button>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Footer({ onClose, onConfirm, saving, label }: {
  onClose: () => void; onConfirm: () => void; saving: boolean; label: string
}) {
  return (
    <div className="mt-4 flex justify-end gap-2">
      <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
      <button onClick={onConfirm} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40">
        {saving ? 'Processando...' : label}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
function BulkStatusModal({ medicoes, onClose, onDone }: { medicoes: Medicao[]; onClose: () => void; onDone: () => void }) {
  const { currentCompany } = useProject()
  const [status, setStatus] = useState<Medicao['status']>('em_medicao')
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    setSaving(true)
    try {
      for (const m of medicoes) {
        const updates: Record<string, unknown> = { status }
        if (status === 'liberada' && !m.data_liberacao) {
          updates.data_liberacao = new Date().toISOString().split('T')[0]
        }
        await supabase.from('medicoes').update(updates).eq('id', m.id)
      }
      await supabase.from('audit_logs').insert({
        company_id: currentCompany?.id, tabela: 'medicoes',
        acao: 'UPDATE', agente: 'humano',
        dados_antes: { operacao: 'alterar_status_medicoes', medicoes: medicoes.length, ids: medicoes.map(m => m.id) },
        dados_depois: { novo_status: status },
      })
      toast.success(`Status de ${medicoes.length} medições alterado para "${STATUS_CONFIG[status]?.label}"`)
      onDone(); onClose()
    } catch { toast.error('Erro ao alterar status') } finally { setSaving(false) }
  }

  return (
    <Modal title={`Alterar status de ${medicoes.length} medições`} onClose={onClose}>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Novo status</label>
        <select value={status} onChange={e => setStatus(e.target.value as Medicao['status'])}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
          <option value="futura">Futura</option>
          <option value="em_medicao">Em Medição</option>
          <option value="liberada">Liberada</option>
          <option value="paga">Paga</option>
        </select>
        {status === 'liberada' && (
          <p className="mt-2 text-[10px] text-amber-500">⚡ Medições sem data_liberacao receberão a data de hoje</p>
        )}
      </div>
      <Footer onClose={onClose} onConfirm={handleConfirm} saving={saving} label="Aplicar status" />
    </Modal>
  )
}

// ---------------------------------------------------------------------------
function BulkAdiarModal({ medicoes, onClose, onDone }: { medicoes: Medicao[]; onClose: () => void; onDone: () => void }) {
  const { currentCompany } = useProject()
  const [delta, setDelta] = useState(7)
  const [saving, setSaving] = useState(false)

  const preview = useMemo(() => medicoes.map(m => ({
    ...m,
    novaData: shiftDate(m.data_prevista, delta),
  })), [medicoes, delta])

  const handleConfirm = async () => {
    if (delta === 0) { toast.error('Delta não pode ser 0'); return }
    setSaving(true)
    try {
      for (const m of medicoes) {
        await supabase.from('medicoes').update({
          data_prevista: shiftDate(m.data_prevista, delta),
        }).eq('id', m.id)
      }
      await supabase.from('audit_logs').insert({
        company_id: currentCompany?.id, tabela: 'medicoes',
        acao: 'UPDATE', agente: 'humano',
        dados_antes: { operacao: 'adiar_medicoes', medicoes: medicoes.length, ids: medicoes.map(m => m.id) },
        dados_depois: { delta },
      })
      toast.success(`${medicoes.length} medições adiadas em ${delta} dias`)
      onDone(); onClose()
    } catch { toast.error('Erro ao adiar') } finally { setSaving(false) }
  }

  return (
    <Modal title={`Adiar ${medicoes.length} medições`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Deslocar em dias</label>
          <input type="number" value={delta} onChange={e => setDelta(Number(e.target.value))}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
        </div>
        {delta !== 0 && (
          <div className="max-h-40 overflow-y-auto rounded-lg border">
            <table className="tbl-bf w-full text-[11px]">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="px-2 py-1.5 text-center font-medium">#</th>
                  <th className="px-2 py-1.5 text-center font-medium">Antes</th>
                  <th className="px-2 py-1.5 text-center font-medium">Depois</th>
                </tr>
              </thead>
              <tbody>
                {preview.map(m => (
                  <tr key={m.id} className="border-t">
                    <td className="px-2 py-1 text-center font-bold">{m.numero}</td>
                    <td className="px-2 py-1 text-center text-muted-foreground">{fmtDt(m.data_prevista)}</td>
                    <td className="px-2 py-1 text-center">
                      <span className="font-medium text-blue-500">{fmtDt(m.novaData)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Footer onClose={onClose} onConfirm={handleConfirm} saving={saving} label="Adiar medições" />
    </Modal>
  )
}

function shiftDate(dateStr: string, delta: number): string {
  const d = localDate(dateStr)
  d.setDate(d.getDate() + delta)
  return d.toISOString().split('T')[0]!
}

function fmtDt(d: string): string {
  return localDate(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
