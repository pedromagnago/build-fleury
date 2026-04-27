-- Para mutuos com conciliação confirmada, a data efetiva (data_captacao) deve
-- ser a data da movimentação bancária real — não a data planejada que foi
-- digitada quando o mutuo foi cadastrado.
UPDATE mutuos mu
SET data_captacao = sub.mov_data
FROM (
  SELECT DISTINCT ON (mu.id) mu.id AS mutuo_id, mov.data AS mov_data
  FROM mutuos mu
  JOIN conciliacao_parcelas cp ON cp.mutuo_id = mu.id
  JOIN conciliacoes c ON c.id = cp.conciliacao_id AND c.status = 'confirmado'
  JOIN movimentacoes_bancarias mov ON mov.id = c.movimentacao_id
  WHERE mu.data_captacao IS DISTINCT FROM mov.data
  ORDER BY mu.id, mov.data ASC
) sub
WHERE mu.id = sub.mutuo_id;
