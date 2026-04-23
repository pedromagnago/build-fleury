/**
 * useCashFlowEvents — Única fonte de verdade do fluxo de caixa
 *
 * Centraliza toda a lógica de geração de eventos financeiros para garantir
 * que Dashboard, CashFlowChart e SimuladorPanel mostrem os mesmos números.
 */
import { useMemo } from 'react'
import { useProject } from '@/contexts/ProjectContext'
import { useParcelas } from '@/hooks/useFinanceiro'
import { useMedicoes, useDistribuicao } from '@/hooks/useOperacional'
import { useItensCompra, usePedidos } from '@/hooks/useCompras'
import { useEtapas } from '@/hooks/useEtapas'
import { useMutuos } from '@/hooks/useMutuos'
import { localDate, parsearCondicao } from '@/lib/parcelas'
import type { FinancialViewMode } from '@/components/cronograma/FinancialViewFilter'

// ─── Types ──────────────────────────────────────────────────────
export interface CashFlowEvent {
  id: string
  date: string            // ISO YYYY-MM-DD
  type: 'entrada' | 'firme' | 'bruto'
  valor: number
  meta: {
    cat?: string          // Categoria (Cliente, Obra, Mútuo, etc.)
    etapa?: string        // Nome da etapa
    forn?: string         // Nome do fornecedor
    item?: string         // Descrição do item
    desc: string          // Label descritivo para exibição
    orig?: number         // Valor original (pré-override)
  }
}

export interface CashFlowResult {
  events: CashFlowEvent[]
  saldoInicial: number
}

// ─── Helper ─────────────────────────────────────────────────────
function fmtISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayISO(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return fmtISO(d)
}

function addDaysISO(baseIso: string, days: number): string {
  if (!baseIso) return baseIso
  const d = new Date(baseIso)
  d.setUTCHours(12) // Avoid timezone shifts
  d.setDate(d.getDate() + days)
  return fmtISO(d)
}

// ─── Hook ───────────────────────────────────────────────────────
export function useCashFlowEvents(viewMode: FinancialViewMode = 'pedidos'): CashFlowResult {
  const { currentCompany } = useProject()
  const { data: parcelas = [] } = useParcelas()
  const { data: medicoes = [] } = useMedicoes()
  const { data: itens = [] } = useItensCompra()
  const { data: pedidos = [] } = usePedidos()
  const { data: etapas = [] } = useEtapas()
  const { data: mutuos = [] } = useMutuos()
  const { data: distribuicoes = [] } = useDistribuicao()

  const saldoInicial = currentCompany?.saldo_inicial_caixa ?? 0
  const prazoRecebimento = currentCompany?.prazo_recebimento_dias ?? 30

  const events = useMemo(() => {
    const today = todayISO()
    const all: CashFlowEvent[] = []

    // Regra: em 'realizado' e 'planejado' mostramos apenas o que é REAL (pago/confirmado).
    // 'pedidos' e 'completo' incluem também as previsões firmes (parcelas/medições não pagas).
    const apenasRealizado = viewMode === 'realizado' || viewMode === 'planejado'

    // ═══════════════════════════════════════════════════════════
    // 1. ENTRADAS — Medições (via Distribuições)
    // ═══════════════════════════════════════════════════════════
    medicoes.forEach(m => {
      if (!m.data_prevista) return
      // Realizado ou Planejado: só inclui medição paga (firme é coisa de pedido, não de planejado).
      if (apenasRealizado && m.status !== 'paga') return

      let baseDate = m.data_liberacao || m.data_prevista
      if (baseDate) {
        baseDate = addDaysISO(baseDate, prazoRecebimento)
      }
      
      // Vencida e não-paga: move para hoje (apenas em visões com previsão)
      if (m.status !== 'paga' && baseDate < today && !apenasRealizado) {
        baseDate = today
      }

      const dists = distribuicoes.filter(dd => dd.medicao_numero === m.numero)
      if (dists.length > 0) {
        dists.forEach((dist, idx) => {
          let val = Number(dist.valor_liberado_faturamento || 0)
          if (apenasRealizado) {
            const pct = dist.casas_planejadas > 0 ? Math.min(dist.casas_realizadas / dist.casas_planejadas, 1) : 0
            val = val * pct
          }
          if (val <= 0) return

          let evDate = dist.data_fim || dist.data_inicio || m.data_liberacao || m.data_prevista
          if (evDate) {
            evDate = addDaysISO(evDate, prazoRecebimento)
          }

          if (m.status !== 'paga' && evDate < today && !apenasRealizado) {
            evDate = today
          }

          const etapa = etapas.find(e => e.id === dist.etapa_id)
          all.push({
            id: `med-${m.id}-srv-${idx}`,
            date: evDate,
            type: 'entrada',
            valor: val,
            meta: { cat: 'Cliente', etapa: etapa?.nome, desc: `M${m.numero} — ${etapa?.nome || 'Serviço'}`, orig: val }
          })
        })
      } else {
        const val = apenasRealizado ? (m.valor_liberado || 0) : m.valor_planejado
        if (val > 0) {
          all.push({
            id: `med-${m.id}`,
            date: baseDate,
            type: 'entrada',
            valor: val,
            meta: { cat: 'Cliente', desc: `Medição nº ${m.numero}`, orig: val }
          })
        }
      }
    })

    // ═══════════════════════════════════════════════════════════
    // 2. ENTRADAS/SAÍDAS — Mútuos (valor captado)
    // Captações genuínas (empréstimo recebido) = ENTRADA
    // "Adiantamento Feito" / saída conciliada como mútuo = SAÍDA
    // ═══════════════════════════════════════════════════════════
    const isAdiantamentoFeito = (m: any) => {
      const cat = String(m.categoria ?? '').toLowerCase()
      return cat.includes('adiantamento a receber') || cat.includes('adiantamento feito')
    }

    mutuos.forEach(m => {
      if (!m.data_captacao) return
      // Em 'realizado' ou 'planejado': só mostra mútuos já efetivamente captados/emprestados (data passada).
      if (apenasRealizado && m.data_captacao > today) return

      const date = m.data_captacao
      const val = Number(m.valor_captado)
      if (!(val > 0)) return

      if (isAdiantamentoFeito(m)) {
        // Saída: dinheiro emprestado pelo projeto a terceiros (já saiu na data de captação)
        all.push({
          id: `mutadi-${m.id}`,
          date,
          type: 'firme',
          valor: val,
          meta: { cat: m.tipo || 'Mútuo', etapa: 'Capital', forn: m.instituicao || m.nome, item: m.nome, desc: `Adiantamento feito: ${m.nome}`, orig: val }
        })
      } else {
        all.push({
          id: `mutcap-${m.id}`,
          date,
          type: 'entrada',
          valor: val,
          meta: { cat: m.tipo, desc: `Mútuo: ${m.nome}`, orig: val }
        })
      }
    })

    // ═══════════════════════════════════════════════════════════
    // 3. SAÍDAS FIRMES — Parcelas de pedidos e Despesas Indiretas
    // ═══════════════════════════════════════════════════════════
    parcelas.forEach(p => {
      if (!p.data_vencimento) return
      // Considera paga também quando valor_pago cobre o valor (status pode estar dessincronizado em parcelas antigas)
      const isPaga = p.status === 'paga' || (Number(p.valor_pago || 0) >= Number(p.valor) - 0.005 && Number(p.valor) > 0)
      // Em 'realizado' ou 'planejado': só parcelas pagas (parcela em aberto é previsão de pedido).
      if (apenasRealizado && !isPaga) return

      const calcVal = isPaga ? Number(p.valor_pago || p.valor || 0) : Number(p.valor) - Number(p.valor_pago || 0)
      if (calcVal <= 0) return

      // Paga: usa data_pagamento_real; se null (legado), cai em data_vencimento. Nunca empurra paga para hoje.
      // Não paga: empurra vencida para hoje só na projeção (não em realizado/planejado).
      let date = isPaga ? (p.data_pagamento_real || p.data_vencimento) : p.data_vencimento
      if (!isPaga && date < today && !apenasRealizado) date = today

      const ped = pedidos.find(pd => pd.id === p.pedido_id)
      
      let catStr = 'Obra'
      let etapaStr = undefined
      let fornStr = undefined
      let itemStr = undefined
      let descStr = `Parc ${p.numero_parcela}`

      if (ped) {
        const itemObj = itens.find(i => i.id === ped.item_compra_id)
        const etapaObj = etapas.find(et => et.id === itemObj?.etapa_id)
        catStr = itemObj?.categoria || 'Obra'
        etapaStr = etapaObj?.nome
        fornStr = ped.fornecedor_nome
        itemStr = ped.item_descricao || itemObj?.descricao
        descStr = `Parc ${p.numero_parcela} — ${ped.fornecedor_nome || ''}`
      } else if (p.despesa_indireta_id && (p as any).despesas_indiretas) {
        const di = (p as any).despesas_indiretas
        catStr = di.categoria || 'Despesa Indireta'
        etapaStr = 'Custos Indiretos'
        fornStr = di.fornecedor_nome || di.categoria || 'Indireto'
        itemStr = di.descricao
        descStr = `Parc ${p.numero_parcela} — ${di.descricao || 'Despesa'}`
      } else if (!ped) {
        // Parcela avulsa (sem pedido nem despesa)
        descStr = p.descricao ? `Parc ${p.numero_parcela} — ${p.descricao}` : `Parc avulsa ${p.numero_parcela}`
        catStr = 'Avulsa'
        etapaStr = 'Outros'
      }

      all.push({
        id: `par-${p.id}`,
        date,
        type: 'firme',
        valor: calcVal,
        meta: {
          cat: catStr,
          etapa: etapaStr,
          forn: fornStr,
          item: itemStr,
          desc: descStr,
          orig: calcVal
        }
      })
    })

    // ═══════════════════════════════════════════════════════════
    // 4. SAÍDAS/ENTRADAS FIRMES — Parcelas de mútuos
    // Captação: parcelas = devolução ao banco (SAÍDA)
    // Adiantamento Feito/Recebido: parcelas = devolução ao projeto (ENTRADA)
    // ═══════════════════════════════════════════════════════════
    mutuos.forEach(m => {
      const parcelaEhEntrada = isAdiantamentoFeito(m)
      ;(m.parcelas || []).forEach((p: any) => {
        if (!p.data_vencimento) return
        const isPaga = p.status === 'paga' || (Number(p.valor_pago || 0) >= Number(p.valor) - 0.005 && Number(p.valor) > 0)
        if (apenasRealizado && !isPaga) return

        const calcVal = isPaga ? Number(p.valor_pago || p.valor || 0) : Number(p.valor) - Number(p.valor_pago || 0)
        if (calcVal <= 0) return

        let date = isPaga ? (p.data_pagamento_real || p.data_vencimento) : p.data_vencimento
        if (!isPaga && date < today && !apenasRealizado) date = today

        all.push({
          id: `mutpar-${p.id}`,
          date,
          type: parcelaEhEntrada ? 'entrada' : 'firme',
          valor: calcVal,
          meta: { cat: m.tipo, etapa: 'Capital', forn: m.instituicao || m.nome, item: m.nome, desc: `Mútuo Parc ${p.numero_parcela} — ${m.nome}`, orig: calcVal }
        })
      })
    })

    // ═══════════════════════════════════════════════════════════
    // 5. SAÍDAS — Pedidos sem parcela (visões "pedidos" e "completo")
    // ═══════════════════════════════════════════════════════════
    if (viewMode === 'pedidos' || viewMode === 'completo') {
      const parcelaPedidoIds = new Set(parcelas.map(p => p.pedido_id).filter(Boolean))
      pedidos
        .filter(p => p.status !== 'cancelado' && !parcelaPedidoIds.has(p.id))
        .forEach(p => {
          const val = Number(p.valor_total_real ?? 0)
          if (val <= 0) return

          const itemObj = itens.find(i => i.id === p.item_compra_id)
          const etapaObj = etapas.find(et => et.id === itemObj?.etapa_id)

          // Regra solicitada: Se não houver data_entrega_prevista, usa data_inicio_plan da etapa, senao hoje
          const baseDateStr = p.data_entrega_prevista || etapaObj?.data_inicio_plan || today
          
          const cond = p.cond_pagamento || itemObj?.cond_pagamento || 'à vista'
          const dias = parsearCondicao(cond)
          const nParts = dias.length
          const valPart = val / nParts

          dias.forEach((dd, pIdx) => {
            const dt = localDate(baseDateStr)
            dt.setDate(dt.getDate() + dd)
            let dateStr = fmtISO(dt)
            if (dateStr < today) dateStr = today

            all.push({
              id: `pedsol-${p.id}-${pIdx}`,
              date: dateStr,
              type: 'firme',
              valor: valPart,
              meta: {
                cat: itemObj?.categoria || 'Obra',
                etapa: etapaObj?.nome,
                forn: p.fornecedor_nome,
                item: p.item_descricao || itemObj?.descricao,
                desc: `Pedido #${p.numero_pedido || '?'} — ${p.fornecedor_nome || ''}${nParts > 1 ? ` (Parc ${pIdx + 1})` : ''}`,
                orig: valPart
              }
            })
          })
        })
    }

    // ═══════════════════════════════════════════════════════════
    // 6. SAÍDAS BRUTAS — Previsto de itens sem pedido ("planejado" e "completo")
    // ═══════════════════════════════════════════════════════════
    if (viewMode === 'planejado' || viewMode === 'completo') {
      const pedMap = new Map<string, number>()
      pedidos.forEach(p => pedMap.set(p.item_compra_id, (pedMap.get(p.item_compra_id) || 0) + Number(p.valor_total_real || 0)))

      itens.forEach(item => {
        const comPed = Math.min(pedMap.get(item.id) || 0, Number(item.valor_total_orcado))
        const semPed = Math.max(0, Number(item.valor_total_orcado) - comPed - Number(item.valor_consumido))
        if (semPed <= 0) return

        const etapa = etapas.find(e => e.id === item.etapa_id)
        const dataOrig = etapa?.data_inicio_plan || ''
        if (!dataOrig) return

        const dias = parsearCondicao(item.cond_pagamento || '')
        const nParts = dias.length
        const dists = distribuicoes.filter(dd => dd.etapa_id === item.etapa_id)
        const casasT = etapa?.casas_total || 1

        const pushBruto = (baseDate: string, ratio: number, suffix: string, dIdx: number) => {
          const valDist = semPed * ratio
          if (valDist <= 0) return
          const perPart = valDist / nParts
          dias.forEach((dd, pIdx) => {
            const dt = localDate(baseDate)
            dt.setDate(dt.getDate() + dd)
            let dateStr = fmtISO(dt)
            if (dateStr < today) dateStr = today

            all.push({
              id: `bruto-${item.id}-${dIdx}-${pIdx}`,
              date: dateStr,
              type: 'bruto',
              valor: perPart,
              meta: {
                cat: item.categoria || 'Obra',
                etapa: etapa?.nome,
                forn: item.fornecedor_nome || '',
                item: item.descricao,
                desc: `${item.descricao}${suffix}`,
                orig: perPart
              }
            })
          })
        }

        if (dists.length > 0) {
          dists.forEach((dist, dIdx) => pushBruto(dist.data_inicio || dataOrig, dist.casas_planejadas / casasT, ` (${dist.casas_planejadas}un)`, dIdx))
        } else {
          pushBruto(dataOrig, 1, '', 0)
        }
      })
    }

    return all
  }, [parcelas, medicoes, itens, pedidos, etapas, mutuos, distribuicoes, viewMode])

  return { events, saldoInicial }
}
