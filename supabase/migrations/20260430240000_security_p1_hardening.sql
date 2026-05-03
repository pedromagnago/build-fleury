-- Fase 1 P1: endurecimento de segurança
-- 1. REVOKE EXECUTE de `anon` em todas as RPCs SECURITY DEFINER
-- 2. Corrigir search_path mutável nas 10 funções afetadas
-- 3. Padronizar policies de mutuos/mutuo_parcelas/conciliacoes para user_can_access_company

-- =========================================================
-- 1) REVOKE EXECUTE FROM anon
--    Mantém EXECUTE para `authenticated` (necessário para uso pela app).
--    user_can_access_company é mantido para anon? NÃO — só é usado por RLS,
--    e RLS rodando como `authenticated` continua funcionando.
-- =========================================================
REVOKE EXECUTE ON FUNCTION public.create_project(text,text,text,text,integer,numeric,date,numeric,numeric,numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.duplicate_project_full(uuid,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_invite_required() FROM anon, authenticated; -- trigger interno
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_rule_count(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.invite_user(text,text,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_invites(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_invited_roles() FROM anon;
REVOKE EXECUTE ON FUNCTION public.restore_project(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revoke_invite(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_itens_compra(uuid,text,public.vector,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.soft_delete_project(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_project(uuid,text,text,text,text,text,integer,numeric,date,numeric,numeric,numeric,numeric,numeric,integer,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_can_access_company(uuid,uuid) FROM anon;

-- =========================================================
-- 2) Fix search_path mutável (schema hijacking)
-- =========================================================
ALTER FUNCTION public._recalc_parcela_valor_pago(uuid[])                           SET search_path = public, pg_temp;
ALTER FUNCTION public._redistribuir_contratuais(uuid)                              SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_auto_numero_pedido()                                      SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_numero_pedido()                                     SET search_path = public, pg_temp;
ALTER FUNCTION public.recalcular_consumido_despesa()                               SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_medicao_valor_planejado(uuid, integer)                  SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_fn_conciliacao_parcelas_sync()                           SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_fn_conciliacao_status_sync()                             SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_fn_redistribuir_contratuais()                            SET search_path = public, pg_temp;
ALTER FUNCTION public.trigger_sync_medicao()                                       SET search_path = public, pg_temp;

-- =========================================================
-- 3) Padronizar policies legadas para user_can_access_company
--    (mutuos, mutuo_parcelas, conciliacoes usavam company_id IN (SELECT id FROM companies))
-- =========================================================
DROP POLICY IF EXISTS "Users can manage mutuos of their company" ON public.mutuos;
DROP POLICY IF EXISTS "Users can view mutuos of their company" ON public.mutuos;

CREATE POLICY mutuos_select ON public.mutuos FOR SELECT TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY mutuos_insert ON public.mutuos FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY mutuos_update ON public.mutuos FOR UPDATE TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id))
  WITH CHECK (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY mutuos_delete ON public.mutuos FOR DELETE TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));

DROP POLICY IF EXISTS "Users can manage mutuo_parcelas of their company" ON public.mutuo_parcelas;
DROP POLICY IF EXISTS "Users can view mutuo_parcelas of their company" ON public.mutuo_parcelas;

CREATE POLICY mutuo_parcelas_select ON public.mutuo_parcelas FOR SELECT TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY mutuo_parcelas_insert ON public.mutuo_parcelas FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY mutuo_parcelas_update ON public.mutuo_parcelas FOR UPDATE TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id))
  WITH CHECK (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY mutuo_parcelas_delete ON public.mutuo_parcelas FOR DELETE TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));

DROP POLICY IF EXISTS conciliacoes_select ON public.conciliacoes;
DROP POLICY IF EXISTS conciliacoes_insert ON public.conciliacoes;
DROP POLICY IF EXISTS conciliacoes_update ON public.conciliacoes;
DROP POLICY IF EXISTS conciliacoes_delete ON public.conciliacoes;

CREATE POLICY conciliacoes_select ON public.conciliacoes FOR SELECT TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY conciliacoes_insert ON public.conciliacoes FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY conciliacoes_update ON public.conciliacoes FOR UPDATE TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id))
  WITH CHECK (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY conciliacoes_delete ON public.conciliacoes FOR DELETE TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));
