import { useState } from 'react'
import { Upload, X, Check, AlertTriangle, FileSpreadsheet, ArrowRight, Calendar, Package, ChevronDown, Download, Filter, AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { type ImportPreview, type ImportResult, type ImportLogEntry, applyImport } from '@/lib/wbsImport'
import { toast } from 'sonner'

interface ImportPreviewModalProps {
  preview: ImportPreview
  companyId: string
  onClose: () => void
  onDone: () => void
}

type PreviewTab = 'etapas' | 'itens' | 'dist'
type LogFilterLevel = 'all' | 'error' | 'warn' | 'success'

export default function ImportPreviewModal({ preview, companyId, onClose, onDone }: ImportPreviewModalProps) {
  const [applying, setApplying] = useState(false)
  const [tab, setTab] = useState<PreviewTab>('etapas')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [logFilter, setLogFilter] = useState<LogFilterLevel>('all')
  const [logFaseFilter, setLogFaseFilter] = useState<string>('all')

  const handleApply = async () => {
    try {
      setApplying(true)
      const r = await applyImport(preview, companyId)
      setResult(r)

      if (r.erros > 0) {
        toast.error(`Importação concluída com ${r.erros} erro(s). Confira os logs abaixo.`)
      } else {
        toast.success(`Importação concluída! Etapas: ${r.etapasAtualizadas + r.etapasCriadas}, Itens: ${r.itensAtualizados + r.itensCriados}, Dist: ${r.distsAtualizadas + r.distsCriadas}`)
      }
    } catch (err: any) {
      toast.error('Erro crítico: ' + err.message)
    } finally {
      setApplying(false)
    }
  }

  const handleDoneWithLogs = () => {
    onDone()
  }

  // If we have results, show the result screen
  if (result) {
    return <ResultScreen result={result} logFilter={logFilter} setLogFilter={setLogFilter} logFaseFilter={logFaseFilter} setLogFaseFilter={setLogFaseFilter} onClose={handleDoneWithLogs} />
  }

  const etapasToShow = preview.etapas.filter(c => c.tipo !== 'ignorar')
  const itensToShow = preview.itens.filter(c => c.tipo !== 'ignorar')
  const distsToShow = preview.distribuicoes.filter(c => c.tipo !== 'ignorar')
  const nothingToDo = etapasToShow.length === 0 && itensToShow.length === 0 && distsToShow.length === 0

  const tabCounts = {
    etapas: etapasToShow.length,
    itens: itensToShow.length,
    dist: distsToShow.length,
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border bg-card shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2"><FileSpreadsheet className="h-5 w-5 text-primary" /></div>
            <div>
              <h2 className="text-base font-bold">Preview da Importação</h2>
              <p className="text-xs text-muted-foreground">
                {preview.totalAlteracoes} alteração(ões) · {preview.totalNovos} novo(s) · {preview.totalIgnorados} sem mudanças
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b px-6 bg-muted/20">
          <TabBtn active={tab === 'etapas'} onClick={() => setTab('etapas')} icon={<FileSpreadsheet className="h-3.5 w-3.5" />} label="Etapas" count={tabCounts.etapas} />
          <TabBtn active={tab === 'itens'} onClick={() => setTab('itens')} icon={<Package className="h-3.5 w-3.5" />} label="Itens de Compra" count={tabCounts.itens} />
          <TabBtn active={tab === 'dist'} onClick={() => setTab('dist')} icon={<Calendar className="h-3.5 w-3.5" />} label="Distribuição" count={tabCounts.dist} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {nothingToDo ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Check className="h-10 w-10 text-emerald-500 mb-2" />
              <p className="text-sm font-semibold">Nenhuma alteração detectada</p>
              <p className="text-xs text-muted-foreground mt-1">O arquivo é idêntico aos dados atuais.</p>
            </div>
          ) : (
            <>
              {tab === 'etapas' && (
                etapasToShow.length > 0 ? (
                  <ChangeTable
                    items={etapasToShow.map(c => ({ tipo: c.tipo, col1: c.codigo, col2: c.nome, campos: c.campos }))}
                    col1Label="Código" col2Label="Nome"
                  />
                ) : <EmptyTab label="etapas" />
              )}

              {tab === 'itens' && (
                itensToShow.length > 0 ? (
                  <ChangeTable
                    items={itensToShow.map(c => ({ tipo: c.tipo, col1: c.etapaCod, col2: c.descricao, campos: c.campos }))}
                    col1Label="Etapa" col2Label="Item"
                  />
                ) : <EmptyTab label="itens de compra" />
              )}

              {tab === 'dist' && (
                distsToShow.length > 0 ? (
                  <ChangeTable
                    items={distsToShow.map(c => ({ tipo: c.tipo, col1: c.etapaCod, col2: `Medição ${c.medicao}`, campos: c.campos }))}
                    col1Label="Etapa" col2Label="Medição"
                  />
                ) : <EmptyTab label="distribuições" />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-3">
          <div className="flex items-center gap-2 text-xs text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Revise as alterações antes de aplicar. A ação é irreversível.</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg border px-4 py-2 text-xs font-medium hover:bg-muted">Cancelar</button>
            {!nothingToDo && (
              <button onClick={handleApply} disabled={applying} className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
                {applying ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Upload className="h-3.5 w-3.5" />}
                {applying ? 'Aplicando...' : `Aplicar ${preview.totalAlteracoes + preview.totalNovos} Alterações`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// Result Screen (with structured logs)
// ═══════════════════════════════════════════════════════════
function ResultScreen({ result, logFilter, setLogFilter, logFaseFilter, setLogFaseFilter, onClose }: {
  result: ImportResult
  logFilter: LogFilterLevel
  setLogFilter: (v: LogFilterLevel) => void
  logFaseFilter: string
  setLogFaseFilter: (v: string) => void
  onClose: () => void
}) {
  const hasErrors = result.erros > 0

  const filteredLogs = result.logs.filter(l => {
    if (logFilter !== 'all' && l.nivel !== logFilter) return false
    if (logFaseFilter !== 'all' && l.fase !== logFaseFilter) return false
    return true
  })

  const downloadLogs = () => {
    const lines = result.logs.map(l =>
      `[${l.nivel.toUpperCase()}] [${l.fase}/${l.acao}] ${l.referencia} — ${l.mensagem}${l.detalhes ? ` | Detalhes: ${JSON.stringify(l.detalhes)}` : ''}`
    )
    const content = `RELATÓRIO DE IMPORTAÇÃO WBS - ${new Date().toLocaleString('pt-BR')}\n` +
      `═══════════════════════════════════════════\n` +
      `Etapas: ${result.etapasAtualizadas} atualizadas, ${result.etapasCriadas} criadas\n` +
      `Itens: ${result.itensAtualizados} atualizados, ${result.itensCriados} criados\n` +
      `Distribuições: ${result.distsAtualizadas} atualizadas, ${result.distsCriadas} criadas\n` +
      `Erros: ${result.erros} | Avisos: ${result.avisos}\n` +
      `═══════════════════════════════════════════\n\n` +
      lines.join('\n')

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), content], { type: 'text/plain;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `import_wbs_log_${new Date().toISOString().slice(0, 10)}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const errorCount = result.logs.filter(l => l.nivel === 'error').length
  const warnCount = result.logs.filter(l => l.nivel === 'warn').length
  const successCount = result.logs.filter(l => l.nivel === 'success').length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border bg-card shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${hasErrors ? 'bg-destructive/10' : 'bg-emerald-500/10'}`}>
              {hasErrors ? <AlertCircle className="h-5 w-5 text-destructive" /> : <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
            </div>
            <div>
              <h2 className="text-base font-bold">{hasErrors ? 'Importação com Erros' : 'Importação Concluída'}</h2>
              <p className="text-xs text-muted-foreground">
                {result.logs.length} operações registradas · {result.erros} erro(s) · {result.avisos} aviso(s)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 border-b px-6 py-4 bg-muted/10">
          <SummaryCard label="Etapas" updated={result.etapasAtualizadas} created={result.etapasCriadas} />
          <SummaryCard label="Itens de Compra" updated={result.itensAtualizados} created={result.itensCriados} />
          <SummaryCard label="Distribuição" updated={result.distsAtualizadas} created={result.distsCriadas} />
        </div>

        {/* Log filter toolbar */}
        <div className="flex items-center justify-between border-b px-6 py-2 bg-muted/20">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground mr-1">Filtrar:</span>
            <FilterPill active={logFilter === 'all'} onClick={() => setLogFilter('all')} label="Todos" count={result.logs.length} />
            <FilterPill active={logFilter === 'error'} onClick={() => setLogFilter('error')} label="Erros" count={errorCount} color="text-destructive" />
            <FilterPill active={logFilter === 'warn'} onClick={() => setLogFilter('warn')} label="Avisos" count={warnCount} color="text-amber-600" />
            <FilterPill active={logFilter === 'success'} onClick={() => setLogFilter('success')} label="Sucesso" count={successCount} color="text-emerald-600" />
            <span className="mx-2 text-muted-foreground/30">|</span>
            <FilterPill active={logFaseFilter === 'all'} onClick={() => setLogFaseFilter('all')} label="Todas Fases" />
            <FilterPill active={logFaseFilter === 'etapa'} onClick={() => setLogFaseFilter('etapa')} label="Etapas" />
            <FilterPill active={logFaseFilter === 'item'} onClick={() => setLogFaseFilter('item')} label="Itens" />
            <FilterPill active={logFaseFilter === 'distribuicao'} onClick={() => setLogFaseFilter('distribuicao')} label="Dist" />
          </div>
          <button onClick={downloadLogs} className="flex items-center gap-1.5 rounded-md bg-muted-foreground/10 px-2.5 py-1 text-[10px] font-medium hover:bg-muted-foreground/20 transition-colors">
            <Download className="h-3 w-3" /> Exportar Logs
          </button>
        </div>

        {/* Logs list */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Info className="h-6 w-6 mb-1" />
              <p className="text-xs">Nenhum log para este filtro</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredLogs.map((log, i) => (
                <LogRow key={i} log={log} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t px-6 py-3">
          <button onClick={onClose} className="rounded-lg bg-primary px-5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5" /> Fechar e Atualizar
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════
function SummaryCard({ label, updated, created }: { label: string; updated: number; created: number }) {
  const total = updated + created
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-lg font-bold">{total}</p>
      <div className="flex gap-3 mt-0.5">
        {updated > 0 && <span className="text-[10px] text-blue-600">{updated} atualizado(s)</span>}
        {created > 0 && <span className="text-[10px] text-emerald-600">{created} criado(s)</span>}
        {total === 0 && <span className="text-[10px] text-muted-foreground">nenhuma alteração</span>}
      </div>
    </div>
  )
}

function FilterPill({ active, onClick, label, count, color }: { active: boolean; onClick: () => void; label: string; count?: number; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
        active ? 'bg-primary/10 text-primary ring-1 ring-primary/20' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
      }`}
    >
      {label}{count !== undefined && <span className={`ml-1 ${color || ''}`}>{count}</span>}
    </button>
  )
}

const levelConfig: Record<ImportLogEntry['nivel'], { icon: typeof CheckCircle2; bgClass: string; textClass: string; label: string }> = {
  success: { icon: CheckCircle2, bgClass: 'bg-emerald-500/10', textClass: 'text-emerald-600', label: 'OK' },
  error: { icon: AlertCircle, bgClass: 'bg-destructive/10', textClass: 'text-destructive', label: 'ERRO' },
  warn: { icon: AlertTriangle, bgClass: 'bg-amber-500/10', textClass: 'text-amber-600', label: 'AVISO' },
  info: { icon: Info, bgClass: 'bg-blue-500/10', textClass: 'text-blue-600', label: 'INFO' },
}

const faseLabels: Record<string, string> = {
  etapa: 'Etapa',
  item: 'Item',
  distribuicao: 'Dist',
}

function LogRow({ log }: { log: ImportLogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = levelConfig[log.nivel]
  const Icon = cfg.icon

  return (
    <div className={`rounded-md border ${log.nivel === 'error' ? 'border-destructive/20 bg-destructive/5' : log.nivel === 'warn' ? 'border-amber-500/20 bg-amber-500/5' : 'border-border/50'}`}>
      <button
        onClick={() => log.detalhes && setExpanded(!expanded)}
        className="flex w-full items-start gap-2.5 px-3 py-2 text-left"
      >
        <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${cfg.bgClass}`}>
          <Icon className={`h-3 w-3 ${cfg.textClass}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${cfg.bgClass} ${cfg.textClass}`}>{cfg.label}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">{faseLabels[log.fase] || log.fase} / {log.acao}</span>
            <span className="text-[10px] font-mono text-muted-foreground truncate">{log.referencia}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-foreground/90">{log.mensagem}</p>
        </div>
        {log.detalhes && (
          <ChevronDown className={`mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
        )}
      </button>

      {expanded && log.detalhes && (
        <div className="border-t bg-muted/20 px-3 py-2">
          <pre className="text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(log.detalhes, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

function TabBtn({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold border-b-2 transition-colors ${active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
    >
      {icon} {label}
      {count > 0 && <span className={`rounded-full px-1.5 text-[9px] ${active ? 'bg-primary/10' : 'bg-muted'}`}>{count}</span>}
    </button>
  )
}

function EmptyTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <Check className="h-6 w-6 text-emerald-500 mb-1" />
      <p className="text-xs text-muted-foreground">Nenhuma alteração de {label} detectada</p>
    </div>
  )
}

function ChangeTable({ items, col1Label, col2Label }: { items: { tipo: string; col1: string; col2: string; campos: { campo: string; antigo: string; novo: string }[] }[]; col1Label: string; col2Label: string }) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-[11px]">
        <thead className="bg-muted/30">
          <tr>
            <th className="px-3 py-1.5 text-left font-medium w-20">Ação</th>
            <th className="px-3 py-1.5 text-left font-medium">{col1Label}</th>
            <th className="px-3 py-1.5 text-left font-medium">{col2Label}</th>
            <th className="px-3 py-1.5 text-left font-medium">Alterações</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c, i) => (
            <tr key={i} className="border-t hover:bg-muted/10">
              <td className="px-3 py-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${c.tipo === 'criar' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                  {c.tipo === 'criar' ? 'Novo' : 'Atualizar'}
                </span>
              </td>
              <td className="px-3 py-1.5 font-mono text-muted-foreground">{c.col1}</td>
              <td className="px-3 py-1.5 font-medium">{c.col2}</td>
              <td className="px-3 py-1.5">
                {c.campos.length > 0 ? (
                  <div className="space-y-0.5">
                    {c.campos.slice(0, 4).map((f, j) => (
                      <div key={j} className="flex items-center gap-1 text-[10px]">
                        <span className="font-semibold text-muted-foreground">{f.campo}:</span>
                        <span className="text-red-400 line-through">{f.antigo || '—'}</span>
                        <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                        <span className="text-emerald-600 font-medium">{f.novo}</span>
                      </div>
                    ))}
                    {c.campos.length > 4 && <span className="text-[9px] text-muted-foreground">+{c.campos.length - 4} mais</span>}
                  </div>
                ) : <span className="text-muted-foreground/50">Todos os campos</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
