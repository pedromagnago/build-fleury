import { useState, useEffect, useCallback } from 'react'
import { useProject } from '@/contexts/ProjectContext'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  Settings, Save, Building2, MapPin, Home, DollarSign,
  Users, Mail, UserPlus, Trash2, CheckCircle2, Clock,
  AlertCircle, Send,
} from 'lucide-react'
import { useUserRole } from '@/hooks/useUserRole'
import { toast } from 'sonner'
import { useTour } from '@/lib/tours/useTour'
import { pageTours } from '@/lib/tours/page-tours'

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
]

interface TeamMember {
  id: string
  user_id: string
  role: string
  active: boolean
  invited_email?: string | null
  email?: string
}

interface Invite {
  id: string
  invited_email: string
  role: string
  active: boolean
  created_at: string
  is_resolved: boolean
}

export default function Configuracoes() {
  const { restartTour } = useTour('configuracoes', pageTours.configuracoes)

  const { currentCompany, refreshCompanies } = useProject()
  const { role } = useUserRole()
  const [saving, setSaving] = useState(false)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('operador')
  const [inviting, setInviting] = useState(false)

  const [form, setForm] = useState({
    razao_social: '',
    nome_fantasia: '',
    cnpj: '',
    municipio: '',
    estado: '',
    qtd_casas: '',
    area_casa_m2: '',
    data_inicio_obras: '',
    saldo_inicial_caixa: '',
    faturamento_contrato: '',
    custo_total_contrato: '',
  })

  useEffect(() => {
    if (currentCompany) {
      setForm({
        razao_social: currentCompany.razao_social,
        nome_fantasia: currentCompany.nome_fantasia ?? '',
        cnpj: currentCompany.cnpj ?? '',
        municipio: currentCompany.municipio ?? '',
        estado: currentCompany.estado ?? '',
        qtd_casas: currentCompany.qtd_casas?.toString() ?? '',
        area_casa_m2: currentCompany.area_casa_m2?.toString() ?? '',
        data_inicio_obras: currentCompany.data_inicio_obras ?? '',
        saldo_inicial_caixa: currentCompany.saldo_inicial_caixa?.toString() ?? '',
        faturamento_contrato: currentCompany.faturamento_contrato?.toString() ?? '',
        custo_total_contrato: currentCompany.custo_total_contrato?.toString() ?? '',
      })
      fetchTeamMembers(currentCompany.id)
      fetchInvites(currentCompany.id)
    }
  }, [currentCompany])

  const fetchTeamMembers = async (companyId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('id, user_id, role, active, invited_email')
      .eq('company_id', companyId)
      .is('invited_email', null)
      .order('created_at')

    if (data) setTeamMembers(data as TeamMember[])
  }

  const fetchInvites = useCallback(async (companyId: string) => {
    const { data, error } = await supabase.rpc('list_invites', { _company_id: companyId })
    if (data && !error) setInvites(data as Invite[])
  }, [])

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    if (!currentCompany) return
    setSaving(true)

    const { error } = await supabase
      .from('companies')
      .update({
        razao_social: form.razao_social.trim(),
        nome_fantasia: form.nome_fantasia.trim() || null,
        cnpj: form.cnpj.trim() || null,
        municipio: form.municipio.trim() || null,
        estado: form.estado || null,
        qtd_casas: form.qtd_casas ? parseInt(form.qtd_casas) : 0,
        area_casa_m2: form.area_casa_m2 ? parseFloat(form.area_casa_m2) : null,
        data_inicio_obras: form.data_inicio_obras || null,
        saldo_inicial_caixa: form.saldo_inicial_caixa ? parseFloat(form.saldo_inicial_caixa) : 0,
        faturamento_contrato: form.faturamento_contrato ? parseFloat(form.faturamento_contrato) : 0,
        custo_total_contrato: form.custo_total_contrato ? parseFloat(form.custo_total_contrato) : 0,
      })
      .eq('id', currentCompany.id)

    if (error) {
      toast.error('Erro ao salvar: ' + error.message)
    } else {
      toast.success('Configurações salvas!')
      await refreshCompanies()
    }

    setSaving(false)
  }

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase()
    if (!email || !currentCompany) return

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Email inválido')
      return
    }

    setInviting(true)

    try {
      // 1. Create the user_role entry (or link existing user)
      const { data: result, error: rpcError } = await supabase.rpc('invite_user', {
        _email: email,
        _role: inviteRole,
        _company_id: currentCompany.id,
      })

      if (rpcError) {
        toast.error('Erro ao convidar: ' + rpcError.message)
        setInviting(false)
        return
      }

      const res = result as { status: string; message: string }

      if (res.status === 'already_invited' || res.status === 'already_member') {
        toast.warning(res.message)
        setInviting(false)
        return
      }

      // 2. Send magic link via Supabase Auth
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      })

      if (otpError) {
        // The role entry was created, but the email failed to send
        toast.warning('Usuário vinculado ao projeto, mas o e-mail de convite pode não ter sido enviado.')
        console.error('OTP error:', otpError)
      } else {
        toast.success(`Convite enviado para ${email}!`)
      }

      // Refresh data
      setInviteEmail('')
      fetchInvites(currentCompany.id)
      fetchTeamMembers(currentCompany.id)
    } catch (err) {
      toast.error('Erro inesperado ao enviar convite')
      console.error(err)
    }

    setInviting(false)
  }

  const handleRevokeInvite = async (inviteId: string, email: string) => {
    if (!window.confirm(`Revogar convite de ${email}?`)) return

    const { error } = await supabase.rpc('revoke_invite', { _role_id: inviteId })
    if (error) {
      toast.error('Erro ao revogar: ' + error.message)
    } else {
      toast.success('Convite revogado')
      if (currentCompany) {
        fetchInvites(currentCompany.id)
        fetchTeamMembers(currentCompany.id)
      }
    }
  }

  const handleResendInvite = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    })

    if (error) {
      toast.error('Erro ao reenviar: ' + error.message)
    } else {
      toast.success(`Link reenviado para ${email}`)
    }
  }

  if (!currentCompany) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-sm text-muted-foreground">Selecione um projeto primeiro</p>
      </div>
    )
  }

  const isAdmin = role === 'super_admin' || role === 'supervisor'

  const inputCls = 'w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:opacity-50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

  return (
    <div>
      <PageHeader title="Configurações" description="Configurações do projeto" icon={Settings} onHelp={restartTour}>
        {isAdmin && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        )}
      </PageHeader>

      <div className="space-y-6">
        {/* Company Info */}
        <div id="tour-dados-empresa" className="rounded-xl border bg-card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <Building2 className="h-4 w-4 text-primary" />
            Dados da Empresa
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Razão Social</label>
              <input type="text" value={form.razao_social} onChange={(e) => updateField('razao_social', e.target.value)} disabled={!isAdmin} className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Nome Fantasia</label>
              <input type="text" value={form.nome_fantasia} onChange={(e) => updateField('nome_fantasia', e.target.value)} disabled={!isAdmin} className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">CNPJ</label>
              <input type="text" value={form.cnpj} onChange={(e) => updateField('cnpj', e.target.value)} disabled={!isAdmin} placeholder="00.000.000/0000-00" className={inputCls} />
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="rounded-xl border bg-card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <MapPin className="h-4 w-4 text-primary" />
            Localização
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Município</label>
              <input type="text" value={form.municipio} onChange={(e) => updateField('municipio', e.target.value)} disabled={!isAdmin} className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Estado</label>
              <select value={form.estado} onChange={(e) => updateField('estado', e.target.value)} disabled={!isAdmin} className={inputCls}>
                <option value="">Selecione</option>
                {ESTADOS_BR.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Construction */}
        <div className="rounded-xl border bg-card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <Home className="h-4 w-4 text-primary" />
            Dados da Obra
          </h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Qtd. Casas</label>
              <input type="number" value={form.qtd_casas} onChange={(e) => updateField('qtd_casas', e.target.value)} disabled={!isAdmin} className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Área/Casa (m²)</label>
              <input type="number" step="0.01" value={form.area_casa_m2} onChange={(e) => updateField('area_casa_m2', e.target.value)} disabled={!isAdmin} className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Início Obras</label>
              <input type="date" value={form.data_inicio_obras} onChange={(e) => updateField('data_inicio_obras', e.target.value)} disabled={!isAdmin} className={inputCls} />
            </div>
          </div>
        </div>

        {/* Financial */}
        <div className="rounded-xl border bg-card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <DollarSign className="h-4 w-4 text-primary" />
            Dados Financeiros
          </h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Faturamento Contrato (R$)</label>
              <input type="number" step="0.01" value={form.faturamento_contrato} onChange={(e) => updateField('faturamento_contrato', e.target.value)} disabled={!isAdmin} className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Custo Total (R$)</label>
              <input type="number" step="0.01" value={form.custo_total_contrato} onChange={(e) => updateField('custo_total_contrato', e.target.value)} disabled={!isAdmin} className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Saldo Inicial (R$)</label>
              <input type="number" step="0.01" value={form.saldo_inicial_caixa} onChange={(e) => updateField('saldo_inicial_caixa', e.target.value)} disabled={!isAdmin} className={inputCls} />
            </div>
          </div>
        </div>

        {/* Team & Invites */}
        <div className="rounded-xl border bg-card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-primary" />
            Equipe & Convites
          </h3>

          {/* Existing members */}
          <div className="space-y-2">
            {teamMembers.map((member) => (
              <div key={member.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {member.user_id.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{member.email ?? member.user_id.slice(0, 8) + '...'}</p>
                    <p className="text-xs text-muted-foreground capitalize">{member.role.replace('_', ' ')}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  member.active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'
                }`}>
                  {member.active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            ))}
          </div>

          {/* Pending invites */}
          {invites.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Convites Pendentes
              </p>
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
                          onClick={() => handleRevokeInvite(inv.id, inv.invited_email)}
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

          {/* Invite form */}
          {isAdmin && (
            <div className="mt-4 rounded-lg border bg-muted/30 p-4">
              <p className="mb-3 flex items-center gap-2 text-xs font-semibold">
                <UserPlus className="h-3.5 w-3.5 text-primary" />
                Convidar novo membro
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <div className="relative">
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
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  <UserPlus className="h-4 w-4" />
                  {inviting ? 'Enviando...' : 'Convidar'}
                </button>
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                O convidado receberá um link de acesso por e-mail. Se já tiver conta, será vinculado automaticamente ao projeto.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
