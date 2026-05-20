-- Fix: accept_invite_lookup referenciava c.nome (coluna inexistente em public.companies),
-- o que fazia toda chamada do RPC retornar erro 42703 e a página de convite exibir
-- "Convite inválido". A tabela companies usa razao_social / nome_fantasia.

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
  SELECT i.*, COALESCE(c.nome_fantasia, c.razao_social) AS company_name
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
