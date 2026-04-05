import { useNavigate } from 'react-router-dom'
import { useProject } from '@/contexts/ProjectContext'
import { ChevronDown, Building2 } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

export function CompanySwitcher() {
  const { companies, currentCompany, selectCompany } = useProject()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!currentCompany) return null

  return (
    <div ref={ref} className="relative px-3 py-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 rounded-lg bg-sidebar-accent/50 px-3 py-2 text-left transition-colors hover:bg-sidebar-accent"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/20">
          <Building2 className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-sidebar-foreground">
            {currentCompany.nome_fantasia ?? currentCompany.razao_social}
          </p>
          <p className="text-[10px] text-sidebar-foreground/50">
            {currentCompany.status === 'ativo' ? '● Ativo' : currentCompany.status}
          </p>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-sidebar-foreground/50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full z-50 mt-1 rounded-lg border border-sidebar-border bg-sidebar shadow-xl">
          <div className="max-h-48 overflow-y-auto p-1">
            {companies.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  selectCompany(c.id)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs transition-colors ${
                  c.id === currentCompany.id
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50'
                }`}
              >
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{c.nome_fantasia ?? c.razao_social}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-sidebar-border p-1">
            <button
              onClick={() => {
                setOpen(false)
                navigate('/onboarding')
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-primary hover:bg-sidebar-accent/50"
            >
              + Novo Projeto
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
