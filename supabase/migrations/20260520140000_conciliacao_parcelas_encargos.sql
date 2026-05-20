-- Encargos no vínculo polimórfico de conciliação:
--   juros (atraso), multa (atraso), desconto (antecipação).
-- valor_aplicado continua sendo SÓ principal — o trigger _recalc_parcela_valor_pago
-- soma apenas valor_aplicado, então parcelas.valor_pago NÃO é inflado por encargos.
-- O saldo da movimentação bancária fecha com: valor_aplicado + juros + multa - desconto.

ALTER TABLE public.conciliacao_parcelas
  ADD COLUMN IF NOT EXISTS valor_juros    numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_multa    numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_desconto numeric NOT NULL DEFAULT 0;

ALTER TABLE public.conciliacao_parcelas
  DROP CONSTRAINT IF EXISTS conciliacao_parcelas_encargos_nao_negativos;
ALTER TABLE public.conciliacao_parcelas
  ADD CONSTRAINT conciliacao_parcelas_encargos_nao_negativos
  CHECK (valor_juros >= 0 AND valor_multa >= 0 AND valor_desconto >= 0);

-- Atualiza vw_conciliacao_realizado para expor encargos
DROP VIEW IF EXISTS public.vw_conciliacao_realizado CASCADE;
CREATE VIEW public.vw_conciliacao_realizado
WITH (security_invoker = on) AS
SELECT
  cp.id                                                                    AS vinculo_id,
  c.id                                                                     AS conciliacao_id,
  c.company_id,
  c.status                                                                 AS conciliacao_status,
  c.match_type,
  c.confidence,
  c.diferenca                                                              AS conciliacao_diferenca,
  c.created_at                                                             AS conciliado_em,
  mb.id                                                                    AS movimentacao_id,
  mb.data                                                                  AS data_mov,
  mb.descricao                                                             AS descricao_mov,
  mb.valor                                                                 AS valor_mov,
  mb.tipo                                                                  AS tipo_mov,
  mb.categoria                                                             AS categoria_mov,
  mb.origem                                                                AS origem_extrato,
  mb.fitid,
  cb.nome                                                                  AS conta_nome,
  cb.banco                                                                 AS conta_banco,
  CASE
    WHEN cp.parcela_id IS NOT NULL       THEN 'parcela'
    WHEN cp.medicao_id IS NOT NULL       THEN 'medicao'
    WHEN cp.mutuo_parcela_id IS NOT NULL THEN 'mutuo_parcela'
    WHEN cp.mutuo_id IS NOT NULL         THEN 'mutuo_principal'
    ELSE 'orfa'
  END                                                                      AS origem_tipo,
  COALESCE(cp.parcela_id, cp.medicao_id, cp.mutuo_parcela_id, cp.mutuo_id) AS origem_id,
  cp.valor_aplicado,
  cp.valor_juros,
  cp.valor_multa,
  cp.valor_desconto,
  (cp.valor_juros + cp.valor_multa - cp.valor_desconto)                    AS encargos_liquidos,
  (cp.valor_aplicado + cp.valor_juros + cp.valor_multa - cp.valor_desconto) AS valor_bruto_aplicado,
  cp.observacao                                                            AS vinculo_observacao,
  CASE
    WHEN cp.parcela_id IS NOT NULL THEN
      COALESCE(
        NULLIF('Pedido #' || ped.numero_pedido::text || ' - Parc ' || p.numero_parcela::text, 'Pedido # - Parc '),
        p.descricao,
        'Parcela ' || p.numero_parcela::text
      )
    WHEN cp.medicao_id IS NOT NULL       THEN 'Medição ' || med.numero::text
    WHEN cp.mutuo_parcela_id IS NOT NULL THEN 'Mútuo ' || mut_p.nome || ' - Parc ' || mp.numero_parcela::text
    WHEN cp.mutuo_id IS NOT NULL         THEN 'Mútuo (principal) ' || mut.nome
  END                                                                      AS origem_descricao,
  CASE
    WHEN cp.parcela_id IS NOT NULL       THEN forn_p.nome
    WHEN cp.mutuo_parcela_id IS NOT NULL THEN forn_mp.nome
    WHEN cp.mutuo_id IS NOT NULL         THEN forn_m.nome
  END                                                                      AS contraparte_nome,
  CASE
    WHEN cp.parcela_id IS NOT NULL       THEN p.valor
    WHEN cp.medicao_id IS NOT NULL       THEN med.valor_planejado
    WHEN cp.mutuo_parcela_id IS NOT NULL THEN mp.valor
    WHEN cp.mutuo_id IS NOT NULL         THEN mut.valor_captado
  END                                                                      AS origem_valor_total,
  CASE
    WHEN cp.parcela_id IS NOT NULL       THEN COALESCE(p.valor_pago, 0)
    WHEN cp.medicao_id IS NOT NULL       THEN COALESCE(med.valor_liberado, 0)
    WHEN cp.mutuo_parcela_id IS NOT NULL THEN COALESCE(mp.valor_pago, 0)
    WHEN cp.mutuo_id IS NOT NULL         THEN (
      SELECT COALESCE(SUM(cp2.valor_aplicado), 0)
      FROM public.conciliacao_parcelas cp2
      JOIN public.conciliacoes c2 ON c2.id = cp2.conciliacao_id
      WHERE cp2.mutuo_id = cp.mutuo_id
        AND c2.status IN ('confirmado','aprovado')
    )
  END                                                                      AS origem_valor_realizado,
  CASE
    WHEN cp.parcela_id IS NOT NULL       THEN COALESCE(p.data_prevista_pagamento, p.data_vencimento)
    WHEN cp.medicao_id IS NOT NULL       THEN med.data_prevista
    WHEN cp.mutuo_parcela_id IS NOT NULL THEN mp.data_vencimento
    WHEN cp.mutuo_id IS NOT NULL         THEN mut.data_captacao
  END                                                                      AS origem_data_prevista,
  CASE
    WHEN cp.parcela_id IS NOT NULL       THEN p.status
    WHEN cp.medicao_id IS NOT NULL       THEN med.status
    WHEN cp.mutuo_parcela_id IS NOT NULL THEN mp.status
    WHEN cp.mutuo_id IS NOT NULL         THEN mut.status
  END                                                                      AS origem_status,
  ped.numero_pedido                                                        AS pedido_numero,
  p.numero_parcela                                                         AS parcela_numero,
  p.tipo                                                                   AS parcela_tipo,
  mut.tipo                                                                 AS mutuo_tipo
FROM public.conciliacao_parcelas cp
JOIN public.conciliacoes c              ON c.id  = cp.conciliacao_id
JOIN public.movimentacoes_bancarias mb  ON mb.id = c.movimentacao_id
JOIN public.contas_bancarias cb         ON cb.id = mb.conta_id
LEFT JOIN public.parcelas p             ON p.id  = cp.parcela_id AND p.deleted_at IS NULL
LEFT JOIN public.pedidos ped            ON ped.id = p.pedido_id
LEFT JOIN public.fornecedores forn_p    ON forn_p.id = ped.fornecedor_id
LEFT JOIN public.medicoes med           ON med.id = cp.medicao_id
LEFT JOIN public.mutuo_parcelas mp      ON mp.id  = cp.mutuo_parcela_id
LEFT JOIN public.mutuos mut_p           ON mut_p.id = mp.mutuo_id
LEFT JOIN public.fornecedores forn_mp   ON forn_mp.id = mut_p.fornecedor_id
LEFT JOIN public.mutuos mut             ON mut.id = cp.mutuo_id
LEFT JOIN public.fornecedores forn_m    ON forn_m.id = mut.fornecedor_id
WHERE c.status IN ('confirmado','aprovado');

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
  (SELECT COALESCE(SUM(cp.valor_aplicado + cp.valor_juros + cp.valor_multa - cp.valor_desconto),0)
   FROM public.conciliacao_parcelas cp
   JOIN public.conciliacoes c2 ON c2.id = cp.conciliacao_id
   WHERE c2.movimentacao_id = mb.id
     AND c2.status IN ('confirmado','aprovado')) AS soma_vinculos,
  (SELECT COALESCE(SUM(cp.valor_aplicado),0) FROM public.conciliacao_parcelas cp
   JOIN public.conciliacoes c2 ON c2.id = cp.conciliacao_id
   WHERE c2.movimentacao_id = mb.id
     AND c2.status IN ('confirmado','aprovado')) AS soma_principal,
  (SELECT COALESCE(SUM(cp.valor_juros),0) FROM public.conciliacao_parcelas cp
   JOIN public.conciliacoes c2 ON c2.id = cp.conciliacao_id
   WHERE c2.movimentacao_id = mb.id
     AND c2.status IN ('confirmado','aprovado')) AS soma_juros,
  (SELECT COALESCE(SUM(cp.valor_multa),0) FROM public.conciliacao_parcelas cp
   JOIN public.conciliacoes c2 ON c2.id = cp.conciliacao_id
   WHERE c2.movimentacao_id = mb.id
     AND c2.status IN ('confirmado','aprovado')) AS soma_multa,
  (SELECT COALESCE(SUM(cp.valor_desconto),0) FROM public.conciliacao_parcelas cp
   JOIN public.conciliacoes c2 ON c2.id = cp.conciliacao_id
   WHERE c2.movimentacao_id = mb.id
     AND c2.status IN ('confirmado','aprovado')) AS soma_desconto,
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
    SELECT SUM(cp.valor_aplicado + cp.valor_juros + cp.valor_multa - cp.valor_desconto)
    FROM public.conciliacao_parcelas cp
    JOIN public.conciliacoes c2 ON c2.id = cp.conciliacao_id
    WHERE c2.movimentacao_id = mb.id
      AND c2.status IN ('confirmado','aprovado')
  ), 0))                          AS diferenca_vinculo,
  mb.observacao
FROM public.movimentacoes_bancarias mb
JOIN public.contas_bancarias cb ON cb.id = mb.conta_id;

GRANT SELECT ON public.vw_conciliacao_realizado          TO authenticated;
GRANT SELECT ON public.vw_extrato_completo               TO authenticated;
