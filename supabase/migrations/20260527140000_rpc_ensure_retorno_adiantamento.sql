-- RPC: ensure_retorno_adiantamento
-- Cria automaticamente uma parcela de retorno em 30 dias quando um adiantamento
-- é registrado sem cronograma manual. Idempotente: não faz nada se já existirem
-- mutuo_parcelas para o mutuo.

CREATE OR REPLACE FUNCTION ensure_retorno_adiantamento(p_mutuo_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id     UUID;
  v_valor_captado  NUMERIC;
  v_data_captacao  DATE;
  v_data_venc      DATE;
  v_count          INT;
BEGIN
  SELECT company_id, valor_captado, data_captacao
  INTO   v_company_id, v_valor_captado, v_data_captacao
  FROM   mutuos
  WHERE  id = p_mutuo_id;

  IF NOT FOUND THEN RETURN; END IF;
  IF COALESCE(v_valor_captado, 0) <= 0 THEN RETURN; END IF;

  SELECT COUNT(*) INTO v_count
  FROM   mutuo_parcelas
  WHERE  mutuo_id = p_mutuo_id;

  IF v_count > 0 THEN RETURN; END IF;

  v_data_venc := COALESCE(v_data_captacao, CURRENT_DATE) + INTERVAL '30 days';

  INSERT INTO mutuo_parcelas (
    company_id, mutuo_id, numero_parcela,
    valor, data_vencimento, status, valor_pago
  ) VALUES (
    v_company_id, p_mutuo_id, 1,
    v_valor_captado, v_data_venc,
    CASE WHEN v_data_venc < CURRENT_DATE THEN 'vencida' ELSE 'pendente' END,
    0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_retorno_adiantamento(UUID) TO authenticated;
