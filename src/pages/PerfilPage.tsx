import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useUserRole, ROLE_LABELS } from '@/hooks/useUserRole'
import { useProject } from '@/contexts/ProjectContext'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import { toast } from 'sonner'
import {
  User, Lock, Building2, LogOut,
  Eye, EyeOff, CheckCircle2, Shield,
  Mail, Calendar,
} from 'lucide-react'

export default function PerfilPage() {
  const { user, signOut } = useAuth()
  const { role, allRoles } = useUserRole()
  const { companies } = useProject()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  const email = user?.email ?? ''
  const initials = email.slice(0, 2).toUpperCase()
  const createdAt = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('pt-BR', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : '—'

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (newPassword.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres.')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem.')
      return
    }

    setChangingPassword(true)

    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      toast.error('Erro ao alterar senha: ' + error.message)
    } else {
      toast.success('Senha alterada com sucesso!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }

    setChangingPassword(false)
  }

  const handleSignOutAll = async () => {
    if (!window.confirm('Sair de todas as sessões? Você será desconectado agora.')) return
    await signOut()
  }

  const inputCls = 'w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

  return (
    <div>
      <PageHeader
        title="Meu Perfil"
        description="Gerencie seus dados pessoais e segurança"
        icon={User}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Main Column */}
        <div className="space-y-6">
          {/* User Info Card */}
          <div className="rounded-xl border bg-card p-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <User className="h-4 w-4 text-primary" />
              Dados do Usuário
            </h3>

            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary">
                {initials}
              </div>
              <div>
                <p className="text-lg font-semibold">{email}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  {role && (
                    <span className="inline-flex items-center gap-1 rounded-full border bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary">
                      <Shield className="h-2.5 w-2.5" />
                      {ROLE_LABELS[role]}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  <Mail className="mr-1 inline h-3 w-3" />
                  E-mail
                </label>
                <input type="email" value={email} disabled className={`${inputCls} opacity-60`} />
                <p className="mt-1 text-[10px] text-muted-foreground">O e-mail não pode ser alterado.</p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  <Calendar className="mr-1 inline h-3 w-3" />
                  Membro desde
                </label>
                <input type="text" value={createdAt} disabled className={`${inputCls} opacity-60`} />
              </div>
            </div>
          </div>

          {/* Change Password */}
          <div className="rounded-xl border bg-card p-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Lock className="h-4 w-4 text-primary" />
              Alterar Senha
            </h3>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Senha Atual
                </label>
                <div className="relative">
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Sua senha atual"
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Nova Senha
                  </label>
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Confirmar Nova Senha
                  </label>
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {showPasswords ? 'Ocultar senhas' : 'Mostrar senhas'}
                </button>

                <button
                  type="submit"
                  disabled={changingPassword || !newPassword || !confirmPassword}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  <Lock className="h-3.5 w-3.5" />
                  {changingPassword ? 'Alterando...' : 'Alterar Senha'}
                </button>
              </div>
            </form>
          </div>

          {/* Session */}
          <div className="rounded-xl border bg-card p-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <LogOut className="h-4 w-4 text-primary" />
              Sessão
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Saia de todas as sessões ativas em todos os dispositivos.
            </p>
            <button
              onClick={handleSignOutAll}
              className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair de Todas as Sessões
            </button>
          </div>
        </div>

        {/* Sidebar Column */}
        <div className="space-y-6">
          {/* Projects */}
          <div className="rounded-xl border bg-card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Building2 className="h-4 w-4 text-primary" />
              Projetos Vinculados
            </h3>

            {allRoles.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum projeto vinculado.</p>
            ) : (
              <div className="space-y-2">
                {allRoles.map((entry) => {
                  const company = companies.find(c => c.id === entry.company_id)
                  return (
                    <div key={entry.company_id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                            <Building2 className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div>
                            <p className="text-xs font-medium">
                              {company?.nome_fantasia ?? company?.razao_social ?? entry.company_id.slice(0, 8)}
                            </p>
                            <p className="text-[10px] text-muted-foreground capitalize">
                              {ROLE_LABELS[entry.role]}
                            </p>
                          </div>
                        </div>
                        <CheckCircle2 className={`h-4 w-4 ${entry.active ? 'text-emerald-500' : 'text-muted-foreground/30'}`} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Quick Info */}
          <div className="rounded-xl border bg-card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Shield className="h-4 w-4 text-primary" />
              Informações Rápidas
            </h3>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">ID do Usuário</span>
                <span className="font-mono text-[10px]">{user?.id?.slice(0, 12)}...</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Provedor de Auth</span>
                <span className="font-medium">{user?.app_metadata?.provider ?? 'email'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Projetos</span>
                <span className="font-medium">{allRoles.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Último Login</span>
                <span className="font-medium">
                  {user?.last_sign_in_at
                    ? new Date(user.last_sign_in_at).toLocaleDateString('pt-BR')
                    : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
