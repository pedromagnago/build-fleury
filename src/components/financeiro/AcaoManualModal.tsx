import { useState, useMemo } from 'react'
import { X, Layers, AlertCircle, Building2, HelpCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useFornecedores } from '@/hooks/useCompras'
import { useEtapas } from '@/hooks/useEtapas'
import type { ReconciliationMatch } from '@/lib/reconciliationEngine'

const INPUT = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"

const CATEGORIAS_BASE = [
  'Gestão Local', 'Administrativo', 'Seguro', 'Benefícios',
  'Equipamentos Adicionais', 'Alimentação', 'Transporte',
  'Despesas Acessórias', 'Capital de Giro', 'Taxas e Impostos', 'Marketing'
]

export function AcaoManualModal({ 
  match, 
  onClose, 
  onSuccess 
}: { 
  match: ReconciliationMatch
  onClose: () => void
  onSuccess: () => void
}) {
  const [mode, setMode] = useState<'indireto' | 'fantasma' | 'mutuo'>('indireto')
  const [isSaving, setIsSaving] = useState(false)

  const { data: fornecedores = [] } = useFornecedores()
  const { data: etapas = [] } = useEtapas()

  // Form states
  const [categoria, setCategoria] = useState('')
  const [descricao, setDescricao] = useState('')
  const [etapaId, setEtapaId] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    try {
      const movId = (match.transaction as any)._movId
      if (!movId) throw new Error('Movimentação ID não encontrado.')

      const valorAbs = Math.abs(match.transaction.amount) // Transaction val
      const dataPag = match.transaction.date

      if (mode === 'indireto') {
        if (!categoria || !descricao) throw new Error('Preencha os campos obrigatórios')
        
        // 1. Criar Despesa
        const { data: desp, error: errDesp } = await supabase
          .from('despesas_indiretas')
          .insert({
            projeto_id: 'default',
            categoria,
            descricao,
            fornecedor_id: fornecedorId || null,
            valor_orcado: valorAbs,
            recorrente: false,
            data_inicio: dataPag,
          })
          .select().single()
        if (errDesp) throw errDesp

        // 2. Criar Parcela (Paga)
        const { data: parc, error: errParc } = await supabase
          .from('parcelas_financeiras')
          .insert({
            projeto_id: 'default',
            despesa_indireta_id: desp.id,
            valor: valorAbs,
            data_vencimento: dataPag,
            tipo: 'pagar',
            status: 'paga',
            data_pagamento_real: dataPag,
            valor_pago_real: valorAbs,
          })
          .select().single()
        if (errParc) throw errParc

        // 3. Linkar Conciliação
        await linkConciliacao(movId, parc.id)

      } else if (mode === 'fantasma') {
        if (!etapaId || !descricao) throw new Error('Preencha os campos obrigatórios')
        
        // 1. Item Flex
        const { data: item, error: errItem } = await supabase
          .from('items')
          .insert({
            projeto_id: 'default',
            etapa_id: etapaId,
            nome: descricao,
            descricao: 'Criado via conciliação',
            unidade: 'vb',
            quantidade_orcada: 1,
            custo_unitario_orcado: valorAbs,
          })
          .select().single()
        if (errItem) throw errItem

        // 2. Pedido
        const { data: ped, error: errPed } = await supabase
          .from('pedidos_compra')
          .insert({
            projeto_id: 'default',
            item_id: item.id,
            fornecedor_id: fornecedorId || null,
            numero: `CC-${Math.floor(Math.random() * 10000)}`,
            status: 'concluido',
            valor_total: valorAbs,
            data_pedido: dataPag,
          })
          .select().single()
        if (errPed) throw errPed

        // 3. Parcela
        const { data: parc, error: errParc } = await supabase
          .from('parcelas_financeiras')
          .insert({
            projeto_id: 'default',
            pedido_id: ped.id,
            valor: valorAbs,
            data_vencimento: dataPag,
            tipo: 'pagar',
            status: 'paga',
            data_pagamento_real: dataPag,
            valor_pago_real: valorAbs,
          })
          .select().single()
        if (errParc) throw errParc

        // 4. Linkar Conciliação
        await linkConciliacao(movId, parc.id)

      } else if (mode === 'mutuo') {
        if (!fornecedorId) throw new Error('Selecione um fornecedor ou favorecido')
        
        const isEntrada = match.transaction.amount > 0

        // 1. Criar Mutuo
        const { data: mut, error: errMut } = await supabase
          .from('mutuos')
          .insert({
            projeto_id: 'default',
            fornecedor_id: fornecedorId,
            nome: `Mútuo/Conciliação`,
            data_captacao: dataPag,
            valor_captado: valorAbs,
            tipo_juros: 'pre',
            taxa_juros: 0,
          })
          .select().single()
        if (errMut) throw errMut

        // Se for Crédito (Entrada de Dinheiro pro Projeto) ou Saída?
        // Neste caso a WBS Mútuos geralmente representa entradas que vamos pagar. Se for Adiantamento, é saída que vamos receber.
        // O BD vai linkar diretamente nas parcelas se quisermos, mas como é só marcação manual, 
        // criamos a conciliação marcando o movId como resolvido
        const { data: concData, error: concErr } = await supabase
          .from('conciliacoes')
          .insert({
            projeto_id: 'default',
            movimentacao_id: movId,
            match_type: 'manual',
            confidence: 100,
            status: 'confirmado',
          })
          .select().single()
        if (concErr) throw concErr

        await supabase.from('movimentacoes_bancarias').update({ conciliado: true }).eq('id', movId)
      }

      toast.success('Conciliação manual registrada.')
      onSuccess()
    } catch (err) {
      toast.error('Erro ao classificar: ' + (err as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  async function linkConciliacao(movId: string, parcelaId: string) {
    const { data: concData, error: concErr } = await supabase
      .from('conciliacoes')
      .insert({
        projeto_id: 'default',
        movimentacao_id: movId,
        match_type: 'manual',
        confidence: 100,
        status: 'confirmado',
      })
      .select().single()
    if (concErr) throw concErr

    const { error: relErr } = await supabase
      .from('conciliacao_parcelas')
      .insert({
        conciliacao_id: concData.id,
        parcela_id: parcelaId,
        valor_aplicado: Math.abs(match.transaction.amount)
      })
    if (relErr) throw relErr

    // Update Movimentacao
    await supabase.from('movimentacoes_bancarias').update({ conciliado: true }).eq('id', movId)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-card shadow-2xl border flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Classificação Manual</h2>
            <p className="text-xs text-muted-foreground truncate" title={match.transaction.memoClean}>{match.transaction.memoClean}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-2 hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="overflow-y-auto px-6 py-4 flex-1">
          {/* Mode Switcher */}
          <div className="flex rounded-lg bg-muted p-1 text-xs font-medium mb-6">
            <button
              onClick={() => { setMode('indireto'); setDescricao(match.transaction.memoClean) }}
              className={`flex-1 rounded-md py-1.5 px-2 text-center transition-all ${mode === 'indireto' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:bg-muted-foreground/10'}`}
            >
              Custo Indireto
            </button>
            <button
              onClick={() => { setMode('fantasma'); setDescricao(match.transaction.memoClean) }}
              className={`flex-1 rounded-md py-1.5 px-2 text-center transition-all ${mode === 'fantasma' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:bg-muted-foreground/10'}`}
            >
              Projeto (WBS)
            </button>
            <button
              onClick={() => setMode('mutuo')}
              className={`flex-1 rounded-md py-1.5 px-2 text-center transition-all ${mode === 'mutuo' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:bg-muted-foreground/10'}`}
            >
              Mútuo
            </button>
          </div>

          <form id="acao-form" onSubmit={handleSave} className="space-y-4">

            {/* Campos Custo Indireto */}
            {mode === 'indireto' && (
              <>
                <div className="rounded-md bg-amber-500/10 p-3 mb-4 flex gap-3 text-amber-600 text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p>Isso criará uma despesa indireta e a marcará como paga, linkando esta movimentação.</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Categoria</label>
                  <input
                    type="text"
                    list="categorias-list"
                    required
                    value={categoria}
                    onChange={e => setCategoria(e.target.value)}
                    className={INPUT}
                    placeholder="Ex: Gestão Local"
                  />
                  <datalist id="categorias-list">
                    {CATEGORIAS_BASE.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Descrição</label>
                  <input
                    type="text"
                    required
                    value={descricao}
                    onChange={e => setDescricao(e.target.value)}
                    className={INPUT}
                    placeholder="Ex: Refeição Funcionários"
                  />
                </div>
              </>
            )}

            {/* Campos Projeto (WBS) */}
            {mode === 'fantasma' && (
              <>
                <div className="rounded-md bg-blue-500/10 p-3 mb-4 flex gap-3 text-blue-600 text-xs">
                  <Building2 className="h-4 w-4 shrink-0" />
                  <p>Isso registrará o custo diretamente no Orçamento (WBS), criando um item de fallback para alocar o valor.</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Etapa (WBS)</label>
                  <select required value={etapaId} onChange={e => setEtapaId(e.target.value)} className={INPUT}>
                    <option value="">Selecione uma etapa...</option>
                    {etapas.map(et => (
                      <option key={et.id} value={et.id}>{et.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Descrição do Item</label>
                  <input
                    type="text"
                    required
                    value={descricao}
                    onChange={e => setDescricao(e.target.value)}
                    className={INPUT}
                    placeholder="Ex: Material Hidráulico Avulso"
                  />
                </div>
              </>
            )}

            {/* Campos Mutuo */}
            {mode === 'mutuo' && (
              <>
                <div className="rounded-md bg-purple-500/10 p-3 mb-4 flex gap-3 text-purple-600 text-xs">
                  <Layers className="h-4 w-4 shrink-0" />
                  <p>Cria um registro de mútuo (empréstimo/adiantamento) no valor exato da transação.</p>
                </div>
              </>
            )}

            {/* Campo Global: Fornecedor */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {mode === 'mutuo' ? 'Favorecido/Fornecedor' : 'Fornecedor (Opcional)'}
              </label>
              <select 
                required={mode === 'mutuo'} 
                value={fornecedorId} 
                onChange={e => setFornecedorId(e.target.value)} 
                className={INPUT}
              >
                <option value="">Selecione...</option>
                {fornecedores.map(f => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </div>

            <div className="pt-2 text-right">
              <span className="text-xs text-muted-foreground">Valor a conciliar: </span>
              <strong className="text-sm border rounded bg-muted/50 px-2 py-1 ml-1 font-bold">
                {Number(Math.abs(match.transaction.amount)).toLocaleString('pt-BR', {style: 'currency', currency:'BRL'})}
              </strong>
            </div>

          </form>
        </div>

        <div className="border-t px-6 py-4 flex items-center justify-end gap-3 bg-muted/10 rounded-b-xl">
          <button type="button" onClick={onClose} className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Cancelar
          </button>
          <button 
            type="submit" 
            form="acao-form" 
            disabled={isSaving}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isSaving ? 'Salvando...' : 'Classificar e Conciliar'}
          </button>
        </div>
      </div>
    </div>
  )
}
