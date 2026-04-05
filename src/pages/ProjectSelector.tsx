import { useNavigate } from 'react-router-dom'
import { useProject } from '@/contexts/ProjectContext'
import { Building2, Plus, ChevronRight, MapPin, Home, CheckCircle2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export default function ProjectSelector() {
  const { companies, selectCompany, loading } = useProject()
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  const handleSelect = (id: string) => {
    selectCompany(id)
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Seus Projetos</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Selecione um projeto para acessar ou crie um novo
          </p>
        </div>

        <div className="space-y-3">
          {companies.map((company) => (
            <button
              key={company.id}
              onClick={() => handleSelect(company.id)}
              className="group flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-md"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold">
                  {company.nome_fantasia ?? company.razao_social}
                </h3>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  {company.municipio && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {company.municipio}/{company.estado}
                    </span>
                  )}
                  {company.qtd_casas > 0 && (
                    <span className="flex items-center gap-1">
                      <Home className="h-3 w-3" />
                      {company.qtd_casas} casas
                    </span>
                  )}
                  {company.faturamento_contrato > 0 && (
                    <span>{formatCurrency(company.faturamento_contrato)}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  company.status === 'ativo'
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : company.status === 'concluido'
                    ? 'bg-blue-500/10 text-blue-600'
                    : 'bg-amber-500/10 text-amber-600'
                }`}>
                  <CheckCircle2 className="h-3 w-3" />
                  {company.status === 'ativo' ? 'Ativo' : company.status === 'concluido' ? 'Concluído' : 'Suspenso'}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          ))}

          {/* New project button */}
          <button
            onClick={() => navigate('/onboarding')}
            className="flex w-full items-center gap-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 text-left transition-all hover:border-primary hover:bg-primary/10"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Plus className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-primary">Criar Novo Projeto</h3>
              <p className="text-xs text-muted-foreground">Registrar uma nova obra</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
