-- Views de exportação: realizado conciliado + planejado em aberto + movs sem conciliação
-- Usadas pelo botão "Exportar XLSX" na ConciliacaoPage.
-- security_invoker = on garante que as RLS das tabelas-base sejam respeitadas.

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
  -- Movimentação bancária (extrato)
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
  -- Origem polimórfica resolvida
  CASE
    WHEN cp.parcela_id IS NOT NULL       THEN 'parcela'
    WHEN cp.medicao_id IS NOT NULL       THEN 'medicao'
    WHEN cp.mutuo_parcela_id IS NOT NULL THEN 'mutuo_parcela'
    WHEN cp.mutuo_id IS NOT NULL         THEN 'mutuo_principal'
    ELSE 'orfa'
  END                                                                      AS origem_tipo,
  COALESCE(cp.parcela_id, cp.medicao_id, cp.mutuo_parcela_id, cp.mutuo_id) AS origem_id,
  cp.valor_aplicado,
  cp.observacao                                                            AS vinculo_observacao,
  -- Descrição amigável da origem
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
  -- Contraparte (fornecedor / credor)
  CASE
    WHEN cp.parcela_id IS NOT NULL       THEN forn_p.nome
    WHEN cp.mutuo_parcela_id IS NOT NULL THEN forn_mp.nome
    WHEN cp.mutuo_id IS NOT NULL         THEN forn_m.nome
  END                                                                      AS contraparte_nome,
  -- Snapshot da origem (situação atual, não a do momento da conciliação)
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
  -- Identificadores úteis na planilha
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

-- ─────────────────────────────────────────────────────────────────
-- Planejado em aberto (saldo > 0): parcelas + medições + mútuo_parcelas
-- ─────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.vw_planejado_aberto CASCADE;
CREATE VIEW public.vw_planejado_aberto
WITH (security_invoker = on) AS
SELECT
  p.company_id,
  'parcela'::text                                                          AS origem_tipo,
  p.id                                                                     AS origem_id,
  COALESCE(
    NULLIF('Pedido #' || ped.numero_pedido::text || ' - Parc ' || p.numero_parcela::text, 'Pedido # - Parc '),
    p.descricao,
    'Parcela ' || p.numero_parcela::text
  )                                                                        AS descricao,
  forn.nome                                                                AS contraparte_nome,
  ped.numero_pedido                                                        AS pedido_numero,
  p.numero_parcela,
  p.tipo                                                                   AS subtipo,
  p.status,
  COALESCE(p.data_prevista_pagamento, p.data_vencimento)                   AS data_prevista,
  p.data_vencimento,
  p.valor                                                                  AS valor_total,
  COALESCE(p.valor_pago, 0)                                                AS valor_realizado,
  (p.valor - COALESCE(p.valor_pago, 0))                                    AS saldo_aberto,
  (CURRENT_DATE - p.data_vencimento)                                       AS dias_atraso
FROM public.parcelas p
LEFT JOIN public.pedidos ped       ON ped.id = p.pedido_id
LEFT JOIN public.fornecedores forn ON forn.id = ped.fornecedor_id
WHERE p.deleted_at IS NULL
  AND (p.valor - COALESCE(p.valor_pago, 0)) > 0.01

UNION ALL

SELECT
  med.company_id,
  'medicao'::text                                                          AS origem_tipo,
  med.id                                                                   AS origem_id,
  'Medição ' || med.numero::text                                           AS descricao,
  NULL::text                                                               AS contraparte_nome,
  NULL::integer                                                            AS pedido_numero,
  med.numero                                                               AS numero_parcela,
  NULL::text                                                               AS subtipo,
  med.status,
  med.data_prevista,
  NULL::date                                                               AS data_vencimento,
  COALESCE(med.valor_planejado, 0)                                         AS valor_total,
  COALESCE(med.valor_liberado, 0)                                          AS valor_realizado,
  (COALESCE(med.valor_planejado, 0) - COALESCE(med.valor_liberado, 0))     AS saldo_aberto,
  CASE WHEN med.data_prevista IS NOT NULL
       THEN (CURRENT_DATE - med.data_prevista)
       ELSE NULL END                                                       AS dias_atraso
FROM public.medicoes med
WHERE (COALESCE(med.valor_planejado, 0) - COALESCE(med.valor_liberado, 0)) > 0.01

UNION ALL

SELECT
  mp.company_id,
  'mutuo_parcela'::text                                                    AS origem_tipo,
  mp.id                                                                    AS origem_id,
  'Mútuo ' || mut.nome || ' - Parc ' || mp.numero_parcela::text            AS descricao,
  forn.nome                                                                AS contraparte_nome,
  NULL::integer                                                            AS pedido_numero,
  mp.numero_parcela,
  mut.tipo                                                                 AS subtipo,
  mp.status,
  mp.data_vencimento                                                       AS data_prevista,
  mp.data_vencimento,
  mp.valor                                                                 AS valor_total,
  COALESCE(mp.valor_pago, 0)                                               AS valor_realizado,
  (mp.valor - COALESCE(mp.valor_pago, 0))                                  AS saldo_aberto,
  (CURRENT_DATE - mp.data_vencimento)                                      AS dias_atraso
FROM public.mutuo_parcelas mp
JOIN public.mutuos mut             ON mut.id  = mp.mutuo_id
LEFT JOIN public.fornecedores forn ON forn.id = mut.fornecedor_id
WHERE (mp.valor - COALESCE(mp.valor_pago, 0)) > 0.01;

-- ─────────────────────────────────────────────────────────────────
-- Movimentações sem conciliação confirmada/aprovada
-- ─────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.vw_movimentacoes_nao_conciliadas CASCADE;
CREATE VIEW public.vw_movimentacoes_nao_conciliadas
WITH (security_invoker = on) AS
SELECT
  mb.id              AS movimentacao_id,
  mb.company_id,
  mb.data            AS data_mov,
  mb.descricao,
  mb.valor,
  mb.tipo,
  mb.categoria,
  mb.origem          AS origem_extrato,
  mb.fitid,
  cb.nome            AS conta_nome,
  cb.banco           AS conta_banco,
  COALESCE(mb.observacao, '') AS observacao,
  EXISTS (
    SELECT 1 FROM public.conciliacoes c
    WHERE c.movimentacao_id = mb.id AND c.status = 'sugerido'
  )                  AS tem_sugestao
FROM public.movimentacoes_bancarias mb
JOIN public.contas_bancarias cb ON cb.id = mb.conta_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.conciliacoes c
  WHERE c.movimentacao_id = mb.id
    AND c.status IN ('confirmado','aprovado')
);

GRANT SELECT ON public.vw_conciliacao_realizado          TO authenticated;
GRANT SELECT ON public.vw_planejado_aberto               TO authenticated;
GRANT SELECT ON public.vw_movimentacoes_nao_conciliadas  TO authenticated;
