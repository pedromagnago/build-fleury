import { useState, useEffect } from 'react'
import { X, Calendar } from 'lucide-react'
import { DespesaIndireta, useDespesasIndiretas } from '@/hooks/useDespesasIndiretas'
import { useFornecedores, Fornecedor } from '@/hooks/useCompras'

interface DespesaIndiretaModalProps {
  onClose: () => void
  initialData?: DespesaIndireta | null
}

const CATEGORIAS_SUGESTOES = [
  'Gestão Local',
  'Administrativo',
  'Seguro',
  'Benefícios',
  'Equipamentos Adicionais',
  'Alimentação',
  'Transporte',
  'Despesas Acessórias',
  'Capital de Giro',
  'Taxas e Impostos',
  'Marketing',
]

const INPUT = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"

export function DespesaIndiretaModal({ onClose, initialData }: DespesaIndiretaModalProps) {
  const { createDespesa, updateDespesa, isCreating, isUpdating } = useDespesasIndiretas()
  const { data: fornecedores = [] } = useFornecedores()

  const isSaving = isCreating || isUpdating

  const [formData, setFormData] = useState({
    categoria: '',
    descricao: '',
    valor_orcado: 0,
    recorrente: false,
    frequencia: 'mensal',
    data_inicio: '',
    data_fim: '',
    fornecedor_id: '',
    observacoes: '',
  })

  useEffect(() => {
    if (initialData) {
      setFormData({
        categoria: initialData.categoria,
        descricao: initialData.descricao,
        valor_orcado: initialData.valor_orcado,
        recorrente: initialData.recorrente,
        frequencia: initialData.frequencia || 'mensal',
        data_inicio: initialData.data_inicio || '',
        data_fim: initialData.data_fim || '',
        fornecedor_id: initialData.fornecedor_id || '',
        observacoes: initialData.observacoes || '',
      })
    }
  }, [initialData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validations
    if (!formData.categoria || !formData.descricao || formData.valor_orcado <= 0 || !formData.data_inicio) return

    if (formData.recorrente && !formData.data_fim) return

    const payload = {
      categoria: formData.categoria,
      descricao: formData.descricao,
      valor_orcado: Number(formData.valor_orcado),
      recorrente: formData.recorrente,
      frequencia: formData.recorrente ? formData.frequencia as any : null,
      data_inicio: formData.data_inicio,
      data_fim: formData.recorrente ? formData.data_fim : null,
      fornecedor_id: formData.fornecedor_id || null,
      observacoes: formData.observacoes || null,
    }

    if (initialData?.id) {
      await updateDespesa({ ...payload, id: initialData.id })
    } else {
      await createDespesa(payload)
    }

    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-2xl rounded-xl bg-card shadow-2xl border flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">{initialData ? 'Editar Custos Indiretos' : 'Novo Custo Indireto'}</h2>
          <button onClick={onClose} className="rounded-md p-2 hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="overflow-y-auto px-6 py-4 flex-1">
          <form id="despesa-form" onSubmit={handleSubmit} className="space-y-6">
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Categoria</label>
                <div className="relative">
                  <input
                    type="text"
                    list="categorias-list"
                    autoFocus
                    required
                    value={formData.categoria}
                    onChange={e => setFormData({ ...formData, categoria: e.target.value })}
                    className={INPUT}
                    placeholder="Ex: Gestão Local"
                  />
                  <datalist id="categorias-list">
                    {CATEGORIAS_SUGESTOES.map(cat => <option key={cat} value={cat} />)}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Descrição</label>
                <input
                  type="text"
                  required
                  value={formData.descricao}
                  onChange={e => setFormData({ ...formData, descricao: e.target.value })}
                  className={INPUT}
                  placeholder="Ex: Aluguel Container"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Valor Orçado Total</label>
                <div className="relative">
                  <span className="absolute left-3 top-[7px] text-sm text-muted-foreground">R$</span>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.valor_orcado}
                    onChange={e => setFormData({ ...formData, valor_orcado: Number(e.target.value) })}
                    className={`${INPUT} pl-9`}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Este é o valor TOTAL orçado para o período.</p>
              </div>
              
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Fornecedor (Opcional)</label>
                <select
                  value={formData.fornecedor_id}
                  onChange={e => setFormData({ ...formData, fornecedor_id: e.target.value })}
                  className={INPUT}
                >
                  <option value="">Selecione um fornecedor...</option>
                  {fornecedores.map((f: Fornecedor) => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">Recorrência</h4>
                  <p className="text-xs text-muted-foreground">Defina se é um custo contínuo ou pontual</p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={formData.recorrente}
                    onChange={e => setFormData({ ...formData, recorrente: e.target.checked })}
                  />
                  <div className="peer h-5 w-9 rounded-full bg-input after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none dark:border-gray-600 dark:bg-gray-700"></div>
                </label>
              </div>

              <div className={`grid grid-cols-3 gap-4 ${!formData.recorrente && 'grid-cols-2 max-w-sm'}`}>
                {formData.recorrente && (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Frequência</label>
                    <select
                      value={formData.frequencia}
                      onChange={e => setFormData({ ...formData, frequencia: e.target.value })}
                      className={INPUT}
                    >
                      <option value="semanal">Semanal</option>
                      <option value="quinzenal">Quinzenal</option>
                      <option value="mensal">Mensal</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Data {formData.recorrente ? 'Início' : 'Vencimento'}</label>
                  <input
                    type="date"
                    required
                    value={formData.data_inicio}
                    onChange={e => setFormData({ ...formData, data_inicio: e.target.value })}
                    className={INPUT}
                  />
                </div>
                {formData.recorrente && (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Data Fim</label>
                    <input
                      type="date"
                      required={formData.recorrente}
                      value={formData.data_fim}
                      onChange={e => setFormData({ ...formData, data_fim: e.target.value })}
                      className={INPUT}
                    />
                  </div>
                )}
              </div>
              
              {formData.recorrente && formData.data_inicio && formData.data_fim && (
                <div className="mt-3 text-[10px] text-muted-foreground bg-primary/5 p-2 rounded text-primary-foreground/80 flex items-center gap-2">
                  <Calendar className="h-3 w-3" />
                  As parcelas serão geradas automaticamente na periodicidade {formData.frequencia} dividindo o valor total.
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Observações</label>
              <textarea
                value={formData.observacoes}
                onChange={e => setFormData({ ...formData, observacoes: e.target.value })}
                className={`${INPUT} min-h-[60px] py-2`}
                placeholder="Detalhes adicionais..."
              />
            </div>

          </form>
        </div>

        <div className="border-t px-6 py-4 flex items-center justify-end gap-3 bg-muted/10 rounded-b-xl">
          <button type="button" onClick={onClose} className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Cancelar
          </button>
          <button 
            type="submit" 
            form="despesa-form" 
            disabled={isSaving}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isSaving ? 'Salvando...' : 'Salvar Despesa'}
          </button>
        </div>
      </div>
    </div>
  )
}
