-- Fix: enforce_invite_required (BEFORE INSERT em auth.users) só permitia signup quando
-- existia row em user_roles.invited_email (fluxo legado OTP). O fluxo token-based grava
-- em public.user_invites e o usuário é vinculado depois pelo accept_invite. Resultado:
-- supabase.auth.signUp era bloqueado → erro "Database error saving new user" na tela
-- de aceitar convite.
--
-- Aqui aceitamos também e-mails com convite pendente em user_invites (não usado,
-- não revogado, não expirado).

CREATE OR REPLACE FUNCTION public.enforce_invite_required()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text := lower(NEW.email);
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE invited_email = _email
      AND active = true
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_invites
    WHERE lower(email) = _email
      AND used_at IS NULL
      AND revoked_at IS NULL
      AND expires_at > now()
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'signup_not_allowed: este email não foi convidado. Solicite um convite ao administrador.'
    USING ERRCODE = 'P0001';
END;
$$;
