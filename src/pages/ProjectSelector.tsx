import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProject, type Company, type UpdateProjectData } from '@/contexts/ProjectContext'
import { useUserRole } from '@/hooks/useUserRole'
import {
  Building2, Plus, ChevronRight, MapPin, Home, CheckCircle2,
  MoreVertical, Pencil, Copy, Archive, ArchiveRestore, AlertTriangle, X, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'

type ActionMode = null | { type: 'edit' | 'duplicate' | 'delete'; company: Company }

export default function ProjectSelector() {
  const {
    companies, archivedCompanies, selectCompany, loading,
    updateProject, softDeleteProject, restoreProject, duplicateProject,
  } = useProject()
  const { getRoleForCompany } = useUserRole()
  const navigate = useNavigate()

  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [action, setAction] = useState<ActionMode>(null)
  const [showArchived, setShowArchived] = useState(false)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  const handleSelect = (id: string) => {
    selectCompany(id)
    navigate('/dashboard')
  }

  const canManage = (companyId: string) => {
    const role = getRoleForCompany(companyId)
    return role === 'super_admin' || role === 'supervisor'
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Seus Projetos</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Selecione um projeto para acessar ou crie um novo
          </p>
        </div>

        <div className="space-y-3">
          {companies.map((company) => (
            <ProjectCard
              key={company.id}
              company={company}
              canManage={canManage(company.id)}
              menuOpen={openMenu === company.id}
              onToggleMenu={() => setOpenMenu(openMenu === company.id ? null : company.id)}
              onCloseMenu={() => setOpenMenu(null)}
              onSelect={() => handleSelect(company.id)}
              onEdit={() => { setAction({ type: 'edit', company }); setOpenMenu(null) }}
              onDuplicate={() => { setAction({ type: 'duplicate', company }); setOpenMenu(null) }}
              onDelete={() => { setAction({ type: 'delete', company }); setOpenMenu(null) }}
            />
          ))}

          <button
            onClick={() => navigate('/onboarding')}
            className="flex w-full items-center gap-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 text-left transition-all hover:border-primary hover:bg-primary/10"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Plus className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-primary">Criar Novo Projeto</h3>
              <p className="text-xs text-muted-foreground">Registrar uma nova obra</p>
            </div>
          </button>
        </div>

        {archivedCompanies.length > 0 && (
          <div className="mt-10">
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <Archive className="h-4 w-4" />
              {showArchived ? 'Ocultar' : 'Mostrar'} arquivados ({archivedCompanies.length})
            </button>
            {showArchived && (
              <div className="mt-3 space-y-2">
                {archivedCompanies.map((c) => (
                  <ArchivedCard
                    key={c.id}
                    company={c}
                    canManage={canManage(c.id)}
                    onRestore={async () => {
                      const ok = await restoreProject(c.id)
                      if (ok) toast.success('Projeto restaurado')
                      else toast.error('Falha ao restaurar')
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {action?.type === 'edit' && (
        <EditProjectModal
          company={action.company}
          onClose={() => setAction(null)}
          onSave={async (data) => {
            const ok = await updateProject(action.company.id, data)
            if (ok) {
              toast.success('Projeto atualizado')
              setAction(null)
            } else {
              toast.error('Falha ao atualizar')
            }
          }}
        />
      )}

      {action?.type === 'duplicate' && (
        <DuplicateProjectModal
          company={action.company}
          onClose={() => setAction(null)}
          onConfirm={async (newRazaoSocial, newNomeFantasia) => {
            const newId = await duplicateProject(action.company.id, newRazaoSocial, newNomeFantasia)
            if (newId) {
              toast.success('Projeto duplicado com sucesso')
              setAction(null)
            } else {
              toast.error('Falha ao duplicar projeto')
            }
            return !!newId
          }}
        />
      )}

      {action?.type === 'delete' && (
        <DeleteProjectModal
          company={action.company}
          onClose={() => setAction(null)}
          onConfirm={async () => {
            const ok = await softDeleteProject(action.company.id)
            if (ok) {
              toast.success('Projeto arquivado')
              setAction(null)
            } else {
              toast.error('Falha ao arquivar')
            }
          }}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// ProjectCard

interface ProjectCardProps {
  company: Company
  canManage: boolean
  menuOpen: boolean
  onToggleMenu: () => void
  onCloseMenu: () => void
  onSelect: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}

function ProjectCard({
  company, canManage, menuOpen, onToggleMenu, onCloseMenu,
  onSelect, onEdit, onDuplicate, onDelete,
}: ProjectCardProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onCloseMenu()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen, onCloseMenu])

  return (
    <div className="group relative flex w-full items-center gap-4 rounded-xl border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md">
      <button
        onClick={onSelect}
        className="flex flex-1 items-center gap-4 text-left"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Building2 className="h-5 w-5 text-primary" />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">
            {company.nome_fantasia ?? company.razao_social}
          </h3>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            {company.municipio && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {company.municipio}/{company.estado}
              </span>
            )}
            {company.qtd_casas > 0 && (
              <span className="flex items-center gap-1">
                <Home className="h-3 w-3" />
                {company.qtd_casas} casas
              </span>
            )}
            {company.faturamento_contrato > 0 && (
              <span>{formatCurrency(company.faturamento_contrato)}</span>
            )}
          </div>
        </div>
      </button>

      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
          company.status === 'ativo'
            ? 'bg-emerald-500/10 text-emerald-600'
            : company.status === 'concluido'
            ? 'bg-blue-500/10 text-blue-600'
            : 'bg-amber-500/10 text-amber-600'
        }`}>
          <CheckCircle2 className="h-3 w-3" />
          {company.status === 'ativo' ? 'Ativo' : company.status === 'concluido' ? 'Concluído' : 'Suspenso'}
        </span>

        {canManage && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={onToggleMenu}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Ações do projeto"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-md border bg-popover shadow-lg">
                <button
                  onClick={onEdit}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                <button
                  onClick={onDuplicate}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                >
                  <Copy className="h-3.5 w-3.5" /> Duplicar
                </button>
                <button
                  onClick={onDelete}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <Archive className="h-3.5 w-3.5" /> Arquivar
                </button>
              </div>
            )}
          </div>
        )}

        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// ArchivedCard

function ArchivedCard({
  company, canManage, onRestore,
}: { company: Company; canManage: boolean; onRestore: () => Promise<void> }) {
  const [restoring, setRestoring] = useState(false)
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/30 p-3 opacity-75">
      <Archive className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{company.nome_fantasia ?? company.razao_social}</p>
        {company.deleted_at && (
          <p className="text-xs text-muted-foreground">
            Arquivado em {new Date(company.deleted_at).toLocaleDateString('pt-BR')}
          </p>
        )}
      </div>
      {canManage && (
        <button
          onClick={async () => {
            setRestoring(true)
            try { await onRestore() } finally { setRestoring(false) }
          }}
          disabled={restoring}
          className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-background disabled:opacity-50"
        >
          {restoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArchiveRestore className="h-3 w-3" />}
          Restaurar
        </button>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Modal shell

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// EditProjectModal

function EditProjectModal({
  company, onClose, onSave,
}: { company: Company; onClose: () => void; onSave: (data: UpdateProjectData) => Promise<void> }) {
  const [form, setForm] = useState({
    razao_social: company.razao_social,
    nome_fantasia: company.nome_fantasia ?? '',
    cnpj: company.cnpj ?? '',
    municipio: company.municipio ?? '',
    estado: company.estado ?? '',
    qtd_casas: company.qtd_casas,
    area_casa_m2: company.area_casa_m2 ?? 0,
    data_inicio_obras: company.data_inicio_obras ?? '',
    saldo_inicial_caixa: company.saldo_inicial_caixa,
    faturamento_contrato: company.faturamento_contrato,
    custo_total_contrato: company.custo_total_contrato,
    status: company.status,
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.razao_social.trim()) {
      toast.error('Razão social é obrigatória')
      return
    }
    setSaving(true)
    try {
      await onSave({
        razao_social: form.razao_social.trim(),
        nome_fantasia: form.nome_fantasia.trim() || null,
        cnpj: form.cnpj.trim() || null,
        municipio: form.municipio.trim() || null,
        estado: form.estado.trim() || null,
        qtd_casas: Number(form.qtd_casas) || 0,
        area_casa_m2: Number(form.area_casa_m2) || null,
        data_inicio_obras: form.data_inicio_obras || null,
        saldo_inicial_caixa: Number(form.saldo_inicial_caixa) || 0,
        faturamento_contrato: Number(form.faturamento_contrato) || 0,
        custo_total_contrato: Number(form.custo_total_contrato) || 0,
        status: form.status,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Editar projeto" onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2">
        <Field label="Razão social *" full>
          <input className={inputCls} value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} />
        </Field>
        <Field label="Nome fantasia" full>
          <input className={inputCls} value={form.nome_fantasia} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} />
        </Field>
        <Field label="CNPJ">
          <input className={inputCls} value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
        </Field>
        <Field label="Status">
          <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="ativo">Ativo</option>
            <option value="suspenso">Suspenso</option>
            <option value="concluido">Concluído</option>
          </select>
        </Field>
        <Field label="Município">
          <input className={inputCls} value={form.municipio} onChange={(e) => setForm({ ...form, municipio: e.target.value })} />
        </Field>
        <Field label="Estado">
          <input className={inputCls} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} />
        </Field>
        <Field label="Qtd. casas">
          <input type="number" className={inputCls} value={form.qtd_casas} onChange={(e) => setForm({ ...form, qtd_casas: Number(e.target.value) })} />
        </Field>
        <Field label="Área/casa (m²)">
          <input type="number" step="0.01" className={inputCls} value={form.area_casa_m2} onChange={(e) => setForm({ ...form, area_casa_m2: Number(e.target.value) })} />
        </Field>
        <Field label="Início das obras">
          <input type="date" className={inputCls} value={form.data_inicio_obras} onChange={(e) => setForm({ ...form, data_inicio_obras: e.target.value })} />
        </Field>
        <Field label="Saldo inicial (R$)">
          <input type="number" step="0.01" className={inputCls} value={form.saldo_inicial_caixa} onChange={(e) => setForm({ ...form, saldo_inicial_caixa: Number(e.target.value) })} />
        </Field>
        <Field label="Faturamento contrato (R$)">
          <input type="number" step="0.01" className={inputCls} value={form.faturamento_contrato} onChange={(e) => setForm({ ...form, faturamento_contrato: Number(e.target.value) })} />
        </Field>
        <Field label="Custo total contrato (R$)">
          <input type="number" step="0.01" className={inputCls} value={form.custo_total_contrato} onChange={(e) => setForm({ ...form, custo_total_contrato: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t px-5 py-3">
        <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Cancelar</button>
        <button
          onClick={submit}
          disabled={saving}
          className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Salvar
        </button>
      </div>
    </ModalShell>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// DuplicateProjectModal

function DuplicateProjectModal({
  company, onClose, onConfirm,
}: { company: Company; onClose: () => void; onConfirm: (razaoSocial: string, nomeFantasia?: string) => Promise<boolean> }) {
  const [razao, setRazao] = useState(`${company.razao_social} (Cópia)`)
  const [fantasia, setFantasia] = useState(company.nome_fantasia ? `${company.nome_fantasia} (Cópia)` : '')
  const [running, setRunning] = useState(false)

  const submit = async () => {
    if (!razao.trim()) {
      toast.error('Razão social é obrigatória')
      return
    }
    setRunning(true)
    try {
      await onConfirm(razao.trim(), fantasia.trim() || undefined)
    } finally {
      setRunning(false)
    }
  }

  return (
    <ModalShell title="Duplicar projeto" onClose={onClose}>
      <div className="space-y-4 px-5 py-4">
        <p className="text-sm text-muted-foreground">
          Será criada uma cópia completa de <span className="font-medium text-foreground">{company.nome_fantasia ?? company.razao_social}</span>,
          incluindo etapas, itens, fornecedores, pedidos, parcelas, contas, movimentações, conciliações,
          mútuos, despesas indiretas, medições, avanços, cenários, documentos e regras.
        </p>
        <div className="rounded-md bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          A operação pode levar alguns segundos em projetos grandes. Não feche esta janela enquanto roda.
        </div>
        <Field label="Nova razão social *" full>
          <input className={inputCls} value={razao} onChange={(e) => setRazao(e.target.value)} autoFocus />
        </Field>
        <Field label="Novo nome fantasia (opcional)" full>
          <input className={inputCls} value={fantasia} onChange={(e) => setFantasia(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t px-5 py-3">
        <button onClick={onClose} disabled={running} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
          Cancelar
        </button>
        <button
          onClick={submit}
          disabled={running}
          className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {running ? 'Duplicando…' : 'Duplicar'}
        </button>
      </div>
    </ModalShell>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// DeleteProjectModal

function DeleteProjectModal({
  company, onClose, onConfirm,
}: { company: Company; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [confirmText, setConfirmText] = useState('')
  const [running, setRunning] = useState(false)
  const expected = company.nome_fantasia ?? company.razao_social
  const matches = confirmText.trim() === expected

  return (
    <ModalShell title="Arquivar projeto" onClose={onClose}>
      <div className="space-y-4 px-5 py-4">
        <div className="flex items-start gap-3 rounded-md bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Arquivamento (soft delete)</p>
            <p className="mt-1 text-xs">
              O projeto será ocultado da lista mas pode ser restaurado depois pela seção "Arquivados".
              Os dados não serão apagados.
            </p>
          </div>
        </div>
        <div>
          <p className="text-sm">
            Para confirmar, digite o nome do projeto abaixo:
          </p>
          <p className="mt-1 font-mono text-sm font-medium">{expected}</p>
        </div>
        <input
          className={inputCls}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Digite o nome aqui"
          autoFocus
        />
      </div>
      <div className="flex justify-end gap-2 border-t px-5 py-3">
        <button onClick={onClose} disabled={running} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
          Cancelar
        </button>
        <button
          onClick={async () => {
            setRunning(true)
            try { await onConfirm() } finally { setRunning(false) }
          }}
          disabled={!matches || running}
          className="flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Arquivar projeto
        </button>
      </div>
    </ModalShell>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers

const inputCls = 'w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40'

function Field({ label, full = false, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? 'sm:col-span-2' : undefined}>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}
