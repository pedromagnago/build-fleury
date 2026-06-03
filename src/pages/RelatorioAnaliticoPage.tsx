import { useState, useMemo, useCallback } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { useItensCompra, usePedidoItens, usePedidos, useFornecedores } from '@/hooks/useCompras'
import { useEtapas } from '@/hooks/useEtapas'
import { useAvancos } from '@/hooks/useOperacional'
import { useParcelas } from '@/hooks/useFinanceiro'
import { useMedicoes } from '@/hooks/useOperacional'
import { useMedicaoParcelas } from '@/hooks/useMedicaoParcelas'
import { useMutuos } from '@/hooks/useMutuos'
import { usePersistedState } from '@/hooks/usePersistedState'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Download, Printer, Search, ChevronDown, ChevronRight,
  PanelLeftClose, PanelLeft, BarChart3, X,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type Grain = 'item' | 'etapa' | 'pedido' | 'medicao' | 'mutuo'
type GroupBy = 'none' | 'etapa' | 'fornecedor' | 'tipo'
type SortDir = 'asc' | 'desc'
type ColGroup = 'orcamento' | 'compras' | 'pagamentos' | 'recebimentos' | 'fisico' | 'derivados'

interface ColDef {
  id: string
  group: ColGroup
  label: string
  align: 'left' | 'right' | 'center'
  fixed?: boolean
  sumable?: boolean
  width?: number
}

interface BuilderConfig {
  grain: Grain
  groupBy: GroupBy
  visibleCols: string[]
  filters: {
    etapas: string[]
    fornecedores: string[]
    tipos: string[]
    search: string
    statusMed: string[]
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COLUMN GROUP METADATA
// ─────────────────────────────────────────────────────────────────────────────

const GROUP_META: Record<ColGroup, { label: string; bg: string; text: string; borderBottom: string }> = {
  orcamento:    { label: 'Orçamento',     bg: 'bg-slate-100 dark:bg-slate-800',      text: 'text-slate-700 dark:text-slate-200',    borderBottom: 'border-slate-300 dark:border-slate-600' },
  compras:      { label: 'Compras',        bg: 'bg-blue-50 dark:bg-blue-950',         text: 'text-blue-700 dark:text-blue-300',       borderBottom: 'border-blue-300 dark:border-blue-700' },
  pagamentos:   { label: 'Pagamentos',     bg: 'bg-amber-50 dark:bg-amber-950',       text: 'text-amber-700 dark:text-amber-300',     borderBottom: 'border-amber-300 dark:border-amber-700' },
  recebimentos: { label: 'Recebimentos',   bg: 'bg-emerald-50 dark:bg-emerald-950',   text: 'text-emerald-700 dark:text-emerald-300', borderBottom: 'border-emerald-300 dark:border-emerald-700' },
  fisico:       { label: 'Físico',         bg: 'bg-purple-50 dark:bg-purple-950',     text: 'text-purple-700 dark:text-purple-300',   borderBottom: 'border-purple-300 dark:border-purple-700' },
  derivados:    { label: 'Saldo / Margem', bg: 'bg-gray-100 dark:bg-gray-900',        text: 'text-gray-600 dark:text-gray-300',       borderBottom: 'border-gray-300 dark:border-gray-700' },
}

// ─────────────────────────────────────────────────────────────────────────────
// COLUMN DEFINITIONS PER GRAIN
// ─────────────────────────────────────────────────────────────────────────────

const ITEM_COLS: ColDef[] = [
  // Identification (fixed)
  { id: 'item_codigo',      group: 'orcamento',  label: 'Código',        align: 'left',   fixed: true,  width: 80  },
  { id: 'item_descricao',   group: 'orcamento',  label: 'Descrição',     align: 'left',   fixed: true,  width: 220 },
  { id: 'observacoes',      group: 'orcamento',  label: 'Observações',   align: 'left',                 width: 200 },
  // Orçamento
  { id: 'val_orcado',       group: 'orcamento',  label: 'Orçado',        align: 'right',  sumable: true, width: 115 },
  { id: 'item_tipo',        group: 'orcamento',  label: 'Tipo',          align: 'center',               width: 100 },
  { id: 'item_unidade',     group: 'orcamento',  label: 'Unidade',       align: 'center',               width: 70  },
  { id: 'item_qtd_total',   group: 'orcamento',  label: 'Qtd Orç.',      align: 'right',                width: 85  },
  { id: 'item_custo_unit',  group: 'orcamento',  label: 'Custo Unit.',   align: 'right',                width: 110 },
  // Compras
  { id: 'fornecedor',       group: 'compras',    label: 'Fornecedor',    align: 'left',                 width: 160 },
  { id: 'val_comprometido', group: 'compras',    label: 'Comprometido',  align: 'right',  sumable: true, width: 120 },
  { id: 'num_pedidos',      group: 'compras',    label: 'Pedidos',       align: 'center',               width: 70  },
  { id: 'qtd_pedida',       group: 'compras',    label: 'Qtd Pedida',    align: 'right',                width: 90  },
  { id: 'qtd_recebida',     group: 'compras',    label: 'Qtd c/ NF',    align: 'right',                width: 85  },
  { id: 'val_com_nf',       group: 'compras',    label: 'Valor c/ NF',   align: 'right',  sumable: true, width: 115 },
  // Pagamentos
  { id: 'val_parcelas',     group: 'pagamentos', label: 'Parcelas',      align: 'right',  sumable: true, width: 115 },
  { id: 'val_pago',         group: 'pagamentos', label: 'Pago',          align: 'right',  sumable: true, width: 100 },
  { id: 'val_a_pagar',      group: 'pagamentos', label: 'A Pagar',       align: 'right',  sumable: true, width: 100 },
  // Derivados
  { id: 'saldo_orcado',     group: 'derivados',  label: 'Saldo Orç.',    align: 'right',  sumable: true, width: 115 },
  { id: 'pct_comprometido', group: 'derivados',  label: '% Comp.',       align: 'right',                width: 78  },
  { id: 'pct_pago',         group: 'derivados',  label: '% Pago',        align: 'right',                width: 78  },
]

const ETAPA_COLS: ColDef[] = [
  { id: 'codigo',           group: 'orcamento',   label: 'Código',       align: 'left',   fixed: true,  width: 80  },
  { id: 'nome',             group: 'orcamento',   label: 'Etapa',        align: 'left',   fixed: true,  width: 200 },
  { id: 'val_orcado',       group: 'orcamento',   label: 'Orçado',       align: 'right',  sumable: true, width: 115 },
  { id: 'qtd_itens',        group: 'orcamento',   label: 'Itens',        align: 'center',               width: 60  },
  { id: 'casas_meta',       group: 'fisico',      label: 'Casas Meta',   align: 'center',               width: 90  },
  { id: 'casas_real',       group: 'fisico',      label: 'Casas Real',   align: 'center',               width: 90  },
  { id: 'pct_fisico',       group: 'fisico',      label: '% Físico',     align: 'right',                width: 85  },
  { id: 'val_comprometido', group: 'compras',     label: 'Comprometido', align: 'right',  sumable: true, width: 120 },
  { id: 'qtd_pedidos',      group: 'compras',     label: 'Pedidos',      align: 'center',               width: 70  },
  { id: 'val_com_nf',       group: 'compras',     label: 'Valor c/ NF',  align: 'right',  sumable: true, width: 115 },
  { id: 'val_parcelas',     group: 'pagamentos',  label: 'Parcelas',     align: 'right',  sumable: true, width: 115 },
  { id: 'val_pago',         group: 'pagamentos',  label: 'Pago',         align: 'right',  sumable: true, width: 100 },
  { id: 'val_a_pagar',      group: 'pagamentos',  label: 'A Pagar',      align: 'right',  sumable: true, width: 100 },
  { id: 'saldo_orcado',     group: 'derivados',   label: 'Saldo Orç.',   align: 'right',  sumable: true, width: 115 },
  { id: 'pct_comprometido', group: 'derivados',   label: '% Comp.',      align: 'right',                width: 78  },
]

const PEDIDO_COLS: ColDef[] = [
  { id: 'num_pedido',       group: 'compras',    label: 'Nº Pedido',     align: 'center', fixed: true,  width: 90  },
  { id: 'item_descricao',   group: 'orcamento',  label: 'Item',          align: 'left',   fixed: true,  width: 180 },
  { id: 'etapa_nome',       group: 'orcamento',  label: 'Etapa',         align: 'left',                 width: 140 },
  { id: 'fornecedor',       group: 'compras',    label: 'Fornecedor',    align: 'left',                 width: 160 },
  { id: 'val_comprometido', group: 'compras',    label: 'Valor Pedido',  align: 'right',  sumable: true, width: 120 },
  { id: 'status_pedido',    group: 'compras',    label: 'Status',        align: 'center',               width: 130 },
  { id: 'data_entrega_prev',group: 'compras',    label: 'Entrega Prev.', align: 'center',               width: 105 },
  { id: 'data_entrega_real',group: 'compras',    label: 'Entrega Real',  align: 'center',               width: 105 },
  { id: 'val_parcelas',     group: 'pagamentos', label: 'Parcelas',      align: 'right',  sumable: true, width: 115 },
  { id: 'val_pago',         group: 'pagamentos', label: 'Pago',          align: 'right',  sumable: true, width: 100 },
  { id: 'val_a_pagar',      group: 'pagamentos', label: 'A Pagar',       align: 'right',  sumable: true, width: 100 },
  { id: 'observacoes',      group: 'compras',    label: 'Observações',   align: 'left',                 width: 200 },
]

const MEDICAO_COLS: ColDef[] = [
  { id: 'numero',           group: 'orcamento',   label: 'Medição',       align: 'center', fixed: true, width: 80  },
  { id: 'data_prevista',    group: 'orcamento',   label: 'Data Prevista', align: 'center',              width: 105 },
  { id: 'status_med',       group: 'orcamento',   label: 'Status',        align: 'center',              width: 120 },
  { id: 'pct_med_meta',     group: 'recebimentos',label: '% Meta',        align: 'right',               width: 85  },
  { id: 'pct_med_real',     group: 'recebimentos',label: '% Real',        align: 'right',               width: 85  },
  { id: 'val_med_plan',     group: 'recebimentos',label: 'Planejado',     align: 'right',  sumable: true, width: 115 },
  { id: 'val_liberado',     group: 'recebimentos',label: 'Liberado',      align: 'right',  sumable: true, width: 115 },
  { id: 'val_parcelas_med', group: 'recebimentos',label: 'Parcelas',      align: 'right',  sumable: true, width: 115 },
  { id: 'val_recebido',     group: 'recebimentos',label: 'Recebido',      align: 'right',  sumable: true, width: 115 },
  { id: 'val_a_receber',    group: 'recebimentos',label: 'A Receber',     align: 'right',  sumable: true, width: 115 },
  { id: 'observacoes',      group: 'recebimentos',label: 'Observações',   align: 'left',                 width: 200 },
]

const MUTUO_COLS: ColDef[] = [
  { id: 'nome',             group: 'compras',    label: 'Nome',          align: 'left',   fixed: true,  width: 180 },
  { id: 'tipo',             group: 'compras',    label: 'Tipo',          align: 'center',               width: 110 },
  { id: 'instituicao',      group: 'compras',    label: 'Instituição',   align: 'left',                 width: 140 },
  { id: 'data_captacao',    group: 'compras',    label: 'Captação',      align: 'center',               width: 100 },
  { id: 'val_captado',      group: 'compras',    label: 'Captado',       align: 'right',  sumable: true, width: 115 },
  { id: 'taxa_juros',       group: 'compras',    label: 'Taxa % m',      align: 'right',                width: 90  },
  { id: 'val_pago_mutuo',   group: 'pagamentos', label: 'Pago',          align: 'right',  sumable: true, width: 100 },
  { id: 'n_parcelas',       group: 'pagamentos', label: 'Parcelas',      align: 'center',               width: 70  },
  { id: 'saldo_devedor',    group: 'derivados',  label: 'Saldo Devedor', align: 'right',  sumable: true, width: 120 },
  { id: 'status_mutuo',     group: 'derivados',  label: 'Status',        align: 'center',               width: 110 },
  { id: 'observacoes',      group: 'derivados',  label: 'Observações',   align: 'left',                 width: 200 },
]

const COLS_BY_GRAIN: Record<Grain, ColDef[]> = {
  item:    ITEM_COLS,
  etapa:   ETAPA_COLS,
  pedido:  PEDIDO_COLS,
  medicao: MEDICAO_COLS,
  mutuo:   MUTUO_COLS,
}

const DEFAULT_VISIBLE: Record<Grain, string[]> = {
  item:    ['item_codigo', 'item_descricao', 'val_orcado', 'fornecedor', 'val_comprometido', 'val_pago', 'val_a_pagar', 'saldo_orcado', 'pct_comprometido'],
  etapa:   ['codigo', 'nome', 'val_orcado', 'qtd_itens', 'casas_meta', 'casas_real', 'val_comprometido', 'val_pago', 'saldo_orcado', 'pct_comprometido'],
  pedido:  ['num_pedido', 'item_descricao', 'etapa_nome', 'fornecedor', 'val_comprometido', 'status_pedido', 'data_entrega_prev', 'val_pago', 'val_a_pagar'],
  medicao: ['numero', 'data_prevista', 'status_med', 'pct_med_meta', 'pct_med_real', 'val_med_plan', 'val_liberado', 'val_recebido', 'val_a_receber'],
  mutuo:   ['nome', 'tipo', 'instituicao', 'val_captado', 'taxa_juros', 'val_pago_mutuo', 'saldo_devedor', 'status_mutuo'],
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toFixed(1) + '%'
}
function fmtNum(v: number | null | undefined): string {
  if (v == null || v === 0) return '—'
  return v.toLocaleString('pt-BR')
}

const TIPO_LABEL: Record<string, { label: string; cls: string }> = {
  MATERIAL:      { label: 'Material',    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200' },
  MAO_DE_OBRA:   { label: 'Mão de Obra', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200' },
  EQUIPAMENTO:   { label: 'Equip.',      cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200' },
}

const STATUS_PEDIDO_LABEL: Record<string, { label: string; cls: string }> = {
  planejado:              { label: 'Planejado',        cls: 'bg-slate-100 text-slate-600' },
  pedido_enviado:         { label: 'Enviado',          cls: 'bg-blue-100 text-blue-700' },
  parcialmente_entregue:  { label: 'Parc. Entregue',   cls: 'bg-amber-100 text-amber-700' },
  entregue:               { label: 'Entregue',         cls: 'bg-emerald-100 text-emerald-700' },
  parcialmente_pago:      { label: 'Parc. Pago',       cls: 'bg-orange-100 text-orange-700' },
  pago:                   { label: 'Pago',             cls: 'bg-green-100 text-green-700' },
  cancelado:              { label: 'Cancelado',        cls: 'bg-red-100 text-red-700' },
}

const STATUS_MED_LABEL: Record<string, { label: string; cls: string }> = {
  futura:     { label: 'Futura',     cls: 'bg-slate-100 text-slate-600' },
  em_medicao: { label: 'Em Medição', cls: 'bg-blue-100 text-blue-700' },
  liberada:   { label: 'Liberada',   cls: 'bg-emerald-100 text-emerald-700' },
  paga:       { label: 'Paga',       cls: 'bg-green-100 text-green-700' },
}

const STATUS_MUTUO_LABEL: Record<string, { label: string; cls: string }> = {
  ativo:       { label: 'Ativo',      cls: 'bg-blue-100 text-blue-700' },
  quitado:     { label: 'Quitado',    cls: 'bg-green-100 text-green-700' },
  inadimplente:{ label: 'Inadim.',    cls: 'bg-red-100 text-red-700' },
}

function Badge({ text, cls }: { text: string; cls: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${cls}`}>{text}</span>
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILDER PANEL
// ─────────────────────────────────────────────────────────────────────────────

const GRAIN_OPTIONS: { id: Grain; label: string }[] = [
  { id: 'item',    label: 'Item de Orçamento' },
  { id: 'etapa',   label: 'Etapa' },
  { id: 'pedido',  label: 'Pedido' },
  { id: 'medicao', label: 'Medição' },
  { id: 'mutuo',   label: 'Mútuo / CG' },
]

const GROUPBY_OPTIONS: { id: GroupBy; label: string }[] = [
  { id: 'none',       label: 'Sem agrupamento' },
  { id: 'etapa',      label: 'Por Etapa' },
  { id: 'fornecedor', label: 'Por Fornecedor' },
  { id: 'tipo',       label: 'Por Tipo de Item' },
]

interface BuilderPanelProps {
  config: BuilderConfig
  onChange: (c: BuilderConfig) => void
  etapasOptions: { id: string; label: string }[]
  fornecedoresOptions: { id: string; label: string }[]
}

function BuilderPanel({ config, onChange, etapasOptions, fornecedoresOptions }: BuilderPanelProps) {
  const [colsOpen, setColsOpen] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const cols = COLS_BY_GRAIN[config.grain]

  const groups = useMemo(() => {
    const seen = new Set<ColGroup>()
    const result: ColGroup[] = []
    for (const c of cols) if (!seen.has(c.group)) { seen.add(c.group); result.push(c.group) }
    return result
  }, [cols])

  const toggleCol = (id: string) => {
    const set = new Set(config.visibleCols)
    if (set.has(id)) { set.delete(id) } else { set.add(id) }
    onChange({ ...config, visibleCols: Array.from(set) })
  }

  const toggleGroup = (group: ColGroup) => {
    const inGroup = cols.filter(c => c.group === group && !c.fixed).map(c => c.id)
    const allOn = inGroup.every(id => config.visibleCols.includes(id))
    const set = new Set(config.visibleCols)
    inGroup.forEach(id => allOn ? set.delete(id) : set.add(id))
    onChange({ ...config, visibleCols: Array.from(set) })
  }

  const activeFilterCount = config.filters.etapas.length + config.filters.fornecedores.length + config.filters.tipos.length + (config.filters.search ? 1 : 0)

  return (
    <div className="flex h-full flex-col gap-0 overflow-y-auto text-xs">
      {/* Grain */}
      <div className="border-b px-3 py-2.5">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Visualizar por</p>
        <div className="flex flex-col gap-0.5">
          {GRAIN_OPTIONS.map(g => (
            <button
              key={g.id}
              onClick={() => onChange({
                ...config,
                grain: g.id,
                groupBy: 'none',
                visibleCols: DEFAULT_VISIBLE[g.id],
                filters: { etapas: [], fornecedores: [], tipos: [], search: '', statusMed: [] },
              })}
              className={`rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                config.grain === g.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Group By (item grain only) */}
      {config.grain === 'item' && (
        <div className="border-b px-3 py-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Agrupar por</p>
          <div className="flex flex-col gap-0.5">
            {GROUPBY_OPTIONS.map(g => (
              <button
                key={g.id}
                onClick={() => onChange({ ...config, groupBy: g.id })}
                className={`rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                  config.groupBy === g.id
                    ? 'bg-secondary text-secondary-foreground font-medium'
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Columns */}
      <div className="border-b">
        <button
          onClick={() => setColsOpen(v => !v)}
          className="flex w-full items-center justify-between px-3 py-2.5 hover:bg-muted/50"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Colunas</p>
          <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${colsOpen ? 'rotate-180' : ''}`} />
        </button>
        {colsOpen && (
          <div className="pb-2">
            {groups.map(group => {
              const groupCols = cols.filter(c => c.group === group && !c.fixed)
              const allOn = groupCols.every(c => config.visibleCols.includes(c.id))
              const anyOn = groupCols.some(c => config.visibleCols.includes(c.id))
              const gm = GROUP_META[group]
              return (
                <div key={group} className="mt-1 px-2">
                  <div className={`flex items-center gap-2 rounded-t px-2 py-1 ${gm.bg}`}>
                    <input
                      type="checkbox"
                      checked={allOn}
                      ref={el => { if (el) el.indeterminate = anyOn && !allOn }}
                      onChange={() => toggleGroup(group)}
                      className="h-3 w-3 cursor-pointer"
                    />
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${gm.text}`}>{gm.label}</span>
                  </div>
                  <div className="rounded-b border border-t-0 px-2 py-1 dark:border-gray-700">
                    {groupCols.map(c => (
                      <label key={c.id} className="flex cursor-pointer items-center gap-1.5 py-0.5 hover:text-foreground text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={config.visibleCols.includes(c.id)}
                          onChange={() => toggleCol(c.id)}
                          className="h-3 w-3 cursor-pointer"
                        />
                        <span>{c.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Filters */}
      <div>
        <button
          onClick={() => setFiltersOpen(v => !v)}
          className="flex w-full items-center justify-between px-3 py-2.5 hover:bg-muted/50"
        >
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Filtros</p>
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">{activeFilterCount}</span>
            )}
          </div>
          <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
        </button>
        {filtersOpen && (
          <div className="space-y-3 px-3 pb-3">
            {/* Text search */}
            <div>
              <label className="mb-1 block text-[10px] uppercase text-muted-foreground">Buscar</label>
              <input
                type="text"
                value={config.filters.search}
                onChange={e => onChange({ ...config, filters: { ...config.filters, search: e.target.value } })}
                placeholder="Código, descrição…"
                className="w-full rounded border bg-background px-2 py-1 text-xs"
              />
            </div>

            {/* Etapas (item + pedido grains) */}
            {(config.grain === 'item' || config.grain === 'pedido' || config.grain === 'etapa') && (
              <div>
                <label className="mb-1 block text-[10px] uppercase text-muted-foreground">Etapas</label>
                <div className="max-h-28 overflow-y-auto rounded border p-1 dark:border-gray-700">
                  {etapasOptions.map(e => (
                    <label key={e.id} className="flex cursor-pointer items-center gap-1.5 py-0.5 text-[11px] hover:text-foreground text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={config.filters.etapas.includes(e.id)}
                        onChange={() => {
                          const next = config.filters.etapas.includes(e.id)
                            ? config.filters.etapas.filter(x => x !== e.id)
                            : [...config.filters.etapas, e.id]
                          onChange({ ...config, filters: { ...config.filters, etapas: next } })
                        }}
                        className="h-3 w-3 cursor-pointer"
                      />
                      {e.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Tipo de item (item grain only) */}
            {config.grain === 'item' && (
              <div>
                <label className="mb-1 block text-[10px] uppercase text-muted-foreground">Tipo de Item</label>
                <div className="flex flex-col gap-0.5">
                  {['MATERIAL', 'MAO_DE_OBRA', 'EQUIPAMENTO'].map(t => (
                    <label key={t} className="flex cursor-pointer items-center gap-1.5 py-0.5 text-[11px] hover:text-foreground text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={config.filters.tipos.includes(t)}
                        onChange={() => {
                          const next = config.filters.tipos.includes(t)
                            ? config.filters.tipos.filter(x => x !== t)
                            : [...config.filters.tipos, t]
                          onChange({ ...config, filters: { ...config.filters, tipos: next } })
                        }}
                        className="h-3 w-3 cursor-pointer"
                      />
                      {TIPO_LABEL[t]?.label ?? t}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Fornecedores */}
            {(config.grain === 'item' || config.grain === 'pedido') && fornecedoresOptions.length > 0 && (
              <div>
                <label className="mb-1 block text-[10px] uppercase text-muted-foreground">Fornecedor</label>
                <div className="max-h-28 overflow-y-auto rounded border p-1 dark:border-gray-700">
                  {fornecedoresOptions.map(f => (
                    <label key={f.id} className="flex cursor-pointer items-center gap-1.5 py-0.5 text-[11px] hover:text-foreground text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={config.filters.fornecedores.includes(f.id)}
                        onChange={() => {
                          const next = config.filters.fornecedores.includes(f.id)
                            ? config.filters.fornecedores.filter(x => x !== f.id)
                            : [...config.filters.fornecedores, f.id]
                          onChange({ ...config, filters: { ...config.filters, fornecedores: next } })
                        }}
                        className="h-3 w-3 cursor-pointer"
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Status medição */}
            {config.grain === 'medicao' && (
              <div>
                <label className="mb-1 block text-[10px] uppercase text-muted-foreground">Status</label>
                {Object.entries(STATUS_MED_LABEL).map(([k, v]) => (
                  <label key={k} className="flex cursor-pointer items-center gap-1.5 py-0.5 text-[11px] hover:text-foreground text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={config.filters.statusMed.includes(k)}
                      onChange={() => {
                        const next = config.filters.statusMed.includes(k)
                          ? config.filters.statusMed.filter(x => x !== k)
                          : [...config.filters.statusMed, k]
                        onChange({ ...config, filters: { ...config.filters, statusMed: next } })
                      }}
                      className="h-3 w-3 cursor-pointer"
                    />
                    {v.label}
                  </label>
                ))}
              </div>
            )}

            {activeFilterCount > 0 && (
              <button
                onClick={() => onChange({ ...config, filters: { etapas: [], fornecedores: [], tipos: [], search: '', statusMed: [] } })}
                className="flex w-full items-center justify-center gap-1 rounded border px-2 py-1 text-[11px] hover:bg-muted"
              >
                <X className="h-3 w-3" /> Limpar filtros
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function RelatorioAnaliticoPage() {
  // ── Hooks de dados ──────────────────────────────────────────────────────────
  const { data: itens = [] }          = useItensCompra()
  const { data: etapas = [] }         = useEtapas()
  const { data: pedidoItens = [] }    = usePedidoItens()
  const { data: pedidos = [] }        = usePedidos()
  const { data: parcelas = [] }       = useParcelas()
  const { data: medicoes = [] }       = useMedicoes()
  const { data: medParcelas = [] }    = useMedicaoParcelas()
  const { data: mutuos = [] }         = useMutuos()
  const { data: fornecedores = [] }   = useFornecedores()
  const { data: avancos = [] }        = useAvancos()

  // ── Builder state ───────────────────────────────────────────────────────────
  const [config, setConfig] = usePersistedState<BuilderConfig>('relatorio-analitico-v2', {
    grain: 'item',
    groupBy: 'etapa',
    visibleCols: DEFAULT_VISIBLE.item,
    filters: { etapas: [], fornecedores: [], tipos: [], search: '', statusMed: [] },
  })
  const [panelOpen, setPanelOpen] = usePersistedState<boolean>('relatorio-analitico-panel', true)
  const [sort, setSort] = useState<{ col: string; dir: SortDir }>({ col: 'item_codigo', dir: 'asc' })
  const [search, setSearch] = useState('')

  // ── Filter options ──────────────────────────────────────────────────────────
  const etapasOptions = useMemo(() =>
    etapas.map(e => ({ id: e.id, label: `${e.codigo} ${e.nome}` })).sort((a, b) => a.label.localeCompare(b.label)),
  [etapas])

  const fornecedoresOptions = useMemo(() => {
    const names = new Set<string>()
    fornecedores.forEach(f => names.add(f.nome))
    return Array.from(names).sort().map(n => ({ id: n, label: n }))
  }, [fornecedores])

  // ── Data aggregation: itens → item rows ─────────────────────────────────────
  const itemRows = useMemo(() => {
    // comprMap: item_compra_id → aggregated compras data
    const comprMap = new Map<string, {
      comprometido: number; qtd_pedida: number; qtd_recebida: number; val_com_nf: number
      pedido_ids: Set<string>; fornecedor: string | null; observacoes: string | null
    }>()
    for (const pi of pedidoItens as any[]) {
      const ped = pi.pedidos
      if (!ped || ped.status === 'cancelado') continue
      const foraOrc = pi.fora_orcamento === true
      const existing = comprMap.get(pi.item_compra_id) ?? {
        comprometido: 0, qtd_pedida: 0, qtd_recebida: 0, val_com_nf: 0,
        pedido_ids: new Set<string>(), fornecedor: null, observacoes: null,
      }
      if (!foraOrc) {
        existing.comprometido += Number(pi.valor_total_real ?? 0)
        existing.qtd_pedida += Number(pi.qtd ?? 0)
      }
      const qtdRec = Number(pi.qtd_recebida ?? 0)
      existing.qtd_recebida += qtdRec
      existing.val_com_nf += qtdRec * Number(pi.valor_unitario_real ?? 0)
      if (!existing.pedido_ids.has(pi.pedido_id)) {
        existing.pedido_ids.add(pi.pedido_id)
        if (!existing.fornecedor) existing.fornecedor = ped.fornecedores?.nome ?? null
        if (!existing.observacoes && ped.observacoes) existing.observacoes = ped.observacoes
      }
      comprMap.set(pi.item_compra_id, existing)
    }

    // pagMap: item_compra_id → parcelas data (via pedido.item_compra_id)
    const pagMap = new Map<string, { val_parcelas: number; val_pago: number }>()
    for (const par of parcelas as any[]) {
      const itemId = par.item_compra_id
      if (!itemId) continue
      const existing = pagMap.get(itemId) ?? { val_parcelas: 0, val_pago: 0 }
      const valor = Number(par.valor ?? 0)
      existing.val_parcelas += valor
      existing.val_pago += Math.min(Number(par.valor_pago ?? 0), valor)
      pagMap.set(itemId, existing)
    }

    // etapa codigo map
    const etapaCodigo = new Map(etapas.map(e => [e.id, e.codigo]))

    return itens.map(it => {
      const compr = comprMap.get(it.id)
      const pag = pagMap.get(it.id)
      const val_orcado = Number(it.valor_total_orcado ?? 0)
      const val_comprometido = compr?.comprometido ?? 0
      const val_parcelas = pag?.val_parcelas ?? 0
      const val_pago = pag?.val_pago ?? 0
      const val_a_pagar = Math.max(0, val_parcelas - val_pago)
      const saldo_orcado = val_orcado - val_comprometido
      return {
        id: it.id,
        etapa_id: it.etapa_id ?? '',
        etapa_nome: (it as any).etapa_nome ?? etapas.find(e => e.id === it.etapa_id)?.nome ?? '—',
        etapa_codigo: it.etapa_id ? (etapaCodigo.get(it.etapa_id) ?? '') : '',
        item_codigo: it.codigo,
        item_descricao: it.descricao,
        item_tipo: it.tipo,
        item_unidade: it.unidade ?? null,
        item_qtd_total: it.qtd_total,
        item_custo_unit: it.custo_unitario_orcado,
        fornecedor: compr?.fornecedor ?? (it as any).fornecedor_nome ?? null,
        fornecedor_id: it.fornecedor_id ?? null,
        observacoes: compr?.observacoes ?? null,
        val_orcado,
        val_comprometido,
        qtd_pedida: compr?.qtd_pedida ?? 0,
        qtd_recebida: compr?.qtd_recebida ?? 0,
        val_com_nf: compr?.val_com_nf ?? 0,
        num_pedidos: compr?.pedido_ids.size ?? 0,
        val_parcelas,
        val_pago,
        val_a_pagar,
        saldo_orcado,
        pct_comprometido: val_orcado > 0 ? (val_comprometido / val_orcado) * 100 : null,
        pct_pago: val_comprometido > 0 ? (val_pago / val_comprometido) * 100 : null,
      }
    })
  }, [itens, pedidoItens, parcelas, etapas])

  // ── Data aggregation: etapa rows ─────────────────────────────────────────────
  const etapaRows = useMemo(() => {
    // Aggregate from itemRows
    const agg = new Map<string, {
      val_orcado: number; val_comprometido: number; qtd_itens: number; qtd_pedidos: number
      val_com_nf: number; val_parcelas: number; val_pago: number; val_a_pagar: number; pedido_ids: Set<string>
    }>()
    for (const r of itemRows) {
      const existing = agg.get(r.etapa_id) ?? {
        val_orcado: 0, val_comprometido: 0, qtd_itens: 0, qtd_pedidos: 0,
        val_com_nf: 0, val_parcelas: 0, val_pago: 0, val_a_pagar: 0, pedido_ids: new Set()
      }
      existing.val_orcado += r.val_orcado
      existing.val_comprometido += r.val_comprometido
      existing.qtd_itens++
      existing.val_com_nf += r.val_com_nf
      existing.val_parcelas += r.val_parcelas
      existing.val_pago += r.val_pago
      existing.val_a_pagar += r.val_a_pagar
      if (r.num_pedidos > 0) existing.qtd_pedidos += r.num_pedidos
      agg.set(r.etapa_id, existing)
    }

    // Casas reais por etapa (from avancos)
    const casasRealMap = new Map<string, number>()
    for (const av of avancos as any[]) {
      if (!av.etapa_id) continue
      casasRealMap.set(av.etapa_id, (casasRealMap.get(av.etapa_id) ?? 0) + Number(av.casas_concluidas ?? 0))
    }

    return etapas.map(e => {
      const a = agg.get(e.id) ?? {
        val_orcado: 0, val_comprometido: 0, qtd_itens: 0, qtd_pedidos: 0,
        val_com_nf: 0, val_parcelas: 0, val_pago: 0, val_a_pagar: 0, pedido_ids: new Set()
      }
      const casas_meta = (e as any).casas_total ?? 0
      const casas_real = casasRealMap.get(e.id) ?? 0
      return {
        id: e.id,
        codigo: e.codigo,
        nome: e.nome,
        casas_meta,
        casas_real,
        pct_fisico: casas_meta > 0 ? (casas_real / casas_meta) * 100 : null,
        qtd_itens: a.qtd_itens,
        val_orcado: a.val_orcado,
        val_comprometido: a.val_comprometido,
        qtd_pedidos: a.qtd_pedidos,
        val_com_nf: a.val_com_nf,
        val_parcelas: a.val_parcelas,
        val_pago: a.val_pago,
        val_a_pagar: a.val_a_pagar,
        saldo_orcado: a.val_orcado - a.val_comprometido,
        pct_comprometido: a.val_orcado > 0 ? (a.val_comprometido / a.val_orcado) * 100 : null,
      }
    })
  }, [etapas, itemRows, avancos])

  // ── Data aggregation: pedido rows ────────────────────────────────────────────
  const pedidoRows = useMemo(() => {
    const pagPedido = new Map<string, { val_parcelas: number; val_pago: number }>()
    for (const par of parcelas as any[]) {
      if (!par.pedido_id) continue
      const existing = pagPedido.get(par.pedido_id) ?? { val_parcelas: 0, val_pago: 0 }
      const valor = Number(par.valor ?? 0)
      existing.val_parcelas += valor
      existing.val_pago += Math.min(Number(par.valor_pago ?? 0), valor)
      pagPedido.set(par.pedido_id, existing)
    }
    return pedidos.map(p => {
      const pag = pagPedido.get(p.id)
      const firstItem = p.itens?.[0]
      return {
        id: p.id,
        num_pedido: p.numero_pedido ?? '—',
        item_descricao: p.item_descricao ?? firstItem?.item_descricao ?? '—',
        etapa_nome: firstItem?.etapa_nome ?? '—',
        fornecedor: p.fornecedor_nome ?? '—',
        fornecedor_id: p.fornecedor_id ?? null,
        etapa_id: firstItem?.etapa_id ?? null,
        val_comprometido: Number(p.valor_total_real ?? 0),
        status_pedido: p.status,
        data_entrega_prev: p.data_entrega_prevista,
        data_entrega_real: p.data_entrega_real,
        val_parcelas: pag?.val_parcelas ?? 0,
        val_pago: pag?.val_pago ?? 0,
        val_a_pagar: Math.max(0, (pag?.val_parcelas ?? 0) - (pag?.val_pago ?? 0)),
        observacoes: p.observacoes ?? null,
      }
    })
  }, [pedidos, parcelas])

  // ── Data aggregation: medição rows ───────────────────────────────────────────
  const medicaoRows = useMemo(() => {
    const parcelasByMed = new Map<string, { val_parcelas: number; val_recebido: number }>()
    for (const mp of medParcelas) {
      const existing = parcelasByMed.get(mp.medicao_id) ?? { val_parcelas: 0, val_recebido: 0 }
      existing.val_parcelas += Number(mp.valor ?? 0)
      existing.val_recebido += Number(mp.valor_recebido ?? 0)
      parcelasByMed.set(mp.medicao_id, existing)
    }
    return medicoes.map(m => {
      const mp = parcelasByMed.get(m.id)
      const val_med_plan = Number(m.valor_planejado ?? 0)
      const val_liberado = Number(m.valor_liberado ?? 0)
      const val_parcelas_med = mp?.val_parcelas ?? 0
      const val_recebido = mp?.val_recebido ?? 0
      return {
        id: m.id,
        numero: m.numero,
        data_prevista: m.data_prevista,
        status_med: m.status,
        pct_med_meta: m.percentual_fisico_meta,
        pct_med_real: m.percentual_fisico_real,
        val_med_plan,
        val_liberado,
        val_parcelas_med,
        val_recebido,
        val_a_receber: Math.max(0, val_parcelas_med - val_recebido),
        observacoes: m.observacoes ?? null,
      }
    })
  }, [medicoes, medParcelas])

  // ── Data aggregation: mútuo rows ────────────────────────────────────────────
  const mutualRows = useMemo(() => mutuos.map(m => {
    const parcelas_list = m.parcelas ?? []
    const val_pago_mutuo = parcelas_list.reduce((s, p) => s + Number(p.valor_pago ?? 0), 0)
    const val_captado = Number(m.valor_captado ?? 0)
    return {
      id: m.id,
      nome: m.nome,
      tipo: m.tipo,
      instituicao: m.instituicao ?? (m as any).fornecedor?.nome ?? '—',
      data_captacao: m.data_captacao,
      val_captado,
      taxa_juros: m.taxa_juros_mensal,
      val_pago_mutuo,
      n_parcelas: parcelas_list.length,
      saldo_devedor: Math.max(0, val_captado - val_pago_mutuo),
      status_mutuo: m.status,
      observacoes: m.observacoes ?? null,
    }
  }), [mutuos])

  // ── Active rows (select by grain) ───────────────────────────────────────────
  const allRows = useMemo((): any[] => {
    const { grain } = config
    if (grain === 'item')    return itemRows
    if (grain === 'etapa')   return etapaRows
    if (grain === 'pedido')  return pedidoRows
    if (grain === 'medicao') return medicaoRows
    if (grain === 'mutuo')   return mutualRows
    return []
  }, [config.grain, itemRows, etapaRows, pedidoRows, medicaoRows, mutualRows])

  // ── Filter rows ─────────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    const q = (search || config.filters.search).toLowerCase().trim()
    return allRows.filter(r => {
      // Text search
      if (q) {
        const haystack = [r.item_descricao, r.item_codigo, r.nome, r.codigo, r.fornecedor, r.num_pedido?.toString()].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      // Etapa filter
      if (config.filters.etapas.length) {
        const rEtapa = r.etapa_id ?? r.id
        if (!config.filters.etapas.includes(rEtapa)) return false
      }
      // Tipo filter (item grain)
      if (config.filters.tipos.length && r.item_tipo) {
        if (!config.filters.tipos.includes(r.item_tipo)) return false
      }
      // Fornecedor filter (name-based)
      if (config.filters.fornecedores.length && r.fornecedor) {
        if (!config.filters.fornecedores.includes(r.fornecedor)) return false
      }
      // Status med filter
      if (config.filters.statusMed.length && r.status_med) {
        if (!config.filters.statusMed.includes(r.status_med)) return false
      }
      return true
    })
  }, [allRows, search, config.filters])

  // ── Sort rows ───────────────────────────────────────────────────────────────
  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const va = a[sort.col]
      const vb = b[sort.col]
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [filteredRows, sort])

  // ── Group rows (item grain only) ─────────────────────────────────────────────
  const groupedRows = useMemo((): { key: string; label: string; rows: any[] }[] | null => {
    if (config.grain !== 'item' || config.groupBy === 'none') return null
    const groupMap = new Map<string, { key: string; label: string; rows: any[] }>()
    for (const r of sortedRows) {
      let key = '', label = ''
      if (config.groupBy === 'etapa')      { key = r.etapa_id || 'sem_etapa'; label = r.etapa_codigo ? `${r.etapa_codigo} – ${r.etapa_nome}` : r.etapa_nome }
      if (config.groupBy === 'fornecedor') { key = r.fornecedor || 'sem_fornecedor'; label = r.fornecedor || 'Sem fornecedor' }
      if (config.groupBy === 'tipo')       { key = r.item_tipo; label = TIPO_LABEL[r.item_tipo]?.label ?? r.item_tipo }
      if (!groupMap.has(key)) groupMap.set(key, { key, label, rows: [] })
      groupMap.get(key)!.rows.push(r)
    }
    return Array.from(groupMap.values())
  }, [sortedRows, config.grain, config.groupBy])

  // ── Visible columns ─────────────────────────────────────────────────────────
  const allCols = COLS_BY_GRAIN[config.grain]
  const visibleCols = useMemo(() =>
    allCols.filter(c => c.fixed || config.visibleCols.includes(c.id)),
  [allCols, config.visibleCols])

  // ── Column groups (for header row 1) ─────────────────────────────────────────
  const colGroupSpans = useMemo(() => {
    const spans: { group: ColGroup; count: number }[] = []
    for (const c of visibleCols) {
      const last = spans[spans.length - 1]
      if (!last || last.group !== c.group) {
        spans.push({ group: c.group, count: 1 })
      } else {
        last.count++
      }
    }
    return spans
  }, [visibleCols])

  // ── KPI totals ───────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (config.grain === 'item' || config.grain === 'etapa' || config.grain === 'pedido') {
      const val_orcado     = sortedRows.reduce((s, r) => s + (r.val_orcado ?? 0), 0)
      const val_comprometido = sortedRows.reduce((s, r) => s + (r.val_comprometido ?? 0), 0)
      const val_pago       = sortedRows.reduce((s, r) => s + (r.val_pago ?? 0), 0)
      const val_a_pagar    = sortedRows.reduce((s, r) => s + (r.val_a_pagar ?? 0), 0)
      return [
        { label: 'Orçado',        value: formatCurrency(val_orcado),       cls: '' },
        { label: 'Comprometido',  value: formatCurrency(val_comprometido), sub: val_orcado > 0 ? fmtPct((val_comprometido/val_orcado)*100) : null, cls: 'text-blue-600' },
        { label: 'Pago',          value: formatCurrency(val_pago),         sub: val_comprometido > 0 ? fmtPct((val_pago/val_comprometido)*100) : null, cls: 'text-emerald-600' },
        { label: 'A Pagar',       value: formatCurrency(val_a_pagar),      cls: 'text-amber-600' },
        { label: 'Saldo Orç.',    value: formatCurrency(val_orcado - val_comprometido), cls: (val_orcado - val_comprometido) >= 0 ? '' : 'text-red-600' },
      ]
    }
    if (config.grain === 'medicao') {
      const val_med_plan  = sortedRows.reduce((s, r) => s + (r.val_med_plan ?? 0), 0)
      const val_liberado  = sortedRows.reduce((s, r) => s + (r.val_liberado ?? 0), 0)
      const val_recebido  = sortedRows.reduce((s, r) => s + (r.val_recebido ?? 0), 0)
      const val_a_receber = sortedRows.reduce((s, r) => s + (r.val_a_receber ?? 0), 0)
      return [
        { label: 'Planejado',   value: formatCurrency(val_med_plan),  cls: '' },
        { label: 'Liberado',    value: formatCurrency(val_liberado),  sub: val_med_plan > 0 ? fmtPct((val_liberado/val_med_plan)*100) : null, cls: 'text-blue-600' },
        { label: 'Recebido',    value: formatCurrency(val_recebido),  cls: 'text-emerald-600' },
        { label: 'A Receber',   value: formatCurrency(val_a_receber), cls: 'text-amber-600' },
      ]
    }
    if (config.grain === 'mutuo') {
      const val_captado = sortedRows.reduce((s, r) => s + (r.val_captado ?? 0), 0)
      const val_pago    = sortedRows.reduce((s, r) => s + (r.val_pago_mutuo ?? 0), 0)
      const saldo       = sortedRows.reduce((s, r) => s + (r.saldo_devedor ?? 0), 0)
      return [
        { label: 'Captado',       value: formatCurrency(val_captado), cls: '' },
        { label: 'Pago',          value: formatCurrency(val_pago),    cls: 'text-emerald-600' },
        { label: 'Saldo Devedor', value: formatCurrency(saldo),       cls: 'text-amber-600' },
      ]
    }
    return []
  }, [sortedRows, config.grain])

  // ── Sort handler ─────────────────────────────────────────────────────────────
  const handleSort = useCallback((colId: string) => {
    setSort(prev => prev.col === colId ? { col: colId, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col: colId, dir: 'asc' })
  }, [])

  // ── Cell value renderer ──────────────────────────────────────────────────────
  const renderCell = useCallback((col: ColDef, row: any): React.ReactNode => {
    const v = row[col.id]
    switch (col.id) {
      case 'item_tipo': {
        const t = TIPO_LABEL[v]
        return t ? <Badge text={t.label} cls={t.cls} /> : <span className="text-muted-foreground">—</span>
      }
      case 'status_pedido': {
        const s = STATUS_PEDIDO_LABEL[v]
        return s ? <Badge text={s.label} cls={s.cls} /> : <span className="text-muted-foreground capitalize">{v}</span>
      }
      case 'status_med': {
        const s = STATUS_MED_LABEL[v]
        return s ? <Badge text={s.label} cls={s.cls} /> : <span className="text-muted-foreground capitalize">{v}</span>
      }
      case 'status_mutuo': {
        const s = STATUS_MUTUO_LABEL[v]
        return s ? <Badge text={s.label} cls={s.cls} /> : <span className="text-muted-foreground capitalize">{v}</span>
      }
      case 'pct_comprometido': case 'pct_pago': case 'pct_fisico': case 'pct_med_meta': case 'pct_med_real':
        return <span className={v != null && v > 100 ? 'text-red-600 font-semibold' : ''}>{fmtPct(v)}</span>
      case 'item_qtd_total': case 'qtd_pedida': case 'qtd_recebida': case 'num_pedidos': case 'qtd_itens': case 'qtd_pedidos': case 'n_parcelas':
        return <span className="tabular-nums">{fmtNum(v)}</span>
      case 'taxa_juros':
        return v != null ? <span className="tabular-nums">{Number(v).toFixed(2)}%</span> : <span className="text-muted-foreground">—</span>
      case 'data_entrega_prev': case 'data_entrega_real': case 'data_prevista': case 'data_captacao':
        return v ? <span className="text-xs tabular-nums">{formatDate(v)}</span> : <span className="text-muted-foreground">—</span>
      case 'val_orcado': case 'val_comprometido': case 'val_com_nf': case 'val_parcelas': case 'val_med_plan':
      case 'val_parcelas_med': case 'val_captado':
        return <span className="tabular-nums">{v ? formatCurrency(v) : <span className="text-muted-foreground text-xs">—</span>}</span>
      case 'val_pago': case 'val_pago_mutuo': case 'val_recebido': case 'val_liberado':
        return <span className={`tabular-nums ${v > 0 ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}`}>
          {v > 0 ? formatCurrency(v) : '—'}
        </span>
      case 'val_a_pagar': case 'val_a_receber':
        return <span className={`tabular-nums ${v > 0.01 ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
          {v > 0.01 ? formatCurrency(v) : '—'}
        </span>
      case 'saldo_orcado': case 'saldo_devedor':
        return <span className={`tabular-nums font-medium ${v >= 0 ? '' : 'text-red-600'}`}>
          {formatCurrency(v ?? 0)}
        </span>
      case 'item_custo_unit':
        return <span className="tabular-nums text-xs text-muted-foreground">{v ? formatCurrency(v) : '—'}</span>
      case 'observacoes':
        return v
          ? <span className="text-xs text-muted-foreground max-w-[200px] truncate block" title={v}>{v}</span>
          : <span className="text-muted-foreground text-[10px]">—</span>
      case 'item_unidade': case 'fornecedor': case 'instituicao': case 'etapa_nome':
        return <span className="text-xs">{v || <span className="text-muted-foreground">—</span>}</span>
      case 'casas_meta': case 'casas_real':
        return <span className="tabular-nums">{v != null ? v : '—'}</span>
      default:
        return <span>{v != null ? String(v) : <span className="text-muted-foreground">—</span>}</span>
    }
  }, [])

  // ── Footer totals ────────────────────────────────────────────────────────────
  const footerTotals = useMemo(() => {
    const tot: Record<string, number> = {}
    for (const col of visibleCols) {
      if (col.sumable) tot[col.id] = sortedRows.reduce((s, r) => s + (Number(r[col.id]) || 0), 0)
    }
    return tot
  }, [visibleCols, sortedRows])

  // ── Group subtotals ──────────────────────────────────────────────────────────
  const getSubtotals = (rows: any[]) => {
    const tot: Record<string, number> = {}
    for (const col of visibleCols) {
      if (col.sumable) tot[col.id] = rows.reduce((s, r) => s + (Number(r[col.id]) || 0), 0)
    }
    return tot
  }

  // ── Export CSV ───────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const header = visibleCols.map(c => c.label).join(';')
    const formatCSV = (col: ColDef, r: any): string => {
      const v = r[col.id]
      if (v == null) return ''
      if (col.sumable) return String(Number(v).toFixed(2)).replace('.', ',')
      if (col.id.startsWith('pct_') || col.id === 'taxa_juros') return v != null ? String(Number(v).toFixed(1)).replace('.', ',') : ''
      if (col.id.startsWith('data_')) return v ? formatDate(v) : ''
      return String(v).replace(/;/g, ',')
    }
    const rows = sortedRows.map(r => visibleCols.map(c => formatCSV(c, r)).join(';')).join('\n')
    const blob = new Blob(['﻿' + header + '\n' + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `relatorio_analitico_${config.grain}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const tableContent = () => {
    const rows = groupedRows ?? [{ key: '_all', label: '', rows: sortedRows }]
    const showGroups = groupedRows !== null
    const nonFixedCols = visibleCols.filter(c => !c.fixed)

    return rows.map(({ key, label, rows: groupRows }) => (
      <GroupBlock
        key={key}
        label={label}
        rows={groupRows}
        showGroupHeader={showGroups}
        visibleCols={visibleCols}
        renderCell={renderCell}
        footerCols={nonFixedCols}
        subtotals={showGroups ? getSubtotals(groupRows) : null}
      />
    ))
  }

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden">
      <div className="flex-none px-4 pt-4 pb-2">
        <PageHeader
          title="Análise Integrada"
          description="Super tabela de planejado a realizado — construa a visão que precisar"
          icon={BarChart3}
        />
      </div>

      {/* KPI bar */}
      <div className="flex-none px-4 pb-2">
        <div className="flex flex-wrap gap-2">
          {kpis.map(k => (
            <div key={k.label} className="rounded-xl border bg-card px-3 py-2 min-w-[130px]">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wide">{k.label}</p>
              <p className={`mt-0.5 text-sm font-bold tabular-nums ${k.cls}`}>{k.value}</p>
              {k.sub && <p className="text-[10px] text-muted-foreground">{k.sub} do base</p>}
            </div>
          ))}
          <div className="rounded-xl border bg-card px-3 py-2 min-w-[100px]">
            <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Linhas</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums">{sortedRows.length}</p>
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0 gap-0 overflow-hidden">
        {/* Builder panel */}
        {panelOpen && (
          <div className="flex-none w-64 border-r bg-card overflow-y-auto">
            <BuilderPanel
              config={config}
              onChange={setConfig}
              etapasOptions={etapasOptions}
              fornecedoresOptions={fornecedoresOptions}
            />
          </div>
        )}

        {/* Table area */}
        <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex-none flex items-center gap-2 border-b bg-card px-3 py-1.5">
            <button
              onClick={() => setPanelOpen(v => !v)}
              className="rounded p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground"
              title={panelOpen ? 'Fechar painel' : 'Abrir painel'}
            >
              {panelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            </button>
            <div className="relative flex-1 max-w-64">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar na tabela…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded border bg-background pl-7 pr-2 py-1 text-xs"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>
            <span className="text-xs text-muted-foreground">{sortedRows.length} linhas</span>
            <div className="ml-auto flex gap-1">
              <button onClick={handleExportCSV} className="flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs hover:bg-accent">
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
              <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs hover:bg-accent">
                <Printer className="h-3.5 w-3.5" /> Imprimir
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs border-separate border-spacing-0">
              <thead className="sticky top-0 z-20">
                {/* Row 1: group headers */}
                <tr>
                  {colGroupSpans.map((span, i) => {
                    const gm = GROUP_META[span.group]
                    return (
                      <th
                        key={`${span.group}-${i}`}
                        colSpan={span.count}
                        className={`border-b border-r px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wider ${gm.bg} ${gm.text} ${gm.borderBottom} first:border-l-0`}
                      >
                        {span.count > 1 || !visibleCols.find(c => c.group === span.group)?.fixed
                          ? GROUP_META[span.group].label
                          : ''}
                      </th>
                    )
                  })}
                </tr>
                {/* Row 2: column headers */}
                <tr className="bg-muted/60">
                  {visibleCols.map(col => (
                    <th
                      key={col.id}
                      style={{ minWidth: col.width }}
                      onClick={() => handleSort(col.id)}
                      className={`cursor-pointer select-none border-b border-r px-2 py-1.5 text-${col.align} font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground whitespace-nowrap`}
                    >
                      <span className="flex items-center gap-0.5 justify-start">
                        {col.align === 'right' && sort.col === col.id && (
                          <span className="text-[9px] text-primary">{sort.dir === 'asc' ? '↑' : '↓'}</span>
                        )}
                        <span className={col.align === 'right' ? 'ml-auto' : ''}>{col.label}</span>
                        {col.align !== 'right' && sort.col === col.id && (
                          <span className="text-[9px] text-primary">{sort.dir === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {tableContent()}

                {/* Grand total */}
                {sortedRows.length > 0 && (
                  <tr className="sticky bottom-0 z-10 bg-primary/10 font-bold border-t-2 border-primary/30">
                    {visibleCols.map((col, i) => {
                      if (i === 0) return (
                        <td key={col.id} colSpan={visibleCols.filter(c => c.fixed).length} className="px-2 py-2 text-right text-xs font-bold text-muted-foreground uppercase tracking-wide border-r">
                          {i === 0 && visibleCols.filter(c => c.fixed).length > 1 ? null : 'TOTAL GERAL'}
                        </td>
                      )
                      if (col.fixed) return null
                      return (
                        <td key={col.id} className={`px-2 py-2 text-${col.align} border-r tabular-nums`}>
                          {col.sumable && footerTotals[col.id] != null
                            ? (() => { const v = footerTotals[col.id] ?? 0; return (
                                <span className={col.id.includes('pago') || col.id.includes('recebid') ? 'text-emerald-700' : col.id.includes('a_pagar') || col.id.includes('a_receber') ? 'text-amber-700' : col.id.includes('saldo') && v < 0 ? 'text-red-700' : ''}>
                                  {formatCurrency(v)}
                                </span>
                              )})()
                            : null}
                        </td>
                      )
                    })}
                  </tr>
                )}
              </tbody>
            </table>

            {sortedRows.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <BarChart3 className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm">Nenhum dado para a configuração atual</p>
                <p className="text-xs mt-1">Ajuste os filtros ou mude o tipo de visualização</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUP BLOCK (separated to avoid re-render on expand)
// ─────────────────────────────────────────────────────────────────────────────

interface GroupBlockProps {
  label: string
  rows: any[]
  showGroupHeader: boolean
  visibleCols: ColDef[]
  renderCell: (col: ColDef, row: any) => React.ReactNode
  footerCols: ColDef[]
  subtotals: Record<string, number> | null
}

function GroupBlock({ label, rows, showGroupHeader, visibleCols, renderCell, subtotals }: GroupBlockProps) {
  const [expanded, setExpanded] = useState(true)
  const fixedCount = visibleCols.filter(c => c.fixed).length
  const nonFixed = visibleCols.filter(c => !c.fixed)

  return (
    <>
      {showGroupHeader && (
        <tr
          className="cursor-pointer bg-muted/40 hover:bg-muted/60"
          onClick={() => setExpanded(v => !v)}
        >
          <td colSpan={visibleCols.length} className="px-2 py-1.5 border-b">
            <div className="flex items-center gap-2">
              {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className="font-semibold text-xs">{label}</span>
              <span className="text-muted-foreground text-[10px]">{rows.length} {rows.length === 1 ? 'item' : 'itens'}</span>
              {!expanded && subtotals && nonFixed.filter(c => c.sumable).map(c => (
                <span key={c.id} className="text-[10px] text-muted-foreground">
                  {c.label}: {formatCurrency(subtotals[c.id] ?? 0)}
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}

      {expanded && rows.map((row, idx) => (
        <tr key={row.id ?? idx} className="hover:bg-muted/20 border-b border-muted/30">
          {visibleCols.map(col => (
            <td
              key={col.id}
              className={`px-2 py-1.5 border-r text-${col.align} ${col.fixed ? 'bg-background/80' : ''} whitespace-nowrap`}
            >
              {renderCell(col, row)}
            </td>
          ))}
        </tr>
      ))}

      {/* Subtotal row */}
      {showGroupHeader && expanded && subtotals && (
        <tr className="bg-muted/30 font-semibold border-b">
          <td className={`px-2 py-1 border-r text-right text-[10px] text-muted-foreground uppercase`} colSpan={fixedCount}>
            Subtotal
          </td>
          {nonFixed.map(col => (
            <td key={col.id} className={`px-2 py-1 border-r text-${col.align} tabular-nums text-[11px]`}>
              {col.sumable && subtotals[col.id] != null
                ? (() => { const v = subtotals[col.id] ?? 0; return (
                    <span className={
                      col.id.includes('pago') || col.id.includes('recebid') ? 'text-emerald-700' :
                      col.id.includes('a_pagar') || col.id.includes('a_receber') ? 'text-amber-700' :
                      col.id.includes('saldo') && v < 0 ? 'text-red-600' : ''
                    }>{formatCurrency(v)}</span>
                  )})()
                : null}
            </td>
          ))}
        </tr>
      )}
    </>
  )
}
