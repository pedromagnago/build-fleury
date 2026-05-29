import { AlertTriangle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface DashboardCardsProps {
  etapasCount: number
  receitaCEF: number
  custoOrcado: number
  custoIndiretoOrcado: number
  custoConsumido: number
  custoIndiretoConsumido: number
  aPagarDireto?: number
  aPagarIndireto?: number
  custoPago: number
  custoIndiretoPago: number
  capitalCaptado?: number
  capitalDevolucao?: number
  capitalPago?: number
  capitalPendente?: number
  custoFinanceiro?: number
  saldo: number
  execucaoPct: number
  margemRS: number
  margemPct: number
  activeFilterCount?: number
}

export default function WBSDashboardCards({
  etapasCount, receitaCEF,
  custoOrcado, custoIndiretoOrcado,
  custoConsumido, custoIndiretoConsumido,
  aPagarDireto = 0,
  aPagarIndireto = 0,
  custoPago, custoIndiretoPago,
  capitalCaptado = 0, capitalPendente = 0, custoFinanceiro = 0,
  saldo, margemRS, margemPct,
  activeFilterCount = 0,
}: DashboardCardsProps) {
  return (
    <div className="mb-4 space-y-2">
      {/* Aviso de filtro ativo */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 dark:border-amber-800/50 dark:bg-amber-950/30 px-3 py-1.5 text-[10px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>
            <strong>Filtros ativos</strong> — os KPIs abaixo mostram o projeto completo ({etapasCount} etapas).
            Os totais da tabela refletem apenas as etapas visíveis.
          </span>
        </div>
      )}

      {/* Cards */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5 lg:grid-cols-10">
        <MiniCard label="Etapas" value={String(etapasCount)} />
        <MiniCard label="Receita CEF" value={formatCurrency(receitaCEF)} accent="blue" />
        <DualMiniCard
          label="Custo Orçado"
          mainValue={formatCurrency(custoOrcado + custoIndiretoOrcado)}
          subVal1Label="Dir" subVal1={formatCurrency(custoOrcado)}
          subVal2Label="Ind" subVal2={formatCurrency(custoIndiretoOrcado)}
        />
        <DualMiniCard
          label="Consumido"
          mainValue={formatCurrency(custoConsumido + custoIndiretoConsumido)}
          subVal1Label="Dir" subVal1={formatCurrency(custoConsumido)}
          subVal2Label="Ind" subVal2={formatCurrency(custoIndiretoConsumido)}
          accent="amber"
        />
        <DualMiniCard
          label="A Pagar"
          mainValue={formatCurrency(aPagarDireto + aPagarIndireto)}
          subVal1Label="Dir" subVal1={formatCurrency(aPagarDireto)}
          subVal2Label="Ind" subVal2={formatCurrency(aPagarIndireto)}
          accent="orange"
        />
        <DualMiniCard
          label="Pago"
          mainValue={formatCurrency(custoPago + custoIndiretoPago)}
          subVal1Label="Dir" subVal1={formatCurrency(custoPago)}
          subVal2Label="Ind" subVal2={formatCurrency(custoIndiretoPago)}
          accent="emerald"
        />
        <DualMiniCard
          label="Capital"
          mainValue={formatCurrency(capitalCaptado)}
          subVal1Label="Pend" subVal1={formatCurrency(capitalPendente)}
          subVal2Label="Juros" subVal2={formatCurrency(custoFinanceiro)}
          accent={custoFinanceiro > 0 ? 'red' : 'emerald'}
        />
        <MiniCard
          label="Saldo Projeto"
          value={formatCurrency(saldo)}
          accent={saldo >= 0 ? 'emerald' : 'red'}
          note="Orçado − Consumido (Dir+Ind)"
        />
        <MiniCard label="Margem (R$)" value={formatCurrency(margemRS)} accent={margemRS >= 0 ? 'emerald' : 'red'} />
        <MiniCard label="Margem (%)" value={`${margemPct.toFixed(1)}%`} accent={margemPct >= 0 ? 'emerald' : 'red'} />
      </div>
    </div>
  )
}

// ── Primitives ────────────────────────────────────────────────────────────────

type Accent = 'emerald' | 'red' | 'amber' | 'orange' | 'blue'

function accentClass(accent?: Accent) {
  if (accent === 'emerald') return 'text-emerald-500'
  if (accent === 'red')     return 'text-red-500'
  if (accent === 'amber')   return 'text-amber-500'
  if (accent === 'orange')  return 'text-orange-500'
  if (accent === 'blue')    return 'text-blue-500'
  return ''
}

function MiniCard({ label, value, accent, note }: { label: string; value: string; accent?: Accent; note?: string }) {
  return (
    <div className="rounded-xl border bg-card p-2.5 flex flex-col justify-center" title={note}>
      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground leading-tight">{label}</p>
      <p className={`mt-0.5 text-sm font-bold truncate ${accentClass(accent)}`}>{value}</p>
      {note && <p className="text-[8px] text-muted-foreground/50 truncate mt-0.5">{note}</p>}
    </div>
  )
}

function DualMiniCard({ label, mainValue, subVal1Label, subVal1, subVal2Label, subVal2, accent }: {
  label: string; mainValue: string
  subVal1Label: string; subVal1: string
  subVal2Label: string; subVal2: string
  accent?: Accent
}) {
  return (
    <div className="rounded-xl border bg-card p-2.5 flex flex-col justify-center">
      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground leading-tight">{label}</p>
      <p className={`mt-0.5 text-sm font-bold truncate ${accentClass(accent)}`}>{mainValue}</p>
      <div className="mt-1 flex flex-col gap-0.5">
        <div className="flex items-center justify-between text-[8.5px] text-muted-foreground border-t border-border/50 pt-0.5">
          <span>{subVal1Label}:</span>
          <span className="font-medium truncate pl-1">{subVal1}</span>
        </div>
        <div className="flex items-center justify-between text-[8.5px] text-muted-foreground border-t border-border/50 pt-0.5">
          <span>{subVal2Label}:</span>
          <span className="font-medium truncate pl-1">{subVal2}</span>
        </div>
      </div>
    </div>
  )
}
