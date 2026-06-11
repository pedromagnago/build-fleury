# ADR-002: Vínculo polimórfico de conciliação com 4 FKs

Data: 11/06/2026 · Status: aceito

## Contexto

Uma movimentação bancária pode quitar origens de natureza diferente: parcela de pedido/despesa indireta (saída), medição liberada pelo banco (entrada), parcela de mútuo (saída) ou captação de mútuo (entrada). Modelar uma tabela de vínculo por origem multiplicaria joins, telas e lógica de estorno. Houve retrabalho recorrente quando dialogs novos consideravam só parcela+mútuo e o usuário "não conseguia vincular" medições.

## Decisão

A tabela `conciliacao_parcelas` é o vínculo polimórfico único entre `conciliacoes` e as origens, com **4 FKs mutuamente exclusivas**: `parcela_id`, `medicao_id`, `mutuo_parcela_id` e `mutuo_id`. A exclusividade é garantida pela constraint `exactly_one_origin` (`supabase/migrations/20260424180000_fix_exactly_one_origin_incluir_mutuo_id.sql`), que exige exatamente uma FK não nula. Cada linha carrega `valor_aplicado` e encargos opcionais (`valor_juros`, `valor_multa`, `valor_desconto`) que não entram no saldo da origem; o fechamento com a movimentação é `valor_aplicado + juros + multa − desconto = mov.valor`.

No código, o tipo `VinculoOrigem = 'parcela' | 'medicao' | 'mutuo_parcela' | 'mutuo'` e os helpers `inferirOrigem`/`buildLinkRow` (`src/hooks/useConciliacao.ts`) traduzem entre a linha polimórfica e a origem. **Toda UI de vínculo lista as 4 origens** (candidatos filtrados por tipo entrada/saída), com badges distintos.

## Consequências

- Uma única tabela atende conciliação, baixa manual, estorno e undo — a reversão genérica itera os links e infere a origem (`inferirOrigem`), sem switch por tela.
- Dialogs/selects novos de vínculo nascem com as 4 listas; esquecer uma origem é regressão conhecida e deve ser barrado em review.
- Insert preenche somente a FK da origem escolhida; as demais ficam null.
- RLS de `conciliacao_parcelas` herda o tenant via `conciliacoes.company_id` (não há `company_id` próprio na tabela de vínculo).
- Custo: queries de leitura precisam de `COALESCE`/inferência para saber a origem, e a trigger de parcelas (ADR-001) só cobre uma das 4 FKs — as outras dependem de `aplicarDeltaOrigem`.
