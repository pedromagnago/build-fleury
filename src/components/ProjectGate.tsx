import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useProject } from '@/contexts/ProjectContext'

export function ProjectGate({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const { companies, loading: projectLoading } = useProject()

  if (authLoading || projectLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (companies.length === 0) {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}
