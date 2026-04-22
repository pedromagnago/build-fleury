/**
 * Build Fleury — Criar Lançamento a partir de Movimento
 *
 * Abre ao clicar "Criar novo" no painel lateral de conciliação.
 * Cria entidade (despesa indireta, adiantamento, transferência) com valor+data
 * do movimento e vincula automaticamente via conciliacao_parcelas.
 */
import { useState, useEffect } from 'react'
import { X, Save, ArrowLeftRight, Landmark, Building2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { useFornecedores } from '@/hooks/useCompras'
import { useContasBancarias } from '@/hooks/useFinanceiro'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { parsearCondicao } from '@/lib/parcelas'

type Tipo = 'despesa' | 'adiantamento' | 'transferencia'

interface Props {
  mov: any  // a linha do extrato (row)
  onClose: (refresh?: boolean) => void
}

export function CriarLancamentoFromMovDialog({ mov, onClose }: Props) {
  const { currentCompany } = useProject()
  const { data: fornecedores = [] } = useFornecedores()
  const { data: contas = [] } = useContasBancarias()
  const qc = useQueryClient()

  const isSaida = mov.tipo === 'saida'
  const absValor = Math.abs(Number(mov.valor))

  // Default: despesa p/ saídas, adiantamento p/ entradas
  const [tipo, setTipo] = useState<Tipo>(isSaida ? 'despesa' : 'adiantamento')
  const [nome, setNome] = useState(mov.descricao ?? '')
  const [fornecedorId, setFornecedorId] = useState<string>('')
  const [condPagamento, setCondPagamento] = useState('0')
  const [categoria, setCategoria] = useState('Indireto')
  const [contaDestinoId, setContaDestinoId] = useState<string>('')

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const submit = useMutation({
    mutationFn: async () => {
      if (!currentCompany) throw new Error('Sem empresa selecionada')
      const movId = mov.raw?.id
      if (!movId) throw new Error('Movimento sem ID')

      if (tipo === 'despesa') {
        // Cria despesa indireta + parcelas, vincula com conciliação
        const { data: desp, error: err } = await supabase.from('despesas_indiretas').insert({
          company_id: currentCompany.id,
          categoria,
          descricao: nome,
          valor_orcado: absValor,
          valor_consumido: absValor,
          data_inicio: mov.data,
          data_fim: null,
          fornecedor_id: fornecedorId || null,
          ativo: true,
          recorrente: false,
          frequencia: null,
        }).select('id').single()
        if (err) throw err
        if (!desp) throw new Error('Falha ao criar despesa')

        const dias = parsearCondicao(condPagamento || '0')
        const valorPorParcela = absValor / dias.length
        const parcelasRows = dias.map((d, i) => {
          const venc = new Date(mov.data + 'T12:00:00')
          venc.setDate(venc.getDate() + d)
          return {
            company_id: currentCompany.id,
            despesa_indireta_id: desp.id,
            pedido_id: null,
            numero_parcela: i + 1,
            valor: valorPorParcela,
            data_vencimento: venc.toISOString().split('T')[0]!,
            valor_pago: i === 0 ? absValor : 0,
            data_pagamento_real: i === 0 ? mov.data : null,
            status: i === 0 ? (dias.length === 1 ? 'paga' : 'parcialmente_paga') : 'a_vencer',
          }
        })
        const { data: parcs, error: errP } = await supabase.from('parcelas').insert(parcelasRows).select('id')
        if (errP) throw errP

        // Criar conciliação vinculando a primeira parcela
        if (parcs && parcs.length > 0) {
          const { data: conc, error: errC } = await supabase.from('conciliacoes').insert({
            company_id: currentCompany.id,
            movimentacao_id: movId,
            match_type: 'manual_from_mov',
            confidence: 100,
            diferenca: 0,
            status: 'confirmado',
          }).select('id').single()
          if (errC) throw errC
          if (conc) {
            await supabase.from('conciliacao_parcelas').insert({
              conciliacao_id: conc.id,
              parcela_id: parcs[0]!.id,
              valor_aplicado: absValor,
            })
          }
          await supabase.from('movimentacoes_bancarias').update({
            conciliado: true,
            conciliado_em: new Date().toISOString(),
            parcela_id: parcs[0]!.id,
          }).eq('id', movId)
        }
      }
      else if (tipo === 'adiantamento') {
        // Cria mútuo invertido (Adiantamento a Receber)
        const { data: mut, error: err } = await supabase.from('mutuos').insert({
          company_id: currentCompany.id,
          nome,
          tipo: 'OUTRO',
          valor_captado: absValor,
          data_captacao: mov.data,
          categoria: 'Adiantamento a Receber',
          status: 'ativo',
          fornecedor_id: fornecedorId || null,
          observacoes: `Criado a partir de movimento bancário ${mov.id}`,
        }).select('id').single()
        if (err) throw err
        if (!mut) throw new Error('Falha ao criar adiantamento')

        // Marca movimento como conciliado (mesmo sem parcela em parcelas-tabela, pois é mútuo)
        // Cria conciliação SEM links (ou com link para o mútuo via observação)
        await supabase.from('conciliacoes').insert({
          company_id: currentCompany.id,
          movimentacao_id: movId,
          match_type: 'manual_mutuo',
          confidence: 100,
          diferenca: 0,
          status: 'confirmado',
        })
        await supabase.from('movimentacoes_bancarias').update({
          conciliado: true,
          conciliado_em: new Date().toISOString(),
          observacao: `Adiantamento a receber: ${nome}`,
        }).eq('id', movId)
      }
      else if (tipo === 'transferencia') {
        if (!contaDestinoId) throw new Error('Selecione a conta destino')
        // Cria mov oposto na conta destino + marca ambos como conciliados
        const tipoOposto = isSaida ? 'entrada' : 'saida'
        const fitid = `transf_${movId}_${Date.now()}`
        const { data: movOposto, error: errM } = await supabase.from('movimentacoes_bancarias').insert({
          company_id: currentCompany.id,
          conta_id: contaDestinoId,
          data: mov.data,
          descricao: `Transferência ${isSaida ? 'recebida de' : 'enviada para'} outra conta — ${mov.descricao}`,
          valor: absValor,
          tipo: tipoOposto,
          fitid,
          origem: 'manual',
          conciliado: true,
          conciliado_em: new Date().toISOString(),
          observacao: `Par da mov ${movId}`,
          categoria: isSaida ? 'Entrada de Transferência' : 'Saída de Transferência',
        }).select('id').single()
        if (errM) throw errM
        // Atualiza mov original
        await supabase.from('movimentacoes_bancarias').update({
          conciliado: true,
          conciliado_em: new Date().toISOString(),
          categoria: isSaida ? 'Saída de Transferência' : 'Entrada de Transferência',
          observacao: `Par da mov ${movOposto?.id}`,
        }).eq('id', movId)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['despesas_indiretas'] })
      qc.invalidateQueries({ queryKey: ['mutuos'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['movimentacoes'] })
      qc.invalidateQueries({ queryKey: ['conciliacoes'] })
      toast.success('Lançamento criado e vinculado')
      onClose(true)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  type OpcaoTipo = { id: Tipo; label: string; desc: string; icon: any; visible: boolean }
  const opcoesTipo: OpcaoTipo[] = ([
    {
      id: 'despesa' as Tipo,
      label: 'Despesa',
      desc: 'Despesa indireta paga (material, serviço, administrativo)',
      icon: Building2,
      visible: isSaida,
    },
    {
      id: 'adiantamento' as Tipo,
      label: isSaida ? 'Adiantamento feito' : 'Adiantamento recebido',
      desc: isSaida
        ? 'Empréstimo do projeto para parceiro (a receber de volta)'
        : 'Captação de mútuo — parceiro emprestou ao projeto',
      icon: Landmark,
      visible: true,
    },
    {
      id: 'transferencia' as Tipo,
      label: 'Transferência entre contas',
      desc: 'Cria movimento oposto em outra conta (não afeta despesa/receita)',
      icon: ArrowLeftRight,
      visible: true,
    },
  ] as OpcaoTipo[]).filter(o => o.visible)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-xl rounded-xl border bg-card shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-base font-bold">Criar Lançamento</h2>
            <p className="text-[11px] text-muted-foreground">
              Vincular {isSaida ? 'saída' : 'entrada'} de {formatCurrency(absValor)} em {mov.data}
            </p>
          </div>
          <button onClick={() => onClose()} className="rounded-md p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          {/* Seletor de tipo */}
          <div className="space-y-1.5">
            {opcoesTipo.map(o => (
              <button key={o.id} onClick={() => setTipo(o.id)} type="button"
                className={`w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                  tipo === o.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                }`}>
                <o.icon className={`h-4 w-4 mt-0.5 ${tipo === o.id ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold">{o.label}</p>
                  <p className="text-[10px] text-muted-foreground">{o.desc}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Campos condicionais por tipo */}
          {(tipo === 'despesa' || tipo === 'adiantamento') && (
            <>
              <div>
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Nome/Descrição</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Parceiro</label>
                <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs">
                  <option value="">—</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
            </>
          )}

          {tipo === 'despesa' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">Categoria</label>
                  <input value={categoria} onChange={(e) => setCategoria(e.target.value)}
                    className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">Cond. Pagto</label>
                  <input value={condPagamento} onChange={(e) => setCondPagamento(e.target.value)}
                    placeholder="0 (à vista) ou 30/60/90"
                    className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Parcela 1 será marcada como paga e vinculada a este movimento. Parcelas seguintes ficam a vencer.
              </p>
            </>
          )}

          {tipo === 'transferencia' && (
            <div>
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Conta destino</label>
              <select value={contaDestinoId} onChange={(e) => setContaDestinoId(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs">
                <option value="">— Selecione a conta —</option>
                {contas.filter(c => c.id !== mov.conta_id).map(c => (
                  <option key={c.id} value={c.id}>{c.nome}{c.banco ? ` · ${c.banco}` : ''}</option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Cria movimentação oposta ({isSaida ? 'entrada' : 'saída'} de {formatCurrency(absValor)}) na conta selecionada
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t p-4">
          <button onClick={() => onClose()}
            className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">Cancelar</button>
          <button onClick={() => submit.mutate()} disabled={submit.isPending}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <Save className="h-3.5 w-3.5" />
            {submit.isPending ? 'Salvando...' : 'Criar e vincular'}
          </button>
        </div>
      </div>
    </div>
  )
}
