# 01 — Templates canônicos de importação (Build Fleury)

> Fonte: código no commit **b0652db** (master), pós-correções P0/P1/P2.
> Documento-base: `IMPORT_TEMPLATES_CANONICAL.md` na raiz do repo.
> Use este arquivo para checar headers de planilha contra o que o sistema aceita HOJE.

## Mapa rápido

| # | Entidade | Onde importar (UI) | Parser principal |
|---|---|---|---|
| 1 | Cronograma — WBS multi-aba | aba **"WBS Completa (Excel)"** | `src/lib/wbsImport.ts` |
| 1b | Cronograma — Dados Base CSV/XLSX | aba **"Dados Base"** | `ImportacaoPage.tsx` `DadosBaseTab` |
| 1c | Distribuição standalone | aba **"Distribuição Cronograma"** | `ImportacaoPage.tsx` `DistribuicaoTab` |
| 2 | Pedidos | aba **"Pedidos"** | `ImportacaoPage.tsx` `PedidosTab` |
| 3 | Parcelas | **não tem import direto** — geradas por `gerarParcelas` | `src/lib/parcelas.ts` |
| 4 | Fluxo de Caixa | **não tem import direto** — derivado de parcelas+medições+mútuos+movs | `src/hooks/useCashFlowEvents.ts` |
| 5 | Realizado (BD construtora) | aba **"Pagamentos Realizados"** | `src/lib/bdRealizadoImport.ts` |
| (extra) | Custos Indiretos | aba **"Custos Indiretos"** | `ImportacaoPage.tsx` `CustosIndiretosTab` |
| (extra) | Medições | aba **"Medições"** (cadastro manual em UI) | `MedicoesTab` |

---

## 1. Cronograma — WBS multi-aba (caminho oficial)

**Arquivo aceito**: `.xlsx` com 3 abas. Idêntico ao formato exportado.
**Linha de cabeçalho**: 1 (primeira linha).
**Match de coluna**: aba "Etapas" agora usa `findCol` com aliases (P0.4 aplicado); demais abas já usavam fuzzy.

### 1.A Aba "Etapas" — nome literal `Etapas`

| Coluna canônica | Aliases aceitos | Tipo | Obrigatório | Default | Notas |
|---|---|---|---|---|---|
| `Código` | `Codigo`, `Cod`, `Código Etapa`, `Codigo Etapa` | text | sim para criar | `NEW-{ts}` | chave de busca |
| `Nome` | `Nome Etapa`, `Descrição`, `Descricao` | text | sim | `Nova Etapa` | |
| `Status` | `Situação`, `Situacao` | text | não | `futuro` | sanitizado: `concluido` / `em_andamento` / `atrasado` / `futuro` |
| `Casas` | `Qtd Casas`, `Quantidade Casas`, `Nº Casas`, `No Casas`, `Casas Total` | int | não | 64 | usado para recalcular `qtd_total` dos itens |
| `Ordem` | (sem aliases) | int | não | maxOrder+1 | só em CREATE |
| `Receita CEF` | `Receita`, `Faturamento CEF`, `Faturamento Total` | number | não | null | grava em `faturamento_valor_total` |
| `Preço Unitário (Serv)` | `Preco Unitario Serv`, `Preço Unitário Serviço`, `Preço Unit Serv` | number | não | null | `faturamento_preco_unitario` |
| `Qtd/Casa (Serv)` | `Qtd Casa Serv`, `Qtd/Casa Serviço` | number | não | null | `faturamento_quantidade_unitaria` |
| `Unidade (Serv)` | `Unidade Serv`, `Unidade Serviço` | text | não | null | `faturamento_unidade` |
| `Data Início Plan` | `Data Inicio Plan`, `Início Plan`, `Data Início` | date | não | null | aceita ISO, BR, Excel serial |
| `Data Fim Plan` | `Fim Plan`, `Data Fim` | date | não | null | idem |
| `Observações` | `Observacoes`, `Obs`, `Observacao` | text | não | null | |

### 1.B Aba "Itens de Compra" — nome literal `Itens de Compra`

Match fuzzy (`stripForMatch` + `findCol`): NFD → minúsculas → remove `\s/_.-`.

| Coluna canônica | Aliases | Tipo | Obrigatório | Default | Notas |
|---|---|---|---|---|---|
| `Item Cód` | `Código do Item`, `Código Item`, `Item Codigo`, `Cod Item` | text | sim para criar | `ITEM-{ts}` | |
| `Etapa Cód` | `Código da Etapa`, `Etapa Codigo`, `Cod Etapa` | text | **sim** | — | sem etapa válida → linha rejeitada |
| `Etapa Nome` | — | text | não | — | informativo |
| `Descrição` | `Nome`, `Descricao Item` | text | sim | `Novo Item` | |
| `Tipo` | `Categoria` | text | não | `MATERIAL` | sanitizado para `MATERIAL` / `MAO_DE_OBRA` / `EQUIPAMENTO` |
| `Qtd/Casa` | `Qtd Casa`, `Quantidade por Casa`, `Qtd. Casa`, `Qtd. por Casa`, `Qtd/Casa (Mat)` | number | não | null | |
| `Qtd Total` | `Quantidade Total`, `Qtd. Total`, `Total Qtd` | number | não | calculado | `Qtd/Casa × Casas da etapa` |
| `Unidade` | `Unid.`, `Unid`, `UN` | text | não | null | |
| `Custo Unitário` | `Custo Unitario`, `R$/un`, `Preço Unitário`, `Preço Unit.`, `Preco Unitario`, `Custo Unit` | number | não | 0 | |
| `Valor Total Orçado` | `R$ Total`, `Total`, `Valor Total`, `Vlr. Total` | number | não | calculado | `qtd_total × custo_unitario` |
| `Fornecedor` | `Fornecedores`, `Nome do Fornecedor` | text | não | null | **auto-cria** se não existir |
| `Cond. Pagamento` | `Condição de Pagamento`, `Cond Pagamento`, `Pagamento`, `Cond. Pgto` | text | não | null | string crua (`30/60`, `à vista`, etc.) |

### 1.C Aba "Distribuição" — nome literal `Distribuição` (com cedilha)

| Coluna | Aliases | Tipo | Obrigatório | Default | Notas |
|---|---|---|---|---|---|
| `Etapa Cód` | (acesso direto) | text | **sim** | — | |
| `Etapa Nome` | — | text | não | — | informativo |
| `Medição` | (acesso direto) | int | sim | 0 | se a Medição-pai não existir, **é auto-criada** |
| `Casas Planejadas` | `Casas`, `Qtd Casas` | int | não | 0 | |
| `Casas Realizadas` | — | int | não | 0 | |
| `Data Início` | `Data Inicio` | date | não | null | |
| `Data Fim` | — | date | não | null | usada como `data_prevista` se medição auto-criada |
| `Receita a Liberar` | `Receita a Liberar (R$)`, `Receita` | number | não | 0 | grava em `valor_liberado_faturamento` |

### Validações WBS — mensagens literais

- Item sem etapa: `Etapa "{cod}" não encontrada no BD — item não pode ser vinculado.`
- Distribuição órfã: `Etapa "{cod}" não encontrada — distribuição órfã.`
- Erros Postgres traduzidos:
  - `23505` → `Duplicado: "{val}" já existe no campo {col}`
  - `23503` → `Referência inválida: ...`
  - `23502` → `Campo obrigatório vazio: ...`
  - `23514` → `Violação de restrição: ...`
  - `22P02` → `Tipo inválido: ...`
  - `22001` → `Texto excede o tamanho máximo do campo`

### Transformações WBS

- **Datas** (`toDateISO`): aceita ISO `YYYY-MM-DD`, BR `DD/MM/YYYY`, Excel serial (1 a 200000).
- **Números** (`parseNumber`): `R$ 1.234,56` ou `1,234.56` → 1234.56. Ignora ` `.
- **Status**: NFD-strip + match com listas hard-coded.
- **Tipo**: contém `MAO_DE_OBRA` | `SERVICO` | `M_O` → `MAO_DE_OBRA`; `EQUIPA` | `MAQUINA` → `EQUIPAMENTO`; senão `MATERIAL`.
- **Cascata**: alterar `Casas` da etapa recalcula `qtd_total` e `valor_total_orcado` de TODOS os itens da etapa.

---

## 1b. Cronograma — Dados Base CSV/XLSX

**Cabeçalhos em snake_case** (lowercase + NFD-strip + `\s+` → `_`).
Ainda mais frouxo que o WBS — aceita CSV com separador `\t` / `;` / `,` (auto).

### Alvo `etapas`
- **Required**: `codigo`, `nome`
- **Optional**: `ordem`, `data_inicio_plan`, `data_fim_plan`, `casas_total`, `valor_total_orcado`, `status`, `observacoes`, `receita_cef`, `preco_unitario_serv`, `qtd_casa_serv`, `unidade_serv`

### Alvo `itens_compra`
- **Required**: `codigo`, `descricao`, `tipo`, `etapa_codigo`
- **Optional**: `categoria`, `unidade`, `qtd_por_casa`, `qtd_total`, `custo_unitario_orcado`, `valor_total_orcado`, `fornecedor_nome`, `cond_pagamento`

### Alvo `fornecedores`
- **Required**: `nome`
- **Optional**: `cnpj`, `contato`, `cond_pagamento_padrao`, `observacoes`

### Validações — mensagens literais
- `Linha {N}: campos faltando: {csv}`
- `Linha {N}: etapa "{cod}" não encontrada` (em itens_compra)
- `Linha {N}: nome do fornecedor vazio` (em fornecedores)

> **Diferenças notáveis vs WBS**: aqui datas, status e tipo passam por `toDateISO`/`sanitizeStatus`/`sanitizeTipo` (P0 corrigido). Fornecedor **NÃO é auto-criado** quando importando itens via Dados Base — fica `null` se o `ilike` não casar.

---

## 1c. Distribuição standalone

Headers em snake_case: `etapa_codigo, medicao_numero, data, casas`.
- `etapa_codigo` obrigatório (lookup exato em `etapas.codigo`)
- `data` obrigatória (formato cru — falha se Excel serial)
- `medicao_numero` opcional (auto-incrementa por etapa se faltar)
- `casas` → grava em `casas_planejadas`

---

## 2. Pedidos

Aceita **dois formatos simultâneos** (decisão pelo header detectado):

### Formato A — snake_case (`template_pedidos4.xlsx`)

| Coluna | Tipo | Obrigatório | Default | Notas |
|---|---|---|---|---|
| `item_codigo` | text | sim para vincular | — | resolvido contra `itens_compra.codigo`; fallback por descrição+etapa |
| `numero_pedido` | int | não | null | |
| `casas_lote` | int | não | 0 | |
| `fornecedor_nome` | text | não | — | **auto-criado** se não casar |
| `cond_pagamento` | text | não | `cond_pagamento_padrao` do fornecedor ou `à vista` | |
| `data_entrega_prevista` | date | não | etapa.data_inicio_plan ou today+30 | |
| `valor_unitario_real` | number | não | `item.custo_unitario_orcado` | |

### Formato B — PT-BR real (planilha do cliente)

Detectado quando header contém `etapa`, `item` ou `fornecedor`. Aliases mapeados via `findPedCol` (case-insensitive, ignora `_/space/.`):

| Coluna PT-BR aceita | Mapeada para | Tipo |
|---|---|---|
| `ETAPA` / `etapa` | `_etapa_nome` (auxiliar p/ match) | text |
| `ITEM` / `item` / `descricao` | `_item_descricao` (auxiliar) | text |
| `Código` / `codigo` / `item_codigo` / `item_cod` | `item_codigo` | text |
| `FORNECEDOR` / `fornecedor_nome` | `fornecedor_nome` | text |
| `COND PAGTO` / `COND. PAGTO` / `cond_pagamento` / `Cond Pagamento` | `cond_pagamento` | text |
| `QUANTIDADE DE CASAS` / `casas_lote` / `casas` | `casas_lote` | int |
| ` VALOR UNIT. ` / `valor_unitario_real` / `VALOR UNIT.` / `valor_unit._1` | `valor_unitario_real` | number |
| `VALOR TOTAL` / `valor_total_1` / `VALOR TOTAL_1` | `valor_total_override` (precedência sobre cálculo) | number |
| `quant._2` / `QUANT._2` | `_qtd_entrega` | number |
| `DATA DA ENTREGA` / `data_da_entrega` / `data_entrega_prevista` / `DATA ENTREGA` | `data_entrega_prevista` | date |
| `NUMERO PEDIDO` / `NÚMERO PEDIDO` / `Nº Pedido` / `No Pedido` / `PEDIDO` / `numero_pedido` / `num_pedido` | `numero_pedido` | int (P0.3 — antes era hard-null) |

### Cascatas em Pedidos

- Cria fornecedor se não existir.
- Após INSERT do pedido, dispara `gerarParcelas` automaticamente.
- Trigger de DB consolida `pedidos.status` baseado em `Σ valor_pago` em parcelas (`pago` quando `Σ ≥ valor_total - 0.01`).

### Mensagens literais
- `Linha {N}: Item "{descricao_ou_codigo}" não encontrado` (item ignorado)
- Erros Postgres traduzidos como em §1.A.

### Status válidos (CHECK)
`planejado` | `pedido_enviado` | `entregue` | `parcialmente_pago` | `pago` | `cancelado`. Import sempre grava `planejado`.

---

## 3. Parcelas

**Não há template de import.** Sempre derivadas. O arquivo `PAGAMENTOS_2_parcelas_*.xlsx` é EXPORT — não tente importá-lo.

### Parser de `cond_pagamento` (`parsearCondicao`)

| Input | Output (dias após data-base) |
|---|---|
| `30/60` | `[30, 60]` |
| `28/56/84` | `[28, 56, 84]` |
| `0/17` | `[0, 17]` |
| `49` | `[49]` |
| `à vista` / `a vista` / `avista` / `av` | `[0]` |
| `''`, `null`, `undefined` | `[0]` |
| `30,60` / `30;60` / `30 60` | `[30, 60]` |

### Geração (`gerarParcelas`)

- Divide igual em N parcelas; **última absorve resíduo de centavos** → `Σ = valor_total` exato.
- Cada vencimento = `dataBase + dias[i]`, ajustado para dia útil:
  - Sábado → Sexta (-1)
  - Domingo → Segunda (+1)
  - **Sem regra de feriado nacional/municipal.**
- Se `valor_total <= 0` → retorna `[]` (não cria parcela).

### Schema relevante

- `tipo` NOT NULL DEFAULT `contratual`. CHECK: `tipo IN ('contratual', 'adiantamento')`. Imports sempre usam o DEFAULT.
- `status` usado: `futura`, `paga`, `parcialmente_paga`. **CHECK constraint não foi encontrada nas migrations** — depende do schema atual no Supabase.
- Cada parcela aponta para `pedido_id` **ou** `despesa_indireta_id` — nunca ambos.

---

## 4. Fluxo de Caixa

**Não há import.** Derivado em runtime por `useCashFlowEvents` a partir de:

- `parcelas` (saídas previstas)
- `medicoes` + `cronograma_distribuicao` (entradas previstas)
- `mutuos` (entradas/saídas de empréstimo)
- `movimentacoes_bancarias` (realizado bancário, deduplicado via conciliações)
- `contas_bancarias.saldo_inicial` (somado) ou `companies.saldo_inicial_caixa` (fallback)
- `companies.prazo_recebimento_dias` (default 30) — desloca data de recebimento de cada medição

Se o Pedro perguntar "como importo o fluxo de caixa?", a resposta é: **não importa**, ele se forma sozinho quando você preenche as outras 4 entidades.

---

## 5. Realizado — BD Construtora

**Arquivo**: `BD REALIZADO - CONSTRUTORA.xlsx` (cliente). Aba detectada por nome contendo `bd_realiz` / `bd realiz` / `realizado`. **Linha de cabeçalho auto-detectada** dentro das 20 primeiras linhas (≥3 hits das keywords `data, fornecedor, valor, categoria, tipo, conta, pagto, emissao`).

### Colunas reconhecidas (substring fuzzy bidirecional)

| Buscada | Aliases | Uso |
|---|---|---|
| `Data de Pagto ou Recbto (completa)` | `Data de Pagto`, `Data de Crédito`, `Data Pagto` | data principal |
| `Data de Emissão (completa)` | `Data de Emissão`, `Emissão` | fallback se data principal vazia |
| `Cliente ou Fornecedor (Nome Fantasia)` | `Cliente ou Fornecedor`, `Fornecedor`, `Nome Fantasia` | match `fornecedores.nome` (auto-cria) |
| `Tipo` | — | informativo (não decide) |
| `Categoria` | — | decide se é mútuo/financeiro |
| `Valor da Conta` | — | informativo |
| `Pago ou Recebido` | `Pago`, `Recebido` | **decide o caminho via SINAL** |
| `A Pagar ou Receber` | — | informativo |
| `Conta Corrente` | — | resolve `contas_bancarias` |
| `Departamento` | — | match com `etapas.nome` (ilike) |
| `ITEM` | — | descrição p/ Item Flex |
| `MEDIÇÃO` | `MEDICAO` | concatena em `observacoes` |
| `Observação da Conta` | `Observação`, `Observacao` | `observacoes` |
| `Origem` | — | `observacoes` |
| `NF/CF` | `NF` | `observacoes` |
| `Conta Pai` | — | `movimentacoes_bancarias.observacao` |

### Classificação por SINAL

| Condição | `importPath` | Resultado |
|---|---|---|
| `\|valor\| < 0.01` | `skip` | nada |
| `valor > 0` + categoria ∈ `{EMPRESTIMOS BANCARIOS, ENTRADA DE TRANSFERENCIA}` | `mutuo` | INSERT em `mutuos` (com check de duplicata) |
| `valor > 0` (outras) | `credito` | só registra `movimentacoes_bancarias` |
| `valor < 0` + categoria ∈ `{PAGAMENTO DE EMPRESTIMOS, EMPRESTIMOS BANCARIOS, DISTRIBUICAO DE LUCROS, SAIDA DE TRANSFERENCIA}` | `skip` (P2.8) | só `movimentacoes_bancarias`, label `🏦 Mov. financeira` |
| `valor < 0` (outras) | `despesa` | tenta casar parcela existente; senão Item Flex + pedido fantasma OU `despesas_indiretas` |

### Match de parcela (apenas `despesa`)

- Janela: ±120 dias do `data_pagamento`
- Tolerância exata: `±max(valor*0.01, 0.5)`
- Match parcial: `saldo + 0.01 ≥ valor`
- Score blend: exato=0, parcial=+500, fornecedor incompatível=+2000, +distância% valor (0-100), +diasDiff*2
- Aceita só se melhor for fornecedor-compatível OU match exato

### Datas

- `Date` → ISO
- 5 dígitos → Excel serial
- ISO `YYYY[/.-]MM[/.-]DD` ou BR `DD[/.-]MM[/.-]YYYY` → ISO
- Ano com 3 dígitos (ex.: `202-04-30`) → **rejeitado** (P2.9 corrigido). Linha vai para erro `Sem data válida`.

### Mensagens literais

- `#{seq} [Ignorado]: Sem data válida (pagamento/emissão).`
- `#{seq} [Mov]: {erro_postgres}`
- `#{seq} [Pedido]: {erro_postgres}`

---

## Apêndice — checklist rápido por entidade

### Cronograma WBS — antes de subir
- [ ] 3 abas: `Etapas`, `Itens de Compra`, `Distribuição` (cedilha)
- [ ] Linha 1 = headers
- [ ] Toda Etapa Cód referenciada em Itens existe em Etapas
- [ ] Toda Etapa Cód referenciada em Distribuição existe em Etapas
- [ ] Datas em ISO ou BR (não confiar em Excel serial)

### Pedidos — antes de subir
- [ ] Cada item resolvível por código OU por descrição+etapa
- [ ] `cond_pagamento` em formato `N` ou `N/N/...` ou `à vista`
- [ ] Fornecedores podem ser novos (serão auto-criados)

### BD Realizado — antes de subir
- [ ] Aba com nome contendo `realizado` / `bd realiz`
- [ ] Cabeçalhos contêm pelo menos 3 das keywords
- [ ] Coluna `Pago ou Recebido` existe (decisor de fluxo)
- [ ] Não tem ano de 3 dígitos (`202-XX-XX`) em nenhuma data
