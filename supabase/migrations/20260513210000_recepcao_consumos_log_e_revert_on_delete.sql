-- ============================================================================
-- recepcao_consumos_log_e_revert_on_delete
--
-- Log de consumo NF → pedido_item: cada vez que uma NF consome um planejado
-- ou cria um pedido novo, registra-se aqui. Permite reverter EXATAMENTE
-- quando a NF é apagada — sem mais consumo fantasma quando o operador
-- apaga e reaplica a mesma NF.
--
-- Aplicada via Supabase MCP em 2026-05-13 após snapshot/limpeza de:
--   - 221 pedido_itens com qtd_recebida > 0 e pedido pai sem nf_origem_id
--   - 8 recepcao_docs órfãos
-- ============================================================================

CREATE TABLE IF NOT EXISTS recepcao_consumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL REFERENCES recepcao_docs(id) ON DELETE CASCADE,
  -- Caso A: NF consumiu pedido_item existente (FIFO em planejado)
  pedido_item_id uuid REFERENCES pedido_itens(id) ON DELETE SET NULL,
  delta_qtd_recebida numeric NOT NULL DEFAULT 0 CHECK (delta_qtd_recebida >= 0),
  -- Caso B: NF criou pedido novo (sobra que não coube em planejados)
  created_pedido_id uuid REFERENCES pedidos(id) ON DELETE SET NULL,
  company_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  CHECK (pedido_item_id IS NOT NULL OR created_pedido_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_recepcao_consumos_doc ON recepcao_consumos(doc_id);
CREATE INDEX IF NOT EXISTS idx_recepcao_consumos_pi ON recepcao_consumos(pedido_item_id) WHERE pedido_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recepcao_consumos_ped ON recepcao_consumos(created_pedido_id) WHERE created_pedido_id IS NOT NULL;

ALTER TABLE recepcao_consumos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recepcao_consumos_select ON recepcao_consumos;
DROP POLICY IF EXISTS recepcao_consumos_insert ON recepcao_consumos;
DROP POLICY IF EXISTS recepcao_consumos_delete ON recepcao_consumos;
CREATE POLICY recepcao_consumos_select ON recepcao_consumos FOR SELECT TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY recepcao_consumos_insert ON recepcao_consumos FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY recepcao_consumos_delete ON recepcao_consumos FOR DELETE TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));

-- ============================================================================
-- Trigger BEFORE DELETE em recepcao_docs:
--   1) Para cada consumo do tipo "pedido_item existente", subtrai delta de qtd_recebida
--   2) Para cada consumo do tipo "pedido novo", apaga o pedido (cascateia pra parcelas)
-- Executa ANTES do CASCADE dos recepcao_consumos, então temos acesso às linhas filhas.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_recepcao_doc_revert_consumo()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT pedido_item_id, delta_qtd_recebida
    FROM recepcao_consumos
    WHERE doc_id = OLD.id AND pedido_item_id IS NOT NULL AND delta_qtd_recebida > 0
  LOOP
    UPDATE pedido_itens
    SET qtd_recebida = GREATEST(qtd_recebida - r.delta_qtd_recebida, 0)
    WHERE id = r.pedido_item_id;
  END LOOP;

  DELETE FROM pedidos
  WHERE id IN (
    SELECT created_pedido_id FROM recepcao_consumos
    WHERE doc_id = OLD.id AND created_pedido_id IS NOT NULL
  );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_recepcao_doc_revert ON recepcao_docs;
CREATE TRIGGER trg_recepcao_doc_revert
BEFORE DELETE ON recepcao_docs
FOR EACH ROW EXECUTE FUNCTION fn_recepcao_doc_revert_consumo();

-- ============================================================================
-- RPC: excluir_recepcao_doc(doc_id) — wrapper conveniente pro app.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.excluir_recepcao_doc(p_doc_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM recepcao_docs WHERE id = p_doc_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NF % não encontrada', p_doc_id;
  END IF;
  IF NOT public.user_can_access_company(auth.uid(), v_company) THEN
    RAISE EXCEPTION 'Acesso negado à NF %', p_doc_id;
  END IF;
  DELETE FROM recepcao_docs WHERE id = p_doc_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.excluir_recepcao_doc(uuid) TO authenticated;
