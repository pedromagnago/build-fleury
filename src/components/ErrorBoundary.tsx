/**
 * ErrorBoundary global — captura erros de render React e grava em error_logs
 * com severidade=fatal. Mostra tela de fallback amigável + correlation_id pra
 * suporte. Botão "tentar de novo" reseta o boundary.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logger, getLoggerContext } from '@/lib/logger'

interface Props {
  children: ReactNode
  fallback?: (err: Error, reset: () => void, correlationId: string | null) => ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.fatal('sistema', error, {
      kind: 'react.errorBoundary',
      componentStack: info.componentStack,
    })
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    const cid = getLoggerContext().correlationId
    if (this.props.fallback) {
      return this.props.fallback(this.state.error, this.reset, cid)
    }
    return <DefaultFallback error={this.state.error} reset={this.reset} correlationId={cid} />
  }
}

function DefaultFallback({
  error,
  reset,
  correlationId,
}: {
  error: Error
  reset: () => void
  correlationId: string | null
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-lg rounded-lg border border-red-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-red-700">Algo deu errado</h1>
        <p className="mt-2 text-sm text-slate-700">
          A tela travou. O erro foi registrado e a equipe vai investigar. Você pode tentar
          recarregar ou voltar pra tela anterior.
        </p>
        <pre className="mt-3 max-h-32 overflow-auto rounded bg-slate-100 p-2 text-xs text-slate-700">
          {error.message}
        </pre>
        {correlationId && (
          <p className="mt-3 text-xs text-slate-500">
            ID do erro:{' '}
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(correlationId)
              }}
              className="font-mono text-slate-700 underline decoration-dotted underline-offset-2"
              title="Clique pra copiar"
            >
              {correlationId}
            </button>
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Tentar de novo
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Recarregar
          </button>
        </div>
      </div>
    </div>
  )
}
