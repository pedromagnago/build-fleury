import { useState } from 'react'

type DashPrefs = {
  fluxoPeriodicity: 'dia' | 'semana' | 'mes'
  fluxoViewMode: 'consolidado' | 'maturidade'
  fluxoFinancialMode: 'pedidos' | 'realizado' | 'planejado' | 'completo'
}

const DEFAULTS: DashPrefs = {
  fluxoPeriodicity: 'dia',
  fluxoViewMode: 'maturidade',
  fluxoFinancialMode: 'pedidos',
}

// Chave única (preferência visual do usuário, não do projeto). Sem dependência
// de currentCompany — evita flicker quando company demora pra carregar e
// re-leituras que sobrescrevem updates feitos pelo usuário.
const KEY = 'bf:dash:v2'

export function useDashboardPrefs() {
  const [prefs, setPrefs] = useState<DashPrefs>(() => {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
    } catch { return DEFAULTS }
  })

  const update = (patch: Partial<DashPrefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* noop */ }
      return next
    })
  }

  return { prefs, update }
}
