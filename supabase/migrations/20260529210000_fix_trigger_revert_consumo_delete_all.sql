-- Fix: fn_recepcao_doc_revert_consumo falhava com "recepcao_consumos_check" em dados
-- legados onde a mesma NF tinha linhas de consumo (pedido_item_id IS NOT NULL)
-- apontando para itens do próprio pedido âncora.
--
-- Quando o anchor era deletado, o FK ON DELETE SET NULL zerava pedido_item_id nessas
-- linhas, deixando ambos os campos NULL e violando o check.
--
-- Solução: deletar TODAS as linhas de recepcao_consumos do doc ANTES de apagar o
-- âncora — não só a linha do anchor row. Neste ponto do trigger todos os efeitos
-- já foram revertidos (qtd_recebida, parcelas, snapshot), então é seguro remover.

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
    -- 3) Apagar parcelas dos pedidos âncora
    DELETE FROM parcelas WHERE pedido_id = ANY(v_ancora_ids);

    -- 4) Apagar TODAS as linhas de recepcao_consumos deste doc ANTES do DELETE do
    -- pedido âncora. Isso cobre tanto a linha âncora (created_pedido_id) quanto
    -- linhas de consumo que — por dados legados — possam referenciar itens do
    -- próprio âncora. Sem isso, o FK ON DELETE SET NULL deixaria ambos os campos
    -- NULL, violando recepcao_consumos_check.
    DELETE FROM recepcao_consumos WHERE doc_id = OLD.id;

    -- 5) Apagar o pedido âncora (cascade deleta pedido_itens sem risco de FK em consumos)
    DELETE FROM pedidos WHERE id = ANY(v_ancora_ids);
  END IF;

  RETURN OLD;
END;
$$;
