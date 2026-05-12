-- Fix: trigger _recalc_parcela_valor_pago passa a reconhecer status='aprovado'
-- como vínculo legítimo (além de 'confirmado').
--
-- Motivação: a aba "Pagamentos" (PaymentModal, MutuoBaixaModal, BatchPaymentModal)
-- cria a conciliação com status='aprovado' (mov fantasma pré-extrato — o OFX real
-- ainda não bateu na conta). O trigger original só contava 'confirmado', então
-- assim que o cp era inserido o trigger zerava valor_pago e o usuário via a
-- parcela voltar para 'a_vencer' com data_pagamento_real=NULL — efeito de "a baixa
-- não funcionou".
--
-- O conceito de "mov fantasma" segue válido — `match_type` distingue manual de
-- automático e a ReconciliationSidePanel ainda consegue absorver o fantasma na
-- mov real quando o OFX chegar (apaga 'aprovado' e cria 'confirmado'; o trigger
-- recalcula igual).
--
-- Aditivo e reversível: apenas substitui a função; revert é re-criar com a
-- versão anterior do migration 20260424160000.

CREATE OR REPLACE FUNCTION _recalc_parcela_valor_pago(ids uuid[]) RETURNS void AS $$
BEGIN
  -- 1) Parcelas com pelo menos um vínculo (confirmado OU aprovado):
  --    valor_pago = soma dos vínculos. 'aprovado' = baixa lançada pelo operador
  --    aguardando match com extrato real; conta como pago em valor_pago, mas
  --    permanece visível como fantasma pra absorção futura.
  UPDATE parcelas p
  SET valor_pago = s.soma_links,
      status = CASE
        WHEN s.soma_links <= 0.005 THEN
          CASE WHEN COALESCE(p.data_prevista_pagamento, p.data_vencimento) < current_date THEN 'vencida' ELSE 'a_vencer' END
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
    JOIN conciliacoes c ON c.id = cp.conciliacao_id
    WHERE c.status IN ('confirmado','aprovado')
      AND cp.parcela_id = ANY(ids)
    GROUP BY cp.parcela_id
  ) s
  WHERE p.id = s.parcela_id;

  -- 2) Parcelas cujo último vínculo foi removido (nem confirmado nem aprovado):
  --    zerar valor_pago.
  UPDATE parcelas p
  SET valor_pago = 0,
      status = CASE WHEN COALESCE(p.data_prevista_pagamento, p.data_vencimento) < current_date THEN 'vencida' ELSE 'a_vencer' END,
      data_pagamento_real = NULL
  WHERE p.id = ANY(ids)
    AND NOT EXISTS (
      SELECT 1 FROM conciliacao_parcelas cp
      JOIN conciliacoes c ON c.id = cp.conciliacao_id
      WHERE cp.parcela_id = p.id
        AND c.status IN ('confirmado','aprovado')
    );
END;
$$ LANGUAGE plpgsql;
