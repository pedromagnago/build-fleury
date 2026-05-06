-- Corrige pedidos de DIONE e NÍCIO (Realize-SFP) onde a soma dos pedidos por
-- item_compra_id excedia o valor_total_orcado.
--
-- Causa: ao criar 2 lotes de entregas (ex.: 01/03 + 01/04), cada pedido recebeu
-- casas_lote/qtd cheios em vez de proporcional. Resultado: 2 pedidos por item
-- somando 2x o orçado.
--
-- Estratégia: para cada item estourado, calcula factor = orçado / soma_atual
-- e aplica em valor_total_real, casas_lote, qtd_lote dos pedidos + valor das
-- parcelas. Restrito a casos onde valor_pago = 0 em todas as parcelas (seguro
-- pra rerodar sem perder histórico de pagamentos).

DO $$
DECLARE
  company_id_target uuid;
  rec RECORD;
  factor_calc numeric;
BEGIN
  SELECT id INTO company_id_target
  FROM companies
  WHERE COALESCE(nome_fantasia, razao_social) = 'Realize - SFP'
  LIMIT 1;

  IF company_id_target IS NULL THEN
    RAISE NOTICE 'Company Realize - SFP não encontrada — pulando';
    RETURN;
  END IF;

  -- Snapshot pra audit
  INSERT INTO audit_logs (company_id, tabela, acao, agente, dados_antes, dados_depois)
  SELECT
    company_id_target, 'pedidos', 'UPDATE', 'sistema',
    jsonb_build_object(
      'operacao', 'fix_estouro_orcado',
      'fornecedores', ARRAY['DIONE', 'NÍCIO'],
      'pedidos_count', (
        SELECT COUNT(*) FROM pedidos p
        JOIN fornecedores f ON f.id = p.fornecedor_id
        WHERE p.company_id = company_id_target
          AND f.nome IN ('DIONE', 'NÍCIO')
      )
    ),
    NULL;

  FOR rec IN
    SELECT
      ic.id AS item_id,
      ic.valor_total_orcado / NULLIF(SUM(p.valor_total_real), 0) AS factor
    FROM itens_compra ic
    JOIN pedidos p ON p.item_compra_id = ic.id
    JOIN fornecedores f ON f.id = ic.fornecedor_id
    WHERE ic.company_id = company_id_target
      AND ic.deleted_at IS NULL
      AND f.nome IN ('DIONE', 'NÍCIO')
    GROUP BY ic.id, ic.valor_total_orcado
    HAVING SUM(p.valor_total_real) > ic.valor_total_orcado * 1.01
       AND (SELECT COALESCE(SUM(pa.valor_pago), 0)
            FROM parcelas pa JOIN pedidos pp ON pp.id = pa.pedido_id
            WHERE pp.item_compra_id = ic.id AND pa.deleted_at IS NULL) = 0
  LOOP
    factor_calc := rec.factor;

    UPDATE pedidos
    SET
      valor_total_real = ROUND((valor_total_real * factor_calc)::numeric, 2),
      casas_lote = ROUND((casas_lote * factor_calc)::numeric, 2),
      qtd_lote = ROUND((qtd_lote * factor_calc)::numeric, 2)
    WHERE item_compra_id = rec.item_id;

    UPDATE parcelas pa
    SET valor = ROUND((valor * factor_calc)::numeric, 2)
    FROM pedidos p
    WHERE p.id = pa.pedido_id
      AND p.item_compra_id = rec.item_id
      AND pa.deleted_at IS NULL;
  END LOOP;
END $$;
