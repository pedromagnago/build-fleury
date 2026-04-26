-- Adiciona 'parcialmente_pago' ao check de status do pedido
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_status_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_status_check
  CHECK (status IN ('planejado','pedido_enviado','entregue','parcialmente_pago','pago','cancelado'));

-- Trigger consolida automaticamente o status do pedido a partir do total pago em parcelas
CREATE OR REPLACE FUNCTION public.consolidate_pedido_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_total NUMERIC;
  v_pago  NUMERIC;
  v_pedido_id UUID;
BEGIN
  v_pedido_id := COALESCE(NEW.pedido_id, OLD.pedido_id);
  IF v_pedido_id IS NULL THEN RETURN NEW; END IF;

  SELECT valor_total_real INTO v_total FROM pedidos WHERE id = v_pedido_id;
  SELECT COALESCE(SUM(valor_pago), 0) INTO v_pago FROM parcelas WHERE pedido_id = v_pedido_id;

  IF v_total IS NULL OR v_total <= 0 THEN RETURN NEW; END IF;

  IF v_pago >= v_total - 0.01 THEN
    UPDATE pedidos SET status = 'pago'
    WHERE id = v_pedido_id AND status NOT IN ('pago','cancelado');
  ELSIF v_pago > 0 THEN
    UPDATE pedidos SET status = 'parcialmente_pago'
    WHERE id = v_pedido_id AND status NOT IN ('parcialmente_pago','pago','cancelado');
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_consolidate_pedido ON parcelas;
CREATE TRIGGER trg_consolidate_pedido
  AFTER INSERT OR UPDATE OF valor_pago, status OR DELETE ON parcelas
  FOR EACH ROW EXECUTE FUNCTION public.consolidate_pedido_status();

-- Backfill
UPDATE pedidos p SET status = 'pago'
WHERE p.status NOT IN ('pago','cancelado')
  AND p.valor_total_real > 0
  AND COALESCE((SELECT SUM(valor_pago) FROM parcelas WHERE pedido_id = p.id), 0) >= p.valor_total_real - 0.01;

UPDATE pedidos p SET status = 'parcialmente_pago'
WHERE p.status NOT IN ('parcialmente_pago','pago','cancelado')
  AND p.valor_total_real > 0
  AND COALESCE((SELECT SUM(valor_pago) FROM parcelas WHERE pedido_id = p.id), 0) > 0
  AND COALESCE((SELECT SUM(valor_pago) FROM parcelas WHERE pedido_id = p.id), 0) < p.valor_total_real - 0.01;
