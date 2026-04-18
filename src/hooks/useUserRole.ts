import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export type UserRole = 'super_admin' | 'supervisor' | 'operador' | 'cliente'

interface RoleEntry {
  role: UserRole
  company_id: string
  active: boolean
}

// ── Permission map: which routes each role can access ──
const ROLE_ROUTE_ACCESS: Record<UserRole, Set<string>> = {
  super_admin: new Set([
    '/cronograma', '/compras', '/avanco', '/pagamentos',
    '/despesas-indiretas', '/mutuos', '/conciliacao', '/documentos',
    '/auditoria', '/painel-controle', '/relatorios', '/importacao', '/usuarios',
    '/configuracoes', '/perfil',
  ]),
  supervisor: new Set([
    '/cronograma', '/compras', '/avanco', '/pagamentos',
    '/despesas-indiretas', '/mutuos', '/conciliacao', '/documentos',
    '/auditoria', '/painel-controle', '/relatorios', '/importacao', '/usuarios',
    '/configuracoes', '/perfil',
  ]),
  operador: new Set([
    '/cronograma', '/compras', '/avanco', '/pagamentos',
    '/despesas-indiretas', '/conciliacao', '/documentos',
    '/relatorios', '/perfil',
  ]),
  cliente: new Set([
    '/cronograma', '/avanco', '/relatorios', '/perfil',
  ]),
}

// Routes where the role can only view (no edit actions)
const READ_ONLY_ROUTES: Record<UserRole, Set<string>> = {
  super_admin: new Set(),
  supervisor: new Set(),
  operador: new Set(),
  cliente: new Set(['/cronograma', '/avanco', '/relatorios']),
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  supervisor: 'Supervisor',
  operador: 'Operador',
  cliente: 'Cliente',
}

interface UserRoleData {
  role: UserRole | null
  companyId: string | null
  allRoles: RoleEntry[]
  loading: boolean
  getRoleForCompany: (companyId: string) => UserRole | null
  canAccess: (route: string) => boolean
  isReadOnly: (route: string) => boolean
  isAdmin: boolean
}

export function useUserRole(): UserRoleData {
  const { user } = useAuth()
  const [allRoles, setAllRoles] = useState<RoleEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setAllRoles([])
      setLoading(false)
      return
    }

    async function fetchRoles() {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role, company_id, active')
        .eq('user_id', user!.id)
        .eq('active', true)

      if (error || !data) {
        setAllRoles([])
      } else {
        setAllRoles(data as RoleEntry[])
      }
      setLoading(false)
    }

    fetchRoles()
  }, [user])

  const getRoleForCompany = useCallback((companyId: string): UserRole | null => {
    const entry = allRoles.find(r => r.company_id === companyId)
    return entry?.role ?? null
  }, [allRoles])

  // Default: return the first role found (backward compatible)
  const firstRole = allRoles.length > 0 ? allRoles[0]! : null
  const currentRole = firstRole?.role ?? null

  const canAccess = useCallback((route: string): boolean => {
    if (!currentRole) return false
    const allowed = ROLE_ROUTE_ACCESS[currentRole]
    return allowed.has(route)
  }, [currentRole])

  const isReadOnly = useCallback((route: string): boolean => {
    if (!currentRole) return true
    const readOnly = READ_ONLY_ROUTES[currentRole]
    return readOnly.has(route)
  }, [currentRole])

  const isAdmin = useMemo(() => {
    return currentRole === 'super_admin' || currentRole === 'supervisor'
  }, [currentRole])

  return {
    role: currentRole,
    companyId: firstRole?.company_id ?? null,
    allRoles,
    loading,
    getRoleForCompany,
    canAccess,
    isReadOnly,
    isAdmin,
  }
}
