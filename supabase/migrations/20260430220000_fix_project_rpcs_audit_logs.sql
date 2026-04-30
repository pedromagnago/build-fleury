-- ============================================================================
-- Fix soft_delete_project / restore_project / update_project
--   audit_logs.acao  só aceita 'INSERT' | 'UPDATE' | 'DELETE'
--   audit_logs.agente só aceita 'humano' | 'ia' | 'sistema'
-- As 3 RPCs estavam usando 'soft_delete'/'restore'/'update' e 'user',
-- estourando os check constraints (23514).
-- Aplicada em prod via MCP em 2026-04-30
-- ============================================================================

CREATE OR REPLACE FUNCTION public.soft_delete_project(_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_before jsonb;
BEGIN
  SELECT to_jsonb(c.*) INTO v_before FROM public.companies c WHERE c.id = _id;
  IF v_before IS NULL THEN
    RAISE EXCEPTION 'Projeto % não encontrado', _id;
  END IF;
  IF (v_before->>'deleted_at') IS NOT NULL THEN
    RAISE EXCEPTION 'Projeto % já está arquivado', _id;
  END IF;

  UPDATE public.companies
     SET deleted_at = now(),
         updated_at = now()
   WHERE id = _id;

  INSERT INTO public.audit_logs (company_id, tabela, registro_id, acao, agente, usuario_id, dados_antes, resumo)
  VALUES (_id, 'companies', _id, 'UPDATE', 'humano', auth.uid(), v_before, 'Projeto arquivado (soft delete)');
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_project(_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.companies
     SET deleted_at = NULL,
         updated_at = now()
   WHERE id = _id AND deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Projeto % não encontrado ou não está arquivado', _id;
  END IF;

  INSERT INTO public.audit_logs (company_id, tabela, registro_id, acao, agente, usuario_id, resumo)
  VALUES (_id, 'companies', _id, 'UPDATE', 'humano', auth.uid(), 'Projeto restaurado');
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_project(
  _id uuid,
  _razao_social text DEFAULT NULL,
  _nome_fantasia text DEFAULT NULL,
  _cnpj text DEFAULT NULL,
  _municipio text DEFAULT NULL,
  _estado text DEFAULT NULL,
  _qtd_casas integer DEFAULT NULL,
  _area_casa_m2 numeric DEFAULT NULL,
  _data_inicio_obras date DEFAULT NULL,
  _saldo_inicial_caixa numeric DEFAULT NULL,
  _faturamento_contrato numeric DEFAULT NULL,
  _custo_total_contrato numeric DEFAULT NULL,
  _custo_indireto numeric DEFAULT NULL,
  _custo_capital numeric DEFAULT NULL,
  _prazo_recebimento_dias integer DEFAULT NULL,
  _status text DEFAULT NULL
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_before jsonb;
  v_after  jsonb;
BEGIN
  SELECT to_jsonb(c.*) INTO v_before FROM public.companies c WHERE c.id = _id;
  IF v_before IS NULL THEN
    RAISE EXCEPTION 'Projeto % não encontrado', _id;
  END IF;

  UPDATE public.companies SET
    razao_social = COALESCE(_razao_social, razao_social),
    nome_fantasia = COALESCE(_nome_fantasia, nome_fantasia),
    cnpj = COALESCE(_cnpj, cnpj),
    municipio = COALESCE(_municipio, municipio),
    estado = COALESCE(_estado, estado),
    qtd_casas = COALESCE(_qtd_casas, qtd_casas),
    area_casa_m2 = COALESCE(_area_casa_m2, area_casa_m2),
    data_inicio_obras = COALESCE(_data_inicio_obras, data_inicio_obras),
    saldo_inicial_caixa = COALESCE(_saldo_inicial_caixa, saldo_inicial_caixa),
    faturamento_contrato = COALESCE(_faturamento_contrato, faturamento_contrato),
    custo_total_contrato = COALESCE(_custo_total_contrato, custo_total_contrato),
    custo_indireto = COALESCE(_custo_indireto, custo_indireto),
    custo_capital = COALESCE(_custo_capital, custo_capital),
    prazo_recebimento_dias = COALESCE(_prazo_recebimento_dias, prazo_recebimento_dias),
    status = COALESCE(_status, status),
    updated_at = now()
  WHERE id = _id
  RETURNING to_jsonb(companies.*) INTO v_after;

  INSERT INTO public.audit_logs (company_id, tabela, registro_id, acao, agente, usuario_id, dados_antes, dados_depois, resumo)
  VALUES (_id, 'companies', _id, 'UPDATE', 'humano', auth.uid(), v_before, v_after, 'Projeto atualizado');
END;
$function$;
