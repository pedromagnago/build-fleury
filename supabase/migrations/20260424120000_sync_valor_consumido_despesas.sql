-- Recalcula despesas_indiretas.valor_consumido automaticamente a partir da soma
-- de parcelas.valor_pago vinculadas. Garante consistência mesmo quando
-- baixas são feitas via conciliação (que não atualizava esse campo).

CREATE OR REPLACE FUNCTION recalcular_consumido_despesa()
RETURNS TRIGGER AS $$
DECLARE ids uuid[];
BEGIN
  ids := ARRAY[]::uuid[];
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.despesa_indireta_id IS NOT NULL THEN
    ids := ids || NEW.despesa_indireta_id;
  END IF;
  IF TG_OP IN ('DELETE','UPDATE') AND OLD.despesa_indireta_id IS NOT NULL THEN
    ids := ids || OLD.despesa_indireta_id;
  END IF;
  IF array_length(ids, 1) IS NOT NULL THEN
    UPDATE despesas_indiretas d
    SET valor_consumido = COALESCE((SELECT SUM(valor_pago) FROM parcelas p WHERE p.despesa_indireta_id = d.id), 0)
    WHERE d.id = ANY(ids);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalcular_consumido_despesa ON parcelas;
CREATE TRIGGER trg_recalcular_consumido_despesa
AFTER INSERT OR UPDATE OR DELETE ON parcelas
FOR EACH ROW EXECUTE FUNCTION recalcular_consumido_despesa();

-- Backfill retroativo: sincroniza todos os valores atuais
UPDATE despesas_indiretas d
SET valor_consumido = COALESCE((SELECT SUM(valor_pago) FROM parcelas p WHERE p.despesa_indireta_id = d.id), 0);
