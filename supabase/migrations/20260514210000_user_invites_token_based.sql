-- Token-based invites: tabela + RPCs (create_invite, accept_invite_lookup, accept_invite,
-- revoke_user_invite, list_user_invites). Substitui fluxo OTP por link clicavel.

CREATE TABLE IF NOT EXISTS public.user_invites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token           uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  email           text NOT NULL,
  role            text NOT NULL CHECK (role IN ('super_admin','supervisor','operador','cliente')),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invited_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at         timestamptz,
  used_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at      timestamptz,
  revoked_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_invites_company ON public.user_invites(company_id);
CREATE INDEX IF NOT EXISTS idx_user_invites_email   ON public.user_invites(lower(email));
CREATE INDEX IF NOT EXISTS idx_user_invites_token   ON public.user_invites(token);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_invites_pending
  ON public.user_invites(company_id, lower(email))
  WHERE used_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.user_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_user_invites_select ON public.user_invites;
CREATE POLICY p_user_invites_select ON public.user_invites
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = user_invites.company_id
        AND ur.role IN ('super_admin','supervisor')
        AND ur.active = true
    )
  );

CREATE OR REPLACE FUNCTION public.create_invite(
  _email      text,
  _role       text,
  _company_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _normalized text := lower(trim(_email));
  _existing_user_id uuid;
  _existing_role_id uuid;
  _existing_active boolean;
  _invite_token uuid;
  _invite_id uuid;
  _expires_at timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND company_id = _company_id
      AND role IN ('super_admin','supervisor')
      AND active = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only admins can invite users';
  END IF;

  IF _role NOT IN ('super_admin','supervisor','operador','cliente') THEN
    RAISE EXCEPTION 'Invalid role: %', _role;
  END IF;

  IF _normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Invalid email: %', _normalized;
  END IF;

  SELECT au.id, ur.id, ur.active
    INTO _existing_user_id, _existing_role_id, _existing_active
  FROM auth.users au
  LEFT JOIN public.user_roles ur
    ON ur.user_id = au.id AND ur.company_id = _company_id
  WHERE lower(au.email) = _normalized
  LIMIT 1;

  IF _existing_user_id IS NOT NULL AND _existing_role_id IS NOT NULL AND _existing_active THEN
    RETURN json_build_object(
      'status','already_member',
      'message','Este usuario ja e membro deste projeto.'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_invites
    WHERE company_id = _company_id
      AND lower(email) = _normalized
      AND used_at IS NULL
      AND revoked_at IS NULL
      AND expires_at > now()
  ) THEN
    SELECT token, expires_at INTO _invite_token, _expires_at
    FROM public.user_invites
    WHERE company_id = _company_id
      AND lower(email) = _normalized
      AND used_at IS NULL
      AND revoked_at IS NULL
      AND expires_at > now()
    LIMIT 1;
    RETURN json_build_object(
      'status','already_invited',
      'token', _invite_token,
      'expires_at', _expires_at,
      'message','Ja existe um convite ativo para este email.'
    );
  END IF;

  DELETE FROM public.user_invites
  WHERE company_id = _company_id
    AND lower(email) = _normalized
    AND (used_at IS NOT NULL OR revoked_at IS NOT NULL OR expires_at <= now());

  INSERT INTO public.user_invites (email, role, company_id, invited_by)
  VALUES (_normalized, _role, _company_id, auth.uid())
  RETURNING id, token, expires_at INTO _invite_id, _invite_token, _expires_at;

  RETURN json_build_object(
    'status','invited',
    'invite_id', _invite_id,
    'token', _invite_token,
    'expires_at', _expires_at,
    'message','Convite criado. Compartilhe o link com o convidado.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_invite(text,text,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_invite(text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_invite_lookup(_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r RECORD;
  _user_exists boolean := false;
BEGIN
  SELECT i.*, c.nome AS company_name
    INTO _r
  FROM public.user_invites i
  LEFT JOIN public.companies c ON c.id = i.company_id
  WHERE i.token = _token;

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false, 'reason','not_found');
  END IF;

  IF _r.revoked_at IS NOT NULL THEN
    RETURN json_build_object('valid', false, 'reason','revoked');
  END IF;

  IF _r.used_at IS NOT NULL THEN
    RETURN json_build_object('valid', false, 'reason','used');
  END IF;

  IF _r.expires_at <= now() THEN
    RETURN json_build_object('valid', false, 'reason','expired');
  END IF;

  SELECT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(_r.email)) INTO _user_exists;

  RETURN json_build_object(
    'valid', true,
    'email', _r.email,
    'role', _r.role,
    'company_name', _r.company_name,
    'expires_at', _r.expires_at,
    'user_exists', _user_exists
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invite_lookup(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_invite_lookup(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.accept_invite(_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r RECORD;
  _uid uuid := auth.uid();
  _user_email text;
  _existing_role_id uuid;
  _existing_active boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: voce precisa estar autenticado para aceitar o convite';
  END IF;

  SELECT lower(email) INTO _user_email FROM auth.users WHERE id = _uid;

  SELECT * INTO _r FROM public.user_invites WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite nao encontrado';
  END IF;
  IF _r.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Convite revogado';
  END IF;
  IF _r.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Convite ja utilizado';
  END IF;
  IF _r.expires_at <= now() THEN
    RAISE EXCEPTION 'Convite expirado';
  END IF;

  IF lower(_r.email) <> _user_email THEN
    RAISE EXCEPTION 'O email autenticado (%) nao corresponde ao convite (%)', _user_email, _r.email;
  END IF;

  SELECT id, active INTO _existing_role_id, _existing_active
  FROM public.user_roles
  WHERE user_id = _uid AND company_id = _r.company_id
  LIMIT 1;

  IF _existing_role_id IS NOT NULL THEN
    UPDATE public.user_roles
    SET active = true, role = _r.role, invited_email = NULL
    WHERE id = _existing_role_id;
  ELSE
    INSERT INTO public.user_roles (user_id, company_id, role, active, invited_email)
    VALUES (_uid, _r.company_id, _r.role, true, NULL);
  END IF;

  DELETE FROM public.user_roles
  WHERE invited_email = lower(_r.email)
    AND company_id = _r.company_id
    AND user_id IS NULL;

  UPDATE public.user_invites
  SET used_at = now(), used_by = _uid
  WHERE id = _r.id;

  RETURN json_build_object(
    'ok', true,
    'company_id', _r.company_id,
    'role', _r.role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invite(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_invite(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_user_invite(_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cid uuid;
BEGIN
  SELECT company_id INTO _cid FROM public.user_invites WHERE id = _invite_id;
  IF _cid IS NULL THEN
    RAISE EXCEPTION 'Convite nao encontrado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND company_id = _cid
      AND role IN ('super_admin','supervisor')
      AND active = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.user_invites
  SET revoked_at = now(), revoked_by = auth.uid()
  WHERE id = _invite_id AND used_at IS NULL AND revoked_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_user_invite(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.revoke_user_invite(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_user_invites(_company_id uuid)
RETURNS TABLE(
  id uuid,
  token uuid,
  email text,
  role text,
  expires_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND company_id = _company_id
      AND role IN ('super_admin','supervisor')
      AND active = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
    SELECT
      i.id, i.token, i.email, i.role, i.expires_at, i.used_at, i.revoked_at, i.created_at,
      CASE
        WHEN i.used_at IS NOT NULL    THEN 'used'
        WHEN i.revoked_at IS NOT NULL THEN 'revoked'
        WHEN i.expires_at <= now()    THEN 'expired'
        ELSE 'pending'
      END AS status
    FROM public.user_invites i
    WHERE i.company_id = _company_id
    ORDER BY i.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_user_invites(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_user_invites(uuid) TO authenticated;