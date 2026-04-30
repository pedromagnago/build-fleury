-- ============================================================================
-- Project management: soft delete, edit, full duplication
-- Aplicada em prod via MCP em 2026-04-30
-- ============================================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_companies_deleted_at
  ON public.companies (deleted_at)
  WHERE deleted_at IS NULL;

-- update_project
CREATE OR REPLACE FUNCTION public.update_project(
  _id uuid,
  _razao_social text DEFAULT NULL,
  _nome_fantasia text DEFAULT NULL,
  _cnpj text DEFAULT NULL,
  _municipio text DEFAULT NULL,
  _estado text DEFAULT NULL,
  _qtd_casas integer DEFAULT NULL,
  _area_casa_m2 numeric DEFAULT NULL,
  _data_inicio_obras date DEFAULT NULL,
  _saldo_inicial_caixa numeric DEFAULT NULL,
  _faturamento_contrato numeric DEFAULT NULL,
  _custo_total_contrato numeric DEFAULT NULL,
  _custo_indireto numeric DEFAULT NULL,
  _custo_capital numeric DEFAULT NULL,
  _prazo_recebimento_dias integer DEFAULT NULL,
  _status text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb;
  v_after  jsonb;
BEGIN
  SELECT to_jsonb(c.*) INTO v_before FROM public.companies c WHERE c.id = _id;
  IF v_before IS NULL THEN
    RAISE EXCEPTION 'Projeto % não encontrado', _id;
  END IF;

  UPDATE public.companies SET
    razao_social = COALESCE(_razao_social, razao_social),
    nome_fantasia = COALESCE(_nome_fantasia, nome_fantasia),
    cnpj = COALESCE(_cnpj, cnpj),
    municipio = COALESCE(_municipio, municipio),
    estado = COALESCE(_estado, estado),
    qtd_casas = COALESCE(_qtd_casas, qtd_casas),
    area_casa_m2 = COALESCE(_area_casa_m2, area_casa_m2),
    data_inicio_obras = COALESCE(_data_inicio_obras, data_inicio_obras),
    saldo_inicial_caixa = COALESCE(_saldo_inicial_caixa, saldo_inicial_caixa),
    faturamento_contrato = COALESCE(_faturamento_contrato, faturamento_contrato),
    custo_total_contrato = COALESCE(_custo_total_contrato, custo_total_contrato),
    custo_indireto = COALESCE(_custo_indireto, custo_indireto),
    custo_capital = COALESCE(_custo_capital, custo_capital),
    prazo_recebimento_dias = COALESCE(_prazo_recebimento_dias, prazo_recebimento_dias),
    status = COALESCE(_status, status),
    updated_at = now()
  WHERE id = _id
  RETURNING to_jsonb(companies.*) INTO v_after;

  INSERT INTO public.audit_logs (company_id, tabela, registro_id, acao, agente, usuario_id, dados_antes, dados_depois, resumo)
  VALUES (_id, 'companies', _id, 'update', 'user', auth.uid(), v_before, v_after, 'Projeto atualizado');
END;
$$;

-- soft_delete_project
CREATE OR REPLACE FUNCTION public.soft_delete_project(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb;
BEGIN
  SELECT to_jsonb(c.*) INTO v_before FROM public.companies c WHERE c.id = _id;
  IF v_before IS NULL THEN
    RAISE EXCEPTION 'Projeto % não encontrado', _id;
  END IF;
  IF (v_before->>'deleted_at') IS NOT NULL THEN
    RAISE EXCEPTION 'Projeto % já está arquivado', _id;
  END IF;

  UPDATE public.companies
     SET deleted_at = now(),
         updated_at = now()
   WHERE id = _id;

  INSERT INTO public.audit_logs (company_id, tabela, registro_id, acao, agente, usuario_id, dados_antes, resumo)
  VALUES (_id, 'companies', _id, 'soft_delete', 'user', auth.uid(), v_before, 'Projeto arquivado (soft delete)');
END;
$$;

-- restore_project
CREATE OR REPLACE FUNCTION public.restore_project(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.companies
     SET deleted_at = NULL,
         updated_at = now()
   WHERE id = _id AND deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Projeto % não encontrado ou não está arquivado', _id;
  END IF;

  INSERT INTO public.audit_logs (company_id, tabela, registro_id, acao, agente, usuario_id, resumo)
  VALUES (_id, 'companies', _id, 'restore', 'user', auth.uid(), 'Projeto restaurado');
END;
$$;

-- duplicate_project_full: clona TUDO byte-por-byte
CREATE OR REPLACE FUNCTION public.duplicate_project_full(
  _source_id uuid,
  _new_razao_social text,
  _new_nome_fantasia text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  IF (SELECT 1 FROM public.companies WHERE id = _source_id AND deleted_at IS NULL) IS NULL THEN
    RAISE EXCEPTION 'Projeto origem % não encontrado ou arquivado', _source_id;
  END IF;

  INSERT INTO public.companies (
    razao_social, nome_fantasia, cnpj, municipio, estado, qtd_casas, area_casa_m2,
    data_inicio_obras, saldo_inicial_caixa, faturamento_contrato, custo_total_contrato,
    custo_indireto, custo_capital, prazo_recebimento_dias, status, config
  )
  SELECT
    _new_razao_social,
    COALESCE(_new_nome_fantasia, nome_fantasia),
    cnpj, municipio, estado, qtd_casas, area_casa_m2,
    data_inicio_obras, saldo_inicial_caixa, faturamento_contrato, custo_total_contrato,
    custo_indireto, custo_capital, prazo_recebimento_dias, status, config
  FROM public.companies WHERE id = _source_id
  RETURNING id INTO v_new_id;

  CREATE TEMP TABLE _map_etapas        (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _map_fornecedores  (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _map_itens_compra  (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _map_pedidos       (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _map_parcelas      (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _map_contas        (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _map_movs          (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _map_medicoes      (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _map_mutuos        (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _map_mutuo_parc    (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _map_conciliacoes  (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _map_despesas      (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _map_documentos    (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _map_cenarios      (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;

  WITH ins AS (
    INSERT INTO public.etapas (
      company_id, codigo, nome, ordem, data_inicio_plan, data_fim_plan,
      data_inicio_real, data_fim_real, casas_total, valor_total_orcado,
      status, depende_de, observacoes,
      faturamento_valor_total, faturamento_preco_unitario, faturamento_quantidade_unitaria, faturamento_unidade
    )
    SELECT
      v_new_id, codigo, nome, ordem, data_inicio_plan, data_fim_plan,
      data_inicio_real, data_fim_real, casas_total, valor_total_orcado,
      status, NULL, observacoes,
      faturamento_valor_total, faturamento_preco_unitario, faturamento_quantidade_unitaria, faturamento_unidade
    FROM public.etapas WHERE company_id = _source_id
    RETURNING id, codigo
  )
  INSERT INTO _map_etapas(old_id, new_id)
  SELECT e.id, ins.id FROM public.etapas e
  JOIN ins ON ins.codigo = e.codigo
  WHERE e.company_id = _source_id;

  UPDATE public.etapas e_new
     SET depende_de = m_dep.new_id
    FROM _map_etapas m_self
    JOIN public.etapas e_old ON e_old.id = m_self.old_id
    JOIN _map_etapas m_dep ON m_dep.old_id = e_old.depende_de
   WHERE e_new.id = m_self.new_id AND e_old.depende_de IS NOT NULL;

  WITH ins AS (
    INSERT INTO public.fornecedores (company_id, nome, cnpj, contato, cond_pagamento_padrao, observacoes, tipo)
    SELECT v_new_id, nome, cnpj, contato, cond_pagamento_padrao, observacoes, tipo
    FROM public.fornecedores WHERE company_id = _source_id
    RETURNING id, nome, COALESCE(cnpj, '') AS cnpj_k
  )
  INSERT INTO _map_fornecedores(old_id, new_id)
  SELECT f.id, ins.id FROM public.fornecedores f
  JOIN ins ON ins.nome = f.nome AND ins.cnpj_k = COALESCE(f.cnpj, '')
  WHERE f.company_id = _source_id;

  WITH ins AS (
    INSERT INTO public.contas_bancarias (company_id, nome, banco, agencia, conta, tipo, saldo_inicial, ativa)
    SELECT v_new_id, nome, banco, agencia, conta, tipo, saldo_inicial, ativa
    FROM public.contas_bancarias WHERE company_id = _source_id
    RETURNING id, nome
  )
  INSERT INTO _map_contas(old_id, new_id)
  SELECT cb.id, ins.id FROM public.contas_bancarias cb
  JOIN ins ON ins.nome = cb.nome
  WHERE cb.company_id = _source_id;

  WITH ins AS (
    INSERT INTO public.medicoes (company_id, numero, valor_planejado, data_prevista, data_liberacao,
                                 valor_liberado, status, percentual_fisico_meta, percentual_fisico_real, observacoes)
    SELECT v_new_id, numero, valor_planejado, data_prevista, data_liberacao,
           valor_liberado, status, percentual_fisico_meta, percentual_fisico_real, observacoes
    FROM public.medicoes WHERE company_id = _source_id
    RETURNING id, numero
  )
  INSERT INTO _map_medicoes(old_id, new_id)
  SELECT m.id, ins.id FROM public.medicoes m
  JOIN ins ON ins.numero = m.numero
  WHERE m.company_id = _source_id;

  WITH ins AS (
    INSERT INTO public.documentos (company_id, nome_arquivo, storage_path, tamanho_bytes, tipo_mime,
                                   enviado_por, status, erro_detalhe, descricao, categoria, deleted_at)
    SELECT v_new_id, nome_arquivo, storage_path, tamanho_bytes, tipo_mime,
           enviado_por, status, erro_detalhe, descricao, categoria, deleted_at
    FROM public.documentos WHERE company_id = _source_id
    RETURNING id, nome_arquivo, COALESCE(storage_path, '') AS sp_k
  )
  INSERT INTO _map_documentos(old_id, new_id)
  SELECT d.id, ins.id FROM public.documentos d
  JOIN ins ON ins.nome_arquivo = d.nome_arquivo AND ins.sp_k = COALESCE(d.storage_path, '')
  WHERE d.company_id = _source_id;

  WITH ins AS (
    INSERT INTO public.itens_compra (
      company_id, etapa_id, codigo, descricao, tipo, categoria, unidade,
      qtd_por_casa, qtd_total, custo_unitario_orcado, valor_total_orcado,
      fornecedor_id, cond_pagamento, valor_consumido, valor_saldo, deleted_at
    )
    SELECT
      v_new_id, m_e.new_id, ic.codigo, ic.descricao, ic.tipo, ic.categoria, ic.unidade,
      ic.qtd_por_casa, ic.qtd_total, ic.custo_unitario_orcado, ic.valor_total_orcado,
      m_f.new_id, ic.cond_pagamento, ic.valor_consumido, ic.valor_saldo, ic.deleted_at
    FROM public.itens_compra ic
    JOIN _map_etapas m_e ON m_e.old_id = ic.etapa_id
    LEFT JOIN _map_fornecedores m_f ON m_f.old_id = ic.fornecedor_id
    WHERE ic.company_id = _source_id
    RETURNING id, codigo
  )
  INSERT INTO _map_itens_compra(old_id, new_id)
  SELECT ic.id, ins.id FROM public.itens_compra ic
  JOIN ins ON ins.codigo = ic.codigo
  WHERE ic.company_id = _source_id;

  WITH ins AS (
    INSERT INTO public.despesas_indiretas (
      company_id, categoria, descricao, valor_orcado, valor_consumido, valor_saldo,
      recorrente, frequencia, data_inicio, data_fim, fornecedor_id, observacoes,
      ativo, deleted_at, cond_pagamento
    )
    SELECT
      v_new_id, di.categoria, di.descricao, di.valor_orcado, di.valor_consumido, di.valor_saldo,
      di.recorrente, di.frequencia, di.data_inicio, di.data_fim, m_f.new_id, di.observacoes,
      di.ativo, di.deleted_at, di.cond_pagamento
    FROM public.despesas_indiretas di
    LEFT JOIN _map_fornecedores m_f ON m_f.old_id = di.fornecedor_id
    WHERE di.company_id = _source_id
    RETURNING id, descricao, categoria
  )
  INSERT INTO _map_despesas(old_id, new_id)
  SELECT di.id, ins.id FROM public.despesas_indiretas di
  JOIN ins ON ins.descricao = di.descricao AND ins.categoria = di.categoria
  WHERE di.company_id = _source_id;

  WITH ins AS (
    INSERT INTO public.mutuos (
      company_id, nome, tipo, instituicao, valor_captado, data_captacao,
      taxa_juros_mensal, observacoes, status, categoria, fornecedor_id
    )
    SELECT v_new_id, m.nome, m.tipo, m.instituicao, m.valor_captado, m.data_captacao,
           m.taxa_juros_mensal, m.observacoes, m.status, m.categoria, m_f.new_id
    FROM public.mutuos m
    LEFT JOIN _map_fornecedores m_f ON m_f.old_id = m.fornecedor_id
    WHERE m.company_id = _source_id
    RETURNING id, nome, data_captacao
  )
  INSERT INTO _map_mutuos(old_id, new_id)
  SELECT m.id, ins.id FROM public.mutuos m
  JOIN ins ON ins.nome = m.nome AND ins.data_captacao = m.data_captacao
  WHERE m.company_id = _source_id;

  WITH ins AS (
    INSERT INTO public.pedidos (
      company_id, item_compra_id, numero_pedido, casas_lote, qtd_lote,
      valor_unitario_real, valor_total_real, fornecedor_id, cond_pagamento,
      data_entrega_prevista, data_entrega_real, status, observacoes
    )
    SELECT
      v_new_id, m_i.new_id, p.numero_pedido, p.casas_lote, p.qtd_lote,
      p.valor_unitario_real, p.valor_total_real, m_f.new_id, p.cond_pagamento,
      p.data_entrega_prevista, p.data_entrega_real, p.status, p.observacoes
    FROM public.pedidos p
    JOIN _map_itens_compra m_i ON m_i.old_id = p.item_compra_id
    LEFT JOIN _map_fornecedores m_f ON m_f.old_id = p.fornecedor_id
    WHERE p.company_id = _source_id
    RETURNING id, item_compra_id, numero_pedido
  )
  INSERT INTO _map_pedidos(old_id, new_id)
  SELECT p.id, ins.id FROM public.pedidos p
  JOIN _map_itens_compra m_i ON m_i.old_id = p.item_compra_id
  JOIN ins ON ins.item_compra_id = m_i.new_id
          AND ins.numero_pedido IS NOT DISTINCT FROM p.numero_pedido
  WHERE p.company_id = _source_id;

  WITH ins AS (
    INSERT INTO public.parcelas (
      company_id, pedido_id, numero_parcela, valor, data_vencimento,
      data_pagamento_real, valor_pago, forma_pagamento, conta_bancaria_id,
      status, comprovante_path, deleted_at, despesa_indireta_id,
      descricao, observacoes, tipo
    )
    SELECT
      v_new_id, m_p.new_id, p.numero_parcela, p.valor, p.data_vencimento,
      p.data_pagamento_real, p.valor_pago, p.forma_pagamento, m_cb.new_id,
      p.status, p.comprovante_path, p.deleted_at, m_di.new_id,
      p.descricao, p.observacoes, p.tipo
    FROM public.parcelas p
    LEFT JOIN _map_pedidos m_p ON m_p.old_id = p.pedido_id
    LEFT JOIN _map_contas  m_cb ON m_cb.old_id = p.conta_bancaria_id
    LEFT JOIN _map_despesas m_di ON m_di.old_id = p.despesa_indireta_id
    WHERE p.company_id = _source_id
    RETURNING id, pedido_id, despesa_indireta_id, numero_parcela, data_vencimento, valor
  )
  INSERT INTO _map_parcelas(old_id, new_id)
  SELECT p.id, ins.id FROM public.parcelas p
  LEFT JOIN _map_pedidos  m_p ON m_p.old_id = p.pedido_id
  LEFT JOIN _map_despesas m_di ON m_di.old_id = p.despesa_indireta_id
  JOIN ins ON ins.pedido_id IS NOT DISTINCT FROM m_p.new_id
          AND ins.despesa_indireta_id IS NOT DISTINCT FROM m_di.new_id
          AND ins.numero_parcela IS NOT DISTINCT FROM p.numero_parcela
          AND ins.data_vencimento = p.data_vencimento
          AND ins.valor = p.valor
  WHERE p.company_id = _source_id;

  WITH ins AS (
    INSERT INTO public.mutuo_parcelas (
      company_id, mutuo_id, numero_parcela, valor, data_vencimento,
      data_pagamento_real, valor_pago, status, observacoes,
      conta_bancaria_id, forma_pagamento
    )
    SELECT
      v_new_id, m_m.new_id, mp.numero_parcela, mp.valor, mp.data_vencimento,
      mp.data_pagamento_real, mp.valor_pago, mp.status, mp.observacoes,
      m_cb.new_id, mp.forma_pagamento
    FROM public.mutuo_parcelas mp
    JOIN _map_mutuos m_m ON m_m.old_id = mp.mutuo_id
    LEFT JOIN _map_contas m_cb ON m_cb.old_id = mp.conta_bancaria_id
    WHERE mp.company_id = _source_id
    RETURNING id, mutuo_id, numero_parcela
  )
  INSERT INTO _map_mutuo_parc(old_id, new_id)
  SELECT mp.id, ins.id FROM public.mutuo_parcelas mp
  JOIN _map_mutuos m_m ON m_m.old_id = mp.mutuo_id
  JOIN ins ON ins.mutuo_id = m_m.new_id AND ins.numero_parcela = mp.numero_parcela
  WHERE mp.company_id = _source_id;

  WITH ins AS (
    INSERT INTO public.movimentacoes_bancarias (
      company_id, conta_id, data, descricao, valor, tipo, categoria,
      parcela_id, conciliado, conciliado_em, observacao,
      fitid, memo_raw, saldo_acumulado, origem
    )
    SELECT
      v_new_id, m_cb.new_id, mb.data, mb.descricao, mb.valor, mb.tipo, mb.categoria,
      m_pa.new_id, mb.conciliado, mb.conciliado_em, mb.observacao,
      mb.fitid, mb.memo_raw, mb.saldo_acumulado, mb.origem
    FROM public.movimentacoes_bancarias mb
    JOIN _map_contas m_cb ON m_cb.old_id = mb.conta_id
    LEFT JOIN _map_parcelas m_pa ON m_pa.old_id = mb.parcela_id
    WHERE mb.company_id = _source_id
    RETURNING id, conta_id, data, valor, descricao
  )
  INSERT INTO _map_movs(old_id, new_id)
  SELECT mb.id, ins.id FROM public.movimentacoes_bancarias mb
  JOIN _map_contas m_cb ON m_cb.old_id = mb.conta_id
  JOIN ins ON ins.conta_id = m_cb.new_id
          AND ins.data = mb.data
          AND ins.valor = mb.valor
          AND ins.descricao IS NOT DISTINCT FROM mb.descricao
  WHERE mb.company_id = _source_id;

  WITH ins AS (
    INSERT INTO public.conciliacoes (company_id, movimentacao_id, match_type, confidence, diferenca, status)
    SELECT v_new_id, m_mv.new_id, c.match_type, c.confidence, c.diferenca, c.status
    FROM public.conciliacoes c
    JOIN _map_movs m_mv ON m_mv.old_id = c.movimentacao_id
    WHERE c.company_id = _source_id
    RETURNING id, movimentacao_id
  )
  INSERT INTO _map_conciliacoes(old_id, new_id)
  SELECT c.id, ins.id FROM public.conciliacoes c
  JOIN _map_movs m_mv ON m_mv.old_id = c.movimentacao_id
  JOIN ins ON ins.movimentacao_id = m_mv.new_id
  WHERE c.company_id = _source_id;

  INSERT INTO public.conciliacao_parcelas (
    conciliacao_id, parcela_id, valor_aplicado, medicao_id, mutuo_parcela_id, observacao, mutuo_id
  )
  SELECT m_c.new_id, m_pa.new_id, cp.valor_aplicado, m_med.new_id, m_mp.new_id, cp.observacao, m_m.new_id
  FROM public.conciliacao_parcelas cp
  JOIN public.conciliacoes c ON c.id = cp.conciliacao_id
  JOIN _map_conciliacoes m_c ON m_c.old_id = cp.conciliacao_id
  LEFT JOIN _map_parcelas m_pa ON m_pa.old_id = cp.parcela_id
  LEFT JOIN _map_medicoes m_med ON m_med.old_id = cp.medicao_id
  LEFT JOIN _map_mutuos m_m ON m_m.old_id = cp.mutuo_id
  LEFT JOIN _map_mutuo_parc m_mp ON m_mp.old_id = cp.mutuo_parcela_id
  WHERE c.company_id = _source_id;

  INSERT INTO public.cronograma_distribuicao (
    company_id, etapa_id, medicao_numero, casas_planejadas,
    data_inicio, data_fim, casas_realizadas, valor_liberado_faturamento
  )
  SELECT v_new_id, m_e.new_id, cd.medicao_numero, cd.casas_planejadas,
         cd.data_inicio, cd.data_fim, cd.casas_realizadas, cd.valor_liberado_faturamento
  FROM public.cronograma_distribuicao cd
  JOIN _map_etapas m_e ON m_e.old_id = cd.etapa_id
  WHERE cd.company_id = _source_id;

  INSERT INTO public.avancos (
    company_id, etapa_id, data_registro, casas_concluidas, registrado_por, observacoes, fotos
  )
  SELECT v_new_id, m_e.new_id, a.data_registro, a.casas_concluidas, a.registrado_por, a.observacoes, a.fotos
  FROM public.avancos a
  JOIN _map_etapas m_e ON m_e.old_id = a.etapa_id
  WHERE a.company_id = _source_id;

  WITH ins AS (
    INSERT INTO public.cenarios (company_id, nome, descricao, ativo, criado_por, tipo)
    SELECT v_new_id, nome, descricao, ativo, criado_por, tipo
    FROM public.cenarios WHERE company_id = _source_id
    RETURNING id, nome, created_at
  )
  INSERT INTO _map_cenarios(old_id, new_id)
  SELECT c.id, ins.id FROM public.cenarios c
  JOIN ins ON ins.nome = c.nome
  WHERE c.company_id = _source_id;

  INSERT INTO public.cenario_ajustes (
    company_id, cenario_id, tipo_ajuste, referencia_id, campo_alterado,
    valor_original, valor_novo, parcelas, justificativa, referencia_tipo, delta_dias
  )
  SELECT v_new_id, m_c.new_id, ca.tipo_ajuste, ca.referencia_id, ca.campo_alterado,
         ca.valor_original, ca.valor_novo, ca.parcelas, ca.justificativa, ca.referencia_tipo, ca.delta_dias
  FROM public.cenario_ajustes ca
  JOIN _map_cenarios m_c ON m_c.old_id = ca.cenario_id
  WHERE ca.company_id = _source_id;

  INSERT INTO public.classificacoes_ia (
    company_id, documento_id, fornecedor_extraido, cnpj_extraido, valor_extraido,
    data_vencimento_extraida, itens_extraidos, etapa_proposta_id, item_compra_proposto_id,
    pedido_proposto_id, valor_orcado_item, valor_ja_consumido, valor_saldo_antes,
    valor_saldo_depois, score_confianca, justificativa_ia, status_auditoria,
    auditado_por, auditado_em, correcoes, motivo_rejeicao
  )
  SELECT
    v_new_id, m_d.new_id, ci.fornecedor_extraido, ci.cnpj_extraido, ci.valor_extraido,
    ci.data_vencimento_extraida, ci.itens_extraidos, m_e.new_id, m_i.new_id,
    m_p.new_id, ci.valor_orcado_item, ci.valor_ja_consumido, ci.valor_saldo_antes,
    ci.valor_saldo_depois, ci.score_confianca, ci.justificativa_ia, ci.status_auditoria,
    ci.auditado_por, ci.auditado_em, ci.correcoes, ci.motivo_rejeicao
  FROM public.classificacoes_ia ci
  JOIN _map_documentos m_d ON m_d.old_id = ci.documento_id
  LEFT JOIN _map_etapas m_e ON m_e.old_id = ci.etapa_proposta_id
  LEFT JOIN _map_itens_compra m_i ON m_i.old_id = ci.item_compra_proposto_id
  LEFT JOIN _map_pedidos m_p ON m_p.old_id = ci.pedido_proposto_id
  WHERE ci.company_id = _source_id;

  INSERT INTO public.recepcao_docs (
    company_id, user_id, origem, storage_path, texto_original, fornecedor_nome,
    fornecedor_cnpj, numero_doc, serie, data_emissao, valor_total, raw_extracao,
    status, erro_msg, custo_ia_cents, modelo_ia, applied_at, fornecedor_id
  )
  SELECT v_new_id, rd.user_id, rd.origem, rd.storage_path, rd.texto_original, rd.fornecedor_nome,
         rd.fornecedor_cnpj, rd.numero_doc, rd.serie, rd.data_emissao, rd.valor_total, rd.raw_extracao,
         rd.status, rd.erro_msg, rd.custo_ia_cents, rd.modelo_ia, rd.applied_at, m_f.new_id
  FROM public.recepcao_docs rd
  LEFT JOIN _map_fornecedores m_f ON m_f.old_id = rd.fornecedor_id
  WHERE rd.company_id = _source_id;

  INSERT INTO public.regras_conciliacao (
    company_id, nome, padrao_texto, tipo_match, valor_min, valor_max, acao,
    categoria, fornecedor_id, descricao_padrao, auto_aplicar, vezes_aplicada, criado_por
  )
  SELECT v_new_id, rc.nome, rc.padrao_texto, rc.tipo_match, rc.valor_min, rc.valor_max, rc.acao,
         rc.categoria, m_f.new_id, rc.descricao_padrao, rc.auto_aplicar, 0, rc.criado_por
  FROM public.regras_conciliacao rc
  LEFT JOIN _map_fornecedores m_f ON m_f.old_id = rc.fornecedor_id
  WHERE rc.company_id = _source_id;

  INSERT INTO public.alertas (company_id, tipo, severidade, titulo, mensagem, dados, lido, lido_por)
  SELECT v_new_id, tipo, severidade, titulo, mensagem, dados, lido, lido_por
  FROM public.alertas WHERE company_id = _source_id;

  INSERT INTO public.user_roles (user_id, company_id, role, active, invited_email)
  SELECT user_id, v_new_id, role, active, invited_email
  FROM public.user_roles WHERE company_id = _source_id;

  IF v_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_user_id AND company_id = v_new_id
  ) THEN
    INSERT INTO public.user_roles (user_id, company_id, role, active)
    VALUES (v_user_id, v_new_id, 'super_admin', true);
  END IF;

  INSERT INTO public.audit_logs (company_id, tabela, registro_id, acao, agente, usuario_id, resumo, dados_depois)
  VALUES (v_new_id, 'companies', v_new_id, 'duplicate', 'user', v_user_id,
          format('Projeto duplicado de %s', _source_id),
          jsonb_build_object('source_id', _source_id, 'new_id', v_new_id));

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_project(uuid, text, text, text, text, text, integer, numeric, date, numeric, numeric, numeric, numeric, numeric, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_project_full(uuid, text, text) TO authenticated;