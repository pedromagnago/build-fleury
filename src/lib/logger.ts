/**
 * Logger debuggável Fleury — Fase 2a.
 *
 * Substitui os 57 `console.*` espalhados por uma API unificada que:
 *   1. Em DEV: imprime no console com cor por nível.
 *   2. Em PROD: enfileira e envia em batch (10s ou 20 eventos) pras
 *      tabelas event_logs / error_logs / performance_logs.
 *   3. Carrega `correlation_id`, `user_id`, `company_id` automaticamente
 *      (set via setCurrentContext) pra não precisar passar em todo lugar.
 *   4. Erros/fatals fazem flush imediato (best-effort sendBeacon em
 *      pagehide, fallback fetch direto).
 *
 * Uso típico:
 *   logger.info('financeiro', 'parcela_baixada', { parcela_id, valor })
 *   logger.error('recepcao', err, { nf_id })
 *   await logger.time('compras', 'carregar_pedidos', () => fetchPedidos())
 */

import { supabase } from './supabase'

// =============================== Tipos ======================================

export type LogNivel = 'debug' | 'info' | 'warn'
export type LogSeveridade = 'warn' | 'error' | 'fatal'
export type LogOrigem = 'frontend' | 'rpc' | 'edge' | 'trigger' | 'sistema'

export type LogCategoria =
  | 'auth'
  | 'navegacao'
  | 'financeiro'
  | 'compras'
  | 'recepcao'
  | 'conciliacao'
  | 'cronograma'
  | 'mutuos'
  | 'documentos'
  | 'auditoria'
  | 'ia'
  | 'saude'
  | 'sistema'
  | 'importacao'
  | 'export'
  | 'projeto'

interface EventRow {
  correlation_id: string | null
  company_id: string | null
  user_id: string | null
  user_email: string | null
  agente: 'humano' | 'ia' | 'sistema'
  nivel: LogNivel
  categoria: string
  evento: string
  contexto: Record<string, unknown> | null
  duracao_ms: number | null
  origem: LogOrigem
}

interface ErrorRow {
  correlation_id: string | null
  company_id: string | null
  user_id: string | null
  user_email: string | null
  agente: 'humano' | 'ia' | 'sistema'
  origem: LogOrigem
  severidade: LogSeveridade
  categoria: string
  mensagem: string
  stack: string | null
  url: string | null
  user_agent: string | null
  payload_request: Record<string, unknown> | null
  contexto: Record<string, unknown> | null
  erro_postgres_code: string | null
  erro_constraint: string | null
}

interface PerfRow {
  correlation_id: string | null
  company_id: string | null
  user_id: string | null
  user_email: string | null
  origem: LogOrigem
  categoria: string
  operacao: string
  duracao_ms: number
  queries_count: number | null
  rows_affected: number | null
  contexto: Record<string, unknown> | null
}

// =============================== Config =====================================

const IS_DEV = import.meta.env.DEV
const FLUSH_INTERVAL_MS = 10_000
const BATCH_SIZE = 20
const PERFORMANCE_THRESHOLD_MS = 500
const DEBUG_FLAG_KEY = 'fleury-logger-debug'

/**
 * Em prod, `debug` é descartado por default. Setar `localStorage.setItem('fleury-logger-debug', '1')`
 * liga a captura pra essa sessão (útil em troubleshooting de usuário específico).
 */
function debugEnabled(): boolean {
  if (IS_DEV) return true
  try {
    return localStorage.getItem(DEBUG_FLAG_KEY) === '1'
  } catch {
    return false
  }
}

// =============================== Contexto global ============================

interface LoggerContext {
  correlationId: string | null
  userId: string | null
  userEmail: string | null
  companyId: string | null
}

let ctx: LoggerContext = {
  correlationId: null,
  userId: null,
  userEmail: null,
  companyId: null,
}

export function setLoggerContext(partial: Partial<LoggerContext>): void {
  ctx = { ...ctx, ...partial }
}

export function getLoggerContext(): Readonly<LoggerContext> {
  return ctx
}

export function newCorrelationId(): string {
  const id = crypto.randomUUID()
  ctx.correlationId = id
  return id
}

// =============================== Buffers ====================================

const eventBuffer: EventRow[] = []
const errorBuffer: ErrorRow[] = []
const perfBuffer: PerfRow[] = []

let flushTimer: number | null = null

function scheduleFlush(): void {
  if (flushTimer !== null) return
  flushTimer = window.setTimeout(() => {
    flushTimer = null
    void flush()
  }, FLUSH_INTERVAL_MS)
}

async function flushTable<T>(table: string, buffer: T[]): Promise<void> {
  if (buffer.length === 0) return
  const rows = buffer.splice(0, buffer.length)
  const { error } = await supabase.from(table).insert(rows as never)
  if (error) {
    // Re-enfileira em caso de falha de rede, mas evita loop infinito:
    // se for erro de schema/RLS, descarta e loga no console.
    if (error.code === 'PGRST301' || error.message?.includes('Failed to fetch')) {
      buffer.unshift(...rows)
    } else {
      console.error('[Logger] flush descartou batch:', error, rows.slice(0, 2))
    }
  }
}

export async function flush(): Promise<void> {
  await Promise.allSettled([
    flushTable('event_logs', eventBuffer),
    flushTable('error_logs', errorBuffer),
    flushTable('performance_logs', perfBuffer),
  ])
}

// Best-effort flush no unload: usa sendBeacon que sobrevive ao fechamento da aba.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
    if (!supabaseUrl || !anonKey) return

    const sendBeaconBatch = (table: string, rows: object[]) => {
      if (rows.length === 0) return
      const url = `${supabaseUrl}/rest/v1/${table}`
      const blob = new Blob([JSON.stringify(rows)], {
        type: 'application/json',
      })
      // sendBeacon ignora headers customizados; o Supabase REST exige
      // apikey e Authorization — então passamos via URL params do PostgREST:
      // se isso não der, o batch é só descartado (best-effort).
      try {
        navigator.sendBeacon(`${url}?apikey=${anonKey}`, blob)
      } catch {
        // ignore
      }
    }

    sendBeaconBatch('event_logs', eventBuffer.splice(0))
    sendBeaconBatch('error_logs', errorBuffer.splice(0))
    sendBeaconBatch('performance_logs', perfBuffer.splice(0))
  })
}

// =============================== Helpers internos ===========================

function baseRow() {
  return {
    correlation_id: ctx.correlationId,
    company_id: ctx.companyId,
    user_id: ctx.userId,
    user_email: ctx.userEmail,
  }
}

function consolePrint(
  nivel: LogNivel | LogSeveridade,
  categoria: string,
  evento: string,
  contexto?: Record<string, unknown>,
): void {
  if (!IS_DEV) return
  const colors: Record<string, string> = {
    debug: 'color: gray',
    info: 'color: deepskyblue',
    warn: 'color: orange',
    error: 'color: red; font-weight: bold',
    fatal: 'color: white; background: red; font-weight: bold',
  }
  const style = colors[nivel] ?? ''
  // eslint-disable-next-line no-console
  console.log(`%c[${nivel}] %c${categoria}.${evento}`, style, 'color: inherit', contexto ?? '')
}

function pushEvent(row: EventRow): void {
  eventBuffer.push(row)
  if (eventBuffer.length >= BATCH_SIZE) {
    void flushTable('event_logs', eventBuffer)
  } else {
    scheduleFlush()
  }
}

function pushError(row: ErrorRow): void {
  errorBuffer.push(row)
  // erros são prioritários — flush imediato
  void flushTable('error_logs', errorBuffer)
}

function pushPerf(row: PerfRow): void {
  perfBuffer.push(row)
  if (perfBuffer.length >= BATCH_SIZE) {
    void flushTable('performance_logs', perfBuffer)
  } else {
    scheduleFlush()
  }
}

function normalizeError(err: unknown): {
  mensagem: string
  stack: string | null
  pgCode: string | null
  pgConstraint: string | null
} {
  if (err instanceof Error) {
    const anyErr = err as Error & {
      code?: string
      constraint?: string
      details?: string
    }
    return {
      mensagem: err.message || String(err),
      stack: err.stack ?? null,
      pgCode: anyErr.code ?? null,
      pgConstraint: anyErr.constraint ?? null,
    }
  }
  if (typeof err === 'object' && err !== null) {
    const anyErr = err as { message?: string; code?: string; constraint?: string; details?: string }
    return {
      mensagem: anyErr.message ?? JSON.stringify(err),
      stack: null,
      pgCode: anyErr.code ?? null,
      pgConstraint: anyErr.constraint ?? null,
    }
  }
  return { mensagem: String(err), stack: null, pgCode: null, pgConstraint: null }
}

// =============================== API pública ================================

export const logger = {
  setContext: setLoggerContext,
  getContext: getLoggerContext,
  newCorrelation: newCorrelationId,
  flush,

  debug(categoria: LogCategoria, evento: string, contexto?: Record<string, unknown>): void {
    consolePrint('debug', categoria, evento, contexto)
    if (!debugEnabled()) return
    pushEvent({
      ...baseRow(),
      agente: 'humano',
      nivel: 'debug',
      categoria,
      evento,
      contexto: contexto ?? null,
      duracao_ms: null,
      origem: 'frontend',
    })
  },

  info(categoria: LogCategoria, evento: string, contexto?: Record<string, unknown>): void {
    consolePrint('info', categoria, evento, contexto)
    pushEvent({
      ...baseRow(),
      agente: 'humano',
      nivel: 'info',
      categoria,
      evento,
      contexto: contexto ?? null,
      duracao_ms: null,
      origem: 'frontend',
    })
  },

  warn(categoria: LogCategoria, evento: string, contexto?: Record<string, unknown>): void {
    consolePrint('warn', categoria, evento, contexto)
    pushEvent({
      ...baseRow(),
      agente: 'humano',
      nivel: 'warn',
      categoria,
      evento,
      contexto: contexto ?? null,
      duracao_ms: null,
      origem: 'frontend',
    })
  },

  error(
    categoria: LogCategoria,
    err: unknown,
    contexto?: Record<string, unknown>,
  ): void {
    const { mensagem, stack, pgCode, pgConstraint } = normalizeError(err)
    consolePrint('error', categoria, mensagem, contexto)
    pushError({
      ...baseRow(),
      agente: 'humano',
      origem: 'frontend',
      severidade: 'error',
      categoria,
      mensagem,
      stack,
      url: typeof window !== 'undefined' ? window.location.href : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      payload_request: null,
      contexto: contexto ?? null,
      erro_postgres_code: pgCode,
      erro_constraint: pgConstraint,
    })
  },

  fatal(
    categoria: LogCategoria,
    err: unknown,
    contexto?: Record<string, unknown>,
  ): void {
    const { mensagem, stack, pgCode, pgConstraint } = normalizeError(err)
    consolePrint('fatal', categoria, mensagem, contexto)
    pushError({
      ...baseRow(),
      agente: 'humano',
      origem: 'frontend',
      severidade: 'fatal',
      categoria,
      mensagem,
      stack,
      url: typeof window !== 'undefined' ? window.location.href : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      payload_request: null,
      contexto: contexto ?? null,
      erro_postgres_code: pgCode,
      erro_constraint: pgConstraint,
    })
  },

  /**
   * Mede duração de uma operação. Loga em performance_logs SE duracao > threshold
   * (default 500ms), e sempre loga em event_logs como info.
   * Funciona com função sync ou async.
   */
  async time<T>(
    categoria: LogCategoria,
    operacao: string,
    fn: () => T | Promise<T>,
    opts?: { threshold?: number; contexto?: Record<string, unknown> },
  ): Promise<T> {
    const threshold = opts?.threshold ?? PERFORMANCE_THRESHOLD_MS
    const t0 = performance.now()
    let result: T
    let erro: unknown = null
    try {
      result = await fn()
    } catch (err) {
      erro = err
      throw err
    } finally {
      const duracao = Math.round(performance.now() - t0)
      if (erro) {
        consolePrint('error', categoria, `${operacao} (falhou em ${duracao}ms)`, opts?.contexto)
      } else if (duracao >= threshold) {
        consolePrint('warn', categoria, `${operacao} lenta: ${duracao}ms`, opts?.contexto)
        pushPerf({
          ...baseRow(),
          origem: 'frontend',
          categoria,
          operacao,
          duracao_ms: duracao,
          queries_count: null,
          rows_affected: null,
          contexto: opts?.contexto ?? null,
        })
      }
      pushEvent({
        ...baseRow(),
        agente: 'humano',
        nivel: erro ? 'warn' : 'info',
        categoria,
        evento: `time.${operacao}`,
        contexto: opts?.contexto ?? null,
        duracao_ms: duracao,
        origem: 'frontend',
      })
    }
    return result!
  },
}

export type Logger = typeof logger
