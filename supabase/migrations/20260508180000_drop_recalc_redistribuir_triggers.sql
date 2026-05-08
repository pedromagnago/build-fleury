-- Remove os triggers automáticos que mexiam em parcelas quando o pedido mudava
-- ou quando uma parcela 'adiantamento' era inserida/alterada.
--
-- Nova regra: o plano de parcelas é o "contrato" — pagamento NUNCA altera plano,
-- ele apenas consome parcelas em ordem (FIFO) via valor_pago. Mudança de plano
-- só por ação humana explícita (botão Regenerar no painel).
--
-- O trigger trg_sync_parcela_valor_pago (em conciliacao_parcelas) continua ativo:
-- ele só recalcula valor_pago/status a partir dos vínculos confirmados, o que é
-- correto e desejado.

DROP TRIGGER IF EXISTS trg_pedidos_recalc_parcelas ON pedidos;
DROP FUNCTION IF EXISTS public.recalc_parcelas_on_pedido_change();

DROP TRIGGER IF EXISTS trg_redistribuir_contratuais ON parcelas;
DROP FUNCTION IF EXISTS public.trg_fn_redistribuir_contratuais();
DROP FUNCTION IF EXISTS public._redistribuir_contratuais(uuid);
