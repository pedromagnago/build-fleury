-- ============================================================================
-- Guards contra dois bugs de integridade na conciliação bancária
--
-- Bug A — mesma movimentação conciliada N vezes (conciliacoes sem UNIQUE):
--   Movimentação bancária X criava dois registros em `conciliacoes` (ex: mútuo
--   re-aplicado, ou operador confirmou duas vezes). Sem UNIQUE(movimentacao_id),
--   o banco aceitava silenciosamente.
--
-- Bug B — parcela recebe mais do que seu valor face (overpayment):
--   _recalc_parcela_valor_pago soma TODOS os vínculos confirmados sem cap.
--   Se duas conciliaçoes diferentes apontassem para a mesma parcela (Bug A →
--   Bug B), valor_pago podia exceder valor, quebrando os totalizadores de
--   TOTAL / PAGO / PENDENTE no Pagamentos.
-- ============================================================================

-- ============================================================================
-- 1) LIMPEZA: remove conciliacoes duplicadas (mantém a mais antiga por movimentacao_id)
--    As linhas em conciliacao_parcelas são apagadas em cascata (FK ON DELETE CASCADE
--    deve existir; se não existir, apagamos explicitamente antes).
-- ============================================================================
DO $$
DECLARE
  v_ids uuid[];
BEGIN
  -- Identifica os IDs duplicados a remover (mantém menor created_at por movimentacao_id)
  SELECT ARRAY_AGG(id) INTO v_ids
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY movimentacao_id ORDER BY created_at ASC) AS rn
    FROM conciliacoes
    WHERE movimentacao_id IS NOT NULL
  ) ranked
  WHERE rn > 1;

  IF v_ids IS NOT NULL AND array_length(v_ids, 1) > 0 THEN
    -- Remove vínculos antes (caso FK não seja CASCADE)
    DELETE FROM conciliacao_parcelas WHERE conciliacao_id = ANY(v_ids);
    DELETE FROM conciliacoes          WHERE id            = ANY(v_ids);
    RAISE NOTICE 'Removidas % conciliações duplicadas.', array_length(v_ids, 1);
  ELSE
    RAISE NOTICE 'Nenhuma conciliação duplicada encontrada.';
  END IF;
END $$;

-- ============================================================================
-- 2) UNIQUE em conciliacoes.movimentacao_id — Bug A não volta a acontecer
-- ============================================================================
ALTER TABLE conciliacoes
  ADD CONSTRAINT conciliacoes_movimentacao_id_unique
  UNIQUE (movimentacao_id);

-- ============================================================================
-- 3) Anti-overpayment em _recalc_parcela_valor_pago — Bug B
--    Antes de atualizar valor_pago, verifica se a soma dos vínculos confirmados
--    excede o valor face da parcela. Se exceder, lança exceção com hint
--    'overpayment_blocked' para o frontend capturar e exibir mensagem amigável.
-- ============================================================================
CREATE OR REPLACE FUNCTION _recalc_parcela_valor_pago(ids uuid[]) RETURNS void AS $$
DECLARE
  v_parcela_id uuid;
  v_face       numeric;
  v_soma       numeric;
BEGIN
  -- Verifica overpayment ANTES de atualizar
  FOR v_parcela_id, v_face, v_soma IN
    SELECT cp.parcela_id, p.valor, SUM(cp.valor_aplicado) AS soma
    FROM conciliacao_parcelas cp
    JOIN conciliacoes c ON c.id = cp.conciliacao_id AND c.status = 'confirmado'
    JOIN parcelas p      ON p.id = cp.parcela_id
    WHERE cp.parcela_id = ANY(ids)
    GROUP BY cp.parcela_id, p.valor
    HAVING SUM(cp.valor_aplicado) > p.valor + 0.01
  LOOP
    RAISE EXCEPTION
      'Conciliação excede o valor da parcela. Face: R$ %, total conciliado: R$ %. Verifique se esta movimentação já foi aplicada em outro pedido.',
      ROUND(v_face, 2), ROUND(v_soma, 2)
      USING ERRCODE = 'check_violation', HINT = 'overpayment_blocked';
  END LOOP;

  -- 1) Parcelas com pelo menos um vínculo confirmado: valor_pago = soma dos vínculos
  UPDATE parcelas p
  SET valor_pago = s.soma_links,
      status = CASE
        WHEN s.soma_links <= 0.005 THEN
          CASE WHEN p.data_vencimento < current_date THEN 'vencida' ELSE 'a_vencer' END
        WHEN s.soma_links >= p.valor - 0.005 THEN 'paga'
        ELSE 'parcialmente_paga'
      END,
      data_pagamento_real = CASE
        WHEN s.soma_links <= 0.005 THEN NULL
        ELSE p.data_pagamento_real
      END
  FROM (
    SELECT cp.parcela_id, SUM(cp.valor_aplicado) AS soma_links
    FROM conciliacao_parcelas cp
    JOIN conciliacoes c ON c.id = cp.conciliacao_id AND c.status = 'confirmado'
    WHERE cp.parcela_id = ANY(ids)
    GROUP BY cp.parcela_id
  ) s
  WHERE p.id = s.parcela_id;

  -- 2) Parcelas cujo último vínculo foi removido: zerar valor_pago
  UPDATE parcelas p
  SET valor_pago = 0,
      status = CASE WHEN p.data_vencimento < current_date THEN 'vencida' ELSE 'a_vencer' END,
      data_pagamento_real = NULL
  WHERE p.id = ANY(ids)
    AND NOT EXISTS (
      SELECT 1 FROM conciliacao_parcelas cp
      JOIN conciliacoes c ON c.id = cp.conciliacao_id
      WHERE cp.parcela_id = p.id AND c.status = 'confirmado'
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4) UNIQUE em conciliacao_parcelas(conciliacao_id, parcela_id)
--    Impede que a mesma conciliação vincule a mesma parcela duas vezes.
-- ============================================================================
ALTER TABLE conciliacao_parcelas
  ADD CONSTRAINT conciliacao_parcelas_conc_parc_unique
  UNIQUE (conciliacao_id, parcela_id);
