/**
 * useAlertCounts — contagens leves de alertas por módulo.
 * Alimenta os badges da sidebar e o resumo do Painel de Controle.
 * Usa 3 queries de COUNT diretas (não carrega registros) + reutiliza
 * cache dos health checks quando já disponível.
 */
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { useHealthChecks } from '@/hooks/useHealthChecks'

export interface AlertCounts {
  // Por módulo (para badges da sidebar)
  pagamentos: number       // parcelas vencidas
  extrato: number          // movimentos não conciliados
  compras: number          // pedidos sem parcela + estouros
  recepcao: number         // NFs não processadas
  custosIndiretos: number  // despesas sem parcela
  capital: number          // mútuos vencidos
  wbs: number              // itens com saldo negativo

  // Totais
  totalCritico: number
  totalPendencias: number
  total: number
}

export function useAlertCounts(): AlertCounts {
  const { currentCompany } = useProject()
  const companyId = currentCompany?.id
  const { checks, stats } = useHealthChecks()

  // Query leve: apenas 3 contagens diretas no banco.
  // NFs rascunho (applied_at IS NULL) não estão nos health checks.
  const { data: dbCounts } = useQuery({
    queryKey: ['alert-counts-db', companyId],
    queryFn: async () => {
      if (!companyId) return { nfsRascunho: 0, movNaoConciliadas: 0 }
      const [nfs, movs] = await Promise.all([
        supabase
          .from('recepcao_docs')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .is('applied_at', null),
        supabase
          .from('movimentacoes_bancarias')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('conciliado', false),
      ])
      return {
        nfsRascunho: nfs.count ?? 0,
        movNaoConciliadas: movs.count ?? 0,
      }
    },
    staleTime: 2 * 60 * 1000,
    enabled: !!companyId,
  })

  return useMemo<AlertCounts>(() => {
    const getItems = (id: string) => checks.find(c => c.id === id)?.items.length ?? 0

    const parcelasVencidas = getItems('parcelas-vencidas')
    const pedidosSemParcela = getItems('pedidos-sem-parcela')
    const estouroOrcamento = getItems('estouro-orcamento')
    const despesaSemParcela = getItems('despesa-sem-parcela')
    const mutuosVencidos = getItems('mutuos-vencidos')
    const nfsRascunho = dbCounts?.nfsRascunho ?? 0
    const movNaoConciliadas = dbCounts?.movNaoConciliadas ?? 0

    return {
      pagamentos: parcelasVencidas,
      extrato: movNaoConciliadas,
      compras: pedidosSemParcela + estouroOrcamento,
      recepcao: nfsRascunho,
      custosIndiretos: despesaSemParcela,
      capital: mutuosVencidos,
      wbs: estouroOrcamento,
      totalCritico: stats.critical,
      totalPendencias: stats.warn,
      total: stats.critical + stats.warn,
    }
  }, [checks, stats, dbCounts])
}
