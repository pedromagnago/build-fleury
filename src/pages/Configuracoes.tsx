import { useState, useEffect } from 'react'
import { useProject } from '@/contexts/ProjectContext'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import { Settings, Save, Building2, MapPin, Home, DollarSign, Users, Mail, UserPlus } from 'lucide-react'
import { useUserRole } from '@/hooks/useUserRole'
import { toast } from 'sonner'

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
]

interface TeamMember {
  id: string
  user_id: string
  role: string
  active: boolean
  email?: string
}

export default function Configuracoes() {
  const { currentCompany, refreshCompanies } = useProject()
  const { role } = useUserRole()
  const [saving, setSaving] = useState(false)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('operador')
  const [_inviting, setInviting] = useState(false)

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
    }
  }, [currentCompany])

  const fetchTeamMembers = async (companyId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('id, user_id, role, active')
      .eq('company_id', companyId)
      .order('created_at')

    if (data) {
      setTeamMembers(data as TeamMember[])
    }
  }

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
    if (!inviteEmail.trim() || !currentCompany) return
    setInviting(true)

    toast.info(`Convite para ${inviteEmail} será implementado com Supabase Edge Functions`)
    setInviteEmail('')
    setInviting(false)
  }

  if (!currentCompany) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-sm text-muted-foreground">Selecione um projeto primeiro</p>
      </div>
    )
  }

  const isAdmin = role === 'super_admin' || role === 'supervisor'

  return (
    <div>
      <PageHeader title="Configurações" description="Configurações do projeto" icon={Settings}>
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
        <div className="rounded-xl border bg-card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <Building2 className="h-4 w-4 text-primary" />
            Dados da Empresa
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Razão Social</label>
              <input
                type="text"
                value={form.razao_social}
                onChange={(e) => updateField('razao_social', e.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:opacity-50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Nome Fantasia</label>
              <input
                type="text"
                value={form.nome_fantasia}
                onChange={(e) => updateField('nome_fantasia', e.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:opacity-50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">CNPJ</label>
              <input
                type="text"
                value={form.cnpj}
                onChange={(e) => updateField('cnpj', e.target.value)}
                disabled={!isAdmin}
                placeholder="00.000.000/0000-00"
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:opacity-50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
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
              <input
                type="text"
                value={form.municipio}
                onChange={(e) => updateField('municipio', e.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:opacity-50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Estado</label>
              <select
                value={form.estado}
                onChange={(e) => updateField('estado', e.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:opacity-50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Selecione</option>
                {ESTADOS_BR.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
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
              <input
                type="number"
                value={form.qtd_casas}
                onChange={(e) => updateField('qtd_casas', e.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:opacity-50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Área/Casa (m²)</label>
              <input
                type="number"
                step="0.01"
                value={form.area_casa_m2}
                onChange={(e) => updateField('area_casa_m2', e.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:opacity-50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Início Obras</label>
              <input
                type="date"
                value={form.data_inicio_obras}
                onChange={(e) => updateField('data_inicio_obras', e.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:opacity-50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
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
              <input
                type="number"
                step="0.01"
                value={form.faturamento_contrato}
                onChange={(e) => updateField('faturamento_contrato', e.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:opacity-50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Custo Total (R$)</label>
              <input
                type="number"
                step="0.01"
                value={form.custo_total_contrato}
                onChange={(e) => updateField('custo_total_contrato', e.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:opacity-50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Saldo Inicial (R$)</label>
              <input
                type="number"
                step="0.01"
                value={form.saldo_inicial_caixa}
                onChange={(e) => updateField('saldo_inicial_caixa', e.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:opacity-50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* Team */}
        <div className="rounded-xl border bg-card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-primary" />
            Equipe ({teamMembers.length} membro{teamMembers.length !== 1 ? 's' : ''})
          </h3>

          <div className="space-y-2">
            {teamMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between rounded-lg border px-4 py-3"
              >
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
                  member.active
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : 'bg-red-500/10 text-red-600'
                }`}>
                  {member.active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            ))}
          </div>

          {/* Invite */}
          {isAdmin && (
            <div className="mt-4 flex gap-2">
              <div className="flex-1">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
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
              </select>
              <button
                onClick={handleInvite}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <UserPlus className="h-4 w-4" />
                Convidar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
