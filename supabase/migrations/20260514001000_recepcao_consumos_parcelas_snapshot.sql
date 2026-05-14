-- ============================================================================
-- recepcao_consumos_parcelas_snapshot
--
-- Adiciona snapshot das parcelas APAGADAS pelo aplicar() (parcelas futuras
-- dos pedidos consumidos), pra que o trigger BEFORE DELETE possa RESTAURÁ-LAS
-- ao excluir a NF — fechando o ciclo de reversão completa.
--
-- Sem isso, importar→excluir uma NF que consumiu pedidos planejados deixava
-- o valor dos pedidos sem parcelas (bug encontrado em 2026-05-13 com NF
-- #000.003.003 BRUNO MARKLEWSKI · 6 pedidos planejados ficaram sem parcelas).
-- ============================================================================

ALTER TABLE recepcao_consumos
  ADD COLUMN IF NOT EXISTS parcelas_snapshot jsonb;

COMMENT ON COLUMN recepcao_consumos.parcelas_snapshot IS
  'Array de parcelas FUTURAS apagadas pelo aplicar() — usado pelo trigger BEFORE DELETE pra restaurar. Estrutura: [{id?, pedido_id, numero_parcela, valor, data_vencimento, status, descricao, tipo, company_id, created_at}]';

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

  -- 3) Apagar parcelas e pedidos criados pela NF
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
