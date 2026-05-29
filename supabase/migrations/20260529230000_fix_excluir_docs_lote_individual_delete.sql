-- Fix: excluir_recepcao_docs_lote usava DELETE WHERE id = ANY(...) — uma única
-- instrução batch. O FK pedidos.nf_origem_id ON DELETE SET NULL + o trigger BEFORE
-- DELETE se sobrepunham de forma imprevisível quando vários docs compartilhavam
-- pedidos consumidos, causando "insert or update on pedidos violates pedidos_nf_origem_id_fkey".
--
-- Solução: deletar um doc por vez (como excluir_recepcao_doc faz), dentro de um
-- subtransaction via EXCEPTION, para isolar falhas. Um doc com erro não cancela
-- os demais — o resultado reporta quantos foram estornados e quais falharam.

CREATE OR REPLACE FUNCTION public.excluir_recepcao_docs_lote(
  p_company_id uuid,
  p_doc_ids    uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_doc_id     uuid;
  v_estornados int := 0;
  v_erros      text[] := '{}'::text[];
BEGIN
  IF NOT public.user_can_access_company(auth.uid(), p_company_id) THEN
    RAISE EXCEPTION 'Acesso negado à company %', p_company_id;
  END IF;

  IF array_length(p_doc_ids, 1) IS NULL OR array_length(p_doc_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Nenhum doc_id fornecido';
  END IF;

  -- Deleta um por vez: cada DELETE aciona o trigger BEFORE DELETE de forma
  -- completamente isolada, evitando interleaving de FK SET NULL entre docs.
  FOREACH v_doc_id IN ARRAY p_doc_ids LOOP
    BEGIN
      DELETE FROM recepcao_docs
      WHERE id = v_doc_id AND company_id = p_company_id;

      IF FOUND THEN
        v_estornados := v_estornados + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_erros := array_append(v_erros,
        format('doc %s: %s', v_doc_id, SQLERRM));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'estornados', v_estornados,
    'erros',      to_jsonb(v_erros)
  );
END;
$$;
