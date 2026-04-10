import { supabase } from './supabase'

export type AuditAcao =
  | 'INSERT' | 'UPDATE' | 'DELETE'
  | 'BULK_INSERT' | 'BULK_UPDATE' | 'BULK_DELETE' | 'BULK_PAYMENT'
  | 'IMPORT' | 'EXPORT' | 'SIMULATION_APPLY'

interface AuditEntry {
  companyId: string
  tabela: string
  acao: AuditAcao
  registroId?: string | null
  dadosAntes?: Record<string, unknown> | null
  dadosDepois?: Record<string, unknown> | null
  resumo?: string
}

/** Generates a human-readable summary of the action */
function gerarResumo(entry: AuditEntry): string {
  if (entry.resumo) return entry.resumo

  const tabelaLabel: Record<string, string> = {
    etapas: 'etapa', pedidos: 'pedido', parcelas: 'parcela',
    itens_compra: 'item de compra', fornecedores: 'fornecedor',
    medicoes: 'medição', cronograma_distribuicao: 'distribuição',
    documentos: 'documento', despesas_indiretas: 'despesa indireta',
    pagamentos: 'pagamento',
  }
  const label = tabelaLabel[entry.tabela] || entry.tabela

  switch (entry.acao) {
    case 'INSERT': return `Criou ${label}`
    case 'UPDATE': {
      if (entry.dadosAntes && entry.dadosDepois) {
        const changes = Object.keys(entry.dadosDepois).filter(
          k => JSON.stringify(entry.dadosAntes?.[k]) !== JSON.stringify(entry.dadosDepois?.[k])
        )
        if (changes.length > 0) return `Editou ${label}: ${changes.slice(0, 3).join(', ')}${changes.length > 3 ? ` (+${changes.length - 3})` : ''}`
      }
      return `Editou ${label}`
    }
    case 'DELETE': return `Excluiu ${label}`
    case 'BULK_INSERT': {
      const qtd = (entry.dadosDepois as any)?.qtd || (entry.dadosDepois as any)?.count || '?'
      return `Importou ${qtd} ${label}(s) em lote`
    }
    case 'BULK_UPDATE': {
      const qtd = (entry.dadosAntes as any)?.qtd || (entry.dadosAntes as any)?.ids?.length || '?'
      return `Editou ${qtd} ${label}(s) em lote`
    }
    case 'BULK_DELETE': {
      const qtd = (entry.dadosAntes as any)?.qtd || (entry.dadosAntes as any)?.ids?.length || '?'
      return `Excluiu ${qtd} ${label}(s) em lote`
    }
    case 'BULK_PAYMENT': {
      const qtd = (entry.dadosAntes as any)?.qtd || '?'
      return `Processou pagamento de ${qtd} ${label}(s)`
    }
    case 'IMPORT': return `Importou dados para ${label}`
    case 'EXPORT': return `Exportou dados de ${label}`
    case 'SIMULATION_APPLY': return `Aplicou simulação no ${label}`
    default: return `${entry.acao} em ${label}`
  }
}

let cachedEmail: string | null = null

/** Central audit log writer — use this everywhere instead of direct inserts */
export async function writeAuditLog(entry: AuditEntry) {
  try {
    if (!cachedEmail) {
      const { data: { user } } = await supabase.auth.getUser()
      cachedEmail = user?.email || null
    }

    const resumo = gerarResumo(entry)

    await supabase.from('audit_logs').insert({
      company_id: entry.companyId,
      tabela: entry.tabela,
      acao: entry.acao,
      registro_id: entry.registroId ?? null,
      agente: cachedEmail?.split('@')[0] || 'sistema',
      user_email: cachedEmail,
      dados_antes: entry.dadosAntes ?? null,
      dados_depois: entry.dadosDepois ?? null,
      resumo,
    })
  } catch (err) {
    console.error('[AuditLog] Falha ao gravar:', err)
  }
}

/** Batch audit log writer for bulk operations */
export async function writeAuditLogBatch(entries: AuditEntry[]) {
  try {
    if (!cachedEmail) {
      const { data: { user } } = await supabase.auth.getUser()
      cachedEmail = user?.email || null
    }

    const rows = entries.map(entry => ({
      company_id: entry.companyId,
      tabela: entry.tabela,
      acao: entry.acao,
      registro_id: entry.registroId ?? null,
      agente: cachedEmail?.split('@')[0] || 'sistema',
      user_email: cachedEmail,
      dados_antes: entry.dadosAntes ?? null,
      dados_depois: entry.dadosDepois ?? null,
      resumo: gerarResumo(entry),
    }))

    await supabase.from('audit_logs').insert(rows)
  } catch (err) {
    console.error('[AuditLog] Falha ao gravar lote:', err)
  }
}
