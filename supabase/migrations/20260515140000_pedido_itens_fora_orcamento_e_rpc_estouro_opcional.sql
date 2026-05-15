-- ============================================================================
-- Toggle opcional "permitir estourar orçamento" via NF (2026-05-15 v4)
--
-- Decisão: dar ao operador a opção de aplicar NF que estoura qtd/valor dos
-- pedidos planejados, sem inflar o "comprometido" do item. A sobra vira
-- pedido_item com fora_orcamento=true — existe pra qtd_recebida e parcelas
-- baterem com a NF, mas é EXCLUÍDO do cálculo de comprometido no front.
--
-- Mudanças no banco:
--   1) pedido_itens.fora_orcamento (boolean DEFAULT false)
--   2) RPC aplicar_recepcao_nf lê companies.config.permitir_estouro_orcamento:
--      - false (default): pré-valida agregado, RAISE EXCEPTION se estoura.
--      - true: pula pré-validação. Após FIFO, qualquer restante vira
--        pedido_item no âncora com fora_orcamento=true.
--
-- Mudanças no front (em commits acompanhantes):
--   - Configurações: card "Configurações Operacionais" com toggle
--     "Permitir estourar orçamento ao aplicar NF" (grava em companies.config).
--   - RecepcaoPage: lê o setting. Banner amarelo (aviso, libera Aplicar)
--     quando ON; vermelho (bloqueio) quando OFF.
--   - ComprasPage.valor_comprometido, useFinanceiro.comprometido,
--     useCashFlowEvents (cálculo de saldo a receber): excluem pi.fora_orcamento.
--   - useCompras tipa PedidoItem com fora_orcamento?: boolean e carrega
--     do banco no SELECT.
-- ============================================================================

ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS fora_orcamento boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN pedido_itens.fora_orcamento IS
  'true quando criado como sobra de "Consumir previsão" via NF, com setting '
  'companies.config.permitir_estouro_orcamento=true. Existe pra qtd/parcelas '
  'baterem com a NF, mas é EXCLUÍDO do cálculo de valor_comprometido — não '
  'representa orçamento adicional, é só efeito de unidade diferente entre NF '
  'e item planejado.';

-- RPC aplicar_recepcao_nf foi recriada via CREATE OR REPLACE no projeto
-- pbqweliufnpxsyewhdmc. Estrutura está documentada nos comentários acima.
SELECT 1; -- placeholder pra migration não-vazia
