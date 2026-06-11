-- Acordos de renegociação: N parcelas originais (de NFs/pedidos/despesas distintos)
-- são substituídas no CAIXA por um plano novo de pagamento, sem perder o rastro.
--
-- Modelo:
--   - `acordos`           — cabeçalho do plano (fornecedor, total, status)
--   - `acordo_origens`    — quais parcelas originais entraram e com qual saldo
--   - `parcelas.acordo_id`— as NOVAS parcelas do plano vivem na própria tabela
--                           parcelas (conciliáveis e projetáveis como qualquer outra)
--   - parcelas originais  — recebem status='renegociada'; mantêm valor, valor_pago
--                           e conciliações antigas intactos (viram histórico)
--
-- Invariante contábil: Σ acordo_origens.valor_renegociado = Σ parcelas novas do
-- acordo = acordos.valor_total. A Equação A não muda: as originais continuam
-- contando com o valor cheio contra suas origens; as parcelas de acordo ficam
-- FORA da Eq A (são refinanciamento do mesmo plano, não plano novo).

-- ─── 1. Tabela acordos ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acordos (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID          NOT NULL REFERENCES companies(id),
  nome            TEXT          NOT NULL,
  fornecedor_id   UUID          REFERENCES fornecedores(id),
  fornecedor_nome TEXT,
  data_acordo     DATE          NOT NULL DEFAULT current_date,
  valor_total     NUMERIC(14,2) NOT NULL CHECK (valor_total > 0),
  status          TEXT          NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo', 'quitado', 'cancelado')),
  observacoes     TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

-- ─── 2. Tabela acordo_origens (rastro + dados para reversão) ───────────────
CREATE TABLE IF NOT EXISTS public.acordo_origens (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  acordo_id          UUID          NOT NULL REFERENCES public.acordos(id) ON DELETE CASCADE,
  company_id         UUID          NOT NULL REFERENCES companies(id),
  parcela_id         UUID          NOT NULL REFERENCES public.parcelas(id) ON DELETE RESTRICT,
  -- Saldo aberto (valor - valor_pago) no momento do acordo — o que foi levado ao plano
  valor_renegociado  NUMERIC(14,2) NOT NULL CHECK (valor_renegociado > 0),
  status_anterior    TEXT          NOT NULL,
  snapshot           JSONB,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ─── 3. FK em parcelas: parcelas NOVAS do plano apontam pro acordo ─────────
ALTER TABLE public.parcelas
  ADD COLUMN IF NOT EXISTS acordo_id UUID REFERENCES public.acordos(id);

CREATE INDEX IF NOT EXISTS idx_parcelas_acordo        ON public.parcelas(acordo_id) WHERE acordo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_acordos_company        ON public.acordos(company_id);
CREATE INDEX IF NOT EXISTS idx_acordo_origens_acordo  ON public.acordo_origens(acordo_id);
CREATE INDEX IF NOT EXISTS idx_acordo_origens_parcela ON public.acordo_origens(parcela_id);

-- ─── 4. RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.acordos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acordo_origens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS acordos_select ON public.acordos;
DROP POLICY IF EXISTS acordos_insert ON public.acordos;
DROP POLICY IF EXISTS acordos_update ON public.acordos;
DROP POLICY IF EXISTS acordos_delete ON public.acordos;
CREATE POLICY acordos_select ON public.acordos FOR SELECT TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY acordos_insert ON public.acordos FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY acordos_update ON public.acordos FOR UPDATE TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id))
  WITH CHECK (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY acordos_delete ON public.acordos FOR DELETE TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));

DROP POLICY IF EXISTS acordo_origens_select ON public.acordo_origens;
DROP POLICY IF EXISTS acordo_origens_insert ON public.acordo_origens;
DROP POLICY IF EXISTS acordo_origens_update ON public.acordo_origens;
DROP POLICY IF EXISTS acordo_origens_delete ON public.acordo_origens;
CREATE POLICY acordo_origens_select ON public.acordo_origens FOR SELECT TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY acordo_origens_insert ON public.acordo_origens FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY acordo_origens_update ON public.acordo_origens FOR UPDATE TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id))
  WITH CHECK (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY acordo_origens_delete ON public.acordo_origens FOR DELETE TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));

-- ─── 5. Trigger valor_pago: preservar status 'renegociada' ────────────────
-- O recálculo automático sobrescrevia o status pra vencida/a_vencer quando uma
-- conciliação antiga da parcela original era tocada. Parcela renegociada só sai
-- desse status via cancelar_acordo().
CREATE OR REPLACE FUNCTION _recalc_parcela_valor_pago(ids uuid[]) RETURNS void AS $$
BEGIN
  -- 1) Parcelas com pelo menos um vínculo confirmado: valor_pago = soma dos vínculos
  UPDATE parcelas p
  SET valor_pago = s.soma_links,
      status = CASE
        WHEN p.status = 'renegociada' THEN 'renegociada'
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
      status = CASE
        WHEN p.status = 'renegociada' THEN 'renegociada'
        WHEN p.data_vencimento < current_date THEN 'vencida'
        ELSE 'a_vencer'
      END,
      data_pagamento_real = NULL
  WHERE p.id = ANY(ids)
    AND NOT EXISTS (
      SELECT 1 FROM conciliacao_parcelas cp
      JOIN conciliacoes c ON c.id = cp.conciliacao_id
      WHERE cp.parcela_id = p.id AND c.status = 'confirmado'
    );
END;
$$ LANGUAGE plpgsql;

-- ─── 6. Trigger: acordo vira 'quitado' quando todas as parcelas pagarem ────
CREATE OR REPLACE FUNCTION public.fn_recalc_acordo_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE
  v_acordo_id uuid;
  v_abertas   integer;
BEGIN
  v_acordo_id := COALESCE(NEW.acordo_id, OLD.acordo_id);
  IF v_acordo_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COUNT(*) INTO v_abertas
  FROM parcelas
  WHERE acordo_id = v_acordo_id AND deleted_at IS NULL AND status != 'paga';

  UPDATE acordos
  SET status = CASE WHEN v_abertas = 0 THEN 'quitado' ELSE 'ativo' END,
      updated_at = now()
  WHERE id = v_acordo_id AND status != 'cancelado';

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_parcela_recalc_acordo_status ON public.parcelas;
CREATE TRIGGER trg_parcela_recalc_acordo_status
  AFTER UPDATE OF valor_pago, status, deleted_at ON public.parcelas
  FOR EACH ROW
  WHEN (NEW.acordo_id IS NOT NULL OR OLD.acordo_id IS NOT NULL)
  EXECUTE FUNCTION public.fn_recalc_acordo_status();

-- ─── 7. RPC criar_acordo ───────────────────────────────────────────────────
-- p_cronograma: JSONB array de {valor, data_vencimento} (uma entrada por parcela nova).
-- Validações: parcelas vivas, mesma empresa, não pagas, não renegociadas, não são
-- de outro acordo; Σ cronograma = Σ saldos abertos (tolerância R$ 0,05).
CREATE OR REPLACE FUNCTION public.criar_acordo(
  p_company_id  uuid,
  p_nome        text,
  p_parcela_ids uuid[],
  p_cronograma  jsonb,
  p_fornecedor_nome text DEFAULT NULL,
  p_fornecedor_id   uuid DEFAULT NULL,
  p_observacoes     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE
  v_acordo_id    uuid;
  v_saldo_total  numeric := 0;
  v_total_cron   numeric := 0;
  v_n_cron       integer;
  v_count        integer;
  v_rec          record;
  v_item         jsonb;
  v_i            integer := 0;
  v_valor        numeric;
  v_venc         date;
BEGIN
  IF NOT public.user_can_access_company(auth.uid(), p_company_id) THEN
    RAISE EXCEPTION 'Sem acesso à empresa';
  END IF;
  IF p_parcela_ids IS NULL OR array_length(p_parcela_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Nenhuma parcela selecionada';
  END IF;
  IF p_cronograma IS NULL OR jsonb_typeof(p_cronograma) != 'array' OR jsonb_array_length(p_cronograma) = 0 THEN
    RAISE EXCEPTION 'Cronograma vazio ou inválido';
  END IF;

  -- Trava as parcelas e valida elegibilidade
  SELECT COUNT(*) INTO v_count
  FROM parcelas
  WHERE id = ANY(p_parcela_ids)
    AND company_id = p_company_id
    AND deleted_at IS NULL
  FOR UPDATE;
  IF v_count != array_length(p_parcela_ids, 1) THEN
    RAISE EXCEPTION 'Parcela inexistente, excluída ou de outra empresa na seleção';
  END IF;

  FOR v_rec IN
    SELECT id, valor, COALESCE(valor_pago, 0) AS valor_pago, status, acordo_id
    FROM parcelas WHERE id = ANY(p_parcela_ids)
  LOOP
    IF v_rec.status = 'paga' THEN
      RAISE EXCEPTION 'Parcela % já está paga — não pode ser renegociada', v_rec.id;
    END IF;
    IF v_rec.status = 'renegociada' THEN
      RAISE EXCEPTION 'Parcela % já foi renegociada em outro acordo', v_rec.id;
    END IF;
    IF v_rec.acordo_id IS NOT NULL THEN
      RAISE EXCEPTION 'Parcela % pertence a um acordo — cancele o acordo antes de renegociar de novo', v_rec.id;
    END IF;
    IF v_rec.valor - v_rec.valor_pago <= 0.005 THEN
      RAISE EXCEPTION 'Parcela % sem saldo aberto', v_rec.id;
    END IF;
    v_saldo_total := v_saldo_total + (v_rec.valor - v_rec.valor_pago);
  END LOOP;

  -- Valida cronograma
  v_n_cron := jsonb_array_length(p_cronograma);
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_cronograma) LOOP
    v_valor := (v_item->>'valor')::numeric;
    v_venc  := (v_item->>'data_vencimento')::date;
    IF v_valor IS NULL OR v_valor <= 0 THEN
      RAISE EXCEPTION 'Cronograma com parcela de valor inválido';
    END IF;
    IF v_venc IS NULL THEN
      RAISE EXCEPTION 'Cronograma com parcela sem data de vencimento';
    END IF;
    v_total_cron := v_total_cron + v_valor;
  END LOOP;
  IF abs(v_total_cron - v_saldo_total) > 0.05 THEN
    RAISE EXCEPTION 'Σ cronograma (%) difere do saldo renegociado (%) — ajuste os valores',
      to_char(v_total_cron, 'FM999G999G990D00'), to_char(v_saldo_total, 'FM999G999G990D00');
  END IF;

  -- Cabeçalho
  INSERT INTO acordos (company_id, nome, fornecedor_id, fornecedor_nome, valor_total, observacoes)
  VALUES (p_company_id, p_nome, p_fornecedor_id, p_fornecedor_nome, v_saldo_total, p_observacoes)
  RETURNING id INTO v_acordo_id;

  -- Origens (rastro + snapshot para reversão)
  INSERT INTO acordo_origens (acordo_id, company_id, parcela_id, valor_renegociado, status_anterior, snapshot)
  SELECT v_acordo_id, p_company_id, p.id, p.valor - COALESCE(p.valor_pago, 0), p.status, to_jsonb(p)
  FROM parcelas p WHERE p.id = ANY(p_parcela_ids);

  -- Originais saem do caixa projetado
  UPDATE parcelas SET status = 'renegociada' WHERE id = ANY(p_parcela_ids);

  -- Parcelas novas do plano
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_cronograma) LOOP
    v_i := v_i + 1;
    v_valor := (v_item->>'valor')::numeric;
    v_venc  := (v_item->>'data_vencimento')::date;
    INSERT INTO parcelas (
      company_id, acordo_id, numero_parcela, valor, data_vencimento,
      valor_pago, status, tipo, descricao
    ) VALUES (
      p_company_id, v_acordo_id, v_i, v_valor, v_venc,
      0,
      CASE
        WHEN v_venc < current_date THEN 'vencida'
        WHEN v_venc <= current_date + 30 THEN 'a_vencer'
        ELSE 'futura'
      END,
      'contratual',
      'Acordo: ' || p_nome || ' (' || v_i || '/' || v_n_cron || ')'
    );
  END LOOP;

  INSERT INTO audit_logs (user_id, company_id, tabela, registro_id, acao, agente, dados_depois)
  VALUES (
    auth.uid(), p_company_id, 'acordos', v_acordo_id, 'INSERT', 'humano',
    jsonb_build_object(
      'operacao', 'criar_acordo',
      'nome', p_nome,
      'parcelas_renegociadas', p_parcela_ids,
      'valor_total', v_saldo_total,
      'parcelas_novas', v_n_cron
    )
  );

  RETURN jsonb_build_object(
    'acordo_id', v_acordo_id,
    'valor_total', v_saldo_total,
    'parcelas_renegociadas', array_length(p_parcela_ids, 1),
    'parcelas_criadas', v_n_cron
  );
END;
$$;

-- ─── 8. RPC cancelar_acordo ────────────────────────────────────────────────
-- Só permitido enquanto nenhuma parcela do plano recebeu pagamento. Restaura o
-- status das originais (recalculado por data/valor_pago) e soft-deleta as
-- parcelas do plano.
CREATE OR REPLACE FUNCTION public.cancelar_acordo(p_acordo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE
  v_acordo     record;
  v_pagas      integer;
  v_links      integer;
  v_restauradas integer;
BEGIN
  SELECT * INTO v_acordo FROM acordos
  WHERE id = p_acordo_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acordo não encontrado'; END IF;
  IF NOT public.user_can_access_company(auth.uid(), v_acordo.company_id) THEN
    RAISE EXCEPTION 'Sem acesso à empresa';
  END IF;
  IF v_acordo.status = 'cancelado' THEN
    RAISE EXCEPTION 'Acordo já está cancelado';
  END IF;

  SELECT COUNT(*) INTO v_pagas
  FROM parcelas
  WHERE acordo_id = p_acordo_id AND deleted_at IS NULL AND COALESCE(valor_pago, 0) > 0.005;
  IF v_pagas > 0 THEN
    RAISE EXCEPTION 'Acordo tem % parcela(s) com pagamento registrado — estorne as baixas antes de cancelar', v_pagas;
  END IF;
  SELECT COUNT(*) INTO v_links
  FROM conciliacao_parcelas cp
  JOIN conciliacoes c ON c.id = cp.conciliacao_id AND c.status IN ('confirmado', 'aprovado')
  JOIN parcelas p ON p.id = cp.parcela_id
  WHERE p.acordo_id = p_acordo_id;
  IF v_links > 0 THEN
    RAISE EXCEPTION 'Acordo tem conciliação bancária confirmada — desfaça os vínculos antes de cancelar';
  END IF;

  -- Remove sugestões pendentes de conciliação apontando pras parcelas do plano
  DELETE FROM conciliacao_parcelas cp
  USING parcelas p
  WHERE cp.parcela_id = p.id AND p.acordo_id = p_acordo_id;

  -- Soft-delete das parcelas do plano
  UPDATE parcelas SET deleted_at = now()
  WHERE acordo_id = p_acordo_id AND deleted_at IS NULL;

  -- Restaura as originais (status recalculado pelo estado atual)
  UPDATE parcelas p
  SET status = CASE
    WHEN COALESCE(p.valor_pago, 0) >= p.valor - 0.005 THEN 'paga'
    WHEN COALESCE(p.valor_pago, 0) > 0.005 THEN 'parcialmente_paga'
    WHEN p.data_vencimento < current_date THEN 'vencida'
    ELSE 'a_vencer'
  END
  FROM acordo_origens ao
  WHERE ao.acordo_id = p_acordo_id AND ao.parcela_id = p.id AND p.status = 'renegociada';
  GET DIAGNOSTICS v_restauradas = ROW_COUNT;

  UPDATE acordos SET status = 'cancelado', updated_at = now() WHERE id = p_acordo_id;

  INSERT INTO audit_logs (user_id, company_id, tabela, registro_id, acao, agente, dados_antes, dados_depois)
  VALUES (
    auth.uid(), v_acordo.company_id, 'acordos', p_acordo_id, 'UPDATE', 'humano',
    jsonb_build_object('status', v_acordo.status, 'valor_total', v_acordo.valor_total),
    jsonb_build_object('operacao', 'cancelar_acordo', 'status', 'cancelado', 'parcelas_restauradas', v_restauradas)
  );

  RETURN jsonb_build_object('acordo_id', p_acordo_id, 'parcelas_restauradas', v_restauradas);
END;
$$;

-- ─── 9. vw_planejado_aberto: renegociada não é mais "saldo em aberto" ──────
-- O saldo dela vive nas parcelas do acordo (que já entram pela própria query
-- de parcelas). Recria só o primeiro braço da UNION com o filtro novo.
DROP VIEW IF EXISTS public.vw_planejado_aberto CASCADE;
CREATE VIEW public.vw_planejado_aberto
WITH (security_invoker = on) AS
SELECT
  p.company_id,
  'parcela'::text                                                          AS origem_tipo,
  p.id                                                                     AS origem_id,
  COALESCE(
    NULLIF('Pedido #' || ped.numero_pedido::text || ' - Parc ' || p.numero_parcela::text, 'Pedido # - Parc '),
    p.descricao,
    'Parcela ' || p.numero_parcela::text
  )                                                                        AS descricao,
  COALESCE(forn.nome, ac.fornecedor_nome)                                  AS contraparte_nome,
  ped.numero_pedido                                                        AS pedido_numero,
  p.numero_parcela,
  p.tipo                                                                   AS subtipo,
  p.status,
  COALESCE(p.data_prevista_pagamento, p.data_vencimento)                   AS data_prevista,
  p.data_vencimento,
  p.valor                                                                  AS valor_total,
  COALESCE(p.valor_pago, 0)                                                AS valor_realizado,
  (p.valor - COALESCE(p.valor_pago, 0))                                    AS saldo_aberto,
  (CURRENT_DATE - p.data_vencimento)                                       AS dias_atraso
FROM public.parcelas p
LEFT JOIN public.pedidos ped       ON ped.id = p.pedido_id
LEFT JOIN public.fornecedores forn ON forn.id = ped.fornecedor_id
LEFT JOIN public.acordos ac        ON ac.id = p.acordo_id
WHERE p.deleted_at IS NULL
  AND p.status != 'renegociada'
  AND (p.valor - COALESCE(p.valor_pago, 0)) > 0.01

UNION ALL

SELECT
  med.company_id,
  'medicao'::text                                                          AS origem_tipo,
  med.id                                                                   AS origem_id,
  'Medição ' || med.numero::text                                           AS descricao,
  NULL::text                                                               AS contraparte_nome,
  NULL::integer                                                            AS pedido_numero,
  med.numero                                                               AS numero_parcela,
  NULL::text                                                               AS subtipo,
  med.status,
  med.data_prevista,
  NULL::date                                                               AS data_vencimento,
  COALESCE(med.valor_planejado, 0)                                         AS valor_total,
  COALESCE(med.valor_liberado, 0)                                          AS valor_realizado,
  (COALESCE(med.valor_planejado, 0) - COALESCE(med.valor_liberado, 0))     AS saldo_aberto,
  CASE WHEN med.data_prevista IS NOT NULL
       THEN (CURRENT_DATE - med.data_prevista)
       ELSE NULL END                                                       AS dias_atraso
FROM public.medicoes med
WHERE (COALESCE(med.valor_planejado, 0) - COALESCE(med.valor_liberado, 0)) > 0.01

UNION ALL

SELECT
  mp.company_id,
  'mutuo_parcela'::text                                                    AS origem_tipo,
  mp.id                                                                    AS origem_id,
  'Mútuo ' || mut.nome || ' - Parc ' || mp.numero_parcela::text            AS descricao,
  forn.nome                                                                AS contraparte_nome,
  NULL::integer                                                            AS pedido_numero,
  mp.numero_parcela,
  mut.tipo                                                                 AS subtipo,
  mp.status,
  mp.data_vencimento                                                       AS data_prevista,
  mp.data_vencimento,
  mp.valor                                                                 AS valor_total,
  COALESCE(mp.valor_pago, 0)                                               AS valor_realizado,
  (mp.valor - COALESCE(mp.valor_pago, 0))                                  AS saldo_aberto,
  (CURRENT_DATE - mp.data_vencimento)                                      AS dias_atraso
FROM public.mutuo_parcelas mp
JOIN public.mutuos mut             ON mut.id  = mp.mutuo_id
LEFT JOIN public.fornecedores forn ON forn.id = mut.fornecedor_id
WHERE (mp.valor - COALESCE(mp.valor_pago, 0)) > 0.01;
