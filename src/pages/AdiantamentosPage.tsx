import { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import BulkActionBar, { BulkButton } from '@/components/BulkActionBar'
import { useSelection } from '@/hooks/useSelection'
import {
  useAdiantamentos, useCreateAdiantamento, useUpdateAdiantamento,
  useDeleteAdiantamento, useAbaterAdiantamento, type Adiantamento, type AdiantamentoInsert,
} from '@/hooks/useAdiantamentos'
import { usePedidos } from '@/hooks/useCompras'
import { useContasBancarias } from '@/hooks/useFinanceiro'
import { formatCurrency } from '@/lib/utils'
import {
  HandCoins, Plus, AlertTriangle, CheckCircle2, Clock, X,
  Pencil, Trash2, ExternalLink, ChevronDown, ChevronRight,
  Filter, Download, Search,
} from 'lucide-react'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function addDays(iso: string, n: number) {
  const d = new Date(iso+'T00:00:00'); d.setDate(d.getDate()+n)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'})
}
function diasAtraso(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso+'T00:00:00').getTime()) / 86400000))
}
function exportCSV(rows: Adiantamento[]) {
  const lines = [
    ['Pedido','Fornecedor','Valor','Abatido','Saldo','Data Pgto','Prev. Abatimento','Status'],
    ...rows.map(a => [
      a.pedido?.numero_pedido ?? '—',
      a.fornecedor?.nome ?? a.pedido?.fornecedores?.nome ?? '—',
      a.valor, a.valor_abatido,
      (a.valor - a.valor_abatido).toFixed(2),
      a.data_pagamento ?? '—',
      a.data_prevista_abatimento ?? '—',
      a.status,
    ]),
  ]
  const csv = lines.map(r => r.join(';')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], {type:'text/csv'}))
  Object.assign(document.createElement('a'), {href:url, download:'adiantamentos.csv'}).click()
}

// ─── Status config ────────────────────────────────────────────────────────────

const S: Record<string, {label:string; icon: typeof Clock; bg:string; text:string}> = {
  pendente:              { label:'Pendente',         icon:Clock,         bg:'bg-amber-100  dark:bg-amber-900/30',  text:'text-amber-700  dark:text-amber-400' },
  parcialmente_abatido:  { label:'Parc. Abatido',    icon:ChevronDown,   bg:'bg-blue-100   dark:bg-blue-900/30',   text:'text-blue-700   dark:text-blue-400'  },
  abatido:               { label:'Abatido',          icon:CheckCircle2,  bg:'bg-emerald-100 dark:bg-emerald-900/30',text:'text-emerald-700 dark:text-emerald-400'},
}
const S_DEFAULT: {label:string; icon: typeof Clock; bg:string; text:string} =
  { label:'Pendente', icon:Clock, bg:'bg-amber-100 dark:bg-amber-900/30', text:'text-amber-700 dark:text-amber-400' }

// ─── Modais ───────────────────────────────────────────────────────────────────

function AdiantamentoModal({
  adiantamento, onClose,
}: {
  adiantamento?: Adiantamento
  onClose: () => void
}) {
  const { data: pedidos = [] } = usePedidos()
  const { data: contas = [] } = useContasBancarias()
  const criar = useCreateAdiantamento()
  const atualizar = useUpdateAdiantamento()
  const isPending = criar.isPending || atualizar.isPending

  const isEdit = !!adiantamento
  const [form, setForm] = useState({
    pedido_id:               adiantamento?.pedido_id ?? '',
    valor:                   adiantamento?.valor ?? 0,
    data_pagamento:          adiantamento?.data_pagamento ?? todayISO(),
    data_prevista_abatimento:adiantamento?.data_prevista_abatimento ?? '',
    conta_bancaria_id:       adiantamento?.conta_bancaria_id ?? '',
    forma_pagamento:         adiantamento?.forma_pagamento ?? '',
    observacao:              adiantamento?.observacao ?? '',
  })

  const pedidosAtivos = pedidos.filter(p => p.status !== 'cancelado')

  async function handleSave() {
    if (!form.pedido_id || !form.valor) return
    const payload = {
      pedido_id:               form.pedido_id,
      valor:                   Number(form.valor),
      data_pagamento:          form.data_pagamento || null,
      data_prevista_abatimento:form.data_prevista_abatimento || null,
      conta_bancaria_id:       form.conta_bancaria_id || null,
      forma_pagamento:         form.forma_pagamento || null,
      observacao:              form.observacao || null,
    }
    if (isEdit) {
      await atualizar.mutateAsync({ id: adiantamento!.id, ...payload })
    } else {
      await criar.mutateAsync(payload as AdiantamentoInsert)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">{isEdit ? 'Editar Adiantamento' : 'Novo Adiantamento'}</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted"><X className="h-4 w-4"/></button>
        </div>
        <div className="space-y-3 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Pedido *</label>
            <select
              disabled={isEdit}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:opacity-50"
              value={form.pedido_id}
              onChange={e => setForm(f=>({...f,pedido_id:e.target.value}))}
            >
              <option value="">Selecione…</option>
              {pedidosAtivos.map(p=>(
                <option key={p.id} value={p.id}>
                  #{p.numero_pedido} — {p.fornecedor_nome ?? '—'} — {formatCurrency(p.valor_total_real ?? 0)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor *</label>
              <input type="number" min="0.01" step="0.01" className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={form.valor||''} onChange={e=>setForm(f=>({...f,valor:parseFloat(e.target.value)||0}))}/>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Data do Pagamento</label>
              <input type="date" className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={form.data_pagamento} onChange={e=>setForm(f=>({...f,data_pagamento:e.target.value}))}/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Prev. Abatimento</label>
              <input type="date" className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={form.data_prevista_abatimento} onChange={e=>setForm(f=>({...f,data_prevista_abatimento:e.target.value}))}/>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Forma de Pagamento</label>
              <select className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={form.forma_pagamento} onChange={e=>setForm(f=>({...f,forma_pagamento:e.target.value}))}>
                <option value="">—</option>
                {['PIX','TED','DOC','Boleto','Cheque','Dinheiro'].map(v=>(
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Conta Bancária</label>
            <select className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              value={form.conta_bancaria_id} onChange={e=>setForm(f=>({...f,conta_bancaria_id:e.target.value}))}>
              <option value="">—</option>
              {contas.filter(c=>c.ativa).map(c=>(
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Observação</label>
            <input type="text" className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              value={form.observacao} onChange={e=>setForm(f=>({...f,observacao:e.target.value}))}/>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
          <button
            onClick={handleSave} disabled={isPending||!form.pedido_id||!form.valor}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Abater Modal ─────────────────────────────────────────────────────────────

function AbaterModal({ adiantamento, onClose }: { adiantamento: Adiantamento; onClose: ()=>void }) {
  const abater = useAbaterAdiantamento()
  const saldo = adiantamento.valor - adiantamento.valor_abatido
  const [valor, setValor] = useState(String(saldo.toFixed(2)))

  async function handleConfirm() {
    const v = parseFloat(valor)
    if (!v || v <= 0) return
    await abater.mutateAsync({ id: adiantamento.id, valorAbatimento: Math.min(v, saldo) })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">Registrar Abatimento</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted"><X className="h-4 w-4"/></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Valor adiantado</span><span className="font-semibold">{formatCurrency(adiantamento.valor)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Já abatido</span><span className="text-emerald-700 font-semibold">{formatCurrency(adiantamento.valor_abatido)}</span></div>
            <div className="flex justify-between border-t mt-2 pt-2"><span className="text-muted-foreground">Saldo pendente</span><span className="font-bold text-amber-700">{formatCurrency(saldo)}</span></div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor do abatimento *</label>
            <input type="number" min="0.01" step="0.01" max={saldo}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-right font-mono"
              value={valor} onChange={e=>setValor(e.target.value)} autoFocus/>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
          <button
            onClick={handleConfirm} disabled={abater.isPending || !parseFloat(valor)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {abater.isPending ? 'Salvando…' : 'Confirmar Abatimento'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Linha da tabela ──────────────────────────────────────────────────────────

function Row({
  a, selected, onToggle, onEdit, onAbater,
}: {
  a: Adiantamento
  selected: boolean
  onToggle: ()=>void
  onEdit: ()=>void
  onAbater: ()=>void
}) {
  const excluir = useDeleteAdiantamento()
  const atualizar = useUpdateAdiantamento()
  const today = todayISO()

  const saldo = a.valor - a.valor_abatido
  const pct = a.valor > 0 ? (a.valor_abatido / a.valor) * 100 : 0
  const cfg = S[a.status] ?? S_DEFAULT
  const Ico = cfg.icon

  const dtPrev = a.data_prevista_abatimento
  const atraso = dtPrev && a.status !== 'abatido' ? diasAtraso(dtPrev) : 0
  const vencida = atraso > 0
  const hoje    = dtPrev === today

  const dtPgto = a.data_pagamento
  const pagoHoje = dtPgto === today

  return (
    <tr className={`border-b border-border/40 transition-colors hover:bg-muted/20 ${selected ? 'bg-primary/5' : ''}`}>
      {/* Checkbox */}
      <td className="px-3 py-3 w-9">
        <input type="checkbox" checked={selected} onChange={onToggle}
          className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"/>
      </td>

      {/* Status */}
      <td className="px-3 py-3">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
          <Ico className="h-3 w-3"/>
          {cfg.label}
        </span>
      </td>

      {/* Pedido */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary tabular-nums">
            PED #{a.pedido?.numero_pedido ?? '—'}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground truncate max-w-[140px]">
          {a.fornecedor?.nome ?? a.pedido?.fornecedores?.nome ?? '—'}
        </div>
      </td>

      {/* Valor */}
      <td className="px-3 py-3 text-right">
        <div className="font-semibold tabular-nums">{formatCurrency(a.valor)}</div>
      </td>

      {/* Abatido + barra de progresso */}
      <td className="px-3 py-3 text-right">
        <div className="text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">{formatCurrency(a.valor_abatido)}</div>
        {pct > 0 && pct < 100 && (
          <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500" style={{width:`${pct}%`}}/>
          </div>
        )}
      </td>

      {/* Saldo */}
      <td className="px-3 py-3 text-right">
        <span className={`font-semibold tabular-nums ${saldo > 0.5 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
          {formatCurrency(saldo)}
        </span>
      </td>

      {/* Data Pagamento */}
      <td className="px-3 py-3 text-sm text-muted-foreground">
        {dtPgto ? (
          <div className="flex items-center gap-1">
            {fmtDate(dtPgto)}
            {pagoHoje && <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">HOJE</span>}
          </div>
        ) : (
          <span className="text-muted-foreground/50 italic text-xs">não pago</span>
        )}
      </td>

      {/* Data Prevista Abatimento */}
      <td className="px-3 py-3">
        {dtPrev ? (
          <div>
            <div className="flex items-center gap-1 text-sm">
              {fmtDate(dtPrev)}
              {vencida && <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">VENC</span>}
              {!vencida && hoje && <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">HOJE</span>}
            </div>
            {vencida && (
              <div className="text-[10px] text-red-600 font-semibold flex items-center gap-0.5 mt-0.5">
                <AlertTriangle className="h-2.5 w-2.5"/>{atraso}d de atraso
              </div>
            )}
          </div>
        ) : <span className="text-muted-foreground/50">—</span>}
      </td>

      {/* Ações */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1">
          {/* Ir ao pedido */}
          <Link to="/compras" title="Ver pedido em Compras"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <ExternalLink className="h-3.5 w-3.5"/>
          </Link>

          {/* Editar */}
          <button onClick={onEdit} title="Editar"
            className="rounded-lg p-1.5 text-primary hover:bg-primary/10 transition-colors">
            <Pencil className="h-3.5 w-3.5"/>
          </button>

          {/* Abater (pendente/parcialmente_abatido) */}
          {a.status !== 'abatido' && (
            <button onClick={onAbater}
              className="rounded-lg border border-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-600 hover:text-white dark:text-emerald-400 transition-colors">
              Abater
            </button>
          )}

          {/* Estornar abatimento */}
          {a.status === 'abatido' && (
            <button
              onClick={()=> { if(confirm('Estornar todo o abatimento?')) atualizar.mutate({id:a.id, valor_abatido:0}) }}
              className="rounded-lg border border-amber-500 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-500 hover:text-white dark:text-amber-400 transition-colors">
              Estornar
            </button>
          )}

          {/* Excluir */}
          {a.status !== 'abatido' && (
            <button onClick={()=>{ if(confirm('Excluir este adiantamento?')) excluir.mutate(a.id) }}
              title="Excluir"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600 transition-colors">
              <Trash2 className="h-3.5 w-3.5"/>
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Accordions agrupados ──────────────────────────────────────────────────────

function GroupedTable({
  groups,
  labelFn,
}: {
  groups: Map<string, Adiantamento[]>
  labelFn: (key: string, items: Adiantamento[]) => { title: string; subtitle: string }
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (k: string) => setExpanded(s => { const n=new Set(s); n.has(k)?n.delete(k):n.add(k); return n })

  return (
    <div className="space-y-2">
      {Array.from(groups.entries()).map(([key, items]) => {
        const { title, subtitle } = labelFn(key, items)
        const total = items.reduce((s,a)=>s+a.valor, 0)
        const abatido = items.reduce((s,a)=>s+a.valor_abatido, 0)
        const isOpen = expanded.has(key)
        return (
          <div key={key} className="rounded-xl border overflow-hidden">
            <button
              onClick={()=>toggle(key)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/60 transition-colors text-left"
            >
              {isOpen ? <ChevronDown className="h-4 w-4 shrink-0"/> : <ChevronRight className="h-4 w-4 shrink-0"/>}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{title}</div>
                <div className="text-xs text-muted-foreground">{subtitle} · {items.length} adiantamento{items.length!==1?'s':''}</div>
              </div>
              <div className="text-right tabular-nums text-sm space-y-0.5">
                <div className="font-semibold">{formatCurrency(total)}</div>
                <div className="text-xs text-emerald-700 dark:text-emerald-400">{formatCurrency(abatido)} abatido</div>
              </div>
            </button>
            {isOpen && (
              <table className="w-full text-sm">
                <thead className="bg-muted/20">
                  <tr className="text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-right">Valor</th>
                    <th className="px-4 py-2 text-right">Abatido</th>
                    <th className="px-4 py-2 text-right">Saldo</th>
                    <th className="px-4 py-2">Prev. Abatimento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {items.map(a => {
                    const cfg = S[a.status] ?? S_DEFAULT
                    const Ico = cfg.icon
                    const saldo = a.valor - a.valor_abatido
                    const dtPrev = a.data_prevista_abatimento
                    const atraso = dtPrev && a.status !== 'abatido' ? diasAtraso(dtPrev) : 0
                    return (
                      <tr key={a.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
                            <Ico className="h-3 w-3"/>{cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatCurrency(a.valor)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(a.valor_abatido)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          <span className={saldo > 0.5 ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-muted-foreground'}>
                            {formatCurrency(saldo)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-sm">
                          {dtPrev ? (
                            <span className={atraso > 0 ? 'text-red-600 font-semibold' : 'text-muted-foreground'}>
                              {fmtDate(dtPrev)}
                              {atraso > 0 && <span className="ml-1 text-[10px]">({atraso}d)</span>}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

type TabKey = 'todos' | 'pendentes' | 'por-pedido' | 'por-fornecedor'
type StatusFiltro = 'todos' | 'pendente' | 'parcialmente_abatido' | 'abatido'
type TempoFiltro  = 'todos' | 'vencido' | 'proximo30'

export default function AdiantamentosPage() {
  const { data: adiantamentos = [] } = useAdiantamentos()
  const [searchParams] = useSearchParams()
  const selection = useSelection()
  const excluirMut = useDeleteAdiantamento()

  const [activeTab, setActiveTab] = useState<TabKey>(
    searchParams.get('filtro') === 'em-aberto' ? 'pendentes' : 'todos'
  )
  const [search, setSearch] = useState('')
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>('todos')
  const [tempoFiltro, setTempoFiltro] = useState<TempoFiltro>('todos')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [fornecedorFiltro, setFornecedorFiltro] = useState('')
  const [modal, setModal] = useState<'novo' | {edit: Adiantamento} | {abater: Adiantamento} | null>(null)

  const today = todayISO()
  const in30  = addDays(today, 30)

  // ── KPI Aggregates ──────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const total   = adiantamentos.reduce((s,a)=>s+a.valor, 0)
    const abatido = adiantamentos.reduce((s,a)=>s+a.valor_abatido, 0)
    const emAberto= adiantamentos.filter(a=>a.status!=='abatido').reduce((s,a)=>s+(a.valor-a.valor_abatido), 0)
    const risco   = adiantamentos.filter(a=>a.status!=='abatido' && a.data_prevista_abatimento && diasAtraso(a.data_prevista_abatimento)>30).length
    const vencidoCount = adiantamentos.filter(a=>a.status!=='abatido' && a.data_prevista_abatimento && a.data_prevista_abatimento < today).length
    return {total, abatido, emAberto, risco, vencidoCount}
  }, [adiantamentos, today])

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return adiantamentos.filter(a => {
      if (activeTab === 'pendentes' && a.status === 'abatido') return false
      if (statusFiltro !== 'todos' && a.status !== statusFiltro) return false
      if (tempoFiltro === 'vencido' && (!a.data_prevista_abatimento || a.data_prevista_abatimento >= today || a.status === 'abatido')) return false
      if (tempoFiltro === 'proximo30' && (!a.data_prevista_abatimento || a.data_prevista_abatimento < today || a.data_prevista_abatimento > in30)) return false
      if (fornecedorFiltro && !String(a.fornecedor?.nome ?? a.pedido?.fornecedores?.nome ?? '').toLowerCase().includes(fornecedorFiltro.toLowerCase())) return false
      if (search) {
        const q = search.toLowerCase()
        const forn = (a.fornecedor?.nome ?? a.pedido?.fornecedores?.nome ?? '').toLowerCase()
        const ped  = String(a.pedido?.numero_pedido ?? '')
        if (!forn.includes(q) && !ped.includes(q) && !(a.observacao??'').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [adiantamentos, activeTab, statusFiltro, tempoFiltro, fornecedorFiltro, search, today, in30])

  // ── Grouped views ─────────────────────────────────────────────────────────────
  const byPedido = useMemo(() => {
    const m = new Map<string, Adiantamento[]>()
    for (const a of adiantamentos) {
      const k = a.pedido_id
      m.set(k, [...(m.get(k)??[]), a])
    }
    return m
  }, [adiantamentos])

  const byFornecedor = useMemo(() => {
    const m = new Map<string, Adiantamento[]>()
    for (const a of adiantamentos) {
      const k = a.fornecedor?.nome ?? a.pedido?.fornecedores?.nome ?? 'Sem fornecedor'
      m.set(k, [...(m.get(k)??[]), a])
    }
    return m
  }, [adiantamentos])

  // ── Bulk ──────────────────────────────────────────────────────────────────────
  const selectedItems = filtered.filter(a => selection.isSelected(a.id))
  const bulkSaldo = selectedItems.reduce((s,a)=>s+(a.valor-a.valor_abatido), 0)
  const bulkEmRisco = selectedItems.filter(a=>a.status!=='abatido' && a.data_prevista_abatimento && diasAtraso(a.data_prevista_abatimento)>30).length

  async function handleBulkDelete() {
    if (!confirm(`Excluir ${selection.count} adiantamento(s)?`)) return
    for (const id of selection.selected) { await excluirMut.mutateAsync(id) }
    selection.clear()
  }

  const tabs: {key: TabKey; label: string; count?: number}[] = [
    { key:'todos',          label:'Todos',            count:adiantamentos.length },
    { key:'pendentes',      label:'Pendentes',        count:adiantamentos.filter(a=>a.status!=='abatido').length },
    { key:'por-pedido',     label:'Por Pedido' },
    { key:'por-fornecedor', label:'Por Fornecedor' },
  ]

  const TEMPO_OPTS: {key:TempoFiltro; label:string}[] = [
    {key:'todos',     label:'Todos'},
    {key:'vencido',   label:'Vencidos'},
    {key:'proximo30', label:'Próx. 30d'},
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Adiantamentos"
        description="Pagamentos antecipados a fornecedores vinculados a pedidos"
        icon={HandCoins}
      >
        <button
          onClick={()=>setModal('novo')}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4"/> Novo Adiantamento
        </button>
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label:'Total Adiantado', value:kpi.total,   sub:`${adiantamentos.length} registro${adiantamentos.length!==1?'s':''}`, tone:'default', onClick:()=>{ setActiveTab('todos'); setStatusFiltro('todos') } },
          { label:'Em Aberto',       value:kpi.emAberto, sub:`${adiantamentos.filter(a=>a.status!=='abatido').length} pendente${kpi.risco>0?` · ${kpi.risco} em risco`:''}`, tone: kpi.emAberto>0?'amber':'default', onClick:()=>{ setActiveTab('pendentes'); setStatusFiltro('todos') } },
          { label:'Abatido',         value:kpi.abatido,  sub:`${adiantamentos.filter(a=>a.status==='abatido').length} quitado${adiantamentos.filter(a=>a.status==='abatido').length!==1?'s':''}`, tone:'emerald', onClick:()=>{ setActiveTab('todos'); setStatusFiltro('abatido') } },
          { label:'Em Risco (>30d)', value:kpi.risco,   sub:'adiantamentos sem retorno', tone:kpi.risco>0?'danger':'emerald', isCount:true, onClick:()=>{ setActiveTab('pendentes'); setTempoFiltro('vencido') } },
        ].map(k=>(
          <button key={k.label} onClick={k.onClick}
            className={`rounded-xl border p-4 text-left hover:brightness-95 transition-all ${
              k.tone==='amber'?'border-amber-500/30 bg-amber-500/5':
              k.tone==='emerald'?'border-emerald-500/30 bg-emerald-500/5':
              k.tone==='danger'?'border-red-500/30 bg-red-500/5':'border-border bg-card'
            }`}
          >
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{k.label}</div>
            {(k as any).isCount ? (
              <div className={`mt-1 text-2xl font-bold tabular-nums ${k.tone==='danger'?'text-red-600':k.tone==='emerald'?'text-emerald-700 dark:text-emerald-400':''}`}>
                {kpi.risco > 0 ? kpi.risco : <span className="text-emerald-600">✓</span>}
              </div>
            ) : (
              <div className={`mt-1 text-2xl font-bold tabular-nums ${k.tone==='amber'?'text-amber-700 dark:text-amber-400':k.tone==='emerald'?'text-emerald-700 dark:text-emerald-400':''}`}>
                {formatCurrency(k.value as number)}
              </div>
            )}
            <div className="mt-1 text-[11px] text-muted-foreground">{k.sub}</div>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b">
        {tabs.map(t=>(
          <button key={t.key} onClick={()=>setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab===t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            {t.count!==undefined && (
              <span className={`rounded-full px-1.5 text-[10px] font-bold ${activeTab===t.key?'bg-primary text-primary-foreground':'bg-muted'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo dos tabs agrupados */}
      {activeTab === 'por-pedido' && (
        <GroupedTable
          groups={byPedido}
          labelFn={(_key, items) => ({
            title: `Pedido #${items[0]?.pedido?.numero_pedido ?? '—'}`,
            subtitle: items[0]?.fornecedor?.nome ?? items[0]?.pedido?.fornecedores?.nome ?? '—',
          })}
        />
      )}

      {activeTab === 'por-fornecedor' && (
        <GroupedTable
          groups={byFornecedor}
          labelFn={(key) => ({ title: key, subtitle: '' })}
        />
      )}

      {/* Toolbar (tabs todos / pendentes) */}
      {(activeTab === 'todos' || activeTab === 'pendentes') && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {/* Busca */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
              <input
                type="text" placeholder="Fornecedor, pedido, observação…"
                value={search} onChange={e=>setSearch(e.target.value)}
                className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none"
              />
            </div>

            {/* Filtros de tempo */}
            <div className="flex gap-0.5 rounded-lg border p-0.5">
              {TEMPO_OPTS.map(o=>(
                <button key={o.key} onClick={()=>setTempoFiltro(o.key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    tempoFiltro===o.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}>{o.label}</button>
              ))}
            </div>

            {/* Sel. vencidos */}
            {kpi.vencidoCount > 0 && (
              <button
                onClick={()=>selection.selectAll(adiantamentos.filter(a=>a.status!=='abatido'&&a.data_prevista_abatimento&&a.data_prevista_abatimento<today).map(a=>a.id))}
                className="rounded-lg border border-red-400 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-500/10 transition-colors"
              >
                Sel. vencidos ({kpi.vencidoCount})
              </button>
            )}

            {/* Filtros avançados toggle */}
            <button onClick={()=>setShowAdvanced(s=>!s)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${showAdvanced?'border-primary bg-primary/5 text-primary':'hover:bg-muted'}`}>
              <Filter className="h-3.5 w-3.5"/> Filtros
            </button>

            {/* Exportar */}
            <button onClick={()=>exportCSV(filtered)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">
              <Download className="h-3.5 w-3.5"/> Exportar
            </button>
          </div>

          {/* Painel de filtros avançados */}
          {showAdvanced && (
            <div className="rounded-xl border bg-muted/20 p-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
                <select className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  value={statusFiltro} onChange={e=>setStatusFiltro(e.target.value as StatusFiltro)}>
                  <option value="todos">Todos</option>
                  <option value="pendente">Pendente</option>
                  <option value="parcialmente_abatido">Parc. Abatido</option>
                  <option value="abatido">Abatido</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Fornecedor</label>
                <input type="text" placeholder="Filtrar por fornecedor…"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  value={fornecedorFiltro} onChange={e=>setFornecedorFiltro(e.target.value)}/>
              </div>
            </div>
          )}

          {/* Status pills */}
          <div className="flex flex-wrap gap-1.5">
            {(['todos','pendente','parcialmente_abatido','abatido'] as StatusFiltro[]).map(s=>{
              const count = s==='todos' ? filtered.length : filtered.filter(a=>a.status===s).length
              return (
                <button key={s} onClick={()=>setStatusFiltro(s)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    statusFiltro===s ? 'bg-primary text-primary-foreground' : 'border hover:bg-muted'
                  }`}
                >
                  {s==='todos'?'Todos':S[s]?.label??s} <span className="ml-1 opacity-70">{count}</span>
                </button>
              )
            })}
          </div>

          {/* Tabela */}
          {filtered.length === 0 ? (
            <div className="rounded-xl border py-16 text-center">
              <HandCoins className="mx-auto h-10 w-10 text-muted-foreground/30"/>
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                {search || statusFiltro!=='todos' || tempoFiltro!=='todos' ? 'Nenhum resultado para os filtros aplicados' : 'Nenhum adiantamento registrado'}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/80">
                  <tr className="text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-3 w-9">
                      <input type="checkbox"
                        checked={selection.count > 0 && selection.count === filtered.length}
                        onChange={()=>selection.toggleAll(filtered.map(a=>a.id))}
                        className="h-3.5 w-3.5 rounded accent-primary cursor-pointer"/>
                    </th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Pedido</th>
                    <th className="px-3 py-3 text-right">Valor</th>
                    <th className="px-3 py-3 text-right">Abatido</th>
                    <th className="px-3 py-3 text-right">Saldo</th>
                    <th className="px-3 py-3">Data Pgto</th>
                    <th className="px-3 py-3">Prev. Abatimento</th>
                    <th className="px-3 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(a=>(
                    <Row key={a.id} a={a}
                      selected={selection.isSelected(a.id)}
                      onToggle={()=>selection.toggle(a.id)}
                      onEdit={()=>setModal({edit:a})}
                      onAbater={()=>setModal({abater:a})}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar
        count={selection.count}
        onClear={selection.clear}
        summary={[
          { label:'Valor',    value:formatCurrency(selectedItems.reduce((s,a)=>s+a.valor,0)), tone:'primary' },
          { label:'Em aberto',value:formatCurrency(bulkSaldo), tone:'amber' },
          ...(bulkEmRisco>0 ? [{label:'Em risco', value:String(bulkEmRisco), tone:'red' as const}] : []),
        ]}
      >
        <BulkButton icon={Download} label="Exportar" onClick={()=>exportCSV(selectedItems)}/>
        <BulkButton icon={Trash2} label="Excluir" variant="danger" onClick={handleBulkDelete}/>
      </BulkActionBar>

      {/* Modais */}
      {modal === 'novo' && <AdiantamentoModal onClose={()=>setModal(null)}/>}
      {modal !== null && typeof modal === 'object' && 'edit' in modal && (
        <AdiantamentoModal adiantamento={modal.edit} onClose={()=>setModal(null)}/>
      )}
      {modal !== null && typeof modal === 'object' && 'abater' in modal && (
        <AbaterModal adiantamento={modal.abater} onClose={()=>setModal(null)}/>
      )}
    </div>
  )
}
