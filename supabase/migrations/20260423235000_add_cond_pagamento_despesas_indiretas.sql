-- Adiciona campo de condição de pagamento para despesa indireta PONTUAL parcelada.
-- Exemplo: despesa única de R$10.000 paga em 30/60/90 dias (3 parcelas).
-- Quando recorrente=false mas cond_pagamento está preenchido, gera N parcelas nos dias indicados.
-- Quando recorrente=true, usa frequencia como antes.
-- Quando recorrente=false e cond_pagamento vazio, gera 1 parcela única em data_inicio.

ALTER TABLE despesas_indiretas ADD COLUMN IF NOT EXISTS cond_pagamento text;
COMMENT ON COLUMN despesas_indiretas.cond_pagamento IS
  'Condição de pagamento para despesa PONTUAL parcelada (ex: "30/60/90"). Usado quando recorrente=false mas a despesa é paga em várias parcelas.';
