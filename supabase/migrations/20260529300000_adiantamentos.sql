-- Tabela adiantamentos: pagamentos antecipados a fornecedores vinculados a pedidos.
-- Fronteira clara com mutuos: adiantamento SEMPRE tem pedido_id (pedido já existe).
-- Mútuo é instrumento financeiro independente (sem pedido_id).

-- ─── 1. Tabela adiantamentos ───────────────────────────────────────────────
CREATE TABLE public.adiantamentos (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               UUID        NOT NULL REFERENCES companies(id),
  pedido_id                UUID        NOT NULL REFERENCES pedidos(id) ON DELETE RESTRICT,
  fornecedor_id            UUID        REFERENCES fornecedores(id),
  valor                    NUMERIC(14,2) NOT NULL CHECK (valor > 0),
  data_pagamento           DATE,
  data_prevista_abatimento DATE,
  valor_abatido            NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (valor_abatido >= 0),
  status                   TEXT        NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'parcialmente_abatido', 'abatido')),
  conta_bancaria_id        UUID        REFERENCES contas_bancarias(id),
  forma_pagamento          TEXT,
  observacao               TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at               TIMESTAMPTZ
);

-- ─── 2. RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.adiantamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY adiantamentos_select ON public.adiantamentos FOR SELECT TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY adiantamentos_insert ON public.adiantamentos FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY adiantamentos_update ON public.adiantamentos FOR UPDATE TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id))
  WITH CHECK (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY adiantamentos_delete ON public.adiantamentos FOR DELETE TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));

-- ─── 3. Trigger: recalcula status a partir de valor_abatido ───────────────
CREATE OR REPLACE FUNCTION public.fn_recalc_adiantamento_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.valor_abatido >= NEW.valor - 0.01 THEN
    NEW.status := 'abatido';
  ELSIF NEW.valor_abatido > 0 THEN
    NEW.status := 'parcialmente_abatido';
  ELSE
    NEW.status := 'pendente';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_adiantamento_recalc_status
  BEFORE UPDATE OF valor_abatido ON public.adiantamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_recalc_adiantamento_status();

CREATE TRIGGER trg_adiantamento_updated_at
  BEFORE UPDATE ON public.adiantamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_recalc_adiantamento_status();

-- ─── 4. FK em conciliacao_parcelas ────────────────────────────────────────
-- Permite vincular uma movimentação bancária diretamente a um adiantamento
-- (saída de caixa para pagar adiantamento ao fornecedor).
ALTER TABLE public.conciliacao_parcelas
  ADD COLUMN IF NOT EXISTS adiantamento_id UUID
    REFERENCES public.adiantamentos(id) ON DELETE CASCADE;

-- ─── 5. Índices ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_adiantamentos_company   ON public.adiantamentos(company_id);
CREATE INDEX IF NOT EXISTS idx_adiantamentos_pedido    ON public.adiantamentos(pedido_id);
CREATE INDEX IF NOT EXISTS idx_adiantamentos_fornecedor ON public.adiantamentos(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_adiantamentos_status    ON public.adiantamentos(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conciliacao_parcelas_adiantamento ON public.conciliacao_parcelas(adiantamento_id) WHERE adiantamento_id IS NOT NULL;
