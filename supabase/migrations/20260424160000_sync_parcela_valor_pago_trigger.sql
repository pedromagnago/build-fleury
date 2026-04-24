-- Mantém parcelas.valor_pago sempre igual à soma dos vínculos de conciliação confirmados.
-- Previne o bug de "delta em dobro" observado (62 parcelas com valor_pago inflado).
-- Parcelas pagas via aba Pagamentos (sem conciliacao_parcelas) não são afetadas — o
-- trigger só dispara quando conciliacao_parcelas ou conciliacoes.status mudam.

CREATE OR REPLACE FUNCTION _recalc_parcela_valor_pago(ids uuid[]) RETURNS void AS $$
BEGIN
  -- 1) Parcelas com pelo menos um vínculo confirmado: valor_pago = soma dos vínculos
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
  FROM (
    SELECT cp.parcela_id, SUM(cp.valor_aplicado) AS soma_links
    FROM conciliacao_parcelas cp
    JOIN conciliacoes c ON c.id = cp.conciliacao_id AND c.status = 'confirmado'
    WHERE cp.parcela_id = ANY(ids)
    GROUP BY cp.parcela_id
  ) s
  WHERE p.id = s.parcela_id;

  -- 2) Parcelas cujo último vínculo foi removido: zerar valor_pago
  UPDATE parcelas p
  SET valor_pago = 0,
      status = CASE WHEN p.data_vencimento < current_date THEN 'vencida' ELSE 'a_vencer' END,
      data_pagamento_real = NULL
  WHERE p.id = ANY(ids)
    AND NOT EXISTS (
      SELECT 1 FROM conciliacao_parcelas cp
      JOIN conciliacoes c ON c.id = cp.conciliacao_id
      WHERE cp.parcela_id = p.id AND c.status = 'confirmado'
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_fn_conciliacao_parcelas_sync() RETURNS TRIGGER AS $$
DECLARE ids uuid[];
BEGIN
  ids := ARRAY[]::uuid[];
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.parcela_id IS NOT NULL THEN
    ids := ids || NEW.parcela_id;
  END IF;
  IF TG_OP IN ('DELETE','UPDATE') AND OLD.parcela_id IS NOT NULL THEN
    ids := ids || OLD.parcela_id;
  END IF;
  IF array_length(ids, 1) IS NOT NULL THEN
    PERFORM _recalc_parcela_valor_pago(ids);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_parcela_valor_pago ON conciliacao_parcelas;
CREATE TRIGGER trg_sync_parcela_valor_pago
AFTER INSERT OR UPDATE OR DELETE ON conciliacao_parcelas
FOR EACH ROW EXECUTE FUNCTION trg_fn_conciliacao_parcelas_sync();

-- Quando o status de uma conciliação muda (sugerido → confirmado, ou vice-versa),
-- precisamos reavaliar as parcelas vinculadas a ela.
CREATE OR REPLACE FUNCTION trg_fn_conciliacao_status_sync() RETURNS TRIGGER AS $$
DECLARE ids uuid[];
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  ids := ARRAY(
    SELECT parcela_id FROM conciliacao_parcelas
    WHERE conciliacao_id = COALESCE(NEW.id, OLD.id) AND parcela_id IS NOT NULL
  );
  IF array_length(ids, 1) IS NOT NULL THEN
    PERFORM _recalc_parcela_valor_pago(ids);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_parcela_por_status_conciliacao ON conciliacoes;
CREATE TRIGGER trg_sync_parcela_por_status_conciliacao
AFTER UPDATE ON conciliacoes
FOR EACH ROW EXECUTE FUNCTION trg_fn_conciliacao_status_sync();
