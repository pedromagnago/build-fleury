-- Hardening: leads_simulador — validação de email + restrict SELECT to super_admin
-- (Issue B-01 e B-02 do audit report)

-- 1) Validar formato de email no INSERT (previne spam com campos inválidos)
ALTER TABLE leads_simulador ADD CONSTRAINT leads_email_format
  CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- 2) Restringir SELECT: apenas super_admin pode ver leads (antes: qualquer authenticated)
DROP POLICY IF EXISTS "auth_select" ON leads_simulador;

CREATE POLICY "admin_select" ON leads_simulador
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'super_admin'
        AND ur.active = true
    )
  );
