# ADR-006: Consumo realizado é por item; fornecedor do pedido é planejamento

Data: 11/06/2026 · Status: aceito

## Contexto

O fornecedor cadastrado no pedido de compra é uma previsão ("imagino que vou comprar com X"). Na prática a compra frequentemente fecha com outro fornecedor. Quando o consumo de pedido (recepção de NF, vínculo de pagamento) exigia `pedido.fornecedor_id = nf.fornecedor_id`, NFs legítimas não consumiam o saldo planejado — o item ficava "não recebido" e o orçamento duplicava entre previsto e realizado.

## Decisão

O consumo realizado é sempre casado por **`item_compra_id`**, nunca por fornecedor:

- Na RPC `aplicar_recepcao_nf` (`supabase/migrations/20260515110000_aplicar_recepcao_nf_rpc.sql`) e em qualquer consumo FIFO de pedidos, as linhas elegíveis filtram apenas `company_id`, `item_compra_id` e status ativo. Proibido adicionar `AND p.fornecedor_id = ...` como gatekeeping.
- A mesma regra vale para Pagamentos, Conciliação e qualquer mutação que reduza saldo de pedido.
- O CNPJ/nome da NF serve para identificar ou cadastrar o **fornecedor real** (lookup por CNPJ normalizado, depois por nome, senão insert em `fornecedores`) e registrá-lo em `recepcao_docs.fornecedor_id` — informação de realizado, não filtro de consumo.
- `pedido_itens.qtd_recebida` é a medida de entrega por item; triggers derivam o status do pedido de `SUM(qtd_recebida)` vs `SUM(qtd)` (`src/hooks/useCompras.ts`).

## Consequências

- Planejamento com fornecedor A e compra efetiva com fornecedor B consome o pedido normalmente; o realizado (NF/pagamento) é a fonte do fornecedor verdadeiro.
- Diagnóstico de "NF não consumiu o item" nunca presume divergência de fornecedor — investigar matching de `item_compra_id`, a `acao` do payload (`consumir` vs `substituir_pedido` vs `criar_pedido`), saldo dos pedidos elegíveis e os registros em `recepcao_matches`/`recepcao_consumos`.
- Relatórios de custo por fornecedor devem ler o realizado (NF/pagamento), não o fornecedor do pedido.
- Custo: o fornecedor do pedido perde valor como filtro operacional — é dado de planejamento e assim deve ser rotulado na UI.
