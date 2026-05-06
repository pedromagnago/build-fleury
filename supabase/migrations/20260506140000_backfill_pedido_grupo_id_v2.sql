-- Backfill v2: heurística composta para pedido_grupo_id.
--
-- O backfill v1 (20260505130000) usava só numero_pedido compartilhado, deixando
-- de fora lotes criados pelo wizard onde cada pedido recebe numero_pedido
-- distinto (ex.: Dione 16 pedidos criados juntos pra entrega 01/04, com
-- numero_pedido 615..630 — todos diferentes).
--
-- Sinais combinados:
-- B (preferido) — mesmo created_at exato + mesma data_entrega_prevista +
--   fornecedor: criação em batch para uma entrega.
-- A (fallback) — mesmo numero_pedido + fornecedor: import com numero
--   compartilhado entre linhas (não pego pelo B se created_at variou).

UPDATE pedidos SET pedido_grupo_id = NULL WHERE pedido_grupo_id IS NOT NULL;

-- Sinal B
WITH grupos_b AS (
  SELECT
    company_id, fornecedor_id, created_at, data_entrega_prevista,
    gen_random_uuid() AS grupo_id
  FROM pedidos
  WHERE fornecedor_id IS NOT NULL
  GROUP BY company_id, fornecedor_id, created_at, data_entrega_prevista
  HAVING COUNT(*) > 1
)
UPDATE pedidos p
SET pedido_grupo_id = g.grupo_id
FROM grupos_b g
WHERE p.company_id = g.company_id
  AND p.fornecedor_id = g.fornecedor_id
  AND p.created_at = g.created_at
  AND p.data_entrega_prevista IS NOT DISTINCT FROM g.data_entrega_prevista;

-- Sinal A (apenas onde B não pegou)
WITH grupos_a AS (
  SELECT
    company_id, fornecedor_id, numero_pedido,
    gen_random_uuid() AS grupo_id
  FROM pedidos
  WHERE pedido_grupo_id IS NULL
    AND numero_pedido IS NOT NULL
    AND fornecedor_id IS NOT NULL
  GROUP BY company_id, fornecedor_id, numero_pedido
  HAVING COUNT(*) > 1
)
UPDATE pedidos p
SET pedido_grupo_id = g.grupo_id
FROM grupos_a g
WHERE p.pedido_grupo_id IS NULL
  AND p.company_id = g.company_id
  AND p.fornecedor_id = g.fornecedor_id
  AND p.numero_pedido = g.numero_pedido;
