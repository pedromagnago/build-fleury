-- Quando uma parcela 'adiantamento' é criada/alterada/removida, recalcula
-- automaticamente as parcelas 'contratual' do mesmo pedido para distribuir
-- (valor_total_real - sum(adiantamentos)) proporcionalmente, preservando 30/60/90.

CREATE OR REPLACE FUNCTION _redistribuir_contratuais(p_pedido_id uuid) RETURNS void AS $$
DECLARE
  v_total numeric;
  v_adi numeric;
  v_cont numeric;
  v_saldo numeric;
BEGIN
  IF p_pedido_id IS NULL THEN RETURN; END IF;

  SELECT valor_total_real INTO v_total FROM pedidos WHERE id = p_pedido_id;
  IF v_total IS NULL OR v_total <= 0 THEN RETURN; END IF;

  SELECT COALESCE(SUM(valor) FILTER (WHERE tipo = 'adiantamento'), 0),
         COALESCE(SUM(valor) FILTER (WHERE tipo = 'contratual'), 0)
    INTO v_adi, v_cont
  FROM parcelas WHERE pedido_id = p_pedido_id;

  v_saldo := v_total - v_adi;
  IF v_saldo < 0 THEN v_saldo := 0; END IF;

  IF v_cont <= 0 THEN RETURN; END IF;

  UPDATE parcelas
  SET valor = ROUND((v_saldo * (valor / v_cont))::numeric, 2)
  WHERE pedido_id = p_pedido_id
    AND tipo = 'contratual'
    AND ABS(valor - ROUND((v_saldo * (valor / v_cont))::numeric, 2)) > 0.005;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_fn_redistribuir_contratuais() RETURNS TRIGGER AS $$
DECLARE
  v_old_tipo text;
  v_new_tipo text;
  v_pedido_old uuid;
  v_pedido_new uuid;
BEGIN
  v_old_tipo := CASE TG_OP WHEN 'INSERT' THEN NULL ELSE OLD.tipo END;
  v_new_tipo := CASE TG_OP WHEN 'DELETE' THEN NULL ELSE NEW.tipo END;
  v_pedido_old := CASE TG_OP WHEN 'INSERT' THEN NULL ELSE OLD.pedido_id END;
  v_pedido_new := CASE TG_OP WHEN 'DELETE' THEN NULL ELSE NEW.pedido_id END;

  IF v_old_tipo IS DISTINCT FROM 'adiantamento' AND v_new_tipo IS DISTINCT FROM 'adiantamento' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_pedido_new IS NOT NULL THEN
    PERFORM _redistribuir_contratuais(v_pedido_new);
  END IF;
  IF v_pedido_old IS NOT NULL AND v_pedido_old IS DISTINCT FROM v_pedido_new THEN
    PERFORM _redistribuir_contratuais(v_pedido_old);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_redistribuir_contratuais ON parcelas;
CREATE TRIGGER trg_redistribuir_contratuais
AFTER INSERT OR UPDATE OF valor, tipo, pedido_id OR DELETE ON parcelas
FOR EACH ROW EXECUTE FUNCTION trg_fn_redistribuir_contratuais();
