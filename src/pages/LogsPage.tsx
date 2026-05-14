/**
 * LogsPage — UI de inspeção dos logs debuggáveis (Fase 6).
 *
 * 4 abas:
 *   - Trilha:      cola correlation_id e vê event/error/perf em linha do tempo
 *   - Erros:       lista error_logs com filtro por severidade/categoria/aberto
 *   - Performance: top operações mais lentas + tempo médio por op
 *   - Atividade:   filtro por usuário → tudo que ele fez (event_logs)
 *
 * Use junto com a tela de Auditoria existente (que mostra audit_logs, ou seja,
 * mutações de dados). Esta página mostra a camada operacional/erros/perf.
 */

import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { logger } from '@/lib/logger'
import { formatDate } from '@/lib/utils'
import {
  Activity, AlertTriangle, Bug, Clock, Copy, GitBranch, Search,
  TimerReset, User, X,
} from 'lucide-react'
import { toast } from 'sonner'

type Tab = 'trilha' | 'erros' | 'performance' | 'atividade'

interface EventLog {
  id: string
  correlation_id: string | null
  company_id: string | null
  user_id: string | null
  user_email: string | null
  agente: string
  nivel: string
  categoria: string
  evento: string
  contexto: Record<string, unknown> | null
  duracao_ms: number | null
  origem: string
  created_at: string
}

interface ErrorLog {
  id: string
  correlation_id: string | null
  company_id: string | null
  user_id: string | null
  user_email: string | null
  origem: string
  severidade: 'warn' | 'error' | 'fatal'
  categoria: string
  mensagem: string
  stack: string | null
  url: string | null
  contexto: Record<string, unknown> | null
  erro_postgres_code: string | null
  erro_constraint: string | null
  resolvido: boolean
  created_at: string
}

interface PerfLog {
  id: string
  correlation_id: string | null
  user_email: string | null
  origem: string
  categoria: string
  operacao: string
  duracao_ms: number
  contexto: Record<string, unknown> | null
  created_at: string
}

const NIVEL_COLORS: Record<string, string> = {
  debug: 'bg-slate-100 text-slate-700 border-slate-300',
  info: 'bg-sky-100 text-sky-700 border-sky-300',
  warn: 'bg-amber-100 text-amber-700 border-amber-300',
  error: 'bg-red-100 text-red-700 border-red-300',
  fatal: 'bg-red-600 text-white border-red-700',
}

function timeAgo(d: string): string {
  const sec = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (sec < 60) return 'agora'
  if (sec < 3600) return `${Math.floor(sec / 60)}min`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`
  if (sec < 604800) return `${Math.floor(sec / 86400)}d`
  return formatDate(d)
}

function copyId(id: string, label = 'ID') {
  void navigator.clipboard?.writeText(id)
  toast.success(`${label} copiado`)
}

export default function LogsPage() {
  const [tab, setTab] = useState<Tab>('erros')

  return (
    <div className="p-6">
      <PageHeader
        title="Logs do sistema"
        description="Trilha, erros, performance e atividade de usuário. Pra debug e suporte."
        icon={Bug}
      />

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        <TabBtn active={tab === 'trilha'} onClick={() => setTab('trilha')} icon={GitBranch}>
          Trilha
        </TabBtn>
        <TabBtn active={tab === 'erros'} onClick={() => setTab('erros')} icon={AlertTriangle}>
          Erros
        </TabBtn>
        <TabBtn active={tab === 'performance'} onClick={() => setTab('performance')} icon={TimerReset}>
          Performance
        </TabBtn>
        <TabBtn active={tab === 'atividade'} onClick={() => setTab('atividade')} icon={User}>
          Atividade
        </TabBtn>
      </div>

      {tab === 'trilha' && <TrilhaTab />}
      {tab === 'erros' && <ErrosTab />}
      {tab === 'performance' && <PerformanceTab />}
      {tab === 'atividade' && <AtividadeTab />}
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: typeof GitBranch
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={
        'flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ' +
        (active
          ? 'border-primary text-primary'
          : 'border-transparent text-slate-600 hover:text-slate-900')
      }
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  )
}

// =============================== Aba: Trilha ================================
function TrilhaTab() {
  const [input, setInput] = useState('')
  const [cid, setCid] = useState<string | null>(null)
  const [events, setEvents] = useState<EventLog[]>([])
  const [errors, setErrors] = useState<ErrorLog[]>([])
  const [perfs, setPerfs] = useState<PerfLog[]>([])
  const [loading, setLoading] = useState(false)

  const buscar = async () => {
    const id = input.trim()
    if (!id) return
    setLoading(true)
    setCid(id)
    try {
      const [{ data: ev }, { data: er }, { data: pe }] = await Promise.all([
        supabase.from('event_logs').select('*').eq('correlation_id', id).order('created_at'),
        supabase.from('error_logs').select('*').eq('correlation_id', id).order('created_at'),
        supabase.from('performance_logs').select('*').eq('correlation_id', id).order('created_at'),
      ])
      setEvents((ev ?? []) as EventLog[])
      setErrors((er ?? []) as ErrorLog[])
      setPerfs((pe ?? []) as PerfLog[])
    } catch (err) {
      logger.error('auditoria', err, { kind: 'trilha_busca', cid: id })
    } finally {
      setLoading(false)
    }
  }

  type TimelineItem =
    | { kind: 'event'; row: EventLog; at: string }
    | { kind: 'error'; row: ErrorLog; at: string }
    | { kind: 'perf'; row: PerfLog; at: string }

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...events.map((row) => ({ kind: 'event' as const, row, at: row.created_at })),
      ...errors.map((row) => ({ kind: 'error' as const, row, at: row.created_at })),
      ...perfs.map((row) => ({ kind: 'perf' as const, row, at: row.created_at })),
    ]
    items.sort((a, b) => a.at.localeCompare(b.at))
    return items
  }, [events, errors, perfs])

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cole o correlation_id (UUID)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
            className="w-full rounded-md border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button
          onClick={buscar}
          disabled={loading || !input.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </div>

      {cid && !loading && (
        <div className="rounded-md border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 text-sm">
            <div>
              <span className="font-medium text-slate-700">Trilha de</span>{' '}
              <span className="font-mono text-xs text-slate-600">{cid}</span>
            </div>
            <div className="text-xs text-slate-500">
              {events.length} eventos · {errors.length} erros · {perfs.length} perf
            </div>
          </div>
          {timeline.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              Nenhum log encontrado pra esse correlation_id.
            </p>
          ) : (
            <ol className="divide-y divide-slate-100">
              {timeline.map((item, i) => (
                <TrilhaRow key={i} item={item} />
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}

function TrilhaRow({
  item,
}: {
  item:
    | { kind: 'event'; row: EventLog; at: string }
    | { kind: 'error'; row: ErrorLog; at: string }
    | { kind: 'perf'; row: PerfLog; at: string }
}) {
  if (item.kind === 'event') {
    const r = item.row
    return (
      <li className="flex items-start gap-3 px-4 py-2 text-sm">
        <span className={'shrink-0 rounded border px-2 py-0.5 text-[10px] font-medium uppercase ' + (NIVEL_COLORS[r.nivel] ?? '')}>
          {r.nivel}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs text-slate-700">
            {r.categoria}.{r.evento}
            {r.duracao_ms != null && <span className="ml-2 text-slate-500">({r.duracao_ms}ms)</span>}
          </div>
          {r.contexto && (
            <pre className="mt-1 max-h-24 overflow-auto rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
              {JSON.stringify(r.contexto, null, 2)}
            </pre>
          )}
        </div>
        <span className="shrink-0 text-xs text-slate-400">{new Date(r.at).toLocaleTimeString()}</span>
      </li>
    )
  }
  if (item.kind === 'error') {
    const r = item.row
    return (
      <li className="flex items-start gap-3 bg-red-50/50 px-4 py-2 text-sm">
        <span className={'shrink-0 rounded border px-2 py-0.5 text-[10px] font-medium uppercase ' + (NIVEL_COLORS[r.severidade] ?? '')}>
          {r.severidade}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-red-800">{r.mensagem}</div>
          <div className="text-xs text-slate-500">
            {r.categoria} · {r.origem}
            {r.erro_postgres_code && <span className="ml-2 font-mono">pg={r.erro_postgres_code}</span>}
            {r.erro_constraint && <span className="ml-2 font-mono">ct={r.erro_constraint}</span>}
          </div>
          {r.stack && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-slate-500">stack</summary>
              <pre className="mt-1 max-h-32 overflow-auto rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                {r.stack}
              </pre>
            </details>
          )}
        </div>
        <span className="shrink-0 text-xs text-slate-400">{new Date(r.at).toLocaleTimeString()}</span>
      </li>
    )
  }
  const r = item.row
  return (
    <li className="flex items-start gap-3 bg-amber-50/30 px-4 py-2 text-sm">
      <span className="shrink-0 rounded border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-700">
        perf
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-xs text-slate-700">
          {r.categoria}.{r.operacao}
          <span className="ml-2 font-bold text-amber-700">{r.duracao_ms}ms</span>
        </div>
      </div>
      <span className="shrink-0 text-xs text-slate-400">{new Date(r.at).toLocaleTimeString()}</span>
    </li>
  )
}

// =============================== Aba: Erros =================================
function ErrosTab() {
  const { currentCompany } = useProject()
  const [rows, setRows] = useState<ErrorLog[]>([])
  const [loading, setLoading] = useState(true)
  const [severidade, setSeveridade] = useState<'all' | 'warn' | 'error' | 'fatal'>('all')
  const [aberto, setAberto] = useState(true)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    let cancel = false
    setLoading(true)
    let q = supabase
      .from('error_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (currentCompany?.id) {
      q = q.eq('company_id', currentCompany.id)
    }
    if (severidade !== 'all') q = q.eq('severidade', severidade)
    if (aberto) q = q.eq('resolvido', false)
    if (busca.trim()) q = q.ilike('mensagem', `%${busca.trim()}%`)

    q.then(({ data, error }) => {
      if (cancel) return
      if (error) logger.error('auditoria', error, { kind: 'erros_list' })
      setRows((data ?? []) as ErrorLog[])
      setLoading(false)
    })

    return () => {
      cancel = true
    }
  }, [currentCompany?.id, severidade, aberto, busca])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={severidade}
          onChange={(e) => setSeveridade(e.target.value as typeof severidade)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="all">Todas severidades</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
          <option value="fatal">Fatal</option>
        </select>
        <label className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={aberto}
            onChange={(e) => setAberto(e.target.checked)}
            className="accent-primary"
          />
          Apenas abertos
        </label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar na mensagem…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm"
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">Nenhum erro com esses filtros.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-md border border-slate-200 bg-white p-3">
              <div className="flex items-start gap-2">
                <span className={'shrink-0 rounded border px-2 py-0.5 text-[10px] font-medium uppercase ' + (NIVEL_COLORS[r.severidade] ?? '')}>
                  {r.severidade}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900">{r.mensagem}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{r.categoria}</span>
                    <span>·</span>
                    <span>{r.origem}</span>
                    {r.user_email && (
                      <>
                        <span>·</span>
                        <span>{r.user_email}</span>
                      </>
                    )}
                    <span>·</span>
                    <span title={r.created_at}>
                      <Clock className="mr-1 inline h-3 w-3" />
                      {timeAgo(r.created_at)}
                    </span>
                    {r.erro_postgres_code && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px]">
                        pg={r.erro_postgres_code}
                      </span>
                    )}
                    {r.correlation_id && (
                      <button
                        onClick={() => copyId(r.correlation_id!, 'correlation_id')}
                        className="flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] hover:bg-slate-200"
                      >
                        <Copy className="h-3 w-3" />
                        {r.correlation_id.slice(0, 8)}…
                      </button>
                    )}
                  </div>
                  {r.contexto && Object.keys(r.contexto).length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-slate-500">contexto</summary>
                      <pre className="mt-1 max-h-32 overflow-auto rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                        {JSON.stringify(r.contexto, null, 2)}
                      </pre>
                    </details>
                  )}
                  {r.stack && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-slate-500">stack</summary>
                      <pre className="mt-1 max-h-40 overflow-auto rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                        {r.stack}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// =============================== Aba: Performance ===========================
function PerformanceTab() {
  const { currentCompany } = useProject()
  const [rows, setRows] = useState<PerfLog[]>([])
  const [loading, setLoading] = useState(true)
  const [dias, setDias] = useState(7)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    const desde = new Date(Date.now() - dias * 86400000).toISOString()
    let q = supabase
      .from('performance_logs')
      .select('*')
      .gte('created_at', desde)
      .order('duracao_ms', { ascending: false })
      .limit(100)

    if (currentCompany?.id) q = q.eq('company_id', currentCompany.id)

    q.then(({ data, error }) => {
      if (cancel) return
      if (error) logger.error('auditoria', error, { kind: 'perf_list' })
      setRows((data ?? []) as PerfLog[])
      setLoading(false)
    })
    return () => {
      cancel = true
    }
  }, [currentCompany?.id, dias])

  const groupedByOp = useMemo(() => {
    const map = new Map<string, { count: number; total: number; max: number }>()
    for (const r of rows) {
      const k = `${r.categoria}.${r.operacao}`
      const cur = map.get(k) ?? { count: 0, total: 0, max: 0 }
      cur.count++
      cur.total += r.duracao_ms
      cur.max = Math.max(cur.max, r.duracao_ms)
      map.set(k, cur)
    }
    return Array.from(map.entries())
      .map(([op, s]) => ({ op, count: s.count, avg: Math.round(s.total / s.count), max: s.max }))
      .sort((a, b) => b.avg - a.avg)
  }, [rows])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600">Janela:</span>
        {[1, 7, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDias(d)}
            className={
              'rounded-md border px-3 py-1.5 text-sm ' +
              (dias === d
                ? 'border-primary bg-primary text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50')
            }
          >
            {d === 1 ? '24h' : `${d}d`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">Carregando…</p>
      ) : (
        <>
          <div className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
              Agregado por operação
            </div>
            {groupedByOp.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                Nada acima do threshold no período.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Operação</th>
                    <th className="px-4 py-2 text-right">Ocorrências</th>
                    <th className="px-4 py-2 text-right">Tempo médio</th>
                    <th className="px-4 py-2 text-right">Pico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {groupedByOp.map((g) => (
                    <tr key={g.op}>
                      <td className="px-4 py-2 font-mono text-xs">{g.op}</td>
                      <td className="px-4 py-2 text-right">{g.count}</td>
                      <td className="px-4 py-2 text-right">{g.avg}ms</td>
                      <td className="px-4 py-2 text-right font-medium text-amber-700">{g.max}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
              Top 100 mais lentas
            </div>
            {rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Nada no período.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {rows.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2">
                    <span className="shrink-0 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {r.duracao_ms}ms
                    </span>
                    <span className="flex-1 font-mono text-xs">
                      {r.categoria}.{r.operacao}
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {r.user_email ?? '—'} · {timeAgo(r.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// =============================== Aba: Atividade =============================
function AtividadeTab() {
  const { currentCompany } = useProject()
  const [emailFiltro, setEmailFiltro] = useState('')
  const [rows, setRows] = useState<EventLog[]>([])
  const [loading, setLoading] = useState(false)

  const buscar = async () => {
    setLoading(true)
    let q = supabase
      .from('event_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    if (currentCompany?.id) q = q.eq('company_id', currentCompany.id)
    if (emailFiltro.trim()) q = q.ilike('user_email', `%${emailFiltro.trim()}%`)
    const { data, error } = await q
    if (error) logger.error('auditoria', error, { kind: 'atividade_list' })
    setRows((data ?? []) as EventLog[])
    setLoading(false)
  }

  useEffect(() => {
    void buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCompany?.id])

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Filtrar por e-mail (parcial)…"
            value={emailFiltro}
            onChange={(e) => setEmailFiltro(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
            className="w-full rounded-md border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm"
          />
        </div>
        <button
          onClick={buscar}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Buscar
        </button>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">Sem atividade no período.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-4 py-2 text-sm">
              <span className={'shrink-0 rounded border px-2 py-0.5 text-[10px] font-medium uppercase ' + (NIVEL_COLORS[r.nivel] ?? '')}>
                {r.nivel}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs text-slate-700">
                  {r.categoria}.{r.evento}
                  {r.duracao_ms != null && <span className="ml-2 text-slate-500">({r.duracao_ms}ms)</span>}
                </div>
                <div className="text-xs text-slate-500">
                  {r.user_email ?? '—'}
                  {r.correlation_id && (
                    <>
                      {' · '}
                      <button
                        onClick={() => copyId(r.correlation_id!, 'correlation_id')}
                        className="font-mono hover:underline"
                      >
                        {r.correlation_id.slice(0, 8)}…
                      </button>
                    </>
                  )}
                </div>
              </div>
              <span className="shrink-0 text-xs text-slate-400">{timeAgo(r.created_at)}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-center text-xs text-slate-400">
        <Activity className="mr-1 inline h-3 w-3" />
        Mostrando até 200 eventos mais recentes.
      </p>
    </div>
  )
}
