import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatNumber(value: number, maxDecimals = 2, minDecimals = 0): string {
  return new Intl.NumberFormat('pt-BR', { 
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: minDecimals
  }).format(value)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR').format(
    typeof date === 'string' ? new Date(date) : date
  )
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100)
}

/**
 * Converte string de valor monetário em formato brasileiro para Number.
 * Aceita: "1.695.261,56", "1695261,56", "1695261.56", "1.695.261", "500000".
 * Regra: se contém ',' → vírgula é decimal, pontos são milhar (descarta);
 *        senão, se tem múltiplos '.' ou um '.' seguido de 3 dígitos → milhar (descarta);
 *        senão → ponto é decimal.
 * Retorna 0 para entrada vazia ou inválida.
 */
export function parseValorBR(input: string | number | null | undefined): number {
  if (input == null) return 0
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0
  const s = String(input).trim()
  if (!s) return 0
  const limpo = s.replace(/[^\d.,-]/g, '')
  if (!limpo) return 0
  let normalizado: string
  if (limpo.includes(',')) {
    normalizado = limpo.replace(/\./g, '').replace(',', '.')
  } else {
    const partes = limpo.split('.')
    if (partes.length > 2 || (partes.length === 2 && partes[1]!.length === 3)) {
      normalizado = partes.join('')
    } else {
      normalizado = limpo
    }
  }
  const n = parseFloat(normalizado)
  return Number.isFinite(n) ? n : 0
}
