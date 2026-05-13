-- ============================================================================
-- split_pedidos_header_e_itens
--
-- Refatora o modelo de pedidos: header (pedidos) + linhas (pedido_itens).
-- Permite 1 NF = 1 pedido com N itens, conceito de "consumo" via qtd_recebida,
-- e vínculo direto pedido ↔ NF de origem (nf_origem_id).
--
-- NÃO-destrutiva: nenhum DROP COLUMN. Colunas legacy de pedidos
-- (item_compra_id, qtd_lote, valor_unitario_real, casas_lote) permanecem.
-- Triggers garantem que pedidos.valor_total_real fica em sincronia com
-- SUM(pedido_itens.valor_total_real).
--
-- Aplicado em produção via Supabase branch merge em 2026-05-13.
-- Validado com 5 checks de backfill + 11 cenários A–K de triggers em runtime.
-- ============================================================================

-- 1) Permite o novo status 'parcialmente_entregue' no CHECK
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_status_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_status_check
  CHECK (status = ANY (ARRAY[
    'planejado','pedido_enviado','parcialmente_entregue','entregue',
    'parcialmente_pago','pago','cancelado'
  ]));

-- 2) Coluna nf_origem_id em pedidos (NULL = pedido manual)
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS nf_origem_id uuid
  REFERENCES recepcao_docs(id) ON DELETE SET NULL;
COMMENT ON COLUMN pedidos.nf_origem_id IS
  'NF (recepcao_docs.id) que originou este pedido via recepção. NULL se manual.';

UPDATE pedidos p
SET nf_origem_id = m.doc_id
FROM recepcao_matches m
WHERE m.pedido_criado_id = p.id AND p.nf_origem_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_nf_origem
  ON pedidos(nf_origem_id) WHERE nf_origem_id IS NOT NULL;

-- 3) Nova tabela: pedido_itens (linhas do pedido)
CREATE TABLE IF NOT EXISTS pedido_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  item_compra_id uuid NOT NULL REFERENCES itens_compra(id) ON DELETE CASCADE,
  qtd numeric NOT NULL CHECK (qtd > 0),
  valor_unitario_real numeric NOT NULL DEFAULT 0,
  valor_total_real numeric NOT NULL DEFAULT 0,
  qtd_recebida numeric NOT NULL DEFAULT 0 CHECK (qtd_recebida >= 0),
  casas_lote numeric,
  ordem integer NOT NULL DEFAULT 1,
  observacoes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedido_itens_pedido ON pedido_itens(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_itens_item ON pedido_itens(item_compra_id);

CREATE TRIGGER pedido_itens_updated_at BEFORE UPDATE ON pedido_itens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4) RLS — acesso via company do pedido pai
ALTER TABLE pedido_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pedido_itens_select ON pedido_itens;
DROP POLICY IF EXISTS pedido_itens_insert ON pedido_itens;
DROP POLICY IF EXISTS pedido_itens_update ON pedido_itens;
DROP POLICY IF EXISTS pedido_itens_delete ON pedido_itens;

CREATE POLICY pedido_itens_select ON pedido_itens FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pedidos p WHERE p.id = pedido_itens.pedido_id
                 AND public.user_can_access_company(auth.uid(), p.company_id)));
CREATE POLICY pedido_itens_insert ON pedido_itens FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM pedidos p WHERE p.id = pedido_itens.pedido_id
                      AND public.user_can_access_company(auth.uid(), p.company_id)));
CREATE POLICY pedido_itens_update ON pedido_itens FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM pedidos p WHERE p.id = pedido_itens.pedido_id
                 AND public.user_can_access_company(auth.uid(), p.company_id)));
CREATE POLICY pedido_itens_delete ON pedido_itens FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM pedidos p WHERE p.id = pedido_itens.pedido_id
                 AND public.user_can_access_company(auth.uid(), p.company_id)));

-- 5) Backfill: cada pedido legacy vira 1 pedido_item
INSERT INTO pedido_itens (
  pedido_id, item_compra_id, qtd, valor_unitario_real, valor_total_real,
  qtd_recebida, casas_lote, ordem
)
SELECT
  p.id,
  p.item_compra_id,
  GREATEST(COALESCE(p.qtd_lote, 1), 0.001) AS qtd,
  COALESCE(
    p.valor_unitario_real,
    CASE WHEN p.qtd_lote IS NOT NULL AND p.qtd_lote > 0
         THEN p.valor_total_real / p.qtd_lote ELSE 0 END,
    0
  ),
  COALESCE(
    p.valor_total_real,
    p.valor_unitario_real * COALESCE(p.qtd_lote, 1),
    0
  ),
  CASE WHEN p.status IN ('entregue','parcialmente_pago','pago')
       THEN GREATEST(COALESCE(p.qtd_lote, 1), 0.001)
       ELSE 0 END,
  p.casas_lote::numeric,
  1
FROM pedidos p
WHERE NOT EXISTS (SELECT 1 FROM pedido_itens pi WHERE pi.pedido_id = p.id);

-- 6) Trigger: deriva status do pedido a partir de SUM(qtd_recebida) vs SUM(qtd)
-- Estados terminais (cancelado/parcialmente_pago/pago) NÃO são tocados.
-- Permite reversões (consumo zerado volta pra 'planejado').
CREATE OR REPLACE FUNCTION public.fn_recalc_pedido_entrega_status()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_pedido_id uuid;
  v_total_qtd numeric;
  v_total_recebida numeric;
  v_status_atual text;
  v_novo_status text;
BEGIN
  v_pedido_id := COALESCE(NEW.pedido_id, OLD.pedido_id);
  IF v_pedido_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT
    COALESCE(SUM(qtd), 0),
    COALESCE(SUM(qtd_recebida), 0)
  INTO v_total_qtd, v_total_recebida
  FROM pedido_itens WHERE pedido_id = v_pedido_id;

  SELECT status INTO v_status_atual FROM pedidos WHERE id = v_pedido_id;

  IF v_status_atual IN ('cancelado','parcialmente_pago','pago') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_total_qtd > 0 AND v_total_recebida >= v_total_qtd - 0.001 THEN
    v_novo_status := 'entregue';
  ELSIF v_total_recebida > 0.001 THEN
    v_novo_status := 'parcialmente_entregue';
  ELSE
    v_novo_status := CASE WHEN v_status_atual = 'pedido_enviado' THEN 'pedido_enviado' ELSE 'planejado' END;
  END IF;

  IF v_novo_status != v_status_atual THEN
    UPDATE pedidos SET status = v_novo_status WHERE id = v_pedido_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_pedido_itens_recalc_status ON pedido_itens;
CREATE TRIGGER trg_pedido_itens_recalc_status
AFTER INSERT OR UPDATE OF qtd_recebida, qtd OR DELETE ON pedido_itens
FOR EACH ROW EXECUTE FUNCTION fn_recalc_pedido_entrega_status();

-- 7) Trigger: mantém pedidos.valor_total_real = SUM(pedido_itens.valor_total_real)
CREATE OR REPLACE FUNCTION public.fn_sync_pedido_valor_total()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_pedido_id uuid;
  v_sum numeric;
BEGIN
  v_pedido_id := COALESCE(NEW.pedido_id, OLD.pedido_id);
  IF v_pedido_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COALESCE(SUM(valor_total_real), 0) INTO v_sum
  FROM pedido_itens WHERE pedido_id = v_pedido_id;

  UPDATE pedidos SET valor_total_real = v_sum WHERE id = v_pedido_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_pedido_itens_sync_valor ON pedido_itens;
CREATE TRIGGER trg_pedido_itens_sync_valor
AFTER INSERT OR UPDATE OF valor_total_real OR DELETE ON pedido_itens
FOR EACH ROW EXECUTE FUNCTION fn_sync_pedido_valor_total();
