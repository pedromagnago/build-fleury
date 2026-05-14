import { useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { useGestaoUsuarios, type TeamMember, type Invite, type InviteStatus } from '@/hooks/useGestaoUsuarios'
import { useUserRole, ROLE_LABELS, type UserRole } from '@/hooks/useUserRole'
import { toast } from 'sonner'
import {
  Users, UserPlus, Mail, Trash2, Shield, ShieldCheck,
  ShieldAlert, UserCog, CheckCircle2, Clock, AlertCircle,
  Search, MoreVertical, UserX, UserCheck, Crown,
  Copy, Link as LinkIcon, X, ExternalLink,
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

const STATUS_LABEL: Record<InviteStatus, { label: string; color: string }> = {
  pending: { label: 'Aguardando aceite', color: 'bg-amber-500/10 text-amber-600' },
  used:    { label: 'Conta criada',      color: 'bg-emerald-500/10 text-emerald-600' },
  revoked: { label: 'Revogado',          color: 'bg-red-500/10 text-red-600' },
  expired: { label: 'Expirado',          color: 'bg-slate-500/10 text-slate-600' },
}

interface GeneratedInvite {
  email: string
  role: string
  inviteUrl: string
  expiresAt?: string
  reused: boolean
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export default function GestaoUsuariosPage() {
  const { role: currentUserRole } = useUserRole()
  const {
    members, invites, stats, loading, inviting,
    updateRole, toggleActive, removeMember,
    createInvite, revokeInvite, buildInviteUrl,
  } = useGestaoUsuarios()

  const [search, setSearch] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<string>('operador')
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [generated, setGenerated] = useState<GeneratedInvite | null>(null)

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

  const handleCreate = async () => {
    const result = await createInvite(inviteEmail, inviteRole)
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    if (result.inviteUrl) {
      setGenerated({
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        inviteUrl: result.inviteUrl,
        expiresAt: result.expiresAt,
        reused: result.status === 'already_invited',
      })
      setInviteEmail('')
    } else {
      toast.success(result.message)
    }
  }

  const handleCopy = async (url: string) => {
    const ok = await copyToClipboard(url)
    if (ok) toast.success('Link copiado para a área de transferência')
    else toast.error('Não foi possível copiar — selecione manualmente.')
  }

  const handleCopyExisting = (inv: Invite) => {
    handleCopy(buildInviteUrl(inv.token))
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
    if (!window.confirm(`Revogar convite de ${inv.email}? O link deixará de funcionar.`)) return
    const ok = await revokeInvite(inv.id)
    if (ok) toast.success('Convite revogado')
    else toast.error('Erro ao revogar convite')
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
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
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
              onClick={handleCreate}
              disabled={inviting || !inviteEmail.trim()}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <LinkIcon className="h-4 w-4" />
              {inviting ? 'Gerando...' : 'Gerar link'}
            </button>
          </div>
          <p className="mt-2.5 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            Gera um link único que você compartilha com o convidado (WhatsApp, e-mail, etc). Ele cria a própria senha ao abrir.
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
          <table className="tbl-bf w-full text-sm">
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

                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${roleConfig}`}>
                        <RoleIcon className="h-3 w-3" />
                        {ROLE_LABELS[member.role]}
                      </span>
                    </td>

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

                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {member.created_at
                          ? new Date(member.created_at).toLocaleDateString('pt-BR')
                          : '—'}
                      </span>
                    </td>

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

                                <button
                                  onClick={() => handleToggleActive(member)}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-foreground hover:bg-accent transition-colors"
                                >
                                  {member.active
                                    ? <><UserX className="h-3.5 w-3.5 text-amber-500" /> Desativar</>
                                    : <><UserCheck className="h-3.5 w-3.5 text-emerald-500" /> Reativar</>
                                  }
                                </button>

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

      {/* Invites */}
      {invites.length > 0 && (
        <div className="mt-6 rounded-xl border bg-card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Mail className="h-4 w-4 text-primary" />
            Convites
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
              {invites.filter(i => i.status === 'pending').length} pendentes
            </span>
          </h3>

          <div className="space-y-2">
            {invites.map((inv) => {
              const cfg = STATUS_LABEL[inv.status]
              const canCopy = inv.status === 'pending'
              const canRevoke = isAdmin && inv.status === 'pending'
              return (
                <div key={inv.id} className="flex items-center justify-between rounded-lg border border-dashed px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/40">
                      {inv.status === 'used'    ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> :
                       inv.status === 'pending' ? <Clock className="h-4 w-4 text-amber-500" /> :
                                                   <AlertCircle className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{inv.email}</p>
                      <p className="truncate text-xs text-muted-foreground capitalize">
                        {ROLE_LABELS[inv.role] ?? inv.role} ·{' '}
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${cfg.color}`}>{cfg.label}</span>
                        {inv.status === 'pending' && (
                          <> · expira {new Date(inv.expires_at).toLocaleDateString('pt-BR')}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {canCopy && (
                      <button
                        onClick={() => handleCopyExisting(inv)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        title="Copiar link do convite"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canRevoke && (
                      <button
                        onClick={() => handleRevokeInvite(inv)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Revogar convite"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
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
            { role: 'super_admin' as UserRole, desc: 'Acesso total ao sistema. Pode gerenciar usuários, configurações e todos os módulos.' },
            { role: 'supervisor' as UserRole,  desc: 'Acesso a todos os módulos. Pode gerenciar equipe e aprovar operações.' },
            { role: 'operador' as UserRole,    desc: 'Acesso a compras, pagamentos, conciliação, documentos e relatórios.' },
            { role: 'cliente' as UserRole,     desc: 'Visualização somente leitura do cronograma, avanço físico e relatórios.' },
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

      {/* Generated Invite Modal */}
      {generated && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                  <LinkIcon className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold">
                    {generated.reused ? 'Convite ativo recuperado' : 'Convite criado'}
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    para <span className="font-medium">{generated.email}</span> · {ROLE_LABELS[generated.role as UserRole] ?? generated.role}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setGenerated(null)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-2 text-xs text-muted-foreground">
              Compartilhe este link com o convidado. Ele vai criar a própria senha ao abrir.
            </p>

            <div className="mb-3 flex items-stretch gap-2">
              <input
                type="text"
                value={generated.inviteUrl}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 rounded-lg border bg-muted/30 px-3 py-2 text-xs font-mono text-foreground focus:outline-none"
              />
              <button
                onClick={() => handleCopy(generated.inviteUrl)}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar
              </button>
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {generated.expiresAt
                  ? <>Expira em {new Date(generated.expiresAt).toLocaleDateString('pt-BR')}</>
                  : 'Validade 7 dias'}
              </span>
              <a
                href={generated.inviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                Abrir <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      )}
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
