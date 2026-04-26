import { useEffect, useState } from 'react'
import { useProject } from '@/contexts/ProjectContext'

type DashPrefs = {
  fluxoPeriodicity: 'dia' | 'semana' | 'mes'
  fluxoViewMode: 'consolidado' | 'maturidade'
  fluxoFinancialMode: 'pedidos' | 'planejado' | 'realizado' | 'completo'
}

const DEFAULTS: DashPrefs = {
  fluxoPeriodicity: 'dia',
  fluxoViewMode: 'maturidade',
  fluxoFinancialMode: 'pedidos',
}

export function useDashboardPrefs() {
  const { currentCompany } = useProject()
  const key = currentCompany?.id ? `bf:dash:${currentCompany.id}` : null

  const [prefs, setPrefs] = useState<DashPrefs>(() => {
    if (!key) return DEFAULTS
    try {
      const raw = localStorage.getItem(key)
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
    } catch { return DEFAULTS }
  })

  useEffect(() => {
    if (!key) return
    try {
      const raw = localStorage.getItem(key)
      setPrefs(raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS)
    } catch { setPrefs(DEFAULTS) }
  }, [key])

  const update = (patch: Partial<DashPrefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch }
      if (key) {
        try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* noop */ }
      }
      return next
    })
  }

  return { prefs, update }
}
