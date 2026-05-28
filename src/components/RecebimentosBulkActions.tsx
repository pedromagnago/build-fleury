import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { exportToExcel } from '@/lib/exportExcel'
import { toast } from 'sonner'
import { Download, RotateCcw, CreditCard } from 'lucide-react'

export interface RecebimentoItemBulk {
  id: string
  origem: 'medicao' | 'adiantamento' | 'captacao'
  descricao: string
  parceiro: string | null
  valor: number
  valor_total: number
  data_prevista: string
  data_efetiva: string | null
  status: 'previsto' | 'recebido' | 'vencido' | 'parcial'
  raw: any
}

interface Props {
  items: RecebimentoItemBulk[]
  selectedIds: Set<string>
  onDone: () => void
  onBaixarLote: (items: RecebimentoItemBulk[]) => void
}

export default function RecebimentosBulkActions({ items, selectedIds, onDone, onBaixarLote }: Props) {
  const qc = useQueryClient()
  const [estornando, setEstornando] = useState(false)

  const selected = useMemo(
    () => items.filter(i => selectedIds.has(i.id)),
    [items, selectedIds],
  )
  const hasPagos = selected.some(i => i.status === 'recebido' || i.status === 'parcial')
  const hasPendentes = selected.some(i => i.status !== 'recebido')

  const handleExport = () => {
    if (selected.length === 0) return
    const rows = selected.map(i => {
      const recebido =
        i.origem === 'medicao' ? Number(i.raw.valor_liberado ?? 0) :
        i.origem === 'adiantamento' ? Number(i.raw.valor_pago ?? 0) : 0
      return {
        'Origem': i.origem === 'medicao' ? 'Medição' : i.origem === 'adiantamento' ? 'Adiantamento' : 'Capital de Giro',
        'Descrição': i.descricao,
        'Parceiro': i.parceiro ?? '',
        'Data Prevista': i.data_prevista,
        'Data Efetiva': i.data_efetiva ?? '',
        'Valor Total (R$)': i.valor_total,
        'Valor Recebido (R$)': recebido,
        'Saldo (R$)': Math.max(0, i.valor_total - recebido),
        'Status': i.status,
      }
    })
    exportToExcel(rows, `recebimentos_${new Date().toISOString().split('T')[0]}`, 'Recebimentos')
    toast.success(`${rows.length} itens exportados`)
  }

  const handleEstornarLote = async () => {
    const pagos = selected.filter(i => i.status === 'recebido' || i.status === 'parcial')
    if (pagos.length === 0) return
    if (!window.confirm(
      `Estornar ${pagos.length} recebimento(s)?\nIsso apagará as movimentações bancárias e conciliações vinculadas.`
    )) return

    setEstornando(true)
    let ok = 0
    let erros = 0
    for (const item of pagos) {
      try {
        await estornarItem(item)
        ok++
      } catch (err) {
        erros++
        console.error('[Estorno bulk] falhou para', item.id, err)
      }
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['medicoes'] }),
      qc.invalidateQueries({ queryKey: ['mutuos'] }),
      qc.invalidateQueries({ queryKey: ['movimentacoes'] }),
      qc.invalidateQueries({ queryKey: ['conciliacoes'] }),
      qc.invalidateQueries({ queryKey: ['dashboard-kpis'] }),
    ])
    setEstornando(false)
    if (erros === 0) toast.success(`${ok} estorno(s) realizados com sucesso`)
    else toast.error(`${ok} ok, ${erros} com erro — veja o console`)
    onDone()
  }

  return (
    <>
      {hasPendentes && (
        <BulkBtn
          icon={CreditCard}
          label="Baixar"
          onClick={() => onBaixarLote(selected.filter(i => i.status !== 'recebido'))}
        />
      )}
      <BulkBtn icon={Download} label="Exportar" onClick={handleExport} />
      {hasPagos && (
        <BulkBtn
          icon={RotateCcw}
          label={estornando ? 'Estornando…' : 'Estornar'}
          onClick={handleEstornarLote}
        />
      )}
    </>
  )
}

function BulkBtn({ icon: Icon, label, onClick }: {
  icon: React.ElementType; label: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-accent"
    >
      <Icon className="h-3.5 w-3.5" />{label}
    </button>
  )
}

async function estornarItem(item: RecebimentoItemBulk) {
  const fkCol =
    item.origem === 'medicao' ? 'medicao_id' :
    item.origem === 'adiantamento' ? 'mutuo_parcela_id' :
    'mutuo_id'

  const { data: links } = await supabase
    .from('conciliacao_parcelas')
    .select('conciliacao_id')
    .eq(fkCol, item.raw.id)

  const concIds = Array.from(new Set((links ?? []).map((l: any) => l.conciliacao_id as string)))
  if (concIds.length > 0) {
    const { data: concs } = await supabase
      .from('conciliacoes').select('movimentacao_id').in('id', concIds)
    const movIds = Array.from(new Set((concs ?? []).map((c: any) => c.movimentacao_id as string)))
    await supabase.from('conciliacao_parcelas').delete().in('conciliacao_id', concIds)
    await supabase.from('conciliacoes').delete().in('id', concIds)
    if (movIds.length > 0) {
      await supabase.from('movimentacoes_bancarias').delete().in('id', movIds)
    }
  }

  if (item.origem === 'medicao') {
    await supabase.from('medicoes').update({
      valor_liberado: 0,
      status: 'em_medicao',
      data_liberacao: null,
    }).eq('id', item.raw.id)
  } else if (item.origem === 'adiantamento') {
    await supabase.from('mutuo_parcelas').update({
      status: 'pendente',
      valor_pago: 0,
      data_pagamento_real: null,
    }).eq('id', item.raw.id)
  }
  // captacao: status recalcula automaticamente pelas conciliações deletadas
}

export { estornarItem as estornarRecebimentoItem }

export function formatarOrigem(origem: string): string {
  if (origem === 'medicao') return 'Medição'
  if (origem === 'adiantamento') return 'Adiantamento'
  return 'Capital de Giro'
}
