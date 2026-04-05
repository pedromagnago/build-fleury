import { useQuery } from '@tanstack/react-query'
import { useProject, type Company } from '@/contexts/ProjectContext'
import { supabase } from '@/lib/supabase'
import {
  Building2, Landmark, CalendarDays, ShoppingCart,
  Truck, ClipboardList, Receipt, BarChart3,
  type LucideIcon,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────
export interface OnboardingStep {
  id: string
  label: string
  description: string
  weight: number
  status: 'done' | 'partial' | 'pending'
  detail: string | null
  link: string
  icon: LucideIcon
}

export interface OnboardingStatus {
  steps: OnboardingStep[]
  progress: number
  isComplete: boolean
  isDismissed: boolean
}

// ─── Helpers ──────────────────────────────────────────
function checkProjectData(company: Company): { status: 'done' | 'partial' | 'pending'; detail: string | null } {
  const fields = [
    { name: 'Razão social', ok: !!company.razao_social },
    { name: 'Município', ok: !!company.municipio },
    { name: 'Data início', ok: !!company.data_inicio_obras },
    { name: 'Saldo inicial', ok: (company.saldo_inicial_caixa ?? 0) > 0 },
    { name: 'Qtd casas', ok: (company.qtd_casas ?? 0) > 0 },
  ]
  const filled = fields.filter((f) => f.ok).length
  if (filled === fields.length) return { status: 'done', detail: null }
  if (filled > 0) {
    const missing = fields.filter((f) => !f.ok).map((f) => f.name)
    return { status: 'partial', detail: `Faltam: ${missing.join(', ')}` }
  }
  return { status: 'pending', detail: null }
}

function countStatus(count: number, label: string): { status: 'done' | 'pending'; detail: string | null } {
  if (count > 0) return { status: 'done', detail: `${count} ${label}` }
  return { status: 'pending', detail: null }
}

// ─── Main Hook ────────────────────────────────────────
export function useOnboardingStatus(): OnboardingStatus & { isLoading: boolean } {
  const { currentCompany } = useProject()
  const cid = currentCompany?.id

  const { data, isLoading } = useQuery({
    queryKey: ['onboarding-status', cid],
    queryFn: async () => {
      if (!cid) throw new Error('No company')

      const [etapasRes, itensRes, fornecedoresRes, pedidosRes, medicoesRes, distribuicoesRes, contasRes] = await Promise.all([
        supabase.from('etapas').select('*', { count: 'exact', head: true }).eq('company_id', cid),
        supabase.from('itens_compra').select('*', { count: 'exact', head: true }).eq('company_id', cid).is('deleted_at', null),
        supabase.from('fornecedores').select('*', { count: 'exact', head: true }).eq('company_id', cid),
        supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('company_id', cid),
        supabase.from('medicoes').select('*', { count: 'exact', head: true }).eq('company_id', cid),
        supabase.from('cronograma_distribuicao').select('*', { count: 'exact', head: true }).eq('company_id', cid),
        supabase.from('contas_bancarias').select('*', { count: 'exact', head: true }).eq('company_id', cid).eq('ativa', true),
      ])

      return {
        etapas: etapasRes.count ?? 0,
        itens: itensRes.count ?? 0,
        fornecedores: fornecedoresRes.count ?? 0,
        pedidos: pedidosRes.count ?? 0,
        medicoes: medicoesRes.count ?? 0,
        distribuicoes: distribuicoesRes.count ?? 0,
        contas: contasRes.count ?? 0,
      }
    },
    enabled: !!cid,
    staleTime: 30_000,
  })

  const counts = data ?? { etapas: 0, itens: 0, fornecedores: 0, pedidos: 0, medicoes: 0, distribuicoes: 0, contas: 0 }

  const projectCheck = currentCompany ? checkProjectData(currentCompany) : { status: 'pending' as const, detail: null }

  const steps: OnboardingStep[] = [
    {
      id: 'project-data',
      label: 'Dados do Projeto',
      description: 'Configure informações do projeto',
      weight: 10,
      ...projectCheck,
      link: '/configuracoes',
      icon: Building2,
    },
    {
      id: 'bank-accounts',
      label: 'Contas Bancárias',
      description: 'Cadastre pelo menos 1 conta ativa',
      weight: 5,
      ...countStatus(counts.contas, 'conta(s) ativa(s)'),
      link: '/configuracoes',
      icon: Landmark,
    },
    {
      id: 'etapas',
      label: 'Etapas do Cronograma',
      description: 'Importe as etapas da obra',
      weight: 20,
      ...countStatus(counts.etapas, 'etapa(s)'),
      link: '/importacao',
      icon: CalendarDays,
    },
    {
      id: 'itens',
      label: 'Itens de Compra',
      description: 'Importe os itens orçamentários',
      weight: 20,
      ...countStatus(counts.itens, 'iten(s)'),
      link: '/importacao',
      icon: ShoppingCart,
    },
    {
      id: 'fornecedores',
      label: 'Fornecedores',
      description: 'Cadastre seus fornecedores',
      weight: 10,
      ...countStatus(counts.fornecedores, 'fornecedor(es)'),
      link: '/importacao',
      icon: Truck,
    },
    {
      id: 'pedidos',
      label: 'Pedidos de Compra',
      description: 'Gere pedidos para os itens',
      weight: 15,
      ...countStatus(counts.pedidos, 'pedido(s)'),
      link: '/compras',
      icon: ClipboardList,
    },
    {
      id: 'medicoes',
      label: 'Medições Contratuais',
      description: 'Configure as medições planejadas',
      weight: 10,
      ...countStatus(counts.medicoes, 'medição(ões)'),
      link: '/importacao',
      icon: Receipt,
    },
    {
      id: 'distribuicao',
      label: 'Distribuição Cronograma',
      description: 'Preencha a distribuição de casas',
      weight: 10,
      ...countStatus(counts.distribuicoes, 'distribuição(ões)'),
      link: '/importacao',
      icon: BarChart3,
    },
  ]

  const progress = steps.reduce((sum, s) => {
    if (s.status === 'done') return sum + s.weight
    if (s.status === 'partial') return sum + s.weight * 0.5
    return sum
  }, 0)

  const isComplete = progress >= 100
  const isDismissed = !!(currentCompany?.config as Record<string, unknown>)?.onboarding_dismissed

  return {
    steps,
    progress: Math.min(Math.round(progress), 100),
    isComplete,
    isDismissed: isDismissed && isComplete,
    isLoading,
  }
}
