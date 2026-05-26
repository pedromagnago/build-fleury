-- =============================================================================
-- parcelas.nf_origem_id — rastreia qual NF gerou/regenerou cada parcela
-- =============================================================================
-- Problema: pedidos.nf_origem_id só é gravado quando NULL (primeira NF wins).
-- Quando uma segunda NF processa o mesmo pedido (substituir_pedido), as
-- parcelas regeneradas por ela ficavam exibindo a NF anterior no Pagamentos,
-- porque a UI lia o campo do pedido, não da parcela.
--
-- Solução: adicionar nf_origem_id em parcelas. A RPC seta o campo em toda
-- parcela que cria (saldo dos consumidos + parcelas do âncora). A UI prefere
-- parcela.nf_origem_id e só cai em pedido.nf_origem_id como fallback.
-- =============================================================================

-- 1) Coluna
ALTER TABLE parcelas
  ADD COLUMN IF NOT EXISTS nf_origem_id uuid REFERENCES recepcao_docs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS parcelas_nf_origem_id_idx
  ON parcelas(nf_origem_id) WHERE nf_origem_id IS NOT NULL;

-- 2) Backfill: parcelas de saldo ("Saldo apos consumo NF XXXX")
--    Extrai o número da NF da descrição e resolve para o doc_id correto.
UPDATE parcelas pa
SET nf_origem_id = rd.id
FROM recepcao_docs rd
WHERE pa.descricao LIKE 'Saldo apos consumo NF %'
  AND rd.numero_doc = TRIM(SUBSTRING(pa.descricao FROM LENGTH('Saldo apos consumo NF ') + 1))
  AND rd.company_id = pa.company_id
  AND pa.nf_origem_id IS NULL;

-- 3) Backfill: demais parcelas de pedidos (parcelas do âncora sem descrição especial)
UPDATE parcelas pa
SET nf_origem_id = p.nf_origem_id
FROM pedidos p
WHERE pa.pedido_id = p.id
  AND p.nf_origem_id IS NOT NULL
  AND pa.nf_origem_id IS NULL;

-- =============================================================================
-- 4) RPC aplicar_recepcao_nf — v8: persiste nf_origem_id em cada parcela criada
--    Delta vs v7 (20260518180000): dois INSERTs de parcelas ganham nf_origem_id.
--    Resto idêntico (transcrito para manter o arquivo auto-suficiente).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.aplicar_recepcao_nf(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_company_id uuid := NULLIF(payload->>'company_id','')::uuid;
  v_force_replace_doc_id uuid := NULLIF(payload->>'force_replace_doc_id','')::uuid;
  v_chave_acesso text := regexp_replace(COALESCE(payload->'doc'->>'chave_acesso',''), '\D', '', 'g');
  v_origem text := COALESCE(payload->'doc'->>'origem','texto');
  v_numero_doc text := NULLIF(payload->'doc'->>'numero','');
  v_serie text := NULLIF(payload->'doc'->>'serie','');
  v_data_emissao date := NULLIF(payload->'doc'->>'data_emissao','')::date;
  v_valor_total numeric := NULLIF(payload->'doc'->>'valor_total','')::numeric;
  v_valor_frete numeric := COALESCE(NULLIF(payload->'doc'->>'valor_frete','')::numeric, 0);
  v_modelo_ia text := NULLIF(payload->'doc'->>'modelo_ia','');
  v_custo_ia_cents numeric := COALESCE(NULLIF(payload->'doc'->>'custo_ia_cents','')::numeric, 0);
  v_raw_extracao jsonb := payload->'doc'->'raw_extracao';
  v_fornecedor_nome text := NULLIF(payload->'fornecedor'->>'nome','');
  v_fornecedor_cnpj text := regexp_replace(COALESCE(payload->'fornecedor'->>'cnpj',''), '\D', '', 'g');
  v_fornecedor_id uuid;
  v_cond_pagamento text := NULLIF(payload->>'cond_pagamento','');
  v_doc_id uuid;
  v_existing_doc_id uuid;
  v_novo_pedido_id uuid := NULL;
  v_item_ancora_id uuid := NULL;
  v_pedido_ancora_sem_itens boolean := false;
  v_pedidos_consumidos_count int := 0;
  v_pedidos_consumidos_ids uuid[] := '{}'::uuid[];
  v_previsoes_cobertas_count int := 0;
  v_itens_novos_count int := 0;
  v_linhas_ignoradas_count int := 0;
  v_parcelas_preservadas_count int := 0;
  v_replaced boolean := false;
  v_warnings text[] := '{}'::text[];
  rec_linha record;
  rec_pi record;
  rec_ped record;
  rec_parcela record;
  v_restante numeric;
  v_valor_restante numeric;
  v_disponivel numeric;
  v_consumir numeric;
  v_nova_qtd_rec numeric;
  v_houve_consumo boolean := false;
  v_tem_frete_ou_parcelas boolean := false;
  v_precisa_ancora boolean := false;
  v_ancora_qtd numeric := 0;
  v_ancora_vu numeric := 0;
  v_saldo numeric;
  v_parcelas_count_payload int := 0;
  v_valor_pago numeric;
  v_protegidas_count int;
  v_parcelas_snapshot jsonb := '[]'::jsonb;
  v_parcelas_regeradas_ids uuid[] := '{}'::uuid[];
  v_parcela_saldo_id uuid;
  v_is_previsao boolean;
  v_pedido_previsao_id uuid;
  v_saldo_previsao_disp numeric;
  v_valor_cobrir numeric;
  v_pi_previsao_id uuid;
  v_a_reduzir numeric;
  v_reducao numeric;
BEGIN
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id obrigatorio'; END IF;
  IF NOT public.user_can_access_company(auth.uid(), v_company_id) THEN
    RAISE EXCEPTION 'Acesso negado a company %', v_company_id;
  END IF;

  IF length(COALESCE(v_chave_acesso,'')) = 44 THEN
    SELECT id INTO v_existing_doc_id FROM recepcao_docs
    WHERE company_id = v_company_id AND chave_acesso = v_chave_acesso LIMIT 1;
    IF v_existing_doc_id IS NOT NULL THEN
      IF v_force_replace_doc_id IS NULL OR v_existing_doc_id <> v_force_replace_doc_id THEN
        RAISE EXCEPTION 'NF com chave_acesso % ja aplicada (doc_id %)', v_chave_acesso, v_existing_doc_id
          USING ERRCODE = 'unique_violation', HINT = v_existing_doc_id::text;
      END IF;
      DELETE FROM recepcao_docs WHERE id = v_existing_doc_id;
      v_replaced := true;
    END IF;
  END IF;

  IF v_fornecedor_cnpj <> '' THEN
    SELECT id INTO v_fornecedor_id FROM fornecedores
    WHERE company_id = v_company_id AND regexp_replace(COALESCE(cnpj,''),'\D','','g') = v_fornecedor_cnpj LIMIT 1;
  END IF;
  IF v_fornecedor_id IS NULL AND v_fornecedor_nome IS NOT NULL THEN
    SELECT id INTO v_fornecedor_id FROM fornecedores
    WHERE company_id = v_company_id AND lower(nome) = lower(v_fornecedor_nome) LIMIT 1;
  END IF;
  IF v_fornecedor_id IS NULL AND v_fornecedor_nome IS NOT NULL THEN
    INSERT INTO fornecedores (company_id, nome, cnpj, tipo)
    VALUES (v_company_id, v_fornecedor_nome, NULLIF(v_fornecedor_cnpj,''), 'fornecedor')
    RETURNING id INTO v_fornecedor_id;
  END IF;

  INSERT INTO recepcao_docs (
    company_id, origem, fornecedor_id, fornecedor_nome, fornecedor_cnpj,
    numero_doc, serie, data_emissao, valor_total, valor_frete, chave_acesso,
    raw_extracao, modelo_ia, custo_ia_cents, status, applied_at
  ) VALUES (
    v_company_id, v_origem, v_fornecedor_id, v_fornecedor_nome, NULLIF(v_fornecedor_cnpj,''),
    v_numero_doc, v_serie, v_data_emissao, v_valor_total, v_valor_frete, NULLIF(v_chave_acesso,''),
    v_raw_extracao, v_modelo_ia, v_custo_ia_cents, 'aplicado', now()
  ) RETURNING id INTO v_doc_id;

  CREATE TEMP TABLE _linhas (
    ordem int, acao_in text, acao_out text, descricao text, ncm text, unidade text,
    quantidade numeric, valor_unitario numeric, valor_total numeric,
    item_compra_id uuid, pedido_substituido_id uuid, sugestoes jsonb, qtd_restante numeric
  ) ON COMMIT DROP;

  INSERT INTO _linhas (
    ordem, acao_in, acao_out, descricao, ncm, unidade,
    quantidade, valor_unitario, valor_total,
    item_compra_id, pedido_substituido_id, sugestoes, qtd_restante
  )
  SELECT
    COALESCE(NULLIF(l->>'ordem','')::int, idx::int),
    l->>'acao', l->>'acao',
    l->>'descricao', NULLIF(l->>'ncm',''), NULLIF(l->>'unidade',''),
    COALESCE(NULLIF(l->>'quantidade','')::numeric, 0),
    COALESCE(NULLIF(l->>'valor_unitario','')::numeric, 0),
    COALESCE(NULLIF(l->>'valor_total','')::numeric,
      COALESCE(NULLIF(l->>'quantidade','')::numeric, 0) * COALESCE(NULLIF(l->>'valor_unitario','')::numeric, 0)),
    NULLIF(l->>'item_compra_id','')::uuid,
    NULLIF(l->>'pedido_substituido_id','')::uuid,
    l->'sugestoes',
    COALESCE(NULLIF(l->>'quantidade','')::numeric, 0)
  FROM jsonb_array_elements(COALESCE(payload->'linhas','[]'::jsonb)) WITH ORDINALITY AS t(l, idx)
  WHERE (l->>'acao') IN ('substituir_pedido','criar_pedido')
    AND NULLIF(l->>'item_compra_id','') IS NOT NULL;

  SELECT COUNT(*) INTO v_linhas_ignoradas_count
  FROM jsonb_array_elements(COALESCE(payload->'linhas','[]'::jsonb)) AS l
  WHERE NOT ((l->>'acao') IN ('substituir_pedido','criar_pedido')
    AND NULLIF(l->>'item_compra_id','') IS NOT NULL);

  CREATE TEMP TABLE _consumo_log (
    pedido_item_id uuid, pedido_id uuid,
    delta_qtd_recebida numeric, valor_consumido numeric,
    valor_coberto_previsao numeric
  ) ON COMMIT DROP;

  CREATE TEMP TABLE _pedido_info (
    pedido_id uuid PRIMARY KEY,
    valor_total_real numeric, cond_pagamento text, data_entrega_prevista date,
    is_previsao boolean
  ) ON COMMIT DROP;

  FOR rec_linha IN
    SELECT * FROM _linhas
    WHERE acao_in = 'substituir_pedido'
      AND (quantidade > 0 OR COALESCE(valor_total, 0) > 0)
    ORDER BY ordem
  LOOP
    v_restante := COALESCE(rec_linha.quantidade, 0);
    v_valor_restante := COALESCE(rec_linha.valor_total, rec_linha.quantidade * rec_linha.valor_unitario, 0);
    v_is_previsao := false;
    v_pedido_previsao_id := NULL;

    IF rec_linha.pedido_substituido_id IS NOT NULL THEN
      SELECT is_previsao_orcamento INTO v_is_previsao
      FROM pedidos WHERE id = rec_linha.pedido_substituido_id;
      IF v_is_previsao THEN
        v_pedido_previsao_id := rec_linha.pedido_substituido_id;
      END IF;
    END IF;

    IF v_is_previsao AND v_pedido_previsao_id IS NOT NULL THEN
      SELECT GREATEST(
          COALESCE(p.valor_total_real, 0)
          - COALESCE((SELECT SUM(COALESCE(valor_pago, 0)) FROM parcelas WHERE pedido_id = p.id), 0)
          - COALESCE(p.valor_coberto_por_realizacao, 0), 0)
      INTO v_saldo_previsao_disp
      FROM pedidos p WHERE p.id = v_pedido_previsao_id;
      v_valor_cobrir := LEAST(v_valor_restante, v_saldo_previsao_disp);
      IF v_valor_cobrir > 0.01 THEN
        UPDATE pedidos
        SET valor_coberto_por_realizacao = COALESCE(valor_coberto_por_realizacao, 0) + v_valor_cobrir
        WHERE id = v_pedido_previsao_id;
        SELECT id INTO v_pi_previsao_id FROM pedido_itens
        WHERE pedido_id = v_pedido_previsao_id AND item_compra_id = rec_linha.item_compra_id
        ORDER BY ordem LIMIT 1;
        INSERT INTO _consumo_log (pedido_item_id, pedido_id, delta_qtd_recebida, valor_consumido, valor_coberto_previsao)
        VALUES (v_pi_previsao_id, v_pedido_previsao_id, 0, v_valor_cobrir, v_valor_cobrir);
        v_a_reduzir := v_valor_cobrir;
        FOR rec_parcela IN
          SELECT par.id, par.valor
          FROM parcelas par
          WHERE par.pedido_id = v_pedido_previsao_id
            AND par.status NOT IN ('paga','parcialmente_paga')
            AND COALESCE(par.valor_pago, 0) = 0
            AND NOT EXISTS (SELECT 1 FROM conciliacao_parcelas cp WHERE cp.parcela_id = par.id)
          ORDER BY par.data_vencimento DESC NULLS LAST, par.numero_parcela DESC
        LOOP
          EXIT WHEN v_a_reduzir <= 0.01;
          v_reducao := LEAST(rec_parcela.valor, v_a_reduzir);
          IF rec_parcela.valor - v_reducao <= 0.01 THEN
            UPDATE movimentacoes_bancarias SET parcela_id = NULL WHERE parcela_id = rec_parcela.id;
            DELETE FROM parcelas WHERE id = rec_parcela.id;
          ELSE
            UPDATE parcelas SET
              valor = valor - v_reducao,
              descricao = COALESCE(descricao,'') ||
                format(' [reduzida em R$ %s por cobertura NF %s]', v_reducao::text, COALESCE(v_numero_doc,'?'))
            WHERE id = rec_parcela.id;
          END IF;
          v_a_reduzir := v_a_reduzir - v_reducao;
        END LOOP;
        v_previsoes_cobertas_count := v_previsoes_cobertas_count + 1;
        v_houve_consumo := true;
        v_valor_restante := v_valor_restante - v_valor_cobrir;
        IF rec_linha.valor_unitario > 0 THEN
          v_restante := v_valor_restante / rec_linha.valor_unitario;
        END IF;
      END IF;
    END IF;

    FOR rec_pi IN
      SELECT pi.id AS pi_id, pi.pedido_id, pi.qtd, pi.qtd_recebida,
             p.nf_origem_id, p.valor_total_real, p.cond_pagamento,
             p.data_entrega_prevista, p.created_at
      FROM pedido_itens pi
      INNER JOIN pedidos p ON p.id = pi.pedido_id
      WHERE pi.item_compra_id = rec_linha.item_compra_id
        AND p.company_id = v_company_id
        AND p.status IN ('planejado','pedido_enviado','parcialmente_entregue',
                         'entregue','parcialmente_pago','pago')
        AND COALESCE(p.is_previsao_orcamento, false) = false
      ORDER BY p.created_at ASC, p.id ASC
    LOOP
      EXIT WHEN v_restante <= 0.001;
      v_disponivel := GREATEST(rec_pi.qtd - rec_pi.qtd_recebida, 0);
      CONTINUE WHEN v_disponivel <= 0.001;
      v_consumir := LEAST(v_restante, v_disponivel);
      v_nova_qtd_rec := rec_pi.qtd_recebida + v_consumir;
      UPDATE pedido_itens SET qtd_recebida = v_nova_qtd_rec WHERE id = rec_pi.pi_id;
      IF rec_pi.nf_origem_id IS NULL THEN
        UPDATE pedidos SET nf_origem_id = v_doc_id,
          data_entrega_real = COALESCE(v_data_emissao, data_entrega_real)
        WHERE id = rec_pi.pedido_id;
      END IF;
      INSERT INTO _consumo_log (pedido_item_id, pedido_id, delta_qtd_recebida, valor_consumido, valor_coberto_previsao)
      VALUES (rec_pi.pi_id, rec_pi.pedido_id, v_consumir, v_consumir * rec_linha.valor_unitario, NULL);
      INSERT INTO _pedido_info (pedido_id, valor_total_real, cond_pagamento, data_entrega_prevista, is_previsao)
      VALUES (rec_pi.pedido_id, COALESCE(rec_pi.valor_total_real, 0),
              rec_pi.cond_pagamento, rec_pi.data_entrega_prevista, false)
      ON CONFLICT (pedido_id) DO NOTHING;
      v_houve_consumo := true;
      v_restante := v_restante - v_consumir;
      v_valor_restante := v_valor_restante - (v_consumir * rec_linha.valor_unitario);
    END LOOP;

    IF v_restante > 0.001 THEN
      UPDATE _linhas SET acao_out = 'sobra_p_ancora', qtd_restante = v_restante
      WHERE ordem = rec_linha.ordem AND item_compra_id = rec_linha.item_compra_id;
    ELSIF v_valor_restante > 0.01 AND COALESCE(rec_linha.quantidade, 0) = 0 THEN
      UPDATE _linhas SET acao_out = 'sobra_p_ancora', qtd_restante = 0
      WHERE ordem = rec_linha.ordem AND item_compra_id = rec_linha.item_compra_id;
    ELSE
      UPDATE _linhas SET acao_out = 'consumido_total', qtd_restante = 0
      WHERE ordem = rec_linha.ordem AND item_compra_id = rec_linha.item_compra_id;
    END IF;
  END LOOP;

  v_pedidos_consumidos_count := COALESCE((SELECT COUNT(DISTINCT pedido_id) FROM _consumo_log WHERE valor_coberto_previsao IS NULL), 0);
  SELECT COALESCE(array_agg(DISTINCT pedido_id), '{}'::uuid[])
    INTO v_pedidos_consumidos_ids FROM _consumo_log WHERE valor_coberto_previsao IS NULL;

  v_parcelas_count_payload := jsonb_array_length(COALESCE(payload->'parcelas','[]'::jsonb));
  v_tem_frete_ou_parcelas := v_valor_frete > 0 OR v_parcelas_count_payload > 0;
  v_precisa_ancora := EXISTS (SELECT 1 FROM _linhas WHERE acao_out IN ('criar_pedido','sobra_p_ancora'))
                       OR (v_houve_consumo AND v_tem_frete_ou_parcelas AND v_pedidos_consumidos_count > 0)
                       OR v_tem_frete_ou_parcelas;

  SELECT item_compra_id INTO v_item_ancora_id FROM _linhas
  WHERE acao_out IN ('criar_pedido','sobra_p_ancora') ORDER BY ordem LIMIT 1;
  IF v_item_ancora_id IS NULL THEN
    SELECT item_compra_id INTO v_item_ancora_id FROM _linhas ORDER BY ordem LIMIT 1;
  END IF;

  IF v_precisa_ancora AND v_item_ancora_id IS NOT NULL THEN
    v_pedido_ancora_sem_itens := NOT EXISTS (SELECT 1 FROM _linhas WHERE acao_out IN ('criar_pedido','sobra_p_ancora'));
    SELECT CASE WHEN acao_out = 'sobra_p_ancora' THEN qtd_restante ELSE quantidade END,
           valor_unitario INTO v_ancora_qtd, v_ancora_vu
    FROM _linhas WHERE acao_out IN ('criar_pedido','sobra_p_ancora') ORDER BY ordem LIMIT 1;
    v_ancora_qtd := COALESCE(v_ancora_qtd, 0);
    v_ancora_vu := COALESCE(v_ancora_vu, 0);
    INSERT INTO pedidos (
      company_id, fornecedor_id, item_compra_id,
      casas_lote, qtd_lote, valor_unitario_real, valor_total_real, valor_frete,
      cond_pagamento, data_entrega_prevista, data_entrega_real,
      status, observacoes, nf_origem_id
    ) VALUES (
      v_company_id, v_fornecedor_id, v_item_ancora_id,
      NULL, v_ancora_qtd, v_ancora_vu, 0, v_valor_frete,
      v_cond_pagamento, v_data_emissao, v_data_emissao,
      'planejado',
      CASE WHEN v_pedido_ancora_sem_itens
        THEN format('NF %s . %s . ancora financeiro', COALESCE(v_numero_doc,''), COALESCE(v_fornecedor_nome,'sem nome'))
        ELSE format('NF %s . %s', COALESCE(v_numero_doc,''), COALESCE(v_fornecedor_nome,'sem nome'))
      END,
      v_doc_id
    ) RETURNING id INTO v_novo_pedido_id;

    IF NOT v_pedido_ancora_sem_itens THEN
      INSERT INTO pedido_itens (
        pedido_id, item_compra_id, qtd, valor_unitario_real,
        valor_total_real, qtd_recebida, ordem
      )
      SELECT v_novo_pedido_id, l.item_compra_id,
        CASE WHEN l.acao_out = 'sobra_p_ancora' THEN l.qtd_restante ELSE l.quantidade END,
        l.valor_unitario,
        CASE WHEN l.acao_out = 'sobra_p_ancora' THEN l.qtd_restante * l.valor_unitario
             ELSE COALESCE(l.valor_total, l.quantidade * l.valor_unitario) END,
        CASE WHEN l.acao_out = 'sobra_p_ancora' THEN l.qtd_restante ELSE l.quantidade END,
        (ROW_NUMBER() OVER (ORDER BY l.ordem))::int
      FROM _linhas l
      WHERE l.acao_out IN ('criar_pedido','sobra_p_ancora')
        AND (CASE WHEN l.acao_out = 'sobra_p_ancora' THEN l.qtd_restante ELSE l.quantidade END) > 0;
      GET DIAGNOSTICS v_itens_novos_count = ROW_COUNT;
    END IF;
  END IF;

  IF v_novo_pedido_id IS NOT NULL AND array_length(v_pedidos_consumidos_ids, 1) > 0 THEN
    CREATE TEMP TABLE _parcelas_existentes ON COMMIT DROP AS
      SELECT p.*,
             EXISTS (SELECT 1 FROM conciliacao_parcelas cp WHERE cp.parcela_id = p.id) AS tem_link_concil,
             (p.status IN ('paga','parcialmente_paga') OR COALESCE(p.valor_pago,0) > 0
              OR EXISTS (SELECT 1 FROM conciliacao_parcelas cp WHERE cp.parcela_id = p.id)) AS protegida
      FROM parcelas p WHERE p.pedido_id = ANY(v_pedidos_consumidos_ids);
    SELECT COUNT(*) INTO v_parcelas_preservadas_count FROM _parcelas_existentes WHERE protegida;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'company_id', company_id, 'pedido_id', pedido_id,
      'numero_parcela', numero_parcela, 'valor', valor,
      'data_vencimento', data_vencimento, 'status', status,
      'descricao', descricao, 'tipo', tipo, 'created_at', created_at)), '[]'::jsonb)
    INTO v_parcelas_snapshot FROM _parcelas_existentes WHERE NOT protegida;
    UPDATE movimentacoes_bancarias SET parcela_id = NULL
     WHERE parcela_id IN (SELECT id FROM _parcelas_existentes WHERE NOT protegida);
    DELETE FROM parcelas WHERE id IN (SELECT id FROM _parcelas_existentes WHERE NOT protegida);
    FOR rec_ped IN
      SELECT pi.pedido_id, pi.valor_total_real, pi.cond_pagamento, pi.data_entrega_prevista,
             (SELECT COALESCE(SUM(valor_consumido),0) FROM _consumo_log cl
              WHERE cl.pedido_id = pi.pedido_id AND cl.valor_coberto_previsao IS NULL) AS consumido_pela_nf
      FROM _pedido_info pi WHERE NOT COALESCE(pi.is_previsao, false)
    LOOP
      SELECT COALESCE(SUM(COALESCE(valor_pago, valor)), 0), COUNT(*)
        INTO v_valor_pago, v_protegidas_count
        FROM _parcelas_existentes WHERE pedido_id = rec_ped.pedido_id AND protegida;
      v_saldo := ROUND((COALESCE(rec_ped.valor_total_real, 0)
        - COALESCE(rec_ped.consumido_pela_nf, 0) - COALESCE(v_valor_pago, 0))::numeric, 2);
      IF v_saldo > 0.01 THEN
        v_parcela_saldo_id := gen_random_uuid();
        -- v8: inclui nf_origem_id para rastrear qual NF gerou esta parcela de saldo
        INSERT INTO parcelas (
          id, company_id, pedido_id, numero_parcela, valor,
          data_vencimento, status, descricao, tipo, nf_origem_id
        ) VALUES (
          v_parcela_saldo_id, v_company_id, rec_ped.pedido_id, v_protegidas_count + 1, v_saldo,
          COALESCE(rec_ped.data_entrega_prevista,
            (COALESCE(v_data_emissao, CURRENT_DATE) + INTERVAL '30 days')::date),
          'futura', format('Saldo apos consumo NF %s', COALESCE(v_numero_doc,'?')), 'contratual',
          v_doc_id
        );
        v_parcelas_regeradas_ids := array_append(v_parcelas_regeradas_ids, v_parcela_saldo_id);
      END IF;
    END LOOP;
  END IF;

  IF v_novo_pedido_id IS NOT NULL AND v_parcelas_count_payload > 0 THEN
    -- v8: inclui nf_origem_id nas parcelas do âncora (duplicatas da NF)
    INSERT INTO parcelas (
      company_id, pedido_id, numero_parcela, valor, data_vencimento, status, descricao, nf_origem_id
    )
    SELECT v_company_id, v_novo_pedido_id,
      COALESCE(NULLIF(p->>'numero_parcela','')::int, 1),
      NULLIF(p->>'valor','')::numeric,
      NULLIF(p->>'data_vencimento','')::date,
      'futura', NULLIF(p->>'descricao',''),
      v_doc_id
    FROM jsonb_array_elements(payload->'parcelas') AS p;
  END IF;

  INSERT INTO recepcao_consumos (
    doc_id, company_id, pedido_item_id, delta_qtd_recebida, created_pedido_id,
    parcelas_snapshot, parcelas_regeradas_ids, valor_coberto_previsao, valor_consumido
  )
  SELECT v_doc_id, v_company_id, pedido_item_id, delta_qtd_recebida, NULL, NULL, NULL,
         valor_coberto_previsao, valor_consumido
    FROM _consumo_log;

  IF v_novo_pedido_id IS NOT NULL THEN
    INSERT INTO recepcao_consumos (
      doc_id, company_id, pedido_item_id, delta_qtd_recebida, created_pedido_id,
      parcelas_snapshot, parcelas_regeradas_ids
    ) VALUES (
      v_doc_id, v_company_id, NULL, 0, v_novo_pedido_id,
      CASE WHEN jsonb_array_length(COALESCE(v_parcelas_snapshot,'[]'::jsonb)) > 0
           THEN v_parcelas_snapshot ELSE NULL END,
      CASE WHEN array_length(v_parcelas_regeradas_ids,1) > 0
           THEN v_parcelas_regeradas_ids ELSE NULL END
    );
  END IF;

  INSERT INTO recepcao_matches (
    doc_id, ordem, descricao_original, ncm, unidade,
    quantidade, valor_unitario, valor_total,
    sugestoes, acao, item_compra_id, pedido_substituido_id, pedido_criado_id, observacao
  )
  SELECT v_doc_id,
    COALESCE(NULLIF(l->>'ordem','')::int, idx::int),
    l->>'descricao', NULLIF(l->>'ncm',''), NULLIF(l->>'unidade',''),
    NULLIF(l->>'quantidade','')::numeric, NULLIF(l->>'valor_unitario','')::numeric,
    NULLIF(l->>'valor_total','')::numeric,
    l->'sugestoes', COALESCE(l->>'acao','ignorar'),
    NULLIF(l->>'item_compra_id','')::uuid,
    NULLIF(l->>'pedido_substituido_id','')::uuid,
    v_novo_pedido_id, NULLIF(l->>'observacao','')
  FROM jsonb_array_elements(COALESCE(payload->'linhas','[]'::jsonb)) WITH ORDINALITY AS t(l, idx);

  IF v_parcelas_preservadas_count > 0 THEN
    v_warnings := array_append(v_warnings,
      format('%s parcela(s) preservada(s).', v_parcelas_preservadas_count));
  END IF;
  IF array_length(v_parcelas_regeradas_ids, 1) > 0 THEN
    v_warnings := array_append(v_warnings,
      format('Saldo dos %s pedido(s) cobertos por 1 parcela unica.', array_length(v_parcelas_regeradas_ids, 1)));
  END IF;
  IF v_previsoes_cobertas_count > 0 THEN
    v_warnings := array_append(v_warnings,
      format('%s previsao(oes) cobertas por valor.', v_previsoes_cobertas_count));
  END IF;

  RETURN jsonb_build_object(
    'doc_id', v_doc_id,
    'novo_pedido_id', v_novo_pedido_id,
    'pedidos_consumidos_count', v_pedidos_consumidos_count,
    'pedidos_consumidos_ids', to_jsonb(v_pedidos_consumidos_ids),
    'previsoes_cobertas_count', v_previsoes_cobertas_count,
    'itens_novos_count', v_itens_novos_count,
    'linhas_ignoradas_count', v_linhas_ignoradas_count,
    'parcelas_preservadas_count', v_parcelas_preservadas_count,
    'pedido_ancora_sem_itens', v_pedido_ancora_sem_itens,
    'replaced_doc_id', CASE WHEN v_replaced THEN v_existing_doc_id ELSE NULL END,
    'warnings', to_jsonb(v_warnings)
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.aplicar_recepcao_nf(jsonb) TO authenticated;
