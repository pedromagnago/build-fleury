-- ============================================================================
-- DIVERGÊNCIA 3 — PAREDES PRÉ MOLDADAS / FERRO — possível NF duplicada GERDAU
--
--   DIMARCK-FERRO pedido 711 — NF 000193620 — R$ 36.798,01 (GERDAU AÇOS LONGOS S/A)
--   FERRO-REAL    pedido 701 — NF 141       — R$ 36.798,01 (GERDAU ACOS LONGOS S.A.)
--
-- Valor idêntico, mesmo fornecedor, numeração de NF muito diferente.
-- Este script tem DUAS partes:
--   PARTE A (somente leitura) — levantamento para comparação com os DANFes
--     solicitados à GERDAU (chave de acesso, CNPJ, data de emissão, itens).
--   PARTE B (condicional)     — SÓ executar se a GERDAU confirmar que é o
--     MESMO documento fiscal: reverte a NF 141 via RPC excluir_recepcao_doc
--     e ajusta o orçado do FERRO-REAL: 94.836,62 − 36.798,01 = 58.038,61.
--
-- BLOQUEIO ABSOLUTO: NÃO executar a PARTE B sem o DANFe das duas NFs em mãos.
-- Excluir uma NF legítima remove um recebimento real do sistema.
--
-- COMO EXECUTAR:
--   1) Rodar a PARTE A (sem transação, só leitura). Anotar os ids.
--   2) Validar com a GERDAU. Se NÃO for duplicata → PARAR AQUI.
--      (Se as NFs forem distintas e o ferro do FERRO-REAL tiver sido entregue
--       ao DIMARCK, o ajuste é outro — mesmo raciocínio da Opção A do cimento
--       sobre o DIMARCK-FERRO; pedir script após a decisão.)
--   3) Se duplicata confirmada: preencher os placeholders e rodar a PARTE B,
--      1ª vez com ROLLBACK (teste), 2ª vez com COMMIT.
-- ============================================================================


-- ============================================================================
-- PARTE A — LEVANTAMENTO (somente leitura, rodar fora de transação)
-- ============================================================================

-- A.0 company_id da empresa ORIGINAL (prefixo conhecido: c2af1493)
SELECT id, nome
FROM companies
WHERE nome ILIKE '%Realize%SFP%';
-- → usar em __COMPANY_ID__ (NÃO usar a "Apresentação" 998e86f0...)

-- A.1 Os dois itens de ferro
SELECT ic.id, ic.codigo, ic.descricao, ic.valor_total_orcado,
       ic.valor_consumido, ic.valor_saldo, ic.deleted_at
FROM itens_compra ic
WHERE ic.company_id = '__COMPANY_ID__'
  AND ic.codigo IN ('DIMARCK-FERRO', 'FERRO-REAL')
  AND ic.deleted_at IS NULL;
-- → anotar o id do FERRO-REAL e usar em __ITEM_ID_FERRO_REAL__
--    (esperado: valor_total_orcado = 94836.62)

-- A.2 As duas NFs suspeitas — comparar com os DANFes da GERDAU
--     (select * para trazer também chave de acesso / campos extras do doc)
SELECT *
FROM recepcao_docs
WHERE company_id = '__COMPANY_ID__'
  AND fornecedor_nome ILIKE '%GERDAU%'
  AND (numero_doc IN ('000193620', '193620', '141')
       OR valor_total = 36798.01)
ORDER BY data_emissao;
-- → COMPARAR: chave de acesso (44 dígitos), CNPJ emitente, data de emissão,
--   série e valor. Chaves de acesso DIFERENTES = documentos distintos → PARAR.
-- → anotar o id da NF 141 e usar em __DOC_ID_NF_141__

-- A.3 Os dois pedidos suspeitos (711 = DIMARCK-FERRO; 701 = FERRO-REAL)
SELECT p.id AS pedido_id, p.numero_pedido, p.status, p.valor_total_real,
       p.nf_origem_id, f.nome AS fornecedor,
       ic.codigo AS item_codigo,
       rd.numero_doc AS nf, rd.valor_total AS nf_valor, rd.data_emissao
FROM pedidos p
LEFT JOIN fornecedores f   ON f.id = p.fornecedor_id
LEFT JOIN recepcao_docs rd ON rd.id = p.nf_origem_id
LEFT JOIN pedido_itens pi  ON pi.pedido_id = p.id
LEFT JOIN itens_compra ic  ON ic.id = pi.item_compra_id
WHERE p.company_id = '__COMPANY_ID__'
  AND p.numero_pedido IN (701, 711);
-- → anotar o id do pedido 701 e usar em __PEDIDO_ID_701__
-- → conferir que o nf_origem_id do pedido 701 = __DOC_ID_NF_141__

-- A.4 CHECAGEM DE BLOQUEIO: parcelas e conciliações do pedido 701.
--     Se houver parcela PAGA ou conciliação ativa, fazer o ESTORNO pela RPC
--     de estorno ANTES da Parte B (qualquer alteração em pedido com
--     conciliação ativa passa pelo estorno — observação técnica da análise).
SELECT par.id AS parcela_id, par.numero_parcela, par.valor, par.valor_pago,
       par.status, par.data_pagamento_real,
       cp.id AS conciliacao_parcela_id, cp.valor_aplicado
FROM parcelas par
LEFT JOIN conciliacao_parcelas cp ON cp.parcela_id = par.id
WHERE par.pedido_id = '__PEDIDO_ID_701__'
  AND par.deleted_at IS NULL;
-- → se conciliacao_parcela_id ou valor_pago > 0 aparecer: NÃO rodar a Parte B
--   antes do estorno. Se necessário, acionar o time de dev.

-- A.5 Consumos da NF 141 (rastro em recepcao_consumos — será revertido pela RPC)
SELECT rc.*
FROM recepcao_consumos rc
WHERE rc.doc_id = '__DOC_ID_NF_141__';


-- ============================================================================
-- PARTE B — CORREÇÃO CONDICIONAL (SÓ se a GERDAU confirmar duplicata)
-- ============================================================================
-- Pré-condições verificadas:
--   [ ] DANFes comparados — mesma chave de acesso / mesmo documento fiscal
--   [ ] Pedido 701 sem parcelas pagas e sem conciliações ativas (A.4),
--       ou estorno já realizado
--   [ ] Placeholders preenchidos: __COMPANY_ID__, __DOC_ID_NF_141__,
--       __PEDIDO_ID_701__, __ITEM_ID_FERRO_REAL__

BEGIN;

-- ----------------------------------------------------------------------------
-- B.1 VERIFICAÇÃO ANTES
-- ----------------------------------------------------------------------------

-- Estado da NF e do pedido que serão revertidos
SELECT id, numero_doc, serie, fornecedor_nome, valor_total, status, applied_at
FROM recepcao_docs
WHERE id = '__DOC_ID_NF_141__'
  AND company_id = '__COMPANY_ID__';

SELECT id, numero_pedido, status, valor_total_real, nf_origem_id
FROM pedidos
WHERE id = '__PEDIDO_ID_701__'
  AND company_id = '__COMPANY_ID__';

-- Estado do FERRO-REAL (esperado: 94836.62)
SELECT id, codigo, qtd_total, custo_unitario_orcado, valor_total_orcado,
       valor_consumido, valor_saldo
FROM itens_compra
WHERE id = '__ITEM_ID_FERRO_REAL__'
  AND company_id = '__COMPANY_ID__';

-- Total do WBS antes
SELECT SUM(valor_total_orcado) AS wbs_total_antes
FROM itens_compra
WHERE company_id = '__COMPANY_ID__'
  AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- B.2 AUDIT LOG da exclusão da NF (gravar ANTES da RPC, capturando o estado;
--     a RPC excluir_recepcao_doc apaga o doc e cascateia o pedido âncora)
-- ----------------------------------------------------------------------------
INSERT INTO audit_logs
  (company_id, tabela, acao, registro_id, agente, user_email, dados_antes, dados_depois, resumo)
SELECT
  rd.company_id,
  'recepcao_docs',
  'DELETE',
  rd.id,
  'script-wbs-divergencias',
  NULL,
  to_jsonb(rd.*),
  jsonb_build_object(
    'motivo', 'NF duplicada confirmada pela GERDAU',
    'nf_mantida', '000193620 (pedido 711, DIMARCK-FERRO)',
    'pedido_revertido', '__PEDIDO_ID_701__'
  ),
  'Divergência WBS 3 (FERRO): NF 141 GERDAU (R$ 36.798,01) confirmada como duplicata da NF 000193620 — revertida via RPC excluir_recepcao_doc. Ref: analise_divergencias_wbs_realize_sfp.md'
FROM recepcao_docs rd
WHERE rd.id = '__DOC_ID_NF_141__'
  AND rd.company_id = '__COMPANY_ID__';
-- → esperado: INSERT 0 1. Se INSERT 0 0, o doc não existe/foi excluído — ROLLBACK.

-- ----------------------------------------------------------------------------
-- B.3 REVERSÃO DA NF 141 via RPC (caminho oficial do sistema — restaura
--     qtd_recebida, grava recepcao_consumos de reversão e exclui o pedido
--     âncora em cascade via trigger fn_recepcao_doc_revert_consumo).
--     NUNCA apagar recepcao_docs direto no Studio.
-- ----------------------------------------------------------------------------
SELECT excluir_recepcao_doc(p_doc_id => '__DOC_ID_NF_141__'::uuid);

-- ----------------------------------------------------------------------------
-- B.4 AJUSTE DO ORÇADO DO FERRO-REAL + AUDIT (94.836,62 − 36.798,01 = 58.038,61)
-- ----------------------------------------------------------------------------
WITH antes AS (
  SELECT id, company_id, to_jsonb(itens_compra.*) AS dados
  FROM itens_compra
  WHERE id = '__ITEM_ID_FERRO_REAL__'
    AND company_id = '__COMPANY_ID__'
    AND deleted_at IS NULL
    AND valor_total_orcado = 94836.62   -- trava: estado esperado da análise
),
upd AS (
  UPDATE itens_compra ic
  SET valor_total_orcado = 58038.61
  FROM antes
  WHERE ic.id = antes.id
  RETURNING ic.id, to_jsonb(ic.*) AS dados
)
INSERT INTO audit_logs
  (company_id, tabela, acao, registro_id, agente, user_email, dados_antes, dados_depois, resumo)
SELECT
  antes.company_id, 'itens_compra', 'UPDATE', antes.id,
  'script-wbs-divergencias', NULL, antes.dados, upd.dados,
  'Divergência WBS 3 (FERRO-REAL): orçado 94.836,62 → 58.038,61 após reversão da NF 141 duplicada (−36.798,01).'
FROM antes
JOIN upd ON upd.id = antes.id;
-- → esperado: INSERT 0 1. Se INSERT 0 0, a trava não casou — ROLLBACK e investigar.

-- ----------------------------------------------------------------------------
-- B.5 CONFERÊNCIA DEPOIS
-- ----------------------------------------------------------------------------

-- NF revertida (esperado: 0 linhas — doc excluído pela RPC)
SELECT id, numero_doc, status
FROM recepcao_docs
WHERE id = '__DOC_ID_NF_141__';

-- Pedido 701 (esperado: 0 linhas — excluído em cascade pelo trigger;
-- se ainda existir, conferir status e acionar o dev antes do COMMIT)
SELECT id, numero_pedido, status
FROM pedidos
WHERE id = '__PEDIDO_ID_701__';

-- FERRO-REAL ajustado (esperado: orçado 58038.61; valor_consumido ≈ 58.038
-- após a reversão — se não recalculou, NÃO COMMITAR e acionar o dev)
SELECT id, codigo, valor_total_orcado, valor_consumido, valor_saldo
FROM itens_compra
WHERE id = '__ITEM_ID_FERRO_REAL__';

-- Total do WBS depois (esperado: wbs_total_antes − 36.798,01)
SELECT SUM(valor_total_orcado) AS wbs_total_depois
FROM itens_compra
WHERE company_id = '__COMPANY_ID__'
  AND deleted_at IS NULL;

-- Audit logs gravados (esperado: 2 linhas — DELETE recepcao_docs + UPDATE itens_compra)
SELECT tabela, acao, registro_id, resumo, created_at
FROM audit_logs
WHERE company_id = '__COMPANY_ID__'
  AND agente = 'script-wbs-divergencias'
ORDER BY created_at DESC
LIMIT 5;

-- ----------------------------------------------------------------------------
-- B.6 FECHAMENTO — escolher UM:
-- ----------------------------------------------------------------------------
ROLLBACK;   -- 1ª execução (MODO TESTE): manter ROLLBACK e conferir os SELECTs
-- COMMIT;  -- 2ª execução (DEFINITIVA): comentar o ROLLBACK acima e descomentar este COMMIT
