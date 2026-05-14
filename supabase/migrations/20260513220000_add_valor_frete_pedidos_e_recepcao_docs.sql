-- PR 3.5: campo de frete na recepção de NF
--
-- A recepção (RecepcaoPage) passa a aceitar um campo "Frete" no header da NF,
-- que entra no total a parcelar mas NÃO é diluído nos itens. Modelo:
--   total_nf = soma(pedido_itens.valor_total_real) + pedidos.valor_frete
-- Mesmo padrão é replicado em recepcao_docs pra preservar o valor capturado da NF
-- (auditoria) independente de reprocessamento.

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS valor_frete numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE recepcao_docs
  ADD COLUMN IF NOT EXISTS valor_frete numeric(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN pedidos.valor_frete IS
  'Frete (CIF) cobrado pelo fornecedor na NF — entra no total do pedido mas não nos itens. '
  'Soma com pedido_itens.valor_total_real para formar a base de parcelas.';

COMMENT ON COLUMN recepcao_docs.valor_frete IS
  'Frete capturado no momento da recepção da NF — espelho do pedido âncora gerado.';
