-- Snapshot diario do "estado de saude" do projeto.
--
-- Gravado client-side toda vez que o usuario abre o Painel de Controle:
-- upsert no (company_id, snapshot_date). Permite construir o grafico de
-- tendencia ("12 -> 7 problemas") sem rodar cron — a primeira visita do
-- dia ja escreve, e visitas subsequentes apenas atualizam.
--
-- by_rule guarda contagens e valor por regra para drill-down historico.

CREATE TABLE IF NOT EXISTS public.health_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  snapshot_date   date NOT NULL,
  total_items     integer NOT NULL DEFAULT 0,
  critical_count  integer NOT NULL DEFAULT 0,
  warn_count      integer NOT NULL DEFAULT 0,
  total_valor     numeric(14,2) NOT NULL DEFAULT 0,
  by_rule         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_health_snapshots_company_date
  ON public.health_snapshots (company_id, snapshot_date DESC);

ALTER TABLE public.health_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS health_snapshots_select ON public.health_snapshots;
CREATE POLICY health_snapshots_select
  ON public.health_snapshots FOR SELECT TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));

DROP POLICY IF EXISTS health_snapshots_insert ON public.health_snapshots;
CREATE POLICY health_snapshots_insert
  ON public.health_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_company(auth.uid(), company_id));

DROP POLICY IF EXISTS health_snapshots_update ON public.health_snapshots;
CREATE POLICY health_snapshots_update
  ON public.health_snapshots FOR UPDATE TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id))
  WITH CHECK (public.user_can_access_company(auth.uid(), company_id));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.health_snapshots_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_health_snapshots_updated_at ON public.health_snapshots;
CREATE TRIGGER trg_health_snapshots_updated_at
  BEFORE UPDATE ON public.health_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.health_snapshots_set_updated_at();
