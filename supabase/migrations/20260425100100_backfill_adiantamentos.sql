-- Backfill: cada link de conciliacao_parcelas onde a mov bancaria ocorreu antes
-- do data_vencimento da parcela (= adiantamento real) vira uma parcela 'adiantamento'
-- nova, e o link e movido para essa nova parcela. O trigger sync_parcela_valor_pago
-- recalcula a parcela contratual original automaticamente.
DO $$
DECLARE
  link RECORD;
  nova_parcela_id uuid;
  next_num int;
BEGIN
  FOR link IN
    SELECT cp.id AS link_id, cp.parcela_id AS parc_orig, cp.valor_aplicado,
           p.pedido_id, p.company_id, p.descricao,
           mov.data AS mov_data, mov.conta_id, mov.descricao AS mov_desc
    FROM conciliacao_parcelas cp
    JOIN conciliacoes c ON c.id = cp.conciliacao_id AND c.status = 'confirmado'
    JOIN movimentacoes_bancarias mov ON mov.id = c.movimentacao_id
    JOIN parcelas p ON p.id = cp.parcela_id
    WHERE p.pedido_id IS NOT NULL
      AND p.tipo = 'contratual'
      AND mov.data < p.data_vencimento
  LOOP
    SELECT COALESCE(MAX(numero_parcela), 0) + 1 INTO next_num
    FROM parcelas WHERE pedido_id = link.pedido_id;

    INSERT INTO parcelas (
      company_id, pedido_id, numero_parcela, valor, valor_pago,
      data_vencimento, data_pagamento_real, status, tipo, descricao, conta_bancaria_id
    ) VALUES (
      link.company_id, link.pedido_id, next_num, link.valor_aplicado, link.valor_aplicado,
      link.mov_data, link.mov_data, 'paga', 'adiantamento',
      COALESCE(link.descricao, 'Adiantamento: ' || COALESCE(link.mov_desc, '')),
      link.conta_id
    )
    RETURNING id INTO nova_parcela_id;

    UPDATE conciliacao_parcelas SET parcela_id = nova_parcela_id WHERE id = link.link_id;
  END LOOP;
END $$;

-- Redistribui valor das contratuais sobre o saldo (valor_total_real - adiantamentos)
WITH agg AS (
  SELECT pedido_id,
         SUM(valor) FILTER (WHERE tipo = 'adiantamento') AS adi,
         SUM(valor) FILTER (WHERE tipo = 'contratual')   AS cont
  FROM parcelas
  WHERE pedido_id IS NOT NULL
  GROUP BY pedido_id
)
UPDATE parcelas p
SET valor = ROUND(((ped.valor_total_real - a.adi) * (p.valor / a.cont))::numeric, 2)
FROM pedidos ped
JOIN agg a ON a.pedido_id = ped.id
WHERE p.pedido_id = ped.id
  AND p.tipo = 'contratual'
  AND a.adi IS NOT NULL AND a.adi > 0
  AND a.cont IS NOT NULL AND a.cont > 0
  AND ABS(a.adi + a.cont - ped.valor_total_real) > 0.01
  AND ped.valor_total_real - a.adi >= 0;
