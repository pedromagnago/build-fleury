# ADRs — Build Fleury

Registros de decisões arquiteturais (Architecture Decision Records) do projeto. Documentação retroativa das decisões estruturais já em vigor; todos com status **aceito**.

| ADR | Decisão |
|---|---|
| [ADR-001](ADR-001-recalculo-saldo-centralizado.md) | Saldo realizado recalculado só via `aplicarDeltaOrigem` + trigger `trg_sync_parcela_valor_pago`; proibido UPDATE direto em `valor_pago`/`valor_liberado`; status deriva do saldo com tolerância de centavos. |
| [ADR-002](ADR-002-vinculo-polimorfico-conciliacao.md) | `conciliacao_parcelas` é vínculo polimórfico com 4 FKs mutuamente exclusivas (parcela, medição, mútuo-parcela, mútuo); toda UI de vínculo lista as 4 origens. |
| [ADR-003](ADR-003-multi-tenant-rls-audit-logs.md) | Multi-tenant por `company_id` no client + RLS no banco; mutações críticas gravam `audit_logs` via helper central com `dados_antes`/`dados_depois`. |
| [ADR-004](ADR-004-invalidacao-queries-set-completo.md) | Toda mutation financeira invalida o set completo de query keys (conciliações, links, movimentações, parcelas, medições, medicao_parcelas, mútuos, cronograma). |
| [ADR-005](ADR-005-pagamento-recebimento-parcial-padrao.md) | Baixa parcial é o caso padrão em toda origem; status `parcial` visível com saldo; valores entram via `parseValorBR`. |
| [ADR-006](ADR-006-consumo-por-item-fornecedor-planejamento.md) | Consumo realizado casa por `item_compra_id`; fornecedor do pedido é planejamento e nunca filtra consumo — o real vem da NF/pagamento. |
