-- RPC recalcular_status_empresa
-- Corrige status inconsistentes de parcelas e pedidos para uma company:
--   parcelas: futura/a_vencer → vencida se data_vencimento < hoje
--             futura → a_vencer se data_vencimento >= hoje
--             status errado apesar de valor_pago >= valor → paga
--   pedidos:  planejado/pedido_enviado → entregue se qtd_recebida >= qtd
--             qualquer status < pago → pago/parcialmente_pago pela soma das parcelas

CREATE OR REPLACE FUNCTION public.recalcular_status_empresa(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_parc_vencidas   int := 0;
  v_parc_a_vencer   int := 0;
  v_parc_pagas      int := 0;
  v_ped_entregue    int := 0;
  v_ped_pago        int := 0;
  v_ped_parcial     int := 0;
BEGIN

  -- ── PARCELAS ─────────────────────────────────────────────────────────────

  -- 1a. Não pagas + data_vencimento passada → vencida
  WITH upd AS (
    UPDATE parcelas
    SET status = 'vencida'
    WHERE company_id = p_company_id
      AND deleted_at IS NULL
      AND status IN ('futura', 'a_vencer')
      AND COALESCE(valor_pago, 0) <= 0.005
      AND data_vencimento < current_date
    RETURNING 1
  ) SELECT count(*) INTO v_parc_vencidas FROM upd;

  -- 1b. Ainda futura mas vencimento no futuro → a_vencer
  WITH upd AS (
    UPDATE parcelas
    SET status = 'a_vencer'
    WHERE company_id = p_company_id
      AND deleted_at IS NULL
      AND status = 'futura'
      AND COALESCE(valor_pago, 0) <= 0.005
      AND data_vencimento >= current_date
    RETURNING 1
  ) SELECT count(*) INTO v_parc_a_vencer FROM upd;

  -- 1c. valor_pago >= valor mas status não é paga → paga
  WITH upd AS (
    UPDATE parcelas
    SET
      status = 'paga',
      data_pagamento_real = COALESCE(data_pagamento_real, current_date)
    WHERE company_id = p_company_id
      AND deleted_at IS NULL
      AND status NOT IN ('paga', 'cancelado')
      AND valor > 0
      AND COALESCE(valor_pago, 0) >= valor - 0.005
    RETURNING 1
  ) SELECT count(*) INTO v_parc_pagas FROM upd;

  -- ── PEDIDOS ──────────────────────────────────────────────────────────────

  -- 2a. Todos os itens recebidos mas pedido ainda em status inicial → entregue
  WITH upd AS (
    UPDATE pedidos p
    SET status = 'entregue'
    WHERE p.company_id = p_company_id
      AND p.status IN ('planejado', 'pedido_enviado')
      AND EXISTS (
        SELECT 1
        FROM pedido_itens pi
        WHERE pi.pedido_id = p.id
        GROUP BY pi.pedido_id
        HAVING COALESCE(SUM(pi.qtd), 0) > 0
           AND COALESCE(SUM(pi.qtd_recebida), 0) >= COALESCE(SUM(pi.qtd), 0) - 0.001
      )
    RETURNING 1
  ) SELECT count(*) INTO v_ped_entregue FROM upd;

  -- 2b. Soma de parcelas >= valor_total_real → pago
  WITH upd AS (
    UPDATE pedidos p
    SET status = 'pago'
    WHERE p.company_id = p_company_id
      AND p.status NOT IN ('pago', 'cancelado')
      AND p.valor_total_real > 0
      AND COALESCE(
            (SELECT SUM(valor_pago)
             FROM parcelas
             WHERE pedido_id = p.id AND deleted_at IS NULL), 0
          ) >= p.valor_total_real - 0.01
    RETURNING 1
  ) SELECT count(*) INTO v_ped_pago FROM upd;

  -- 2c. Soma > 0 mas < total → parcialmente_pago
  WITH upd AS (
    UPDATE pedidos p
    SET status = 'parcialmente_pago'
    WHERE p.company_id = p_company_id
      AND p.status NOT IN ('pago', 'parcialmente_pago', 'cancelado')
      AND p.valor_total_real > 0
      AND COALESCE(
            (SELECT SUM(valor_pago)
             FROM parcelas
             WHERE pedido_id = p.id AND deleted_at IS NULL), 0
          ) > 0.01
      AND COALESCE(
            (SELECT SUM(valor_pago)
             FROM parcelas
             WHERE pedido_id = p.id AND deleted_at IS NULL), 0
          ) < p.valor_total_real - 0.01
    RETURNING 1
  ) SELECT count(*) INTO v_ped_parcial FROM upd;

  RETURN jsonb_build_object(
    'parcelas_agora_vencidas',         v_parc_vencidas,
    'parcelas_agora_a_vencer',         v_parc_a_vencer,
    'parcelas_agora_pagas',            v_parc_pagas,
    'pedidos_agora_entregue',          v_ped_entregue,
    'pedidos_agora_pago',              v_ped_pago,
    'pedidos_agora_parcialmente_pago', v_ped_parcial
  );
END;
$$;

-- Permissão: qualquer usuário autenticado pode chamar (RLS no dado, não na função)
GRANT EXECUTE ON FUNCTION public.recalcular_status_empresa(uuid) TO authenticated;
