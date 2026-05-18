-- F2.d — Detecção e absorção de pedidos-fantasma
--
-- "Pedido-fantasma" = pedido criado via NF (nf_origem_id IS NOT NULL) cujo
-- item_compra_id ALSO existe num pedido planejado não-NF com saldo aberto da
-- mesma company. Sintoma do bug que F2.a previne daqui pra frente, mas que
-- deixou pedidos duplicados na base — eles duplicam a previsão financeira
-- (planejado + fantasma somam quando deveriam compartilhar).
--
-- Cria:
--   (1) view v_pedidos_fantasma_candidatos — sempre lista os candidatos
--   (2) RPC absorver_pedido_fantasma(p_fantasma_id, p_planejado_id) — faz
--       a absorção atomicamente: consome o saldo do planejado, migra parcelas,
--       redireciona TODOS os recepcao_consumos, vincula nf_origem_id no
--       planejado, marca o planejado com observação "[recebeu absorcao]"
--       (pra view não confundir com fantasma), deleta pedido_itens do
--       fantasma e cancela ele, grava audit log.
--
-- A absorção é DESTRUTIVA por natureza (deleta pedido_itens, migra parcelas)
-- e NÃO REVERSÍVEL. O operador chama por uma UI futura (ou direto via SQL)
-- caso a caso, depois de revisar a view.
--
-- Detalhes da view (refinamentos pra evitar falsos positivos):
--   • Filtra pedidos cujos pedido_itens estão TODOS fechados (qtd=qtd_recebida)
--     — assim distingue "fantasma puro" (nasceu fechado pela NF) de pedido
--     com itens mistos (algumas linhas fechadas, outras com saldo aberto).
--   • Exclui pedidos com observação contendo "[absorvido" (fantasma já tratado)
--     ou "[recebeu absorcao" (planejado que absorveu — não é fantasma).

BEGIN;

-- ============================================================================
-- VIEW: v_pedidos_fantasma_candidatos
-- ============================================================================
CREATE OR REPLACE VIEW public.v_pedidos_fantasma_candidatos AS
WITH ped_planejados_nao_nf AS (
  SELECT
    p.company_id,
    pi.item_compra_id,
    SUM(GREATEST(pi.qtd - pi.qtd_recebida, 0))                              AS saldo_qtd_total,
    SUM(GREATEST(pi.qtd - pi.qtd_recebida, 0) * pi.valor_unitario_real)     AS saldo_valor_total,
    array_agg(p.id ORDER BY p.created_at)                                   AS planejados_ids,
    array_agg(p.numero_pedido ORDER BY p.created_at)                        AS planejados_numeros
  FROM pedidos p
  JOIN pedido_itens pi ON pi.pedido_id = p.id
  WHERE p.nf_origem_id IS NULL
    AND p.status NOT IN ('cancelado', 'pago')
    AND pi.qtd > pi.qtd_recebida + 0.001
  GROUP BY p.company_id, pi.item_compra_id
),
ped_via_nf AS (
  SELECT
    p.company_id,
    p.id                   AS pedido_id,
    p.numero_pedido,
    p.fornecedor_id,
    f.nome                 AS fornecedor_nome,
    pi.item_compra_id,
    pi.qtd,
    pi.qtd_recebida,
    pi.valor_total_real,
    p.created_at,
    p.nf_origem_id
  FROM pedidos p
  JOIN pedido_itens pi   ON pi.pedido_id = p.id
  LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
  WHERE p.nf_origem_id IS NOT NULL
    AND p.status NOT IN ('cancelado')
    AND pi.qtd <= pi.qtd_recebida + 0.001          -- pedido_item fechado pela NF
    AND NOT EXISTS (                                -- e nenhum outro pedido_item com saldo
      SELECT 1 FROM pedido_itens pi2
      WHERE pi2.pedido_id = p.id
        AND pi2.qtd > pi2.qtd_recebida + 0.001
    )
    AND (p.observacoes IS NULL OR (
      p.observacoes NOT LIKE '%[absorvido%'         -- não é fantasma já tratado
      AND p.observacoes NOT LIKE '%[recebeu absorcao%'  -- nem planejado que absorveu
    ))
)
SELECT
  pnf.company_id,
  pnf.pedido_id                   AS fantasma_id,
  pnf.numero_pedido               AS fantasma_numero,
  pnf.fornecedor_nome             AS fornecedor_nf,
  pnf.item_compra_id,
  ic.codigo                       AS item_codigo,
  ic.descricao                    AS item_descricao,
  pnf.qtd                         AS qtd_fantasma,
  pnf.qtd_recebida                AS qtd_recebida_fantasma,
  pnf.valor_total_real            AS valor_fantasma,
  pnf.nf_origem_id,
  ppl.planejados_ids,
  ppl.planejados_numeros,
  ppl.saldo_qtd_total             AS saldo_planejados_qtd,
  ppl.saldo_valor_total           AS saldo_planejados_valor,
  pnf.created_at                  AS fantasma_criado_em
FROM ped_via_nf pnf
JOIN ped_planejados_nao_nf ppl
  ON ppl.company_id = pnf.company_id
 AND ppl.item_compra_id = pnf.item_compra_id
JOIN itens_compra ic ON ic.id = pnf.item_compra_id;

COMMENT ON VIEW public.v_pedidos_fantasma_candidatos IS
  'Pedidos criados via NF (nf_origem_id) cujo item_compra_id existe em pedido '
  'planejado não-NF da mesma company com saldo. Sintoma do bug de duplicação '
  'de previsão. Use absorver_pedido_fantasma() pra resolver caso a caso. '
  'Filtros: pedido_itens todos fechados, e obs não contém [absorvido nem [recebeu absorcao.';

GRANT SELECT ON public.v_pedidos_fantasma_candidatos TO authenticated;

-- ============================================================================
-- RPC: absorver_pedido_fantasma(fantasma_id, planejado_id)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.absorver_pedido_fantasma(
  p_fantasma_id uuid,
  p_planejado_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_company_id uuid;
  v_company_id_planejado uuid;
  v_fantasma record;
  v_planejado_pi record;
  v_saldo_planejado numeric;
  v_qtd_a_consumir numeric;
  v_parcelas_migradas int := 0;
  v_consumos_redirecionados int := 0;
  v_audit_id uuid;
BEGIN
  -- Validação básica
  SELECT p.company_id INTO v_company_id FROM pedidos p WHERE p.id = p_fantasma_id;
  SELECT p.company_id INTO v_company_id_planejado FROM pedidos p WHERE p.id = p_planejado_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Fantasma % nao encontrado', p_fantasma_id;
  END IF;
  IF v_company_id_planejado IS NULL THEN
    RAISE EXCEPTION 'Planejado % nao encontrado', p_planejado_id;
  END IF;
  IF v_company_id <> v_company_id_planejado THEN
    RAISE EXCEPTION 'Fantasma e planejado sao de companies diferentes';
  END IF;
  IF NOT public.user_can_access_company(auth.uid(), v_company_id) THEN
    RAISE EXCEPTION 'Acesso negado a company %', v_company_id;
  END IF;

  -- Carrega o fantasma (assume 1 item — RPC simples)
  SELECT pi.id AS pi_id, pi.item_compra_id, pi.qtd, pi.qtd_recebida,
         pi.valor_unitario_real, p.nf_origem_id, p.fornecedor_id, p.numero_pedido
  INTO v_fantasma
  FROM pedidos p
  JOIN pedido_itens pi ON pi.pedido_id = p.id
  WHERE p.id = p_fantasma_id
  ORDER BY pi.ordem LIMIT 1;

  IF v_fantasma.nf_origem_id IS NULL THEN
    RAISE EXCEPTION 'Pedido % nao e fantasma (sem nf_origem_id)', v_fantasma.numero_pedido;
  END IF;

  -- Acha pedido_item do planejado com saldo nesse item
  SELECT pi.id AS pi_id, pi.qtd, pi.qtd_recebida, pi.valor_unitario_real,
         GREATEST(pi.qtd - pi.qtd_recebida, 0) AS saldo
  INTO v_planejado_pi
  FROM pedido_itens pi
  JOIN pedidos p ON p.id = pi.pedido_id
  WHERE p.id = p_planejado_id
    AND pi.item_compra_id = v_fantasma.item_compra_id
    AND pi.qtd > pi.qtd_recebida + 0.001
  ORDER BY pi.ordem LIMIT 1;

  IF v_planejado_pi.pi_id IS NULL THEN
    RAISE EXCEPTION 'Planejado % nao tem saldo no item %',
      p_planejado_id, v_fantasma.item_compra_id;
  END IF;

  v_saldo_planejado := v_planejado_pi.saldo;
  v_qtd_a_consumir := LEAST(v_fantasma.qtd, v_saldo_planejado);

  -- 1) Incrementa qtd_recebida do planejado
  UPDATE pedido_itens
  SET qtd_recebida = qtd_recebida + v_qtd_a_consumir
  WHERE id = v_planejado_pi.pi_id;

  -- 2) Migra parcelas (preserva conciliações via FK)
  UPDATE parcelas SET pedido_id = p_planejado_id WHERE pedido_id = p_fantasma_id;
  GET DIAGNOSTICS v_parcelas_migradas = ROW_COUNT;

  -- 3) Redireciona TODOS recepcao_consumos cujo pedido_item_id aponta pros
  --    itens do fantasma — antes do DELETE pra evitar FK SET NULL que
  --    violaria CHECK (pedido_item_id OR created_pedido_id deve ser NOT NULL).
  UPDATE recepcao_consumos
  SET pedido_item_id = v_planejado_pi.pi_id,
      delta_qtd_recebida = v_qtd_a_consumir
  WHERE pedido_item_id IN (SELECT id FROM pedido_itens WHERE pedido_id = p_fantasma_id);
  GET DIAGNOSTICS v_consumos_redirecionados = ROW_COUNT;

  -- 4) Redireciona consumos cujo created_pedido_id é o fantasma
  UPDATE recepcao_consumos
  SET created_pedido_id = NULL,
      pedido_item_id = v_planejado_pi.pi_id,
      delta_qtd_recebida = v_qtd_a_consumir
  WHERE created_pedido_id = p_fantasma_id;

  -- 5) Vincula NF origem ao planejado (se vazio) + grava marca '[recebeu absorcao]'
  --    pra a view distinguir do fantasma puro.
  UPDATE pedidos
  SET nf_origem_id = COALESCE(nf_origem_id, v_fantasma.nf_origem_id),
      observacoes = COALESCE(observacoes, '') ||
        format(E'\n[recebeu absorcao do fantasma #%s em %s - %s un]',
               v_fantasma.numero_pedido, now()::date, v_qtd_a_consumir)
  WHERE id = p_planejado_id;

  -- 6) Deleta pedido_itens do fantasma (UPDATE qtd=0 viola CHECK qtd>0)
  DELETE FROM pedido_itens WHERE pedido_id = p_fantasma_id;

  -- 7) Cancela o fantasma com observação rastreável
  UPDATE pedidos
  SET status = 'cancelado',
      observacoes = COALESCE(observacoes, '') ||
        format(E'\n[absorvido em %s pelo planejado id=%s qtd=%s]',
               now()::date, p_planejado_id, v_qtd_a_consumir)
  WHERE id = p_fantasma_id;

  -- 8) Audit log
  INSERT INTO audit_logs (user_id, company_id, acao, tabela, registro_id, dados)
  VALUES (
    auth.uid(),
    v_company_id,
    'ABSORVER_FANTASMA',
    'pedidos',
    p_fantasma_id,
    jsonb_build_object(
      'fantasma_id', p_fantasma_id,
      'fantasma_numero', v_fantasma.numero_pedido,
      'planejado_id', p_planejado_id,
      'item_compra_id', v_fantasma.item_compra_id,
      'qtd_consumida', v_qtd_a_consumir,
      'parcelas_migradas', v_parcelas_migradas,
      'consumos_redirecionados', v_consumos_redirecionados,
      'nf_origem_id', v_fantasma.nf_origem_id
    )
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'fantasma_id', p_fantasma_id,
    'planejado_id', p_planejado_id,
    'qtd_consumida', v_qtd_a_consumir,
    'parcelas_migradas', v_parcelas_migradas,
    'consumos_redirecionados', v_consumos_redirecionados,
    'audit_id', v_audit_id
  );
END;
$func$;

COMMENT ON FUNCTION public.absorver_pedido_fantasma(uuid, uuid) IS
  'Absorve um pedido-fantasma (criado via NF) num pedido planejado existente: '
  'consome o saldo, migra parcelas, redireciona recepcao_consumos, marca o '
  'planejado com [recebeu absorcao], deleta itens do fantasma e cancela. '
  'NAO e reversivel — revise v_pedidos_fantasma_candidatos antes de chamar.';

GRANT EXECUTE ON FUNCTION public.absorver_pedido_fantasma(uuid, uuid) TO authenticated;

COMMIT;
