# ADR-003: Multi-tenant por company_id + RLS + audit_logs obrigatório

Data: 11/06/2026 · Status: aceito

## Contexto

O app atende múltiplas empresas (construtoras) no mesmo banco Supabase. Sem isolamento sistemático, qualquer query esquecida vazaria dados entre tenants — risco identificado na auditoria de segurança P0, que encontrou policies "always true" em `conciliacao_parcelas` e INSERT sem checagem de tenant em `recepcao_docs`. Além disso, operações financeiras (baixas, importações em lote, simulações) precisam de trilha de auditoria para investigação posterior.

## Decisão

1. **Tenant em duas camadas.** No client, toda query usa o `currentCompany` do `ProjectContext`: `queryKey` inclui `currentCompany?.id`, filtro `.eq('company_id', currentCompany.id)` e `enabled: !!currentCompany`. No banco, RLS em todas as tabelas via `public.user_can_access_company(auth.uid(), company_id)`; tabelas sem `company_id` próprio (ex.: `conciliacao_parcelas`) herdam o tenant do pai (`conciliacoes.company_id`) — ver `supabase/migrations/20260430230000_security_p0_tenant_isolation.sql`.
2. **Audit log centralizado.** Toda mutação crítica grava em `audit_logs` via `writeAuditLog`/`writeAuditLogBatch` (`src/lib/auditLog.ts`), nunca insert ad hoc. Shape: `company_id`, `tabela`, `acao` (INSERT/UPDATE/DELETE, variantes BULK_*, IMPORT/EXPORT/SIMULATION_APPLY), `registro_id`, `agente` (prefixo do e-mail autenticado), `user_email`, `dados_antes`, `dados_depois`, `resumo` legível gerado automaticamente.

## Consequências

- O filtro client-side é UX (mostra só o tenant ativo); a garantia de segurança é a RLS — uma não substitui a outra, as duas são obrigatórias em código novo.
- `UPDATE` em `companies` é restrito a `super_admin`; views sensíveis não usam SECURITY DEFINER.
- O audit log é best-effort (try/catch com `console.error`) — falha de auditoria não aborta a operação financeira.
- `dados_antes`/`dados_depois` permitem diff de campos no resumo ("Editou parcela: valor, data_vencimento") e reconstrução de incidentes sem depender de logs de infraestrutura.
- Custo: todo hook novo repete o boilerplate de `company_id` + `enabled` + auditoria; o Painel de Saúde e a AuditoriaPage assumem que essa trilha existe.
