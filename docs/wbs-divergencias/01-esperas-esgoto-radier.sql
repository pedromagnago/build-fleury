-- ============================================================================
-- DIVERGÊNCIA 1 — ESPERAS DE ESGOTO RADIER (item ESGOTO-REAL)
-- Correção do valor_total_orcado auto-inflado pela fórmula de extrapolação
-- (R$ 12.298,41 da NF 26253 × 64 casas → R$ 101.046,35, sem orçamento real).
--
-- DECISÃO IMPLEMENTADA: Opção A — orçado passa a refletir apenas o realizado.
--   qtd_total             = 1
--   custo_unitario_orcado = 12.298,41
--   valor_total_orcado    = 12.298,41
--   Impacto: reduz o WBS em R$ 88.747,94.
--
-- (Opção B — sobreposição ao AUTO-S06-C32C29AD com migração de pedidos e
--  desativação do ESGOTO-REAL — NÃO está neste script; pedir se for o caso.)
--
-- PRÉ-REQUISITO: engenharia confirmou que a compra Irmãos Salvador (NF 26253)
-- é ADICIONAL ao pedido da Marciana Gorete e que não haverá novas compras
-- projetadas para este item.
--
-- COMO EXECUTAR (Supabase Studio / SQL):
--   1) Preencher os placeholders __COMPANY_ID__ e __ITEM_ID_ESGOTO_REAL__
--      usando os SELECTs da ETAPA 0 (placeholders são UUIDs inválidos de
--      propósito — o script falha se você esquecer de substituir).
--   2) 1ª execução = MODO TESTE: rodar o bloco inteiro terminando em ROLLBACK.
--      Conferir os SELECTs de verificação e conferência.
--   3) 2ª execução = DEFINITIVA: trocar ROLLBACK por COMMIT.
-- ============================================================================


-- ============================================================================
-- ETAPA 0 — LOCALIZAÇÃO DOS IDS (rodar fora da transação, só leitura)
-- ============================================================================

-- 0.1 company_id da empresa ORIGINAL (prefixo conhecido: c2af1493).
--     ATENÇÃO: NÃO usar a empresa "Apresentação" (998e86f0...) — ela é o baseline.
SELECT id, nome
FROM companies
WHERE nome ILIKE '%Realize%SFP%';
-- → anotar o id que começa com c2af1493 e usar em __COMPANY_ID__

-- 0.2 id do item ESGOTO-REAL
SELECT id, codigo, descricao, qtd_total, custo_unitario_orcado,
       valor_total_orcado, valor_consumido, valor_saldo, deleted_at
FROM itens_compra
WHERE company_id = '__COMPANY_ID__'
  AND codigo = 'ESGOTO-REAL'
  AND deleted_at IS NULL;
-- → esperado 1 linha, valor_total_orcado = 101046.35
-- → anotar o id e usar em __ITEM_ID_ESGOTO_REAL__


-- ============================================================================
-- TRANSAÇÃO
-- ============================================================================
BEGIN;

-- ----------------------------------------------------------------------------
-- 1. VERIFICAÇÃO ANTES — estado atual do item e do contexto
-- ----------------------------------------------------------------------------

-- 1.1 Item alvo (esperado: 101046.35 orçado; realizado ~12298.41)
SELECT id, codigo, descricao, qtd_total, custo_unitario_orcado,
       valor_total_orcado, valor_consumido, valor_saldo, deleted_at
FROM itens_compra
WHERE id = '__ITEM_ID_ESGOTO_REAL__'
  AND company_id = '__COMPANY_ID__';

-- 1.2 Item irmão AUTO-S06-C32C29AD (NÃO será alterado — só contexto)
SELECT id, codigo, descricao, valor_total_orcado, valor_consumido, valor_saldo
FROM itens_compra
WHERE company_id = '__COMPANY_ID__'
  AND codigo = 'AUTO-S06-C32C29AD'
  AND deleted_at IS NULL;

-- 1.3 Pedidos/NFs vinculados ao ESGOTO-REAL (esperado: NF 26253 Irmãos Salvador,
--     R$ 12.298,41) — confirma que o realizado bate com o novo orçado
SELECT p.id AS pedido_id, p.numero_pedido, p.status, p.valor_total_real,
       pi.qtd, pi.qtd_recebida, pi.valor_total_real AS item_valor,
       rd.numero_doc AS nf, rd.fornecedor_nome, rd.valor_total AS nf_valor
FROM pedido_itens pi
JOIN pedidos p        ON p.id = pi.pedido_id
LEFT JOIN recepcao_docs rd ON rd.id = p.nf_origem_id
WHERE pi.item_compra_id = '__ITEM_ID_ESGOTO_REAL__'
  AND p.company_id = '__COMPANY_ID__'
  AND p.status <> 'cancelado';

-- 1.4 Total do WBS antes (para comparar na conferência)
SELECT SUM(valor_total_orcado) AS wbs_total_antes
FROM itens_compra
WHERE company_id = '__COMPANY_ID__'
  AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2. UPDATE + AUDIT LOG (statement único: captura dados_antes/dados_depois)
--    Shape do audit_logs igual ao de src/lib/auditLog.ts
-- ----------------------------------------------------------------------------
WITH antes AS (
  SELECT id, company_id, to_jsonb(itens_compra.*) AS dados
  FROM itens_compra
  WHERE id = '__ITEM_ID_ESGOTO_REAL__'
    AND company_id = '__COMPANY_ID__'
    AND deleted_at IS NULL
    AND valor_total_orcado = 101046.35   -- trava: só corrige se o valor inflado ainda estiver lá
),
upd AS (
  UPDATE itens_compra ic
  SET qtd_total             = 1,
      custo_unitario_orcado = 12298.41,
      valor_total_orcado    = 12298.41
  FROM antes
  WHERE ic.id = antes.id
  RETURNING ic.id, to_jsonb(ic.*) AS dados
)
INSERT INTO audit_logs
  (company_id, tabela, acao, registro_id, agente, user_email, dados_antes, dados_depois, resumo)
SELECT
  antes.company_id,
  'itens_compra',
  'UPDATE',
  antes.id,
  'script-wbs-divergencias',
  NULL,
  antes.dados,
  upd.dados,
  'Divergência WBS 1 (ESGOTO-REAL): valor_total_orcado auto-inflado 101.046,35 → 12.298,41 (Opção A — refletir realizado). Ref: analise_divergencias_wbs_realize_sfp.md'
FROM antes
JOIN upd ON upd.id = antes.id;
-- → esperado: INSERT 0 1. Se INSERT 0 0, a trava de valor não casou — ABORTAR
--   (ROLLBACK) e investigar: o item já foi alterado por outra pessoa.

-- ----------------------------------------------------------------------------
-- 3. CONFERÊNCIA DEPOIS
-- ----------------------------------------------------------------------------

-- 3.1 Item corrigido (esperado: qtd_total=1, orçado=12298.41)
SELECT id, codigo, qtd_total, custo_unitario_orcado, valor_total_orcado,
       valor_consumido, valor_saldo
FROM itens_compra
WHERE id = '__ITEM_ID_ESGOTO_REAL__';

-- 3.2 Total do WBS depois (esperado: wbs_total_antes − 88.747,94)
SELECT SUM(valor_total_orcado) AS wbs_total_depois
FROM itens_compra
WHERE company_id = '__COMPANY_ID__'
  AND deleted_at IS NULL;

-- 3.3 Audit log gravado
SELECT id, tabela, acao, registro_id, agente, resumo, created_at
FROM audit_logs
WHERE company_id = '__COMPANY_ID__'
  AND tabela = 'itens_compra'
  AND registro_id = '__ITEM_ID_ESGOTO_REAL__'
ORDER BY created_at DESC
LIMIT 3;

-- ----------------------------------------------------------------------------
-- 4. FECHAMENTO — escolher UM:
-- ----------------------------------------------------------------------------
ROLLBACK;   -- 1ª execução (MODO TESTE): manter ROLLBACK e conferir os SELECTs
-- COMMIT;  -- 2ª execução (DEFINITIVA): comentar o ROLLBACK acima e descomentar este COMMIT
