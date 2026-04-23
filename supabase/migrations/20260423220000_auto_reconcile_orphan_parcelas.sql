-- Auto-vincula parcelas pagas "órfãs" (sem conciliação) a movimentações bancárias
-- compatíveis (mesma conta, data, valor exato, tipo saída) que também estão sem conciliação.
-- Causa: reimport do OFX trouxe as movs verdadeiras, mas as parcelas criadas anteriormente
-- ficaram sem link (vínculo antigo era com mov que foi eliminada ou teve fitid mudado).

WITH pares AS (
  SELECT DISTINCT ON (p.id)
         p.id AS parcela_id,
         p.company_id,
         p.valor_pago,
         mov.id AS mov_id
  FROM parcelas p
  JOIN movimentacoes_bancarias mov
    ON mov.company_id = p.company_id
   AND mov.conta_id = p.conta_bancaria_id
   AND mov.data = p.data_pagamento_real
   AND ABS(mov.valor - p.valor_pago) < 0.005
   AND mov.tipo = 'saida'
  WHERE p.status IN ('paga','parcialmente_paga')
    AND p.conta_bancaria_id IS NOT NULL
    AND p.data_pagamento_real IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM conciliacao_parcelas cp WHERE cp.parcela_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM conciliacoes c WHERE c.movimentacao_id = mov.id AND c.status = 'confirmado')
  ORDER BY p.id, mov.created_at ASC
),
novas_concs AS (
  INSERT INTO conciliacoes (company_id, movimentacao_id, match_type, confidence, diferenca, status)
  SELECT company_id, mov_id, 'auto_orfa_reimport', 100, 0, 'confirmado'
  FROM pares
  RETURNING id, movimentacao_id
)
INSERT INTO conciliacao_parcelas (conciliacao_id, parcela_id, valor_aplicado)
SELECT nc.id, p.parcela_id, p.valor_pago
FROM pares p
JOIN novas_concs nc ON nc.movimentacao_id = p.mov_id;

-- Marca as movs como conciliadas
UPDATE movimentacoes_bancarias mov
SET conciliado = true,
    conciliado_em = now(),
    parcela_id = cp.parcela_id
FROM conciliacoes c
JOIN conciliacao_parcelas cp ON cp.conciliacao_id = c.id
WHERE c.movimentacao_id = mov.id
  AND c.match_type = 'auto_orfa_reimport'
  AND c.status = 'confirmado'
  AND mov.conciliado = false;
