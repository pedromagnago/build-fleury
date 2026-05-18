-- Corrige pedido_itens que ficaram com qtd=0.001 após a migration
-- split_pedidos_header_e_itens (20260513183500), por culpa do
--   GREATEST(COALESCE(p.qtd_lote, 1), 0.001)
-- que falha quando qtd_lote = 0 (não-NULL): COALESCE retorna 0, GREATEST eleva
-- pra 0.001 — e a CHECK constraint `qtd > 0` aceita. Resultado: pedidos com
-- vt populado mas qtd microscópica, que travam "Consumir previsão" da Recepção
-- (gate `qtd > qtd_recebida + 0.001` não passa: 0.001 > 0.001 = false) e fazem
-- o badge "✓ recebido" do ComprasPage marcar tudo como recebido (porque
-- |qtd_recebida - qtd| = 0.001 ≤ 0.001 → bate o threshold exatamente).
--
-- Escopo: GLOBAL (todas as companies). O padrão de lixo é uma assinatura
-- DE DADOS, não de uma company específica. Investigação pré-aplicação
-- encontrou 50 linhas em 5 companies da família Realize + Apresentação,
-- todas com o mesmo padrão. Limitar a uma razao_social específica deixaria
-- ~42 linhas sujas em outras companies.
--
-- A recomposição usa itens_compra.custo_unitario_orcado como fonte da verdade
-- (valor unitário REAL por SC/un, não por casa), e calcula qtd = vt/vu.
-- valor_total_real é preservado. Pedidos com status='pago' são marcados como
-- totalmente recebidos (qtd_recebida = qtd) — premissa segura porque pago
-- sem NF historicamente significa "consumido no banco antes da NF chegar".
--
-- Também instala uma trigger anti-regressão: bloqueia INSERT/UPDATE futuros que
-- caiam no padrão exato do bug (qtd < 0.01 AND vt > 1). Não restringe frações
-- legítimas pequenas (ex: vt=0 das ~310 rows entulho permanecem) nem qtd >= 0.01.

BEGIN;

-- ============================================================================
-- 1) Corrigir TODAS as pedido_itens sujas (padrão qtd=lixo + vt populado)
-- ============================================================================
WITH linhas_lixo AS (
  SELECT
    pi.id                    AS pedido_item_id,
    p.status                 AS pedido_status,
    ic.custo_unitario_orcado AS vu_correto,
    ROUND(pi.valor_total_real / ic.custo_unitario_orcado, 6) AS qtd_correta
  FROM pedido_itens pi
  JOIN pedidos p           ON p.id = pi.pedido_id
  JOIN itens_compra ic     ON ic.id = pi.item_compra_id
  WHERE pi.qtd <= 0.01
    AND pi.valor_total_real > 0
    AND p.status <> 'cancelado'
    AND ic.custo_unitario_orcado IS NOT NULL
    AND ic.custo_unitario_orcado > 0
)
UPDATE pedido_itens pi
SET
  qtd                 = l.qtd_correta,
  valor_unitario_real = l.vu_correto,
  qtd_recebida        = CASE
    WHEN l.pedido_status = 'pago' THEN l.qtd_correta
    ELSE pi.qtd_recebida
  END
FROM linhas_lixo l
WHERE pi.id = l.pedido_item_id;

-- ============================================================================
-- 2) Trigger anti-regressão: bloqueia o PADRÃO ESPECÍFICO do bug
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_pedido_itens_bloqueia_lixo_qtd()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.qtd < 0.01 AND COALESCE(NEW.valor_total_real, 0) > 1.00 THEN
    RAISE EXCEPTION
      'pedido_itens: qtd=% incoerente com valor_total_real=% (provável lixo de migration). '
      'qtd deve refletir a quantidade real do item; use valor_total/valor_unitario.',
      NEW.qtd, NEW.valor_total_real;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedido_itens_bloqueia_lixo ON pedido_itens;
CREATE TRIGGER trg_pedido_itens_bloqueia_lixo
BEFORE INSERT OR UPDATE OF qtd, valor_total_real ON pedido_itens
FOR EACH ROW
EXECUTE FUNCTION public.fn_pedido_itens_bloqueia_lixo_qtd();

COMMIT;
