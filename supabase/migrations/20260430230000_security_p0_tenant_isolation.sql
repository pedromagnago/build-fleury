-- Fase 1 P0: bloqueio de vazamento entre tenants
-- 1. conciliacao_parcelas: trocar policies "always true" por herança via conciliacao_id
-- 2. recepcao_docs INSERT: exigir tenant
-- 3. companies UPDATE: exigir super_admin
-- 4. v_fluxo_caixa_projetado: remover SECURITY DEFINER

-- =========================================================
-- 1) conciliacao_parcelas — herda tenant via conciliacoes.company_id
-- =========================================================
DROP POLICY IF EXISTS conciliacao_parcelas_select ON public.conciliacao_parcelas;
DROP POLICY IF EXISTS conciliacao_parcelas_insert ON public.conciliacao_parcelas;
DROP POLICY IF EXISTS conciliacao_parcelas_update ON public.conciliacao_parcelas;
DROP POLICY IF EXISTS conciliacao_parcelas_delete ON public.conciliacao_parcelas;

CREATE POLICY conciliacao_parcelas_select
  ON public.conciliacao_parcelas FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conciliacoes c
      WHERE c.id = conciliacao_parcelas.conciliacao_id
        AND public.user_can_access_company(auth.uid(), c.company_id)
    )
  );

CREATE POLICY conciliacao_parcelas_insert
  ON public.conciliacao_parcelas FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conciliacoes c
      WHERE c.id = conciliacao_parcelas.conciliacao_id
        AND public.user_can_access_company(auth.uid(), c.company_id)
    )
  );

CREATE POLICY conciliacao_parcelas_update
  ON public.conciliacao_parcelas FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conciliacoes c
      WHERE c.id = conciliacao_parcelas.conciliacao_id
        AND public.user_can_access_company(auth.uid(), c.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conciliacoes c
      WHERE c.id = conciliacao_parcelas.conciliacao_id
        AND public.user_can_access_company(auth.uid(), c.company_id)
    )
  );

CREATE POLICY conciliacao_parcelas_delete
  ON public.conciliacao_parcelas FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conciliacoes c
      WHERE c.id = conciliacao_parcelas.conciliacao_id
        AND public.user_can_access_company(auth.uid(), c.company_id)
    )
  );

-- =========================================================
-- 2) recepcao_docs — INSERT exige tenant válido
-- =========================================================
DROP POLICY IF EXISTS recepcao_docs_insert ON public.recepcao_docs;

CREATE POLICY recepcao_docs_insert
  ON public.recepcao_docs FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_company(auth.uid(), company_id));

-- =========================================================
-- 3) companies UPDATE — restringir a super_admin
-- =========================================================
DROP POLICY IF EXISTS "Super admins can update their companies" ON public.companies;

CREATE POLICY "Super admins can update their companies"
  ON public.companies FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = companies.id
        AND ur.role = 'super_admin'
        AND ur.active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = companies.id
        AND ur.role = 'super_admin'
        AND ur.active = true
    )
  );

-- =========================================================
-- 4) v_fluxo_caixa_projetado — remover SECURITY DEFINER
--    Recriar como SECURITY INVOKER para respeitar RLS de cada tabela
-- =========================================================
ALTER VIEW public.v_fluxo_caixa_projetado SET (security_invoker = true);
