/**
 * useCashFlowEvents — Única fonte de verdade do fluxo de caixa
 *
 * Centraliza toda a lógica de geração de eventos financeiros para garantir
 * que Dashboard, CashFlowChart e SimuladorPanel mostrem os mesmos números.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useProject } from '@/contexts/ProjectContext'
import { useParcelas, useContasBancarias } from '@/hooks/useFinanceiro'
import { useMedicoes, useDistribuicao, useMovimentacoes } from '@/hooks/useOperacional'
import { useItensCompra, usePedidos } from '@/hooks/useCompras'
import { useEtapas } from '@/hooks/useEtapas'
import { useMutuos } from '@/hooks/useMutuos'
import { localDate, parsearCondicao } from '@/lib/parcelas'
import { supabase } from '@/lib/supabase'
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
    pedidoId?: string     // ID do pedido (para rastreamento)
    pedidoNumero?: number // Número humano do pedido
    parcelaNumero?: number
    parcelaTotal?: number
    parcelaTipo?: 'contratual' | 'adiantamento'
    dataVencimento?: string
    /** Valor TOTAL da parcela (não o saldo aberto). Útil para edições corretas. */
    valorOriginal?: number
    /** Valor já pago da parcela. */
    valorPago?: number
    /** Status real da parcela no banco. */
    parcelaStatus?: string
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

function tomorrowISO(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 1)
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
  const { data: movs = [] } = useMovimentacoes()
  const { data: contasBancarias = [] } = useContasBancarias()
  // Liga conciliacao -> parcela/mutuo/medicao para sabermos quais movs
  // ja estao representadas por parcelas (evita dupla contagem).
  const { data: linksMovs = [] } = useQuery({
    queryKey: ['cashflow-links-movs', currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany) return [] as any[]
      const { data, error } = await supabase
        .from('conciliacoes')
        .select('movimentacao_id, status, conciliacao_parcelas(parcela_id, mutuo_parcela_id, mutuo_id, medicao_id)')
        .eq('company_id', currentCompany.id)
        .neq('status', 'rejeitado')
      if (error) throw error
      return data ?? []
    },
    enabled: !!currentCompany,
  })

  // Saldo inicial = soma dos saldos iniciais de TODAS as contas ativas (multi-conta).
  // Fallback para o legado company.saldo_inicial_caixa quando ainda nao ha contas.
  const saldoInicial = useMemo(() => {
    const ativas = (contasBancarias as any[]).filter(c => c.ativa)
    if (ativas.length === 0) return currentCompany?.saldo_inicial_caixa ?? 0
    return ativas.reduce((s, c) => s + Number(c.saldo_inicial || 0), 0)
  }, [contasBancarias, currentCompany?.saldo_inicial_caixa])
  const prazoRecebimento = currentCompany?.prazo_recebimento_dias ?? 30

  const events = useMemo(() => {
    const today = todayISO()
    // Atrasados nao pagos sao empurrados para AMANHA (nao hoje) — assim o saldo
    // de hoje em modo 'pedidos'/'completo' fica IGUAL ao Realizado, e a divergencia
    // entre os modos comeca apenas a partir do dia seguinte (futuro/projecao).
    const amanha = tomorrowISO()
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
      
      // Vencida e não-paga: move para AMANHA (não hoje) — saldo de hoje fica igual ao Realizado.
      if (m.status !== 'paga' && baseDate < today && !apenasRealizado) {
        baseDate = amanha
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
            evDate = amanha
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

    // Mutuos lixo (STUB_Dedupe / cancelados) — nao representam dinheiro real
    const mutuosLixoIds = new Set<string>()
    for (const m of (mutuos as any[])) {
      const cat = String((m as any).categoria ?? '').toUpperCase()
      const status = String((m as any).status ?? '').toLowerCase()
      if (cat.includes('STUB_DEDUPE') || cat === 'STUB' || status === 'cancelado') {
        mutuosLixoIds.add(m.id)
      }
    }
    // Lookups: para cada item do plano, lista de movs bancarias vinculadas
    const movsByMutuoId = new Map<string, Set<string>>()
    const movsByParcelaId = new Map<string, Set<string>>()
    const movsByMutuoParcelaId = new Map<string, Set<string>>()
    for (const c of (linksMovs as any[])) {
      const links = c.conciliacao_parcelas ?? []
      for (const l of links) {
        const movId = c.movimentacao_id
        if (l.parcela_id) {
          const s = movsByParcelaId.get(l.parcela_id) ?? new Set<string>()
          s.add(movId); movsByParcelaId.set(l.parcela_id, s)
        }
        if (l.mutuo_parcela_id) {
          const s = movsByMutuoParcelaId.get(l.mutuo_parcela_id) ?? new Set<string>()
          s.add(movId); movsByMutuoParcelaId.set(l.mutuo_parcela_id, s)
        }
        if (l.mutuo_id && !mutuosLixoIds.has(l.mutuo_id)) {
          const s = movsByMutuoId.get(l.mutuo_id) ?? new Set<string>()
          s.add(movId); movsByMutuoId.set(l.mutuo_id, s)
        }
      }
    }
    // IDs de movs que pertencem a algum item plano (parcela/mutuo_parcela/mutuo nao-lixo)
    const movsConciliadasIds = new Set<string>()
    for (const s of movsByMutuoId.values()) for (const id of s) movsConciliadasIds.add(id)
    for (const s of movsByParcelaId.values()) for (const id of s) movsConciliadasIds.add(id)
    for (const s of movsByMutuoParcelaId.values()) for (const id of s) movsConciliadasIds.add(id)

    // ═══════════════════════════════════════════════════════════
    // EVENTO REAL — TODAS as movs bancarias viram eventos com valor + data REAIS.
    // Garante: saldo historico do Fluxo == saldo da Conciliacao (sem aproximacao).
    // ═══════════════════════════════════════════════════════════
    for (const mv of (movs as any[])) {
      if (!mv.data) continue
      const val = Math.abs(Number(mv.valor))
      if (!(val > 0)) continue
      const isEntrada = mv.tipo === 'entrada'
      all.push({
        id: `mb-${mv.id}`,
        date: mv.data,
        type: isEntrada ? 'entrada' : 'firme',
        valor: val,
        meta: { cat: isEntrada ? 'Banco' : 'Banco', etapa: 'Banco', desc: mv.descricao || (isEntrada ? 'Crédito bancário' : 'Débito bancário'), orig: val },
      })
    }

    // Mutuos SEM mov bancaria vinculada — previsao do plano (data_captacao).
    // Mutuos COM mov vinculada NAO emitem evento agregado: as movs ja viram eventos no bloco acima.
    mutuos.forEach(m => {
      if (!m.data_captacao) return
      if (mutuosLixoIds.has(m.id)) return
      if ((movsByMutuoId.get(m.id)?.size ?? 0) > 0) return // ja representado pelas movs

      if (apenasRealizado && m.data_captacao > today) return
      const val = Number(m.valor_captado)
      if (!(val > 0)) return
      const isAdi = isAdiantamentoFeito(m)
      if (isAdi) {
        all.push({
          id: `mutadi-${m.id}`,
          date: m.data_captacao,
          type: 'firme',
          valor: val,
          meta: { cat: m.tipo || 'Mútuo', etapa: 'Capital', forn: m.instituicao || m.nome, item: m.nome, desc: `Adiantamento feito: ${m.nome}`, orig: val },
        })
      } else {
        all.push({
          id: `mutcap-${m.id}`,
          date: m.data_captacao,
          type: 'entrada',
          valor: val,
          meta: { cat: m.tipo, desc: `Mútuo: ${m.nome}`, orig: val },
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
      // Se ja tem mov bancaria vinculada, a mov ja virou evento — pula a parcela
      // SEMPRE (mesmo se valor_pago/data_pagamento_real nao foi sincronizado pela
      // baixa). Evita dupla contagem entre evento-plano e mov-real do extrato.
      if ((movsByParcelaId.get(p.id)?.size ?? 0) > 0) return
      // Em 'realizado' ou 'planejado': só parcelas pagas (parcela em aberto é previsão de pedido).
      if (apenasRealizado && !isPaga) return

      const calcVal = isPaga ? Number(p.valor_pago || p.valor || 0) : Number(p.valor) - Number(p.valor_pago || 0)
      if (calcVal <= 0) return

      // Paga: usa data_pagamento_real; se null (legado), cai em data_vencimento. Nunca empurra paga para hoje.
      // Não paga: empurra vencida para hoje só na projeção (não em realizado/planejado).
      let date = isPaga ? (p.data_pagamento_real || p.data_vencimento) : p.data_vencimento
      if (!isPaga && date < today && !apenasRealizado) date = amanha

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

      // Conta total de parcelas do mesmo pedido para sublabel "Parc 1/3"
      const totalParcPedido = ped ? parcelas.filter(pp => pp.pedido_id === ped.id).length : undefined

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
          orig: calcVal,
          pedidoId: ped?.id,
          pedidoNumero: ped?.numero_pedido ?? undefined,
          parcelaNumero: p.numero_parcela,
          parcelaTotal: totalParcPedido,
          parcelaTipo: (p as any).tipo,
          dataVencimento: p.data_vencimento,
          valorOriginal: Number(p.valor),
          valorPago: Number(p.valor_pago || 0),
          parcelaStatus: p.status,
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
        // Se ja tem mov bancaria vinculada, a mov ja virou evento — pula SEMPRE
        // (mesmo se valor_pago/data_pagamento_real nao foi sincronizado pela baixa)
        if ((movsByMutuoParcelaId.get(p.id)?.size ?? 0) > 0) return
        if (apenasRealizado && !isPaga) return

        const calcVal = isPaga ? Number(p.valor_pago || p.valor || 0) : Number(p.valor) - Number(p.valor_pago || 0)
        if (calcVal <= 0) return

        let date = isPaga ? (p.data_pagamento_real || p.data_vencimento) : p.data_vencimento
        if (!isPaga && date < today && !apenasRealizado) date = amanha

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
            if (dateStr < today) dateStr = amanha

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
            if (dateStr < today) dateStr = amanha

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

    // (Bloco de movs orfas removido — agora TODAS as movs viram eventos
    // no inicio do useMemo, e itens do plano com mov vinculada nao emitem
    // evento agregado. Garante saldo historico = Conciliacao.)

    return all
  }, [parcelas, medicoes, itens, pedidos, etapas, mutuos, distribuicoes, movs, linksMovs, viewMode])

  return { events, saldoInicial }
}
