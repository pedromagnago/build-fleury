/**
 * Build Fleury — Página de Conciliação Financeira (v2 — Operator-First)
 *
 * - Painel de saúde financeira no topo (está em dia? falhas pendentes?)
 * - Atalhos rápidos para ações do dia-a-dia
 * - Batch confirm de matches de alta confiança
 * - Upload simplificado com auto-conciliação
 */
import { useState, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Upload, CheckCircle2, AlertTriangle,
  ArrowRight, RefreshCw,
  ShieldCheck, ShieldAlert, Clock, Zap, CheckCheck,
  TrendingUp, TrendingDown, Banknote, CalendarCheck,
  FileWarning, Activity, Scale, ListOrdered,
} from 'lucide-react'
import { useContasBancarias } from '@/hooks/useFinanceiro'
import { useMovimentacoes } from '@/hooks/useOperacional'
import { useParcelas } from '@/hooks/useFinanceiro'
import {
  useImportExtrato, useRunConciliacao, useConfirmConciliacao,
  useConciliacoes, parseStatement, readFileAsText,
  type ParseResult, type ReconciliationResult,
} from '@/hooks/useConciliacao'
import { ExtratosManager } from '@/components/conciliacao/ExtratosManager'
import { SaldoComposicao } from '@/components/conciliacao/SaldoComposicao'
import { ExtratoContaView } from '@/components/conciliacao/ExtratoContaView'
import { ContasTab } from '@/pages/PagamentosPage'
import { CreditCard } from 'lucide-react'

type TabKey = 'extrato' | 'saldo' | 'contas'

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
  const target = new Date(d + 'T12:00:00') // noon to avoid timezone edge cases
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

// MATCH_LABELS moved to separate file or no longer used

// ─── Health Score ─────────────────────────────────────────────

interface HealthData {
  score: number                   // 0-100
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

    // Última importação — usar data da transação mais recente, não created_at
    const dataDates = movs.map((m: any) => m.data).filter(Boolean).sort().reverse()
    const lastImportDate = dataDates[0] ?? null
    const daysSinceImport = lastImportDate ? daysAgo(lastImportDate) : 999

    // Parcelas vencidas sem conciliação
    const today = new Date().toISOString().split('T')[0]!
    const parcelasVencidasSemMatch = parcelas.filter(
      (p: any) => p.status !== 'paga' && p.data_vencimento < today && !p.data_pagamento_real
    ).length

    // Score
    let score = 100
    if (totalMovs === 0) score = 50 // sem dados
    else {
      const concRate = totalMovs > 0 ? conciliadas / totalMovs : 0
      score = Math.round(concRate * 70) // até 70 pontos de conciliação
      if (daysSinceImport <= 3) score += 20 // importação recente
      else if (daysSinceImport <= 7) score += 10
      if (pendentes === 0) score += 10 // tudo limpo
      else if (sugeridas > 0) score += 5 // tem sugestões para resolver
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

// ─── Health Panel ────────────────────────────────────────────

function HealthPanel({ health, onQuickConciliar, onUpload, isProcessing }: {
  health: HealthData
  onQuickConciliar: () => void
  onUpload: () => void
  isProcessing: boolean
}) {
  const ringColor = health.status === 'ok' ? '#22c55e' : health.status === 'attention' ? '#f59e0b' : '#ef4444'
  const ringBg = health.status === 'ok' ? '#22c55e20' : health.status === 'attention' ? '#f59e0b20' : '#ef444420'
  const statusLabel = health.status === 'ok' ? 'Em Dia' : health.status === 'attention' ? 'Atenção' : 'Crítico'
  const StatusIcon = health.status === 'ok' ? ShieldCheck : health.status === 'attention' ? Clock : ShieldAlert
  const circumference = 2 * Math.PI * 42
  const offset = circumference - (health.score / 100) * circumference

  return (
    <div className="rounded-2xl border bg-gradient-to-br from-card via-card to-muted/20 p-5">
      <div className="flex items-start gap-6">
        {/* Score Ring */}
        <div className="relative flex-shrink-0">
          <svg width="100" height="100" className="-rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke={ringBg} strokeWidth="6" />
            <circle cx="50" cy="50" r="42" fill="none" stroke={ringColor} strokeWidth="6"
              strokeDasharray={circumference} strokeDashoffset={offset}
              strokeLinecap="round" className="transition-all duration-1000" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-black tabular-nums" style={{ color: ringColor }}>{health.score}</span>
            <span className="text-[9px] font-bold uppercase text-muted-foreground">Score</span>
          </div>
        </div>

        {/* Status + KPIs */}
        <div className="flex-1 min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <StatusIcon className="h-5 w-5" style={{ color: ringColor }} />
            <h2 className="text-lg font-bold">{statusLabel}</h2>
            {health.lastImportDate && (
              <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Último extrato: {relativeDate(health.lastImportDate)}
              </span>
            )}
          </div>

          {/* Mini KPIs */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniKPI icon={CheckCircle2} label="Conciliadas" value={health.conciliadas} total={health.totalMovs} color="text-emerald-500" />
            <MiniKPI icon={Clock} label="Pendentes" value={health.pendentes} sub={fmtCompact(health.valorPendente)} color="text-amber-500" />
            <MiniKPI icon={FileWarning} label="Sugestões" value={health.sugeridas} color="text-blue-500" />
            <MiniKPI icon={AlertTriangle} label="Vencidas s/ match" value={health.parcelasVencidasSemMatch} color="text-red-500" />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          <button onClick={onUpload}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity">
            <Upload className="h-3.5 w-3.5" />Importar Extrato
          </button>
          {health.pendentes > 0 && (
            <button onClick={onQuickConciliar} disabled={isProcessing}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {isProcessing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Conciliar Agora
            </button>
          )}
          {health.sugeridas > 0 && (
            <button className="flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-medium hover:bg-muted transition-colors"
              onClick={() => document.getElementById('suggestions-section')?.scrollIntoView({ behavior: 'smooth' })}>
              <ArrowRight className="h-3.5 w-3.5" />Ver {health.sugeridas} Sugestões
            </button>
          )}
        </div>
      </div>

      {/* Alert Banners */}
      {health.daysSinceImport > 7 && health.totalMovs > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Faz <strong>{health.daysSinceImport} dias</strong> desde o último extrato importado. Importe para manter a conciliação em dia.</span>
        </div>
      )}
      {health.parcelasVencidasSemMatch > 5 && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">
          <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" />
          <span><strong>{health.parcelasVencidasSemMatch} parcelas</strong> vencidas sem pagamento identificado. Verifique os extratos.</span>
        </div>
      )}
      {health.totalMovs === 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-500/10 px-3 py-2 text-xs text-blue-600">
          <Activity className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Nenhum extrato importado ainda. Comece importando um arquivo OFX ou JSON acima.</span>
        </div>
      )}
    </div>
  )
}

function MiniKPI({ icon: Icon, label, value, total, sub, color }: {
  icon: typeof CheckCircle2; label: string; value: number; total?: number; sub?: string; color: string
}) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3 w-3 ${color}`} />
        <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="mt-0.5 text-lg font-bold tabular-nums">
        {value}
        {total != null && <span className="text-xs font-normal text-muted-foreground">/{total}</span>}
      </p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

// ─── Conciliation Progress Bar ───────────────────────────────

function ConcProgressBar({ conciliadas, total }: { conciliadas: number; total: number }) {
  const pct = total > 0 ? Math.round((conciliadas / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: pct >= 90 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#ef4444',
          }} />
      </div>
      <span className="text-xs font-bold tabular-nums text-muted-foreground">{pct}%</span>
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

// ─── Match Row ───────────────────────────────────────────────

// Removed MatchRow

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
  const { data: savedConcs = [] } = useConciliacoes()
  const health = useHealthData()

  const [contaId, setContaId] = useState('')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [reconcResult, setReconcResult] = useState<ReconciliationResult | null>(null)
  const [step, setStep] = useState<'upload' | 'preview' | 'conciliacao'>('upload')
  const [showUploadPanel, setShowUploadPanel] = useState(false)
  const [batchProcessing, setBatchProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('extrato')

  const isProcessing = importExtrato.isPending || runConciliacao.isPending || confirmConc.isPending || batchProcessing

  // Auto-select first account
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
    // Step 1: Import
    await importExtrato.mutateAsync({ parseResult, contaId: effectiveContaId })
    // Step 2: Auto-reconcile immediately after import
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

  // Batch confirm high-confidence matches
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
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Conciliação Bancária</h1>
          <p className="text-xs text-muted-foreground">Importe extratos e concilie com parcelas e medições</p>
        </div>
        {health.totalMovs > 0 && (
          <ConcProgressBar conciliadas={health.conciliadas} total={health.totalMovs} />
        )}
      </div>

      {/* Health Panel — always visible */}
      <HealthPanel
        health={health}
        onQuickConciliar={doQuickConciliar}
        onUpload={() => setShowUploadPanel(v => !v)}
        isProcessing={isProcessing}
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b overflow-x-auto">
        {[
          { key: 'extrato' as TabKey, label: 'Extrato da Conta', icon: ListOrdered },
          { key: 'saldo' as TabKey, label: 'Composição do Saldo', icon: Scale },
          { key: 'contas' as TabKey, label: 'Contas Bancárias', icon: CreditCard },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
              activeTab === t.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}>
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Saldo */}
      {activeTab === 'saldo' && <SaldoComposicao />}

      {/* Tab: Contas Bancárias (CRUD) */}
      {activeTab === 'contas' && <ContasTab search="" />}

      {/* Upload Panel — visible across tabs when toggled */}
      {(showUploadPanel || step === 'upload' && health.totalMovs === 0) && (
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

      {/* Extratos Manager — always visible when there are movements */}
      {movimentacoes.length > 0 && step !== 'preview' && (
        <ExtratosManager movimentacoes={movimentacoes} onRefresh={doQuickConciliar} />
      )}
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

          {/* Summary cards for the statement */}
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

      {/* Tab: Extrato (default) — painel lateral contextual integrado */}
      {activeTab === 'extrato' && step !== 'preview' && (
        <>
          <BatchBar highConfCount={highConfCount} onBatchConfirm={doBatchConfirm} disabled={isProcessing} />
          <ExtratoContaView />
        </>
      )}

    </div>
  )
}
