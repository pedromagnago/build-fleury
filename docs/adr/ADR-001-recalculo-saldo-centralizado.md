# ADR-001: Recálculo de saldo centralizado — aplicarDeltaOrigem + trigger SQL

Data: 11/06/2026 · Status: aceito

## Contexto

O saldo realizado das origens financeiras (`parcelas.valor_pago`, `medicoes.valor_liberado`, `mutuo_parcelas.valor_pago`) era atualizado por UPDATEs diretos espalhados em vários fluxos (conciliação, baixa manual, estorno, edição). Isso causou o bug de "delta em dobro": 62 parcelas ficaram com `valor_pago` inflado porque o app somava o delta e um caminho paralelo somava de novo. Além disso, o `status` ficava dessincronizado do saldo (parcela `paga` sem atingir o total, ou `parcialmente_paga` com saldo zero), quebrando a Eq B de `useEquacoesContabeis` e acendendo a regra `parcelas-dessinc` no Painel de Saúde.

## Decisão

Centralizar todo recálculo de saldo em duas peças, e proibir UPDATE direto em `valor_pago`/`valor_liberado`/`status`:

1. **Trigger SQL `trg_sync_parcela_valor_pago`** (`supabase/migrations/20260424160000_sync_parcela_valor_pago_trigger.sql`): para `parcelas`, dispara em INSERT/UPDATE/DELETE de `conciliacao_parcelas` (e em mudança de `conciliacoes.status` via `trg_sync_parcela_por_status_conciliacao`) e recalcula `valor_pago = SUM(valor_aplicado)` dos vínculos com conciliação `confirmado`. É a fonte única para parcelas — o client NÃO escreve `valor_pago` (escrever incremental duplicaria o delta).
2. **`aplicarDeltaOrigem(origem, origemId, delta, dataPgto)`** (`src/hooks/useConciliacao.ts`): para as origens sem trigger (`medicao`, `mutuo_parcela`, `mutuo`), é obrigatório chamar o helper a cada mutação de vínculo (delta positivo na criação, negativo no estorno/exclusão, diferença na edição). Para `origem='parcela'` o helper apenas preenche `data_pagamento_real` quando ausente, delegando saldo/status à trigger.

## Consequências

- `status` é sempre derivado do saldo, com tolerância de centavos (0.005 no código; 0.01 nas comparações de UI/checks): saldo ≤ tolerância → `pendente`/`vencida`/`a_vencer`/`futura`; saldo ≥ total − tolerância → `paga`; intermediário → `parcialmente_paga`/`liberada`.
- Nenhum dialog/hook novo pode fazer `UPDATE parcelas SET valor_pago = ...` — toda baixa passa por inserir/alterar linha em `conciliacao_parcelas` + `aplicarDeltaOrigem` (ver `RecebimentoBaixaModal.tsx`, `CriarLancamentoFromMovDialog.tsx`).
- Estorno é simétrico: reverter um vínculo é chamar o helper com delta negativo igual ao `valor_aplicado` original (parcelas revertem sozinhas pela trigger).
- Deltas com `|delta| < 0.005` são ignorados pelo helper, evitando ruído de arredondamento.
- Custo: dois mecanismos coexistem (trigger para parcela, helper para as demais) — quem escreve código novo precisa saber qual origem usa qual caminho.
