import { useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { useGestaoUsuarios, type TeamMember, type Invite } from '@/hooks/useGestaoUsuarios'
import { useUserRole, ROLE_LABELS, type UserRole } from '@/hooks/useUserRole'
import { toast } from 'sonner'
import {
  Users, UserPlus, Mail, Send, Trash2, Shield, ShieldCheck,
  ShieldAlert, UserCog, CheckCircle2, Clock, AlertCircle,
  Search, MoreVertical, UserX, UserCheck, Crown,
} from 'lucide-react'

const ROLE_ICON: Record<UserRole, typeof Shield> = {
  super_admin: Crown,
  supervisor: ShieldCheck,
  operador: Shield,
  cliente: ShieldAlert,
}

const ROLE_COLOR: Record<UserRole, string> = {
  super_admin: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  supervisor: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  operador: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  cliente: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
}

export default function GestaoUsuariosPage() {
  const { role: currentUserRole } = useUserRole()
  const {
    members, invites, stats, loading, inviting,
    updateRole, toggleActive, removeMember,
    inviteUser, revokeInvite, resendInvite,
  } = useGestaoUsuarios()

  const [search, setSearch] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<string>('operador')
  const [activeMenu, setActiveMenu] = useState<string | null>(null)

  const isAdmin = currentUserRole === 'super_admin' || currentUserRole === 'supervisor'

  const filteredMembers = members.filter(m => {
    const q = search.toLowerCase()
    if (!q) return true
    return (
      (m.email ?? '').toLowerCase().includes(q) ||
      m.user_id.toLowerCase().includes(q) ||
      m.role.toLowerCase().includes(q)
    )
  })

  const handleInvite = async () => {
    const result = await inviteUser(inviteEmail, inviteRole)
    if (result.ok) {
      toast.success(result.message)
      setInviteEmail('')
    } else {
      toast.error(result.message)
    }
  }

  const handleUpdateRole = async (roleId: string, newRole: UserRole) => {
    const ok = await updateRole(roleId, newRole)
    if (ok) toast.success('Role atualizado com sucesso')
    else toast.error('Erro ao atualizar role')
    setActiveMenu(null)
  }

  const handleToggleActive = async (member: TeamMember) => {
    const ok = await toggleActive(member.id, member.active)
    if (ok) toast.success(member.active ? 'Usuário desativado' : 'Usuário reativado')
    else toast.error('Erro ao alterar status')
    setActiveMenu(null)
  }

  const handleRemove = async (member: TeamMember) => {
    const label = member.email ?? member.user_id.slice(0, 8)
    if (!window.confirm(`Remover ${label} do projeto? Esta ação não pode ser desfeita.`)) return
    const ok = await removeMember(member.id)
    if (ok) toast.success('Membro removido do projeto')
    else toast.error('Erro ao remover membro')
    setActiveMenu(null)
  }

  const handleRevokeInvite = async (inv: Invite) => {
    if (!window.confirm(`Revogar convite de ${inv.invited_email}?`)) return
    const ok = await revokeInvite(inv.id)
    if (ok) toast.success('Convite revogado')
    else toast.error('Erro ao revogar convite')
  }

  const handleResendInvite = async (email: string) => {
    const ok = await resendInvite(email)
    if (ok) toast.success(`Link reenviado para ${email}`)
    else toast.error('Erro ao reenviar link')
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Gestão de Usuários"
        description="Gerencie membros da equipe, permissões e convites"
        icon={Users}
      />

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total de Membros" value={stats.total} icon={Users} color="primary" />
        <StatCard label="Ativos" value={stats.active} icon={UserCheck} color="emerald" />
        <StatCard label="Inativos" value={stats.inactive} icon={UserX} color="red" />
        <StatCard label="Convites Pendentes" value={stats.pendingInvites} icon={Clock} color="amber" />
      </div>

      {/* Invite Form */}
      {isAdmin && (
        <div className="mb-6 rounded-xl border bg-card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <UserPlus className="h-4 w-4 text-primary" />
            Convidar Novo Membro
          </h3>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                placeholder="email@exemplo.com"
                className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded-lg border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="operador">Operador</option>
              <option value="supervisor">Supervisor</option>
              <option value="cliente">Cliente</option>
            </select>
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <UserPlus className="h-4 w-4" />
              {inviting ? 'Enviando...' : 'Convidar'}
            </button>
          </div>
          <p className="mt-2.5 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            O convidado receberá um link de acesso por e-mail. Se já tiver conta, será vinculado automaticamente ao projeto.
          </p>
        </div>
      )}

      {/* Search */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por email, role..."
            className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {filteredMembers.length} membros
        </div>
      </div>

      {/* Members Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Usuário</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground hidden sm:table-cell">Desde</th>
                {isAdmin && (
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Ações</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredMembers.map((member) => {
                const roleConfig = ROLE_COLOR[member.role]
                const RoleIcon = ROLE_ICON[member.role]
                const displayName = member.email ?? member.user_id.slice(0, 8) + '...'
                const initials = (member.email ?? member.user_id).slice(0, 2).toUpperCase()
                const isMenuOpen = activeMenu === member.id

                return (
                  <tr key={member.id} className="transition-colors hover:bg-muted/20">
                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {initials}
                        </div>
                        <div>
                          <p className="font-medium">{displayName}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">
                            {member.user_id.slice(0, 12)}...
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${roleConfig}`}>
                        <RoleIcon className="h-3 w-3" />
                        {ROLE_LABELS[member.role]}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        member.active
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : 'bg-red-500/10 text-red-600'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${member.active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        {member.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {member.created_at
                          ? new Date(member.created_at).toLocaleDateString('pt-BR')
                          : '—'}
                      </span>
                    </td>

                    {/* Actions */}
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <div className="relative inline-block">
                          <button
                            onClick={() => setActiveMenu(isMenuOpen ? null : member.id)}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>

                          {isMenuOpen && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setActiveMenu(null)} />
                              <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border bg-popover p-1.5 shadow-xl">
                                {/* Change role */}
                                <p className="px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                  Alterar Role
                                </p>
                                {(['super_admin', 'supervisor', 'operador', 'cliente'] as UserRole[]).map(r => (
                                  <button
                                    key={r}
                                    disabled={r === member.role}
                                    onClick={() => handleUpdateRole(member.id, r)}
                                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors ${
                                      r === member.role
                                        ? 'bg-primary/10 text-primary font-medium'
                                        : 'text-foreground hover:bg-accent'
                                    }`}
                                  >
                                    <UserCog className="h-3.5 w-3.5" />
                                    {ROLE_LABELS[r]}
                                    {r === member.role && <CheckCircle2 className="ml-auto h-3 w-3" />}
                                  </button>
                                ))}

                                <div className="my-1.5 border-t" />

                                {/* Toggle active */}
                                <button
                                  onClick={() => handleToggleActive(member)}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-foreground hover:bg-accent transition-colors"
                                >
                                  {member.active
                                    ? <><UserX className="h-3.5 w-3.5 text-amber-500" /> Desativar</>
                                    : <><UserCheck className="h-3.5 w-3.5 text-emerald-500" /> Reativar</>
                                  }
                                </button>

                                {/* Remove */}
                                <button
                                  onClick={() => handleRemove(member)}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Remover do Projeto
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}

              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Nenhum membro encontrado</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <div className="mt-6 rounded-xl border bg-card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Mail className="h-4 w-4 text-primary" />
            Convites Pendentes
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
              {invites.filter(i => !i.is_resolved).length}
            </span>
          </h3>

          <div className="space-y-2">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-lg border border-dashed px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10">
                    {inv.is_resolved
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      : <Clock className="h-4 w-4 text-amber-500" />
                    }
                  </div>
                  <div>
                    <p className="text-sm font-medium">{inv.invited_email}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {inv.role.replace('_', ' ')} •{' '}
                      {inv.is_resolved
                        ? <span className="text-emerald-600">Conta criada ✓</span>
                        : <span className="text-amber-600">Aguardando confirmação</span>
                      }
                    </p>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    {!inv.is_resolved && (
                      <button
                        onClick={() => handleResendInvite(inv.invited_email)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        title="Reenviar convite"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleRevokeInvite(inv)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Revogar convite"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Role Legend */}
      <div className="mt-6 rounded-xl border bg-card p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Permissões por Role
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            {
              role: 'super_admin' as UserRole,
              desc: 'Acesso total ao sistema. Pode gerenciar usuários, configurações e todos os módulos.',
            },
            {
              role: 'supervisor' as UserRole,
              desc: 'Acesso a todos os módulos. Pode gerenciar equipe e aprovar operações.',
            },
            {
              role: 'operador' as UserRole,
              desc: 'Acesso a compras, pagamentos, conciliação, documentos e relatórios.',
            },
            {
              role: 'cliente' as UserRole,
              desc: 'Visualização somente leitura do cronograma, avanço físico e relatórios.',
            },
          ]).map(item => {
            const RIcon = ROLE_ICON[item.role]
            return (
              <div key={item.role} className="flex items-start gap-3 rounded-lg border p-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ROLE_COLOR[item.role].split(' ').slice(0, 1).join(' ')}`}>
                  <RIcon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold">{ROLE_LABELS[item.role]}</p>
                  <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: typeof Users; color: string
}) {
  const colorMap: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    emerald: 'bg-emerald-500/10 text-emerald-600',
    red: 'bg-red-500/10 text-red-600',
    amber: 'bg-amber-500/10 text-amber-600',
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${colorMap[color] ?? colorMap.primary}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}
