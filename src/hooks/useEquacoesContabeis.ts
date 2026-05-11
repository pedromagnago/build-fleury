/**
 * useEquacoesContabeis — Auditoria contábil em 3 equações.
 *
 * Cada equação tem que fechar; quando não fecha, decompõe o gap por bucket
 * para indicar onde o sistema está incoerente. Substitui a heurística
 * espalhada em useHealthChecks por uma visão de balanço.
 *
 *   A. PLANO     — Σ origens (pedidos + despesas) = Σ parcelas
 *   B. EXECUÇÃO  — Σ valor_pago parcelas         = Σ saídas conciliadas a parcela
 *   C. EXTRATO   — Σ movs do extrato             = Σ movs conciliadas a alguma origem
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParcelas } from '@/hooks/useFinanceiro'
import { usePedidos } from '@/hooks/useCompras'
import { useDespesasIndiretas } from '@/hooks/useDespesasIndiretas'
import { useMovimentacoes } from '@/hooks/useOperacional'
import { useProject } from '@/contexts/ProjectContext'
import { supabase } from '@/lib/supabase'

export type EquacaoStatus = 'ok' | 'warn' | 'error'

/** Tolerância de centavos: gap menor que isso é considerado ✅ ok. */
const TOL_OK = 1
/** Gap maior que isso (em R$) já é tratado como erro. */
const TOL_ERR = 100

export interface BucketItem {
  id: string
  label: string
  description: string
  value: number
}

export interface EquacaoBucket {
  /** Slug estável; usado pelo painel pra filtrar a lista detalhada. */
  id: string
  label: string
  qtd: number
  /** Valor com sinal: negativo = falta parcela; positivo = excesso/órfão. */
  valor: number
  items: BucketItem[]
}

export interface Equacao {
  id: 'plano' | 'execucao' | 'extrato' | 'caixa'
  title: string
  /** Texto curto exibido no card explicando o que cada lado representa. */
  formula: string
  esquerdo: { label: string; value: number }
  direito: { label: string; value: number }
  gap: number
  status: EquacaoStatus
  buckets: EquacaoBucket[]
}

interface ConciliacaoLink {
  conciliacao_id: string
  movimentacao_id: string
  status: string
  parcela_id: string | null
  mutuo_id: string | null
  mutuo_parcela_id: string | null
  medicao_id: string | null
  mov_valor: number
  mov_tipo: string
  /** Valor do rateio (cp.valor_aplicado). Pode ser < mov_valor quando a mov é
   * dividida entre múltiplas origens. Usar este (não mov_valor) ao classificar
   * uma parcela individual, senão rateio aparece como divergência falsa. */
  valor_aplicado: number
}

export function useEquacoesContabeis() {
  const { currentCompany } = useProject()
  const { data: parcelas = [] } = useParcelas()
  const { data: pedidos = [] } = usePedidos()
  const { despesas = [] } = useDespesasIndiretas()
  const { data: movs = [] } = useMovimentacoes()

  // Σ pago em mutuo_parcelas (separado de parcelas — tabela própria).
  // Necessário para a Eq D (caixa).
  const { data: pagoMutuos = 0, isLoading: loadingMutuosPago } = useQuery({
    queryKey: ['equacoes-mutuos-pago', currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany) return 0
      const { data, error } = await supabase
        .from('mutuo_parcelas')
        .select('valor_pago')
        .eq('company_id', currentCompany.id)
      if (error) throw error
      return (data ?? []).reduce((s, p: any) => s + Number(p.valor_pago || 0), 0)
    },
    enabled: !!currentCompany,
  })

  // Liga conciliações a movs e às 4 origens possíveis. Retorna 2 estruturas:
  //   - links: uma row por (conciliacao × origem). Usado para classificar destino.
  //   - movsConciliadas: set de mov_ids com qualquer conciliação ativa. Usado
  //     para a Eq C — uma conciliação confirmada SEM row em conciliacao_parcelas
  //     ainda conta como "mov conciliada", senão a Eq C inflaria órfãs.
  const { data: linksData = { links: [], movsConciliadas: new Set<string>() }, isLoading: loadingLinks } = useQuery({
    queryKey: ['equacoes-links', currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany) return { links: [] as ConciliacaoLink[], movsConciliadas: new Set<string>() }
      const { data, error } = await supabase
        .from('conciliacoes')
        .select(`
          id, status, movimentacao_id,
          movimentacoes_bancarias!inner(valor, tipo),
          conciliacao_parcelas(parcela_id, mutuo_id, mutuo_parcela_id, medicao_id, valor_aplicado)
        `)
        .eq('company_id', currentCompany.id)
        .neq('status', 'rejeitado')
      if (error) throw error
      const out: ConciliacaoLink[] = []
      const movsSet = new Set<string>()
      for (const c of (data ?? []) as any[]) {
        movsSet.add(c.movimentacao_id)
        const mov = Array.isArray(c.movimentacoes_bancarias)
          ? c.movimentacoes_bancarias[0]
          : c.movimentacoes_bancarias
        for (const cp of (c.conciliacao_parcelas ?? [])) {
          out.push({
            conciliacao_id: c.id,
            movimentacao_id: c.movimentacao_id,
            status: c.status,
            parcela_id: cp.parcela_id,
            mutuo_id: cp.mutuo_id,
            mutuo_parcela_id: cp.mutuo_parcela_id,
            medicao_id: cp.medicao_id,
            mov_valor: Number(mov?.valor ?? 0),
            mov_tipo: String(mov?.tipo ?? ''),
            valor_aplicado: Number(cp.valor_aplicado ?? 0),
          })
        }
      }
      return { links: out, movsConciliadas: movsSet }
    },
    enabled: !!currentCompany,
  })
  const links = linksData.links
  const movsConciliadas = linksData.movsConciliadas

  const isLoading = !parcelas || !pedidos || !despesas || !movs || loadingLinks || loadingMutuosPago

  const equacoes = useMemo<Equacao[]>(() => {
    if (isLoading) return []

    // ─── Estado base ────────────────────────────────────────────────────────
    const parcelasPorPedido = new Map<string, number>()
    for (const p of parcelas) {
      if (!p.pedido_id) continue
      parcelasPorPedido.set(p.pedido_id, (parcelasPorPedido.get(p.pedido_id) ?? 0) + Number(p.valor || 0))
    }
    const parcelasPorDespesa = new Map<string, number>()
    for (const p of parcelas) {
      if (!p.despesa_indireta_id) continue
      parcelasPorDespesa.set(p.despesa_indireta_id, (parcelasPorDespesa.get(p.despesa_indireta_id) ?? 0) + Number(p.valor || 0))
    }

    // ═════════════════════════════════════════════════════════════════════════
    // EQUAÇÃO A — PLANO: Σ origens não-canceladas = Σ parcelas
    // ═════════════════════════════════════════════════════════════════════════
    const sigmaPedidos = pedidos
      .filter(p => p.status !== 'cancelado')
      .reduce((s, p) => s + Number(p.valor_total_real || 0), 0)
    const sigmaDespesas = (despesas as any[])
      .reduce((s, d) => s + Number(d.valor_orcado || 0), 0)
    const sigmaParcelas = parcelas.reduce((s, p) => s + Number(p.valor || 0), 0)
    const origensTotal = sigmaPedidos + sigmaDespesas

    // Buckets do gap A
    const bPedSemParc: BucketItem[] = []
    const bPedParcial: BucketItem[] = []
    const bPedExcesso: BucketItem[] = []
    for (const ped of pedidos) {
      if (ped.status === 'cancelado') continue
      const valor = Number(ped.valor_total_real || 0)
      if (valor <= 0.5) continue
      const soma = parcelasPorPedido.get(ped.id) ?? 0
      const dif = soma - valor
      const label = `Pedido #${ped.numero_pedido ?? '?'} — ${ped.fornecedor_nome ?? 'Sem forn.'}`
      if (soma <= 0.5) {
        bPedSemParc.push({ id: ped.id, label, description: `Valor ${fmtBRL(valor)} sem parcelas geradas`, value: -valor })
      } else if (dif < -0.5) {
        bPedParcial.push({ id: ped.id, label, description: `Pedido ${fmtBRL(valor)} • Parcelas ${fmtBRL(soma)} (faltam ${fmtBRL(-dif)})`, value: dif })
      } else if (dif > 0.5) {
        bPedExcesso.push({ id: ped.id, label, description: `Pedido ${fmtBRL(valor)} • Parcelas ${fmtBRL(soma)} (excesso ${fmtBRL(dif)})`, value: dif })
      }
    }

    const bDespGap: BucketItem[] = []
    for (const d of despesas as any[]) {
      const valor = Number(d.valor_orcado || 0)
      if (valor <= 0.5) continue
      const soma = parcelasPorDespesa.get(d.id) ?? 0
      const dif = soma - valor
      if (Math.abs(dif) <= 0.5) continue
      const label = `${d.descricao || 'Despesa'} — ${d.categoria || '—'}`
      bDespGap.push({
        id: d.id,
        label,
        description: soma <= 0.5
          ? `Orçado ${fmtBRL(valor)} sem parcelas geradas`
          : `Orçado ${fmtBRL(valor)} • Parcelas ${fmtBRL(soma)} (${dif > 0 ? '+' : ''}${fmtBRL(dif)})`,
        value: dif,
      })
    }

    // Órfãs separadas por tipo: 'adiantamento' = PIX antecipado fora do cronograma
    // sem pedido formal; 'contratual' (ou null) = parcela do plano sem origem
    // (mais grave, indica importação inconsistente).
    const bOrfasAdt: BucketItem[] = []
    const bOrfasContr: BucketItem[] = []
    for (const p of parcelas) {
      if (p.pedido_id || p.despesa_indireta_id) continue
      const item: BucketItem = {
        id: p.id,
        label: `Parcela ${p.numero_parcela} — ${p.descricao || p.fornecedor_nome || 'sem descrição'}`,
        description: `Valor ${fmtBRL(Number(p.valor || 0))} • Vencimento ${p.data_vencimento ?? '—'} • Status ${p.status}`,
        value: Number(p.valor || 0),
      }
      if (p.tipo === 'adiantamento') bOrfasAdt.push(item)
      else bOrfasContr.push(item)
    }

    const bucketsA: EquacaoBucket[] = [
      { id: 'pedido-sem-parcela',      label: 'Pedidos sem parcela',                  qtd: bPedSemParc.length,  valor: sumValor(bPedSemParc),  items: bPedSemParc },
      { id: 'pedido-parcial',          label: 'Pedidos com parcelas a menos',         qtd: bPedParcial.length,  valor: sumValor(bPedParcial),  items: bPedParcial },
      { id: 'pedido-excesso',          label: 'Pedidos com parcelas a mais',          qtd: bPedExcesso.length,  valor: sumValor(bPedExcesso),  items: bPedExcesso },
      { id: 'despesa-gap',             label: 'Despesas indiretas com gap',           qtd: bDespGap.length,     valor: sumValor(bDespGap),     items: bDespGap },
      { id: 'adiantamento-orfao',      label: 'Adiantamento sem pedido formalizado',  qtd: bOrfasAdt.length,    valor: sumValor(bOrfasAdt),    items: bOrfasAdt },
      { id: 'parcela-orfa-contratual', label: 'Parcela contratual sem origem',        qtd: bOrfasContr.length,  valor: sumValor(bOrfasContr),  items: bOrfasContr },
    ].filter(b => b.qtd > 0)

    const gapA = sigmaParcelas - origensTotal

    // ═════════════════════════════════════════════════════════════════════════
    // EQUAÇÃO B — EXECUÇÃO: para cada parcela, valor_pago = Σ saídas vinculadas
    //
    // Usa cp.valor_aplicado (rateio) em vez de mov.valor — quando uma mov é
    // rateada entre N parcelas, cada parcela espera ver SUA parte, não o total
    // da mov, senão rateio legítimo vira divergência falsa.
    //
    // Filtra status='sugerido' — sugestões pendentes não são vínculos
    // realizados; só contam links confirmados/aprovados (baixa pré-extrato).
    // ═════════════════════════════════════════════════════════════════════════
    // Inclui parcelas órfãs também — qualquer parcela é candidata a ter
    // mov conciliada, e excluir órfãs aqui criava gap "fantasma" (a órfã
    // entrava no lado das saídas mas não no lado do pago).
    const sigmaPagoParc = parcelas
      .reduce((s, p) => s + Number(p.valor_pago || 0), 0)

    // Σ saídas vinculadas (rateio por parcela; sugestões pendentes excluídas)
    let sigmaSaidasParcela = 0
    for (const l of links) {
      if (!l.parcela_id || l.mov_tipo !== 'saida') continue
      if (l.status === 'sugerido') continue
      sigmaSaidasParcela += Number(l.valor_aplicado || 0)
    }

    const gapB = sigmaSaidasParcela - sigmaPagoParc

    // Decomposição do gap B em 3 buckets cuja soma fecha o gap.
    //   Para cada parcela com pedido_id ou despesa_indireta_id:
    //     contribuição = Σ movs vinculadas (saída) − valor_pago
    //   Σ contribuições = Σ saídas vinc − Σ valor_pago = gapB ✓
    //
    // Buckets:
    //   1) "Pago sem mov" — valor_pago > 0 e Σ movs = 0 (contrib negativa)
    //   2) "Mov sem virar pago" — Σ movs > 0 e valor_pago = 0 (positiva)
    //   3) "Mov ≠ pago" — ambos > 0 mas divergem (qualquer sinal)
    const movsByParc = new Map<string, { soma: number; n: number }>()
    for (const l of links) {
      if (!l.parcela_id || l.mov_tipo !== 'saida') continue
      if (l.status === 'sugerido') continue
      const cur = movsByParc.get(l.parcela_id) ?? { soma: 0, n: 0 }
      cur.soma += Number(l.valor_aplicado || 0)
      cur.n += 1
      movsByParc.set(l.parcela_id, cur)
    }
    const bPagoSemMov: BucketItem[] = []
    const bMovSemPago: BucketItem[] = []
    const bMovDifPago: BucketItem[] = []
    for (const p of parcelas) {
      const mv = movsByParc.get(p.id) ?? { soma: 0, n: 0 }
      const pago = Number(p.valor_pago || 0)
      if (pago <= TOL_OK && mv.soma <= TOL_OK) continue
      const contrib = mv.soma - pago
      if (Math.abs(contrib) <= TOL_OK) continue
      const label = `Parcela ${p.numero_parcela} — ${p.descricao || p.fornecedor_nome || ''}`
      if (mv.soma <= TOL_OK) {
        bPagoSemMov.push({ id: p.id, label, description: `Pago ${fmtBRL(pago)} sem mov bancária vinculada`, value: contrib })
      } else if (pago <= TOL_OK) {
        bMovSemPago.push({ id: p.id, label, description: `${mv.n} mov(s) somam ${fmtBRL(mv.soma)} mas valor_pago = 0`, value: contrib })
      } else {
        bMovDifPago.push({ id: p.id, label, description: `valor_pago ${fmtBRL(pago)} ≠ Σ ${mv.n} mov(s) ${fmtBRL(mv.soma)}`, value: contrib })
      }
    }
    const bucketsB: EquacaoBucket[] = [
      { id: 'b-pago-sem-mov',  label: 'Pago sem mov bancária vinculada', qtd: bPagoSemMov.length, valor: sumValor(bPagoSemMov), items: bPagoSemMov },
      { id: 'b-mov-sem-pago',  label: 'Mov vinculada sem virar valor_pago', qtd: bMovSemPago.length, valor: sumValor(bMovSemPago), items: bMovSemPago },
      { id: 'b-mov-dif-pago',  label: 'Mov ≠ valor_pago (rateio incorreto)', qtd: bMovDifPago.length, valor: sumValor(bMovDifPago), items: bMovDifPago },
    ].filter(b => b.qtd > 0)

    // ═════════════════════════════════════════════════════════════════════════
    // EQUAÇÃO C — EXTRATO: Σ todas movs = Σ movs conciliadas a alguma origem
    //
    // Refinamentos:
    //  - Transferências internas (categoria contém 'Transferência') são
    //    importadas dos 2 lados (entrada+saída). Ficam num bucket próprio
    //    e NÃO contam como gap.
    //  - Saídas órfãs sem categoria de transferência são candidatas a
    //    adiantamento — sinaliza pra criar parcela tipo='adiantamento'.
    // ═════════════════════════════════════════════════════════════════════════
    const isTransferencia = (m: typeof movs[number]): boolean =>
      (m.categoria ?? '').toLowerCase().includes('transferência') ||
      (m.categoria ?? '').toLowerCase().includes('transferencia')

    const sigmaExtrato = movs.reduce((s, m) => s + Math.abs(Number(m.valor || 0)), 0)
    const sigmaConciliadas = movs
      .filter(m => movsConciliadas.has(m.id))
      .reduce((s, m) => s + Math.abs(Number(m.valor || 0)), 0)
    // Transferências internas são "explicáveis" — somam à conciliada efetiva
    const sigmaTransfsInternas = movs
      .filter(m => !movsConciliadas.has(m.id) && isTransferencia(m))
      .reduce((s, m) => s + Math.abs(Number(m.valor || 0)), 0)
    const sigmaExplicado = sigmaConciliadas + sigmaTransfsInternas

    // Cada órfã é uma saída/entrada do extrato sem destino: contribui
    // negativamente ao gap (lado direito menor que esquerdo).
    // Transferências internas são "explicadas" — entram no direito mas
    // ficam num bucket informativo (não fazem parte do gap).
    const transfsInternas: BucketItem[] = []
    const possivelAdiant: BucketItem[] = []   // saídas órfãs não-transferência
    const orfasEntrada: BucketItem[] = []     // entradas órfãs não-transferência (capital de giro?)
    for (const m of movs) {
      if (movsConciliadas.has(m.id)) continue
      const valor = Math.abs(Number(m.valor || 0))
      const baseDesc = `${m.data} • ${m.tipo} • ${fmtBRL(valor)}${m.categoria ? ` • ${m.categoria}` : ''}`
      const item: BucketItem = {
        id: m.id,
        label: m.descricao?.slice(0, 80) || '(sem descrição)',
        description: baseDesc,
        value: valor,
      }
      if (isTransferencia(m)) {
        transfsInternas.push(item)
      } else if (m.tipo === 'saida') {
        possivelAdiant.push({ ...item, value: -valor }) // contribui negativo no gap
      } else if (m.tipo === 'entrada') {
        orfasEntrada.push({ ...item, value: -valor })
      }
    }

    const bucketsC: EquacaoBucket[] = [
      // Bucket informativo (não soma no gap, só explica que está OK).
      { id: 'transf-interna',     label: 'Transferências internas (explicadas — não é gap)', qtd: transfsInternas.length, valor: sumValor(transfsInternas), items: transfsInternas },
      { id: 'possivel-adiant',    label: 'Saídas sem origem (possível adiantamento)',         qtd: possivelAdiant.length,  valor: sumValor(possivelAdiant),  items: possivelAdiant },
      { id: 'mov-entrada-orfa',   label: 'Entradas sem origem (capital de giro?)',            qtd: orfasEntrada.length,    valor: sumValor(orfasEntrada),    items: orfasEntrada },
    ].filter(b => b.qtd > 0)

    // Gap C: positivo se há saídas/entradas sem origem (sigmaExplicado < sigmaExtrato).
    // Soma dos buckets `possivel-adiant` + `mov-entrada-orfa` = gapC.
    const gapC = sigmaExplicado - sigmaExtrato

    // ═════════════════════════════════════════════════════════════════════════
    // EQUAÇÃO D — CAIXA: cada saída do extrato tem destino rastreado
    //
    //   Σ saídas reais = Σ saídas conciliadas + Σ saídas órfãs
    //   (saídas reais = extrato − transferências internas)
    //
    // Por construção isso fecha em ~zero — toda saída ou está conciliada
    // ou não está. O valor da auditoria está no DRILL-DOWN dos buckets:
    // mostra COMO o dinheiro foi categorizado e sinaliza categorias com
    // problema (ex: amortizações avulsas que podem dobrar com pago_mut).
    //
    // A "dupla contagem" entre amortização avulsa e mutuo_parcelas marcado
    // manualmente vira uma inconsistência separada (ver useHealthChecks).
    // ═════════════════════════════════════════════════════════════════════════
    const sigmaSaidasExtrato = movs
      .filter(m => m.tipo === 'saida')
      .reduce((s, m) => s + Math.abs(Number(m.valor || 0)), 0)
    const sigmaSaidasTransf = movs
      .filter(m => m.tipo === 'saida' && isTransferencia(m))
      .reduce((s, m) => s + Math.abs(Number(m.valor || 0)), 0)
    const saidasReais = sigmaSaidasExtrato - sigmaSaidasTransf

    // Indexa links por mov para classificar cada saída em uma única categoria.
    const linksPorMov = new Map<string, ConciliacaoLink[]>()
    for (const l of links) {
      const arr = linksPorMov.get(l.movimentacao_id) ?? []
      arr.push(l)
      linksPorMov.set(l.movimentacao_id, arr)
    }

    const itensSaidaParcela: BucketItem[] = []
    const itensSaidaMutPar: BucketItem[] = []
    const itensSaidaMutAvulso: BucketItem[] = []
    const itensSaidaMedicao: BucketItem[] = []
    const itensSaidaOrfa: BucketItem[] = []

    for (const m of movs) {
      if (m.tipo !== 'saida') continue
      if (isTransferencia(m)) continue // tirado da equação
      const valor = Math.abs(Number(m.valor || 0))
      const item: BucketItem = {
        id: m.id,
        label: m.descricao?.slice(0, 80) || '(sem descrição)',
        description: `${m.data} • ${fmtBRL(valor)}${m.categoria ? ` • ${m.categoria}` : ''}`,
        value: valor,
      }
      const ls = linksPorMov.get(m.id) ?? []
      if (ls.length === 0) {
        itensSaidaOrfa.push(item)
        continue
      }
      const temParc = ls.some(l => l.parcela_id)
      const temMutP = ls.some(l => l.mutuo_parcela_id)
      const temMutAvulso = ls.some(l => l.mutuo_id && !l.mutuo_parcela_id)
      const temMedic = ls.some(l => l.medicao_id)
      // Prioridade pra classificar (parcela > mutuo_parcela > medicao > mutuo_avulso)
      if (temParc) itensSaidaParcela.push(item)
      else if (temMutP) itensSaidaMutPar.push(item)
      else if (temMedic) itensSaidaMedicao.push(item)
      else if (temMutAvulso) itensSaidaMutAvulso.push(item)
      else itensSaidaOrfa.push(item)
    }

    const sigmaCategorizadas =
      sumValor(itensSaidaParcela) +
      sumValor(itensSaidaMutPar) +
      sumValor(itensSaidaMutAvulso) +
      sumValor(itensSaidaMedicao) +
      sumValor(itensSaidaOrfa)
    const gapD = sigmaCategorizadas - saidasReais

    const bucketsD: EquacaoBucket[] = [
      // Buckets informativos (categoria + ação inline). Soma natural ≈ saidasReais.
      { id: 'd-saida-parcela',     label: 'Saídas → parcela (refletido em /pagamentos)',          qtd: itensSaidaParcela.length,    valor: sumValor(itensSaidaParcela),    items: itensSaidaParcela },
      { id: 'd-saida-mut-parc',    label: 'Saídas → parcela de mútuo',                            qtd: itensSaidaMutPar.length,     valor: sumValor(itensSaidaMutPar),     items: itensSaidaMutPar },
      { id: 'd-saida-mut-avulso',  label: 'Saídas → mútuo avulso (revisar — pode dobrar)',        qtd: itensSaidaMutAvulso.length,  valor: sumValor(itensSaidaMutAvulso),  items: itensSaidaMutAvulso },
      { id: 'd-saida-medicao',     label: 'Saídas → medição',                                     qtd: itensSaidaMedicao.length,    valor: sumValor(itensSaidaMedicao),    items: itensSaidaMedicao },
      { id: 'd-saida-orfa',        label: 'Saídas órfãs (sem origem cadastrada)',                 qtd: itensSaidaOrfa.length,       valor: sumValor(itensSaidaOrfa),       items: itensSaidaOrfa },
    ].filter(b => b.qtd > 0)

    return [
      {
        id: 'plano',
        title: 'A — Plano',
        formula: 'Σ Pedidos + Σ Despesas = Σ Parcelas',
        esquerdo: { label: 'Σ Origens', value: origensTotal },
        direito:  { label: 'Σ Parcelas', value: sigmaParcelas },
        gap: gapA,
        status: classify(gapA),
        buckets: bucketsA,
      },
      {
        id: 'execucao',
        title: 'B — Execução',
        formula: 'Σ valor_pago = Σ saídas conciliadas a parcela',
        esquerdo: { label: 'Σ valor_pago', value: sigmaPagoParc },
        direito:  { label: 'Σ saídas conc.', value: sigmaSaidasParcela },
        gap: gapB,
        status: classify(gapB),
        buckets: bucketsB,
      },
      {
        id: 'extrato',
        title: 'C — Extrato',
        formula: 'Σ Movs = Σ conciliadas + transferências internas',
        esquerdo: { label: 'Σ Extrato', value: sigmaExtrato },
        direito:  { label: 'Σ Explicadas', value: sigmaExplicado },
        gap: gapC,
        status: classify(gapC),
        buckets: bucketsC,
      },
      {
        id: 'caixa',
        title: 'D — Caixa',
        formula: 'Σ Saídas reais = Σ saídas categorizadas (por destino)',
        esquerdo: { label: 'Σ Saídas reais', value: saidasReais },
        direito:  { label: 'Σ Categorizadas', value: sigmaCategorizadas },
        gap: gapD,
        status: classify(gapD),
        buckets: bucketsD,
      },
    ]
  }, [parcelas, pedidos, despesas, movs, linksData, pagoMutuos, isLoading])

  const totalGap = equacoes.reduce((s, e) => s + Math.abs(e.gap), 0)

  return { equacoes, isLoading, totalGap }
}

function classify(gap: number): EquacaoStatus {
  const a = Math.abs(gap)
  if (a <= TOL_OK) return 'ok'
  if (a <= TOL_ERR) return 'warn'
  return 'error'
}

function sumValor(items: BucketItem[]): number {
  return items.reduce((s, i) => s + i.value, 0)
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
