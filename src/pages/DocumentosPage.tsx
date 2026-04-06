import { useState, useCallback } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { useProject } from '@/contexts/ProjectContext'
import { supabase } from '@/lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { formatDate } from '@/lib/utils'
import { useDropzone } from 'react-dropzone'
import BulkActionBar from '@/components/BulkActionBar'
import { useSelection } from '@/hooks/useSelection'
import { exportToExcel } from '@/lib/exportExcel'
import {
  FileText, Upload, Download, Trash2, Eye, Search,
  FileSpreadsheet, Image, File, Plus, X, CheckCircle2, RotateCw,
} from 'lucide-react'
import { useTour } from '@/lib/tours/useTour'
import { pageTours } from '@/lib/tours/page-tours'

interface Documento {
  id: string
  company_id: string
  nome_arquivo: string
  tipo_mime: string
  descricao: string | null
  storage_path: string
  enviado_por: string | null
  categoria: string | null
  tamanho_bytes: number | null
  status: string | null
  score_classificacao: number | null
  created_at: string
}

function useDocumentos() {
  const { currentCompany } = useProject()
  const companyId = currentCompany?.id

  return useQuery({
    queryKey: ['documentos', companyId],
    queryFn: async () => {
      if (!companyId) return []
      const { data, error } = await supabase
        .from('documentos')
        .select('*')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Documento[]
    },
    enabled: !!companyId,
  })
}

function useUploadDocumento() {
  const qc = useQueryClient()
  const { currentCompany } = useProject()

  return useMutation({
    mutationFn: async ({ file, categoria, descricao }: { file: File; categoria: string; descricao: string }) => {
      if (!currentCompany) throw new Error('No company')

      const filePath = `${currentCompany.id}/${Date.now()}_${file.name}`

      const { error: storageError } = await supabase.storage
        .from('documentos')
        .upload(filePath, file)

      if (storageError) throw storageError

      const { data, error } = await supabase
        .from('documentos')
        .insert({
          company_id: currentCompany.id,
          nome_arquivo: file.name,
          tipo_mime: file.type,
          descricao: descricao || null,
          storage_path: filePath,
          categoria: categoria || null,
          tamanho_bytes: file.size,
          status: 'uploaded',
        })
        .select()
        .single()

      if (error) throw error
      return data as Documento
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documentos'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

function useDeleteDocumento() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (doc: Documento) => {
      await supabase.storage.from('documentos').remove([doc.storage_path])
      const { error } = await supabase
        .from('documentos')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', doc.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documentos'] })
      toast.success('Documento removido')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

const CATEGORIAS = ['NF', 'Contrato', 'Medição', 'Comprovante', 'Projeto', 'Alvará', 'Outro']

function getFileIcon(tipo_mime: string) {
  if (tipo_mime.includes('spreadsheet') || tipo_mime.includes('excel') || tipo_mime.includes('csv'))
    return FileSpreadsheet
  if (tipo_mime.startsWith('image/'))
    return Image
  return File
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentosPage() {
  const { restartTour } = useTour('documentos', pageTours.documentos)

  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const { data: documentos = [], isLoading } = useDocumentos()
  const uploadDoc = useUploadDocumento()
  const deleteDoc = useDeleteDocumento()
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<string>('')
  const [showUpload, setShowUpload] = useState(false)
  const selection = useSelection()

  // Multi-file upload state
  const [uploadFiles, setUploadFiles] = useState<{ file: File; categoria: string; descricao: string }[]>([])
  const [uploading, setUploading] = useState(false)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map(f => ({ file: f, categoria: '', descricao: '' }))
    setUploadFiles(prev => [...prev, ...newFiles])
    setShowUpload(true)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  })

  const handleUploadAll = async () => {
    if (uploadFiles.length === 0) return
    setUploading(true)
    let success = 0
    for (const uf of uploadFiles) {
      try {
        await uploadDoc.mutateAsync(uf)
        success++
      } catch { /* individual errors handled by mutation */ }
    }
    toast.success(`${success} de ${uploadFiles.length} arquivo(s) enviado(s)`)
    setUploadFiles([])
    setShowUpload(false)
    setUploading(false)
  }

  const handleDownload = async (doc: Documento) => {
    const { data } = await supabase.storage
      .from('documentos')
      .createSignedUrl(doc.storage_path, 300)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  // Bulk actions
  const handleBulkDelete = async () => {
    const docs = documentos.filter(d => selection.selected.has(d.id))
    if (!confirm(`Excluir ${docs.length} documentos?`)) return
    for (const doc of docs) {
      await deleteDoc.mutateAsync(doc)
    }
    await supabase.from('audit_logs').insert({
      company_id: currentCompany?.id, tabela: 'documentos',
      acao: 'DELETE', agente: 'humano',
      dados_antes: { operacao: 'excluir_documentos', docs: docs.length, ids: docs.map(d => d.id) },
      dados_depois: null,
    })
    selection.clear()
  }

  const handleBulkExport = () => {
    const docs = documentos.filter(d => selection.selected.has(d.id))
    exportToExcel(
      docs.map(d => ({
        'Nome': d.nome_arquivo, 'Categoria': d.categoria ?? '', 'Tamanho': formatBytes(d.tamanho_bytes),
        'Status': d.status ?? '', 'Score IA': d.score_classificacao ?? 'N/A',
        'Data Upload': d.created_at,
      })),
      `documentos_${new Date().toISOString().split('T')[0]}`,
      'Documentos',
    )
    toast.success(`${docs.length} documentos exportados`)
  }

  const handleBulkReprocess = async () => {
    const docs = documentos.filter(d => selection.selected.has(d.id))
    // Mark documents for reprocessing (placeholder for IA classifier)
    for (const doc of docs) {
      await supabase.from('documentos').update({ status: 'pendente_classificacao' }).eq('id', doc.id)
    }
    await supabase.from('audit_logs').insert({
      company_id: currentCompany?.id, tabela: 'documentos',
      acao: 'UPDATE', agente: 'humano',
      dados_antes: { operacao: 'reprocessar_classificacao', docs: docs.length, ids: docs.map(d => d.id) },
      dados_depois: { novo_status: 'pendente_classificacao' },
    })
    qc.invalidateQueries({ queryKey: ['documentos'] })
    toast.success(`${docs.length} documentos enviados para reclassificação`)
    selection.clear()
  }

  const handleBulkApprove = async () => {
    const docs = documentos.filter(d => selection.selected.has(d.id))
    for (const doc of docs) {
      await supabase.from('documentos').update({ status: 'classificado_aprovado' }).eq('id', doc.id)
    }
    qc.invalidateQueries({ queryKey: ['documentos'] })
    toast.success(`${docs.length} classificações aprovadas`)
    selection.clear()
  }

  const filtered = documentos.filter((d) => {
    const matchSearch = d.nome_arquivo.toLowerCase().includes(search.toLowerCase()) ||
      (d.descricao ?? '').toLowerCase().includes(search.toLowerCase())
    const matchCat = !filterCat || d.categoria === filterCat
    return matchSearch && matchCat
  })

  return (
    <div {...getRootProps()}>
      <PageHeader title="Documentos" description="Gestão de documentos do projeto" icon={FileText} onHelp={restartTour} />

      {/* Search & Filters */}
      <div id="tour-docs-upload" className="mb-4 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar documentos..." className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
          <option value="">Todas categorias</option>
          {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={() => setShowUpload(!showUpload)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Upload
        </button>
      </div>

      {/* Drag Active Overlay */}
      {isDragActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-primary bg-card/90 p-12 text-center">
            <Upload className="mx-auto mb-3 h-12 w-12 text-primary" />
            <p className="text-lg font-semibold">Solte os arquivos aqui</p>
          </div>
        </div>
      )}

      {/* Multi-Upload Form */}
      {showUpload && (
        <div className="mb-4 rounded-xl border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Upload de Documentos ({uploadFiles.length})</h3>
            <button onClick={() => { setShowUpload(false); setUploadFiles([]) }} className="rounded-md p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
          </div>

          {/* Drop zone */}
          <div className="mb-4 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-6 text-center">
            <Upload className="mx-auto mb-2 h-8 w-8 text-primary/50" />
            <p className="text-sm">Arraste arquivos ou</p>
            <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              Selecionar arquivos
              <input {...getInputProps()} className="hidden" multiple />
            </label>
          </div>

          {/* File list */}
          {uploadFiles.length > 0 && (
            <div className="mb-4 max-h-48 space-y-2 overflow-y-auto">
              {uploadFiles.map((uf, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border p-2">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{uf.file.name}</p>
                    <p className="text-[10px] text-muted-foreground">{formatBytes(uf.file.size)}</p>
                  </div>
                  <select value={uf.categoria} onChange={e => {
                    const next = [...uploadFiles]; next[i]!.categoria = e.target.value; setUploadFiles(next)
                  }} className="rounded border bg-background px-2 py-1 text-[10px]">
                    <option value="">Categoria</option>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button onClick={() => setUploadFiles(prev => prev.filter((_, j) => j !== i))}
                    className="rounded p-1 text-red-500 hover:bg-red-500/10"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setShowUpload(false); setUploadFiles([]) }}
              className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
            <button onClick={handleUploadAll} disabled={uploadFiles.length === 0 || uploading}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {uploading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" /> : <Upload className="h-4 w-4" />}
              Enviar {uploadFiles.length} arquivo(s)
            </button>
          </div>
        </div>
      )}

      {/* Documents Grid with selection */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[250px] flex-col items-center justify-center rounded-xl border-2 border-dashed">
          <FileText className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Nenhum documento encontrado</p>
          <p className="mt-1 text-xs text-muted-foreground">Arraste arquivos aqui ou use o botão Upload</p>
        </div>
      ) : (
        <>
          {/* Select all */}
          <div className="mb-3 flex items-center gap-2">
            <input type="checkbox"
              checked={selection.count === filtered.length && filtered.length > 0}
              onChange={() => selection.toggleAll(filtered.map(d => d.id))}
              className="h-3.5 w-3.5 rounded accent-primary" />
            <span className="text-[10px] text-muted-foreground">
              {selection.count > 0 ? `${selection.count} selecionado(s)` : 'Selecionar todos'}
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((doc) => {
              const Icon = getFileIcon(doc.tipo_mime)
              return (
                <div key={doc.id} className={`group rounded-xl border bg-card p-4 transition-shadow hover:shadow-md ${selection.isSelected(doc.id) ? 'ring-2 ring-primary/50' : ''}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox"
                      checked={selection.isSelected(doc.id)}
                      onChange={() => selection.toggle(doc.id)}
                      className="mt-1 h-3.5 w-3.5 shrink-0 rounded accent-primary" />
                    <div className="rounded-lg bg-primary/10 p-2.5">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-medium">{doc.nome_arquivo}</h4>
                      {doc.descricao && <p className="mt-0.5 truncate text-xs text-muted-foreground">{doc.descricao}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                        {doc.categoria && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{doc.categoria}</span>}
                        <span>{formatBytes(doc.tamanho_bytes)}</span>
                        <span>•</span>
                        <span>{formatDate(doc.created_at)}</span>
                        {doc.score_classificacao != null && (
                          <span className={`rounded-full px-2 py-0.5 font-medium ${doc.score_classificacao >= 0.8 ? 'bg-emerald-500/10 text-emerald-600' : doc.score_classificacao >= 0.5 ? 'bg-amber-500/10 text-amber-600' : 'bg-red-500/10 text-red-500'}`}>
                            IA: {(doc.score_classificacao * 100).toFixed(0)}%
                          </span>
                        )}
                        {doc.status === 'classificado_aprovado' && (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1 border-t pt-3 opacity-0 transition-opacity group-hover:opacity-100">
                    <button onClick={() => handleDownload(doc)} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                      <Eye className="h-3 w-3" /> Ver
                    </button>
                    <button onClick={() => handleDownload(doc)} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                      <Download className="h-3 w-3" /> Baixar
                    </button>
                    <button onClick={() => deleteDoc.mutate(doc)} className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-500/10">
                      <Trash2 className="h-3 w-3" /> Excluir
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar count={selection.count} onClear={selection.clear}>
        <BulkBtn icon={CheckCircle2} label="Aprovar classificação" onClick={handleBulkApprove} />
        <BulkBtn icon={RotateCw} label="Reclassificar" onClick={handleBulkReprocess} />
        <BulkBtn icon={Download} label="Exportar" onClick={handleBulkExport} />
        <BulkBtn icon={Trash2} label="Excluir" onClick={handleBulkDelete} variant="danger" />
      </BulkActionBar>
    </div>
  )
}

function BulkBtn({ icon: Icon, label, onClick, variant }: {
  icon: React.ElementType; label: string; onClick: () => void; variant?: 'danger'
}) {
  const cls = variant === 'danger'
    ? 'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10'
    : 'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-accent'
  return <button onClick={onClick} className={cls}><Icon className="h-3.5 w-3.5" />{label}</button>
}
