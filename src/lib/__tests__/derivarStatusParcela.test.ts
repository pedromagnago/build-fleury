import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/contexts/ProjectContext', () => ({ useProject: () => ({ companyId: null }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { derivarStatusParcela } from '@/hooks/useConciliacao'

const base = {
  valor: 100,
  dataReferencia: '2026-06-20',
  dataEfetiva: '2026-06-11',
  hoje: '2026-06-11',
}

describe('derivarStatusParcela — saldo zerado', () => {
  it('valor_pago 0 com vencimento futuro → a_vencer e zera data real', () => {
    const r = derivarStatusParcela({ ...base, valorPago: 0 })
    expect(r).toEqual({ status: 'a_vencer', data_pagamento_real: null })
  })

  it('valor_pago 0 com vencimento passado → vencida', () => {
    const r = derivarStatusParcela({ ...base, valorPago: 0, dataReferencia: '2026-06-01' })
    expect(r.status).toBe('vencida')
  })

  it('vencimento hoje não é vencida (comparação estrita)', () => {
    const r = derivarStatusParcela({ ...base, valorPago: 0, dataReferencia: '2026-06-11' })
    expect(r.status).toBe('a_vencer')
  })

  it('estorno total zera a data real mesmo que existisse antes', () => {
    const r = derivarStatusParcela({
      ...base,
      valorPago: 0,
      dataPagamentoRealAtual: '2026-06-01',
    })
    expect(r.data_pagamento_real).toBeNull()
  })
})

describe('derivarStatusParcela — tolerância na borda', () => {
  it('com tolerância 0.01: pago 0.009 ainda conta como zerado', () => {
    const r = derivarStatusParcela({ ...base, valorPago: 0.009, tolerancia: 0.01 })
    expect(r.status).toBe('a_vencer')
  })

  it('com tolerância 0.01: pago 0.011 já é parcialmente_paga', () => {
    const r = derivarStatusParcela({ ...base, valorPago: 0.011, tolerancia: 0.01 })
    expect(r.status).toBe('parcialmente_paga')
  })

  it('com tolerância 0.01: pago 99.989 ainda é parcial', () => {
    const r = derivarStatusParcela({ ...base, valorPago: 99.989, tolerancia: 0.01 })
    expect(r.status).toBe('parcialmente_paga')
  })

  it('com tolerância 0.01: pago 99.991 fecha como paga', () => {
    const r = derivarStatusParcela({ ...base, valorPago: 99.991, tolerancia: 0.01 })
    expect(r.status).toBe('paga')
  })

  it('tolerância default 0.005: 0.004 zerado, 0.006 parcial', () => {
    expect(derivarStatusParcela({ ...base, valorPago: 0.004 }).status).toBe('a_vencer')
    expect(derivarStatusParcela({ ...base, valorPago: 0.006 }).status).toBe('parcialmente_paga')
  })
})

describe('derivarStatusParcela — parcial', () => {
  it('pago entre 0.01 e valor-0.01 → parcialmente_paga', () => {
    const r = derivarStatusParcela({ ...base, valorPago: 50 })
    expect(r.status).toBe('parcialmente_paga')
  })

  it('parcial sem data real anterior usa a data efetiva do pagamento', () => {
    const r = derivarStatusParcela({ ...base, valorPago: 50 })
    expect(r.data_pagamento_real).toBe('2026-06-11')
  })

  it('parcial preserva a data real já existente (não sobrescreve)', () => {
    const r = derivarStatusParcela({
      ...base,
      valorPago: 50,
      dataPagamentoRealAtual: '2026-06-01',
    })
    expect(r.data_pagamento_real).toBe('2026-06-01')
  })
})

describe('derivarStatusParcela — paga', () => {
  it('pago igual ao valor → paga com data efetiva', () => {
    const r = derivarStatusParcela({ ...base, valorPago: 100 })
    expect(r).toEqual({ status: 'paga', data_pagamento_real: '2026-06-11' })
  })

  it('pago acima do valor → paga', () => {
    const r = derivarStatusParcela({ ...base, valorPago: 120 })
    expect(r.status).toBe('paga')
  })

  it('paga sobrescreve a data real com a data efetiva informada', () => {
    const r = derivarStatusParcela({
      ...base,
      valorPago: 100,
      dataEfetiva: '2026-06-10',
      dataPagamentoRealAtual: '2026-06-01',
    })
    expect(r.data_pagamento_real).toBe('2026-06-10')
  })
})
