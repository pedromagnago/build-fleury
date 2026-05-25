import { useState, useRef, useEffect } from 'react'
import { X, Send, Loader2, ChevronDown, ChevronUp, Download, HardHat, Sparkles } from 'lucide-react'
import jsPDF from 'jspdf'
import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Item {
  categoria: string
  descricao: string
  unidade: string
  quantidade: number
  valor_unitario: number
}

interface RespostaIA {
  pronto: boolean
  pergunta?: string
  resumo?: string
  itens?: Item[]
  observacoes?: string
  error?: string
}

type Fase = 'chat' | 'revisao' | 'gate' | 'concluido'

interface Props {
  aberto: boolean
  onFechar: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function calcPrecos(itens: Item[], despPct: number, impPct: number, margemPct: number) {
  const custoDireto = itens.reduce((s, it) => s + it.quantidade * it.valor_unitario, 0)
  const despesas = custoDireto * (despPct / 100)
  const custoTotal = custoDireto + despesas
  // fórmula aditiva simplificada — usada no SINAPI para estimativas rápidas
  const impostos = custoTotal * (impPct / 100)
  const margem = custoTotal * (margemPct / 100)
  const precoVenda = custoTotal + impostos + margem
  return { custoDireto, despesas, custoTotal, impostos, margem, precoVenda }
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
function gerarPDF(
  nome: string,
  resumo: string,
  itens: Item[],
  observacoes: string | undefined,
  despPct: number,
  impPct: number,
  margemPct: number,
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 18
  const col = { desc: M, un: M + 90, qtd: M + 110, vunit: M + 130, vtotal: M + 158 }

  // ── Cabeçalho ──────────────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, W, 32, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Simulação de Orçamento', M, 14)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Build Fleury — Software de Gestão de Obras', M, 22)
  doc.text(`buildfleury.com.br`, W - M, 22, { align: 'right' })

  // ── Dados do cliente ────────────────────────────────────────────────────
  doc.setTextColor(15, 23, 42)
  let y = 42
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`Cliente: ${nome}`, M, y)
  doc.setFont('helvetica', 'normal')
  doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, W - M, y, { align: 'right' })
  y += 7
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)
  const linhasResumo = doc.splitTextToSize(resumo, W - 2 * M)
  doc.text(linhasResumo, M, y)
  y += linhasResumo.length * 5 + 6

  // ── Tabela de itens ─────────────────────────────────────────────────────
  doc.setTextColor(15, 23, 42)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Itens de Custo', M, y)
  y += 6

  // Header da tabela
  doc.setFillColor(241, 245, 249)
  doc.rect(M, y - 4, W - 2 * M, 7, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 116, 139)
  doc.text('DESCRIÇÃO', col.desc, y)
  doc.text('UN', col.un, y)
  doc.text('QTD', col.qtd, y)
  doc.text('V.UNIT', col.vunit, y)
  doc.text('TOTAL', col.vtotal, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  let categoriaAtual = ''

  itens.forEach((item, i) => {
    // Linha de categoria
    if (item.categoria !== categoriaAtual) {
      categoriaAtual = item.categoria
      y += 2
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 64, 175)
      doc.setFontSize(8)
      doc.text(item.categoria.toUpperCase(), col.desc, y)
      y += 5
    }

    // Fundo zebra
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252)
      doc.rect(M, y - 3.5, W - 2 * M, 6.5, 'F')
    }

    doc.setTextColor(30, 41, 59)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    const desc = item.descricao.length > 46 ? item.descricao.substring(0, 43) + '...' : item.descricao
    doc.text(desc, col.desc, y)
    doc.text(item.unidade, col.un, y)
    doc.text(item.quantidade.toFixed(item.quantidade % 1 === 0 ? 0 : 1), col.qtd, y)
    doc.text(`R$ ${item.valor_unitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, col.vunit, y)
    doc.text(
      `R$ ${(item.quantidade * item.valor_unitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      col.vtotal,
      y,
    )
    y += 7

    // Nova página se necessário
    if (y > 255) {
      doc.addPage()
      y = 20
    }
  })

  // ── Composição do Preço ─────────────────────────────────────────────────
  y += 6
  const { custoDireto, despesas, impostos, margem, precoVenda } = calcPrecos(
    itens,
    despPct,
    impPct,
    margemPct,
  )

  doc.setFillColor(241, 245, 249)
  doc.rect(W / 2, y - 4, W / 2 - M, 7, 'F')
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text('Composição do Preço', W / 2 + 2, y)
  y += 7

  const linhaPreco = (label: string, valor: number, negrito = false) => {
    doc.setFont('helvetica', negrito ? 'bold' : 'normal')
    doc.setFontSize(9)
    doc.setTextColor(negrito ? 15 : 71, negrito ? 23 : 85, negrito ? 42 : 105)
    doc.text(label, W / 2 + 2, y)
    doc.text(
      `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      W - M,
      y,
      { align: 'right' },
    )
    y += 6
  }

  linhaPreco('Custo direto', custoDireto)
  linhaPreco(`Despesas indiretas (${despPct}%)`, despesas)
  linhaPreco(`Impostos (${impPct}%)`, impostos)
  linhaPreco(`Margem de lucro (${margemPct}%)`, margem)

  doc.setDrawColor(203, 213, 225)
  doc.line(W / 2, y - 2, W - M, y - 2)
  y += 2
  linhaPreco('PREÇO DE VENDA SUGERIDO', precoVenda, true)

  // ── Observações ─────────────────────────────────────────────────────────
  if (observacoes) {
    y += 4
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(100, 116, 139)
    const linhasObs = doc.splitTextToSize(`* ${observacoes}`, W - 2 * M)
    doc.text(linhasObs, M, y)
    y += linhasObs.length * 4.5 + 4
  }

  // ── Rodapé ──────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight()
  doc.setFillColor(248, 250, 252)
  doc.rect(0, pageH - 18, W, 18, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  doc.text('Esta simulação é uma estimativa de referência. Valores finais dependem de visita técnica.', M, pageH - 10)
  doc.text('buildfleury.com.br', W - M, pageH - 10, { align: 'right' })

  doc.save(`orcamento-${nome.toLowerCase().replace(/\s+/g, '-')}.pdf`)
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export function SimuladorOrcamento({ aberto, onFechar }: Props) {
  const [fase, setFase] = useState<Fase>('chat')
  const [mensagens, setMensagens] = useState<{ role: string; content: string }[]>([])
  const [input, setInput] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [perguntaIA, setPerguntaIA] = useState<string | null>(null)
  const [resumo, setResumo] = useState('')
  const [observacoes, setObservacoes] = useState<string | undefined>()
  const [itens, setItens] = useState<Item[]>([])
  const [despPct, setDespPct] = useState(10)
  const [impPct, setImpPct] = useState(8.65)
  const [margemPct, setMargemPct] = useState(15)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [itemExpandido, setItemExpandido] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Reset ao abrir
  useEffect(() => {
    if (aberto) {
      setFase('chat')
      setMensagens([])
      setInput('')
      setPerguntaIA(null)
      setItens([])
      setNome('')
      setEmail('')
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [aberto])

  // Bloqueia scroll do body enquanto modal aberto
  useEffect(() => {
    document.body.style.overflow = aberto ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [aberto])

  async function enviarMensagem() {
    if (!input.trim() || carregando) return
    const novasMensagens = [...mensagens, { role: 'user', content: input.trim() }]
    setMensagens(novasMensagens)
    setInput('')
    setPerguntaIA(null)
    setCarregando(true)

    try {
      const { data, error } = await supabase.functions.invoke('simular-orcamento', {
        body: { messages: novasMensagens },
      })
      if (error) throw error
      const resposta = data as RespostaIA
      if (resposta.error) throw new Error(resposta.error)

      if (resposta.pronto && resposta.itens?.length) {
        setResumo(resposta.resumo ?? '')
        setObservacoes(resposta.observacoes)
        setItens(resposta.itens)
        setFase('revisao')
      } else if (!resposta.pronto && resposta.pergunta) {
        setPerguntaIA(resposta.pergunta)
        setMensagens([...novasMensagens, { role: 'assistant', content: resposta.pergunta }])
      }
    } catch {
      setPerguntaIA('Ops, tive um problema. Pode tentar descrever a obra novamente?')
    } finally {
      setCarregando(false)
    }
  }

  async function salvarLead() {
    if (!nome.trim() || !email.trim()) return
    setSalvando(true)
    const { custoDireto, precoVenda } = calcPrecos(itens, despPct, impPct, margemPct)
    await supabase.from('leads_simulador').insert({
      nome: nome.trim(),
      email: email.trim(),
      descricao: mensagens.find((m) => m.role === 'user')?.content ?? '',
      resumo,
      itens,
      custo_direto_cents: Math.round(custoDireto * 100),
      preco_venda_cents: Math.round(precoVenda * 100),
    })
    gerarPDF(nome.trim(), resumo, itens, observacoes, despPct, impPct, margemPct)
    setSalvando(false)
    setFase('concluido')
  }

  function atualizarItem(idx: number, campo: keyof Item, valor: string | number) {
    setItens((prev) =>
      prev.map((it, i) =>
        i === idx ? { ...it, [campo]: typeof valor === 'string' && campo !== 'descricao' && campo !== 'categoria' && campo !== 'unidade' ? parseFloat(valor as string) || 0 : valor } : it,
      ),
    )
  }

  if (!aberto) return null

  const precos = calcPrecos(itens, despPct, impPct, margemPct)

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onFechar}
      />

      {/* Modal */}
      <div className="relative z-10 w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <HardHat className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">Simulador de Orçamento</p>
              <p className="text-xs text-slate-500 leading-tight">Build Fleury</p>
            </div>
          </div>
          <button
            onClick={onFechar}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Conteúdo por fase */}
        <div className="flex-1 overflow-y-auto">

          {/* ── FASE: chat ────────────────────────────────────────────── */}
          {fase === 'chat' && (
            <div className="p-5 flex flex-col gap-5">
              <div className="rounded-xl bg-primary/5 border border-primary/10 p-4">
                <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary shrink-0" />
                  Descreva sua obra em texto livre
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Ex: "Quero reformar cozinha e banheiro, apartamento de 80m² em SP, incluindo piso, revestimento e hidráulica"
                </p>
              </div>

              {perguntaIA && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-1">Build Fleury IA</p>
                  <p className="text-sm text-slate-700">{perguntaIA}</p>
                </div>
              )}

              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensagem() }
                }}
                rows={4}
                placeholder="Descreva o que você quer construir ou reformar..."
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />

              <button
                onClick={enviarMensagem}
                disabled={!input.trim() || carregando}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {carregando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analisando sua obra…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Simular orçamento
                  </>
                )}
              </button>
            </div>
          )}

          {/* ── FASE: revisao ─────────────────────────────────────────── */}
          {fase === 'revisao' && (
            <div className="flex flex-col">
              {/* Resumo */}
              <div className="px-5 pt-4 pb-3 border-b border-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Obra</p>
                <p className="text-sm font-medium text-slate-800 mt-0.5">{resumo}</p>
              </div>

              {/* Itens editáveis */}
              <div className="px-5 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                  Itens de custo — clique para editar
                </p>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                  {itens.map((item, idx) => {
                    const total = item.quantidade * item.valor_unitario
                    const expandido = itemExpandido === idx
                    return (
                      <div key={idx} className="bg-white">
                        <button
                          onClick={() => setItemExpandido(expandido ? null : idx)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-primary">{item.categoria}</p>
                            <p className="text-sm text-slate-800 truncate">{item.descricao}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold tabular-nums text-slate-900">
                              {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </p>
                            <p className="text-xs text-slate-400">
                              {item.quantidade} {item.unidade}
                            </p>
                          </div>
                          {expandido ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
                        </button>

                        {expandido && (
                          <div className="grid grid-cols-2 gap-3 px-4 pb-4 bg-slate-50 border-t border-slate-100">
                            <div>
                              <label className="text-xs text-slate-500 mb-1 block">Descrição</label>
                              <input
                                type="text"
                                value={item.descricao}
                                onChange={(e) => atualizarItem(idx, 'descricao', e.target.value)}
                                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500 mb-1 block">Unidade</label>
                              <input
                                type="text"
                                value={item.unidade}
                                onChange={(e) => atualizarItem(idx, 'unidade', e.target.value)}
                                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500 mb-1 block">Quantidade</label>
                              <input
                                type="number"
                                value={item.quantidade}
                                onChange={(e) => atualizarItem(idx, 'quantidade', e.target.value)}
                                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500 mb-1 block">Valor unitário (R$)</label>
                              <input
                                type="number"
                                value={item.valor_unitario}
                                onChange={(e) => atualizarItem(idx, 'valor_unitario', e.target.value)}
                                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Composição do preço */}
              <div className="px-5 pt-5 pb-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                  Composição do preço
                </p>
                <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                  <Slider label="Despesas indiretas" value={despPct} onChange={setDespPct} min={5} max={20} step={0.5} />
                  <Slider label="Impostos (ISS + PIS/COFINS)" value={impPct} onChange={setImpPct} min={3} max={15} step={0.25} />
                  <Slider label="Margem de lucro" value={margemPct} onChange={setMargemPct} min={5} max={40} step={1} />
                </div>
              </div>

              {/* Totais */}
              <div className="mx-5 mt-3 mb-4 rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-1.5">
                <LinhaTotalSimples label="Custo direto" valor={precos.custoDireto} />
                <LinhaTotalSimples label={`Despesas indiretas (${despPct}%)`} valor={precos.despesas} />
                <LinhaTotalSimples label={`Impostos (${impPct}%)`} valor={precos.impostos} />
                <LinhaTotalSimples label={`Margem (${margemPct}%)`} valor={precos.margem} />
                <div className="border-t border-slate-200 pt-2 mt-2 flex justify-between">
                  <span className="text-sm font-bold text-slate-900">Preço de venda sugerido</span>
                  <span className="text-base font-bold text-primary tabular-nums">
                    {precos.precoVenda.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── FASE: gate ────────────────────────────────────────────── */}
          {fase === 'gate' && (
            <div className="p-5 flex flex-col gap-5">
              <div className="text-center">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 mb-3">
                  <Download className="h-6 w-6 text-emerald-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Seu orçamento está pronto!</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Informe seus dados para baixar o PDF gratuitamente.
                </p>
              </div>

              {/* Resumo do total */}
              <div className="rounded-xl bg-primary/5 border border-primary/10 p-4 flex justify-between items-center">
                <span className="text-sm text-slate-700">Preço de venda sugerido</span>
                <span className="text-lg font-bold text-primary tabular-nums">
                  {precos.precoVenda.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>

              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Seu nome</label>
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="João Silva"
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Seu e-mail</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="joao@empresa.com.br"
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <button
                onClick={salvarLead}
                disabled={!nome.trim() || !email.trim() || salvando}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {salvando ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Gerando PDF…</>
                ) : (
                  <><Download className="h-4 w-4" />Baixar orçamento em PDF</>
                )}
              </button>
              <p className="text-center text-xs text-slate-400">
                Ao continuar, você concorda em receber contato da Build Fleury sobre o produto.
              </p>
            </div>
          )}

          {/* ── FASE: concluido ───────────────────────────────────────── */}
          {fase === 'concluido' && (
            <div className="p-8 text-center flex flex-col items-center gap-4">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                <svg className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">PDF baixado com sucesso!</h3>
              <p className="text-sm text-slate-500 max-w-xs">
                Seu orçamento está no seu computador. Quer entender como o Build Fleury pode automatizar
                esse processo na sua construtora?
              </p>
              <a
                href="mailto:contato@buildfleury.com.br?subject=Quero%20agendar%20uma%20demo"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
              >
                Agendar demonstração gratuita
              </a>
              <button onClick={onFechar} className="text-sm text-slate-400 hover:text-slate-600">
                Fechar
              </button>
            </div>
          )}
        </div>

        {/* Footer de ação (revisao e gate) */}
        {fase === 'revisao' && (
          <div className="shrink-0 border-t border-slate-200 px-5 py-3 flex gap-3">
            <button
              onClick={() => setFase('chat')}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Refazer
            </button>
            <button
              onClick={() => setFase('gate')}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
            >
              <Download className="h-4 w-4" />
              Baixar PDF
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------
function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-slate-600">{label}</span>
        <span className="text-xs font-semibold tabular-nums text-slate-900">{value.toFixed(value % 1 !== 0 ? 2 : 0)}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  )
}

function LinhaTotalSimples({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs tabular-nums text-slate-700">
        {valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      </span>
    </div>
  )
}

// Supress unused warning for fmt
void fmt
