import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { HardHat, Eye, EyeOff, Mail, Lock, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ROLE_LABELS, type UserRole } from '@/hooks/useUserRole'

type LookupResult =
  | { valid: true; email: string; role: UserRole; company_name: string | null; expires_at: string; user_exists: boolean }
  | { valid: false; reason: 'not_found' | 'revoked' | 'used' | 'expired' }

const REASON_LABEL: Record<string, { title: string; desc: string }> = {
  not_found: { title: 'Convite inválido', desc: 'Este link de convite não existe ou foi removido.' },
  revoked:   { title: 'Convite revogado', desc: 'Este convite foi cancelado pelo administrador.' },
  used:      { title: 'Convite já utilizado', desc: 'Você já criou sua conta. Faça login normalmente.' },
  expired:   { title: 'Convite expirado', desc: 'O prazo deste convite venceu. Solicite um novo ao administrador.' },
}

export default function AceitarConvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()

  const [lookup, setLookup] = useState<LookupResult | null>(null)
  const [loadingLookup, setLoadingLookup] = useState(true)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!token) {
      setLookup({ valid: false, reason: 'not_found' })
      setLoadingLookup(false)
      return
    }
    ;(async () => {
      const { data, error } = await supabase.rpc('accept_invite_lookup', { _token: token })
      if (cancelled) return
      if (error || !data) {
        setLookup({ valid: false, reason: 'not_found' })
      } else {
        setLookup(data as LookupResult)
      }
      setLoadingLookup(false)
    })()
    return () => { cancelled = true }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !lookup || !lookup.valid) return

    setSubmitError('')

    if (password.length < 8) {
      setSubmitError('A senha precisa ter no mínimo 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setSubmitError('As senhas não coincidem.')
      return
    }

    setSubmitting(true)

    try {
      // Garante sessão limpa antes do signUp (caso outro usuário esteja logado).
      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData.session && sessionData.session.user.email?.toLowerCase() !== lookup.email.toLowerCase()) {
        await supabase.auth.signOut()
      }

      let authError: Error | null = null

      if (lookup.user_exists) {
        const { error } = await supabase.auth.signInWithPassword({
          email: lookup.email,
          password,
        })
        authError = error as Error | null
        if (authError) {
          setSubmitError('Você já tem conta com este email. Confirme a senha correta para vincular ao projeto.')
          setSubmitting(false)
          return
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email: lookup.email,
          password,
        })
        authError = error as Error | null
        if (authError) {
          if (/already/i.test(authError.message)) {
            setSubmitError('Já existe uma conta com este email. Use sua senha existente para entrar e o convite será aplicado.')
          } else {
            setSubmitError(authError.message)
          }
          setSubmitting(false)
          return
        }
      }

      const { error: acceptError } = await supabase.rpc('accept_invite', { _token: token })
      if (acceptError) {
        setSubmitError(acceptError.message)
        setSubmitting(false)
        return
      }

      toast.success('Convite aceito! Bem-vindo ao projeto.')
      navigate('/cronograma', { replace: true })
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Erro inesperado')
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/25">
            <HardHat className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-white">Build Fleury</h1>
          <p className="mt-1 text-xs text-white/50">Controle Orçamentário de Obras</p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          {loadingLookup && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-white/40" />
            </div>
          )}

          {!loadingLookup && lookup && !lookup.valid && (
            <>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h2 className="mb-1 text-lg font-semibold text-white">
                {REASON_LABEL[lookup.reason]?.title ?? 'Convite indisponível'}
              </h2>
              <p className="mb-6 text-sm text-white/60">
                {REASON_LABEL[lookup.reason]?.desc ?? 'Verifique o link com quem te enviou o convite.'}
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Ir para o login
              </button>
            </>
          )}

          {!loadingLookup && lookup && lookup.valid && (
            <>
              <div className="mb-4 flex items-start gap-3 rounded-lg bg-emerald-500/10 px-3 py-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <div className="text-xs">
                  <p className="font-medium text-emerald-300">Você foi convidado</p>
                  <p className="mt-0.5 text-emerald-200/70">
                    para <span className="font-medium">{lookup.company_name ?? 'o projeto'}</span> como{' '}
                    <span className="font-medium">{ROLE_LABELS[lookup.role] ?? lookup.role}</span>.
                  </p>
                </div>
              </div>

              <h2 className="mb-1 text-lg font-semibold text-white">
                {lookup.user_exists ? 'Entrar e vincular ao projeto' : 'Crie sua conta'}
              </h2>
              <p className="mb-6 text-sm text-white/50">
                {lookup.user_exists
                  ? 'Já existe uma conta com este email. Informe sua senha atual.'
                  : 'Defina uma senha para acessar a plataforma.'}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-white/70">E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                    <input
                      type="email"
                      value={lookup.email}
                      readOnly
                      className="w-full cursor-not-allowed rounded-lg border border-white/10 bg-white/[0.03] py-2.5 pl-9 pr-3 text-sm text-white/70"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-white/70">
                    {lookup.user_exists ? 'Senha' : 'Defina uma senha'}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      required
                      minLength={8}
                      autoComplete={lookup.user_exists ? 'current-password' : 'new-password'}
                      className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-9 pr-10 text-sm text-white placeholder:text-white/30 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {!lookup.user_exists && (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-white/70">Confirme a senha</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Repita a senha"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                )}

                {submitError && (
                  <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-red-400">
                    {submitError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {submitting
                    ? 'Aceitando convite...'
                    : lookup.user_exists ? 'Entrar e aceitar convite' : 'Criar conta e aceitar'}
                </button>

                <p className="text-center text-[11px] text-white/40">
                  Expira em {new Date(lookup.expires_at).toLocaleDateString('pt-BR')}.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}