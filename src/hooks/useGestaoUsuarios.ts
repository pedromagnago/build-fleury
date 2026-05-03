import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { writeAuditLog } from '@/lib/auditLog'
import type { UserRole } from './useUserRole'

export interface TeamMember {
  id: string
  user_id: string
  role: UserRole
  active: boolean
  invited_email?: string | null
  email?: string
  created_at?: string
}

export interface Invite {
  id: string
  invited_email: string
  role: string
  active: boolean
  created_at: string
  is_resolved: boolean
}

interface TeamStats {
  total: number
  byRole: Record<string, number>
  active: number
  inactive: number
  pendingInvites: number
}

interface UseGestaoUsuariosReturn {
  members: TeamMember[]
  invites: Invite[]
  stats: TeamStats
  loading: boolean
  inviting: boolean
  fetchMembers: () => Promise<void>
  fetchInvites: () => Promise<void>
  updateRole: (roleId: string, newRole: UserRole) => Promise<boolean>
  toggleActive: (roleId: string, currentlyActive: boolean) => Promise<boolean>
  removeMember: (roleId: string) => Promise<boolean>
  inviteUser: (email: string, role: string) => Promise<{ ok: boolean; message: string }>
  revokeInvite: (inviteId: string) => Promise<boolean>
  resendInvite: (email: string) => Promise<boolean>
}

export function useGestaoUsuarios(): UseGestaoUsuariosReturn {
  const { currentCompany } = useProject()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)

  const companyId = currentCompany?.id

  const fetchMembers = useCallback(async () => {
    if (!companyId) return
    const { data } = await supabase
      .from('user_roles')
      .select('id, user_id, role, active, invited_email, created_at')
      .eq('company_id', companyId)
      .is('invited_email', null)
      .order('created_at')

    if (data) setMembers(data as TeamMember[])
  }, [companyId])

  const fetchInvites = useCallback(async () => {
    if (!companyId) return
    const { data, error } = await supabase.rpc('list_invites', { _company_id: companyId })
    if (data && !error) setInvites(data as Invite[])
  }, [companyId])

  useEffect(() => {
    if (!companyId) {
      setMembers([])
      setInvites([])
      setLoading(false)
      return
    }

    setLoading(true)
    Promise.all([fetchMembers(), fetchInvites()]).finally(() => setLoading(false))
  }, [companyId, fetchMembers, fetchInvites])

  const updateRole = useCallback(async (roleId: string, newRole: UserRole): Promise<boolean> => {
    if (!companyId) return false

    const member = members.find(m => m.id === roleId)
    const { error } = await supabase
      .from('user_roles')
      .update({ role: newRole })
      .eq('id', roleId)

    if (error) return false

    await writeAuditLog({
      companyId,
      tabela: 'user_roles',
      acao: 'UPDATE',
      registroId: roleId,
      dadosAntes: { role: member?.role },
      dadosDepois: { role: newRole },
      resumo: `Alterou role de ${member?.email ?? member?.user_id.slice(0, 8)} para ${newRole}`,
    })

    await fetchMembers()
    return true
  }, [companyId, members, fetchMembers])

  const toggleActive = useCallback(async (roleId: string, currentlyActive: boolean): Promise<boolean> => {
    if (!companyId) return false

    const newActive = !currentlyActive
    const { error } = await supabase
      .from('user_roles')
      .update({ active: newActive })
      .eq('id', roleId)

    if (error) return false

    const member = members.find(m => m.id === roleId)
    await writeAuditLog({
      companyId,
      tabela: 'user_roles',
      acao: 'UPDATE',
      registroId: roleId,
      dadosAntes: { active: currentlyActive },
      dadosDepois: { active: newActive },
      resumo: `${newActive ? 'Reativou' : 'Desativou'} usuário ${member?.email ?? member?.user_id.slice(0, 8)}`,
    })

    await fetchMembers()
    return true
  }, [companyId, members, fetchMembers])

  const removeMember = useCallback(async (roleId: string): Promise<boolean> => {
    if (!companyId) return false

    const member = members.find(m => m.id === roleId)
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('id', roleId)

    if (error) return false

    await writeAuditLog({
      companyId,
      tabela: 'user_roles',
      acao: 'DELETE',
      registroId: roleId,
      dadosAntes: { user_id: member?.user_id, role: member?.role },
      resumo: `Removeu usuário ${member?.email ?? member?.user_id.slice(0, 8)} do projeto`,
    })

    await fetchMembers()
    return true
  }, [companyId, members, fetchMembers])

  const inviteUser = useCallback(async (email: string, role: string): Promise<{ ok: boolean; message: string }> => {
    if (!companyId) return { ok: false, message: 'Sem projeto selecionado' }

    const trimmed = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return { ok: false, message: 'Email inválido' }
    }

    setInviting(true)

    try {
      const { data: result, error: rpcError } = await supabase.rpc('invite_user', {
        _email: trimmed,
        _role: role,
        _company_id: companyId,
      })

      if (rpcError) {
        setInviting(false)
        return { ok: false, message: rpcError.message }
      }

      const res = result as { status: string; message: string }

      if (res.status === 'already_invited' || res.status === 'already_member') {
        setInviting(false)
        return { ok: false, message: res.message }
      }

      if (res.status === 'linked' || res.status === 'reactivated') {
        await writeAuditLog({
          companyId,
          tabela: 'user_roles',
          acao: res.status === 'reactivated' ? 'UPDATE' : 'INSERT',
          dadosDepois: { email: trimmed, role },
          resumo: res.status === 'reactivated'
            ? `Reativou ${trimmed} como ${role}`
            : `Vinculou ${trimmed} ao projeto como ${role}`,
        })
        await fetchInvites()
        await fetchMembers()
        setInviting(false)
        return { ok: true, message: res.message }
      }

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      })

      await writeAuditLog({
        companyId,
        tabela: 'user_roles',
        acao: 'INSERT',
        dadosDepois: { invited_email: trimmed, role },
        resumo: `Convidou ${trimmed} como ${role}`,
      })

      await fetchInvites()
      await fetchMembers()

      setInviting(false)

      if (otpError) {
        return { ok: false, message: `Convite registrado mas falha ao enviar e-mail: ${otpError.message}` }
      }
      return { ok: true, message: `Convite enviado para ${trimmed}!` }
    } catch {
      setInviting(false)
      return { ok: false, message: 'Erro inesperado ao enviar convite' }
    }
  }, [companyId, fetchInvites, fetchMembers])

  const revokeInvite = useCallback(async (inviteId: string): Promise<boolean> => {
    const { error } = await supabase.rpc('revoke_invite', { _role_id: inviteId })
    if (error) return false

    if (companyId) {
      await writeAuditLog({
        companyId,
        tabela: 'user_roles',
        acao: 'DELETE',
        registroId: inviteId,
        resumo: 'Revogou convite de usuário',
      })
    }

    await fetchInvites()
    await fetchMembers()
    return true
  }, [companyId, fetchInvites, fetchMembers])

  const resendInvite = useCallback(async (email: string): Promise<boolean> => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    })
    return !error
  }, [])

  const stats: TeamStats = {
    total: members.length,
    byRole: members.reduce((acc, m) => {
      acc[m.role] = (acc[m.role] || 0) + 1
      return acc
    }, {} as Record<string, number>),
    active: members.filter(m => m.active).length,
    inactive: members.filter(m => !m.active).length,
    pendingInvites: invites.filter(i => !i.is_resolved).length,
  }

  return {
    members,
    invites,
    stats,
    loading,
    inviting,
    fetchMembers,
    fetchInvites,
    updateRole,
    toggleActive,
    removeMember,
    inviteUser,
    revokeInvite,
    resendInvite,
  }
}
