# Metodologia Financeira — Build Fleury

> Documento de referência técnica e conceitual. Define as regras, entidades e fluxos que governam toda a estrutura financeira da ferramenta.

---

## 1. Princípio Fundamental

O Build Fleury opera com **ciclo financeiro fechado**: cada real que sai ou entra no projeto tem uma origem rastreável, desde o item orçado na WBS até o extrato bancário conciliado. Não existe movimentação "avulsa" — toda saída nasce de um pedido, despesa indireta, adiantamento ou mútuo; toda entrada nasce de uma medição.

---

## 2. As Cinco Camadas

```
CAMADA 1 — PLANEJAMENTO (WBS)
    etapas → itens_compra
         ↓
CAMADA 2 — COMPRAS (PEDIDOS)
    pedidos → pedido_itens → parcelas (saídas)
         ↓
CAMADA 3 — FATURAMENTO (MEDIÇÕES)
    medicoes → medicao_parcelas (entradas)
         ↓
CAMADA 4 — FINANCEIRO EXPANDIDO
    despesas_indiretas + adiantamentos + mutuos
         ↓
CAMADA 5 — CAIXA E CONCILIAÇÃO
    movimentacoes_bancarias ↔ conciliacoes ↔ conciliacao_parcelas
```

Cada camada alimenta a projeção de caixa (`useCashFlowEvents`) e o painel de controle.

---

## 3. Camada 1 — Planejamento (WBS)

### Entidades
- `etapas` — fases do projeto (ex: Fundação, Alvenaria, Cobertura)
- `itens_compra` — linha de orçamento dentro de cada etapa

### Regras
- O item de compra é a **menor unidade orçamentária**. Tudo se rastreia de volta a ele.
- `valor_total_orcado = qtd_por_casa × casas_total × custo_unitario_orcado`
- `valor_consumido` = soma dos `recepcao_consumos.valor_consumido` vinculados ao item
- `valor_saldo = valor_total_orcado − valor_consumido`
- O fornecedor e a condição de pagamento no item de compra são **planejamento** — o fornecedor real vem da NF recebida

### Item Especial — Overhead (Custos Indiretos)
Existe uma etapa fixa chamada **"Custos Indiretos"** na WBS de todo projeto. Ela não tem itens de compra comuns — serve como âncora para que `despesas_indiretas` com `etapa_id` apontem para ela. Isso permite que o custo total do projeto (direto + indireto) seja visível em um único relatório.

- `despesas_indiretas.etapa_id = NULL` → overhead geral, linha separada no relatório
- `despesas_indiretas.etapa_id = [id_etapa_overhead]` → aparece no custo real da etapa Overhead

> A despesa indireta **nunca** decrementa `itens_compra.valor_consumido`. Ela aparece como custo real da etapa, não como consumo de orçamento.

---

## 4. Camada 2 — Compras (Pedidos)

### Entidades
- `pedidos` — cabeçalho do pedido de compra
- `pedido_itens` — linhas do pedido
- `parcelas` — cronograma de pagamento gerado pela condição de pagamento

### Origens do Pedido

| Origem | Quando | Parcelas |
|--------|--------|----------|
| **Manual** | Gestor cria a partir de `itens_compra` | Geradas imediatamente pela `cond_pagamento` |
| **Recepção de NF** | NF chega e é vinculada ao item | Parcelas de saldo geradas para o valor restante |

### Status Duplo do Pedido

O pedido tem dois eixos de status independentes:

**`status_entrega`** — calculado por trigger a partir de `pedido_itens`
```
qtd_recebida = 0                    → 'aguardando_entrega'
0 < qtd_recebida < qtd             → 'parcialmente_entregue'
qtd_recebida = qtd                  → 'entregue'
```

**`status_pagamento`** — calculado a partir de `parcelas`
```
todas as parcelas pagas             → 'pago'
alguma parcela vencida não paga     → 'vencido'
alguma paga, não todas              → 'parcialmente_pago'
nenhuma paga, nenhuma vencida       → 'aguardando'
sem parcelas                        → 'sem_parcelas'
```

O campo `status` (legado) é mantido como combinação de conveniência para filtros, nunca setado manualmente.

### Parcelas de Saída (`parcelas`)

A tabela `parcelas` cobre **todas as saídas planejadas** do projeto:

| `pedido_id` | `despesa_indireta_id` | Origem |
|-------------|----------------------|--------|
| preenchido | NULL | Saída de pedido de compra |
| NULL | preenchido | Saída de despesa indireta |

Campos essenciais:
- `numero_parcela, valor, data_vencimento`
- `data_prevista_pagamento` — editável pelo gestor; base da projeção de caixa
- `data_pagamento_real, valor_pago` — preenchidos pela conciliação
- `status`: `futura | a_vencer | paga | vencida | parcialmente_paga`
- `tipo`: `contratual | adiantamento`
- `forma_pagamento, conta_bancaria_id`
- `nf_origem_id` — rastreia qual NF gerou esta parcela

> **Regra inviolável:** `valor_pago` e `status` nunca são atualizados diretamente. Sempre via `aplicarDeltaOrigem`, que recalcula o saldo e deriva o status.

---

## 5. Adiantamentos a Fornecedores

### Definição e Separação

Adiantamentos são uma entidade própria, **separada de mútuos**. A fronteira é o vínculo com um pedido:

| Instrumento | Quando usar | Vínculo |
|-------------|-------------|---------|
| **Adiantamento** (`adiantamentos`) | Pagamento antecipado de um fornecedor para um pedido já existente | `pedido_id` obrigatório |
| **Mútuo** (`mutuos`) | Crédito a fornecedor sem pedido formalizado, ou instrumento financeiro independente | `fornecedor_id` direto |

### Tabela `adiantamentos`

```
id, company_id
pedido_id (FK — obrigatório)
fornecedor_id (FK)
valor
data_pagamento
data_prevista_abatimento
valor_abatido (calculado pelas conciliações de abatimento)
status: 'pago' | 'parcialmente_abatido' | 'abatido'
conta_bancaria_id
forma_pagamento
observacao
```

### Fluxo do Adiantamento

```
1. Gestor registra adiantamento → vincula ao pedido
2. Saída do caixa (movimentacao) → conciliada no adiantamento
3. NF chega → parcelas do pedido são geradas
4. Abatimento: parcela do pedido marcada como "coberta pelo adiantamento"
   (valor_pago = valor adiantado, forma = 'adiantamento')
5. status do adiantamento → 'abatido'
```

> Enquanto não abatido, o adiantamento aparece no painel como **risco de fornecedor** — dinheiro saiu sem produto ou serviço entrado.

---

## 6. Camada 3 — Faturamento (Medições)

### Entidades
- `medicoes` — unidade de faturamento por quinzena
- `cronograma_distribuicao` — distribuição física por etapa/medição
- `medicao_parcelas` — cronograma de recebimento (espelho das `parcelas` de saída)

### Campos de `medicoes` (enriquecidos)

```
id, company_id, numero
valor_planejado, valor_liberado
data_prevista (física), data_liberacao (aprovação do cliente)
data_prevista_recebimento — editável pelo gestor
forma_recebimento (TED, PIX, Boleto)
conta_bancaria_id
valor_recebido — calculado via conciliacao_parcelas
status: 'futura' | 'em_medicao' | 'liberada' | 'paga'
```

### Tabela `medicao_parcelas`

Espelha o modelo de `parcelas`, mas para entradas:

```
id, company_id
medicao_id (FK)
numero_parcela, valor
data_vencimento
data_prevista_recebimento — editável
data_recebimento_real, valor_recebido
status: 'futura' | 'a_receber' | 'recebida' | 'vencida' | 'parcialmente_recebida'
forma_recebimento
conta_bancaria_id
```

Geradas automaticamente quando a medição é **liberada** pelo cliente, com base na condição de recebimento do contrato.

### Regra de Status

Mesmo critério das parcelas de saída:
- `valor_recebido` nunca setado diretamente — derivado pela conciliação
- `status` derivado do saldo com tolerância de R$ 0,01

---

## 7. Camada 4 — Financeiro Expandido

### 7a. Despesas Indiretas

Custos do projeto sem pedido de compra associado.

Geração de parcelas:
- **Recorrentes** (mensal, quinzenal, semanal): parcelas geradas automaticamente para o período `data_inicio → data_fim`
- **Pontuais** com `cond_pagamento`: mesma lógica do pedido (parsing de "30/60/90")
- **Únicas** sem parcelamento: uma parcela com `data_vencimento` definida

### 7b. Mútuos e Capital de Giro

Instrumentos financeiros independentes do ciclo de compras.

**Direção:**
- `categoria = entrada` → empresa tomou dinheiro (passivo); principal entra no caixa, amortizações saem
- `categoria = saida` → empresa emprestou (ativo); principal sai, retornos entram

**Conciliação:**
- Principal: `conciliacao_parcelas.mutuo_id`
- Amortizações: `conciliacao_parcelas.mutuo_parcela_id`

---

## 8. Camada 5 — Caixa e Conciliação

### Modelo de Conciliação

```
movimentacoes_bancarias (extrato importado)
    ↓
conciliacoes (match com confiança)
    ↓
conciliacao_parcelas (origem polimórfica — EXATAMENTE UMA FK preenchida)
    ├── parcela_id          → saída de pedido ou despesa indireta
    ├── medicao_parcela_id  → entrada de medição
    ├── mutuo_parcela_id    → amortização de mútuo
    ├── mutuo_id            → captação principal
    └── adiantamento_id     → saída de adiantamento
```

**Regras da conciliação:**
1. Uma movimentação pode ter N `conciliacao_parcelas` (pagamento parcial de múltiplas origens)
2. Cada `conciliacao_parcela` aponta para **exatamente uma** origem (nunca duas FKs preenchidas)
3. `SUM(conciliacao_parcelas.valor_aplicado)` deve igualar `movimentacoes_bancarias.valor` (tolerância R$ 0,01)
4. Toda mutation financeira invalida as queries: `conciliacoes + movimentacoes + parcelas + medicoes + mutuos`

---

## 9. Projeção de Caixa

`useCashFlowEvents` é a fonte única de verdade para projeção de caixa. Agrega em modo `'completo'`:

| Tipo | Fonte | Data usada |
|------|-------|------------|
| Saídas planejadas | `parcelas` (status ≠ paga) | `data_prevista_pagamento` |
| Entradas planejadas | `medicao_parcelas` (status ≠ recebida) | `data_prevista_recebimento` |
| Captações planejadas | `mutuos` (entrada) | `data_captacao` |
| Amortizações planejadas | `mutuo_parcelas` (status ≠ paga) | `data_vencimento` |
| Adiantamentos planejados | `adiantamentos` (status = pendente) | `data_pagamento` |
| Realizadas (saídas) | `movimentacoes_bancarias` (tipo = saida, conciliado) | `data` |
| Realizadas (entradas) | `movimentacoes_bancarias` (tipo = entrada, conciliado) | `data` |

---

## 10. Regras de Consistência Global

| Regra | Verificação |
|-------|-------------|
| `valor_pago` e `valor_recebido` nunca atualizados diretamente | Sempre via `aplicarDeltaOrigem` |
| Toda saída financeira tem origem identificável | `conciliacao_parcelas` nunca com todas as FKs nulas |
| Consumo de NF sempre grava `recepcao_consumos` | Trigger garante; nunca apagar `recepcao_docs` diretamente |
| Saldo de item = orçado − consumido | `valor_consumido = SUM(recepcao_consumos.valor_consumido)` por item |
| Status derivado do saldo | Tolerância R$ 0,01; nunca setado manualmente |
| Adiantamento sempre vinculado a pedido | `adiantamentos.pedido_id NOT NULL` |
| Toda mutation crítica grava `audit_logs` | company_id + enabled em toda query |
| `medicao_parcelas` só existem após medição `liberada` | Trigger ou RPC ao mudar status |

---

## 11. Diagrama Completo de Entidades

```
etapas
  └── itens_compra
        ├── fornecedor_id → fornecedores
        └── cond_pagamento

pedidos
  ├── item_compra_id → itens_compra
  ├── fornecedor_id → fornecedores
  ├── status_entrega (trigger)
  ├── status_pagamento (trigger de parcelas)
  └── pedido_itens
        └── qtd_recebida (trigger de recepcao_consumos)

recepcao_docs
  └── recepcao_consumos
        ├── pedido_id → pedidos
        └── pedido_item_id → pedido_itens

parcelas (saídas)
  ├── pedido_id → pedidos        (XOR)
  └── despesa_indireta_id → despesas_indiretas

adiantamentos
  └── pedido_id → pedidos

medicoes
  └── medicao_parcelas (entradas)
        └── conciliacao_parcelas.medicao_parcela_id

mutuos
  └── mutuo_parcelas

despesas_indiretas
  └── etapa_id → etapas (opcional; NULL = overhead geral)

movimentacoes_bancarias
  └── conciliacoes
        └── conciliacao_parcelas
              ├── parcela_id
              ├── medicao_parcela_id
              ├── mutuo_parcela_id
              ├── mutuo_id
              └── adiantamento_id
```