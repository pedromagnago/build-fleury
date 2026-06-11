import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { formatCurrency } from '@/lib/utils'
import { localDate } from '@/lib/parcelas'
import { type Parcela } from '@/hooks/useFinanceiro'
import { useCriarAcordo } from '@/hooks/useAcordos'
import { X, Handshake, AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react'

interface Props {
  parcelas: Parcela[]
  onClose: () => void
  onDone: () => void
}

interface LinhaCronograma {
  valor: string
  data_vencimento: string
}

const INPUT = 'w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none'
const LABEL = 'mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground'

function addMonths(iso: string, n: number): string {
  const d = localDate(iso)
  d.setMonth(d.getMonth() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(iso: string, n: number): string {
  const d = localDate(iso)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function RenegociarAcordoModal({ parcelas, onClose, onDone }: Props) {
  const criarAcordo = useCriarAcordo()

  // Elegíveis: com saldo aberto, não pagas, não renegociadas e que não são de outro acordo
  const { elegiveis, inelegiveis } = useMemo(() => {
    const ok: Parcela[] = []
    const nok: Array<{ p: Parcela; motivo: string }> = []
    for (const p of parcelas) {
      if ((p as any)._source === 'mutuo' || (p as any)._source === 'amortizacao') {
        nok.push({ p, motivo: 'mútuo/amortização não entra em acordo' }); continue
      }
      if (p.status === 'paga') { nok.push({ p, motivo: 'já paga' }); continue }
      if (p.status === 'renegociada') { nok.push({ p, motivo: 'já renegociada' }); continue }
      if ((p as any).acordo_id) { nok.push({ p, motivo: 'já pertence a um acordo' }); continue }
      if (Number(p.valor) - Number(p.valor_pago || 0) <= 0.005) { nok.push({ p, motivo: 'sem saldo aberto' }); continue }
      ok.push(p)
    }
    return { elegiveis: ok, inelegiveis: nok }
  }, [parcelas])

  const saldoTotal = useMemo(
    () => elegiveis.reduce((s, p) => s + (Number(p.valor) - Number(p.valor_pago || 0)), 0),
    [elegiveis]
  )

  const fornecedorSugerido = useMemo(() => {
    const nomes = new Set(elegiveis.map(p => (p as any).fornecedor_nome).filter(Boolean))
    return nomes.size === 1 ? [...nomes][0] as string : ''
  }, [elegiveis])

  const hoje = new Date()
  const mesAno = `${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`
  const [nome, setNome] = useState(fornecedorSugerido ? `Acordo ${fornecedorSugerido} ${mesAno}` : `Acordo ${mesAno}`)
  const [fornecedorNome, setFornecedorNome] = useState(fornecedorSugerido)
  const [observacoes, setObservacoes] = useState('')
  const [nParcelas, setNParcelas] = useState(3)
  const [primeiraData, setPrimeiraData] = useState(addMonths(new Date().toISOString().split('T')[0]!, 1))
  const [periodicidade, setPeriodicidade] = useState<'mensal' | 'quinzenal' | 'semanal'>('mensal')
  const [linhas, setLinhas] = useState<LinhaCronograma[]>([])

  const gerarCronograma = () => {
    const n = Math.max(1, nParcelas)
    const base = Math.floor((saldoTotal / n) * 100) / 100
    const novas: LinhaCronograma[] = []
    let acumulado = 0
    for (let i = 0; i < n; i++) {
      // Última parcela absorve o resíduo de arredondamento
      const valor = i === n - 1 ? Math.round((saldoTotal - acumulado) * 100) / 100 : base
      acumulado += valor
      const data = periodicidade === 'mensal'
        ? addMonths(primeiraData, i)
        : addDays(primeiraData, i * (periodicidade === 'quinzenal' ? 15 : 7))
      novas.push({ valor: valor.toFixed(2), data_vencimento: data })
    }
    setLinhas(novas)
  }

  const totalCronograma = linhas.reduce((s, l) => s + (parseFloat(l.valor) || 0), 0)
  const diferenca = totalCronograma - saldoTotal
  const cronogramaOk = linhas.length > 0 && Math.abs(diferenca) <= 0.05 &&
    linhas.every(l => (parseFloat(l.valor) || 0) > 0 && l.data_vencimento)

  const handleConfirm = async () => {
    if (!cronogramaOk || !nome.trim()) return
    await criarAcordo.mutateAsync({
      nome: nome.trim(),
      parcelaIds: elegiveis.map(p => p.id),
      cronograma: linhas.map(l => ({ valor: parseFloat(l.valor), data_vencimento: l.data_vencimento })),
      fornecedorNome: fornecedorNome.trim() || null,
      observacoes: observacoes.trim() || null,
    })
    onDone()
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex w-full max-w-3xl max-h-[92vh] flex-col rounded-2xl border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10">
              <Handshake className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Renegociar em Acordo</h3>
              <p className="text-xs text-muted-foreground">
                As parcelas originais saem do fluxo projetado; o cronograma do acordo assume
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {inelegiveis.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              <p className="flex items-center gap-1.5 font-semibold text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" /> {inelegiveis.length} parcela(s) fora do acordo
              </p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {inelegiveis.slice(0, 5).map(({ p, motivo }) => (
                  <li key={p.id}>P{p.numero_parcela} — {p.pedido_item ?? p.descricao ?? 'parcela'}: {motivo}</li>
                ))}
                {inelegiveis.length > 5 && <li>… e mais {inelegiveis.length - 5}</li>}
              </ul>
            </div>
          )}

          {/* Originais que entram */}
          <div className="rounded-xl border">
            <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
              <span className="text-xs font-semibold">Parcelas renegociadas ({elegiveis.length})</span>
              <span className="text-xs font-bold text-primary">Saldo total: {formatCurrency(saldoTotal)}</span>
            </div>
            <div className="max-h-44 overflow-y-auto">
              <table className="tbl-bf w-full text-[11px]">
                <thead className="sticky top-0 bg-muted/40">
                  <tr className="text-[9px] uppercase text-muted-foreground">
                    <th className="px-3 py-1.5 text-left">Parcela</th>
                    <th className="px-3 py-1.5 text-left">Fornecedor / NF</th>
                    <th className="px-3 py-1.5 text-center">Vencimento</th>
                    <th className="px-3 py-1.5 text-right">Valor</th>
                    <th className="px-3 py-1.5 text-right">Pago</th>
                    <th className="px-3 py-1.5 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {elegiveis.map(p => (
                    <tr key={p.id}>
                      <td className="px-3 py-1.5">P{p.numero_parcela} — {(p.pedido_item ?? p.descricao ?? '—').slice(0, 40)}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {(p as any).fornecedor_nome ?? '—'}{(p as any).nf_numero ? ` · NF ${(p as any).nf_numero}` : ''}
                      </td>
                      <td className="px-3 py-1.5 text-center">{localDate(p.data_vencimento).toLocaleDateString('pt-BR')}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(Number(p.valor))}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">{formatCurrency(Number(p.valor_pago || 0))}</td>
                      <td className="px-3 py-1.5 text-right font-semibold">{formatCurrency(Number(p.valor) - Number(p.valor_pago || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dados do acordo */}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className={LABEL}>Nome do acordo *</label>
              <input type="text" value={nome} onChange={e => setNome(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Fornecedor</label>
              <input type="text" value={fornecedorNome} onChange={e => setFornecedorNome(e.target.value)} placeholder="ex: Multiplex" className={INPUT} />
            </div>
          </div>

          {/* Gerador de cronograma */}
          <div className="rounded-xl border p-4">
            <p className="mb-3 text-xs font-semibold">Novo cronograma de pagamento</p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className={LABEL}>Nº de parcelas</label>
                <input type="number" min="1" max="60" value={nParcelas}
                  onChange={e => setNParcelas(Math.max(1, parseInt(e.target.value) || 1))}
                  className={`${INPUT} w-24`} />
              </div>
              <div>
                <label className={LABEL}>1º vencimento</label>
                <input type="date" value={primeiraData} onChange={e => setPrimeiraData(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Periodicidade</label>
                <select value={periodicidade} onChange={e => setPeriodicidade(e.target.value as any)} className={INPUT}>
                  <option value="mensal">Mensal</option>
                  <option value="quinzenal">Quinzenal</option>
                  <option value="semanal">Semanal</option>
                </select>
              </div>
              <button type="button" onClick={gerarCronograma}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90">
                <RefreshCw className="h-3.5 w-3.5" /> Gerar parcelas
              </button>
            </div>

            {linhas.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {linhas.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-[10px] font-bold text-muted-foreground">{i + 1}/{linhas.length}</span>
                    <input type="date" value={l.data_vencimento}
                      onChange={e => setLinhas(prev => prev.map((x, j) => j === i ? { ...x, data_vencimento: e.target.value } : x))}
                      className={`${INPUT} w-40`} />
                    <input type="number" step="0.01" min="0.01" value={l.valor}
                      onChange={e => setLinhas(prev => prev.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))}
                      className={`${INPUT} w-36 text-right`} />
                    <button type="button" title="Remover parcela"
                      onClick={() => setLinhas(prev => prev.filter((_, j) => j !== i))}
                      className="rounded-md p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <div className={`mt-2 flex items-center justify-between rounded-lg p-2.5 text-xs ${
                  Math.abs(diferenca) <= 0.05 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/10 text-red-600'
                }`}>
                  <span className="font-medium">Σ cronograma: {formatCurrency(totalCronograma)}</span>
                  <span className="flex items-center gap-1 font-semibold">
                    {Math.abs(diferenca) <= 0.05
                      ? <>Bate com o saldo renegociado <ArrowRight className="h-3 w-3" /> {formatCurrency(saldoTotal)}</>
                      : <>Difere do saldo em {formatCurrency(diferenca)}</>}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className={LABEL}>Observações</label>
            <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2}
              placeholder="ex: acordo firmado com a Multiplex em razão do caixa da obra; e-mail de 10/06/2026"
              className={INPUT} />
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-between border-t px-6 py-4">
          <p className="text-xs text-muted-foreground">
            {elegiveis.length} parcela(s) → {linhas.length || '?'} nova(s) · {formatCurrency(saldoTotal)}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
            <button onClick={handleConfirm}
              disabled={!cronogramaOk || !nome.trim() || elegiveis.length === 0 || criarAcordo.isPending}
              className="flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40">
              <Handshake className="h-4 w-4" />
              {criarAcordo.isPending ? 'Criando acordo...' : 'Criar Acordo'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
