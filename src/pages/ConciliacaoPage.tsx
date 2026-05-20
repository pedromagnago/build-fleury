/**
 * Build Fleury — Página de Conciliação Financeira (v3 — Table-First)
 *
 * Hierarquia invertida: a tabela de extrato é o conteúdo principal e fica acima
 * da dobra. Header compacto (KPIs em chips + ações), alertas inline,
 * e seções secundárias (Extratos importados, Composição do saldo, Contas
 * bancárias) ficam agrupadas em accordions no rodapé — abertas só quando o
 * usuário clica.
 */
import { useState, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Upload, CheckCircle2, AlertTriangle, RefreshCw,
  ShieldAlert, Clock, Zap, CheckCheck,
  TrendingUp, TrendingDown, Banknote, CalendarCheck,
  FileWarning, Activity, Scale, FileText,
  CreditCard, ChevronDown, ChevronRight,
  Download,
} from 'lucide-react'
import { useContasBancarias } from '@/hooks/useFinanceiro'
import { useMovimentacoes } from '@/hooks/useOperacional'
import { useParcelas } from '@/hooks/useFinanceiro'
import {
  useImportExtrato, useRunConciliacao, useConfirmConciliacao,
  useConciliacoes, useExportConciliacao, parseStatement, readFileAsText,
  type ParseResult, type ReconciliationResult,
} from '@/hooks/useConciliacao'
import { ExtratosManager } from '@/components/conciliacao/ExtratosManager'
import { SaldoComposicao } from '@/components/conciliacao/SaldoComposicao'
import { ExtratoContaView } from '@/components/conciliacao/ExtratoContaView'
import { ContasTab } from '@/pages/PagamentosPage'

// ─── Formatters ──────────────────────────────────────────────

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtCompact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}K`
  return fmt(v)
}

function fmtDate(d: string): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function daysAgo(d: string): number {
  if (!d) return 999
  const now = new Date()
  const target = new Date(d + 'T12:00:00')
  return Math.max(0, Math.floor((now.getTime() - target.getTime()) / 86400000))
}

function relativeDate(d: string): string {
  const days = daysAgo(d)
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  if (days < 7) return `${days} dias atrás`
  if (days < 30) return `${Math.floor(days / 7)} sem. atrás`
  return `${Math.floor(days / 30)} mês(es) atrás`
}

// ─── Health Score ─────────────────────────────────────────────

interface HealthData {
  score: number
  status: 'ok' | 'attention' | 'critical'
  lastImportDate: string | null
  daysSinceImport: number
  totalMovs: number
  conciliadas: number
  pendentes: number
  sugeridas: number
  rejeitadas: number
  valorPendente: number
  valorConciliado: number
  parcelasVencidasSemMatch: number
}

function useHealthData(): HealthData {
  const { data: movs = [] } = useMovimentacoes()
  const { data: concs = [] } = useConciliacoes()
  const { data: parcelas = [] } = useParcelas()

  return useMemo(() => {
    const totalMovs = movs.length
    const conciliadas = movs.filter((m: any) => m.conciliado).length
    const pendentes = totalMovs - conciliadas
    const sugeridas = concs.filter(c => c.status === 'sugerido').length
    const rejeitadas = concs.filter(c => c.status === 'rejeitado').length

    const valorPendente = movs.filter((m: any) => !m.conciliado).reduce((s, m: any) => s + Number(m.valor), 0)
    const valorConciliado = movs.filter((m: any) => m.conciliado).reduce((s, m: any) => s + Number(m.valor), 0)

    const dataDates = movs.map((m: any) => m.data).filter(Boolean).sort().reverse()
    const lastImportDate = dataDates[0] ?? null
    const daysSinceImport = lastImportDate ? daysAgo(lastImportDate) : 999

    const today = new Date().toISOString().split('T')[0]!
    const parcelasVencidasSemMatch = parcelas.filter(
      (p: any) => p.status !== 'paga' && p.data_vencimento < today && !p.data_pagamento_real
    ).length

    let score = 100
    if (totalMovs === 0) score = 50
    else {
      const concRate = totalMovs > 0 ? conciliadas / totalMovs : 0
      score = Math.round(concRate * 70)
      if (daysSinceImport <= 3) score += 20
      else if (daysSinceImport <= 7) score += 10
      if (pendentes === 0) score += 10
      else if (sugeridas > 0) score += 5
    }
    score = Math.max(0, Math.min(100, score))

    const status = score >= 80 ? 'ok' : score >= 50 ? 'attention' : 'critical'

    return {
      score, status, lastImportDate, daysSinceImport, totalMovs,
      conciliadas, pendentes, sugeridas, rejeitadas,
      valorPendente, valorConciliado, parcelasVencidasSemMatch,
    }
  }, [movs, concs, parcelas])
}

// ─── KPI Chip ────────────────────────────────────────────────

function KpiChip({ icon: Icon, label, value, sub, variant = 'muted' }: {
  icon: typeof CheckCircle2
  label: string
  value: string | number
  sub?: string
  variant?: 'muted' | 'emerald' | 'amber' | 'blue' | 'red'
}) {
  const variantCls = {
    muted: 'text-muted-foreground',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    blue: 'text-blue-600',
    red: 'text-red-500',
  }[variant]
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-1.5">
      <Icon className={`h-3.5 w-3.5 ${variantCls}`} />
      <div className="leading-tight">
        <p className="text-[9px] font-medium uppercase text-muted-foreground">{label}</p>
        <p className="text-xs font-bold tabular-nums">
          {value}
          {sub && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{sub}</span>}
        </p>
      </div>
    </div>
  )
}

// ─── Compact Header ──────────────────────────────────────────

function CompactHeader({ health, onUpload, onQuickConciliar, onExport, isProcessing, isExporting }: {
  health: HealthData
  onUpload: () => void
  onQuickConciliar: () => void
  onExport: () => void
  isProcessing: boolean
  isExporting: boolean
}) {
  const statusColor = health.status === 'ok' ? 'text-emerald-600' : health.status === 'attention' ? 'text-amber-500' : 'text-red-500'
  const statusDot = health.status === 'ok' ? 'bg-emerald-500' : health.status === 'attention' ? 'bg-amber-500' : 'bg-red-500'
  const statusLabel = health.status === 'ok' ? 'Em Dia' : health.status === 'attention' ? 'Atenção' : 'Crítico'
  const pct = health.totalMovs > 0 ? Math.round((health.conciliadas / health.totalMovs) * 100) : 0

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Title + status badge */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div>
            <h1 className="text-base font-bold leading-tight">Conciliação Bancária</h1>
            <p className="text-[10px] text-muted-foreground leading-tight">Concilie extratos com parcelas e medições</p>
          </div>
          <div className={`flex items-center gap-1.5 rounded-full border bg-muted/40 px-2 py-1 text-[10px] font-bold ${statusColor}`}
            title={`Score ${health.score}/100`}>
            <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
            {statusLabel}
            <span className="opacity-60">·</span>
            <span className="tabular-nums">{health.score}</span>
          </div>
          {health.lastImportDate && (
            <span className="hidden md:inline rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Último extrato: {relativeDate(health.lastImportDate)}
            </span>
          )}
        </div>

        {/* KPIs as compact chips */}
        <div className="flex flex-wrap items-center gap-1.5 md:ml-auto">
          <KpiChip icon={CheckCircle2} label="Conciliadas" value={`${health.conciliadas}/${health.totalMovs}`} sub={`${pct}%`} variant="emerald" />
          <KpiChip icon={Clock} label="Pendentes" value={health.pendentes} sub={health.pendentes > 0 ? fmtCompact(health.valorPendente) : undefined} variant={health.pendentes > 0 ? 'amber' : 'muted'} />
          <KpiChip icon={FileWarning} label="Sugestões" value={health.sugeridas} variant={health.sugeridas > 0 ? 'blue' : 'muted'} />
          <KpiChip icon={AlertTriangle} label="Vencidas" value={health.parcelasVencidasSemMatch} variant={health.parcelasVencidasSemMatch > 0 ? 'red' : 'muted'} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <button onClick={onUpload}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity">
            <Upload className="h-3.5 w-3.5" />Importar
          </button>
          {health.pendentes > 0 && (
            <button onClick={onQuickConciliar} disabled={isProcessing}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {isProcessing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Conciliar
            </button>
          )}
          <button onClick={onExport} disabled={isExporting}
            title="Exporta XLSX com Realizado (conciliações + origens), Aberto (saldo > 0) e Movs sem conciliação"
            className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-xs font-bold hover:bg-muted/50 disabled:opacity-50 transition-colors">
            {isExporting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Exportar
          </button>
        </div>
      </div>

      {/* Slim progress bar */}
      {health.totalMovs > 0 && (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${pct}%`,
                background: pct >= 90 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#ef4444',
              }} />
          </div>
          <span className="text-[10px] font-bold tabular-nums text-muted-foreground">{pct}% conciliado</span>
        </div>
      )}
    </div>
  )
}

// ─── Smart Alerts (inline) ───────────────────────────────────

function SmartAlerts({ health, onUpload }: { health: HealthData; onUpload: () => void }) {
  const alerts: Array<{ icon: typeof Clock; cls: string; msg: React.ReactNode; onClick?: () => void }> = []

  if (health.totalMovs === 0) {
    alerts.push({
      icon: Activity, cls: 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/15',
      msg: <>Nenhum extrato importado ainda. <strong>Importe um arquivo OFX ou JSON</strong> para começar.</>,
      onClick: onUpload,
    })
  } else if (health.daysSinceImport > 7) {
    alerts.push({
      icon: Clock, cls: 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/15',
      msg: <>Faz <strong>{health.daysSinceImport} dias</strong> desde o último extrato. Importe para manter em dia.</>,
      onClick: onUpload,
    })
  }

  if (health.parcelasVencidasSemMatch > 5) {
    alerts.push({
      icon: ShieldAlert, cls: 'bg-red-500/10 text-red-600',
      msg: <><strong>{health.parcelasVencidasSemMatch} parcelas</strong> vencidas sem pagamento identificado. Verifique os extratos.</>,
    })
  }

  if (alerts.length === 0) return null

  return (
    <div className="space-y-1.5">
      {alerts.map((a, i) => {
        const Comp = a.onClick ? 'button' : 'div'
        return (
          <Comp key={i} onClick={a.onClick as any}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${a.cls} ${a.onClick ? 'cursor-pointer text-left' : ''}`}>
            <a.icon className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="flex-1">{a.msg}</span>
          </Comp>
        )
      })}
    </div>
  )
}

// ─── Collapsible Section ─────────────────────────────────────

function CollapsibleSection({
  title, icon: Icon, badge, defaultOpen = false, children,
}: {
  title: string
  icon: typeof CheckCircle2
  badge?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors">
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-sm font-bold">{title}</span>
        {badge && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {badge}
          </span>
        )}
      </button>
      {open && <div className="border-t bg-muted/10">{children}</div>}
    </div>
  )
}

// ─── DropZone ────────────────────────────────────────────────

function DropZone({ onFile }: { onFile: (f: File) => void }) {
  const [dragging, setDragging] = useState(false)
  return (
    <label
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-all ${
        dragging ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-muted-foreground/20 hover:border-primary/40'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
    >
      <Upload className="mb-2 h-7 w-7 text-muted-foreground" />
      <span className="text-sm font-medium">Arraste o extrato aqui</span>
      <span className="mt-1 text-[10px] text-muted-foreground">OFX (Caixa, Itaú, Bradesco) · JSON (InfinitePay, NuBank)</span>
      <input type="file" className="hidden" accept=".ofx,.json,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
    </label>
  )
}

// ─── Batch Actions Bar ───────────────────────────────────────

function BatchBar({ highConfCount, onBatchConfirm, disabled }: {
  highConfCount: number; onBatchConfirm: () => void; disabled: boolean
}) {
  if (highConfCount === 0) return null
  return (
    <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
      <CheckCheck className="h-5 w-5 text-emerald-600" />
      <div className="flex-1">
        <p className="text-xs font-bold text-emerald-700">
          {highConfCount} matches de alta confiança (≥90%)
        </p>
        <p className="text-[10px] text-emerald-600/70">Confirme todos de uma vez para agilizar a conciliação</p>
      </div>
      <button onClick={onBatchConfirm} disabled={disabled}
        className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
        {disabled ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
        Confirmar Todos
      </button>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────

export default function ConciliacaoPage() {
  const { data: contas = [] } = useContasBancarias()
  const { data: movimentacoes = [] } = useMovimentacoes()
  const importExtrato = useImportExtrato()
  const runConciliacao = useRunConciliacao()
  const confirmConc = useConfirmConciliacao()
  const exportar = useExportConciliacao()
  const { data: savedConcs = [] } = useConciliacoes()
  const health = useHealthData()

  const [contaId, setContaId] = useState('')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [reconcResult, setReconcResult] = useState<ReconciliationResult | null>(null)
  const [step, setStep] = useState<'upload' | 'preview' | 'conciliacao'>('upload')
  const [showUploadPanel, setShowUploadPanel] = useState(false)
  const [batchProcessing, setBatchProcessing] = useState(false)

  const isProcessing = importExtrato.isPending || runConciliacao.isPending || confirmConc.isPending || batchProcessing

  const effectiveContaId = contaId || contas[0]?.id || ''

  const handleFile = useCallback(async (file: File) => {
    const cid = effectiveContaId
    if (!cid) { toast.error('Cadastre uma conta bancária primeiro'); return }
    try {
      const content = await readFileAsText(file)
      const result = parseStatement(content)
      if (result.transactions.length === 0) { toast.error('Nenhuma transação encontrada'); return }
      setParseResult(result)
      setShowUploadPanel(false)
      setStep('preview')
      toast.success(`${result.transactions.length} transações parseadas`)
    } catch (err) {
      toast.error('Erro ao ler arquivo: ' + (err as Error).message)
    }
  }, [effectiveContaId])

  const doImportAndReconcile = async () => {
    if (!parseResult || !effectiveContaId) return
    await importExtrato.mutateAsync({ parseResult, contaId: effectiveContaId })
    const result = await runConciliacao.mutateAsync({})
    setReconcResult(result)
    setStep('conciliacao')
    setParseResult(null)
    toast.success(`Import + conciliação automática concluídos`)
  }

  const doQuickConciliar = async () => {
    const result = await runConciliacao.mutateAsync({})
    setReconcResult(result)
    setStep('conciliacao')
    setShowUploadPanel(false)
  }

  const doBatchConfirm = async () => {
    if (!reconcResult) return
    setBatchProcessing(true)
    let confirmed = 0
    const highConf = reconcResult.matches.filter(m => m.confidence >= 90 && m.matchType !== 'none')
    for (const match of highConf) {
      const savedConc = savedConcs.find(c =>
        c.movimentacao_id === (match.transaction as any)._movId && c.status === 'sugerido'
      )
      if (savedConc) {
        try { await confirmConc.mutateAsync(savedConc.id); confirmed++ }
        catch { /* skip */ }
      }
    }
    setBatchProcessing(false)
    toast.success(`${confirmed} conciliações confirmadas em lote`)
  }

  const highConfCount = useMemo(() => {
    if (!reconcResult) return 0
    return reconcResult.matches.filter(m => m.confidence >= 90 && m.matchType !== 'none').length
  }, [reconcResult])

  const onToggleUpload = useCallback(() => setShowUploadPanel(v => !v), [])

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      {/* 1. Compact header (saldos + KPIs + ações) */}
      <CompactHeader
        health={health}
        onUpload={onToggleUpload}
        onQuickConciliar={doQuickConciliar}
        onExport={() => exportar.mutate()}
        isProcessing={isProcessing}
        isExporting={exportar.isPending}
      />

      {/* 2. Smart alerts (only when relevant) */}
      <SmartAlerts health={health} onUpload={onToggleUpload} />

      {/* 3. Upload panel — só quando o usuário pede */}
      {(showUploadPanel || (step === 'upload' && health.totalMovs === 0)) && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Conta Bancária</label>
              <select value={effectiveContaId} onChange={(e) => setContaId(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary">
                {contas.length === 0 && <option value="">Nenhuma conta cadastrada</option>}
                {contas.map(c => (
                  <option key={c.id} value={c.id}>{c.nome} {c.banco ? `(${c.banco})` : ''}</option>
                ))}
              </select>
            </div>
            <button onClick={() => setShowUploadPanel(false)}
              className="rounded-lg border px-3 py-2 text-xs hover:bg-muted self-end">Fechar</button>
          </div>
          <DropZone onFile={handleFile} />
        </div>
      )}

      {/* 4. Preview do extrato parseado (antes do import) */}
      {parseResult && step === 'preview' && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b p-4">
            <div>
              <h3 className="font-semibold">Extrato Parseado</h3>
              <p className="text-xs text-muted-foreground">
                {parseResult.meta.bankId && <span className="font-medium">{parseResult.meta.bankId} </span>}
                {fmtDate(parseResult.meta.startDate)} → {fmtDate(parseResult.meta.endDate)}
                {' · '}{parseResult.transactions.length} transações
                {' · '}Saldo: <span className="font-bold">{fmt(parseResult.meta.closingBalance)}</span>
              </p>
            </div>
            <button onClick={() => { setParseResult(null); setStep('upload') }}
              className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted">Descartar</button>
          </div>

          <div className="grid grid-cols-4 gap-3 p-4 border-b">
            <div className="rounded-lg bg-emerald-500/5 p-3 text-center">
              <TrendingUp className="mx-auto h-4 w-4 text-emerald-500 mb-1" />
              <p className="text-xs font-bold text-emerald-600">{fmt(parseResult.transactions.filter(t => t.amount >= 0).reduce((s, t) => s + t.amount, 0))}</p>
              <p className="text-[9px] text-muted-foreground">Entradas</p>
            </div>
            <div className="rounded-lg bg-red-500/5 p-3 text-center">
              <TrendingDown className="mx-auto h-4 w-4 text-red-500 mb-1" />
              <p className="text-xs font-bold text-red-500">{fmt(parseResult.transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0))}</p>
              <p className="text-[9px] text-muted-foreground">Saídas</p>
            </div>
            <div className="rounded-lg bg-blue-500/5 p-3 text-center">
              <Banknote className="mx-auto h-4 w-4 text-blue-500 mb-1" />
              <p className="text-xs font-bold">{fmt(parseResult.meta.closingBalance)}</p>
              <p className="text-[9px] text-muted-foreground">Saldo Final</p>
            </div>
            <div className="rounded-lg bg-muted p-3 text-center">
              <CalendarCheck className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
              <p className="text-xs font-bold">{parseResult.transactions.length}</p>
              <p className="text-[9px] text-muted-foreground">Transações</p>
            </div>
          </div>

          <div className="max-h-72 overflow-auto">
            <table className="tbl-bf w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-left">Descrição</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {parseResult.transactions.map((txn, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="px-3 py-1.5 tabular-nums">{fmtDate(txn.date)}</td>
                    <td className="px-3 py-1.5 max-w-[280px] truncate" title={txn.memoRaw}>{txn.memoClean}</td>
                    <td className={`px-3 py-1.5 text-right font-medium tabular-nums ${txn.amount >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {fmt(txn.amount)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{fmt(txn.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 border-t p-4">
            <button onClick={doImportAndReconcile} disabled={isProcessing}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {isProcessing ? <><RefreshCw className="h-4 w-4 animate-spin" />Processando...</> : <><Zap className="h-4 w-4" />Importar + Conciliar</>}
            </button>
          </div>
        </div>
      )}

      {/* 5. MAIN: tabela de extrato (acima da dobra) */}
      {step !== 'preview' && (
        <>
          <BatchBar highConfCount={highConfCount} onBatchConfirm={doBatchConfirm} disabled={isProcessing} />
          <ExtratoContaView />
        </>
      )}

      {/* 6. Seções secundárias (accordions, fechadas por padrão) */}
      {step !== 'preview' && (
        <div className="space-y-2 pt-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">
            Outras visões
          </p>

          {movimentacoes.length > 0 && (
            <CollapsibleSection
              title="Extratos Importados"
              icon={FileText}
              badge={`${movimentacoes.length} movimentações`}
            >
              <ExtratosManager movimentacoes={movimentacoes} onRefresh={doQuickConciliar} />
            </CollapsibleSection>
          )}

          <CollapsibleSection title="Composição do Saldo" icon={Scale}>
            <div className="p-4">
              <SaldoComposicao />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Contas Bancárias"
            icon={CreditCard}
            badge={`${contas.length} conta(s)`}
          >
            <div className="p-4">
              <ContasTab search="" />
            </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  )
}