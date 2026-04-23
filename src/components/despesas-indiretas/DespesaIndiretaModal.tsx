import { useState, useEffect, useMemo } from 'react'
import { X, Calendar } from 'lucide-react'
import { DespesaIndireta, useDespesasIndiretas } from '@/hooks/useDespesasIndiretas'
import { useFornecedores, Fornecedor } from '@/hooks/useCompras'

interface DespesaIndiretaModalProps {
  onClose: () => void
  initialData?: DespesaIndireta | null
}

const CATEGORIAS_BASE = [
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
  const { createDespesa, updateDespesa, isCreating, isUpdating, despesas } = useDespesasIndiretas()
  const { data: fornecedores = [] } = useFornecedores()

  const isSaving = isCreating || isUpdating

  // #14: Dynamic categories — merge base suggestions with existing from DB
  const allCategorias = useMemo(() => {
    const existing = new Set(despesas.map(d => d.categoria))
    CATEGORIAS_BASE.forEach(c => existing.add(c))
    return Array.from(existing).sort()
  }, [despesas])

  type Modo = 'avista' | 'parcelado' | 'recorrente'

  const [formData, setFormData] = useState({
    modo: 'avista' as Modo,
    categoria: '',
    descricao: '',
    valor_orcado: 0,
    cond_pagamento: '30/60/90',
    frequencia: 'mensal',
    data_inicio: '',
    data_fim: '',
    fornecedor_id: '',
    observacoes: '',
  })

  useEffect(() => {
    if (initialData) {
      const modo: Modo = initialData.recorrente
        ? 'recorrente'
        : (initialData.cond_pagamento && initialData.cond_pagamento.trim() ? 'parcelado' : 'avista')
      setFormData({
        modo,
        categoria: initialData.categoria,
        descricao: initialData.descricao,
        valor_orcado: initialData.valor_orcado,
        cond_pagamento: initialData.cond_pagamento || '30/60/90',
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

    if (formData.modo === 'recorrente' && !formData.data_fim) return
    if (formData.modo === 'parcelado' && !formData.cond_pagamento.trim()) return

    const payload = {
      categoria: formData.categoria,
      descricao: formData.descricao,
      valor_orcado: Number(formData.valor_orcado),
      recorrente: formData.modo === 'recorrente',
      frequencia: (formData.modo === 'recorrente' ? formData.frequencia : null) as any,
      cond_pagamento: formData.modo === 'parcelado' ? formData.cond_pagamento.trim() : null,
      data_inicio: formData.data_inicio,
      data_fim: formData.modo === 'recorrente' ? formData.data_fim : null,
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
                    {allCategorias.map(cat => <option key={cat} value={cat} />)}
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

            <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
              <div>
                <h4 className="text-sm font-medium">Forma de pagamento</h4>
                <p className="text-xs text-muted-foreground">Como essa despesa será parcelada no fluxo de caixa</p>
              </div>

              {/* Seletor de 3 modos */}
              <div className="grid grid-cols-3 gap-2">
                {([
                  { k: 'avista',     label: 'À vista',            desc: '1 parcela única' },
                  { k: 'parcelado',  label: 'Pontual parcelado',  desc: 'N parcelas por condição' },
                  { k: 'recorrente', label: 'Recorrente',          desc: 'Frequência regular' },
                ] as const).map(m => (
                  <button key={m.k} type="button"
                    onClick={() => setFormData({ ...formData, modo: m.k as Modo })}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      formData.modo === m.k ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-muted/50'
                    }`}>
                    <p className="text-xs font-bold">{m.label}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{m.desc}</p>
                  </button>
                ))}
              </div>

              {/* Campos conforme modo */}
              {formData.modo === 'avista' && (
                <div className="max-w-sm">
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Data de Vencimento</label>
                  <input type="date" required value={formData.data_inicio}
                    onChange={e => setFormData({ ...formData, data_inicio: e.target.value })}
                    className={INPUT} />
                </div>
              )}

              {formData.modo === 'parcelado' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Data Base (dia 0)</label>
                    <input type="date" required value={formData.data_inicio}
                      onChange={e => setFormData({ ...formData, data_inicio: e.target.value })}
                      className={INPUT} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Condição de Pagamento</label>
                    <input type="text" required value={formData.cond_pagamento}
                      onChange={e => setFormData({ ...formData, cond_pagamento: e.target.value })}
                      className={INPUT} placeholder="30/60/90" />
                    <p className="mt-1 text-[10px] text-muted-foreground">Dias a partir da data base, separados por "/". Ex: <code>0</code> (à vista), <code>30/60</code>, <code>30/60/90/120</code>.</p>
                  </div>
                </div>
              )}

              {formData.modo === 'recorrente' && (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Frequência</label>
                    <select value={formData.frequencia}
                      onChange={e => setFormData({ ...formData, frequencia: e.target.value })}
                      className={INPUT}>
                      <option value="semanal">Semanal</option>
                      <option value="quinzenal">Quinzenal</option>
                      <option value="mensal">Mensal</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Data Início</label>
                    <input type="date" required value={formData.data_inicio}
                      onChange={e => setFormData({ ...formData, data_inicio: e.target.value })}
                      className={INPUT} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Data Fim</label>
                    <input type="date" required value={formData.data_fim}
                      onChange={e => setFormData({ ...formData, data_fim: e.target.value })}
                      className={INPUT} />
                  </div>
                </div>
              )}

              {/* Hint de resumo */}
              {formData.modo === 'parcelado' && formData.cond_pagamento && (
                <div className="text-[10px] text-muted-foreground bg-primary/5 p-2 rounded flex items-center gap-2">
                  <Calendar className="h-3 w-3" />
                  Será gerada {formData.cond_pagamento.split('/').length} parcela(s) dividindo R$ {Number(formData.valor_orcado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.
                </div>
              )}
              {formData.modo === 'recorrente' && formData.data_inicio && formData.data_fim && (
                <div className="text-[10px] text-muted-foreground bg-primary/5 p-2 rounded flex items-center gap-2">
                  <Calendar className="h-3 w-3" />
                  Parcelas geradas automaticamente na periodicidade {formData.frequencia}, dividindo o valor total.
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
