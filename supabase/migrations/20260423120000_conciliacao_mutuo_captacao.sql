-- Permite vincular uma conciliacao diretamente a um mutuo (captacao/adiantamento recebido)
-- sem precisar criar mutuo_parcela artificial. Mantem a polimorfia com parcela_id/medicao_id/mutuo_parcela_id.

ALTER TABLE conciliacao_parcelas
  ADD COLUMN IF NOT EXISTS mutuo_id uuid REFERENCES mutuos(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_conciliacao_parcelas_mutuo_id
  ON conciliacao_parcelas(mutuo_id) WHERE mutuo_id IS NOT NULL;
