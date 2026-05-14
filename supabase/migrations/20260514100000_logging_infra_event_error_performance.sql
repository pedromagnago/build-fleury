-- ============================================================================
-- logging_infra_event_error_performance
--
-- Fase 1 do sistema de logs debuggáveis (RFC interno, plano de 2026-05-14).
--
-- Cria 3 tabelas irmãs de `audit_logs`:
--
--   event_logs        — eventos operacionais (não-mutação): login, abertura
--                       de tela, filtro pesado, cálculo, batch, importação.
--                       Níveis: debug | info | warn.
--   error_logs        — erros não tratados (front + back). Inclui RLS,
--                       constraint, throw em try/catch, ErrorBoundary.
--   performance_logs  — operações lentas (> threshold). Só grava se passar
--                       o threshold, pra não inundar.
--
-- Todas carregam `correlation_id` que amarra a cadeia front → rpc → trigger
-- → edge function. Cola o id no filtro da UI e vê o trace inteiro.
--
-- RLS:
--   - SELECT: super_admin global vê tudo; demais veem só registros do
--             próprio tenant (via user_can_access_company) OU registros
--             com company_id NULL gerados pelo próprio user_id
--             (eventos pré-seleção de projeto, ex.: login).
--   - INSERT: authenticated, com WITH CHECK equivalente. Service role
--             (edge function log-ingest) escreve livremente.
--   - UPDATE: só error_logs (campo `resolvido`) e só super_admin.
--   - DELETE: só super_admin (TTL fica num cron usando service role).
-- ============================================================================

-- ====================== Helper: is_super_admin =============================
-- Retorna true se o user tem role super_admin (active=true) em ALGUMA company.
-- Usado nas policies pra deixar super_admin ver/manipular registros sem tenant
-- (company_id NULL, ex.: erros antes de selecionar projeto) e gerenciar
-- triagem global de error_logs.
CREATE OR REPLACE FUNCTION public.is_super_admin(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid
      AND role = 'super_admin'
      AND active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

-- ====================== event_logs ==========================================
CREATE TABLE IF NOT EXISTS public.event_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id  uuid,
  company_id      uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email      text,
  agente          text NOT NULL DEFAULT 'humano'
                    CHECK (agente IN ('humano', 'ia', 'sistema')),
  nivel           text NOT NULL
                    CHECK (nivel IN ('debug', 'info', 'warn')),
  categoria       text NOT NULL,
  evento          text NOT NULL,
  contexto        jsonb,
  duracao_ms      integer CHECK (duracao_ms IS NULL OR duracao_ms >= 0),
  origem          text NOT NULL DEFAULT 'frontend'
                    CHECK (origem IN ('frontend', 'rpc', 'edge', 'trigger', 'sistema')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_logs_correlation
  ON public.event_logs (correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_logs_company_created
  ON public.event_logs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_logs_user_created
  ON public.event_logs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_logs_categoria_created
  ON public.event_logs (categoria, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_logs_nivel_created
  ON public.event_logs (nivel, created_at DESC);

ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_logs_select ON public.event_logs;
DROP POLICY IF EXISTS event_logs_insert ON public.event_logs;
DROP POLICY IF EXISTS event_logs_delete ON public.event_logs;

CREATE POLICY event_logs_select ON public.event_logs
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (company_id IS NULL AND user_id = auth.uid())
    OR (company_id IS NOT NULL AND public.user_can_access_company(auth.uid(), company_id))
  );

CREATE POLICY event_logs_insert ON public.event_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    (company_id IS NULL AND (user_id IS NULL OR user_id = auth.uid()))
    OR (company_id IS NOT NULL AND public.user_can_access_company(auth.uid(), company_id))
  );

CREATE POLICY event_logs_delete ON public.event_logs
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

COMMENT ON TABLE public.event_logs IS
  'Eventos operacionais (debug/info/warn). Use `categoria` pra agrupar por área (financeiro, compras, recepcao, conciliacao, ia, auth, navegacao, saude, sistema) e `evento` pra ação específica (snake_case curto).';

-- ====================== error_logs ==========================================
CREATE TABLE IF NOT EXISTS public.error_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id      uuid,
  company_id          uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email          text,
  agente              text NOT NULL DEFAULT 'humano'
                        CHECK (agente IN ('humano', 'ia', 'sistema')),
  origem              text NOT NULL
                        CHECK (origem IN ('frontend', 'rpc', 'edge', 'trigger', 'sistema')),
  severidade          text NOT NULL DEFAULT 'error'
                        CHECK (severidade IN ('warn', 'error', 'fatal')),
  categoria           text NOT NULL,
  mensagem            text NOT NULL,
  stack               text,
  url                 text,
  user_agent          text,
  payload_request     jsonb,
  contexto            jsonb,
  erro_postgres_code  text,
  erro_constraint     text,
  resolvido           boolean NOT NULL DEFAULT false,
  resolvido_por       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolvido_em        timestamptz,
  resolvido_nota      text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_correlation
  ON public.error_logs (correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_error_logs_company_created
  ON public.error_logs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_user_created
  ON public.error_logs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_error_logs_severidade_created
  ON public.error_logs (severidade, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_aberto
  ON public.error_logs (created_at DESC)
  WHERE resolvido = false;

CREATE INDEX IF NOT EXISTS idx_error_logs_categoria_created
  ON public.error_logs (categoria, created_at DESC);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS error_logs_select ON public.error_logs;
DROP POLICY IF EXISTS error_logs_insert ON public.error_logs;
DROP POLICY IF EXISTS error_logs_update ON public.error_logs;
DROP POLICY IF EXISTS error_logs_delete ON public.error_logs;

CREATE POLICY error_logs_select ON public.error_logs
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (company_id IS NULL AND user_id = auth.uid())
    OR (company_id IS NOT NULL AND public.user_can_access_company(auth.uid(), company_id))
  );

CREATE POLICY error_logs_insert ON public.error_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    (company_id IS NULL AND (user_id IS NULL OR user_id = auth.uid()))
    OR (company_id IS NOT NULL AND public.user_can_access_company(auth.uid(), company_id))
  );

-- Update permite marcar como resolvido (super_admin) ou re-abrir.
CREATE POLICY error_logs_update ON public.error_logs
  FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY error_logs_delete ON public.error_logs
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

COMMENT ON TABLE public.error_logs IS
  'Erros não tratados (warn/error/fatal). Sempre que possível capturado automaticamente (ErrorBoundary, wrapper Supabase, edge handlers). Inclui erro_postgres_code/erro_constraint pra triagem rápida de RLS/constraint.';

-- ====================== performance_logs ====================================
CREATE TABLE IF NOT EXISTS public.performance_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id  uuid,
  company_id      uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email      text,
  origem          text NOT NULL DEFAULT 'frontend'
                    CHECK (origem IN ('frontend', 'rpc', 'edge', 'trigger', 'sistema')),
  categoria       text NOT NULL,
  operacao        text NOT NULL,
  duracao_ms      integer NOT NULL CHECK (duracao_ms >= 0),
  queries_count   integer,
  rows_affected   integer,
  contexto        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perf_logs_correlation
  ON public.performance_logs (correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_perf_logs_company_created
  ON public.performance_logs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_perf_logs_operacao_created
  ON public.performance_logs (operacao, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_perf_logs_duracao
  ON public.performance_logs (duracao_ms DESC, created_at DESC);

ALTER TABLE public.performance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS performance_logs_select ON public.performance_logs;
DROP POLICY IF EXISTS performance_logs_insert ON public.performance_logs;
DROP POLICY IF EXISTS performance_logs_delete ON public.performance_logs;

CREATE POLICY performance_logs_select ON public.performance_logs
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (company_id IS NULL AND user_id = auth.uid())
    OR (company_id IS NOT NULL AND public.user_can_access_company(auth.uid(), company_id))
  );

CREATE POLICY performance_logs_insert ON public.performance_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    (company_id IS NULL AND (user_id IS NULL OR user_id = auth.uid()))
    OR (company_id IS NOT NULL AND public.user_can_access_company(auth.uid(), company_id))
  );

CREATE POLICY performance_logs_delete ON public.performance_logs
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

COMMENT ON TABLE public.performance_logs IS
  'Operações lentas (> threshold definido no logger frontend, default 500ms). Use pra achar gargalos sem inundar com toda operação rápida.';

-- ====================== Helpers de log do backend ===========================
-- Função utilitária pra triggers/RPCs gravarem em event_logs com 1 chamada.
CREATE OR REPLACE FUNCTION public.log_event(
  _categoria      text,
  _evento         text,
  _nivel          text DEFAULT 'info',
  _company_id     uuid DEFAULT NULL,
  _correlation_id uuid DEFAULT NULL,
  _contexto       jsonb DEFAULT NULL,
  _duracao_ms     integer DEFAULT NULL,
  _origem         text DEFAULT 'rpc'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_user_email text;
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.event_logs (
    correlation_id, company_id, user_id, user_email, agente,
    nivel, categoria, evento, contexto, duracao_ms, origem
  )
  VALUES (
    _correlation_id, _company_id, auth.uid(), v_user_email,
    CASE WHEN auth.uid() IS NULL THEN 'sistema' ELSE 'humano' END,
    _nivel, _categoria, _evento, _contexto, _duracao_ms, _origem
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_error(
  _categoria      text,
  _mensagem       text,
  _severidade     text DEFAULT 'error',
  _origem         text DEFAULT 'rpc',
  _company_id     uuid DEFAULT NULL,
  _correlation_id uuid DEFAULT NULL,
  _stack          text DEFAULT NULL,
  _contexto       jsonb DEFAULT NULL,
  _erro_pg_code   text DEFAULT NULL,
  _erro_constraint text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_user_email text;
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.error_logs (
    correlation_id, company_id, user_id, user_email, agente,
    origem, severidade, categoria, mensagem, stack, contexto,
    erro_postgres_code, erro_constraint
  )
  VALUES (
    _correlation_id, _company_id, auth.uid(), v_user_email,
    CASE WHEN auth.uid() IS NULL THEN 'sistema' ELSE 'humano' END,
    _origem, _severidade, _categoria, _mensagem, _stack, _contexto,
    _erro_pg_code, _erro_constraint
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_event(text, text, text, uuid, uuid, jsonb, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_error(text, text, text, text, uuid, uuid, text, jsonb, text, text) TO authenticated;

COMMENT ON FUNCTION public.log_event IS
  'Helper pra RPCs/triggers gravarem em event_logs. SECURITY DEFINER pra fixar user_id via auth.uid() do caller.';

COMMENT ON FUNCTION public.log_error IS
  'Helper pra RPCs/triggers gravarem em error_logs. SECURITY DEFINER pra fixar user_id via auth.uid() do caller.';
