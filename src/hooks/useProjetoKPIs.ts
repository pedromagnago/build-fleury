import { useMemo } from 'react'
import { useItensCompra, usePedidos } from './useCompras'
import { useParcelas } from './useFinanceiro'
import { useDespesasIndiretas } from './useDespesasIndiretas'
import { useMutuos } from './useMutuos'

export interface ProjetoKPIs {
  // Orçado
  orcadoDiretos: number
  orcadoIndiretos: number
  orcadoOperacional: number

  // Comprometido contratual (pedidos ativos, com dedução de valor_coberto_por_realizacao)
  pedidosTotal: number

  // Valor face das parcelas (programado financeiro por origem)
  parcelasDiretasValor: number
  parcelasIndiretasValor: number
  parcelasOrfasValor: number
  capitalParcelasValor: number
  totalParcelasValor: number

  // Pago (caixa efetivo)
  pagoDiretos: number
  pagoIndiretos: number
  pagoCapital: number
  pagoOrfas: number
  pagoTotal: number

  // A pagar (parcelas em aberto)
  aPagarDiretos: number
  aPagarIndiretos: number
  aPagarCapital: number
  aPagarOrfas: number
  aPagarTotal: number

  // Capital
  capitalCaptado: number
  capitalSaldoDevedor: number

  // Saldo orçado: orçado operacional – (pago + a pagar)
  saldoOrcadoOperacional: number
}

export function useProjetoKPIs(): ProjetoKPIs {
  const { data: itens = [] }     = useItensCompra()
  const { data: pedidos = [] }   = usePedidos()
  const { data: parcelas = [] }  = useParcelas()
  const { despesas = [] }        = useDespesasIndiretas()
  const { data: mutuos = [] }    = useMutuos()

  return useMemo<ProjetoKPIs>(() => {
    // ── Orçado ──────────────────────────────────────────────────────────────
    const orcadoDiretos    = itens.reduce((s, i) => s + (Number(i.valor_total_orcado) || 0), 0)
    const orcadoIndiretos  = despesas.reduce((s, d) => s + (Number(d.valor_orcado) || 0), 0)
    const orcadoOperacional = orcadoDiretos + orcadoIndiretos

    // ── Comprometido contratual ─────────────────────────────────────────────
    // Espelha exatamente o PainelControlePage: pedidos não-cancelados,
    // descontando o que já foi coberto por NF externa (is_previsao_orcamento).
    const pedidosTotal = (pedidos as any[])
      .filter(p => p.status !== 'cancelado')
      .reduce((s, p) => {
        const v      = Number(p.valor_total_real || 0)
        const coberto = Number(p.valor_coberto_por_realizacao || 0)
        return s + Math.max(0, v - coberto)
      }, 0)

    // ── Parcelas por origem (valor face = comprometimento financeiro) ────────
    const parcelasDiretasValor   = (parcelas as any[]).filter(p => p.pedido_id != null && !p.despesa_indireta_id).reduce((s, p) => s + (Number(p.valor) || 0), 0)
    const parcelasIndiretasValor = (parcelas as any[]).filter(p => p.despesa_indireta_id != null).reduce((s, p) => s + (Number(p.valor) || 0), 0)
    const parcelasOrfasValor     = (parcelas as any[]).filter(p => !p.pedido_id && !p.despesa_indireta_id).reduce((s, p) => s + (Number(p.valor) || 0), 0)
    const capitalParcelasValor   = (mutuos as any[]).reduce((s, m) => s + ((m.parcelas ?? []).reduce((ss: number, mp: any) => ss + (Number(mp.valor) || 0), 0)), 0)
    const totalParcelasValor     = parcelasDiretasValor + parcelasIndiretasValor + parcelasOrfasValor + capitalParcelasValor

    // ── Pago ────────────────────────────────────────────────────────────────
    const pagoDiretos   = (parcelas as any[]).filter(p => p.pedido_id != null && !p.despesa_indireta_id).reduce((s, p) => s + (Number(p.valor_pago) || 0), 0)
    const pagoIndiretos = (parcelas as any[]).filter(p => p.despesa_indireta_id != null).reduce((s, p) => s + (Number(p.valor_pago) || 0), 0)
    const pagoOrfas     = (parcelas as any[]).filter(p => !p.pedido_id && !p.despesa_indireta_id).reduce((s, p) => s + (Number(p.valor_pago) || 0), 0)
    const pagoCapital   = (mutuos as any[]).reduce((s, m) => s + ((m.parcelas ?? []).reduce((ss: number, mp: any) => ss + (Number(mp.valor_pago) || 0), 0)), 0)
    const pagoTotal     = pagoDiretos + pagoIndiretos + pagoCapital + pagoOrfas

    // ── A pagar ─────────────────────────────────────────────────────────────
    const aPagarDiretos   = Math.max(0, parcelasDiretasValor   - pagoDiretos)
    const aPagarIndiretos = Math.max(0, parcelasIndiretasValor - pagoIndiretos)
    const aPagarCapital   = Math.max(0, capitalParcelasValor   - pagoCapital)
    const aPagarOrfas     = Math.max(0, parcelasOrfasValor     - pagoOrfas)
    const aPagarTotal     = aPagarDiretos + aPagarIndiretos + aPagarCapital + aPagarOrfas

    // ── Capital ─────────────────────────────────────────────────────────────
    const capitalCaptado      = (mutuos as any[]).reduce((s, m) => s + (Number(m.valor_captado) || 0), 0)
    const capitalSaldoDevedor = Math.max(0, capitalParcelasValor - pagoCapital)

    // ── Saldo orçado operacional ─────────────────────────────────────────────
    // Orçado menos tudo que já saiu ou está programado para sair (operacional).
    const saldoOrcadoOperacional = orcadoOperacional - pagoTotal - aPagarDiretos - aPagarIndiretos - aPagarOrfas

    return {
      orcadoDiretos, orcadoIndiretos, orcadoOperacional,
      pedidosTotal,
      parcelasDiretasValor, parcelasIndiretasValor, parcelasOrfasValor, capitalParcelasValor, totalParcelasValor,
      pagoDiretos, pagoIndiretos, pagoCapital, pagoOrfas, pagoTotal,
      aPagarDiretos, aPagarIndiretos, aPagarCapital, aPagarOrfas, aPagarTotal,
      capitalCaptado, capitalSaldoDevedor,
      saldoOrcadoOperacional,
    }
  }, [itens, pedidos, parcelas, despesas, mutuos])
}
