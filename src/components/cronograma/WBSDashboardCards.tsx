import { formatCurrency } from '@/lib/utils'

interface DashboardCardsProps {
  etapasCount: number
  receitaCEF: number
  custoOrcado: number
  custoConsumido: number
  custoPago: number
  saldo: number
  execucaoPct: number
  margemRS: number
  margemPct: number
}

export default function WBSDashboardCards({ etapasCount, receitaCEF, custoOrcado, custoConsumido, custoPago, saldo, execucaoPct, margemRS, margemPct }: DashboardCardsProps) {
  return (
    <div className="mb-4 grid grid-cols-3 gap-2 md:grid-cols-9">
      <MiniCard label="Etapas" value={String(etapasCount)} />
      <MiniCard label="Receita CEF" value={formatCurrency(receitaCEF)} accent="blue" />
      <MiniCard label="Custo Orçado" value={formatCurrency(custoOrcado)} />
      <MiniCard label="Consumido" value={formatCurrency(custoConsumido)} accent="amber" />
      <MiniCard label="Pago" value={formatCurrency(custoPago)} accent="blue" />
      <MiniCard label="Saldo" value={formatCurrency(saldo)} accent={saldo >= 0 ? 'emerald' : 'red'} />
      <MiniCard label="Execução" value={`${execucaoPct.toFixed(1)}%`} />
      <MiniCard label="Margem (R$)" value={formatCurrency(margemRS)} accent={margemRS >= 0 ? 'emerald' : 'red'} />
      <MiniCard label="Margem (%)" value={`${margemPct.toFixed(1)}%`} accent={margemPct >= 0 ? 'emerald' : 'red'} />
    </div>
  )
}

function MiniCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const c = accent === 'emerald' ? 'text-emerald-500' : accent === 'red' ? 'text-red-500' : accent === 'amber' ? 'text-amber-500' : accent === 'blue' ? 'text-blue-500' : ''
  return (
    <div className="rounded-xl border bg-card p-2.5">
      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground leading-tight">{label}</p>
      <p className={`mt-0.5 text-sm font-bold ${c}`}>{value}</p>
    </div>
  )
}
