-- RPC: estorna múltiplas NFs de uma vez.
-- Deleta cada recepcao_doc validando company_id — o trigger
-- fn_recepcao_doc_revert_consumo (row-level) cuida do cascade em cada linha.
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
  v_estornados int;
BEGIN
  IF NOT public.user_can_access_company(auth.uid(), p_company_id) THEN
    RAISE EXCEPTION 'Acesso negado à company %', p_company_id;
  END IF;

  IF array_length(p_doc_ids, 1) IS NULL OR array_length(p_doc_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Nenhum doc_id fornecido';
  END IF;

  -- O trigger fn_recepcao_doc_revert_consumo (FOR EACH ROW BEFORE DELETE)
  -- reverte qtd_recebida, snapshot, âncora e parcelas para cada linha.
  DELETE FROM recepcao_docs
  WHERE id = ANY(p_doc_ids)
    AND company_id = p_company_id;

  GET DIAGNOSTICS v_estornados = ROW_COUNT;

  RETURN jsonb_build_object('estornados', v_estornados);
END;
$$;
