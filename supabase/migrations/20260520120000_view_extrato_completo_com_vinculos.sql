-- View do extrato bancário consolidado: 1 linha por movimentação bancária
-- (conciliada ou não), com flags de vínculo agregadas e contexto da conta.
-- Usada pela aba "Extrato" do export XLSX da ConciliacaoPage.
--
-- Razão: a aba "Realizado" só lista vínculos polimórficos (parcela/medição/
-- mútuo). Movs conciliadas SEM vínculo (transferências internas, encontro de
-- contas, ajustes manuais) ficam de fora e impedem chegar ao saldo bancário.
-- Esta view é a fonte única para "saldo real do sistema" no export.
DROP VIEW IF EXISTS public.vw_extrato_completo CASCADE;
CREATE VIEW public.vw_extrato_completo
WITH (security_invoker = on) AS
SELECT
  mb.id                        AS movimentacao_id,
  mb.company_id,
  mb.data                      AS data_mov,
  cb.nome                      AS conta_nome,
  cb.banco                     AS conta_banco,
  COALESCE(cb.saldo_inicial,0) AS conta_saldo_inicial,
  mb.descricao,
  mb.tipo,
  mb.valor,
  CASE WHEN mb.tipo = 'entrada' THEN  mb.valor
       WHEN mb.tipo = 'saida'   THEN -mb.valor
       ELSE 0 END               AS valor_assinado,
  mb.categoria,
  mb.origem                    AS origem_extrato,
  mb.fitid,
  mb.saldo_acumulado,
  COALESCE(mb.conciliado, false) AS conciliado,
  mb.conciliado_em,
  COALESCE((
    SELECT MAX(c.status) FROM public.conciliacoes c
    WHERE c.movimentacao_id = mb.id
      AND c.status IN ('confirmado','aprovado')
  ), (
    SELECT MAX(c.status) FROM public.conciliacoes c
    WHERE c.movimentacao_id = mb.id AND c.status='sugerido'
  ), 'sem_conciliacao')        AS conciliacao_status,
  (SELECT COUNT(*)::int FROM public.conciliacao_parcelas cp
   JOIN public.conciliacoes c2 ON c2.id = cp.conciliacao_id
   WHERE c2.movimentacao_id = mb.id
     AND c2.status IN ('confirmado','aprovado')) AS n_vinculos,
  (SELECT COALESCE(SUM(cp.valor_aplicado),0) FROM public.conciliacao_parcelas cp
   JOIN public.conciliacoes c2 ON c2.id = cp.conciliacao_id
   WHERE c2.movimentacao_id = mb.id
     AND c2.status IN ('confirmado','aprovado')) AS soma_vinculos,
  (SELECT string_agg(DISTINCT
            CASE
              WHEN cp.parcela_id IS NOT NULL       THEN 'parcela'
              WHEN cp.medicao_id IS NOT NULL       THEN 'medicao'
              WHEN cp.mutuo_parcela_id IS NOT NULL THEN 'mutuo_parcela'
              WHEN cp.mutuo_id IS NOT NULL         THEN 'mutuo_principal'
            END, ', ' ORDER BY
            CASE
              WHEN cp.parcela_id IS NOT NULL       THEN 'parcela'
              WHEN cp.medicao_id IS NOT NULL       THEN 'medicao'
              WHEN cp.mutuo_parcela_id IS NOT NULL THEN 'mutuo_parcela'
              WHEN cp.mutuo_id IS NOT NULL         THEN 'mutuo_principal'
            END)
   FROM public.conciliacao_parcelas cp
   JOIN public.conciliacoes c2 ON c2.id = cp.conciliacao_id
   WHERE c2.movimentacao_id = mb.id
     AND c2.status IN ('confirmado','aprovado')) AS origem_tipos,
  (mb.valor - COALESCE((
    SELECT SUM(cp.valor_aplicado) FROM public.conciliacao_parcelas cp
    JOIN public.conciliacoes c2 ON c2.id = cp.conciliacao_id
    WHERE c2.movimentacao_id = mb.id
      AND c2.status IN ('confirmado','aprovado')
  ), 0))                          AS diferenca_vinculo,
  mb.observacao
FROM public.movimentacoes_bancarias mb
JOIN public.contas_bancarias cb ON cb.id = mb.conta_id;

GRANT SELECT ON public.vw_extrato_completo TO authenticated;
