-- Adiciona pedido_grupo_id em pedidos.
--
-- Contexto: hoje 1 pedido = 1 item. Quando o usuário cria "1 pedido" com
-- N itens (via wizard, bulk, import), o sistema explode em N pedidos
-- separados, fragmentando conciliação e entrada de NF.
--
-- Solução A (mínima): coluna UUID compartilhada entre pedidos do mesmo
-- "lançamento". Telas (conciliação, NF) podem operar no nível grupo.
-- Pedidos antigos: backfill por (company_id, fornecedor_id, minuto de criação).

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS pedido_grupo_id uuid;

-- Backfill: pedidos criados no mesmo minuto pelo mesmo fornecedor (e mesma
-- company) compartilham o grupo. 95% dos casos antigos cobre — o resto fica
-- com null e o usuário ajusta pontualmente.
WITH grupos AS (
  SELECT
    company_id,
    fornecedor_id,
    date_trunc('minute', created_at) AS minuto,
    gen_random_uuid() AS grupo_id
  FROM pedidos
  WHERE pedido_grupo_id IS NULL
    AND fornecedor_id IS NOT NULL
  GROUP BY company_id, fornecedor_id, date_trunc('minute', created_at)
)
UPDATE pedidos p
SET pedido_grupo_id = g.grupo_id
FROM grupos g
WHERE p.company_id = g.company_id
  AND p.fornecedor_id = g.fornecedor_id
  AND date_trunc('minute', p.created_at) = g.minuto
  AND p.pedido_grupo_id IS NULL;

-- Pedidos sem fornecedor: cada um vira seu próprio grupo (null fica null
-- pra não criar grupos artificiais). Pode-se agrupar manualmente depois.

CREATE INDEX IF NOT EXISTS idx_pedidos_grupo ON pedidos(pedido_grupo_id)
  WHERE pedido_grupo_id IS NOT NULL;

COMMENT ON COLUMN pedidos.pedido_grupo_id IS
  'Agrupa pedidos do mesmo "lançamento" (ex.: 1 pedido criado com vários itens). NULL = pedido isolado. Conciliação e NF podem rateiar entre pedidos do mesmo grupo.';
