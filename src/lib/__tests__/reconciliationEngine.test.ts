import { describe, it, expect } from 'vitest'
import { reconcile, type PayableReceivable, type BankRule } from '@/lib/reconciliationEngine'
import type { StandardTransaction } from '@/lib/ofxParser'

function txn(over: Partial<StandardTransaction> = {}): StandardTransaction {
  return {
    fitid: 'f1',
    date: '2026-05-10',
    amount: -1000,
    type: 'debit',
    memoRaw: 'PAGAMENTO',
    memoClean: 'PAGAMENTO',
    balance: 0,
    source: 'ofx',
    ...over,
  }
}

function parcela(over: Partial<PayableReceivable> = {}): PayableReceivable {
  return {
    id: 'p1',
    valor: 1000,
    dataVencimento: '2026-05-10',
    dataPagamento: null,
    valorPago: null,
    status: 'a_vencer',
    descricao: null,
    fornecedorNome: null,
    documentoRef: null,
    tipo: 'pagar',
    ...over,
  }
}

describe('reconcile — exact match', () => {
  it('valor e data exatos → exact com confiança máxima', () => {
    const r = reconcile([txn()], [parcela()])
    const m = r.matches[0]!
    expect(m.matchType).toBe('exact')
    expect(m.confidence).toBeGreaterThanOrEqual(95)
    expect(m.parcelas[0]!.parcela.id).toBe('p1')
    expect(m.diferenca).toBe(0)
    expect(r.stats.exact).toBe(1)
  })

  it('tolerância de valor 0.50: diferença de 0.49 ainda é exact', () => {
    const r = reconcile([txn({ amount: -1000.49 })], [parcela()])
    expect(r.matches[0]!.matchType).toBe('exact')
    expect(r.matches[0]!.diferenca).toBe(0.49)
  })

  it('diferença de 0.51 estoura a tolerância — cai para partial', () => {
    const r = reconcile([txn({ amount: -1000.51 })], [parcela()])
    expect(r.matches[0]!.matchType).toBe('partial')
  })

  it('tolerância de data 3 dias: 2 dias de distância ainda casa', () => {
    const r = reconcile([txn({ date: '2026-05-12' })], [parcela()])
    expect(r.matches[0]!.matchType).toBe('exact')
    expect(r.matches[0]!.confidence).toBeLessThan(95)
  })

  it('mesmo valor mas 10 dias de distância → none', () => {
    const r = reconcile([txn({ date: '2026-05-20' })], [parcela()])
    expect(r.matches[0]!.matchType).toBe('none')
    expect(r.stats.noMatch).toBe(1)
  })

  it('parcela paga compara contra valor_pago e usa data_pagamento', () => {
    const p = parcela({
      status: 'paga',
      valorPago: 980,
      dataPagamento: '2026-05-10',
      dataVencimento: '2026-04-30',
    })
    const r = reconcile([txn({ amount: -980 })], [p])
    const m = r.matches[0]!
    expect(m.matchType).toBe('exact')
    expect(m.confidence).toBe(100)
    expect(m.parcelas[0]!.valorAplicado).toBe(980)
  })
})

describe('reconcile — key match', () => {
  it('NF no memo casa parcela fora da janela de datas', () => {
    const p = parcela({ documentoRef: 'NF 12345', dataVencimento: '2026-04-01' })
    const t = txn({ memoRaw: 'PAG NF 12345 CONSTRUTORA', memoClean: 'PAG NF 12345' })
    const r = reconcile([t], [p])
    const m = r.matches[0]!
    expect(m.matchType).toBe('key')
    expect(m.confidence).toBe(90)
    expect(m.parcelas[0]!.parcela.id).toBe('p1')
  })

  it('CNPJ no memo casa parcela pelo documentoRef', () => {
    const p = parcela({ documentoRef: '12.345.678/0001-90', dataVencimento: '2026-04-01' })
    const t = txn({ memoRaw: 'PIX 12345678000190', memoClean: 'PIX' })
    const r = reconcile([t], [p])
    expect(r.matches[0]!.matchType).toBe('key')
  })
})

describe('reconcile — grouped match (1:N)', () => {
  it('uma transação cobre duas parcelas que somam o valor', () => {
    const ps = [
      parcela({ id: 'g1', valor: 100 }),
      parcela({ id: 'g2', valor: 200 }),
    ]
    const r = reconcile([txn({ amount: -300 })], ps)
    const m = r.matches[0]!
    expect(m.matchType).toBe('grouped')
    expect(m.parcelas).toHaveLength(2)
    expect(m.parcelas.map((mp) => mp.parcela.id).sort()).toEqual(['g1', 'g2'])
    expect(m.diferenca).toBe(0)
    expect(m.confidence).toBe(95)
  })

  it('soma fora da tolerância não agrupa', () => {
    const ps = [
      parcela({ id: 'g1', valor: 100 }),
      parcela({ id: 'g2', valor: 150 }),
    ]
    const r = reconcile([txn({ amount: -300 })], ps)
    expect(r.matches[0]!.matchType).toBe('none')
  })
})

describe('reconcile — partial match', () => {
  it('valor próximo (dentro de 5%) sugere juros/multa', () => {
    const r = reconcile([txn({ amount: -1020 })], [parcela()])
    const m = r.matches[0]!
    expect(m.matchType).toBe('partial')
    expect(m.confidence).toBe(60)
    expect(m.diferenca).toBe(20)
    expect(m.sugestaoDiferenca).toBe('Juros / Multa Recebida')
  })

  it('valor recebido menor sugere taxa bancária', () => {
    const r = reconcile([txn({ amount: -990 })], [parcela()])
    const m = r.matches[0]!
    expect(m.matchType).toBe('partial')
    expect(m.diferenca).toBe(-10)
    expect(m.sugestaoDiferenca).toBe('Taxa Bancária / Tarifa')
  })
})

describe('reconcile — regras bancárias', () => {
  const regra: BankRule = {
    id: 'r1',
    padraoTexto: 'TARIFA',
    tipoMatch: 'contains',
    valorMin: null,
    valorMax: null,
    acao: 'ignorar',
    categoria: null,
    fornecedorNome: null,
    descricaoPadrao: null,
  }

  it('regra "ignorar" vence qualquer outra estratégia', () => {
    const t = txn({ amount: -1000, memoRaw: 'TARIFA BANCARIA', memoClean: 'TARIFA' })
    const r = reconcile([t], [parcela()], { bankRules: [regra] })
    const m = r.matches[0]!
    expect(m.matchType).toBe('rule')
    expect(m.parcelas).toHaveLength(0)
    expect(m.sugestaoDiferenca).toBe('Ignorado por regra')
    expect(r.stats.rule).toBe(1)
  })

  it('regra com faixa de valor não casa fora da faixa', () => {
    const comFaixa = { ...regra, valorMax: 50 }
    const t = txn({ amount: -1000, memoRaw: 'TARIFA BANCARIA', memoClean: 'TARIFA' })
    const r = reconcile([t], [parcela()], { bankRules: [comFaixa] })
    expect(r.matches[0]!.matchType).toBe('exact')
  })
})

describe('reconcile — consumo do pool e estatísticas', () => {
  it('parcela matchada sai do pool: segunda transação igual fica sem match', () => {
    const ts = [txn({ fitid: 'f1' }), txn({ fitid: 'f2' })]
    const r = reconcile(ts, [parcela()])
    expect(r.matches[0]!.matchType).toBe('exact')
    expect(r.matches[1]!.matchType).toBe('none')
    expect(r.stats.exact).toBe(1)
    expect(r.stats.noMatch).toBe(1)
  })

  it('stats fecham: valorConciliado + valorPendente = total movimentado', () => {
    const ts = [
      txn({ fitid: 'f1', amount: -1000 }),
      txn({ fitid: 'f2', amount: -77.77, memoRaw: 'SEM MATCH', memoClean: 'SEM MATCH' }),
    ]
    const r = reconcile(ts, [parcela()])
    expect(r.stats.total).toBe(2)
    expect(r.stats.valorConciliado).toBe(1000)
    expect(r.stats.valorPendente).toBe(77.77)
  })

  it('sem transações → resultado vazio', () => {
    const r = reconcile([], [parcela()])
    expect(r.matches).toEqual([])
    expect(r.stats.total).toBe(0)
  })
})
