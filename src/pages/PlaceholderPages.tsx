import { PageHeader } from '@/components/ui/PageHeader'
import {
  CalendarRange, ShoppingCart, CreditCard, FileText, Shield,
  TrendingUp, Ruler, ArrowLeftRight, FlaskConical, BarChart3, Upload,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

function PlaceholderPage({ title, description, icon: Icon, phase }: {
  title: string
  description: string
  icon: LucideIcon
  phase: string
}) {
  return (
    <div>
      <PageHeader title={title} description={description} icon={Icon} />
      <div className="flex min-h-[400px] items-center justify-center rounded-xl border border-dashed border-border">
        <div className="text-center">
          <Icon className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">{title} em construção</p>
          <p className="mt-1 text-xs text-muted-foreground/60">Será implementado na {phase}</p>
        </div>
      </div>
    </div>
  )
}

export function Cronograma() {
  return <PlaceholderPage title="Cronograma" description="Gantt de execução da obra" icon={CalendarRange} phase="Fase 2" />
}

export function Compras() {
  return <PlaceholderPage title="Compras" description="Itens, pedidos e fornecedores" icon={ShoppingCart} phase="Fase 2" />
}

export function Pagamentos() {
  return <PlaceholderPage title="Pagamentos" description="Parcelas e agenda de pagamentos" icon={CreditCard} phase="Fase 3" />
}

export function Documentos() {
  return <PlaceholderPage title="Documentos" description="Upload e processamento por IA" icon={FileText} phase="Fase 3" />
}

export function Auditoria() {
  return <PlaceholderPage title="Auditoria" description="Fila de auditoria das classificações IA" icon={Shield} phase="Fase 3" />
}

export function AvancoFisico() {
  return <PlaceholderPage title="Avanço Físico" description="Registro de progresso por etapa" icon={TrendingUp} phase="Fase 4" />
}

export function Medicoes() {
  return <PlaceholderPage title="Medições" description="Receitas contratuais e medições" icon={Ruler} phase="Fase 4" />
}

export function Conciliacao() {
  return <PlaceholderPage title="Conciliação" description="Conciliação bancária" icon={ArrowLeftRight} phase="Fase 4" />
}

export function Simulador() {
  return <PlaceholderPage title="Fluxo de Caixa" description="Projeção e realizado do fluxo de caixa" icon={FlaskConical} phase="Fase 4" />
}

export function Relatorios() {
  return <PlaceholderPage title="Relatórios" description="Relatórios e exportações" icon={BarChart3} phase="Fase 5" />
}

export function Importacao() {
  return <PlaceholderPage title="Importação" description="Importação de dados iniciais" icon={Upload} phase="Fase 2" />
}
