-- ============================================================================
-- DIVERGÊNCIA 2 — PAREDES PRÉ MOLDADAS / CIMENTO — OPÇÃO A
-- "Refletir o realizado": ajustar o item DIMARCK-CIMENTO para as 2 NFs reais
-- recebidas (EGX 24133 e 24153, R$ 33.880) e eliminar o saldo fantasma de
-- R$ 478.120 (512.000 − 33.880).
--
--   qtd_total             = 2
--   custo_unitario_orcado = 16.940,00
--   valor_total_orcado    = 33.880,00
--   Impacto: reduz o WBS em R$ 478.120,00.
--
-- O item CIMENTO-REAL (compra direta, 21 NFs, R$ 275.013,32) NÃO é alterado.
-- Os dois itens continuam ativos no WBS.
--
-- PRÉ-REQUISITO (validar com engenheiro/mestre de obras ANTES de executar):
--   - O cimento das 21 NFs diretas foi entregue à DIMARCK (mesmo insumo do kit)
--     OU a compra direta virou o modelo permanente — em ambos os casos o
--     DIMARCK-CIMENTO não receberá mais compras e o saldo deve ser zerado.
--   - Se o kit DIMARCK ainda vai entregar cimento nos próximos lotes,
--     NÃO executar — usar projeção da engenharia (fora deste script).
--
-- COMO EXECUTAR (Supabase Studio / SQL):
--   1) Preencher __COMPANY_ID__ e __ITEM_ID_DIMARCK_CIMENTO__ (ETAPA 0).
--   2) 1ª execução = MODO TESTE: terminar em ROLLBACK e conferir os SELECTs.
--   3) 2ª execução = DEFINITIVA: trocar ROLLBACK por COMMIT.
-- ============================================================================


-- ============================================================================
-- ETAPA 0 — LOCALIZAÇÃO DOS IDS (rodar fora da transação, só leitura)
-- ============================================================================

-- 0.1 company_id da empresa ORIGINAL (prefixo conhecido: c2af1493)
SELECT id, nome
FROM companies
WHERE nome ILIKE '%Realize%SFP%';
-- → usar em __COMPANY_ID__ (NÃO usar a "Apresentação" 998e86f0...)

-- 0.2 Os dois itens de cimento da etapa PAREDES PRÉ MOLDADAS
SELECT ic.id, ic.codigo, ic.descricao, ic.qtd_total, ic.custo_unitario_orcado,
       ic.valor_total_orcado, ic.valor_consumido, ic.valor_saldo, ic.deleted_at,
       e.nome AS etapa
FROM itens_compra ic
JOIN etapas e ON e.id = ic.etapa_id
WHERE ic.company_id = '__COMPANY_ID__'
  AND ic.codigo IN ('DIMARCK-CIMENTO', 'CIMENTO-REAL')
  AND ic.deleted_at IS NULL;
-- → esperado: DIMARCK-CIMENTO orçado 512000.00 / CIMENTO-REAL 275013.32
-- → anotar o id do DIMARCK-CIMENTO e usar em __ITEM_ID_DIMARCK_CIMENTO__


-- ============================================================================
-- TRANSAÇÃO
-- ============================================================================
BEGIN;

-- ----------------------------------------------------------------------------
-- 1. VERIFICAÇÃO ANTES
-- ----------------------------------------------------------------------------

-- 1.1 Item alvo (esperado: 512000.00 orçado, entregue ~33.880)
SELECT id, codigo, descricao, qtd_total, custo_unitario_orcado,
       valor_total_orcado, valor_consumido, valor_saldo
FROM itens_compra
WHERE id = '__ITEM_ID_DIMARCK_CIMENTO__'
  AND company_id = '__COMPANY_ID__';

-- 1.2 NFs/pedidos vinculados ao DIMARCK-CIMENTO — esperado: 2 NFs EGX
--     (24133 e 24153) somando R$ 33.880. Se aparecer mais coisa, ABORTAR e
--     reavaliar (os valores 2 × 16.940 deixariam de bater).
SELECT p.id AS pedido_id, p.numero_pedido, p.status, p.valor_total_real,
       pi.qtd, pi.qtd_recebida,
       rd.numero_doc AS nf, rd.fornecedor_nome, rd.valor_total AS nf_valor
FROM pedido_itens pi
JOIN pedidos p        ON p.id = pi.pedido_id
LEFT JOIN recepcao_docs rd ON rd.id = p.nf_origem_id
WHERE pi.item_compra_id = '__ITEM_ID_DIMARCK_CIMENTO__'
  AND p.company_id = '__COMPANY_ID__'
  AND p.status <> 'cancelado';

-- 1.3 Soma do realizado no DIMARCK-CIMENTO (esperado: 33880.00)
SELECT COALESCE(SUM(pi.valor_total_real), 0) AS realizado_dimarck_cimento
FROM pedido_itens pi
JOIN pedidos p ON p.id = pi.pedido_id
WHERE pi.item_compra_id = '__ITEM_ID_DIMARCK_CIMENTO__'
  AND p.company_id = '__COMPANY_ID__'
  AND p.status <> 'cancelado';

-- 1.4 Total do WBS antes
SELECT SUM(valor_total_orcado) AS wbs_total_antes
FROM itens_compra
WHERE company_id = '__COMPANY_ID__'
  AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2. UPDATE + AUDIT LOG (shape de src/lib/auditLog.ts)
-- ----------------------------------------------------------------------------
WITH antes AS (
  SELECT id, company_id, to_jsonb(itens_compra.*) AS dados
  FROM itens_compra
  WHERE id = '__ITEM_ID_DIMARCK_CIMENTO__'
    AND company_id = '__COMPANY_ID__'
    AND deleted_at IS NULL
    AND valor_total_orcado = 512000.00   -- trava: só corrige se o orçado original ainda estiver lá
),
upd AS (
  UPDATE itens_compra ic
  SET qtd_total             = 2,
      custo_unitario_orcado = 16940.00,
      valor_total_orcado    = 33880.00
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
  'Divergência WBS 2 (DIMARCK-CIMENTO, Opção A): orçado 512.000,00 → 33.880,00 (refletir realizado; canal de compra migrou para compra direta — CIMENTO-REAL). Ref: analise_divergencias_wbs_realize_sfp.md'
FROM antes
JOIN upd ON upd.id = antes.id;
-- → esperado: INSERT 0 1. Se INSERT 0 0, a trava não casou — ROLLBACK e investigar.

-- ----------------------------------------------------------------------------
-- 3. CONFERÊNCIA DEPOIS
-- ----------------------------------------------------------------------------

-- 3.1 Item corrigido (esperado: qtd_total=2, orçado=33880.00, saldo ≈ 0)
SELECT id, codigo, qtd_total, custo_unitario_orcado, valor_total_orcado,
       valor_consumido, valor_saldo
FROM itens_compra
WHERE id = '__ITEM_ID_DIMARCK_CIMENTO__';

-- 3.2 Total do WBS depois (esperado: wbs_total_antes − 478.120,00)
SELECT SUM(valor_total_orcado) AS wbs_total_depois
FROM itens_compra
WHERE company_id = '__COMPANY_ID__'
  AND deleted_at IS NULL;

-- 3.3 Audit log gravado
SELECT id, tabela, acao, registro_id, agente, resumo, created_at
FROM audit_logs
WHERE company_id = '__COMPANY_ID__'
  AND tabela = 'itens_compra'
  AND registro_id = '__ITEM_ID_DIMARCK_CIMENTO__'
ORDER BY created_at DESC
LIMIT 3;

-- ----------------------------------------------------------------------------
-- 4. FECHAMENTO — escolher UM:
-- ----------------------------------------------------------------------------
ROLLBACK;   -- 1ª execução (MODO TESTE): manter ROLLBACK e conferir os SELECTs
-- COMMIT;  -- 2ª execução (DEFINITIVA): comentar o ROLLBACK acima e descomentar este COMMIT
