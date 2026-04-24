-- A constraint antiga só considerava parcela_id/medicao_id/mutuo_parcela_id,
-- ignorando mutuo_id (adicionado em migration posterior). Qualquer link só com
-- mutuo_id falhava com "exactly_one_origin violated".
ALTER TABLE conciliacao_parcelas DROP CONSTRAINT IF EXISTS exactly_one_origin;
ALTER TABLE conciliacao_parcelas ADD CONSTRAINT exactly_one_origin CHECK (
  (CASE WHEN parcela_id       IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN medicao_id       IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN mutuo_parcela_id IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN mutuo_id         IS NOT NULL THEN 1 ELSE 0 END) = 1
);
