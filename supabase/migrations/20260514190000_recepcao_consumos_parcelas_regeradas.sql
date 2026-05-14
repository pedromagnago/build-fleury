-- ============================================================================
-- recepcao_consumos_parcelas_regeradas
--
-- Quando a NF consome PARCIALMENTE um pedido (cobre só parte da qtd), o saldo
-- restante do pedido precisa continuar tendo parcelas — proporcionais ao
-- valor que ainda vai ser pago. O app passou a gerar essas parcelas extras
-- ("Saldo após consumo NF X") no pedido consumido.
--
-- Essa coluna registra os IDs dessas parcelas regeradas pra que o trigger
-- BEFORE DELETE em recepcao_docs apague elas ao excluir a NF — caso contrário
-- a reversão restauraria as originais via snapshot SEM apagar as regeradas,
-- deixando o pedido com DOBRO de parcelas.
-- ============================================================================

ALTER TABLE recepcao_consumos
  ADD COLUMN IF NOT EXISTS parcelas_regeradas_ids uuid[] DEFAULT '{}'::uuid[];

COMMENT ON COLUMN recepcao_consumos.parcelas_regeradas_ids IS
  'IDs das parcelas que o aplicar() gerou no pedido consumido pra cobrir o '
  'saldo (valor_total_real − valor_consumido_pela_nf). O trigger BEFORE DELETE '
  'apaga essas parcelas antes de restaurar o snapshot das originais.';

CREATE OR REPLACE FUNCTION public.fn_recepcao_doc_revert_consumo()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  r record;
  s record;
BEGIN
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
  -- Tem que vir ANTES da restauração do snapshot pra não deixar dobra.
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

  -- 3) Apagar parcelas e pedidos criados pela NF (pedido âncora)
  DELETE FROM parcelas
  WHERE pedido_id IN (
    SELECT created_pedido_id FROM recepcao_consumos
    WHERE doc_id = OLD.id AND created_pedido_id IS NOT NULL
  );

  DELETE FROM pedidos
  WHERE id IN (
    SELECT created_pedido_id FROM recepcao_consumos
    WHERE doc_id = OLD.id AND created_pedido_id IS NOT NULL
  );

  RETURN OLD;
END;
$$;
