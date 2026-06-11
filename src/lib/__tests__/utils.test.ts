import { describe, it, expect } from 'vitest'
import { parseValorBR, formatCurrency } from '@/lib/utils'

// Intl usa NBSP/narrow NBSP entre "R$" e o número — normaliza para espaço comum
const norm = (s: string) => s.replace(/[  ]/g, ' ')

describe('parseValorBR', () => {
  it('formato BR com milhar e decimal: "1.234,56" → 1234.56', () => {
    expect(parseValorBR('1.234,56')).toBe(1234.56)
  })

  it('formato US: "1234.56" → 1234.56 (ponto decimal, não milhar)', () => {
    expect(parseValorBR('1234.56')).toBe(1234.56)
  })

  it('milhar múltiplo: "1.695.261,56" → 1695261.56', () => {
    expect(parseValorBR('1.695.261,56')).toBe(1695261.56)
  })

  it('só vírgula decimal: "1695261,56" → 1695261.56', () => {
    expect(parseValorBR('1695261,56')).toBe(1695261.56)
  })

  it('milhar sem decimal: "1.695.261" → 1695261', () => {
    expect(parseValorBR('1.695.261')).toBe(1695261)
  })

  it('um ponto seguido de 3 dígitos é milhar: "1.234" → 1234', () => {
    expect(parseValorBR('1.234')).toBe(1234)
  })

  it('um ponto seguido de 2 dígitos é decimal: "12.34" → 12.34', () => {
    expect(parseValorBR('12.34')).toBe(12.34)
  })

  it('inteiro puro: "500000" → 500000', () => {
    expect(parseValorBR('500000')).toBe(500000)
  })

  it('ignora símbolo de moeda e espaços: "R$ 1.234,56" → 1234.56', () => {
    expect(parseValorBR('R$ 1.234,56')).toBe(1234.56)
  })

  it('negativo: "-1.234,56" → -1234.56', () => {
    expect(parseValorBR('-1.234,56')).toBe(-1234.56)
  })

  it('centavos: "0,01" → 0.01', () => {
    expect(parseValorBR('0,01')).toBe(0.01)
  })

  it('zero: "0" → 0', () => {
    expect(parseValorBR('0')).toBe(0)
  })

  it('entrada vazia/nula → 0', () => {
    expect(parseValorBR('')).toBe(0)
    expect(parseValorBR('   ')).toBe(0)
    expect(parseValorBR(null)).toBe(0)
    expect(parseValorBR(undefined)).toBe(0)
  })

  it('entrada inválida → 0', () => {
    expect(parseValorBR('abc')).toBe(0)
  })

  it('number passa direto; não-finito → 0', () => {
    expect(parseValorBR(1234.56)).toBe(1234.56)
    expect(parseValorBR(NaN)).toBe(0)
    expect(parseValorBR(Infinity)).toBe(0)
  })
})

describe('formatCurrency', () => {
  it('formata em pt-BR/BRL com milhar e vírgula', () => {
    expect(norm(formatCurrency(1234567.89))).toBe('R$ 1.234.567,89')
  })

  it('zero → R$ 0,00', () => {
    expect(norm(formatCurrency(0))).toBe('R$ 0,00')
  })

  it('negativo', () => {
    expect(norm(formatCurrency(-1234.5))).toBe('-R$ 1.234,50')
  })

  it('centavo único', () => {
    expect(norm(formatCurrency(0.01))).toBe('R$ 0,01')
  })

  it('round-trip com parseValorBR', () => {
    expect(parseValorBR(formatCurrency(1695261.56))).toBe(1695261.56)
  })
})
