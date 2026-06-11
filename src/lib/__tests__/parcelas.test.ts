import { describe, it, expect } from 'vitest'
import {
  localDate,
  parsearCondicao,
  ajustarDiaUtil,
  gerarParcelas,
  regenerarParcelas,
  dataEfetivaParcela,
} from '@/lib/parcelas'

describe('localDate — bug histórico de timezone', () => {
  it("'2026-04-04' dá dia 4 local (new Date daria 3 em UTC-3)", () => {
    const d = localDate('2026-04-04')
    expect(d.getDate()).toBe(4)
    expect(d.getMonth()).toBe(3)
    expect(d.getFullYear()).toBe(2026)
  })

  it('preserva o dia da semana correto (04/04/2026 é sábado)', () => {
    expect(localDate('2026-04-04').getDay()).toBe(6)
  })

  it('primeiro dia do ano não volta para o ano anterior', () => {
    const d = localDate('2026-01-01')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getDate()).toBe(1)
  })
})

describe('parsearCondicao', () => {
  it('"30/60" → [30, 60]', () => {
    expect(parsearCondicao('30/60')).toEqual([30, 60])
  })

  it('"28/56/84" → [28, 56, 84]', () => {
    expect(parsearCondicao('28/56/84')).toEqual([28, 56, 84])
  })

  it('"0/17" preserva o zero da entrada', () => {
    expect(parsearCondicao('0/17')).toEqual([0, 17])
  })

  it('parcela única: "49" → [49]', () => {
    expect(parsearCondicao('49')).toEqual([49])
  })

  it('"à vista" (com e sem acento) → [0]', () => {
    expect(parsearCondicao('à vista')).toEqual([0])
    expect(parsearCondicao('A VISTA')).toEqual([0])
    expect(parsearCondicao('avista')).toEqual([0])
  })

  it('vazio/null/undefined → [0]', () => {
    expect(parsearCondicao('')).toEqual([0])
    expect(parsearCondicao('   ')).toEqual([0])
    expect(parsearCondicao(null)).toEqual([0])
    expect(parsearCondicao(undefined)).toEqual([0])
  })

  it('separadores alternativos: vírgula, ponto-e-vírgula, espaço', () => {
    expect(parsearCondicao('30,60')).toEqual([30, 60])
    expect(parsearCondicao('30;60')).toEqual([30, 60])
    expect(parsearCondicao('30 60')).toEqual([30, 60])
  })

  it('negativo vira 0 (clamp)', () => {
    expect(parsearCondicao('-10/30')).toEqual([0, 30])
  })
})

describe('ajustarDiaUtil', () => {
  it('sábado → sexta (volta 1 dia)', () => {
    const adj = ajustarDiaUtil(localDate('2026-04-04'))
    expect(adj.getDay()).toBe(5)
    expect(adj.getDate()).toBe(3)
  })

  it('domingo → segunda (avança 1 dia)', () => {
    const adj = ajustarDiaUtil(localDate('2026-04-05'))
    expect(adj.getDay()).toBe(1)
    expect(adj.getDate()).toBe(6)
  })

  it('dia útil não muda', () => {
    const adj = ajustarDiaUtil(localDate('2026-04-03'))
    expect(adj.getDate()).toBe(3)
  })

  it('não muta a data original', () => {
    const original = localDate('2026-04-04')
    ajustarDiaUtil(original)
    expect(original.getDate()).toBe(4)
  })
})

describe('gerarParcelas', () => {
  const base = {
    pedidoId: 'ped-1',
    companyId: 'co-1',
    dataEntrega: localDate('2026-04-15'),
  }

  it('"30/60" divide igualmente e cai nas datas certas', () => {
    const ps = gerarParcelas({ ...base, valorTotal: 21528, condPagamento: '30/60' })
    expect(ps).toHaveLength(2)
    expect(ps[0]!.valor).toBe(10764)
    expect(ps[1]!.valor).toBe(10764)
    expect(ps[0]!.data_vencimento).toBe('2026-05-15')
    // 14/06/2026 é domingo → segunda 15/06
    expect(ps[1]!.data_vencimento).toBe('2026-06-15')
    expect(ps.map((p) => p.numero_parcela)).toEqual([1, 2])
    expect(ps.every((p) => p.status === 'futura')).toBe(true)
  })

  it('última parcela absorve os centavos: 100 em 3x → 33,33 + 33,33 + 33,34', () => {
    const ps = gerarParcelas({ ...base, valorTotal: 100, condPagamento: '30/60/90' })
    expect(ps.map((p) => p.valor)).toEqual([33.33, 33.33, 33.34])
    const soma = ps.reduce((s, p) => s + p.valor, 0)
    expect(Math.abs(soma - 100)).toBeLessThan(0.001)
  })

  it('soma sempre fecha com o total (5 parcelas com dízima)', () => {
    const ps = gerarParcelas({ ...base, valorTotal: 17940.01, condPagamento: '21/36/51/67/83' })
    expect(ps).toHaveLength(5)
    const soma = ps.reduce((s, p) => s + p.valor, 0)
    expect(Math.abs(soma - 17940.01)).toBeLessThan(0.001)
  })

  it('vencimento em sábado é antecipado para sexta', () => {
    // 15/04 + 17 = 02/05/2026 (sábado) → 01/05 (sexta)
    const ps = gerarParcelas({ ...base, valorTotal: 100, condPagamento: '0/17' })
    expect(ps[0]!.data_vencimento).toBe('2026-04-15')
    expect(ps[1]!.data_vencimento).toBe('2026-05-01')
  })

  it('"à vista" → 1 parcela na entrega com valor cheio', () => {
    const ps = gerarParcelas({ ...base, valorTotal: 5000, condPagamento: 'à vista' })
    expect(ps).toHaveLength(1)
    expect(ps[0]!.valor).toBe(5000)
    expect(ps[0]!.data_vencimento).toBe('2026-04-15')
  })

  it('valorTotal 0 ou negativo → []', () => {
    expect(gerarParcelas({ ...base, valorTotal: 0, condPagamento: '30/60' })).toEqual([])
    expect(gerarParcelas({ ...base, valorTotal: -10, condPagamento: '30/60' })).toEqual([])
  })

  it('carrega company_id e pedido_id em todas as parcelas', () => {
    const ps = gerarParcelas({ ...base, valorTotal: 100, condPagamento: '30/60' })
    expect(ps.every((p) => p.company_id === 'co-1' && p.pedido_id === 'ped-1')).toBe(true)
  })
})

describe('regenerarParcelas', () => {
  const base = {
    pedidoId: 'ped-1',
    companyId: 'co-1',
    valorTotal: 1000,
    condPagamento: '30/60',
    novaDataEntrega: localDate('2026-04-15'),
  }

  it('sem parcelas pagas: deleta todas e recria pelo total', () => {
    const r = regenerarParcelas({
      ...base,
      parcelasExistentes: [
        { id: 'a', status: 'futura', valor_pago: 0 },
        { id: 'b', status: 'a_vencer', valor_pago: 0 },
      ],
    })
    expect(r.parcelasParaDeletar).toEqual(['a', 'b'])
    expect(r.parcelasParaCriar).toHaveLength(2)
    const soma = r.parcelasParaCriar.reduce((s, p) => s + p.valor, 0)
    expect(Math.abs(soma - 1000)).toBeLessThan(0.001)
  })

  it('preserva parcelas pagas: não deleta e redistribui só o restante', () => {
    const r = regenerarParcelas({
      ...base,
      parcelasExistentes: [
        { id: 'paga-1', status: 'paga', valor_pago: 500 },
        { id: 'aberta-1', status: 'a_vencer', valor_pago: 0 },
      ],
    })
    expect(r.parcelasParaDeletar).toEqual(['aberta-1'])
    const soma = r.parcelasParaCriar.reduce((s, p) => s + p.valor, 0)
    expect(Math.abs(soma - 500)).toBeLessThan(0.001)
  })

  it('parcialmente_paga conta como paga (não deleta) e abate o valor_pago', () => {
    const r = regenerarParcelas({
      ...base,
      parcelasExistentes: [
        { id: 'parcial-1', status: 'parcialmente_paga', valor_pago: 333.33 },
        { id: 'aberta-1', status: 'futura', valor_pago: 0 },
      ],
    })
    expect(r.parcelasParaDeletar).toEqual(['aberta-1'])
    const soma = r.parcelasParaCriar.reduce((s, p) => s + p.valor, 0)
    expect(Math.abs(soma - 666.67)).toBeLessThan(0.001)
  })

  it('numero_parcela continua após as pagas (offset)', () => {
    const r = regenerarParcelas({
      ...base,
      parcelasExistentes: [
        { id: 'paga-1', status: 'paga', valor_pago: 300 },
        { id: 'paga-2', status: 'paga', valor_pago: 200 },
        { id: 'aberta-1', status: 'a_vencer', valor_pago: 0 },
      ],
    })
    expect(r.parcelasParaCriar.map((p) => p.numero_parcela)).toEqual([3, 4])
  })

  it('última parcela nova absorve os centavos do restante', () => {
    const r = regenerarParcelas({
      ...base,
      condPagamento: '30/60/90',
      parcelasExistentes: [{ id: 'paga-1', status: 'paga', valor_pago: 900 }],
    })
    // restante 100 em 3x
    expect(r.parcelasParaCriar.map((p) => p.valor)).toEqual([33.33, 33.33, 33.34])
  })

  it('tudo pago (restante <= 0): não cria nada', () => {
    const r = regenerarParcelas({
      ...base,
      parcelasExistentes: [
        { id: 'paga-1', status: 'paga', valor_pago: 1000 },
        { id: 'aberta-1', status: 'a_vencer', valor_pago: 0 },
      ],
    })
    expect(r.parcelasParaDeletar).toEqual(['aberta-1'])
    expect(r.parcelasParaCriar).toEqual([])
  })
})

describe('dataEfetivaParcela', () => {
  it('prioridade 1: data_pagamento_real', () => {
    expect(
      dataEfetivaParcela({
        data_vencimento: '2026-04-01',
        data_prevista_pagamento: '2026-04-10',
        data_pagamento_real: '2026-04-05',
      })
    ).toBe('2026-04-05')
  })

  it('prioridade 2: data_prevista_pagamento', () => {
    expect(
      dataEfetivaParcela({
        data_vencimento: '2026-04-01',
        data_prevista_pagamento: '2026-04-10',
        data_pagamento_real: null,
      })
    ).toBe('2026-04-10')
  })

  it('fallback: data_vencimento', () => {
    expect(dataEfetivaParcela({ data_vencimento: '2026-04-01' })).toBe('2026-04-01')
  })

  it('tudo nulo → null', () => {
    expect(dataEfetivaParcela({})).toBeNull()
  })
})
