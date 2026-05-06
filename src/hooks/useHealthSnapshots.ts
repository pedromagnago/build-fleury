/**
 * useHealthSnapshots — Persistencia diaria do estado de saude.
 *
 * - Lista os ultimos 30 snapshots da company atual (para a sparkline).
 * - upsertToday(): grava o snapshot do dia (idempotente — UNIQUE company+date
 *   garante upsert). Chamado pelo PainelControle quando o useHealthChecks
 *   termina de calcular, sem cron infra.
 */
import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import type { HealthCheck } from '@/hooks/useHealthChecks'

export interface HealthSnapshot {
  id: string
  company_id: string
  snapshot_date: string
  total_items: number
  critical_count: number
  warn_count: number
  total_valor: number
  by_rule: Record<string, { count: number; valor: number }>
  created_at: string
  updated_at: string
}

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function useHealthSnapshots() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()
  const companyId = currentCompany?.id

  const list = useQuery({
    queryKey: ['health-snapshots', companyId],
    queryFn: async () => {
      if (!companyId) return [] as HealthSnapshot[]
      const { data, error } = await supabase
        .from('health_snapshots')
        .select('*')
        .eq('company_id', companyId)
        .order('snapshot_date', { ascending: true })
        .limit(60)
      if (error) throw error
      return (data ?? []).map(s => ({
        ...s,
        total_valor: Number(s.total_valor),
        by_rule: typeof s.by_rule === 'string' ? JSON.parse(s.by_rule) : (s.by_rule || {}),
      })) as HealthSnapshot[]
    },
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
  })

  const upsert = useMutation({
    mutationFn: async (checks: HealthCheck[]) => {
      if (!companyId) return
      const by_rule: Record<string, { count: number; valor: number }> = {}
      let critical = 0, warn = 0, total = 0, valor = 0
      for (const c of checks) {
        if (c.severity === 'ok') continue
        if (c.severity === 'critical') critical += 1
        if (c.severity === 'warn') warn += 1
        const v = c.items.reduce((s, it) => s + (it.value ?? 0), 0)
        by_rule[c.id] = { count: c.items.length, valor: v }
        total += c.items.length
        valor += v
      }
      const { error } = await supabase
        .from('health_snapshots')
        .upsert({
          company_id: companyId,
          snapshot_date: todayISO(),
          total_items: total,
          critical_count: critical,
          warn_count: warn,
          total_valor: valor,
          by_rule,
        }, { onConflict: 'company_id,snapshot_date' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['health-snapshots', companyId] })
    },
  })

  // Resumo conveniente: tendencia (delta vs snapshot anterior).
  const trend = useMemo(() => {
    const arr = list.data ?? []
    if (arr.length === 0) return { current: null as HealthSnapshot | null, previous: null as HealthSnapshot | null, deltaItems: 0, deltaValor: 0 }
    const current = arr[arr.length - 1]!
    const previous = arr.length > 1 ? arr[arr.length - 2]! : null
    return {
      current,
      previous,
      deltaItems: previous ? current.total_items - previous.total_items : 0,
      deltaValor: previous ? current.total_valor - previous.total_valor : 0,
    }
  }, [list.data])

  return {
    snapshots: list.data ?? [],
    isLoading: list.isLoading,
    trend,
    upsertToday: upsert.mutate,
  }
}
