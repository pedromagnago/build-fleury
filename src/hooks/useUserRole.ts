import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export type UserRole = 'super_admin' | 'supervisor' | 'operador' | 'cliente'

interface UserRoleData {
  role: UserRole | null
  companyId: string | null
  loading: boolean
}

export function useUserRole(): UserRoleData {
  const { user } = useAuth()
  const [role, setRole] = useState<UserRole | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setRole(null)
      setCompanyId(null)
      setLoading(false)
      return
    }

    async function fetchRole() {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role, company_id')
        .eq('user_id', user!.id)
        .eq('active', true)
        .single()

      if (error || !data) {
        setRole(null)
        setCompanyId(null)
      } else {
        setRole(data.role as UserRole)
        setCompanyId(data.company_id as string)
      }
      setLoading(false)
    }

    fetchRole()
  }, [user])

  return { role, companyId, loading }
}
