/**
 * Build Fleury — Exportador XLSX de Conciliação
 *
 * Gera planilha com 6 abas:
 *   1. Resumo               — KPIs + reconciliação ao saldo (verdade do banco)
 *   2. Extrato              — 1 linha por mov bancária (TODAS), com flags de vínculo
 *   3. Realizado            — vínculos conciliação×origem (parcela/medição/mútuo)
 *   4. Encargos             — só vínculos com juros/multa/desconto > 0
 *   5. Aberto               — todo planejado com saldo > 0 (parcelas+medições+mútuos)
 *   6. Movs sem conciliação — movimentações bancárias sem match confirmado
 *
 * A aba Extrato é a fonte para chegar no saldo real:
 *   saldo_inicial_contas + Σ valor_assinado(Extrato) = saldo_sistema
 *
 * A aba Realizado é menor (só vínculos polimórficos) e NÃO fecha sozinha com
 * o saldo bancário — transferências internas e ajustes ficam no Extrato sem
 * vínculo de origem.
 */
import * as XLSX from 'xlsx'

// ─── Tipos espelhando as views SQL ──────────────────────────

export interface RealizadoRow {
  vinculo_id: string
  conciliacao_id: string
  conciliacao_status: string
  match_type: string | null
  confidence: number | null
  conciliacao_diferenca: number | null
  conciliado_em: string | null
  movimentacao_id: string
  data_mov: string
  descricao_mov: string | null
  valor_mov: number
  tipo_mov: string
  categoria_mov: string | null
  origem_extrato: string | null
  fitid: string | null
  conta_nome: string
  conta_banco: string | null
  origem_tipo: 'parcela' | 'medicao' | 'mutuo_parcela' | 'mutuo_principal' | 'orfa'
  origem_id: string | null
  valor_aplicado: number
  valor_juros: number
  valor_multa: number
  valor_desconto: number
  encargos_liquidos: number
  valor_bruto_aplicado: number
  vinculo_observacao: string | null
  origem_descricao: string | null
  contraparte_nome: string | null
  origem_valor_total: number | null
  origem_valor_realizado: number | null
  origem_data_prevista: string | null
  origem_status: string | null
  pedido_numero: number | null
  parcela_numero: number | null
  parcela_tipo: string | null
  mutuo_tipo: string | null
}

export interface AbertoRow {
  origem_tipo: 'parcela' | 'medicao' | 'mutuo_parcela'
  origem_id: string
  descricao: string
  contraparte_nome: string | null
  pedido_numero: number | null
  numero_parcela: number | null
  subtipo: string | null
  status: string
  data_prevista: string | null
  data_vencimento: string | null
  valor_total: number
  valor_realizado: number
  saldo_aberto: number
  dias_atraso: number | null
}

export interface ExtratoRow {
  movimentacao_id: string
  data_mov: string
  conta_nome: string
  conta_banco: string | null
  conta_saldo_inicial: number
  descricao: string | null
  tipo: string
  valor: number
  valor_assinado: number
  categoria: string | null
  origem_extrato: string | null
  fitid: string | null
  saldo_acumulado: number | null
  conciliado: boolean
  conciliado_em: string | null
  conciliacao_status: string
  n_vinculos: number
  soma_vinculos: number
  soma_principal: number
  soma_juros: number
  soma_multa: number
  soma_desconto: number
  origem_tipos: string | null
  diferenca_vinculo: number
  observacao: string | null
}

export interface NaoConciliadaRow {
  movimentacao_id: string
  data_mov: string
  descricao: string | null
  valor: number
  tipo: string
  categoria: string | null
  origem_extrato: string | null
  fitid: string | null
  conta_nome: string
  conta_banco: string | null
  observacao: string | null
  tem_sugestao: boolean
}

// ─── Helpers ────────────────────────────────────────────────

function fmtMoney(v: number | null | undefined): number {
  // Excel armazena number — formatação fica a cargo de cell format
  return Number(v ?? 0)
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return ''
  // já vem como ISO date (YYYY-MM-DD) ou timestamp; pega só a data
  return d.length >= 10 ? d.slice(0, 10) : d
}

function origemTipoLabel(t: string | null | undefined): string {
  switch (t) {
    case 'parcela':         return 'Parcela (compra)'
    case 'medicao':         return 'Medição (obra)'
    case 'mutuo_parcela':   return 'Parcela de mútuo'
    case 'mutuo_principal': return 'Mútuo (principal)'
    case 'orfa':            return 'Órfã'
    default:                return String(t ?? '')
  }
}

// ─── Construtores de cada aba ───────────────────────────────

function buildRealizadoSheet(rows: RealizadoRow[]) {
  const aoa: (string | number)[][] = [[
    'Data', 'Conta', 'Banco', 'Descrição extrato', 'Tipo', 'Valor mov.',
    'Origem', 'Pedido', 'Parcela #', 'Descrição da origem', 'Contraparte',
    'Principal aplicado', 'Juros', 'Multa', 'Desconto', 'Total bruto (mov)',
    'Total origem', 'Realizado origem', 'Saldo origem',
    'Status origem', 'Vencimento origem', 'Categoria', 'Match', 'Confiança',
    'Diferença concil.', 'Status concil.', 'Conciliado em', 'Observação',
    'FITID', 'Origem ID', 'Mov ID',
  ]]
  for (const r of rows) {
    const saldo = (r.origem_valor_total ?? 0) - (r.origem_valor_realizado ?? 0)
    aoa.push([
      fmtDate(r.data_mov),
      r.conta_nome ?? '',
      r.conta_banco ?? '',
      r.descricao_mov ?? '',
      r.tipo_mov ?? '',
      fmtMoney(r.valor_mov),
      origemTipoLabel(r.origem_tipo),
      r.pedido_numero ?? '',
      r.parcela_numero ?? '',
      r.origem_descricao ?? '',
      r.contraparte_nome ?? '',
      fmtMoney(r.valor_aplicado),
      fmtMoney(r.valor_juros),
      fmtMoney(r.valor_multa),
      fmtMoney(r.valor_desconto),
      fmtMoney(r.valor_bruto_aplicado),
      fmtMoney(r.origem_valor_total),
      fmtMoney(r.origem_valor_realizado),
      Number(saldo.toFixed(2)),
      r.origem_status ?? '',
      fmtDate(r.origem_data_prevista),
      r.categoria_mov ?? '',
      r.match_type ?? '',
      r.confidence ?? '',
      fmtMoney(r.conciliacao_diferenca),
      r.conciliacao_status ?? '',
      fmtDate(r.conciliado_em),
      r.vinculo_observacao ?? '',
      r.fitid ?? '',
      r.origem_id ?? '',
      r.movimentacao_id ?? '',
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 11 }, { wch: 18 }, { wch: 14 }, { wch: 40 }, { wch: 8 }, { wch: 14 },
    { wch: 18 }, { wch: 8 }, { wch: 9 }, { wch: 36 }, { wch: 28 },
    { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 },
    { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 12 }, { wch: 11 }, { wch: 14 }, { wch: 18 }, { wch: 10 },
    { wch: 14 }, { wch: 12 }, { wch: 20 }, { wch: 30 },
    { wch: 16 }, { wch: 36 }, { wch: 36 },
  ]
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  return ws
}

function buildEncargosSheet(rows: RealizadoRow[]) {
  // Filtra só vínculos com algum encargo > 0
  const comEncargos = rows.filter(r =>
    Number(r.valor_juros ?? 0) > 0 ||
    Number(r.valor_multa ?? 0) > 0 ||
    Number(r.valor_desconto ?? 0) > 0,
  )
  const aoa: (string | number)[][] = [[
    'Data', 'Conta', 'Descrição extrato', 'Origem', 'Pedido', 'Parcela #',
    'Descrição da origem', 'Contraparte', 'Principal', 'Juros', 'Multa',
    'Desconto', 'Encargos líquidos', 'Total bruto', 'Vencimento origem',
    'Dias atraso', 'Status origem', 'Observação',
  ]]
  for (const r of comEncargos) {
    let diasAtraso: number | string = ''
    if (r.origem_data_prevista && r.data_mov) {
      const dPrev = new Date(r.origem_data_prevista.slice(0, 10) + 'T00:00:00')
      const dMov  = new Date(r.data_mov.slice(0, 10) + 'T00:00:00')
      const ms = dMov.getTime() - dPrev.getTime()
      if (!Number.isNaN(ms)) diasAtraso = Math.floor(ms / 86400000)
    }
    aoa.push([
      fmtDate(r.data_mov),
      r.conta_nome ?? '',
      r.descricao_mov ?? '',
      origemTipoLabel(r.origem_tipo),
      r.pedido_numero ?? '',
      r.parcela_numero ?? '',
      r.origem_descricao ?? '',
      r.contraparte_nome ?? '',
      fmtMoney(r.valor_aplicado),
      fmtMoney(r.valor_juros),
      fmtMoney(r.valor_multa),
      fmtMoney(r.valor_desconto),
      fmtMoney(r.encargos_liquidos),
      fmtMoney(r.valor_bruto_aplicado),
      fmtDate(r.origem_data_prevista),
      diasAtraso,
      r.origem_status ?? '',
      r.vinculo_observacao ?? '',
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 11 }, { wch: 18 }, { wch: 40 }, { wch: 18 }, { wch: 8 }, { wch: 9 },
    { wch: 36 }, { wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 13 },
    { wch: 11 }, { wch: 14 }, { wch: 30 },
  ]
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  return ws
}

function buildAbertoSheet(rows: AbertoRow[]) {
  const aoa: (string | number)[][] = [[
    'Origem', 'Pedido', 'Parcela #', 'Descrição', 'Contraparte', 'Subtipo',
    'Status', 'Data prevista', 'Vencimento', 'Valor total', 'Realizado',
    'Saldo em aberto', 'Dias atraso', 'Origem ID',
  ]]
  for (const r of rows) {
    aoa.push([
      origemTipoLabel(r.origem_tipo),
      r.pedido_numero ?? '',
      r.numero_parcela ?? '',
      r.descricao ?? '',
      r.contraparte_nome ?? '',
      r.subtipo ?? '',
      r.status ?? '',
      fmtDate(r.data_prevista),
      fmtDate(r.data_vencimento),
      fmtMoney(r.valor_total),
      fmtMoney(r.valor_realizado),
      fmtMoney(r.saldo_aberto),
      r.dias_atraso ?? '',
      r.origem_id ?? '',
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 18 }, { wch: 8 }, { wch: 9 }, { wch: 40 }, { wch: 28 }, { wch: 12 },
    { wch: 12 }, { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 11 }, { wch: 36 },
  ]
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  return ws
}

function buildExtratoSheet(rows: ExtratoRow[]) {
  // Ordena por conta + data + id (estável) para o saldo acumular corretamente
  const sorted = [...rows].sort((a, b) => {
    if (a.conta_nome !== b.conta_nome) return a.conta_nome.localeCompare(b.conta_nome)
    if (a.data_mov   !== b.data_mov)   return a.data_mov.localeCompare(b.data_mov)
    return a.movimentacao_id.localeCompare(b.movimentacao_id)
  })

  // Calcula saldo corrente por conta (saldo_inicial + Σ valor_assinado até esta linha)
  const saldoPorConta = new Map<string, number>()
  const aoa: (string | number)[][] = [[
    'Data', 'Conta', 'Banco', 'Descrição', 'Tipo', 'Valor', 'Valor assinado',
    'Saldo corrente (sistema)', 'Saldo extrato (OFX)', 'Categoria',
    'Conciliado?', 'Status', 'Origens vinculadas', 'Nº vínculos',
    'Soma vínculos', 'Principal', 'Juros', 'Multa', 'Desconto',
    'Diferença (mov - vínculos)', 'Observação', 'FITID', 'Mov ID',
  ]]
  for (const r of sorted) {
    const prev = saldoPorConta.get(r.conta_nome)
    const base = prev ?? Number(r.conta_saldo_inicial ?? 0)
    const saldoCorrente = Number((base + Number(r.valor_assinado ?? 0)).toFixed(2))
    saldoPorConta.set(r.conta_nome, saldoCorrente)

    aoa.push([
      fmtDate(r.data_mov),
      r.conta_nome ?? '',
      r.conta_banco ?? '',
      r.descricao ?? '',
      r.tipo ?? '',
      fmtMoney(r.valor),
      fmtMoney(r.valor_assinado),
      saldoCorrente,
      r.saldo_acumulado != null ? fmtMoney(r.saldo_acumulado) : '',
      r.categoria ?? '',
      r.conciliado ? 'Sim' : 'Não',
      r.conciliacao_status ?? '',
      r.origem_tipos ?? '',
      r.n_vinculos ?? 0,
      fmtMoney(r.soma_vinculos),
      fmtMoney(r.soma_principal),
      fmtMoney(r.soma_juros),
      fmtMoney(r.soma_multa),
      fmtMoney(r.soma_desconto),
      fmtMoney(r.diferenca_vinculo),
      r.observacao ?? '',
      r.fitid ?? '',
      r.movimentacao_id ?? '',
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 11 }, { wch: 18 }, { wch: 14 }, { wch: 40 }, { wch: 8 }, { wch: 13 }, { wch: 14 },
    { wch: 17 }, { wch: 15 }, { wch: 14 },
    { wch: 11 }, { wch: 14 }, { wch: 22 }, { wch: 10 },
    { wch: 14 }, { wch: 13 }, { wch: 11 }, { wch: 11 }, { wch: 11 },
    { wch: 18 }, { wch: 30 }, { wch: 16 }, { wch: 36 },
  ]
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  return ws
}

function buildNaoConciliadasSheet(rows: NaoConciliadaRow[]) {
  const aoa: (string | number)[][] = [[
    'Data', 'Conta', 'Banco', 'Descrição', 'Tipo', 'Valor', 'Categoria',
    'Origem', 'Tem sugestão?', 'Observação', 'FITID', 'Mov ID',
  ]]
  for (const r of rows) {
    aoa.push([
      fmtDate(r.data_mov),
      r.conta_nome ?? '',
      r.conta_banco ?? '',
      r.descricao ?? '',
      r.tipo ?? '',
      fmtMoney(r.valor),
      r.categoria ?? '',
      r.origem_extrato ?? '',
      r.tem_sugestao ? 'Sim' : 'Não',
      r.observacao ?? '',
      r.fitid ?? '',
      r.movimentacao_id ?? '',
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 11 }, { wch: 18 }, { wch: 14 }, { wch: 40 }, { wch: 8 }, { wch: 14 },
    { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 36 },
  ]
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  return ws
}

function buildResumoSheet(
  realizado: RealizadoRow[],
  aberto: AbertoRow[],
  naoConciliadas: NaoConciliadaRow[],
  extrato: ExtratoRow[],
) {
  // Totais por origem (Realizado)
  const realizadoPorOrigem = new Map<string, { qtd: number; total: number }>()
  for (const r of realizado) {
    const key = origemTipoLabel(r.origem_tipo)
    const acc = realizadoPorOrigem.get(key) ?? { qtd: 0, total: 0 }
    acc.qtd += 1
    acc.total += Number(r.valor_aplicado ?? 0)
    realizadoPorOrigem.set(key, acc)
  }

  // Totais por origem (Aberto)
  const abertoPorOrigem = new Map<string, { qtd: number; saldo: number }>()
  for (const r of aberto) {
    const key = origemTipoLabel(r.origem_tipo)
    const acc = abertoPorOrigem.get(key) ?? { qtd: 0, saldo: 0 }
    acc.qtd += 1
    acc.saldo += Number(r.saldo_aberto ?? 0)
    abertoPorOrigem.set(key, acc)
  }

  // Realizado por mês
  const porMes = new Map<string, { entradas: number; saidas: number }>()
  for (const r of realizado) {
    const mes = fmtDate(r.data_mov).slice(0, 7) // YYYY-MM
    if (!mes) continue
    const acc = porMes.get(mes) ?? { entradas: 0, saidas: 0 }
    const v = Number(r.valor_aplicado ?? 0)
    if (r.tipo_mov === 'entrada') acc.entradas += v
    else                          acc.saidas   += v
    porMes.set(mes, acc)
  }

  // Vencidas
  const vencidas = aberto.filter(r => (r.dias_atraso ?? 0) > 0)
  const totalVencido = vencidas.reduce((s, r) => s + Number(r.saldo_aberto ?? 0), 0)

  // ─── Reconciliação ao saldo (verdade do banco) ───────────────
  // Agregado por conta a partir da aba Extrato.
  const porConta = new Map<string, {
    saldo_inicial: number
    entradas: number
    saidas: number
    ultimo_saldo_acumulado: number | null
    ultima_data: string
  }>()
  for (const r of extrato) {
    const k = r.conta_nome
    const acc = porConta.get(k) ?? {
      saldo_inicial: Number(r.conta_saldo_inicial ?? 0),
      entradas: 0,
      saidas: 0,
      ultimo_saldo_acumulado: null,
      ultima_data: '',
    }
    const v = Number(r.valor ?? 0)
    if (r.tipo === 'entrada') acc.entradas += v
    else if (r.tipo === 'saida') acc.saidas += v
    const dt = fmtDate(r.data_mov)
    if (r.saldo_acumulado != null && dt >= acc.ultima_data) {
      acc.ultimo_saldo_acumulado = Number(r.saldo_acumulado)
      acc.ultima_data = dt
    }
    porConta.set(k, acc)
  }

  const aoa: (string | number)[][] = []
  aoa.push(['Resumo da Conciliação', '', '', ''])
  aoa.push(['Gerado em', new Date().toISOString().slice(0, 19).replace('T', ' '), '', ''])
  aoa.push([])
  aoa.push(['RECONCILIAÇÃO AO SALDO (verdade do banco)'])
  aoa.push(['Conta', 'Saldo inicial + Entradas − Saídas = Saldo sistema', 'Saldo extrato (OFX)', 'Divergência'])
  let totSI = 0, totIn = 0, totOut = 0, totSysObs: number | null = 0
  for (const [conta, v] of porConta) {
    const sysFinal = Number((v.saldo_inicial + v.entradas - v.saidas).toFixed(2))
    const obs = v.ultimo_saldo_acumulado
    const div = obs != null ? Number((sysFinal - obs).toFixed(2)) : ''
    aoa.push([
      conta,
      `${fmtMoney(v.saldo_inicial)} + ${fmtMoney(v.entradas)} − ${fmtMoney(v.saidas)} = ${fmtMoney(sysFinal)}`,
      obs != null ? fmtMoney(obs) : '—',
      div === '' ? '—' : div,
    ])
    totSI += v.saldo_inicial
    totIn += v.entradas
    totOut += v.saidas
    if (obs != null && totSysObs != null) totSysObs += obs
    else if (obs == null) totSysObs = null
  }
  const totSys = Number((totSI + totIn - totOut).toFixed(2))
  aoa.push([
    'TOTAL',
    `${fmtMoney(totSI)} + ${fmtMoney(totIn)} − ${fmtMoney(totOut)} = ${fmtMoney(totSys)}`,
    totSysObs != null ? fmtMoney(totSysObs) : 'parcial',
    totSysObs != null ? Number((totSys - totSysObs).toFixed(2)) : '—',
  ])
  aoa.push([])
  aoa.push(['REALIZADO (conciliações confirmadas/aprovadas)'])
  aoa.push(['Origem', 'Qtd vínculos', 'Total aplicado', ''])
  for (const [origem, v] of realizadoPorOrigem) {
    aoa.push([origem, v.qtd, fmtMoney(v.total), ''])
  }
  const totalRealizado = realizado.reduce((s, r) => s + Number(r.valor_aplicado ?? 0), 0)
  aoa.push([
    'TOTAL',
    realizado.length,
    fmtMoney(totalRealizado),
    '',
  ])
  // Nota: Realizado mostra só vínculos (parcela/medição/mútuo). Movs conciliadas
  // sem vínculo (transferências, encontro de contas, ajustes) NÃO entram aqui.
  // Para chegar no saldo bancário, use a aba "Extrato".
  const totalExtratoConcAbs = extrato
    .filter(r => r.conciliado && r.n_vinculos === 0)
    .reduce((s, r) => s + Number(r.valor ?? 0), 0)
  if (totalExtratoConcAbs > 0.01) {
    aoa.push([
      'Movs conciliadas SEM vínculo (transf. interna / ajustes)',
      extrato.filter(r => r.conciliado && r.n_vinculos === 0).length,
      fmtMoney(totalExtratoConcAbs),
      'não aparece em Realizado — ver aba Extrato',
    ])
  }
  aoa.push([])
  aoa.push(['PLANEJADO EM ABERTO (saldo > 0)'])
  aoa.push(['Origem', 'Qtd', 'Saldo aberto', ''])
  for (const [origem, v] of abertoPorOrigem) {
    aoa.push([origem, v.qtd, fmtMoney(v.saldo), ''])
  }
  aoa.push([
    'TOTAL',
    aberto.length,
    fmtMoney(aberto.reduce((s, r) => s + Number(r.saldo_aberto ?? 0), 0)),
    '',
  ])
  // Encargos do período (juros / multa / desconto)
  const totJuros    = realizado.reduce((s, r) => s + Number(r.valor_juros    ?? 0), 0)
  const totMulta    = realizado.reduce((s, r) => s + Number(r.valor_multa    ?? 0), 0)
  const totDesconto = realizado.reduce((s, r) => s + Number(r.valor_desconto ?? 0), 0)
  const qtdComEncargo = realizado.filter(r =>
    Number(r.valor_juros ?? 0) > 0 ||
    Number(r.valor_multa ?? 0) > 0 ||
    Number(r.valor_desconto ?? 0) > 0,
  ).length
  if (totJuros + totMulta + totDesconto > 0.01) {
    aoa.push([])
    aoa.push(['ENCARGOS DO PERÍODO (atraso / antecipação)'])
    aoa.push(['Tipo', 'Total', '', ''])
    aoa.push(['Juros',    fmtMoney(totJuros),    '', ''])
    aoa.push(['Multa',    fmtMoney(totMulta),    '', ''])
    aoa.push(['Desconto', fmtMoney(totDesconto), '', ''])
    aoa.push(['Encargos líquidos (juros + multa − desconto)',
      fmtMoney(totJuros + totMulta - totDesconto),
      `${qtdComEncargo} vínculos`, 'ver aba "Encargos"',
    ])
  }
  aoa.push([])
  aoa.push(['ALERTAS'])
  aoa.push(['Vencidas (dias_atraso > 0)', vencidas.length, fmtMoney(totalVencido), ''])
  aoa.push(['Movs sem conciliação', naoConciliadas.length, '', ''])
  aoa.push([])
  aoa.push(['REALIZADO POR MÊS'])
  aoa.push(['Mês', 'Entradas', 'Saídas', 'Líquido'])
  const meses = Array.from(porMes.keys()).sort()
  for (const mes of meses) {
    const v = porMes.get(mes)!
    aoa.push([mes, fmtMoney(v.entradas), fmtMoney(v.saidas), fmtMoney(v.entradas - v.saidas)])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 16 }, { wch: 16 }]
  return ws
}

// ─── Export público ─────────────────────────────────────────

export interface ConciliacaoExportInput {
  realizado: RealizadoRow[]
  aberto: AbertoRow[]
  naoConciliadas: NaoConciliadaRow[]
  extrato: ExtratoRow[]
  /** Nome base do arquivo (sem extensão). Default: conciliacao_export_YYYY-MM-DD */
  filename?: string
}

export function exportConciliacaoXlsx(input: ConciliacaoExportInput): void {
  const { realizado, aberto, naoConciliadas, extrato } = input
  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(wb, buildResumoSheet(realizado, aberto, naoConciliadas, extrato), 'Resumo')
  XLSX.utils.book_append_sheet(wb, buildExtratoSheet(extrato), 'Extrato')
  XLSX.utils.book_append_sheet(wb, buildRealizadoSheet(realizado), 'Realizado')
  XLSX.utils.book_append_sheet(wb, buildEncargosSheet(realizado), 'Encargos')
  XLSX.utils.book_append_sheet(wb, buildAbertoSheet(aberto), 'Aberto')
  XLSX.utils.book_append_sheet(wb, buildNaoConciliadasSheet(naoConciliadas), 'Movs sem conciliacao')

  const today = new Date().toISOString().slice(0, 10)
  const base = input.filename ?? `conciliacao_export_${today}`
  const filename = base.endsWith('.xlsx') ? base : `${base}.xlsx`

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 200)
}
