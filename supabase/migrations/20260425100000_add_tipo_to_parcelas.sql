-- Tipo da parcela: 'contratual' (cond. de pagamento do pedido) ou 'adiantamento'
-- (PIX antecipado antes do vencimento contratual). Adiantamento NAO entra na
-- distribuicao de cond_pagamento — fica como linha propria, e as contratuais
-- sao recalculadas sobre o saldo restante.
ALTER TABLE parcelas
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'contratual';

ALTER TABLE parcelas
  ADD CONSTRAINT parcelas_tipo_check CHECK (tipo IN ('contratual', 'adiantamento'));

CREATE INDEX IF NOT EXISTS idx_parcelas_tipo ON parcelas(tipo) WHERE tipo = 'adiantamento';

COMMENT ON COLUMN parcelas.tipo IS
  'contratual = parcela da condicao de pagamento (30/60/90 etc); adiantamento = PIX antecipado, fica registrado fora do cronograma contratual.';
