/**
 * Build Fleury — Cadastro de Adiantamento a Receber
 *
 * Registra um empréstimo que o projeto fez para fornecedor/parceiro.
 * Cria `mutuos` categoria='Adiantamento a Receber' com valor desembolsado +
 * opcional cronograma de devolução (parcelas em `mutuo_parcelas`).
 */
import { useState, useEffect } from 'react'
import { X, Save, Plus, Trash2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { useFornecedores } from '@/hooks/useCompras'
import { toast } from 'sonner'

interface Props {
  onClose: () => void
}

interface ParcelaForm {
  valor: string
  data: string
}

export function NovoAdiantamentoDialog({ onClose }: Props) {
  const { currentCompany } = useProject()
  const { data: fornecedores = [] } = useFornecedores()
  const qc = useQueryClient()

  const [nome, setNome] = useState('')
  const [fornecedorId, setFornecedorId] = useState<string>('')
  const [valor, setValor] = useState('')
  const [dataDesembolso, setDataDesembolso] = useState(() => new Date().toISOString().split('T')[0]!)
  const [observacoes, setObservacoes] = useState('')
  const [parcelas, setParcelas] = useState<ParcelaForm[]>([])

  const addParcela = () => {
    const valorDefault = valor && parcelas.length >= 0
      ? (Number(valor.replace(',', '.')) / (parcelas.length + 1)).toFixed(2)
      : ''
    setParcelas([...parcelas, { valor: valorDefault, data: '' }])
  }
  const removeParcela = (i: number) => setParcelas(parcelas.filter((_, idx) => idx !== i))
  const updateParcela = (i: number, field: keyof ParcelaForm, v: string) => {
    setParcelas(parcelas.map((p, idx) => idx === i ? { ...p, [field]: v } : p))
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!currentCompany) throw new Error('Sem empresa selecionada')
      const valorNum = Number(valor.replace(',', '.'))
      if (!nome.trim() || !valorNum || valorNum <= 0) throw new Error('Preencha nome e valor')

      const { data: mut, error: errMut } = await supabase.from('mutuos').insert({
        company_id: currentCompany.id,
        nome: nome.trim(),
        tipo: 'OUTRO',
        valor_captado: valorNum,
        data_captacao: dataDesembolso,
        categoria: 'Adiantamento a Receber',
        status: 'ativo',
        fornecedor_id: fornecedorId || null,
        observacoes: observacoes.trim() || 'Adiantamento a receber (projeto desembolsou, parceiro deve devolver)',
      }).select('id').single()
      if (errMut) throw errMut

      if (parcelas.length > 0 && mut) {
        const parcRows = parcelas
          .filter(p => p.valor && p.data)
          .map((p, i) => ({
            company_id: currentCompany.id,
            mutuo_id: mut.id,
            numero_parcela: i + 1,
            valor: Number(p.valor.replace(',', '.')),
            data_vencimento: p.data,
            status: new Date(p.data) < new Date() ? 'vencida' : 'pendente',
          }))
        if (parcRows.length > 0) {
          const { error: errP } = await supabase.from('mutuo_parcelas').insert(parcRows)
          if (errP) throw errP
        }
      }
      return mut
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mutuos'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      toast.success('Adiantamento registrado')
      onClose()
    },
    onError: (err: Error) => toast.error('Erro: ' + err.message),
  })

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const totalParcelas = parcelas.reduce((s, p) => s + (Number(p.valor.replace(',', '.')) || 0), 0)
  const valorNum = Number(valor.replace(',', '.')) || 0
  const difParcelas = totalParcelas - valorNum

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-2xl rounded-xl border bg-card shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-base font-bold">Novo Adiantamento a Receber</h2>
            <p className="text-[11px] text-muted-foreground">
              Registrar empréstimo do projeto para parceiro/fornecedor (valor a ser devolvido)
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Nome/Referência *</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Adiantamento REALIZE GESTAO — 10/03"
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Parceiro</label>
              <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs">
                <option value="">— sem parceiro vinculado —</option>
                {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Data Desembolso *</label>
              <input type="date" value={dataDesembolso} onChange={(e) => setDataDesembolso(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Valor Total Adiantado (R$) *</label>
            <input type="text" value={valor} onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs text-right font-mono" />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Observações</label>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2}
              placeholder="Contexto, motivo do adiantamento..."
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs" />
          </div>

          {/* Cronograma de devolução */}
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold">Cronograma de Devolução (opcional)</p>
                <p className="text-[10px] text-muted-foreground">
                  Quando o parceiro devolverá os valores ao projeto
                </p>
              </div>
              <button onClick={addParcela} type="button"
                className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground hover:opacity-90">
                <Plus className="h-3 w-3" />Parcela
              </button>
            </div>

            {parcelas.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-muted-foreground w-6">#{i + 1}</span>
                <input type="text" value={p.valor} onChange={(e) => updateParcela(i, 'valor', e.target.value)}
                  placeholder="Valor"
                  className="flex-1 rounded-md border bg-background px-2 py-1 text-xs text-right font-mono" />
                <input type="date" value={p.data} onChange={(e) => updateParcela(i, 'data', e.target.value)}
                  className="flex-1 rounded-md border bg-background px-2 py-1 text-xs" />
                <button onClick={() => removeParcela(i)} type="button"
                  className="rounded p-1 hover:bg-red-500/10 text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {parcelas.length > 0 && (
              <div className={`flex justify-between text-[11px] pt-1 border-t ${
                Math.abs(difParcelas) < 0.01 ? 'text-emerald-600' : 'text-amber-600'
              }`}>
                <span>Total parcelas: R$ {totalParcelas.toFixed(2)}</span>
                <span>{Math.abs(difParcelas) < 0.01 ? '✓ Fecha com adiantado' : `Dif: R$ ${difParcelas.toFixed(2)}`}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t p-4">
          <button onClick={onClose}
            className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">Cancelar</button>
          <button onClick={() => create.mutate()} disabled={create.isPending}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <Save className="h-3.5 w-3.5" />
            {create.isPending ? 'Salvando...' : 'Registrar Adiantamento'}
          </button>
        </div>
      </div>
    </div>
  )
}
