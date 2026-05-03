import { useState, useMemo } from 'react'
import { X, AlertTriangle, CheckCircle2, Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  applyComercialImport,
  type ComercialPreview,
  type MissingResolution,
  type RowAction,
} from '@/lib/comercialImport'
import { formatCurrency } from '@/lib/utils'

type Tab = 'pedidos' | 'parcelas' | 'despesas' | 'fornecedores'

const ACTION_LABEL: Record<RowAction, string> = {
  create: 'CRIAR', update: 'ATUALIZAR', unchanged: '—', missing: 'SUMIDA',
}
const ACTION_CLS: Record<RowAction, string> = {
  create: 'bg-emerald-500/10 text-emerald-600',
  update: 'bg-blue-500/10 text-blue-600',
  unchanged: 'bg-muted text-muted-foreground',
  missing: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
}

interface Props {
  preview: ComercialPreview
  companyId: string
  onClose: () => void
  onDone: () => void
}

export default function ComercialImportPreviewModal({ preview: initialPreview, companyId, onClose, onDone }: Props) {
  const [preview, setPreview] = useState<ComercialPreview>(initialPreview)
  const [tab, setTab] = useState<Tab>('pedidos')
  const [applying, setApplying] = useState(false)
  const [filterUnchanged, setFilterUnchanged] = useState(true)

  const setMissingRes = (
    aba: Tab,
    idx: number,
    res: MissingResolution | undefined,
  ) => {
    setPreview(prev => {
      const copy = { ...prev }
      const arr = [...copy[aba]] as any[]
      arr[idx] = { ...arr[idx], resolution: res }
      ;(copy as any)[aba] = arr
      return copy
    })
  }

  const totals = useMemo(() => {
    const r = preview.resumo
    return {
      create: r.pedidos_create + r.parcelas_create + r.despesas_create + r.forn_create,
      update: r.pedidos_update + r.parcelas_update + r.despesas_update + r.forn_update,
      missing: r.pedidos_missing + r.parcelas_missing + r.despesas_missing + r.forn_missing,
      missingResolved: countMissingResolved(preview),
      warnings: r.warnings,
    }
  }, [preview])

  const apply = async () => {
    if (applying) return
    setApplying(true)
    try {
      const result = await applyComercialImport(preview, companyId)
      const ok = result.pedidos.created + result.pedidos.updated
        + result.parcelas.created + result.parcelas.updated
        + result.despesas.created + result.despesas.updated
        + result.fornecedores.created + result.fornecedores.updated
      if (result.errors.length > 0) {
        toast.warning(`${ok} mudança(s) aplicadas, ${result.errors.length} erro(s). Confira logs de importação.`)
      } else {
        toast.success(`${ok} mudança(s) aplicadas com sucesso.`)
      }
      onDone()
    } catch (err) {
      toast.error('Erro ao aplicar: ' + (err as Error).message)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex h-full max-h-[90vh] w-full max-w-7xl flex-col rounded-xl border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-base font-semibold">Pré-visualização — Pacote Comercial</h2>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Plus className="h-3 w-3 text-emerald-600" /> {totals.create} criar</span>
              <span className="flex items-center gap-1"><Pencil className="h-3 w-3 text-blue-600" /> {totals.update} atualizar</span>
              <span className="flex items-center gap-1"><Trash2 className="h-3 w-3 text-amber-600" /> {totals.missing} sumida(s) {totals.missing > 0 && <em className="text-[10px]">({totals.missingResolved} resolvidas)</em>}</span>
              {totals.warnings > 0 && (
                <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3 w-3" /> {totals.warnings} alerta(s)</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b px-4">
          {([
            ['pedidos', `Pedidos (${preview.resumo.pedidos_create + preview.resumo.pedidos_update + preview.resumo.pedidos_missing})`],
            ['parcelas', `Parcelas (${preview.resumo.parcelas_create + preview.resumo.parcelas_update + preview.resumo.parcelas_missing})`],
            ['despesas', `Custos Indiretos (${preview.resumo.despesas_create + preview.resumo.despesas_update + preview.resumo.despesas_missing})`],
            ['fornecedores', `Fornecedores (${preview.resumo.forn_create + preview.resumo.forn_update + preview.resumo.forn_missing})`],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`border-b-2 px-3 py-2 text-xs font-medium ${tab === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 py-1.5">
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={filterUnchanged} onChange={e => setFilterUnchanged(e.target.checked)} className="h-3 w-3" />
              Esconder linhas sem mudança
            </label>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {tab === 'pedidos' && <PedidosTab preview={preview} filterUnchanged={filterUnchanged} setMissingRes={setMissingRes} />}
          {tab === 'parcelas' && <ParcelasTab preview={preview} filterUnchanged={filterUnchanged} setMissingRes={setMissingRes} />}
          {tab === 'despesas' && <DespesasTab preview={preview} filterUnchanged={filterUnchanged} setMissingRes={setMissingRes} />}
          {tab === 'fornecedores' && <FornecedoresTab preview={preview} filterUnchanged={filterUnchanged} setMissingRes={setMissingRes} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t p-4">
          <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            {totals.missing > totals.missingResolved && (
              <div className="text-amber-600">
                ⚠ Há {totals.missing - totals.missingResolved} linha(s) sumida(s) sem decisão. As não resolvidas serão IGNORADAS (mantidas como estão no banco).
              </div>
            )}
            {totals.warnings > 0 && (
              <div className="text-amber-600">⚠ {totals.warnings} alerta(s) de consistência (não bloqueiam a aplicação).</div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={applying}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={apply} disabled={applying || totals.create + totals.update + totals.missingResolved === 0}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {applying ? <>Aplicando...</> : <><CheckCircle2 className="h-4 w-4" /> Aplicar mudanças</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function countMissingResolved(p: ComercialPreview): number {
  let n = 0
  for (const x of p.pedidos) if (x.action === 'missing' && x.resolution) n++
  for (const x of p.parcelas) if (x.action === 'missing' && x.resolution) n++
  for (const x of p.despesas) if (x.action === 'missing' && x.resolution) n++
  for (const x of p.fornecedores) if (x.action === 'missing' && x.resolution) n++
  return n
}

// ─── Sub-components por aba ────────────────────────────────────

interface SubProps {
  preview: ComercialPreview
  filterUnchanged: boolean
  setMissingRes: (aba: Tab, idx: number, res: MissingResolution | undefined) => void
}

function MissingResolver({ value, onChange }: { value: MissingResolution | undefined; onChange: (v: MissingResolution | undefined) => void }) {
  return (
    <div className="flex gap-1">
      <button onClick={() => onChange('ignore')}
        className={`rounded px-2 py-0.5 text-[10px] font-medium ${value === 'ignore' ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
        Ignorar
      </button>
      <button onClick={() => onChange('soft_delete')}
        className={`rounded px-2 py-0.5 text-[10px] font-medium ${value === 'soft_delete' ? 'bg-destructive text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
        Apagar
      </button>
    </div>
  )
}

function ActionBadge({ action }: { action: RowAction }) {
  return <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${ACTION_CLS[action]}`}>{ACTION_LABEL[action]}</span>
}

function FieldChanges({ campos }: { campos: { campo: string; antigo: string; novo: string }[] }) {
  if (campos.length === 0) return null
  return (
    <div className="mt-1 space-y-0.5 text-[10px]">
      {campos.map(c => (
        <div key={c.campo} className="text-muted-foreground">
          <span className="font-medium text-foreground">{c.campo}:</span>{' '}
          <span className="line-through opacity-60">{c.antigo || '∅'}</span> → <span className="text-foreground">{c.novo || '∅'}</span>
        </div>
      ))}
    </div>
  )
}

function PedidosTab({ preview, filterUnchanged, setMissingRes }: SubProps) {
  const rows = preview.pedidos
    .map((p, idx) => ({ ...p, _idx: idx }))
    .filter(p => !filterUnchanged || p.action !== 'unchanged')
  if (rows.length === 0) return <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma linha para mostrar.</div>
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-muted">
        <tr>
          <th className="px-2 py-2 text-left">Ação</th>
          <th className="px-2 py-2 text-left">Pedido</th>
          <th className="px-2 py-2 text-left">Item / Etapa</th>
          <th className="px-2 py-2 text-left">Fornecedor</th>
          <th className="px-2 py-2 text-right">Valor</th>
          <th className="px-2 py-2 text-left">Mudanças / Alertas</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map(p => (
          <tr key={p._idx} className="hover:bg-muted/30 align-top">
            <td className="px-2 py-2">
              <ActionBadge action={p.action} />
              {p.action === 'missing' && (
                <div className="mt-1"><MissingResolver value={p.resolution} onChange={v => setMissingRes('pedidos', p._idx, v)} /></div>
              )}
            </td>
            <td className="px-2 py-2 font-medium">
              {p.numero_pedido ?? '(novo)'}
              <div className="text-[9px] font-mono text-muted-foreground">{p.pedido_id?.slice(0, 8) ?? '—'}</div>
            </td>
            <td className="px-2 py-2 max-w-[200px]">
              <div className="font-medium">{p.item_codigo}</div>
              <div className="text-[9px] text-muted-foreground">{p.etapa_codigo}</div>
            </td>
            <td className="px-2 py-2 max-w-[160px] truncate" title={p.fornecedor_nome}>{p.fornecedor_nome}</td>
            <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(p.valor_total)}</td>
            <td className="px-2 py-2 max-w-[400px]">
              <FieldChanges campos={p.campos} />
              {p.warning_soma && (
                <div className="mt-1 rounded bg-amber-500/10 px-1.5 py-1 text-[10px] text-amber-700 dark:text-amber-400">
                  ⚠ {p.warning_soma}
                </div>
              )}
              {p.cond_changed_but_parcelas_same && (
                <div className="mt-1 rounded bg-blue-500/10 px-1.5 py-1 text-[10px] text-blue-700 dark:text-blue-400">
                  ℹ Cond. pagamento mudou. Edite as parcelas na aba ao lado para refletir, ou as parcelas atuais permanecerão.
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ParcelasTab({ preview, filterUnchanged, setMissingRes }: SubProps) {
  const rows = preview.parcelas
    .map((p, idx) => ({ ...p, _idx: idx }))
    .filter(p => !filterUnchanged || p.action !== 'unchanged')
  if (rows.length === 0) return <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma linha para mostrar.</div>
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-muted">
        <tr>
          <th className="px-2 py-2 text-left">Ação</th>
          <th className="px-2 py-2 text-left">ID</th>
          <th className="px-2 py-2 text-left">Pedido / Despesa</th>
          <th className="px-2 py-2 text-center">Nº</th>
          <th className="px-2 py-2 text-right">Valor</th>
          <th className="px-2 py-2 text-left">Vencimento</th>
          <th className="px-2 py-2 text-left">Mudanças / Alertas</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map(p => (
          <tr key={p._idx} className="hover:bg-muted/30 align-top">
            <td className="px-2 py-2">
              <ActionBadge action={p.action} />
              {p.action === 'missing' && (
                <div className="mt-1"><MissingResolver value={p.resolution} onChange={v => setMissingRes('parcelas', p._idx, v)} /></div>
              )}
            </td>
            <td className="px-2 py-2 font-mono text-[9px] text-muted-foreground">{p.parcela_id?.slice(0, 8) ?? '—'}</td>
            <td className="px-2 py-2 font-mono text-[9px]">
              {p.pedido_id ? `Ped ${p.pedido_id.slice(0, 8)}` : (p.despesa_indireta_id ? `Desp ${p.despesa_indireta_id.slice(0, 8)}` : '—')}
            </td>
            <td className="px-2 py-2 text-center">{p.numero_parcela}</td>
            <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(p.valor)}</td>
            <td className="px-2 py-2">{p.data_vencimento}</td>
            <td className="px-2 py-2 max-w-[400px]">
              <FieldChanges campos={p.campos} />
              {p.warning && (
                <div className="mt-1 rounded bg-amber-500/10 px-1.5 py-1 text-[10px] text-amber-700 dark:text-amber-400">
                  ⚠ {p.warning}
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DespesasTab({ preview, filterUnchanged, setMissingRes }: SubProps) {
  const rows = preview.despesas
    .map((d, idx) => ({ ...d, _idx: idx }))
    .filter(d => !filterUnchanged || d.action !== 'unchanged')
  if (rows.length === 0) return <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma linha para mostrar.</div>
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-muted">
        <tr>
          <th className="px-2 py-2 text-left">Ação</th>
          <th className="px-2 py-2 text-left">ID</th>
          <th className="px-2 py-2 text-left">Descrição</th>
          <th className="px-2 py-2 text-left">Mudanças</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map(d => (
          <tr key={d._idx} className="hover:bg-muted/30 align-top">
            <td className="px-2 py-2">
              <ActionBadge action={d.action} />
              {d.action === 'missing' && (
                <div className="mt-1"><MissingResolver value={d.resolution} onChange={v => setMissingRes('despesas', d._idx, v)} /></div>
              )}
            </td>
            <td className="px-2 py-2 font-mono text-[9px] text-muted-foreground">{d.despesa_id?.slice(0, 8) ?? '—'}</td>
            <td className="px-2 py-2 max-w-[260px] truncate" title={d.descricao}>{d.descricao}</td>
            <td className="px-2 py-2 max-w-[400px]"><FieldChanges campos={d.campos} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function FornecedoresTab({ preview, filterUnchanged, setMissingRes }: SubProps) {
  const rows = preview.fornecedores
    .map((f, idx) => ({ ...f, _idx: idx }))
    .filter(f => !filterUnchanged || f.action !== 'unchanged')
  if (rows.length === 0) return <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma linha para mostrar.</div>
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-muted">
        <tr>
          <th className="px-2 py-2 text-left">Ação</th>
          <th className="px-2 py-2 text-left">ID</th>
          <th className="px-2 py-2 text-left">Nome</th>
          <th className="px-2 py-2 text-left">Mudanças</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map(f => (
          <tr key={f._idx} className="hover:bg-muted/30 align-top">
            <td className="px-2 py-2">
              <ActionBadge action={f.action} />
              {f.action === 'missing' && (
                <div className="mt-1"><MissingResolver value={f.resolution} onChange={v => setMissingRes('fornecedores', f._idx, v)} /></div>
              )}
            </td>
            <td className="px-2 py-2 font-mono text-[9px] text-muted-foreground">{f.fornecedor_id?.slice(0, 8) ?? '—'}</td>
            <td className="px-2 py-2 max-w-[260px] truncate" title={f.nome}>{f.nome}</td>
            <td className="px-2 py-2 max-w-[400px]"><FieldChanges campos={f.campos} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
