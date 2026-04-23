-- Corrige parcelas conciliadas cuja data_pagamento_real ficou null ou com a data
-- em que o usuário confirmou a conciliação (bug anterior que usava now()).
-- Repassa a data real da movimentação bancária vinculada.

-- Parcelas de pedidos/despesas indiretas
UPDATE parcelas p
SET data_pagamento_real = mov.data
FROM conciliacao_parcelas cp
JOIN conciliacoes c  ON c.id = cp.conciliacao_id
JOIN movimentacoes_bancarias mov ON mov.id = c.movimentacao_id
WHERE cp.parcela_id = p.id
  AND c.status = 'confirmado'
  AND (
    p.data_pagamento_real IS NULL
    OR p.data_pagamento_real <> mov.data
  )
  AND p.status IN ('paga', 'parcialmente_paga');

-- Parcelas de mutuo (devolução)
UPDATE mutuo_parcelas mp
SET data_pagamento_real = mov.data
FROM conciliacao_parcelas cp
JOIN conciliacoes c  ON c.id = cp.conciliacao_id
JOIN movimentacoes_bancarias mov ON mov.id = c.movimentacao_id
WHERE cp.mutuo_parcela_id = mp.id
  AND c.status = 'confirmado'
  AND (
    mp.data_pagamento_real IS NULL
    OR mp.data_pagamento_real <> mov.data
  )
  AND mp.status IN ('paga', 'parcialmente_paga');

-- Medições
UPDATE medicoes m
SET data_liberacao = mov.data
FROM conciliacao_parcelas cp
JOIN conciliacoes c  ON c.id = cp.conciliacao_id
JOIN movimentacoes_bancarias mov ON mov.id = c.movimentacao_id
WHERE cp.medicao_id = m.id
  AND c.status = 'confirmado'
  AND (
    m.data_liberacao IS NULL
    OR m.data_liberacao <> mov.data
  )
  AND m.status IN ('paga', 'liberada');

-- Popula conta_bancaria_id e forma_pagamento das parcelas conciliadas legadas (antes o trace era perdido)
UPDATE parcelas p
SET
  conta_bancaria_id = COALESCE(p.conta_bancaria_id, mov.conta_id),
  forma_pagamento   = COALESCE(
    p.forma_pagamento,
    CASE
      WHEN (UPPER(COALESCE(mov.descricao,'')) || ' ' || UPPER(COALESCE(mov.memo_raw,''))) ~ '\mPIX\M' THEN 'PIX'
      WHEN (UPPER(COALESCE(mov.descricao,'')) || ' ' || UPPER(COALESCE(mov.memo_raw,''))) ~ '\m(TED|DOC|TEV|TRANSFER)\M' THEN 'Transferência'
      WHEN (UPPER(COALESCE(mov.descricao,'')) || ' ' || UPPER(COALESCE(mov.memo_raw,''))) ~ '\m(BOLETO|COB)\M' THEN 'Boleto'
      WHEN (UPPER(COALESCE(mov.descricao,'')) || ' ' || UPPER(COALESCE(mov.memo_raw,''))) ~ '\mCHEQUE\M' THEN 'Cheque'
      WHEN (UPPER(COALESCE(mov.descricao,'')) || ' ' || UPPER(COALESCE(mov.memo_raw,''))) ~ '\mCART' THEN 'Cartão'
      ELSE NULL
    END
  )
FROM conciliacao_parcelas cp
JOIN conciliacoes c ON c.id = cp.conciliacao_id
JOIN movimentacoes_bancarias mov ON mov.id = c.movimentacao_id
WHERE cp.parcela_id = p.id
  AND c.status = 'confirmado';

-- Normaliza status das parcelas cujo valor_pago já cobre o total mas status ficou pendente
UPDATE parcelas
SET status = 'paga'
WHERE valor_pago >= valor - 0.005
  AND valor > 0
  AND status IN ('a_vencer', 'vencida', 'parcialmente_paga');

UPDATE mutuo_parcelas
SET status = 'paga'
WHERE valor_pago >= valor - 0.005
  AND valor > 0
  AND status IN ('pendente', 'vencida', 'parcialmente_paga');

-- Reclassifica mutuos criados antes do fix de Grupo E: os que representam saída real
-- (vinculados a movimentação de saída) vão de 'Adiantamento a Receber' para 'Adiantamento Feito'.
-- Os que representam captação genuína permanecem como estão.
UPDATE mutuos mu
SET categoria = 'Adiantamento Feito'
FROM conciliacoes c
JOIN movimentacoes_bancarias mov ON mov.id = c.movimentacao_id
WHERE c.match_type = 'manual_mutuo'
  AND c.status = 'confirmado'
  AND mov.tipo = 'saida'
  AND mov.data = mu.data_captacao
  AND mu.valor_captado = mov.valor
  AND mu.categoria = 'Adiantamento a Receber';
