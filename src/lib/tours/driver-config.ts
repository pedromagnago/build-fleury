import type { DriveStep, Config } from 'driver.js'

export const TOUR_THEME: Partial<Config> = {
  animate: true,
  overlayColor: 'rgba(0, 0, 0, 0.65)',
  stagePadding: 8,
  stageRadius: 12,
  popoverOffset: 12,
  showProgress: true,
  progressText: '{{current}} de {{total}}',
  nextBtnText: 'Próximo →',
  prevBtnText: '← Anterior',
  doneBtnText: 'Concluir ✓',
  showButtons: ['next', 'previous', 'close'],
  popoverClass: 'bf-tour-popover',
}

export interface TourStepDef {
  element: string
  title: string
  description: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export function buildDriverSteps(steps: TourStepDef[]): DriveStep[] {
  return steps.map((s) => ({
    element: s.element,
    popover: {
      title: s.title,
      description: s.description,
      side: s.side ?? 'bottom',
      align: 'center' as const,
    },
  }))
}

// All page tour IDs in the correct order for the full product tour
export const TOUR_ORDER = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', phase: 'Fundamentos', emoji: '🏗' },
  { id: 'configuracoes', label: 'Configurações', path: '/configuracoes', phase: 'Fundamentos', emoji: '🏗' },
  { id: 'importacao', label: 'Importação', path: '/importacao', phase: 'Carga de Dados', emoji: '📥' },
  { id: 'cronograma', label: 'Cronograma', path: '/cronograma', phase: 'Operação Diária', emoji: '⚙️' },
  { id: 'compras', label: 'Compras', path: '/compras', phase: 'Operação Diária', emoji: '⚙️' },
  { id: 'pagamentos', label: 'Pagamentos', path: '/pagamentos', phase: 'Operação Diária', emoji: '⚙️' },
  { id: 'mutuos', label: 'Capital de Giro', path: '/mutuos', phase: 'Operação Diária', emoji: '⚙️' },
  { id: 'documentos', label: 'Documentos', path: '/documentos', phase: 'Operação Diária', emoji: '⚙️' },
  { id: 'auditoria', label: 'Auditoria', path: '/auditoria', phase: 'Operação Diária', emoji: '⚙️' },
  { id: 'avanco', label: 'Avanço Físico', path: '/avanco', phase: 'Acompanhamento', emoji: '📊' },
  { id: 'medicoes', label: 'Medições', path: '/medicoes', phase: 'Acompanhamento', emoji: '📊' },
  { id: 'conciliacao', label: 'Conciliação', path: '/conciliacao', phase: 'Acompanhamento', emoji: '📊' },
  { id: 'simulador', label: 'Fluxo de Caixa', path: '/simulador', phase: 'Visão Estratégica', emoji: '🔮' },
  { id: 'relatorios', label: 'Relatórios', path: '/relatorios', phase: 'Visão Estratégica', emoji: '🔮' },
] as const

export type TourId = typeof TOUR_ORDER[number]['id']
