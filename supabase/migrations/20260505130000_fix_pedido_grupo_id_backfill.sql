-- Corrige backfill da migration 20260505120000.
--
-- Backfill anterior agrupava por (fornecedor, minuto de criação), o que pegava
-- imports inteiros (254 pedidos!) como se fossem 1 PO. Em produção encontramos
-- grupos com até 254 pedidos distintos, todos com numero_pedido diferentes —
-- evidência de que era um import em lote, não uma PO única com vários itens.
--
-- Correção conservadora: só agrupa quando há múltiplos pedidos compartilhando
-- o MESMO numero_pedido + fornecedor — sinal explícito de que são itens de uma
-- mesma PO. Pedidos sem esse sinal ficam null (estado correto: pedidos antigos
-- isolados nunca foram agrupados na criação).

-- 1) Reset do backfill anterior
UPDATE pedidos
SET pedido_grupo_id = NULL
WHERE pedido_grupo_id IS NOT NULL;

-- 2) Re-backfill conservador
WITH grupos_validos AS (
  SELECT
    company_id,
    fornecedor_id,
    numero_pedido,
    gen_random_uuid() AS grupo_id
  FROM pedidos
  WHERE numero_pedido IS NOT NULL
    AND fornecedor_id IS NOT NULL
  GROUP BY company_id, fornecedor_id, numero_pedido
  HAVING COUNT(*) > 1
)
UPDATE pedidos p
SET pedido_grupo_id = g.grupo_id
FROM grupos_validos g
WHERE p.company_id = g.company_id
  AND p.fornecedor_id = g.fornecedor_id
  AND p.numero_pedido = g.numero_pedido;
