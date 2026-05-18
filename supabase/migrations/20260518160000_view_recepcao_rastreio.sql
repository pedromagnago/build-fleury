-- View de rastreio: pra cada NF aplicada, lista os efeitos (consumo físico,
-- cobertura de previsão financeira, pedido criado) em formato amigável pra UI.
-- Consumida pelo dialog "Rastreio da NF" em RecepcaoPage.tsx — botão History
-- ao lado do botão Excluir na lista de "Últimas NFs aplicadas".

CREATE OR REPLACE VIEW public.v_recepcao_rastreio AS
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
  -- Valor do efeito: cobertura usa valor_coberto_previsao; consumo físico
  -- estima delta_qtd × vu_real do pedido_item alvo.
  CASE
    WHEN rc.valor_coberto_previsao IS NOT NULL THEN rc.valor_coberto_previsao
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

COMMENT ON VIEW public.v_recepcao_rastreio IS
  'Para cada NF aplicada (doc_id), lista os efeitos em 4 tipos: pedido_criado, '
  'cobertura_previsao, consumo_fisico ou outro. Consumida pelo dialog "Rastreio da NF".';

GRANT SELECT ON public.v_recepcao_rastreio TO authenticated;
