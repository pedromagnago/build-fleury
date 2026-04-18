import { useUserRole } from '@/hooks/useUserRole'
import { ShieldAlert } from 'lucide-react'

interface RoleGateProps {
  route: string
  children: React.ReactNode
}

export function RoleGate({ route, children }: RoleGateProps) {
  const { canAccess, loading, role } = useUserRole()

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  // If no role at all, let them through (backward compat — RLS handles actual access)
  if (!role) return <>{children}</>

  if (!canAccess(route)) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
          <h2 className="text-lg font-semibold">Acesso Restrito</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Você não tem permissão para acessar este módulo.
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Entre em contato com um administrador para solicitar acesso.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
