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
import { useMedicoes } from '@/hooks/useOperacional'
import { formatCurrency, parseValorBR } from '@/lib/utils'

type VinculoSel = { tipo: 'parcela' | 'mutuo' | 'mutuo_parcela' | 'medicao'; id: string; label: string; sublabel: string; valor: number }

interface Props {
  defaultContaId?: string
  defaultTipo?: 'entrada' | 'saida'
  defaultValor?: string
  defaultDescricao?: string
  defaultVinculo?: VinculoSel | null
  onClose: () => void
}

export function NovoLancamentoDialog({ defaultContaId, defaultTipo, defaultValor, defaultDescricao, defaultVinculo, onClose }: Props) {
  const { data: contas = [] } = useContasBancarias()
  const { data: parcelas = [] } = useParcelas()
  const { data: mutuos = [] } = useMutuos()
  const { data: medicoes = [] } = useMedicoes()
  const createMov = useCreateMovimentoManual()

  const [contaId, setContaId] = useState(defaultContaId ?? contas[0]?.id ?? '')
  const [tipo, setTipo] = useState<'entrada' | 'saida'>(defaultTipo ?? 'saida')
  const [data, setData] = useState(() => new Date().toISOString().split('T')[0]!)
  const [valor, setValor] = useState(defaultValor ?? '')
  const [descricao, setDescricao] = useState(defaultDescricao ?? '')
  const [vinculo, setVinculo] = useState<VinculoSel | null>(defaultVinculo ?? null)
  const [observacao, setObservacao] = useState('')
  const [search, setSearch] = useState('')
  const [autoConciliar, setAutoConciliar] = useState(true)

  useEffect(() => {
    if (!contaId && contas.length > 0) setContaId(contas[0]!.id)
  }, [contas, contaId])

  const candidatos = useMemo<VinculoSel[]>(() => {
    const q = search.toLowerCase().trim()
    const out: VinculoSel[] = []
    // Medições (só fazem sentido em entrada — receita do contrato)
    if (tipo === 'entrada') {
      for (const med of medicoes as any[]) {
        if (med.status === 'paga') continue
        const valorMed = Number(med.valor_planejado) || 0
        const liberado = Number(med.valor_liberado) || 0
        const saldoMed = valorMed - liberado
        // Mostra se ainda há saldo OU se é futura (pode ainda não ter valor_liberado movimentado)
        if (saldoMed < 0.01 && med.status !== 'futura') continue
        const label = `Medição nº ${med.numero}`
        const sublabel = `Contrato · Prev ${med.data_prevista} · saldo ${formatCurrency(Math.max(saldoMed, 0))} · ${med.status}`
        const hay = `${label} medição medicao ${med.numero} ${valorMed} ${med.status}`.toLowerCase()
        if (q && !hay.includes(q)) continue
        out.push({ tipo: 'medicao', id: med.id, label, sublabel, valor: saldoMed > 0 ? saldoMed : valorMed })
      }
    }
    // Parcelas em aberto
    for (const p of parcelas as any[]) {
      if (p.status === 'paga') continue
      const label = p.pedido_item ?? p.descricao ?? 'Parcela'
      const fornNome = p.fornecedor_nome ?? ''
      const pedNum = p.pedido_numero ? `Ped. ${p.pedido_numero}` : ''
      const etapaNome = p.etapa_nome ?? ''
      const sublabel = [
        pedNum || 'Parcela',
        fornNome,
        `Venc ${p.data_vencimento}`,
        p.status,
      ].filter(Boolean).join(' · ')
      const hay = `${label} ${sublabel} ${etapaNome} ${p.valor}`.toLowerCase()
      if (q && !hay.includes(q)) continue
      out.push({ tipo: 'parcela', id: p.id, label, sublabel, valor: Number(p.valor) })
    }
    // Mútuos: captação principal + parcelas individuais
    for (const m of mutuos as any[]) {
      const jaConc = Number(m.valor_conciliado_entrada || 0) + Number(m.valor_conciliado_saida || 0)
      const saldo = Math.max(0, Number(m.valor_captado) - jaConc)
      if (saldo >= 0.01) {
        const cat = String(m.categoria ?? '').toLowerCase().includes('adiantamento') ? 'Adiantamento' : 'Captação'
        const label = `${cat}: ${m.nome}`
        const sublabel = `Mútuo (principal) · ${m.data_captacao} · saldo ${formatCurrency(saldo)}`
        const hay = `${label} ${m.categoria} ${m.valor_captado}`.toLowerCase()
        if (!q || hay.includes(q)) {
          out.push({ tipo: 'mutuo', id: m.id, label, sublabel, valor: Number(m.valor_captado) })
        }
      }
      // Parcelas do mutuo (devolução / recebimento)
      for (const mp of (m.parcelas ?? [] as any[])) {
        if (mp.status === 'paga') continue
        const valorMp = Number(mp.valor) || 0
        const pagoMp = Number(mp.valor_pago || 0)
        const saldoMp = valorMp - pagoMp
        if (saldoMp < 0.01) continue
        const label = `${m.nome} · P${mp.numero_parcela}`
        const sublabel = `Parcela mútuo · Venc ${mp.data_vencimento} · saldo ${formatCurrency(saldoMp)}`
        const hay = `${label} ${m.categoria ?? ''} ${valorMp} ${mp.numero_parcela}`.toLowerCase()
        if (q && !hay.includes(q)) continue
        out.push({ tipo: 'mutuo_parcela', id: mp.id, label, sublabel, valor: valorMp })
      }
    }
    return out.slice(0, q ? 30 : 15)
  }, [parcelas, mutuos, medicoes, search, tipo])

  // Se mudou o tipo e o vínculo selecionado não é mais coerente (ex: medicao em saída), limpa
  useEffect(() => {
    if (vinculo?.tipo === 'medicao' && tipo === 'saida') setVinculo(null)
  }, [tipo, vinculo])

  const handleSubmit = async () => {
    const num = parseValorBR(valor)
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
                          <span className={`text-[9px] rounded px-1 ${
                            vinculo.tipo === 'mutuo' ? 'bg-indigo-500/10 text-indigo-600' :
                            vinculo.tipo === 'mutuo_parcela' ? 'bg-violet-500/10 text-violet-600' :
                            vinculo.tipo === 'medicao' ? 'bg-purple-500/10 text-purple-600' :
                            'bg-blue-500/10 text-blue-600'
                          }`}>
                            {vinculo.tipo === 'mutuo' ? 'MUT' :
                              vinculo.tipo === 'mutuo_parcela' ? 'MUT-P' :
                              vinculo.tipo === 'medicao' ? 'MED' : 'PARC'}
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
                          placeholder={tipo === 'entrada'
                            ? 'Buscar medição, mútuo, parcela ou valor...'
                            : 'Buscar parcela, mútuo ou valor...'}
                          className="w-full rounded-md border bg-background pl-7 pr-2 py-1.5 text-xs" />
                      </div>
                      <div className="mt-1 max-h-48 overflow-auto rounded-md border bg-card">
                        {candidatos.length === 0 && (
                          <p className="p-2 text-center text-[11px] text-muted-foreground">
                            {search ? 'Nenhuma encontrada' : 'Nenhum vínculo pendente'}
                          </p>
                        )}
                        {candidatos.map(c => (
                          <button key={`${c.tipo}-${c.id}`} onClick={() => { setVinculo(c); setSearch('') }}
                            className="w-full flex items-center justify-between p-2 hover:bg-muted text-left border-b last:border-0">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1">
                                <p className="text-xs truncate">{c.label}</p>
                                <span className={`text-[9px] rounded px-1 flex-shrink-0 ${
                                  c.tipo === 'mutuo' ? 'bg-indigo-500/10 text-indigo-600' :
                                  c.tipo === 'mutuo_parcela' ? 'bg-violet-500/10 text-violet-600' :
                                  c.tipo === 'medicao' ? 'bg-purple-500/10 text-purple-600' :
                                  'bg-blue-500/10 text-blue-600'
                                }`}>
                                  {c.tipo === 'mutuo' ? 'MUT' :
                                    c.tipo === 'mutuo_parcela' ? 'MUT-P' :
                                    c.tipo === 'medicao' ? 'MED' : 'PARC'}
                                </span>
                              </div>
                              <p className="text-[10px] text-muted-foreground">{c.sublabel}</p>
                            </div>
                            <span className="text-xs font-mono font-semibold flex-shrink-0 ml-2">{formatCurrency(c.valor)}</span>
                          </button>
                        ))}
                        {!search && candidatos.length >= 15 && (
                          <p className="p-1.5 text-center text-[10px] text-muted-foreground border-t">
                            Digite para filtrar mais resultados
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
                {vinculo && vinculo.tipo !== 'mutuo' && (() => {
                  const num = parseValorBR(valor)
                  if (!num) return null
                  const diff = num - vinculo.valor
                  if (Math.abs(diff) < 0.01) return null
                  const nomeOrigem =
                    vinculo.tipo === 'medicao' ? 'medição' :
                    vinculo.tipo === 'mutuo_parcela' ? 'parcela do mútuo' : 'parcela'
                  return (
                    <p className="flex items-start gap-1 rounded-md bg-amber-500/10 p-2 text-[10px] text-amber-700">
                      <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span>
                        Valor difere do saldo da {nomeOrigem} ({formatCurrency(vinculo.valor)}).
                        {num < vinculo.valor
                          ? ` Será registrado como parcial — a ${nomeOrigem} segue em aberto pelo restante.`
                          : ` Excede o saldo — a ${nomeOrigem} pode ficar com valor pago acima do total.`}
                      </span>
                    </p>
                  )
                })()}
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
