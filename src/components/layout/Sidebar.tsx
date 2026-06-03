import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useUserRole, ROLE_LABELS } from '@/hooks/useUserRole'
import { useAlertCounts } from '@/hooks/useAlertCounts'
import { cn } from '@/lib/utils'
import { CompanySwitcher } from './CompanySwitcher'
import {
  CalendarRange,
  ShoppingCart,
  CreditCard,
  Landmark,
  FileText,
  Shield,
  TrendingUp,
  ArrowLeftRight,
  BarChart3,
  Upload,
  Settings,
  LogOut,
  X,
  HardHat,
  Building2,
  Users,
  ChevronRight,
  Gauge,
  Bug,
  FileInput,
  HandCoins,
  ClipboardList,
  TableProperties,
} from 'lucide-react'

const sections = [
  {
    label: 'Principal',
    items: [
      { to: '/painel-controle', icon: Gauge,         label: 'Painel de Controle', alertKey: 'total' as const },
      { to: '/cronograma',      icon: CalendarRange,  label: 'Painel de Bordo' },
    ],
  },
  {
    label: 'Operacional',
    items: [
      { to: '/compras',          icon: ShoppingCart, label: 'Compras',        alertKey: 'compras' as const },
      { to: '/recepcao',         icon: FileInput,    label: 'Recepção de NF', alertKey: 'recepcao' as const },
      { to: '/avanco',           icon: TrendingUp,   label: 'Avanço Físico' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { to: '/pagamentos',        icon: CreditCard,    label: 'Pagamentos',      alertKey: 'pagamentos' as const },
      { to: '/adiantamentos',    icon: HandCoins,     label: 'Adiantamentos' },
      { to: '/medicoes',          icon: ClipboardList, label: 'Medições' },
      { to: '/recebimentos',      icon: TrendingUp,    label: 'Recebimentos' },
      { to: '/despesas-indiretas',icon: Building2,     label: 'Custos Indiretos', alertKey: 'custosIndiretos' as const },
      { to: '/mutuos',            icon: Landmark,      label: 'Capital de Giro',  alertKey: 'capital' as const },
      { to: '/conciliacao',       icon: ArrowLeftRight,label: 'Conciliação',       alertKey: 'extrato' as const },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { to: '/documentos',  icon: FileText,  label: 'Documentos' },
      { to: '/auditoria',   icon: Shield,    label: 'Auditoria' },
      { to: '/logs',        icon: Bug,       label: 'Logs' },
      { to: '/relatorios',            icon: BarChart3,        label: 'Relatórios' },
      { to: '/relatorio-analitico',  icon: TableProperties,  label: 'Análise Integrada' },
      { to: '/importacao',  icon: Upload,    label: 'Importação' },
      { to: '/usuarios',    icon: Users,     label: 'Usuários' },
    ],
  },
]

type AlertKey = 'total' | 'pagamentos' | 'extrato' | 'compras' | 'recepcao' | 'custosIndiretos' | 'capital' | 'wbs'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { user, signOut } = useAuth()
  const { role, canAccess } = useUserRole()
  const navigate = useNavigate()
  const alertCounts = useAlertCounts()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  // Filter sections based on RBAC
  const filteredSections = sections
    .map(section => ({
      ...section,
      items: section.items.filter(item => canAccess(item.to)),
    }))
    .filter(section => section.items.length > 0)

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-300 md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <HardHat className="h-4.5 w-4.5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight">Build Fleury</h1>
              <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50">Controle de Obras</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-sidebar-accent md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Company Switcher */}
        <CompanySwitcher />

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3">
          {filteredSections.map((section) => (
            <div key={section.label} className="mb-3">
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                {section.label}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const count = (item as any).alertKey
                    ? alertCounts[(item as any).alertKey as AlertKey]
                    : 0
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        onClick={onClose}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                          )
                        }
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        {count > 0 && (
                          <span className={cn(
                            'inline-flex h-4.5 min-w-[1.125rem] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums',
                            (item as any).alertKey === 'total'
                              ? 'bg-red-500 text-white'
                              : 'bg-amber-500 text-white'
                          )}>
                            {count > 99 ? '99+' : count}
                          </span>
                        )}
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}

          {/* Settings — only for admins */}
          {canAccess('/configuracoes') && (
            <div className="mt-1 border-t border-sidebar-border/50 pt-2">
              <NavLink
                to="/configuracoes"
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                  )
                }
              >
                <Settings className="h-4 w-4 shrink-0" />
                Configurações
              </NavLink>
            </div>
          )}
        </nav>

        {/* User info — clickable to profile */}
        <div className="border-t border-sidebar-border p-3">
          <button
            onClick={() => {
              navigate('/perfil')
              onClose()
            }}
            className="mb-2 flex w-full items-center gap-2 rounded-lg bg-sidebar-accent/50 px-3 py-2 text-left transition-colors hover:bg-sidebar-accent"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
              {user?.email?.slice(0, 2).toUpperCase() ?? '??'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{user?.email}</p>
              <p className="text-[10px] text-sidebar-foreground/50">
                {role ? ROLE_LABELS[role] : 'Sem role'}
              </p>
            </div>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/30" />
          </button>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>
    </>
  )
}
