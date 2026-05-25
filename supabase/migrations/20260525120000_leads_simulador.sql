-- Leads capturados pelo simulador de orçamento da landing page.
-- Insert aberto para anon (sem auth). Select restrito a autenticados.
CREATE TABLE IF NOT EXISTS leads_simulador (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  nome                text        NOT NULL,
  email               text        NOT NULL,
  descricao           text,
  resumo              text,
  itens               jsonb,
  custo_direto_cents  bigint,
  preco_venda_cents   bigint,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE leads_simulador ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert" ON leads_simulador
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "auth_select" ON leads_simulador
  FOR SELECT TO authenticated USING (true);
