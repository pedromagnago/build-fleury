-- Backfill: conciliacoes com match_type='manual_mutuo' criadas antes do fix
-- ficaram sem linha em conciliacao_parcelas — o link com o mutuo criado nunca
-- foi persistido, fazendo o valor_conciliado_entrada/saida ficar zero.
--
-- Junta a conciliacao com o mutuo pela referência na observacoes (formato:
-- "Criado a partir de movimento bancário <uuid_mov>").

WITH orfas AS (
  SELECT c.id AS conc_id, c.movimentacao_id, c.company_id, mov.valor AS mov_valor
  FROM conciliacoes c
  JOIN movimentacoes_bancarias mov ON mov.id = c.movimentacao_id
  WHERE c.match_type = 'manual_mutuo'
    AND c.status = 'confirmado'
    AND NOT EXISTS (SELECT 1 FROM conciliacao_parcelas cp WHERE cp.conciliacao_id = c.id)
),
candidatos AS (
  SELECT DISTINCT ON (o.conc_id)
         o.conc_id, o.mov_valor, mu.id AS mutuo_id
  FROM orfas o
  JOIN mutuos mu ON mu.company_id = o.company_id
    AND mu.observacoes LIKE '%' || o.movimentacao_id || '%'
  ORDER BY o.conc_id, mu.created_at ASC
)
INSERT INTO conciliacao_parcelas (conciliacao_id, mutuo_id, valor_aplicado)
SELECT conc_id, mutuo_id, mov_valor FROM candidatos;
