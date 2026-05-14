-- ============================================================================
-- fix_revert_consumo_check_violation
--
-- Bug encontrado em 2026-05-14: ao tentar excluir NF, o trigger
-- fn_recepcao_doc_revert_consumo falhava com:
--   "new row for relation 'recepcao_consumos' violates check constraint
--    'recepcao_consumos_check'"
--
-- Causa: o trigger fazia DELETE FROM pedidos no final. O FK em
-- recepcao_consumos.created_pedido_id é ON DELETE SET NULL — ao setar NULL,
-- a linha do âncora ficava com (pedido_item_id=NULL, created_pedido_id=NULL),
-- violando o CHECK que exige pelo menos um NOT NULL.
--
-- Fix:
--   - Captura IDs do(s) pedido(s) âncora em variável array ANTES de qualquer
--     operação destrutiva (a versão anterior tentou usar nf_origem_id mas isso
--     também aponta pros pedidos CONSUMIDOS — apagaria pedido errado).
--   - Apaga as linhas de recepcao_consumos do âncora ANTES do DELETE em pedidos,
--     evitando a transição (X, NULL) → (NULL, NULL) que viola o CHECK.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_recepcao_doc_revert_consumo()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  r record;
  s record;
  v_ancora_ids uuid[];
BEGIN
  -- 0) Captura IDs do(s) pedido(s) âncora ANTES de qualquer operação destrutiva.
  SELECT array_agg(created_pedido_id) INTO v_ancora_ids
  FROM recepcao_consumos
  WHERE doc_id = OLD.id AND created_pedido_id IS NOT NULL;

  -- 1) Reverter qtd_recebida nos pedido_itens existentes
  FOR r IN
    SELECT pedido_item_id, delta_qtd_recebida
    FROM recepcao_consumos
    WHERE doc_id = OLD.id AND pedido_item_id IS NOT NULL AND delta_qtd_recebida > 0
  LOOP
    UPDATE pedido_itens
    SET qtd_recebida = GREATEST(qtd_recebida - r.delta_qtd_recebida, 0)
    WHERE id = r.pedido_item_id;
  END LOOP;

  -- 1.5) Apagar parcelas que o aplicar() gerou no pedido consumido pra cobrir o saldo.
  DELETE FROM parcelas
  WHERE id IN (
    SELECT unnest(parcelas_regeradas_ids)
    FROM recepcao_consumos
    WHERE doc_id = OLD.id
      AND parcelas_regeradas_ids IS NOT NULL
      AND array_length(parcelas_regeradas_ids, 1) > 0
  );

  -- 2) Restaurar parcelas apagadas dos pedidos consumidos (snapshot por NF)
  FOR s IN
    SELECT jsonb_array_elements(parcelas_snapshot) AS p
    FROM recepcao_consumos
    WHERE doc_id = OLD.id AND parcelas_snapshot IS NOT NULL
  LOOP
    INSERT INTO parcelas (
      id, company_id, pedido_id, numero_parcela, valor, data_vencimento,
      status, descricao, tipo, created_at
    ) VALUES (
      COALESCE((s.p->>'id')::uuid, gen_random_uuid()),
      (s.p->>'company_id')::uuid,
      (s.p->>'pedido_id')::uuid,
      NULLIF(s.p->>'numero_parcela', '')::int,
      (s.p->>'valor')::numeric,
      (s.p->>'data_vencimento')::date,
      COALESCE(s.p->>'status', 'futura'),
      s.p->>'descricao',
      COALESCE(s.p->>'tipo', 'contratual'),
      COALESCE((s.p->>'created_at')::timestamptz, now())
    ) ON CONFLICT (id) DO NOTHING;
  END LOOP;

  IF v_ancora_ids IS NOT NULL AND array_length(v_ancora_ids, 1) > 0 THEN
    -- 3) Apagar parcelas dos pedidos âncora
    DELETE FROM parcelas WHERE pedido_id = ANY(v_ancora_ids);

    -- 4) Apagar as linhas de recepcao_consumos do âncora ANTES do DELETE do pedido.
    -- Sem isso o FK ON DELETE SET NULL deixaria (pedido_item_id, created_pedido_id)
    -- = (NULL, NULL) e violaria recepcao_consumos_check.
    DELETE FROM recepcao_consumos
    WHERE doc_id = OLD.id AND created_pedido_id IS NOT NULL;

    -- 5) Apagar o pedido âncora (usando IDs capturados na etapa 0)
    DELETE FROM pedidos WHERE id = ANY(v_ancora_ids);
  END IF;

  RETURN OLD;
END;
$$;
