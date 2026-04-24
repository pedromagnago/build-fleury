-- Rejeitar uma conciliação deixava links órfãos em conciliacao_parcelas e campos
-- residuais em movimentacoes_bancarias (parcela_id, categoria) — causando linhas
-- "NAO_CONCILIADO" com categoria preenchida e sem botões de ação no painel lateral.
-- Limpa esse estado: remove links e zera campos residuais das movs. Apaga a
-- conciliação rejeitada (já não precisa ficar no histórico — o usuário rejeitou).

DO $$
DECLARE mov_ids uuid[];
BEGIN
  SELECT array_agg(DISTINCT c.movimentacao_id) INTO mov_ids
  FROM conciliacoes c WHERE c.status = 'rejeitado';

  DELETE FROM conciliacao_parcelas
  WHERE conciliacao_id IN (SELECT id FROM conciliacoes WHERE status = 'rejeitado');

  DELETE FROM conciliacoes WHERE status = 'rejeitado';

  IF mov_ids IS NOT NULL THEN
    UPDATE movimentacoes_bancarias m
    SET parcela_id = NULL,
        categoria = NULL,
        conciliado = false,
        conciliado_em = NULL
    WHERE m.id = ANY(mov_ids)
      AND NOT EXISTS (
        SELECT 1 FROM conciliacoes c2
        WHERE c2.movimentacao_id = m.id AND c2.status = 'confirmado'
      );
  END IF;
END $$;
