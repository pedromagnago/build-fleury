-- ============================================================================
-- DIVERGÊNCIA 2 — PAREDES PRÉ MOLDADAS / CIMENTO — OPÇÃO B
-- "Consolidar": migrar os pedidos/NFs do DIMARCK-CIMENTO (2 NFs EGX, R$ 33.880)
-- para o CIMENTO-REAL e DESATIVAR o item DIMARCK-CIMENTO (deleted_at = now()).
-- O WBS fica com um único item de cimento na etapa.
--
--   CIMENTO-REAL.valor_total_orcado: 275.013,32 → 308.893,32 (+33.880,00)
--   DIMARCK-CIMENTO: deleted_at = now()  (sai do WBS: −512.000,00)
--   Impacto líquido no WBS: −R$ 478.120,00 (mesmo da Opção A, mas consolidado)
--
-- ATENÇÃO — é a opção MAIS INVASIVA:
--   - Move FKs em pedido_itens, pedidos (coluna legacy item_compra_id) e
--     recepcao_matches.
--   - itens_compra.valor_consumido / valor_saldo podem ser mantidos por
--     trigger: CONFERIR no passo 3 se recalcularam no CIMENTO-REAL. Se não
--     recalcularem, NÃO COMMITAR — acionar o time de dev.
--   - Pedidos com conciliações ativas: a migração NÃO toca parcelas nem
--     conciliacao_parcelas (ficam vinculadas aos mesmos pedidos), mas o
--     passo 1.4 lista as conciliações para você verificar o efeito.
--
-- PRÉ-REQUISITO (validar com engenheiro/mestre de obras ANTES de executar):
--   - Confirmado que o cimento é o MESMO insumo (DIMARCK-CIMENTO duplicado com
--     CIMENTO-REAL) e que o kit DIMARCK não entregará mais cimento.
--
-- COMO EXECUTAR (Supabase Studio / SQL):
--   1) Preencher __COMPANY_ID__, __ITEM_ID_DIMARCK_CIMENTO__ e
--      __ITEM_ID_CIMENTO_REAL__ (ETAPA 0).
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

-- 0.2 Os dois itens de cimento — anotar os dois ids
SELECT ic.id, ic.codigo, ic.descricao, ic.etapa_id, ic.valor_total_orcado,
       ic.valor_consumido, ic.valor_saldo, ic.deleted_at
FROM itens_compra ic
WHERE ic.company_id = '__COMPANY_ID__'
  AND ic.codigo IN ('DIMARCK-CIMENTO', 'CIMENTO-REAL')
  AND ic.deleted_at IS NULL;
-- → __ITEM_ID_DIMARCK_CIMENTO__ (orçado 512000.00)
-- → __ITEM_ID_CIMENTO_REAL__    (orçado 275013.32)
-- → IMPORTANTE: os dois devem estar na MESMA etapa (etapa_id igual).
--   Se diferirem, ABORTAR e reavaliar — a migração mudaria a etapa do custo.


-- ============================================================================
-- TRANSAÇÃO
-- ============================================================================
BEGIN;

-- ----------------------------------------------------------------------------
-- 1. VERIFICAÇÃO ANTES
-- ----------------------------------------------------------------------------

-- 1.1 Estado dos dois itens
SELECT id, codigo, qtd_total, custo_unitario_orcado, valor_total_orcado,
       valor_consumido, valor_saldo, deleted_at
FROM itens_compra
WHERE id IN ('__ITEM_ID_DIMARCK_CIMENTO__', '__ITEM_ID_CIMENTO_REAL__');

-- 1.2 Pedidos/NFs a migrar (esperado: 2 NFs EGX 24133/24153, total R$ 33.880)
SELECT p.id AS pedido_id, p.numero_pedido, p.status, p.valor_total_real,
       pi.id AS pedido_item_id, pi.qtd, pi.qtd_recebida, pi.valor_total_real AS item_valor,
       rd.numero_doc AS nf, rd.fornecedor_nome, rd.valor_total AS nf_valor
FROM pedido_itens pi
JOIN pedidos p        ON p.id = pi.pedido_id
LEFT JOIN recepcao_docs rd ON rd.id = p.nf_origem_id
WHERE pi.item_compra_id = '__ITEM_ID_DIMARCK_CIMENTO__'
  AND p.company_id = '__COMPANY_ID__';

-- 1.3 Linhas de recepção (recepcao_matches) apontando para o DIMARCK-CIMENTO
SELECT rm.id, rm.doc_id, rm.descricao_original, rm.valor_total, rm.acao,
       rd.numero_doc AS nf
FROM recepcao_matches rm
JOIN recepcao_docs rd ON rd.id = rm.doc_id
WHERE rm.item_compra_id = '__ITEM_ID_DIMARCK_CIMENTO__';

-- 1.4 Parcelas e conciliações dos pedidos a migrar (informativo — não são
--     alteradas; vínculo é por pedido_id, que não muda)
SELECT par.id AS parcela_id, par.pedido_id, par.numero_parcela, par.valor,
       par.valor_pago, par.status,
       cp.id AS conciliacao_parcela_id, cp.valor_aplicado
FROM parcelas par
LEFT JOIN conciliacao_parcelas cp ON cp.parcela_id = par.id
WHERE par.pedido_id IN (
        SELECT pi.pedido_id FROM pedido_itens pi
        WHERE pi.item_compra_id = '__ITEM_ID_DIMARCK_CIMENTO__')
  AND par.deleted_at IS NULL;

-- 1.5 Total do WBS antes
SELECT SUM(valor_total_orcado) AS wbs_total_antes
FROM itens_compra
WHERE company_id = '__COMPANY_ID__'
  AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2. MIGRAÇÃO + AUDIT LOGS (shape de src/lib/auditLog.ts)
-- ----------------------------------------------------------------------------

-- 2.1 pedido_itens: DIMARCK-CIMENTO → CIMENTO-REAL (audit BULK_UPDATE agregado)
WITH antes AS (
  SELECT pi.id, p.company_id
  FROM pedido_itens pi
  JOIN pedidos p ON p.id = pi.pedido_id
  WHERE pi.item_compra_id = '__ITEM_ID_DIMARCK_CIMENTO__'
    AND p.company_id = '__COMPANY_ID__'
),
upd AS (
  UPDATE pedido_itens pi
  SET item_compra_id = '__ITEM_ID_CIMENTO_REAL__'
  FROM antes
  WHERE pi.id = antes.id
  RETURNING pi.id
)
INSERT INTO audit_logs
  (company_id, tabela, acao, registro_id, agente, user_email, dados_antes, dados_depois, resumo)
SELECT
  '__COMPANY_ID__',
  'pedido_itens',
  'BULK_UPDATE',
  NULL,
  'script-wbs-divergencias',
  NULL,
  jsonb_build_object('qtd', count(*), 'ids', jsonb_agg(upd.id),
                     'item_compra_id', '__ITEM_ID_DIMARCK_CIMENTO__'),
  jsonb_build_object('item_compra_id', '__ITEM_ID_CIMENTO_REAL__'),
  'Divergência WBS 2 (Opção B): migra pedido_itens de DIMARCK-CIMENTO para CIMENTO-REAL. Ref: analise_divergencias_wbs_realize_sfp.md'
FROM upd
HAVING count(*) > 0;

-- 2.2 pedidos (coluna legacy item_compra_id, mantida por compat)
WITH antes AS (
  SELECT id FROM pedidos
  WHERE item_compra_id = '__ITEM_ID_DIMARCK_CIMENTO__'
    AND company_id = '__COMPANY_ID__'
),
upd AS (
  UPDATE pedidos p
  SET item_compra_id = '__ITEM_ID_CIMENTO_REAL__'
  FROM antes
  WHERE p.id = antes.id
  RETURNING p.id
)
INSERT INTO audit_logs
  (company_id, tabela, acao, registro_id, agente, user_email, dados_antes, dados_depois, resumo)
SELECT
  '__COMPANY_ID__',
  'pedidos',
  'BULK_UPDATE',
  NULL,
  'script-wbs-divergencias',
  NULL,
  jsonb_build_object('qtd', count(*), 'ids', jsonb_agg(upd.id),
                     'item_compra_id', '__ITEM_ID_DIMARCK_CIMENTO__'),
  jsonb_build_object('item_compra_id', '__ITEM_ID_CIMENTO_REAL__'),
  'Divergência WBS 2 (Opção B): migra coluna legacy pedidos.item_compra_id de DIMARCK-CIMENTO para CIMENTO-REAL.'
FROM upd
HAVING count(*) > 0;

-- 2.3 recepcao_matches (histórico de recepção continua coerente)
WITH antes AS (
  SELECT rm.id
  FROM recepcao_matches rm
  WHERE rm.item_compra_id = '__ITEM_ID_DIMARCK_CIMENTO__'
),
upd AS (
  UPDATE recepcao_matches rm
  SET item_compra_id = '__ITEM_ID_CIMENTO_REAL__'
  FROM antes
  WHERE rm.id = antes.id
  RETURNING rm.id
)
INSERT INTO audit_logs
  (company_id, tabela, acao, registro_id, agente, user_email, dados_antes, dados_depois, resumo)
SELECT
  '__COMPANY_ID__',
  'recepcao_matches',
  'BULK_UPDATE',
  NULL,
  'script-wbs-divergencias',
  NULL,
  jsonb_build_object('qtd', count(*), 'ids', jsonb_agg(upd.id),
                     'item_compra_id', '__ITEM_ID_DIMARCK_CIMENTO__'),
  jsonb_build_object('item_compra_id', '__ITEM_ID_CIMENTO_REAL__'),
  'Divergência WBS 2 (Opção B): migra recepcao_matches de DIMARCK-CIMENTO para CIMENTO-REAL.'
FROM upd
HAVING count(*) > 0;

-- 2.4 CIMENTO-REAL: absorve o orçado do realizado migrado (+33.880,00)
WITH antes AS (
  SELECT id, company_id, to_jsonb(itens_compra.*) AS dados
  FROM itens_compra
  WHERE id = '__ITEM_ID_CIMENTO_REAL__'
    AND company_id = '__COMPANY_ID__'
    AND deleted_at IS NULL
    AND valor_total_orcado = 275013.32   -- trava: estado esperado da análise
),
upd AS (
  UPDATE itens_compra ic
  SET valor_total_orcado = 308893.32     -- 275.013,32 + 33.880,00
  FROM antes
  WHERE ic.id = antes.id
  RETURNING ic.id, to_jsonb(ic.*) AS dados
)
INSERT INTO audit_logs
  (company_id, tabela, acao, registro_id, agente, user_email, dados_antes, dados_depois, resumo)
SELECT
  antes.company_id, 'itens_compra', 'UPDATE', antes.id,
  'script-wbs-divergencias', NULL, antes.dados, upd.dados,
  'Divergência WBS 2 (Opção B): CIMENTO-REAL absorve R$ 33.880,00 do realizado migrado do DIMARCK-CIMENTO (275.013,32 → 308.893,32).'
FROM antes
JOIN upd ON upd.id = antes.id;
-- → esperado: INSERT 0 1. Se INSERT 0 0, a trava não casou — ROLLBACK e investigar.
-- Obs.: qtd_total / custo_unitario_orcado do CIMENTO-REAL não são alterados
-- (item de compra direta consumido por VALOR). Se quiser coerência unitária,
-- recalcular manualmente com a engenharia.

-- 2.5 DIMARCK-CIMENTO: desativação (soft delete)
WITH antes AS (
  SELECT id, company_id, to_jsonb(itens_compra.*) AS dados
  FROM itens_compra
  WHERE id = '__ITEM_ID_DIMARCK_CIMENTO__'
    AND company_id = '__COMPANY_ID__'
    AND deleted_at IS NULL
),
upd AS (
  UPDATE itens_compra ic
  SET deleted_at = now()
  FROM antes
  WHERE ic.id = antes.id
  RETURNING ic.id, to_jsonb(ic.*) AS dados
)
INSERT INTO audit_logs
  (company_id, tabela, acao, registro_id, agente, user_email, dados_antes, dados_depois, resumo)
SELECT
  antes.company_id, 'itens_compra', 'DELETE', antes.id,
  'script-wbs-divergencias', NULL, antes.dados, upd.dados,
  'Divergência WBS 2 (Opção B): desativa DIMARCK-CIMENTO (orçado 512.000,00) após migração dos pedidos para CIMENTO-REAL. Saldo fantasma de 478.120,00 eliminado.'
FROM antes
JOIN upd ON upd.id = antes.id;

-- ----------------------------------------------------------------------------
-- 3. CONFERÊNCIA DEPOIS
-- ----------------------------------------------------------------------------

-- 3.1 Nenhum pedido_item / pedido / match pode restar no DIMARCK-CIMENTO (esperado: 0/0/0)
SELECT
  (SELECT count(*) FROM pedido_itens      WHERE item_compra_id = '__ITEM_ID_DIMARCK_CIMENTO__') AS pedido_itens_restantes,
  (SELECT count(*) FROM pedidos           WHERE item_compra_id = '__ITEM_ID_DIMARCK_CIMENTO__') AS pedidos_restantes,
  (SELECT count(*) FROM recepcao_matches  WHERE item_compra_id = '__ITEM_ID_DIMARCK_CIMENTO__') AS matches_restantes;

-- 3.2 Estado final dos dois itens
--     CHECKPOINT CRÍTICO: valor_consumido do CIMENTO-REAL deve agora incluir
--     os R$ 33.880 migrados (≈ 308.893). Se NÃO recalculou (campo mantido por
--     trigger que não disparou), NÃO COMMITAR — acionar o dev.
SELECT id, codigo, valor_total_orcado, valor_consumido, valor_saldo, deleted_at
FROM itens_compra
WHERE id IN ('__ITEM_ID_DIMARCK_CIMENTO__', '__ITEM_ID_CIMENTO_REAL__');

-- 3.3 Total do WBS depois (esperado: wbs_total_antes − 478.120,00)
SELECT SUM(valor_total_orcado) AS wbs_total_depois
FROM itens_compra
WHERE company_id = '__COMPANY_ID__'
  AND deleted_at IS NULL;

-- 3.4 Audit logs gravados (esperado: 5 linhas deste script)
SELECT tabela, acao, registro_id, resumo, created_at
FROM audit_logs
WHERE company_id = '__COMPANY_ID__'
  AND agente = 'script-wbs-divergencias'
ORDER BY created_at DESC
LIMIT 10;

-- ----------------------------------------------------------------------------
-- 4. FECHAMENTO — escolher UM:
-- ----------------------------------------------------------------------------
ROLLBACK;   -- 1ª execução (MODO TESTE): manter ROLLBACK e conferir os SELECTs
-- COMMIT;  -- 2ª execução (DEFINITIVA): comentar o ROLLBACK acima e descomentar este COMMIT
