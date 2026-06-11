/**
 * useAlertasCriticos — Zona 1 do Painel de Controle (alertas operacionais).
 *
 * Deriva "vencida" sempre por data + saldo (tolerância 0.01), nunca apenas
 * pelo campo status:
 *  - Parcelas de pedido vencidas sem pagamento total → /pagamentos?filtro=vencidas
 *  - Parcelas de recebimento (medições) vencidas → /recebimentos?filtro=vencidas
 *  - Adiantamentos sem abatimento há mais de 30 dias → /adiantamentos?filtro=em-aberto
 *
 * Reutiliza useParcelas / useMedicaoParcelas / useAdiantamentos, que já
 * filtram por company_id e registros não deletados.
 */
import { useMemo } from 'react'
import { useParcelas } from '@/hooks/useFinanceiro'
import { useMedicaoParcelas } from '@/hooks/useMedicaoParcelas'
import { useAdiantamentos } from '@/hooks/useAdiantamentos'
import type { HealthCheck, HealthCheckItem } from '@/hooks/useHealthChecks'

const TOLERANCIA = 0.01
const DIAS_RISCO_ADIANTAMENTO = 30

function todayISO(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function fmtDataBR(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

export function useAlertasCriticos() {
  const { data: parcelas = [], isLoading: loadingParcelas } = useParcelas()
  const { data: medicaoParcelas = [], isLoading: loadingMedParc } = useMedicaoParcelas()
  const { data: adiantamentos = [], isLoading: loadingAdiant } = useAdiantamentos()

  const alertas = useMemo<HealthCheck[]>(() => {
    const hoje = todayISO()
    const diasDesde = (d: string): number =>
      Math.floor((new Date(hoje + 'T00:00:00').getTime() - new Date(d + 'T00:00:00').getTime()) / 86400000)

    const all: HealthCheck[] = []

    // ═══════════════════════════════════════════════════════════
    // 1. Parcelas de pedido vencidas sem pagamento total
    // ═══════════════════════════════════════════════════════════
    const pagVencidas: HealthCheckItem[] = []
    let valorPagVencidas = 0
    for (const p of parcelas) {
      if (!p.pedido_id) continue
      const saldo = Number(p.valor || 0) - Number(p.valor_pago || 0)
      if (saldo <= TOLERANCIA) continue
      if (!p.data_vencimento || p.data_vencimento >= hoje) continue
      pagVencidas.push({
        id: p.id,
        label: `Parcela ${p.numero_parcela} — ${p.pedido_item || p.fornecedor_nome || 'Sem item'}`,
        description: `Venceu em ${fmtDataBR(p.data_vencimento)} (${diasDesde(p.data_vencimento)}d) • Saldo: ${fmtBRL(saldo)}`,
        value: saldo,
        pedidoId: p.pedido_id ?? undefined,
      })
      valorPagVencidas += saldo
    }
    pagVencidas.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    all.push({
      id: 'alerta-parcelas-pedido-vencidas',
      title: 'Parcelas de pedido vencidas',
      severity: pagVencidas.length === 0 ? 'ok' : 'critical',
      summary: pagVencidas.length === 0
        ? 'Nenhuma parcela de pedido vencida com saldo em aberto'
        : `${pagVencidas.length} parcela(s) vencida(s) — ${fmtBRL(valorPagVencidas)} em atraso`,
      items: pagVencidas,
      route: '/pagamentos?filtro=vencidas',
      routeLabel: 'Ver vencidas',
    })

    // ═══════════════════════════════════════════════════════════
    // 2. Parcelas de recebimento (medições) vencidas
    // ═══════════════════════════════════════════════════════════
    const recVencidas: HealthCheckItem[] = []
    let valorRecVencidas = 0
    for (const mp of medicaoParcelas) {
      const saldo = Number(mp.valor || 0) - Number(mp.valor_recebido || 0)
      if (saldo <= TOLERANCIA) continue
      if (!mp.data_vencimento || mp.data_vencimento >= hoje) continue
      recVencidas.push({
        id: mp.id,
        label: `Medição nº ${mp.medicao?.numero ?? '?'} — Parcela ${mp.numero_parcela}`,
        description: `Venceu em ${fmtDataBR(mp.data_vencimento)} (${diasDesde(mp.data_vencimento)}d) • A receber: ${fmtBRL(saldo)}`,
        value: saldo,
      })
      valorRecVencidas += saldo
    }
    recVencidas.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    all.push({
      id: 'alerta-recebimentos-vencidos',
      title: 'Parcelas de recebimento vencidas',
      severity: recVencidas.length === 0 ? 'ok' : 'critical',
      summary: recVencidas.length === 0
        ? 'Nenhuma parcela de recebimento vencida com saldo em aberto'
        : `${recVencidas.length} parcela(s) de recebimento vencida(s) — ${fmtBRL(valorRecVencidas)} a receber em atraso`,
      items: recVencidas,
      route: '/recebimentos?filtro=vencidas',
      routeLabel: 'Ver vencidas',
    })

    // ═══════════════════════════════════════════════════════════
    // 3. Adiantamentos sem abatimento — pagos há mais de 30 dias
    //    ou com prazo previsto de abatimento já vencido
    // ═══════════════════════════════════════════════════════════
    const adiantRisco: HealthCheckItem[] = []
    let valorAdiantRisco = 0
    let temMais30d = false
    for (const a of adiantamentos) {
      const saldo = Number(a.valor || 0) - Number(a.valor_abatido || 0)
      if (saldo <= TOLERANCIA) continue
      const dias = a.data_pagamento ? diasDesde(a.data_pagamento) : null
      const mais30d = dias !== null && dias > DIAS_RISCO_ADIANTAMENTO
      const prazoVencido = !!a.data_prevista_abatimento && a.data_prevista_abatimento < hoje
      if (!mais30d && !prazoVencido) continue
      if (mais30d) temMais30d = true
      const fornecedor = a.fornecedor?.nome ?? a.pedido?.fornecedores?.nome ?? 'Sem fornecedor'
      const motivo = mais30d
        ? `pago há ${dias}d sem abatimento total`
        : `prazo de abatimento venceu em ${fmtDataBR(a.data_prevista_abatimento!)}`
      adiantRisco.push({
        id: a.id,
        label: `${fornecedor} — Pedido #${a.pedido?.numero_pedido ?? '?'}`,
        description: `Em aberto: ${fmtBRL(saldo)} • ${motivo}`,
        value: saldo,
        pedidoId: a.pedido_id ?? undefined,
      })
      valorAdiantRisco += saldo
    }
    adiantRisco.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    all.push({
      id: 'alerta-adiantamentos-sem-abatimento',
      title: 'Adiantamentos sem abatimento',
      severity: adiantRisco.length === 0 ? 'ok' : temMais30d ? 'critical' : 'warn',
      summary: adiantRisco.length === 0
        ? 'Nenhum adiantamento em risco (mais de 30 dias ou prazo vencido)'
        : `${adiantRisco.length} adiantamento(s) em risco — ${fmtBRL(valorAdiantRisco)} sem retorno`,
      items: adiantRisco,
      route: '/adiantamentos?filtro=em-aberto',
      routeLabel: 'Ver adiantamentos',
    })

    return all
  }, [parcelas, medicaoParcelas, adiantamentos])

  const stats = useMemo(() => {
    const ativos = alertas.filter(a => a.items.length > 0)
    return {
      criticos: ativos.filter(a => a.severity === 'critical').length,
      advertencias: ativos.filter(a => a.severity === 'warn').length,
      total: alertas.length,
    }
  }, [alertas])

  return {
    alertas,
    stats,
    isLoading: loadingParcelas || loadingMedParc || loadingAdiant,
  }
}
