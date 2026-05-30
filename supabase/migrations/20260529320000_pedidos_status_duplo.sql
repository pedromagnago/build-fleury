-- Separa o status de pedidos em dois eixos independentes:
--   status_entrega  — derivado de pedido_itens.qtd_recebida vs qtd
--   status_pagamento — derivado de parcelas.valor_pago vs valor
--
-- O campo `status` legado é mantido para compatibilidade e continua sendo
-- atualizado pelos triggers existentes. As novas colunas permitem filtros
-- independentes: "entregue mas com pagamento vencido", etc.

-- ─── 1. Novas colunas ─────────────────────────────────────────────────────
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS status_entrega TEXT
    CHECK (status_entrega IN ('aguardando_entrega','pedido_enviado','parcialmente_entregue','entregue')),
  ADD COLUMN IF NOT EXISTS status_pagamento TEXT
    CHECK (status_pagamento IN ('sem_parcelas','aguardando','parcialmente_pago','vencido','pago'));

-- ─── 2. Atualizar trigger de entrega para escrever em status_entrega ──────
-- Remove a guarda que impedia atualização quando o status era de pagamento.
-- Agora os dois eixos são completamente independentes.
CREATE OR REPLACE FUNCTION public.fn_recalc_pedido_entrega_status()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE
  v_pedido_id      uuid;
  v_total_qtd      numeric;
  v_total_recebida numeric;
  v_status_atual   text;
  v_novo_entrega   text;
BEGIN
  v_pedido_id := COALESCE(NEW.pedido_id, OLD.pedido_id);
  IF v_pedido_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT status INTO v_status_atual FROM pedidos WHERE id = v_pedido_id;
  -- Pedido cancelado: imune a qualquer recalculo
  IF v_status_atual = 'cancelado' THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT
    COALESCE(SUM(qtd), 0),
    COALESCE(SUM(qtd_recebida), 0)
  INTO v_total_qtd, v_total_recebida
  FROM pedido_itens WHERE pedido_id = v_pedido_id;

  IF v_total_qtd > 0 AND v_total_recebida >= v_total_qtd - 0.001 THEN
    v_novo_entrega := 'entregue';
  ELSIF v_total_recebida > 0.001 THEN
    v_novo_entrega := 'parcialmente_entregue';
  ELSE
    v_novo_entrega := CASE
      WHEN v_status_atual = 'pedido_enviado' THEN 'pedido_enviado'
      ELSE 'aguardando_entrega'
    END;
  END IF;

  UPDATE public.pedidos
  SET
    status_entrega = v_novo_entrega,
    -- Legado: só sobrescreve status se ele ainda é um status de entrega
    -- (não toca em 'parcialmente_pago', 'pago', 'cancelado')
    status = CASE
      WHEN v_status_atual IN ('parcialmente_pago','pago','cancelado') THEN v_status_atual
      ELSE v_novo_entrega
    END
  WHERE id = v_pedido_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- O trigger já existe (trg_pedido_itens_recalc_status), basta recriar a função.

-- ─── 3. Atualizar trigger de pagamento para escrever em status_pagamento ──
CREATE OR REPLACE FUNCTION public.consolidate_pedido_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public AS $$
DECLARE
  v_total         NUMERIC;
  v_pago          NUMERIC;
  v_vencidas      INTEGER;
  v_pedido_id     UUID;
  v_novo_pgto     TEXT;
BEGIN
  v_pedido_id := COALESCE(NEW.pedido_id, OLD.pedido_id);
  IF v_pedido_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT valor_total_real INTO v_total FROM pedidos WHERE id = v_pedido_id;

  SELECT
    COALESCE(SUM(valor_pago), 0),
    COUNT(*) FILTER (WHERE status = 'vencida' AND deleted_at IS NULL)
  INTO v_pago, v_vencidas
  FROM parcelas
  WHERE pedido_id = v_pedido_id AND deleted_at IS NULL;

  -- Determina status_pagamento
  IF NOT EXISTS (SELECT 1 FROM parcelas WHERE pedido_id = v_pedido_id AND deleted_at IS NULL) THEN
    v_novo_pgto := 'sem_parcelas';
  ELSIF v_total IS NOT NULL AND v_pago >= v_total - 0.01 THEN
    v_novo_pgto := 'pago';
  ELSIF v_vencidas > 0 THEN
    v_novo_pgto := 'vencido';
  ELSIF v_pago > 0 THEN
    v_novo_pgto := 'parcialmente_pago';
  ELSE
    v_novo_pgto := 'aguardando';
  END IF;

  UPDATE public.pedidos
  SET
    status_pagamento = v_novo_pgto,
    -- Legado: só força status de pagamento se ele não for de entrega pura
    status = CASE v_novo_pgto
      WHEN 'pago'              THEN 'pago'
      WHEN 'parcialmente_pago' THEN 'parcialmente_pago'
      ELSE status  -- entrega manages its own legacy states
    END
  WHERE id = v_pedido_id AND status != 'cancelado';

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ─── 4. Backfill: preenche as novas colunas a partir do status legado ─────
UPDATE public.pedidos
SET
  status_entrega = CASE
    WHEN status IN ('entregue')                      THEN 'entregue'
    WHEN status IN ('parcialmente_entregue')         THEN 'parcialmente_entregue'
    WHEN status IN ('pedido_enviado')                THEN 'pedido_enviado'
    ELSE                                                  'aguardando_entrega'
  END,
  status_pagamento = CASE
    WHEN status = 'pago'             THEN 'pago'
    WHEN status = 'parcialmente_pago' THEN 'parcialmente_pago'
    ELSE NULL  -- será calculado pelo recalc abaixo
  END
WHERE status != 'cancelado';

-- Recalcula status_pagamento a partir das parcelas para maior precisão
UPDATE public.pedidos p
SET status_pagamento = (
  SELECT
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM parcelas WHERE pedido_id = p.id AND deleted_at IS NULL)
        THEN 'sem_parcelas'
      WHEN p.valor_total_real IS NOT NULL
        AND COALESCE(SUM(val.valor_pago), 0) >= p.valor_total_real - 0.01
        THEN 'pago'
      WHEN COUNT(*) FILTER (WHERE val.status = 'vencida') > 0
        THEN 'vencido'
      WHEN COALESCE(SUM(val.valor_pago), 0) > 0
        THEN 'parcialmente_pago'
      ELSE 'aguardando'
    END
  FROM parcelas val
  WHERE val.pedido_id = p.id AND val.deleted_at IS NULL
)
WHERE p.status != 'cancelado';

-- status_entrega: recalcula a partir de pedido_itens
UPDATE public.pedidos p
SET status_entrega = (
  SELECT
    CASE
      WHEN COALESCE(SUM(pi.qtd), 0) > 0
        AND COALESCE(SUM(pi.qtd_recebida), 0) >= COALESCE(SUM(pi.qtd), 0) - 0.001
        THEN 'entregue'
      WHEN COALESCE(SUM(pi.qtd_recebida), 0) > 0.001
        THEN 'parcialmente_entregue'
      WHEN p.status = 'pedido_enviado'
        THEN 'pedido_enviado'
      ELSE 'aguardando_entrega'
    END
  FROM pedido_itens pi
  WHERE pi.pedido_id = p.id
)
WHERE p.status != 'cancelado' AND status_entrega IS NULL;

-- Preenche pedidos sem itens
UPDATE public.pedidos
SET status_entrega = 'aguardando_entrega'
WHERE status != 'cancelado' AND status_entrega IS NULL;
