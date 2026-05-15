-- ============================================================================
-- recepcao_docs_chave_acesso
--
-- Persiste a chave de acesso da NF-e (44 dígitos) em recepcao_docs e cria
-- UNIQUE parcial por company. Resolve o bug "ao reaplicar uma NF já aplicada
-- o sistema não detecta duplicidade, cria segundo doc e o consumo FIFO pula
-- o planejado (qtd_recebida = qtd) deixando o saldo do planejado fantasma":
-- agora o front pode detectar `existing doc` antes de aplicar e oferecer
-- "excluir e reaplicar".
--
-- A coluna é nullable porque NFs vindas por imagem/PDF/texto (Vision) podem
-- não ter chave_acesso confiável. A constraint UNIQUE filtra com WHERE para
-- só impedir duplicidade quando temos a chave preenchida.
-- ============================================================================

ALTER TABLE recepcao_docs
  ADD COLUMN IF NOT EXISTS chave_acesso text;

COMMENT ON COLUMN recepcao_docs.chave_acesso IS
  'Chave de acesso da NF-e (44 dígitos numéricos). Preenchida quando origem=xml_nfe '
  'ou quando o parser DANFE / Vision conseguiu extrair com confiança. Nullable porque '
  'imagens/PDFs nem sempre carregam a chave.';

-- Normaliza: aceita só dígitos (44 chars) ou NULL. Permite vazio existente.
-- Sem CHECK rígido — o front pode setar null ou string limpa; se a NF é estrangeira
-- ao padrão SEFAZ não faz sentido bloquear o INSERT.
UPDATE recepcao_docs SET chave_acesso = NULL
  WHERE chave_acesso IS NOT NULL AND chave_acesso !~ '^\d{44}$';

-- UNIQUE parcial: 1 chave por company. NULL não conflita (semântica padrão).
-- Usado pelo front pra detectar "esta NF já foi aplicada" antes de chamar a RPC,
-- e pela RPC pra rejeitar tentativa de duplicar (defense-in-depth).
CREATE UNIQUE INDEX IF NOT EXISTS recepcao_docs_chave_acesso_company_uidx
  ON recepcao_docs (company_id, chave_acesso)
  WHERE chave_acesso IS NOT NULL;
