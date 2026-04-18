import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProject } from '@/contexts/ProjectContext'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  Settings, Save, Building2, MapPin, Home, DollarSign,
  Users, ArrowRight,
} from 'lucide-react'
import { useUserRole } from '@/hooks/useUserRole'
import { toast } from 'sonner'
import { useTour } from '@/lib/tours/useTour'
import { pageTours } from '@/lib/tours/page-tours'

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
]



export default function Configuracoes() {
  const { restartTour } = useTour('configuracoes', pageTours.configuracoes)

  const { currentCompany, refreshCompanies } = useProject()
  const { isAdmin } = useUserRole()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)

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
    prazo_recebimento_dias: '',
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
        prazo_recebimento_dias: currentCompany.prazo_recebimento_dias?.toString() ?? '30',
      })
    }
  }, [currentCompany])



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
        prazo_recebimento_dias: form.prazo_recebimento_dias ? parseInt(form.prazo_recebimento_dias) : 30,
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

  if (!currentCompany) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-sm text-muted-foreground">Selecione um projeto primeiro</p>
      </div>
    )
  }



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
          <div className="grid gap-4 md:grid-cols-4">
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
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Prazo Rec. Obras (dias)</label>
              <input type="number" value={form.prazo_recebimento_dias} onChange={(e) => updateField('prazo_recebimento_dias', e.target.value)} disabled={!isAdmin} className={inputCls} />
            </div>
          </div>
        </div>

        {/* Team shortcut */}
        <div className="rounded-xl border bg-card p-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-primary" />
            Equipe
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Gerencie membros, permissões e convites na página dedicada.
          </p>
          <button
            onClick={() => navigate('/usuarios')}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            <Users className="h-4 w-4" />
            Gerenciar Equipe
            <ArrowRight className="h-3.5 w-3.5 ml-auto" />
          </button>
        </div>
      </div>
    </div>
  )
}
