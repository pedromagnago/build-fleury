/**
 * GapInspectorDrawer — painel lateral de inspeção e correção de gaps
 *
 * Abre à direita a partir do Painel de Controle. Exibe os itens que causam
 * o gap em cada origem e permite editá-los sem sair da página.
 */
import { useState } from 'react'
import { X, Pencil, AlertTriangle, Calendar, CheckCircle2, Loader2, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { useUpdateMedicao, type Medicao } from '@/hooks/useOperacional'
import { useUpdateMutuo, useUpdateMutuoParcela, type Mutuo, type MutuoParcela } from '@/hooks/useMutuos'
import { useParcelas, useCreateParcela, useUpdateParcela, type Parcela } from '@/hooks/useFinanceiro'
import { useUpdatePedido } from '@/hooks/useCompras'
import { supabase } from '@/lib/supabase'
import { PedidoDrilldownModal } from '@/components/financeiro/PedidoDrilldownModal'
import { DespesaIndiretaModal } from '@/components/despesas-indiretas/DespesaIndiretaModal'
import EditParcelaModal from '@/components/financeiro/EditParcelaModal'

export type GapOrigin = 'medicoes' | 'pedidos' | 'indiretos' | 'capital' | 'devolucoes' | 'orfas'

// ─── tipos de suporte ────────────────────────────────────────────────────────

interface Pedido {
  id: string
  numero_pedido: number | null
  fornecedor_nome: string | null
  item_descricao: string | null
  valor_total_real: number
  cond_pagamento: string | null
  data_entrega_real: string | null
  nf_origem_id: string | null
}

// ─── helpers de datas / parcelas ─────────────────────────────────────────────

function parseCond(cond: string | null | undefined): number[] {
  if (!cond || cond.trim() === '' || cond.trim() === '0') return [0]
  const nums = cond.split('/').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 0)
  return nums.length > 0 ? nums : [0]
}

function addDaysISO(base: string, days: number): string {
  const d = new Date(base + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function calcParcelas(
  valor: number,
  cond: string | null,
  dataBase: string,
): Array<{ numero: number; valor: number; data_vencimento: string }> {
  const dias = parseCond(cond)
  const n = dias.length
  const valorBase = Math.floor((valor / n) * 100) / 100
  const resto = Math.round((valor - valorBase * n) * 100) / 100
  return dias.map((d, i) => ({
    numero: i + 1,
    valor: i === n - 1 ? valorBase + resto : valorBase,
    data_vencimento: addDaysISO(dataBase, d),
  }))
}

interface Despesa {
  id: string
  descricao: string
  categoria: string
  valor_orcado: number
}

interface GapInspectorDrawerProps {
  origin: GapOrigin | null
  onClose: () => void
  medicoes: Medicao[]
  pedidos: Pedido[]
  parcelas: Parcela[]
  mutuos: Mutuo[]
  despesas: Despesa[]
  fcTotalPedidos: number
  pedidosTotal: number
}

// ─── helpers visuais ─────────────────────────────────────────────────────────

const INPUT = 'flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary'
const BTN_SM = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors'

const ORIGIN_LABELS: Record<GapOrigin, { title: string; subtitle: string }> = {
  medicoes:    { title: 'Medições',             subtitle: 'sem data prevista → invisíveis ao FC' },
  pedidos:     { title: 'Pedidos de Obra',      subtitle: 'sem parcela gerada → FC usa estimativa' },
  indiretos:   { title: 'Custos Indiretos',     subtitle: 'sem parcela ou banco acima do orçado' },
  capital:     { title: 'Capital de Giro',      subtitle: 'sem data de captação ou divergência com banco' },
  devolucoes:  { title: 'Devoluções de Mútuo',  subtitle: 'parcelas sem data ou banco acima do planejado' },
  orfas:       { title: 'Parcelas sem origem',  subtitle: 'parcelas contratuais sem pedido — reconectar ao pedido correto' },
}

// ─── sub-componentes de edição inline ────────────────────────────────────────

function InlineDate({
  label, value, onSave, saving,
}: { label: string; value: string; onSave: (v: string) => void; saving: boolean }) {
  const [v, setV] = useState(value || '')
  const [editing, setEditing] = useState(!value)
  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{label}:</span>
        <span className="text-xs font-medium">{v ? new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</span>
        <button onClick={() => setEditing(true)} className="text-primary hover:underline text-xs">Alterar</button>
      </div>
    )
  }
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <input type="date" value={v} onChange={e => setV(e.target.value)} className={INPUT} />
      </div>
      <button
        disabled={!v || saving}
        onClick={() => { onSave(v); setEditing(false) }}
        className={`${BTN_SM} bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50`}
      >
        {saving ? 'Salvando…' : 'Salvar'}
      </button>
      {value && <button onClick={() => setEditing(false)} className={`${BTN_SM} bg-muted hover:bg-muted/80`}>Cancelar</button>}
    </div>
  )
}

// ─── seções por origem ────────────────────────────────────────────────────────

function SecaoMedicoes({ medicoes }: { medicoes: Medicao[] }) {
  const update = useUpdateMedicao()
  const semData = medicoes.filter(m => !m.data_prevista)
  if (semData.length === 0) return <EmptyState msg="Todas as medições têm data prevista." />
  return (
    <ul className="space-y-3">
      {semData.map(m => (
        <ItemCard key={m.id}
          badge={`Medição nº ${m.numero}`}
          valor={m.valor_planejado}
          alerta="Sem data prevista — invisível ao FC"
        >
          <InlineDate
            label="Data prevista"
            value={m.data_prevista || ''}
            saving={update.isPending}
            onSave={v => update.mutate({ id: m.id, data_prevista: v })}
          />
        </ItemCard>
      ))}
    </ul>
  )
}

interface GerarState {
  pedido: Pedido
  dataBase: string
  items: Array<{ numero: number; valor: number; data_vencimento: string }>
  loading: boolean
  nfDate: string | null  // date fetched from NF, null if not available
}

function SecaoPedidos({ pedidos, parcelas }: { pedidos: Pedido[]; parcelas: Parcela[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [gerar, setGerar] = useState<GerarState | null>(null)
  const [fetchingId, setFetchingId] = useState<string | null>(null)
  const createParcela = useCreateParcela()
  const updatePedido = useUpdatePedido()

  const pedidosComParcela = new Set(parcelas.filter(p => p.pedido_id).map(p => p.pedido_id))
  const semParcela = pedidos.filter(p => !pedidosComParcela.has(p.id))

  const iniciarGerar = async (p: Pedido) => {
    setFetchingId(p.id)
    let dataBase = p.data_entrega_real || ''
    let nfDate: string | null = null

    // Prioridade: NF data_emissao → data_entrega_real do pedido → hoje
    if (p.nf_origem_id) {
      const { data } = await supabase
        .from('recepcao_docs')
        .select('data_emissao')
        .eq('id', p.nf_origem_id)
        .single()
      if (data?.data_emissao) {
        nfDate = data.data_emissao
        dataBase = data.data_emissao
      }
    }

    if (!dataBase) dataBase = new Date().toISOString().split('T')[0]

    setFetchingId(null)
    setGerar({
      pedido: p,
      dataBase,
      nfDate,
      items: calcParcelas(Number(p.valor_total_real || 0), p.cond_pagamento, dataBase),
      loading: false,
    })
  }

  const onDataBaseChange = (novaData: string) => {
    if (!gerar) return
    setGerar({
      ...gerar,
      dataBase: novaData,
      items: calcParcelas(Number(gerar.pedido.valor_total_real || 0), gerar.pedido.cond_pagamento, novaData),
    })
  }

  const confirmar = async () => {
    if (!gerar) return
    setGerar(s => s ? { ...s, loading: true } : null)
    try {
      // Atualiza data_entrega_real do pedido se veio da NF e o pedido não tinha
      if (gerar.nfDate && !gerar.pedido.data_entrega_real) {
        await updatePedido.mutateAsync({ id: gerar.pedido.id, data_entrega_real: gerar.nfDate })
      }
      // Cria parcelas sequencialmente para garantir ordem
      for (const item of gerar.items) {
        await createParcela.mutateAsync({
          pedido_id: gerar.pedido.id,
          numero_parcela: item.numero,
          valor: item.valor,
          data_vencimento: item.data_vencimento,
          data_prevista_pagamento: item.data_vencimento,
          tipo: 'contratual',
          status: 'futura',
          valor_pago: 0,
        } as any)
      }
      toast.success(`${gerar.items.length} parcela(s) criada(s) para Pedido #${gerar.pedido.numero_pedido}`)
      setGerar(null)
    } catch {
      setGerar(s => s ? { ...s, loading: false } : null)
    }
  }

  if (semParcela.length === 0) return <EmptyState msg="Todos os pedidos têm parcelas geradas." />

  return (
    <>
      <div className="mb-3 text-[11px] text-muted-foreground">
        {semParcela.length} pedido(s) sem parcela · clique em <strong>Gerar parcelas</strong> para criar as parcelas com base na condição de pagamento e data de entrada.
      </div>

      {/* Preview de geração */}
      {gerar && (
        <div className="mb-4 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold">
              Pedido #{gerar.pedido.numero_pedido} — {gerar.pedido.fornecedor_nome}
            </span>
            <button onClick={() => setGerar(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {gerar.nfDate && (
            <div className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Data base obtida da NF de origem ({gerar.nfDate})
            </div>
          )}
          {!gerar.nfDate && !gerar.pedido.data_entrega_real && (
            <div className="text-[11px] text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Sem data de entrada — usando hoje como base. Ajuste se necessário.
            </div>
          )}

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Data base (entrada)</div>
            <input
              type="date"
              value={gerar.dataBase}
              onChange={e => onDataBaseChange(e.target.value)}
              className={INPUT}
            />
          </div>

          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {gerar.items.length} parcela(s) · cond. {gerar.pedido.cond_pagamento || '0 dias'}
            </div>
            {gerar.items.map(item => (
              <div key={item.numero} className="flex items-center justify-between text-xs bg-background rounded px-2 py-1.5 border">
                <span className="text-muted-foreground">Parc. {item.numero}</span>
                <span className="flex items-center gap-2">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  {new Date(item.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                </span>
                <span className="font-semibold tabular-nums">{formatCurrency(item.valor)}</span>
              </div>
            ))}
          </div>

          <button
            onClick={confirmar}
            disabled={gerar.loading || !gerar.dataBase}
            className={`${BTN_SM} w-full justify-center bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50`}
          >
            {gerar.loading
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Criando…</>
              : <><CheckCircle2 className="h-3 w-3" /> Confirmar criação</>}
          </button>
        </div>
      )}

      <ul className="space-y-3">
        {semParcela.map(p => (
          <ItemCard key={p.id}
            badge={p.numero_pedido != null ? `Pedido #${p.numero_pedido}` : 'Pedido s/ nº'}
            descricao={[p.fornecedor_nome, p.item_descricao].filter(Boolean).join(' · ')}
            valor={p.valor_total_real}
            alerta="Sem parcela — FC usa estimativa sem data precisa"
          >
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => iniciarGerar(p)}
                disabled={fetchingId === p.id || (gerar?.pedido.id === p.id && gerar.loading)}
                className={`${BTN_SM} bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50`}
              >
                {fetchingId === p.id
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Buscando data…</>
                  : <><ChevronRight className="h-3 w-3" /> Gerar parcelas</>}
              </button>
              <button
                onClick={() => setOpenId(p.id)}
                className={`${BTN_SM} border hover:bg-muted text-muted-foreground`}
              >
                <Pencil className="h-3 w-3" /> Abrir pedido
              </button>
            </div>
          </ItemCard>
        ))}
      </ul>

      {openId && <PedidoDrilldownModal pedidoId={openId} onClose={() => setOpenId(null)} />}
    </>
  )
}

function SecaoIndiretos({ despesas, parcelas }: { despesas: Despesa[]; parcelas: Parcela[] }) {
  const [openDespesa, setOpenDespesa] = useState<Despesa | null>(null)
  const [openParcela, setOpenParcela] = useState<Parcela | null>(null)
  const despesasComParcela = new Set(parcelas.filter(p => p.despesa_indireta_id).map(p => p.despesa_indireta_id))
  const semParcela = despesas.filter(d => !despesasComParcela.has(d.id))
  const comParcela = despesas.filter(d => despesasComParcela.has(d.id))

  return (
    <>
      {semParcela.length > 0 && (
        <div className="space-y-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sem parcela gerada</div>
          <ul className="space-y-3">
            {semParcela.map(d => (
              <ItemCard key={d.id}
                badge={d.categoria}
                descricao={d.descricao}
                valor={d.valor_orcado}
                alerta="Sem parcela → ausente do FC"
              >
                <button onClick={() => setOpenDespesa(d as any)} className={`${BTN_SM} bg-primary text-primary-foreground hover:bg-primary/90`}>
                  <Pencil className="h-3 w-3" /> Editar despesa
                </button>
              </ItemCard>
            ))}
          </ul>
        </div>
      )}
      {comParcela.length > 0 && (
        <div className="space-y-3 mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Com parcela — editar condições</div>
          <ul className="space-y-3">
            {comParcela.map(d => {
              const parcs = parcelas.filter(p => p.despesa_indireta_id === d.id)
              return parcs.map(p => (
                <ItemCard key={p.id}
                  badge={d.categoria}
                  descricao={`${d.descricao} — Parcela ${p.numero_parcela}`}
                  valor={p.valor}
                >
                  <button onClick={() => setOpenParcela(p)} className={`${BTN_SM} bg-primary text-primary-foreground hover:bg-primary/90`}>
                    <Pencil className="h-3 w-3" /> Editar parcela
                  </button>
                </ItemCard>
              ))
            })}
          </ul>
        </div>
      )}
      {semParcela.length === 0 && comParcela.length === 0 && <EmptyState msg="Nenhuma despesa indireta encontrada." />}
      {openDespesa && <DespesaIndiretaModal initialData={openDespesa as any} onClose={() => setOpenDespesa(null)} />}
      {openParcela && <EditParcelaModal parcela={openParcela} onClose={() => setOpenParcela(null)} onDone={() => setOpenParcela(null)} />}
    </>
  )
}

function SecaoCapital({ mutuos }: { mutuos: Mutuo[] }) {
  const update = useUpdateMutuo()
  const comProblema = mutuos.filter(m =>
    String(m.categoria ?? '').toUpperCase() !== 'STUB_DEDUPE' &&
    String(m.status ?? '') !== 'cancelado'
  )
  if (comProblema.length === 0) return <EmptyState msg="Todos os mútuos estão configurados." />
  return (
    <ul className="space-y-3">
      {comProblema.map(m => (
        <ItemCard key={m.id}
          badge={m.tipo}
          descricao={m.nome}
          valor={m.valor_captado}
          alerta={!m.data_captacao ? 'Sem data de captação → invisível ao FC' : undefined}
        >
          <InlineDate
            label="Data de captação"
            value={m.data_captacao || ''}
            saving={update.isPending}
            onSave={v => update.mutate({ id: m.id, data_captacao: v })}
          />
        </ItemCard>
      ))}
    </ul>
  )
}

function SecaoDevolucoes({ mutuos, parcelas }: { mutuos: Mutuo[]; parcelas: Parcela[] }) {
  const [openParcela, setOpenParcela] = useState<Parcela | null>(null)
  const updateParcela = useUpdateMutuoParcela()

  const todosParcelas: Array<{ mutuo: Mutuo; parcela: MutuoParcela }> = []
  for (const m of mutuos) {
    if (String(m.categoria ?? '').toUpperCase() === 'STUB_DEDUPE') continue
    for (const p of m.parcelas ?? []) {
      todosParcelas.push({ mutuo: m, parcela: p })
    }
  }

  const semData = todosParcelas.filter(({ parcela: p }) => !p.data_vencimento)
  const comData = todosParcelas.filter(({ parcela: p }) => !!p.data_vencimento)

  // Para edição de parcela de mútuo, mapeamos para o tipo Parcela esperado pelo EditParcelaModal
  // (o modal é agnóstico quanto à origem desde que receba os campos base)
  const toParcelaShape = (p: MutuoParcela): Parcela => ({
    id: p.id,
    company_id: p.company_id,
    pedido_id: null,
    despesa_indireta_id: null,
    numero_parcela: p.numero_parcela,
    valor: p.valor,
    valor_pago: p.valor_pago,
    data_vencimento: p.data_vencimento,
    data_pagamento_real: p.data_pagamento_real,
    status: p.status as any,
    observacoes: p.observacoes,
    created_at: p.created_at,
  } as Parcela)

  return (
    <>
      {semData.length > 0 && (
        <div className="space-y-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sem data de vencimento</div>
          <ul className="space-y-3">
            {semData.map(({ mutuo: m, parcela: p }) => (
              <ItemCard key={p.id}
                badge={`${m.nome} — Parc ${p.numero_parcela}`}
                valor={p.valor}
                alerta="Sem data → invisível ao FC"
              >
                <InlineDate
                  label="Data de vencimento"
                  value={p.data_vencimento || ''}
                  saving={updateParcela.isPending}
                  onSave={v => updateParcela.mutate({ id: p.id, data_vencimento: v })}
                />
              </ItemCard>
            ))}
          </ul>
        </div>
      )}
      {comData.length > 0 && (
        <div className="space-y-3 mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Com data — editar parcela</div>
          <ul className="space-y-3">
            {comData.map(({ mutuo: m, parcela: p }) => (
              <ItemCard key={p.id}
                badge={`${m.nome} — Parc ${p.numero_parcela}`}
                descricao={p.data_vencimento ? new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                valor={p.valor}
              >
                <button
                  onClick={() => setOpenParcela(toParcelaShape(p))}
                  className={`${BTN_SM} bg-primary text-primary-foreground hover:bg-primary/90`}
                >
                  <Pencil className="h-3 w-3" /> Editar parcela
                </button>
              </ItemCard>
            ))}
          </ul>
        </div>
      )}
      {semData.length === 0 && comData.length === 0 && <EmptyState msg="Nenhuma parcela de mútuo encontrada." />}
      {openParcela && (
        <EditParcelaModal
          parcela={openParcela}
          onClose={() => setOpenParcela(null)}
          onDone={() => setOpenParcela(null)}
        />
      )}
    </>
  )
}

// ─── card genérico de item ────────────────────────────────────────────────────

function ItemCard({
  badge, descricao, valor, alerta, children,
}: {
  badge: string
  descricao?: string
  valor?: number
  alerta?: string
  children?: React.ReactNode
}) {
  return (
    <li className="rounded-xl border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-xs font-semibold">{badge}</span>
          {descricao && <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{descricao}</div>}
        </div>
        {valor != null && (
          <span className="text-xs font-semibold tabular-nums shrink-0">{formatCurrency(valor)}</span>
        )}
      </div>
      {alerta && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-600">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {alerta}
        </div>
      )}
      {children && <div>{children}</div>}
    </li>
  )
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
      <CheckCircle2 className="h-8 w-8 text-emerald-500" />
      <p className="text-sm">{msg}</p>
    </div>
  )
}

// ─── Parcelas contratuais sem origem ─────────────────────────────────────────

function SecaoOrfas({ parcelas, pedidos }: { parcelas: Parcela[]; pedidos: Pedido[] }) {
  const updateParcela = useUpdateParcela()
  const [salvandoId, setSalvandoId] = useState<string | null>(null)
  const [selecoes, setSelecoes] = useState<Record<string, string>>({})

  const orfas = parcelas.filter(p => !p.pedido_id && !p.despesa_indireta_id && p.tipo !== 'adiantamento')
  if (orfas.length === 0) return <EmptyState msg="Nenhuma parcela contratual sem origem." />

  const vincular = async (parcelaId: string) => {
    const pedidoId = selecoes[parcelaId]
    if (!pedidoId) return
    setSalvandoId(parcelaId)
    try {
      await updateParcela.mutateAsync({ id: parcelaId, pedido_id: pedidoId } as any)
      toast.success('Parcela vinculada ao pedido')
      setSelecoes(s => { const n = { ...s }; delete n[parcelaId]; return n })
    } finally {
      setSalvandoId(null)
    }
  }

  return (
    <ul className="space-y-3">
      {orfas.map(p => (
        <ItemCard key={p.id}
          badge={`Parcela ${p.numero_parcela} — ${formatCurrency(p.valor)}`}
          descricao={p.descricao || `Venc. ${p.data_vencimento ? new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'} · ${p.status}`}
          valor={p.valor}
          alerta="Sem pedido vinculado — não entra na equação A"
        >
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <div className="text-[10px] text-muted-foreground mb-1">Conectar ao pedido:</div>
              <select
                value={selecoes[p.id] ?? ''}
                onChange={e => setSelecoes(s => ({ ...s, [p.id]: e.target.value }))}
                className="w-full rounded border bg-background px-2 py-1 text-xs"
              >
                <option value="">Selecione um pedido…</option>
                {pedidos
                  .slice()
                  .sort((a, b) => (b.numero_pedido ?? 0) - (a.numero_pedido ?? 0))
                  .map(ped => (
                    <option key={ped.id} value={ped.id}>
                      #{ped.numero_pedido} — {ped.fornecedor_nome || '—'} ({formatCurrency(ped.valor_total_real)})
                    </option>
                  ))}
              </select>
            </div>
            <button
              onClick={() => vincular(p.id)}
              disabled={!selecoes[p.id] || salvandoId === p.id}
              className={`${BTN_SM} bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0`}
            >
              {salvandoId === p.id
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <CheckCircle2 className="h-3 w-3" />}
              Vincular
            </button>
          </div>
        </ItemCard>
      ))}
    </ul>
  )
}

// ─── Drawer principal ─────────────────────────────────────────────────────────

export function GapInspectorDrawer({
  origin, onClose,
  medicoes, pedidos, parcelas, mutuos, despesas,
}: GapInspectorDrawerProps) {
  if (!origin) return null
  const { title, subtitle } = ORIGIN_LABELS[origin]

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-background shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-bold">{title}</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {origin === 'medicoes'   && <SecaoMedicoes medicoes={medicoes} />}
          {origin === 'pedidos'    && <SecaoPedidos pedidos={pedidos} parcelas={parcelas} />}
          {origin === 'indiretos'  && <SecaoIndiretos despesas={despesas} parcelas={parcelas} />}
          {origin === 'capital'    && <SecaoCapital mutuos={mutuos} />}
          {origin === 'devolucoes' && <SecaoDevolucoes mutuos={mutuos} parcelas={parcelas} />}
          {origin === 'orfas'      && <SecaoOrfas parcelas={parcelas} pedidos={pedidos} />}
        </div>
      </div>
    </>
  )
}
