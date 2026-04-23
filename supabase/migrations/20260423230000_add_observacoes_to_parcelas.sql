-- Adiciona campo livre de observações na parcela (justificativa de alteração, detalhes manuais).
-- Usado pelo EditParcelaModal.
ALTER TABLE parcelas ADD COLUMN IF NOT EXISTS observacoes text;
