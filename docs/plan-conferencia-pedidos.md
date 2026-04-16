# Implementação da Conferência de Pedidos vs Cronograma

> **Status:** Pendente — salvo para implementação futura.

## CONTEXTO
Tela de conferência de pedidos vs cronograma, com edição inline.
O gestor abre um pedido, vê a data de início da quinzena (medição-alvo),
e faz ajustes na mesma tela sem navegar.

## REGRA DE NEGÓCIO

- A data de entrega do pedido deve ser ≤ data_inicio da medição-alvo
- dias_folga = data_inicio_medicao - data_entrega_prevista
  - ≥ 0 → ✅ ok
  - -1 a -7 → ⚠️ risco
  - < -7 → 🔴 crítico
- Quando a data de entrega é alterada → recalcular parcelas automaticamente
- Quando a condição de pagamento é alterada → recalcular parcelas
- Soft delete: `deleted_at IS NULL` em todos os filtros

## VERIFICAÇÃO DE SCHEMA

### Tabela `pedidos` (campos reais)
- `item_compra_id` (NÃO `servico_id` nem `etapa_id` — liga à etapa via item_compra)
- `cond_pagamento` (NÃO `condicao_pagamento`)
- `data_entrega_prevista`
- `fornecedor_id`, `status`

### Tabela `fornecedores` (campos reais)
- `cond_pagamento_padrao` (NÃO `condicao_pagamento`)

### Tabela `medicoes` vs `cronograma_distribuicao`
- Não existe `medicoes_metas`
- Datas da quinzena vêm de `cronograma_distribuicao` (etapa_id, medicao_numero, data_inicio, data_fim)
- `medicoes` tem `data_prevista` (não data_inicio/data_fim)

## PERGUNTAS PENDENTES

1. Join path para medição-alvo: `pedidos -> itens_compra (etapa_id) -> cronograma_distribuicao (medicao_numero) -> medicoes (data)`?
2. Datas da quinzena: `cronograma_distribuicao.data_inicio` ou `medicoes.data_prevista`?
3. Fornecedores: usar `cond_pagamento_padrao`?
4. Pedidos: usar `cond_pagamento`?

## O QUE IMPLEMENTAR

1. Hook: `usePedidosConformidade()` em `src/hooks/usePedidos.ts`
2. Hook: `useAtualizarPedidoConformidade()` no mesmo arquivo
3. Componente: `<ConferenciaPedidos />` em `src/components/compras/`
4. Integração na página `/compras` como nova aba
