/**
 * Wrappers de logging em cima do supabase client — Fase 4 do plano.
 *
 * Não substitui o `supabase` global (seria invasivo demais). Em vez disso,
 * oferece helpers explícitos que os hooks/pages adotam aos poucos:
 *
 *   - rpcWithLogging(name, args, opts)   → chama .rpc() medindo duração
 *                                            e logando erro automaticamente
 *   - withLogging(categoria, op, fn)     → HoF pra wrappar qualquer async
 *                                            (não só RPC) e ganhar perf+erro
 *   - logSupabaseError(err, ctx)         → normaliza erro PostgREST/PG e grava
 *
 * O ganho é grande: você não precisa lembrar de `try/catch + logger.error`
 * em todo .rpc. O wrapper faz isso e ainda mede duração pra performance_logs.
 */

import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { logger, type LogCategoria } from './logger'

interface RpcOpts {
  categoria: LogCategoria
  /** Override do nome da operação no log (default = nome da RPC) */
  operacao?: string
  /** Threshold custom em ms pra gravar em performance_logs */
  threshold?: number
  /** Contexto adicional a anexar nos logs */
  contexto?: Record<string, unknown>
  /** Se true, NÃO loga erro (caller vai tratar). Default: false. */
  silent?: boolean
}

/**
 * Chama uma RPC do Supabase medindo duração e gravando erro automaticamente.
 * Retorna o mesmo shape `{ data, error }` do client, pra ser drop-in.
 */
export async function rpcWithLogging<T = unknown>(
  fn: string,
  args: Record<string, unknown> | undefined,
  opts: RpcOpts,
): Promise<{ data: T | null; error: PostgrestError | null }> {
  const t0 = performance.now()

  // Tentativa de propagar correlation_id pro lado SQL: se a RPC aceitar
  // um parâmetro `_correlation_id`, ele entra automaticamente.
  // (Não quebra RPC que não aceita — Postgres ignora unknown params? Não.
  // PostgREST retorna erro. Por isso só adicionamos se o caller pedir.)
  const finalArgs = args ?? {}

  const { data, error } = await supabase.rpc(fn, finalArgs)
  const duracao = Math.round(performance.now() - t0)

  if (error) {
    if (!opts.silent) {
      logger.error(opts.categoria, error, {
        kind: 'rpc',
        rpc: fn,
        args: redactArgs(finalArgs),
        duracao_ms: duracao,
        ...opts.contexto,
      })
    }
  } else {
    const threshold = opts.threshold ?? 500
    if (duracao >= threshold) {
      logger.warn(opts.categoria, 'rpc_lenta', {
        rpc: fn,
        duracao_ms: duracao,
        threshold,
        ...opts.contexto,
      })
    }
  }

  return { data: data as T | null, error }
}

/**
 * Envolve qualquer função async medindo duração e capturando erro.
 * Use pra operações que não são RPC (ex.: bloco com vários `.from().select()`,
 * cálculos pesados em memória, parsing de planilha, etc.).
 *
 *   const pedidos = await withLogging('compras', 'gerar_pedidos_lote', async () => {
 *     // múltiplas queries + cálculos
 *   })
 */
export async function withLogging<T>(
  categoria: LogCategoria,
  operacao: string,
  fn: () => Promise<T>,
  opts?: { threshold?: number; contexto?: Record<string, unknown>; rethrow?: boolean },
): Promise<T> {
  const t0 = performance.now()
  try {
    const result = await fn()
    const duracao = Math.round(performance.now() - t0)
    const threshold = opts?.threshold ?? 500
    if (duracao >= threshold) {
      logger.warn(categoria, `${operacao}_lenta`, {
        duracao_ms: duracao,
        threshold,
        ...opts?.contexto,
      })
    }
    return result
  } catch (err) {
    const duracao = Math.round(performance.now() - t0)
    logger.error(categoria, err, {
      operacao,
      duracao_ms: duracao,
      ...opts?.contexto,
    })
    if (opts?.rethrow !== false) throw err
    // Quando rethrow=false, devolve um valor sentinela que o caller deve
    // tratar como ausência. Tipo any pra não obrigar T | null no site de uso.
    return undefined as unknown as T
  }
}

/**
 * Loga manualmente um erro do Supabase (PostgrestError) extraindo campos úteis
 * pro error_logs (postgres_code, constraint). Use quando você já tem o erro
 * em mãos mas não quer usar os wrappers acima.
 */
export function logSupabaseError(
  categoria: LogCategoria,
  err: PostgrestError | Error | unknown,
  contexto?: Record<string, unknown>,
): void {
  logger.error(categoria, err, contexto)
}

// =============================== Internals ==================================

/**
 * Remove campos sensíveis de args antes de gravar em log (senha, token).
 * Best-effort — se o caller passar nomes não óbvios, fica como está.
 */
function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE = /senha|password|token|secret|apikey|api_key|authorization/i
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    if (SENSITIVE.test(k)) {
      out[k] = '[REDACTED]'
    } else {
      out[k] = v
    }
  }
  return out
}
