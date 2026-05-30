-- Tabela medicao_parcelas: espelho de `parcelas` para o lado das entradas.
-- Gerada automaticamente quando uma medição muda para 'liberada'.
-- Uma medição pode ter N parcelas (ex.: cliente paga em 2x).

-- ─── 1. Tabela medicao_parcelas ───────────────────────────────────────────
CREATE TABLE public.medicao_parcelas (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                UUID        NOT NULL REFERENCES companies(id),
  medicao_id                UUID        NOT NULL REFERENCES medicoes(id) ON DELETE CASCADE,
  numero_parcela            INTEGER     NOT NULL DEFAULT 1,
  valor                     NUMERIC(14,2) NOT NULL CHECK (valor > 0),
  data_vencimento           DATE        NOT NULL,
  data_prevista_recebimento DATE,
  data_recebimento_real     DATE,
  valor_recebido            NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (valor_recebido >= 0),
  status                    TEXT        NOT NULL DEFAULT 'futura'
    CHECK (status IN ('futura', 'a_receber', 'recebida', 'vencida', 'parcialmente_recebida')),
  forma_recebimento         TEXT,
  conta_bancaria_id         UUID        REFERENCES contas_bancarias(id),
  observacao                TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at                TIMESTAMPTZ
);

-- ─── 2. RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.medicao_parcelas ENABLE ROW LEVEL SECURITY;

CREATE POLICY medicao_parcelas_select ON public.medicao_parcelas FOR SELECT TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY medicao_parcelas_insert ON public.medicao_parcelas FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY medicao_parcelas_update ON public.medicao_parcelas FOR UPDATE TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id))
  WITH CHECK (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY medicao_parcelas_delete ON public.medicao_parcelas FOR DELETE TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));

-- ─── 3. FK em conciliacao_parcelas ────────────────────────────────────────
-- Substitui o vínculo direto com medicao_id para o modelo granular de parcelas.
-- Ambas as FKs coexistem durante a transição; medicao_id (legada) permanece.
ALTER TABLE public.conciliacao_parcelas
  ADD COLUMN IF NOT EXISTS medicao_parcela_id UUID
    REFERENCES public.medicao_parcelas(id) ON DELETE CASCADE;

-- ─── 4. Trigger: recalcula status de medicao_parcela ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_recalc_medicao_parcela_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
BEGIN
  -- Status derivado de valor_recebido vs valor e data_vencimento
  IF NEW.valor_recebido >= NEW.valor - 0.01 THEN
    NEW.status := 'recebida';
    -- Só seta data_real se ainda não foi definida manualmente
    IF NEW.data_recebimento_real IS NULL THEN
      NEW.data_recebimento_real := CURRENT_DATE;
    END IF;
  ELSIF NEW.valor_recebido > 0 THEN
    NEW.status := 'parcialmente_recebida';
  ELSIF NEW.data_vencimento < CURRENT_DATE THEN
    NEW.status := 'vencida';
  ELSIF CURRENT_DATE >= NEW.data_vencimento - INTERVAL '7 days' THEN
    NEW.status := 'a_receber';
  ELSE
    NEW.status := 'futura';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_medicao_parcela_recalc_status
  BEFORE UPDATE OF valor_recebido, data_vencimento ON public.medicao_parcelas
  FOR EACH ROW EXECUTE FUNCTION public.fn_recalc_medicao_parcela_status();

-- ─── 5. Trigger: auto-gera parcela ao liberar medição ────────────────────
-- Quando medicao.status muda para 'liberada' com valor_liberado > 0,
-- cria uma medicao_parcela com o valor total e data_vencimento = data_liberacao.
-- Se o recebimento for parcelado, o operador edita manualmente após a criação.
CREATE OR REPLACE FUNCTION public.fn_medicao_liberada_gera_parcela()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
BEGIN
  -- Só age na transição para 'liberada' com valor real
  IF NEW.status = 'liberada' AND (OLD.status IS DISTINCT FROM 'liberada') AND NEW.valor_liberado > 0 THEN
    -- Só gera se ainda não existir nenhuma parcela
    IF NOT EXISTS (
      SELECT 1 FROM medicao_parcelas
      WHERE medicao_id = NEW.id AND deleted_at IS NULL
    ) THEN
      INSERT INTO medicao_parcelas (
        company_id,
        medicao_id,
        numero_parcela,
        valor,
        data_vencimento,
        data_prevista_recebimento,
        status
      ) VALUES (
        NEW.company_id,
        NEW.id,
        1,
        NEW.valor_liberado,
        COALESCE(NEW.data_liberacao, CURRENT_DATE),
        COALESCE(NEW.data_liberacao, CURRENT_DATE),
        CASE
          WHEN COALESCE(NEW.data_liberacao, CURRENT_DATE) < CURRENT_DATE THEN 'vencida'
          WHEN CURRENT_DATE >= COALESCE(NEW.data_liberacao, CURRENT_DATE) - INTERVAL '7 days' THEN 'a_receber'
          ELSE 'futura'
        END
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_medicao_liberada_gera_parcela
  AFTER UPDATE OF status ON public.medicoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_medicao_liberada_gera_parcela();

-- ─── 6. Índices ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_medicao_parcelas_company     ON public.medicao_parcelas(company_id);
CREATE INDEX IF NOT EXISTS idx_medicao_parcelas_medicao     ON public.medicao_parcelas(medicao_id);
CREATE INDEX IF NOT EXISTS idx_medicao_parcelas_status      ON public.medicao_parcelas(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_medicao_parcelas_vencimento  ON public.medicao_parcelas(data_vencimento) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conciliacao_parcelas_med_parc ON public.conciliacao_parcelas(medicao_parcela_id) WHERE medicao_parcela_id IS NOT NULL;

-- ─── 7. Backfill: medições já liberadas/pagas ganham uma parcela ──────────
-- Só cria se não existir nenhuma parcela ainda para aquela medição.
INSERT INTO public.medicao_parcelas (
  company_id, medicao_id, numero_parcela,
  valor, data_vencimento, data_prevista_recebimento,
  valor_recebido, status, data_recebimento_real
)
SELECT
  m.company_id,
  m.id,
  1,
  m.valor_liberado,
  COALESCE(m.data_liberacao, m.data_prevista),
  COALESCE(m.data_liberacao, m.data_prevista),
  -- Para medições pagas, marca como recebido o valor total
  CASE WHEN m.status = 'paga' THEN m.valor_liberado ELSE 0 END,
  CASE
    WHEN m.status = 'paga'                                          THEN 'recebida'
    WHEN COALESCE(m.data_liberacao, m.data_prevista) < CURRENT_DATE THEN 'vencida'
    ELSE 'a_receber'
  END,
  CASE WHEN m.status = 'paga' THEN m.data_liberacao ELSE NULL END
FROM public.medicoes m
WHERE m.status IN ('liberada', 'paga')
  AND m.valor_liberado > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.medicao_parcelas mp
    WHERE mp.medicao_id = m.id AND mp.deleted_at IS NULL
  );
