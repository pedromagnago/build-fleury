-- Persiste valor_consumido (vu real da NF) em recepcao_consumos.
--
-- Sintoma: rastreio da NF mostrava "consumiu R$ X" usando vu do PEDIDO ALVO
-- (não da NF). Quando NF cobrava preço diferente do orçado (ex: 16,76 vs
-- 15,90), a soma "consumida" não batia com o valor total da NF. Diferença
-- = (vu_nf − vu_pedido) × qtd consumida = aumento/desconto de preço.
--
-- Solução: adiciona coluna valor_consumido (era calculada em _consumo_log
-- temp mas nunca persistida). RPC agora persiste. View v_recepcao_rastreio
-- usa valor_consumido + expõe vu_pedido e vu_nf pra UI mostrar diferença.

BEGIN;

ALTER TABLE recepcao_consumos
  ADD COLUMN IF NOT EXISTS valor_consumido numeric(15,2);

COMMENT ON COLUMN recepcao_consumos.valor_consumido IS
  'Valor financeiro real desse consumo: delta_qtd_recebida * valor_unitario da NF '
  '(não do pedido alvo). Pode diferir de delta_qtd * vu_pedido quando NF cobra '
  'preço diferente do orçado.';

-- Backfill: usa recepcao_matches.valor_unitario (da NF + item) pros consumos
-- existentes que não têm valor_consumido. Subquery porque UPDATE FROM tem
-- limites na referência ao "outer" alias.
UPDATE recepcao_consumos rc
SET valor_consumido = rc.delta_qtd_recebida * COALESCE((
  SELECT rm.valor_unitario FROM recepcao_matches rm
  JOIN pedido_itens pi ON pi.id = rc.pedido_item_id
  WHERE rm.doc_id = rc.doc_id AND rm.item_compra_id = pi.item_compra_id
  LIMIT 1
), 0)
WHERE rc.valor_consumido IS NULL
  AND rc.pedido_item_id IS NOT NULL
  AND COALESCE(rc.delta_qtd_recebida, 0) > 0;

-- View atualizada: expõe vu_pedido + vu_nf (mudou ordem de colunas — DROP+CREATE)
DROP VIEW IF EXISTS public.v_recepcao_rastreio;

CREATE VIEW public.v_recepcao_rastreio AS
SELECT
  rc.id AS consumo_id,
  rc.doc_id,
  rc.company_id,
  rc.created_at,
  CASE
    WHEN rc.created_pedido_id IS NOT NULL THEN 'pedido_criado'
    WHEN rc.valor_coberto_previsao IS NOT NULL AND rc.valor_coberto_previsao > 0 THEN 'cobertura_previsao'
    WHEN rc.pedido_item_id IS NOT NULL AND COALESCE(rc.delta_qtd_recebida, 0) > 0 THEN 'consumo_fisico'
    ELSE 'outro'
  END AS tipo,
  COALESCE(rc.created_pedido_id, pi.pedido_id) AS pedido_id,
  COALESCE(p_criado.numero_pedido, p_alvo.numero_pedido) AS pedido_numero,
  COALESCE(f_criado.nome, f_alvo.nome) AS fornecedor_nome,
  COALESCE(p_criado.is_previsao_orcamento, p_alvo.is_previsao_orcamento, false) AS is_previsao,
  pi.item_compra_id,
  ic.codigo AS item_codigo,
  ic.descricao AS item_descricao,
  rc.delta_qtd_recebida,
  rc.valor_coberto_previsao,
  pi.valor_unitario_real AS vu_pedido,
  (SELECT rm.valor_unitario FROM recepcao_matches rm
   WHERE rm.doc_id = rc.doc_id AND rm.item_compra_id = pi.item_compra_id
   LIMIT 1) AS vu_nf,
  -- Prioridade: cobertura > valor_consumido persistido > fallback (vu_pedido)
  CASE
    WHEN rc.valor_coberto_previsao IS NOT NULL THEN rc.valor_coberto_previsao
    WHEN rc.valor_consumido IS NOT NULL THEN rc.valor_consumido
    WHEN rc.pedido_item_id IS NOT NULL AND COALESCE(rc.delta_qtd_recebida, 0) > 0
      THEN rc.delta_qtd_recebida * COALESCE(pi.valor_unitario_real, 0)
    ELSE NULL
  END AS valor_efeito
FROM recepcao_consumos rc
LEFT JOIN pedidos p_criado     ON p_criado.id = rc.created_pedido_id
LEFT JOIN pedido_itens pi      ON pi.id = rc.pedido_item_id
LEFT JOIN pedidos p_alvo       ON p_alvo.id = pi.pedido_id
LEFT JOIN fornecedores f_criado ON f_criado.id = p_criado.fornecedor_id
LEFT JOIN fornecedores f_alvo   ON f_alvo.id = p_alvo.fornecedor_id
LEFT JOIN itens_compra ic      ON ic.id = pi.item_compra_id;

GRANT SELECT ON public.v_recepcao_rastreio TO authenticated;

-- A RPC aplicar_recepcao_nf foi atualizada via apply_migration separada
-- (rpc_persiste_valor_consumido). O unico delta vs versao anterior e' o INSERT
-- final de recepcao_consumos que agora inclui valor_consumido (vindo da
-- _consumo_log temp table que ja calculava esse valor desde sempre).

COMMIT;
