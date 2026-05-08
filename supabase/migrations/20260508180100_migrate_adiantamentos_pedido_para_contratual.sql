-- Adiantamento agora é parcela SEM pedido (pagamento avulso a categorizar).
-- Adiantamentos antigos vinculados a pedido viram parcelas contratuais comuns —
-- conceitualmente eram "pagamento antecipado de uma parcela contratual"; o tipo
-- separado existia só pra alimentar o gatilho de redistribuição (já removido).
--
-- A constraint chk_adiantamento_sem_pedido garante a invariante daqui pra frente.

UPDATE parcelas SET tipo = 'contratual'
WHERE tipo = 'adiantamento' AND pedido_id IS NOT NULL;

ALTER TABLE parcelas DROP CONSTRAINT IF EXISTS chk_adiantamento_sem_pedido;
ALTER TABLE parcelas ADD CONSTRAINT chk_adiantamento_sem_pedido
  CHECK (tipo <> 'adiantamento' OR pedido_id IS NULL);
