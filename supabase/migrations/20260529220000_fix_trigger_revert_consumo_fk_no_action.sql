-- Fix: fn_recepcao_doc_revert_consumo falhava com FK violation (409) ao tentar
-- deletar parcelas do âncora que tinham movimentacoes_bancarias linkadas
-- (ON DELETE NO ACTION) e pedidos âncora com classificacoes_ia (ON DELETE NO ACTION).
-- Solução: NULL-out ambas as referências antes de deletar.

CREATE OR REPLACE FUNCTION public.fn_recepcao_doc_revert_consumo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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

  -- 1.5) Apagar parcelas de saldo geradas pelo aplicar() para os pedidos consumidos.
  DELETE FROM parcelas
  WHERE id IN (
    SELECT unnest(parcelas_regeradas_ids)
    FROM recepcao_consumos
    WHERE doc_id = OLD.id
      AND parcelas_regeradas_ids IS NOT NULL
      AND array_length(parcelas_regeradas_ids, 1) > 0
  );

  -- 2) Restaurar parcelas apagadas dos pedidos consumidos (snapshot por NF).
  -- Pula silenciosamente se o pedido_id do snapshot já não existe.
  FOR s IN
    SELECT jsonb_array_elements(parcelas_snapshot) AS p
    FROM recepcao_consumos
    WHERE doc_id = OLD.id AND parcelas_snapshot IS NOT NULL
  LOOP
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM pedidos WHERE id = (s.p->>'pedido_id')::uuid
    );

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
    -- 3a) Deslinkar movimentacoes_bancarias das parcelas do âncora antes de deletar
    --     (FK ON DELETE NO ACTION — bloqueia sem este UPDATE).
    UPDATE movimentacoes_bancarias
    SET parcela_id = NULL
    WHERE parcela_id IN (
      SELECT id FROM parcelas WHERE pedido_id = ANY(v_ancora_ids)
    );

    -- 3b) Apagar parcelas dos pedidos âncora
    DELETE FROM parcelas WHERE pedido_id = ANY(v_ancora_ids);

    -- 3c) Deslinkar classificacoes_ia do pedido âncora antes de deletar
    --     (FK ON DELETE NO ACTION — bloqueia sem este UPDATE).
    UPDATE classificacoes_ia
    SET pedido_proposto_id = NULL
    WHERE pedido_proposto_id = ANY(v_ancora_ids);

    -- 4) Apagar TODAS as linhas de recepcao_consumos deste doc ANTES do DELETE do
    --    pedido âncora — evita check_violation (pedido_item_id=NULL, created_pedido_id=NULL)
    --    em dados legados onde consumos referenciam itens do próprio âncora.
    DELETE FROM recepcao_consumos WHERE doc_id = OLD.id;

    -- 5) Apagar o pedido âncora
    DELETE FROM pedidos WHERE id = ANY(v_ancora_ids);
  END IF;

  RETURN OLD;
END;
$$;
