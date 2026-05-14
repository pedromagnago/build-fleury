/**
 * LoggerProvider — sincroniza logger global com Auth + Project + Router.
 *
 *   - Gera um correlation_id por sessão de rota (muda quando o pathname muda).
 *   - Mantém logger.setContext({ userId, userEmail, companyId }) sempre atual.
 *   - Expõe useCorrelation() pra componentes lerem o id atual ou forçarem
 *     um novo (ex.: antes de uma operação crítica como baixa em lote).
 *
 * Precisa ficar DENTRO de <BrowserRouter>, <AuthProvider> e <ProjectProvider>.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { useProject } from './ProjectContext'
import { logger, newCorrelationId, setLoggerContext } from '@/lib/logger'

interface CorrelationContextValue {
  correlationId: string
  newCorrelation: () => string
}

const CorrelationContext = createContext<CorrelationContextValue | undefined>(undefined)

export function LoggerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { currentCompany } = useProject()
  const location = useLocation()
  const [correlationId, setCorrelationId] = useState<string>(() => newCorrelationId())

  // Novo correlation_id a cada navegação (mantém todos os eventos de uma rota
  // sob o mesmo id, mas separa rotas distintas).
  useEffect(() => {
    const id = newCorrelationId()
    setCorrelationId(id)
    logger.info('navegacao', 'rota_entrou', { pathname: location.pathname })
  }, [location.pathname])

  // Sincroniza user/company com o logger.
  useEffect(() => {
    setLoggerContext({
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
    })
  }, [user?.id, user?.email])

  useEffect(() => {
    setLoggerContext({ companyId: currentCompany?.id ?? null })
  }, [currentCompany?.id])

  // Captura erros não tratados no window (excluindo erros React, que vão pro ErrorBoundary).
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      logger.error('sistema', event.error ?? new Error(event.message), {
        source: event.filename,
        line: event.lineno,
        col: event.colno,
        kind: 'window.onerror',
      })
    }
    const onRejection = (event: PromiseRejectionEvent) => {
      logger.error('sistema', event.reason, { kind: 'unhandledrejection' })
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  const newCorrelation = useCallback(() => {
    const id = newCorrelationId()
    setCorrelationId(id)
    return id
  }, [])

  const value = useMemo<CorrelationContextValue>(
    () => ({ correlationId, newCorrelation }),
    [correlationId, newCorrelation],
  )

  return <CorrelationContext.Provider value={value}>{children}</CorrelationContext.Provider>
}

export function useCorrelation(): CorrelationContextValue {
  const ctx = useContext(CorrelationContext)
  if (!ctx) {
    throw new Error('useCorrelation must be used within a LoggerProvider')
  }
  return ctx
}
