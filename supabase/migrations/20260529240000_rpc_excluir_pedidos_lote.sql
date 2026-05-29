-- RPC: exclui pedidos em lote aplicando a mesma regra de estorno de NF.
-- Pedidos COM nf_origem_id: estorna a NF completa (reverte consumo de itens,
--   parcelas, pedido âncora) — igual ao excluir_recepcao_doc.
-- Pedidos SEM nf_origem_id: desvincula movimentacoes_bancarias das parcelas
--   (deixa os movimentos do extrato sem conciliação) e deleta tudo diretamente.
-- Um pedido por vez com EXCEPTION isolada — erros individuais não cancelam o lote.
CREATE OR REPLACE FUNCTION public.excluir_pedidos_lote(
  p_company_id uuid,
  p_pedido_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pedido_id   uuid;
  v_nf_id       uuid;
  v_excluidos   int := 0;
  v_erros       text[] := '{}'::text[];
BEGIN
  IF NOT public.user_can_access_company(auth.uid(), p_company_id) THEN
    RAISE EXCEPTION 'Acesso negado à company %', p_company_id;
  END IF;

  IF array_length(p_pedido_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Nenhum pedido_id fornecido';
  END IF;

  FOREACH v_pedido_id IN ARRAY p_pedido_ids LOOP
    BEGIN
      SELECT nf_origem_id INTO v_nf_id
      FROM pedidos
      WHERE id = v_pedido_id AND company_id = p_company_id;

      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      IF v_nf_id IS NOT NULL THEN
        -- Pedido com NF vinculada: estorna via trigger completo
        DELETE FROM recepcao_docs WHERE id = v_nf_id AND company_id = p_company_id;
      ELSE
        -- Pedido manual: desvincula movimentacoes das parcelas (ON DELETE NO ACTION),
        -- deixa os movimentos do extrato sem conciliação para reuso.
        UPDATE movimentacoes_bancarias
        SET parcela_id = NULL
        WHERE parcela_id IN (
          SELECT id FROM parcelas WHERE pedido_id = v_pedido_id
        );

        -- Desvincula classificacoes_ia (ON DELETE NO ACTION)
        UPDATE classificacoes_ia
        SET pedido_proposto_id = NULL
        WHERE pedido_proposto_id = v_pedido_id;

        -- Deleta parcelas (conciliacao_parcelas CASCADE)
        DELETE FROM parcelas WHERE pedido_id = v_pedido_id;

        -- Deleta itens e pedido
        DELETE FROM pedido_itens WHERE pedido_id = v_pedido_id;
        DELETE FROM pedidos WHERE id = v_pedido_id AND company_id = p_company_id;
      END IF;

      v_excluidos := v_excluidos + 1;
    EXCEPTION WHEN OTHERS THEN
      v_erros := array_append(v_erros,
        format('pedido %s: %s', v_pedido_id, SQLERRM));
    END;
  END LOOP;

  RETURN jsonb_build_object('excluidos', v_excluidos, 'erros', to_jsonb(v_erros));
END;
$$;
