import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProject } from '@/contexts/ProjectContext'
import { HardHat, Building2, MapPin, Home, Calendar, DollarSign, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
]

export default function Onboarding() {
  const { createProject, companies, loading } = useProject()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)

  // Redirecionamento removido para que o usuário possa criar múltiplas empresas.
  // if (loading) and companies.length check is handled in the UI gracefully.

  const [form, setForm] = useState({
    razao_social: '',
    nome_fantasia: '',
    municipio: '',
    estado: '',
    qtd_casas: '',
    area_casa_m2: '',
    data_inicio_obras: '',
    saldo_inicial_caixa: '',
    faturamento_contrato: '',
    custo_total_contrato: '',
  })

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.razao_social.trim()) {
      toast.error('Razão social é obrigatória')
      return
    }

    setSubmitting(true)

    const id = await createProject({
      razao_social: form.razao_social.trim(),
      nome_fantasia: form.nome_fantasia.trim() || undefined,
      municipio: form.municipio.trim() || undefined,
      estado: form.estado || undefined,
      qtd_casas: form.qtd_casas ? parseInt(form.qtd_casas) : undefined,
      area_casa_m2: form.area_casa_m2 ? parseFloat(form.area_casa_m2) : undefined,
      data_inicio_obras: form.data_inicio_obras || undefined,
      saldo_inicial_caixa: form.saldo_inicial_caixa ? parseFloat(form.saldo_inicial_caixa) : undefined,
      faturamento_contrato: form.faturamento_contrato ? parseFloat(form.faturamento_contrato) : undefined,
      custo_total_contrato: form.custo_total_contrato ? parseFloat(form.custo_total_contrato) : undefined,
    })

    if (id) {
      toast.success('Projeto criado com sucesso!')
      navigate('/dashboard')
    } else {
      toast.error('Erro ao criar projeto. Tente novamente.')
    }

    setSubmitting(false)
  }

  // Show loader while checking if user already has companies
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-12">
        {/* Escape link if user navigated here manually */}
        {companies.length > 0 && (
          <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
            <p className="text-sm text-muted-foreground">
              Você já tem {companies.length} projeto(s).{' '}
              <button onClick={() => navigate('/dashboard')} className="font-medium text-primary underline">
                Ir para o Dashboard →
              </button>
            </p>
          </div>
        )}

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25">
            <HardHat className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Criar Novo Projeto</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Preencha os dados da obra para começar o controle orçamentário
          </p>
        </div>

        {/* Form Card */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Company Info */}
          <div className="rounded-xl border bg-card p-6">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Building2 className="h-4 w-4 text-primary" />
              Dados da Empresa
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="razao_social" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Razão Social *
                </label>
                <input
                  id="razao_social"
                  type="text"
                  value={form.razao_social}
                  onChange={(e) => updateField('razao_social', e.target.value)}
                  placeholder="Ex: Construtora Fleury Ltda"
                  required
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label htmlFor="nome_fantasia" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Nome Fantasia
                </label>
                <input
                  id="nome_fantasia"
                  type="text"
                  value={form.nome_fantasia}
                  onChange={(e) => updateField('nome_fantasia', e.target.value)}
                  placeholder="Ex: Residencial Primavera"
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="rounded-xl border bg-card p-6">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <MapPin className="h-4 w-4 text-primary" />
              Localização
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="municipio" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Município
                </label>
                <input
                  id="municipio"
                  type="text"
                  value={form.municipio}
                  onChange={(e) => updateField('municipio', e.target.value)}
                  placeholder="Ex: São Paulo"
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label htmlFor="estado" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Estado
                </label>
                <select
                  id="estado"
                  value={form.estado}
                  onChange={(e) => updateField('estado', e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Selecione</option>
                  {ESTADOS_BR.map((uf) => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Project Details */}
          <div className="rounded-xl border bg-card p-6">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Home className="h-4 w-4 text-primary" />
              Dados da Obra
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="qtd_casas" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Quantidade de Casas
                </label>
                <input
                  id="qtd_casas"
                  type="number"
                  min="0"
                  value={form.qtd_casas}
                  onChange={(e) => updateField('qtd_casas', e.target.value)}
                  placeholder="Ex: 120"
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label htmlFor="area_casa_m2" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Área por Casa (m²)
                </label>
                <input
                  id="area_casa_m2"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.area_casa_m2}
                  onChange={(e) => updateField('area_casa_m2', e.target.value)}
                  placeholder="Ex: 45.50"
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor="data_inicio_obras" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                Data Início das Obras
              </label>
              <input
                id="data_inicio_obras"
                type="date"
                value={form.data_inicio_obras}
                onChange={(e) => updateField('data_inicio_obras', e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Financial */}
          <div className="rounded-xl border bg-card p-6">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <DollarSign className="h-4 w-4 text-primary" />
              Dados Financeiros
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="faturamento_contrato" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Faturamento do Contrato (R$)
                  </label>
                  <input
                    id="faturamento_contrato"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.faturamento_contrato}
                    onChange={(e) => updateField('faturamento_contrato', e.target.value)}
                    placeholder="0,00"
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label htmlFor="custo_total_contrato" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Custo Total Estimado (R$)
                  </label>
                  <input
                    id="custo_total_contrato"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.custo_total_contrato}
                    onChange={(e) => updateField('custo_total_contrato', e.target.value)}
                    placeholder="0,00"
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="saldo_inicial_caixa" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Saldo Inicial de Caixa (R$)
                </label>
                <input
                  id="saldo_inicial_caixa"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.saldo_inicial_caixa}
                  onChange={(e) => updateField('saldo_inicial_caixa', e.target.value)}
                  placeholder="0,00"
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                Criando projeto...
              </>
            ) : (
              <>
                Criar Projeto
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
