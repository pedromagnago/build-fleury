import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useUserRole } from '@/hooks/useUserRole'
import { cn } from '@/lib/utils'
import { CompanySwitcher } from './CompanySwitcher'
import {
  LayoutDashboard,
  CalendarRange,
  ShoppingCart,
  CreditCard,
  Landmark,
  FileText,
  Shield,
  TrendingUp,
  Ruler,
  ArrowLeftRight,
  FlaskConical,
  BarChart3,
  Upload,
  Settings,
  LogOut,
  X,
  HardHat,
} from 'lucide-react'

const sections = [
  {
    label: 'Visão Geral',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    label: 'Planejamento',
    items: [
      { to: '/cronograma', icon: CalendarRange, label: 'Cronograma' },
      { to: '/compras', icon: ShoppingCart, label: 'Compras' },
      { to: '/avanco', icon: TrendingUp, label: 'Avanço Físico' },
      { to: '/medicoes', icon: Ruler, label: 'Medições' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { to: '/pagamentos', icon: CreditCard, label: 'Pagamentos' },
      { to: '/mutuos', icon: Landmark, label: 'Capital de Giro' },
      { to: '/conciliacao', icon: ArrowLeftRight, label: 'Conciliação' },
      { to: '/simulador', icon: FlaskConical, label: 'Simulador' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { to: '/documentos', icon: FileText, label: 'Documentos' },
      { to: '/auditoria', icon: Shield, label: 'Auditoria' },
      { to: '/relatorios', icon: BarChart3, label: 'Relatórios' },
      { to: '/importacao', icon: Upload, label: 'Importação' },
    ],
  },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { user, signOut } = useAuth()
  const { role } = useUserRole()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

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
          {sections.map((section) => (
            <div key={section.label} className="mb-3">
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                {section.label}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => (
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
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Settings — always at the bottom of nav */}
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
        </nav>

        {/* User info */}
        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 rounded-lg bg-sidebar-accent/50 px-3 py-2">
            <p className="truncate text-xs font-medium">{user?.email}</p>
            <p className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
              {role ?? 'Sem role'}
            </p>
          </div>
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
