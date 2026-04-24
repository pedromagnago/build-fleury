-- Corrige parcelas em que valor_pago ficou INFLADO (em geral 2x a soma dos vinculos
-- de conciliacao) por bug de delta aplicado em dobro ao confirmar/editar conciliacao.
--
-- Padrao observado: 62 parcelas com valor_pago > SUM(conciliacao_parcelas.valor_aplicado).
-- Ajuste: valor_pago = soma dos vinculos; status/status recomputados.
--
-- Parcelas SEM conciliacao (baixa manual pura) nao sao afetadas.

WITH sums AS (
  SELECT cp.parcela_id, SUM(cp.valor_aplicado) AS soma_links
  FROM conciliacao_parcelas cp
  JOIN conciliacoes c ON c.id = cp.conciliacao_id AND c.status = 'confirmado'
  WHERE cp.parcela_id IS NOT NULL
  GROUP BY cp.parcela_id
)
UPDATE parcelas p
SET valor_pago = s.soma_links,
    status = CASE
      WHEN s.soma_links <= 0.005 THEN
        CASE WHEN p.data_vencimento < current_date THEN 'vencida' ELSE 'a_vencer' END
      WHEN s.soma_links >= p.valor - 0.005 THEN 'paga'
      ELSE 'parcialmente_paga'
    END,
    data_pagamento_real = CASE
      WHEN s.soma_links <= 0.005 THEN NULL
      ELSE p.data_pagamento_real
    END
FROM sums s
WHERE s.parcela_id = p.id
  AND p.valor_pago > s.soma_links + 0.01;
