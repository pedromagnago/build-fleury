/**
 * useCashFlowEvents — Única fonte de verdade do fluxo de caixa
 *
 * Centraliza toda a lógica de geração de eventos financeiros para garantir
 * que Dashboard, CashFlowChart e SimuladorPanel mostrem os mesmos números.
 */
import { useMemo } from 'react'
import { useProject } from '@/contexts/ProjectContext'
import { useParcelas, useContasBancarias } from '@/hooks/useFinanceiro'
import { useMedicoes, useDistribuicao, useMovimentacoes } from '@/hooks/useOperacional'
import { useItensCompra, usePedidos } from '@/hooks/useCompras'
import { useEtapas } from '@/hooks/useEtapas'
import { useMutuos } from '@/hooks/useMutuos'
import { localDate, parsearCondicao, dataEfetivaParcela } from '@/lib/parcelas'
import { useConciliacaoLinks } from '@/hooks/useConciliacao'
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
    /** Origem da parcela: NF (pedido âncora), Saldo (regerada após consumo), Plan (planejado),
     *  Despesa (indireta), Avulsa (sem pedido nem despesa). Pra rendering hierárquico
     *  e badges visuais em fluxo de caixa. */
    origem?: 'nf' | 'saldo' | 'planejado' | 'despesa' | 'avulsa' | 'medicao' | 'mutuo'
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
  // Liga conciliacao -> parcela/mutuo/medicao — cache compartilhado com
  // useHealthChecks e useEquacoesContabeis via key 'conciliacao-links'.
  const { data: linksData } = useConciliacaoLinks()
  const linksMovs = linksData?.rawRows ?? []

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
    // PREAMBLE — Lookups e helpers (usados por todas as seções)
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
    const movsByMedicaoId = new Map<string, Set<string>>()
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
        if (l.medicao_id) {
          const s = movsByMedicaoId.get(l.medicao_id) ?? new Set<string>()
          s.add(movId); movsByMedicaoId.set(l.medicao_id, s)
        }
      }
    }

    // IDs de movs que pertencem a algum item plano (parcela/mutuo_parcela/mutuo/medicao)
    const movsConciliadasIds = new Set<string>()
    for (const s of movsByMutuoId.values()) for (const id of s) movsConciliadasIds.add(id)
    for (const s of movsByParcelaId.values()) for (const id of s) movsConciliadasIds.add(id)
    for (const s of movsByMutuoParcelaId.values()) for (const id of s) movsConciliadasIds.add(id)
    for (const s of movsByMedicaoId.values()) for (const id of s) movsConciliadasIds.add(id)

    // Lookup rápido: mov_id -> objeto mov
    const movByIdLookup = new Map<string, any>()
    for (const mv of (movs as any[])) movByIdLookup.set(mv.id, mv)

    // Soma do valor real (extrato) das movs vinculadas a cada parcela.
    // Usado para emitir SOMENTE o residuo da parcela quando ela ainda tem
    // saldo aberto: residuo = valor_da_parcela - soma_das_movs.
    const movsValueByParcelaId = new Map<string, number>()
    for (const [parcelaId, movIds] of movsByParcelaId.entries()) {
      let soma = 0
      for (const movId of movIds) {
        const mv = movByIdLookup.get(movId)
        if (mv) soma += Math.abs(Number(mv.valor || 0))
      }
      movsValueByParcelaId.set(parcelaId, soma)
    }

    // Mesmo padrão para medições: soma do extrato bancário vinculado a cada medição.
    // Permite emitir o resíduo (valor_planejado - banco) quando a medição foi
    // parcialmente recebida — sem isso o saldo a receber some do fluxo.
    const movsValueByMedicaoId = new Map<string, number>()
    for (const [medicaoId, movIds] of movsByMedicaoId.entries()) {
      let soma = 0
      for (const movId of movIds) {
        const mv = movByIdLookup.get(movId)
        if (mv) soma += Math.abs(Number(mv.valor || 0))
      }
      movsValueByMedicaoId.set(medicaoId, soma)
    }

    // Lookup reverso: mov_id -> parcela_id (primeira vinculada). Usado para
    // enriquecer o evento bancario com etapa/fornecedor/item do pedido.
    const parcelaIdByMovId = new Map<string, string>()
    for (const c of (linksMovs as any[])) {
      for (const l of (c.conciliacao_parcelas ?? [])) {
        if (!l.parcela_id) continue
        if (!parcelaIdByMovId.has(c.movimentacao_id)) {
          parcelaIdByMovId.set(c.movimentacao_id, l.parcela_id)
        }
      }
    }

    // Lookup reverso: mov_id -> medicao_id (primeira vinculada).
    const medicaoIdByMovId = new Map<string, string>()
    // Lookup reverso: mov_id -> mutuo_id (primeira vinculada, exceto lixo).
    const mutuoIdByMovId = new Map<string, string>()
    // Lookup reverso: mov_id -> mutuo_parcela_id (primeira vinculada).
    const mutuoParcelaIdByMovId = new Map<string, string>()
    for (const c of (linksMovs as any[])) {
      for (const l of (c.conciliacao_parcelas ?? [])) {
        const movId = c.movimentacao_id
        if (l.medicao_id && !medicaoIdByMovId.has(movId)) {
          medicaoIdByMovId.set(movId, l.medicao_id)
        }
        if (l.mutuo_id && !mutuosLixoIds.has(l.mutuo_id) && !mutuoIdByMovId.has(movId)) {
          mutuoIdByMovId.set(movId, l.mutuo_id)
        }
        if (l.mutuo_parcela_id && !mutuoParcelaIdByMovId.has(movId)) {
          mutuoParcelaIdByMovId.set(movId, l.mutuo_parcela_id)
        }
      }
    }
    const medicaoById = new Map(medicoes.map(m => [m.id, m]))
    // mutuoById e mutuoByParcelaId — enriquecem eventos bancários de mútuo conciliados.
    const mutuoById = new Map((mutuos as any[]).filter(m => !mutuosLixoIds.has(m.id)).map(m => [m.id, m]))
    const mutuoByParcelaId = new Map<string, any>()
    for (const m of (mutuos as any[])) {
      if (mutuosLixoIds.has(m.id)) continue
      for (const p of (m.parcelas || [])) mutuoByParcelaId.set(p.id, m)
    }
    const parcelaById = new Map(parcelas.map(p => [p.id, p]))
    const pedidoById = new Map(pedidos.map(p => [p.id, p]))
    const itemById = new Map(itens.map(i => [i.id, i]))
    const etapaById = new Map(etapas.map(e => [e.id, e]))

    // ═══════════════════════════════════════════════════════════
    // 1. ENTRADAS — Medições (via Distribuições)
    // ═══════════════════════════════════════════════════════════
    medicoes.forEach(m => {
      if (!m.data_prevista) return
      // Realizado ou Planejado: só inclui medição paga (firme é coisa de pedido, não de planejado).
      if (apenasRealizado && m.status !== 'paga') return
      // Medição já coberta por mov bancária vinculada: a mov virou evento no bloco de movs.
      // Suprime o evento agregado para evitar dupla contagem.
      if ((movsByMedicaoId.get(m.id)?.size ?? 0) > 0) return

      // Recebimento = data fim da medição + prazo configurado.
      // Sem distribuições, "data fim" = data_prevista da medição (marco de conclusão).
      let baseDate = m.data_prevista
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

          // Recebimento = data fim (da distribuição/serviço) + prazo configurado.
          const baseEv = dist.data_fim || m.data_prevista || dist.data_inicio
          if (!baseEv) return
          let evDate = addDaysISO(baseEv, prazoRecebimento)

          if (m.status !== 'paga' && evDate < today && !apenasRealizado) {
            evDate = amanha
          }

          const etapa = etapas.find(e => e.id === dist.etapa_id)
          all.push({
            id: `med-${m.id}-srv-${idx}`,
            date: evDate,
            type: 'entrada',
            valor: val,
            meta: { cat: 'Cliente', etapa: etapa?.nome, desc: `M${m.numero} — ${etapa?.nome || 'Serviço'}`, orig: val, origem: 'medicao' }
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
            meta: { cat: 'Cliente', desc: `Medição nº ${m.numero}`, orig: val, origem: 'medicao' }
          })
        }
      }
    })

    // ═══════════════════════════════════════════════════════════
    // 2. ENTRADAS/SAÍDAS — Mútuos (valor captado)
    // Captações genuínas (empréstimo recebido) = ENTRADA
    // "Adiantamento Feito" / saída conciliada como mútuo = SAÍDA
    // ═══════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════
    // EVENTO REAL — TODAS as movs bancarias viram eventos com valor + data REAIS.
    // Garante: saldo historico do Fluxo == saldo da Conciliacao (sem aproximacao).
    // Mov vinculada a uma parcela HERDA cat/etapa/fornecedor/item dela —
    // assim o pagamento aparece sob a etapa/fornecedor original na arvore
    // (e nao em "Banco/Banco" generico).
    // ═══════════════════════════════════════════════════════════
    for (const mv of (movs as any[])) {
      if (!mv.data) continue
      const val = Math.abs(Number(mv.valor))
      if (!(val > 0)) continue
      const isEntrada = mv.tipo === 'entrada'

      let cat: string = 'Banco'
      let etapa: string | undefined = 'Banco'
      let forn: string | undefined
      let item: string | undefined
      let pedidoId: string | undefined
      let pedidoNumero: number | undefined
      let parcelaNumero: number | undefined
      let parcelaTipo: 'contratual' | 'adiantamento' | undefined
      let descPrefix = ''
      let origemMov: CashFlowEvent['meta']['origem'] = undefined

      const parcelaId = parcelaIdByMovId.get(mv.id)
      if (parcelaId) {
        const par = parcelaById.get(parcelaId)
        if (par) {
          parcelaNumero = par.numero_parcela
          parcelaTipo = (par as any).tipo
          if (par.pedido_id) {
            const ped = pedidoById.get(par.pedido_id)
            if (ped) {
              const itemObj = itemById.get(ped.item_compra_id)
              const etapaObj = itemObj ? etapaById.get(itemObj.etapa_id) : undefined
              cat = itemObj?.categoria || 'Obra'
              etapa = etapaObj?.nome
              forn = ped.fornecedor_nome
              item = ped.item_descricao || itemObj?.descricao
              pedidoId = ped.id
              pedidoNumero = ped.numero_pedido ?? undefined
              descPrefix = `Parc ${par.numero_parcela}${forn ? ' — ' + forn : ''} · `
            }
          } else if (par.despesa_indireta_id && (par as any).despesas_indiretas) {
            const di = (par as any).despesas_indiretas
            cat = di.categoria || 'Despesa Indireta'
            etapa = 'Custos Indiretos'
            forn = di.fornecedor_nome || di.categoria || 'Indireto'
            item = di.descricao
            descPrefix = `Parc ${par.numero_parcela}${forn ? ' — ' + forn : ''} · `
            origemMov = 'despesa'
          }
        }
      } else {
        // Sem parcela vinculada — verifica medição, depois mútuo (captação ou parcela)
        const medicaoId = medicaoIdByMovId.get(mv.id)
        if (medicaoId) {
          const med = medicaoById.get(medicaoId)
          cat = 'Cliente'
          etapa = `M${med?.numero ?? '?'}`
          origemMov = 'medicao'
          descPrefix = `Medição ${med?.numero ?? ''} · `
        } else {
          const mutuoId = mutuoIdByMovId.get(mv.id)
          const mpId = mutuoParcelaIdByMovId.get(mv.id)
          if (mutuoId || mpId) {
            const mut: any = mutuoId ? mutuoById.get(mutuoId) : mutuoByParcelaId.get(mpId!)
            cat = mut?.tipo || 'Mútuo'
            etapa = 'Capital'
            forn = mut?.instituicao || mut?.nome
            origemMov = 'mutuo'
            descPrefix = mut?.nome ? `${mut.nome} · ` : 'Mútuo · '
          }
        }
      }

      all.push({
        id: `mb-${mv.id}`,
        date: mv.data,
        type: isEntrada ? 'entrada' : 'firme',
        valor: val,
        meta: {
          cat,
          etapa,
          forn,
          item,
          desc: descPrefix + (mv.descricao || (isEntrada ? 'Crédito bancário' : 'Débito bancário')),
          orig: val,
          pedidoId,
          pedidoNumero,
          parcelaNumero,
          parcelaTipo,
          origem: origemMov,
        },
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
          meta: { cat: m.tipo || 'Mútuo', etapa: 'Capital', forn: m.instituicao || m.nome, item: m.nome, desc: `Adiantamento feito: ${m.nome}`, orig: val, origem: 'mutuo' },
        })
      } else {
        all.push({
          id: `mutcap-${m.id}`,
          date: m.data_captacao,
          type: 'entrada',
          valor: val,
          meta: { cat: m.tipo, desc: `Mútuo: ${m.nome}`, orig: val, origem: 'mutuo' },
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
      const movsCount = movsByParcelaId.get(p.id)?.size ?? 0
      const somaMovs = movsValueByParcelaId.get(p.id) ?? 0

      // Parcela com movs vinculadas e ja paga: as movs reais ja viraram eventos
      // no bloco anterior — nao reemite. Evita dupla contagem.
      if (movsCount > 0 && isPaga) return
      // Em 'realizado'/'planejado': só parcelas pagas (parcela em aberto é previsão).
      if (apenasRealizado && !isPaga) return

      // Calcula valor a emitir.
      // - Sem movs: comportamento padrao (valor pago se paga, ou saldo aberto).
      // - Com movs + saldo aberto: emite SOMENTE o residuo (valor - soma das movs reais)
      //   na data de vencimento. As movs ja sao eventos com seus valores reais.
      let calcVal: number
      const isResiduo = movsCount > 0
      if (isResiduo) {
        calcVal = Math.max(0, Number(p.valor) - somaMovs)
      } else {
        calcVal = isPaga ? Number(p.valor_pago || p.valor || 0) : Number(p.valor) - Number(p.valor_pago || 0)
      }
      if (calcVal <= 0.5) return

      // Data efetiva: pagamento_real (se paga) > prevista_pagamento > vencimento.
      // Nao paga e ja vencida: empurra para amanha so na projecao (nao em realizado/planejado).
      let date = (dataEfetivaParcela(p) || p.data_vencimento) as string
      if (!isPaga && date < today && !apenasRealizado) date = amanha

      const ped = pedidos.find(pd => pd.id === p.pedido_id)

      // Conta total de parcelas do mesmo pedido para sublabel "P1/3"
      const totalParcPedido = ped ? parcelas.filter(pp => pp.pedido_id === ped.id).length : undefined
      const partLbl = totalParcPedido && totalParcPedido > 1
        ? `P${p.numero_parcela}/${totalParcPedido}`
        : `Parc ${p.numero_parcela}`

      let catStr = 'Obra'
      let etapaStr: string | undefined = undefined
      let fornStr: string | undefined = undefined
      let itemStr: string | undefined = undefined
      let descStr = partLbl
      let origemKind: 'nf' | 'saldo' | 'planejado' | 'despesa' | 'avulsa' = 'planejado'

      if (ped) {
        const itemObj = itens.find(i => i.id === ped.item_compra_id)
        const etapaObj = etapas.find(et => et.id === itemObj?.etapa_id)
        catStr = itemObj?.categoria || 'Obra'
        etapaStr = etapaObj?.nome
        fornStr = ped.fornecedor_nome
        itemStr = ped.item_descricao || itemObj?.descricao

        // Origem da parcela:
        //   - 'saldo': parcela regerada num pedido planejado após consumo parcial por NF
        //     (descrição padrão: "Saldo após consumo NF X" — gerada pelo aplicar()).
        //   - 'nf': parcela do pedido âncora criado por uma NF aplicada. O aplicar()
        //     grava `observacoes` começando com "NF " no pedido âncora.
        //   - 'planejado': demais casos (pedido sem NF aplicada).
        const desc = (p as any).descricao as string | undefined
        const obs = (ped as any).observacoes as string | undefined
        if (desc && desc.startsWith('Saldo após consumo NF')) origemKind = 'saldo'
        else if (obs && /^NF\s/.test(obs)) origemKind = 'nf'
        else origemKind = 'planejado'

        const tag = origemKind === 'nf' ? '[NF]' : origemKind === 'saldo' ? '[Saldo]' : '[Plan.]'
        const numPed = ped.numero_pedido != null ? `Ped #${ped.numero_pedido} · ` : ''
        const residuoTag = isResiduo ? ' (resíduo)' : ''
        descStr = `${tag} ${numPed}${partLbl}${residuoTag} — ${ped.fornecedor_nome || ''}`
      } else if (p.despesa_indireta_id && (p as any).despesas_indiretas) {
        const di = (p as any).despesas_indiretas
        catStr = di.categoria || 'Despesa Indireta'
        etapaStr = 'Custos Indiretos'
        fornStr = di.fornecedor_nome || di.categoria || 'Indireto'
        itemStr = di.descricao
        descStr = `[Desp.] ${partLbl} — ${di.descricao || 'Despesa'}`
        origemKind = 'despesa'
      } else {
        // Parcela avulsa (sem pedido nem despesa)
        descStr = p.descricao
          ? `[Avulsa] ${partLbl} — ${p.descricao}`
          : `[Avulsa] ${partLbl}`
        catStr = 'Avulsa'
        etapaStr = 'Outros'
        origemKind = 'avulsa'
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
          origem: origemKind,
        }
      })
    })

    // ═══════════════════════════════════════════════════════════
    // 4. SAÍDAS/ENTRADAS FIRMES — Parcelas de mútuos
    // Captação: parcelas = devolução ao banco (SAÍDA)
    // Adiantamento Feito/Recebido: parcelas = devolução ao projeto (ENTRADA)
    // ═══════════════════════════════════════════════════════════
    mutuos.forEach(m => {
      if (mutuosLixoIds.has(m.id)) return // mutuo lixo (STUB_DEDUPE/cancelado): suas parcelas tambem nao contam
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

        let date = (dataEfetivaParcela(p) || p.data_vencimento) as string
        if (!isPaga && date < today && !apenasRealizado) date = amanha

        all.push({
          id: `mutpar-${p.id}`,
          date,
          type: parcelaEhEntrada ? 'entrada' : 'firme',
          valor: calcVal,
          meta: { cat: m.tipo, etapa: 'Capital', forn: m.instituicao || m.nome, item: m.nome, desc: `Mútuo Parc ${p.numero_parcela} — ${m.nome}`, orig: calcVal, origem: 'mutuo' }
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
          // PR 3.5: quando uma NF consome parte do pedido, suas parcelas são
          // movidas pro pedido âncora (que carrega o consumido). O saldo NÃO
          // consumido fica neste pedido sem parcela — então a previsão aqui
          // deve refletir somente o saldo (qtd-qtd_recebida), senão duplicamos
          // o que já está nas parcelas do âncora.
          const valTotal = Number(p.valor_total_real ?? 0)
          const valSaldo = (p.itens && p.itens.length > 0)
            ? p.itens.reduce((s, pi) => {
                // fora_orcamento: sobra criada por NF com estouro permitido. Não
                // tem "saldo a receber" — já está integralmente recebido na NF.
                if ((pi as { fora_orcamento?: boolean }).fora_orcamento === true) return s
                const q = Number(pi.qtd || 0)
                if (q <= 0) return s
                const fracRestante = Math.max(0, 1 - Number(pi.qtd_recebida || 0) / q)
                return s + Number(pi.valor_total_real || 0) * fracRestante
              }, 0)
            : valTotal
          const val = valSaldo
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
  }, [parcelas, medicoes, itens, pedidos, etapas, mutuos, distribuicoes, movs, linksData, viewMode])

  return { events, saldoInicial }
}
