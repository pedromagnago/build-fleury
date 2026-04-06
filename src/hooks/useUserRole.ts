import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export type UserRole = 'super_admin' | 'supervisor' | 'operador' | 'cliente'

interface RoleEntry {
  role: UserRole
  company_id: string
  active: boolean
}

interface UserRoleData {
  role: UserRole | null
  companyId: string | null
  allRoles: RoleEntry[]
  loading: boolean
  getRoleForCompany: (companyId: string) => UserRole | null
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

  return {
    role: firstRole?.role ?? null,
    companyId: firstRole?.company_id ?? null,
    allRoles,
    loading,
    getRoleForCompany,
  }
}
