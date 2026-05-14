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

export type InviteStatus = 'pending' | 'used' | 'revoked' | 'expired'

export interface Invite {
  id: string
  token: string
  email: string
  role: UserRole
  expires_at: string
  used_at: string | null
  revoked_at: string | null
  created_at: string
  status: InviteStatus
}

interface TeamStats {
  total: number
  byRole: Record<string, number>
  active: number
  inactive: number
  pendingInvites: number
}

export interface CreateInviteResult {
  ok: boolean
  message: string
  token?: string
  inviteUrl?: string
  expiresAt?: string
  status?: 'invited' | 'already_invited' | 'already_member'
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
  createInvite: (email: string, role: string) => Promise<CreateInviteResult>
  revokeInvite: (inviteId: string) => Promise<boolean>
  buildInviteUrl: (token: string) => string
}

export function useGestaoUsuarios(): UseGestaoUsuariosReturn {
  const { currentCompany } = useProject()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)

  const companyId = currentCompany?.id

  const buildInviteUrl = useCallback((token: string) => {
    return `${window.location.origin}/convite/${token}`
  }, [])

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
    const { data, error } = await supabase.rpc('list_user_invites', { _company_id: companyId })
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

  const createInvite = useCallback(async (email: string, role: string): Promise<CreateInviteResult> => {
    if (!companyId) return { ok: false, message: 'Sem projeto selecionado' }

    const trimmed = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return { ok: false, message: 'Email inválido' }
    }

    setInviting(true)

    try {
      const { data: result, error } = await supabase.rpc('create_invite', {
        _email: trimmed,
        _role: role,
        _company_id: companyId,
      })

      if (error) {
        return { ok: false, message: error.message }
      }

      const res = result as {
        status: 'invited' | 'already_invited' | 'already_member'
        message: string
        token?: string
        expires_at?: string
      }

      if (res.status === 'already_member') {
        return { ok: false, status: res.status, message: res.message }
      }

      const token = res.token
      const inviteUrl = token ? buildInviteUrl(token) : undefined

      if (res.status === 'invited') {
        await writeAuditLog({
          companyId,
          tabela: 'user_invites',
          acao: 'INSERT',
          dadosDepois: { email: trimmed, role },
          resumo: `Gerou convite para ${trimmed} como ${role}`,
        })
      }

      await fetchInvites()

      return {
        ok: true,
        status: res.status,
        message: res.status === 'already_invited'
          ? 'Já havia um convite ativo para este email — link atual abaixo.'
          : `Convite criado para ${trimmed}. Compartilhe o link.`,
        token,
        inviteUrl,
        expiresAt: res.expires_at,
      }
    } catch {
      return { ok: false, message: 'Erro inesperado ao criar convite' }
    } finally {
      setInviting(false)
    }
  }, [companyId, fetchInvites, buildInviteUrl])

  const revokeInvite = useCallback(async (inviteId: string): Promise<boolean> => {
    const { error } = await supabase.rpc('revoke_user_invite', { _invite_id: inviteId })
    if (error) return false

    if (companyId) {
      await writeAuditLog({
        companyId,
        tabela: 'user_invites',
        acao: 'UPDATE',
        registroId: inviteId,
        dadosDepois: { revoked_at: new Date().toISOString() },
        resumo: 'Revogou convite de usuário',
      })
    }

    await fetchInvites()
    return true
  }, [companyId, fetchInvites])

  const pendingInvites = invites.filter(i => i.status === 'pending').length

  const stats: TeamStats = {
    total: members.length,
    byRole: members.reduce((acc, m) => {
      acc[m.role] = (acc[m.role] || 0) + 1
      return acc
    }, {} as Record<string, number>),
    active: members.filter(m => m.active).length,
    inactive: members.filter(m => !m.active).length,
    pendingInvites,
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
    createInvite,
    revokeInvite,
    buildInviteUrl,
  }
}
