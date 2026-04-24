/**
 * Build Fleury — Dialog de Lançamento Manual
 *
 * Cria movimento bancário sem OFX. Usa-se quando:
 * - Perdeu-se acesso à conta mas ainda se precisa registrar o movimento
 * - Contrapartida que se zera (ex: transferência entre contas do mesmo grupo)
 * - Correção manual de lançamento esquecido
 * Pode opcionalmente vincular a uma parcela (conciliação automática).
 */
import { useState, useMemo, useEffect } from 'react'
import { X, Save, Search, ArrowDownCircle, ArrowUpCircle, Info } from 'lucide-react'
import { useCreateMovimentoManual } from '@/hooks/useConciliacao'
import { useContasBancarias, useParcelas } from '@/hooks/useFinanceiro'
import { useMutuos } from '@/hooks/useMutuos'
import { formatCurrency } from '@/lib/utils'

type VinculoSel = { tipo: 'parcela' | 'mutuo'; id: string; label: string; sublabel: string; valor: number }

interface Props {
  defaultContaId?: string
  onClose: () => void
}

export function NovoLancamentoDialog({ defaultContaId, onClose }: Props) {
  const { data: contas = [] } = useContasBancarias()
  const { data: parcelas = [] } = useParcelas()
  const { data: mutuos = [] } = useMutuos()
  const createMov = useCreateMovimentoManual()

  const [contaId, setContaId] = useState(defaultContaId ?? contas[0]?.id ?? '')
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('saida')
  const [data, setData] = useState(() => new Date().toISOString().split('T')[0]!)
  const [valor, setValor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [vinculo, setVinculo] = useState<VinculoSel | null>(null)
  const [observacao, setObservacao] = useState('')
  const [search, setSearch] = useState('')
  const [autoConciliar, setAutoConciliar] = useState(true)

  useEffect(() => {
    if (!contaId && contas.length > 0) setContaId(contas[0]!.id)
  }, [contas, contaId])

  const candidatos = useMemo<VinculoSel[]>(() => {
    const q = search.toLowerCase().trim()
    const out: VinculoSel[] = []
    // Parcelas em aberto
    for (const p of parcelas as any[]) {
      if (p.status === 'paga') continue
      const label = p.pedido_item ?? p.descricao ?? 'Parcela'
      const sublabel = `Parcela · Venc ${p.data_vencimento} · ${p.status}`
      const hay = `${label} ${sublabel} ${p.valor}`.toLowerCase()
      if (q && !hay.includes(q)) continue
      out.push({ tipo: 'parcela', id: p.id, label, sublabel, valor: Number(p.valor) })
    }
    // Mútuos com saldo
    for (const m of mutuos as any[]) {
      const jaConc = Number(m.valor_conciliado_entrada || 0) + Number(m.valor_conciliado_saida || 0)
      const saldo = Math.max(0, Number(m.valor_captado) - jaConc)
      if (saldo < 0.01) continue
      const cat = String(m.categoria ?? '').toLowerCase().includes('adiantamento') ? 'Adiantamento' : 'Captação'
      const label = `${cat}: ${m.nome}`
      const sublabel = `Mútuo · ${m.data_captacao} · saldo ${formatCurrency(saldo)}`
      const hay = `${label} ${m.categoria} ${m.valor_captado}`.toLowerCase()
      if (q && !hay.includes(q)) continue
      out.push({ tipo: 'mutuo', id: m.id, label, sublabel, valor: Number(m.valor_captado) })
    }
    return out.slice(0, 20)
  }, [parcelas, mutuos, search])

  const handleSubmit = async () => {
    const num = parseFloat(valor.replace(',', '.'))
    if (!contaId || !data || !num || !descricao.trim()) {
      alert('Preencha conta, data, valor e descrição')
      return
    }
    await createMov.mutateAsync({
      conta_id: contaId,
      data,
      valor: num,
      tipo,
      descricao: descricao.trim(),
      vinculo: vinculo ? { tipo: vinculo.tipo, id: vinculo.id } : null,
      observacao: observacao.trim() || null,
      auto_conciliar: autoConciliar,
    })
    onClose()
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-xl rounded-xl border bg-card shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-base font-bold">Novo Lançamento Manual</h2>
            <p className="text-[11px] text-muted-foreground">
              Use para registrar movimentos sem OFX (contrapartidas, conta sem acesso)
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          {/* Tipo */}
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Tipo</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button onClick={() => setTipo('entrada')}
                className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-bold transition-colors ${
                  tipo === 'entrada' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-700' : 'hover:bg-muted'
                }`}>
                <ArrowDownCircle className="h-3.5 w-3.5" />Entrada
              </button>
              <button onClick={() => setTipo('saida')}
                className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-bold transition-colors ${
                  tipo === 'saida' ? 'bg-red-500/10 border-red-500 text-red-600' : 'hover:bg-muted'
                }`}>
                <ArrowUpCircle className="h-3.5 w-3.5" />Saída
              </button>
            </div>
          </div>

          {/* Conta e Data */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Conta</label>
              <select value={contaId} onChange={(e) => setContaId(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs">
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome} {c.banco ? `(${c.banco})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Data</label>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs" />
            </div>
          </div>

          {/* Valor e Descrição */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Valor (R$)</label>
              <input type="text" value={valor} onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs text-right font-mono" />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Descrição</label>
              <input value={descricao} onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Transferência para caixa, Estorno, etc."
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs" />
            </div>
          </div>

          {/* Vincular a parcela */}
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={autoConciliar} onChange={(e) => setAutoConciliar(e.target.checked)} />
              <span className="font-bold">Conciliar e marcar como registrado</span>
            </label>
            {autoConciliar && (
              <>
                <div>
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">
                    Vincular a parcela ou mútuo (opcional)
                  </label>
                  {vinculo ? (
                    <div className="mt-1 flex items-center justify-between rounded-md bg-emerald-500/10 p-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <p className="text-xs font-medium truncate">{vinculo.label}</p>
                          <span className={`text-[9px] rounded px-1 ${vinculo.tipo === 'mutuo' ? 'bg-indigo-500/10 text-indigo-600' : 'bg-blue-500/10 text-blue-600'}`}>
                            {vinculo.tipo === 'mutuo' ? 'MUT' : 'PARC'}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {vinculo.sublabel} · {formatCurrency(vinculo.valor)}
                        </p>
                      </div>
                      <button onClick={() => setVinculo(null)}
                        className="rounded px-2 py-1 text-[10px] hover:bg-red-500/10 text-red-500">Remover</button>
                    </div>
                  ) : (
                    <>
                      <div className="relative mt-1">
                        <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                        <input value={search} onChange={(e) => setSearch(e.target.value)}
                          placeholder="Buscar por descrição, nome do mútuo ou valor..."
                          className="w-full rounded-md border bg-background pl-7 pr-2 py-1.5 text-xs" />
                      </div>
                      {search && (
                        <div className="mt-1 max-h-48 overflow-auto rounded-md border bg-card">
                          {candidatos.map(c => (
                            <button key={`${c.tipo}-${c.id}`} onClick={() => { setVinculo(c); setSearch('') }}
                              className="w-full flex items-center justify-between p-2 hover:bg-muted text-left border-b last:border-0">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1">
                                  <p className="text-xs truncate">{c.label}</p>
                                  <span className={`text-[9px] rounded px-1 ${c.tipo === 'mutuo' ? 'bg-indigo-500/10 text-indigo-600' : 'bg-blue-500/10 text-blue-600'}`}>
                                    {c.tipo === 'mutuo' ? 'MUT' : 'PARC'}
                                  </span>
                                </div>
                                <p className="text-[10px] text-muted-foreground">{c.sublabel}</p>
                              </div>
                              <span className="text-xs font-mono font-semibold">{formatCurrency(c.valor)}</span>
                            </button>
                          ))}
                          {candidatos.length === 0 && (
                            <p className="p-2 text-center text-[11px] text-muted-foreground">Nenhuma encontrada</p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <p className="flex items-start gap-1 text-[10px] text-muted-foreground">
                  <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>Sem vínculo, o movimento é criado como conciliado mas sem link (útil para contrapartidas que se zeram).</span>
                </p>
              </>
            )}
          </div>

          {/* Observação */}
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Observação</label>
            <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2}
              placeholder="Notas internas..."
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t p-4">
          <button onClick={onClose}
            className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">Cancelar</button>
          <button onClick={handleSubmit} disabled={createMov.isPending}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <Save className="h-3.5 w-3.5" />
            {createMov.isPending ? 'Salvando...' : 'Criar Lançamento'}
          </button>
        </div>
      </div>
    </div>
  )
}
