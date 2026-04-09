import { formatCurrency } from '@/lib/utils'

interface DashboardCardsProps {
  etapasCount: number
  receitaCEF: number
  custoOrcado: number
  custoIndiretoOrcado: number
  custoConsumido: number
  custoIndiretoConsumido: number
  custoPago: number
  custoIndiretoPago: number
  saldo: number
  execucaoPct: number
  margemRS: number
  margemPct: number
}

export default function WBSDashboardCards({ 
  etapasCount, receitaCEF, 
  custoOrcado, custoIndiretoOrcado,
  custoConsumido, custoIndiretoConsumido,
  custoPago, custoIndiretoPago,
  saldo, execucaoPct, margemRS, margemPct 
}: DashboardCardsProps) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-9">
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
        label="Pago" 
        mainValue={formatCurrency(custoPago + custoIndiretoPago)} 
        subVal1Label="Dir" subVal1={formatCurrency(custoPago)}
        subVal2Label="Ind" subVal2={formatCurrency(custoIndiretoPago)}
        accent="blue"
      />
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
    <div className="rounded-xl border bg-card p-2.5 flex flex-col justify-center">
      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground leading-tight">{label}</p>
      <p className={`mt-0.5 text-sm font-bold ${c} truncate`}>{value}</p>
    </div>
  )
}

function DualMiniCard({ label, mainValue, subVal1Label, subVal1, subVal2Label, subVal2, accent }: { label: string; mainValue: string; subVal1Label: string; subVal1: string; subVal2Label: string; subVal2: string; accent?: string }) {
  const c = accent === 'emerald' ? 'text-emerald-500' : accent === 'red' ? 'text-red-500' : accent === 'amber' ? 'text-amber-500' : accent === 'blue' ? 'text-blue-500' : ''
  return (
    <div className="rounded-xl border bg-card p-2.5 flex flex-col justify-center">
      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground leading-tight">{label}</p>
      <p className={`mt-0.5 text-sm font-bold ${c} truncate`}>{mainValue}</p>
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
