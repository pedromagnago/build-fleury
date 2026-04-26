-- Quando data_entrega_prevista, cond_pagamento ou valor_total_real mudam no pedido,
-- recalcula data_vencimento das parcelas contratuais SEM baixa e SEM links de
-- conciliação. Para o valor, dispara _redistribuir_contratuais que cuida do recálculo.

CREATE OR REPLACE FUNCTION public.recalc_parcelas_on_pedido_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_data_base DATE;
  v_cond TEXT;
  v_parc RECORD;
  v_idx INT;
  v_dia INT;
BEGIN
  IF (TG_OP = 'UPDATE') AND (
    NEW.data_entrega_prevista IS DISTINCT FROM OLD.data_entrega_prevista OR
    NEW.cond_pagamento       IS DISTINCT FROM OLD.cond_pagamento OR
    NEW.valor_total_real     IS DISTINCT FROM OLD.valor_total_real
  ) THEN
    v_data_base := COALESCE(NEW.data_entrega_prevista, CURRENT_DATE);
    v_cond := COALESCE(NEW.cond_pagamento, '0');

    v_idx := 0;
    FOR v_parc IN
      SELECT id, numero_parcela
      FROM parcelas
      WHERE pedido_id = NEW.id
        AND COALESCE(tipo, 'contratual') = 'contratual'
        AND COALESCE(valor_pago, 0) <= 0.005
        AND status NOT IN ('paga', 'parcialmente_paga')
        AND NOT EXISTS (SELECT 1 FROM conciliacao_parcelas cp WHERE cp.parcela_id = parcelas.id)
      ORDER BY numero_parcela ASC
    LOOP
      v_idx := v_idx + 1;
      v_dia := CASE v_idx
        WHEN 1 THEN COALESCE(NULLIF(SPLIT_PART(v_cond, '/', 1), ''), '0')::INT
        WHEN 2 THEN COALESCE(NULLIF(SPLIT_PART(v_cond, '/', 2), ''), '0')::INT
        WHEN 3 THEN COALESCE(NULLIF(SPLIT_PART(v_cond, '/', 3), ''), '0')::INT
        WHEN 4 THEN COALESCE(NULLIF(SPLIT_PART(v_cond, '/', 4), ''), '0')::INT
        WHEN 5 THEN COALESCE(NULLIF(SPLIT_PART(v_cond, '/', 5), ''), '0')::INT
        ELSE 0
      END;
      UPDATE parcelas
      SET data_vencimento = v_data_base + (v_dia * INTERVAL '1 day')
      WHERE id = v_parc.id;
    END LOOP;

    IF NEW.valor_total_real IS DISTINCT FROM OLD.valor_total_real THEN
      PERFORM _redistribuir_contratuais(NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedidos_recalc_parcelas ON pedidos;
CREATE TRIGGER trg_pedidos_recalc_parcelas
  AFTER UPDATE ON pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.recalc_parcelas_on_pedido_change();
