# IMPORT_TEMPLATES_CANONICAL.md

Gerado a partir do código em **2026-05-03** no commit **b0652db49c670f41c99ddef9c98d874acf9da795** (branch `master`).

> Este documento é a fonte de verdade dos templates de importação aceitos pelo Build Fleury hoje.
> Não é manual de uso; é especificação para o kit de validação pré-import.
> **Tudo aqui foi extraído do código.** Onde algo não pôde ser confirmado, o texto diz "não encontrado no código".

## Mapa rápido das 5 entidades

| # | Entidade | Como é importada hoje | Arquivo principal |
|---|---|---|---|
| 1 | Cronograma (etapas + itens + distribuição) | 3 caminhos: WBS multi-aba, Dados Base CSV/XLSX e Distribuição standalone | [src/lib/wbsImport.ts](src/lib/wbsImport.ts), [src/pages/ImportacaoPage.tsx](src/pages/ImportacaoPage.tsx) |
| 2 | Pedidos (compras) | Tab "Pedidos" — aceita formato snake_case OU formato real PT-BR | [src/pages/ImportacaoPage.tsx:415-689](src/pages/ImportacaoPage.tsx#L415-L689) |
| 3 | Parcelas | **Não há importador dedicado.** Geradas automaticamente a partir de `cond_pagamento` de Pedidos / Custos Indiretos | [src/lib/parcelas.ts](src/lib/parcelas.ts) |
| 4 | Fluxo de Caixa | **Não há importador dedicado.** É derivado de parcelas + medições + mútuos + movimentações | [src/hooks/useCashFlowEvents.ts](src/hooks/useCashFlowEvents.ts) |
| 5 | Realizado (BD construtora) | Tab "Pagamentos Realizados" — heurística sobre planilha externa do cliente | [src/lib/bdRealizadoImport.ts](src/lib/bdRealizadoImport.ts), [src/pages/ImportacaoPage.tsx:2038-2633](src/pages/ImportacaoPage.tsx#L2038-L2633) |

Há ainda dois importadores secundários ligados ao Cronograma:
- **Custos Indiretos** (Tab "Custos Indiretos" — vai para `despesas_indiretas`) — [ImportacaoPage.tsx:715-924](src/pages/ImportacaoPage.tsx#L715-L924)
- **Composição CEF** (faturamento por medição) — [src/lib/composicaoParser.ts](src/lib/composicaoParser.ts) — sem UI ativa encontrada na importação atual.

---

## 1. Cronograma

### 1.0 Visão geral
Hoje existem **três caminhos de import** para alimentar o Cronograma. Eles são complementares e os parsers são diferentes:

- **1.A — WBS Completa (Excel multi-aba)**: caminho oficial, idêntico ao formato exportado.
- **1.B — Dados Base (CSV ou Excel single-tab)**: caminho legacy, snake_case puro, uma tabela alvo por vez (`etapas` | `itens_compra` | `fornecedores`).
- **1.C — Distribuição standalone (CSV/Excel)**: alimenta apenas `cronograma_distribuicao`.

### 1.A WBS Completa (Excel multi-aba)

UI: aba **"WBS Completa (Excel)"** em [src/pages/ImportacaoPage.tsx:1955-2030](src/pages/ImportacaoPage.tsx#L1955-L2030)
Parser: `parseWBSImport` em [src/lib/wbsImport.ts:158-171](src/lib/wbsImport.ts#L158-L171)
Dry-run: `buildImportPreview` em [src/lib/wbsImport.ts:174-346](src/lib/wbsImport.ts#L174-L346)
Apply: `applyImport` em [src/lib/wbsImport.ts:373-824](src/lib/wbsImport.ts#L373-L824)

#### 1.A.1 Schema — Aba "Etapas"

- **Aba esperada**: `Etapas` (string exata, case-sensitive — `wb.Sheets['Etapas']` em [wbsImport.ts:161](src/lib/wbsImport.ts#L161))
- **Linha de cabeçalho**: 1 (parser usa `XLSX.utils.sheet_to_json` com defaults, primeira linha = headers)

| Coluna (nome exato) | Tipo | Obrigatório | Default | Notas |
|---|---|---|---|---|
| `Código` | text | sim para criar/atualizar | — | chave de busca; sem ela, vira `NEW-{Date.now()}` na inserção ([wbsImport.ts:461](src/lib/wbsImport.ts#L461)) |
| `Nome` | text | sim para criar | `'Nova Etapa'` | [wbsImport.ts:462](src/lib/wbsImport.ts#L462) |
| `Status` | text | não | `'futuro'` | sanitizado por `sanitizeStatus` ([wbsImport.ts:363-370](src/lib/wbsImport.ts#L363-L370)) |
| `Casas` | number | não | `64` | usado também para recalcular `qtd_total` dos itens ([wbsImport.ts:206,464](src/lib/wbsImport.ts#L206)) |
| `Ordem` | number | não | `(currentEtapas.length + etapasCriadas + 1)` | apenas em CREATE; UPDATE não toca em ordem ([wbsImport.ts:458](src/lib/wbsImport.ts#L458)) |
| `Receita CEF` | number | não | `null` | grava em `etapas.faturamento_valor_total` |
| `Preço Unitário (Serv)` | number | não | `null` | grava em `faturamento_preco_unitario` |
| `Qtd/Casa (Serv)` | number | não | `null` | grava em `faturamento_quantidade_unitaria` |
| `Unidade (Serv)` | text | não | `null` | grava em `faturamento_unidade` |
| `Data Início Plan` | date | não | `null` | grava em `data_inicio_plan` (ver §1.A.4) |
| `Data Fim Plan` | date | não | `null` | grava em `data_fim_plan` (ver §1.A.4) |
| `Observações` | text | não | `null` | — |

> Observação: o parser **NÃO** aplica fuzzy match em colunas de Etapas — ele lê com a chave PT-BR exata via `row['Código']`, `row['Nome']` etc. Qualquer divergência (ex.: `Codigo` sem acento) é silenciosamente ignorada.

#### 1.A.2 Schema — Aba "Itens de Compra"

- **Aba esperada**: `Itens de Compra` ([wbsImport.ts:164](src/lib/wbsImport.ts#L164))
- **Linha de cabeçalho**: 1
- Esta aba **usa fuzzy match** em quase todas as colunas via `findCol` ([wbsImport.ts:99-123](src/lib/wbsImport.ts#L99-L123)) — strip de acentos, espaços, `_`, `.`, `-`, `/` antes de comparar (exact → starts-with → includes).

| Coluna (nome canônico do template) | Aliases aceitos pelo `findCol` | Tipo | Obrigatório | Default | Notas |
|---|---|---|---|---|---|
| `Item Cód` | `Código do Item`, `Código Item`, `Item Codigo`, `Cod Item` | text | sim para criar | `ITEM-{base36 timestamp}` | chave de busca em `itens_compra.codigo` ([wbsImport.ts:233,642](src/lib/wbsImport.ts#L233)) |
| `Etapa Cód` | `Código da Etapa`, `Etapa Codigo`, `Cod Etapa` | text | sim | — | resolvido contra `etapas.codigo`. **Se não achar, o item é rejeitado com erro** ([wbsImport.ts:622-626](src/lib/wbsImport.ts#L622-L626)) |
| `Etapa Nome` | (sem aliases) | text | não | — | só informativo no template; não é gravado |
| `Descrição` | `Nome`, `Descricao Item` | text | sim para criar | `'Novo Item'` | [wbsImport.ts:643](src/lib/wbsImport.ts#L643) |
| `Tipo` | `Categoria` | text | não | `'MATERIAL'` | normalizado por `sanitizeTipo` ([wbsImport.ts:149-155](src/lib/wbsImport.ts#L149-L155)) → `MATERIAL` \| `MAO_DE_OBRA` \| `EQUIPAMENTO` |
| `Qtd/Casa` | `Qtd Casa`, `Quantidade por Casa`, `Qtd. Casa`, `Qtd. por Casa`, `Qtd/Casa (Mat)` | number | não | `null` | parsed por `parseNumber` ([wbsImport.ts:126-146](src/lib/wbsImport.ts#L126)) |
| `Qtd Total` | `Quantidade Total`, `Qtd. Total`, `Total Qtd` | number | não | calculado: `Qtd/Casa × Casas da etapa` se vazio ([wbsImport.ts:632](src/lib/wbsImport.ts#L632)) | |
| `Unidade` | `Unid.`, `Unid`, `UN` | text | não | `null` | |
| `Custo Unitário` | `Custo Unitario`, `R$/un`, `Preço Unitário`, `Preço Unit.`, `Preco Unitario`, `Custo Unit` | number | não | `0` | grava em `custo_unitario_orcado` |
| `Valor Total Orçado` | `R$ Total`, `Total`, `Valor Total`, `Vlr. Total` | number | não | calculado: `qtd_total × custo_unitario` se vazio ([wbsImport.ts:635-637](src/lib/wbsImport.ts#L635-L637)) | grava em `valor_total_orcado`. `valor_saldo` é GENERATED ALWAYS no banco ([wbsImport.ts:604](src/lib/wbsImport.ts#L604)) |
| `Fornecedor` | `Fornecedores`, `Nome do Fornecedor` | text | não | `null` | resolvido contra `fornecedores.nome` (UPPER+trim). **Cria fornecedor se não existir** ([wbsImport.ts:530-547](src/lib/wbsImport.ts#L530-L547)) |
| `Cond. Pagamento` | `Condição de Pagamento`, `Cond Pagamento`, `Pagamento`, `Cond. Pgto` | text | não | `null` | string passada como veio (ex.: `30/60/90`); só é parseada quando geram-se parcelas |

#### 1.A.3 Schema — Aba "Distribuição"

- **Aba esperada**: `Distribuição` (com cedilha; é a string literal em [wbsImport.ts:167](src/lib/wbsImport.ts#L167))
- **Linha de cabeçalho**: 1
- Etapa Cód e Medição usam acesso **direto por chave** (não fuzzy); demais colunas usam `findCol`.

| Coluna | Aliases | Tipo | Obrigatório | Default | Notas |
|---|---|---|---|---|---|
| `Etapa Cód` | (acesso direto, sem alias — [wbsImport.ts:310](src/lib/wbsImport.ts#L310)) | text | sim | — | resolvido contra `etapas.codigo`; sem etapa, distribuição é rejeitada |
| `Etapa Nome` | — | text | não | — | informativo |
| `Medição` | (acesso direto) | int | sim | `0` | chave junto com etapa para upsert. Se a `medicao_numero` ainda não existe na tabela `medicoes`, **é auto-criada** ([wbsImport.ts:684-717](src/lib/wbsImport.ts#L684-L717)) |
| `Casas Planejadas` | `Casas`, `Qtd Casas` | int | não | `0` | |
| `Casas Realizadas` | (sem aliases extras) | int | não | `0` | |
| `Data Início` | `Data Inicio` | date | não | `null` | |
| `Data Fim` | (sem aliases) | date | não | `null` | usada como `data_prevista` se a Medição-pai precisar ser auto-criada |
| `Receita a Liberar` | `Receita a Liberar (R$)`, `Receita` | number | não | `0` | grava em `valor_liberado_faturamento` |

#### 1.A.4 Validações backend (WBS)

- **VR-WBS-1** (`wbsImport.ts:622-626`): item cuja `Etapa Cód` não exista no banco é rejeitado com erro literal:
  - `Etapa "{cod}" não encontrada no BD — item não pode ser vinculado. Verifique se a aba Etapas contém o código "{cod}".`
- **VR-WBS-2** (`wbsImport.ts:769-772`): distribuição cuja Etapa Cód não exista é rejeitada:
  - `Etapa "{cod}" não encontrada — distribuição órfã. Certifique-se de que a aba Etapas contém este código.`
- **VR-WBS-3** (`wbsImport.ts:401-403`): em UPDATE, se o `codigo` não tiver mapeamento para id no banco:
  - `ID não encontrado no BD para código "{cod}"`
- **VR-WBS-4** (`wbsImport.ts:735-738`): em UPDATE de distribuição, se a chave `etapaCod::medicao` não existir:
  - `Distribuição não encontrada no BD para chave "{key}"`
- **VR-WBS-5** (`wbsImport.ts:349-361`): erros do Postgres são traduzidos para PT-BR:
  - `23505` (unique violation) → `Duplicado: "{val}" já existe no campo {col}` ou `Registro duplicado — já existe com esta chave`
  - `23503` (FK violation) → `Referência inválida: {details}`
  - `23502` (NOT NULL) → `Campo obrigatório vazio: {details}`
  - `23514` (CHECK violation) → `Violação de restrição: {details}`
  - `22P02` (invalid type) → `Tipo inválido: {details}`
  - `22001` (string too long) → `Texto excede o tamanho máximo do campo`
- **VR-WBS-6** (`wbsImport.ts:684-717`): se uma Distribuição referencia `Medição = N` que ainda não existe em `medicoes`, o sistema **auto-cria a Medição-pai** com `data_prevista = Data Fim` (ou `today` se vazio), `valor_planejado=0`, `status='futura'`.

#### 1.A.5 Transformações (WBS)

- **Datas** (`toDateISO` — [wbsImport.ts:62-88](src/lib/wbsImport.ts#L62-L88)):
  - ISO `YYYY-MM-DD...` → cortado para 10 chars
  - BR `DD/MM/YYYY` → reformatado para `YYYY-MM-DD`
  - Excel serial (número entre 1 e 200000) → epoch 1899-12-30 + N dias
  - Caso contrário → string original (silent fallback)
  - Campos sob esta regra: `data_inicio_plan`, `data_fim_plan`, `data_inicio`, `data_fim` (set em `DATE_FIELDS`)
- **Números** (`parseNumber` — [wbsImport.ts:126-146](src/lib/wbsImport.ts#L126-L146)):
  - remove `R$`, espaços, ` `
  - se tem `,` e `.`: assume `.` como milhar e `,` como decimal (BR) **ou** `,` como milhar e `.` como decimal (US) — decide pelo último que aparece
  - se só tem `,` → vira `.`
  - retorna `0` em caso de NaN
- **`tipo`** (`sanitizeTipo` — [wbsImport.ts:149-155](src/lib/wbsImport.ts#L149-L155)):
  - normaliza UPPER + strip accents + `_` por separador
  - contém `MAO_DE_OBRA` | `SERVICO` | `M_O` → `MAO_DE_OBRA`
  - contém `EQUIPA` | `MAQUINA` → `EQUIPAMENTO`
  - default → `MATERIAL`
- **`status`** (`sanitizeStatus` — [wbsImport.ts:363-370](src/lib/wbsImport.ts#L363-L370)):
  - `concluido`, `concluída`, `concluído`, `finalizado` → `concluido`
  - `em andamento`, `em_andamento`, `ativo`, `ativa`, `iniciado`, `iniciada`, `executando` → `em_andamento`
  - `atrasado`, `atrasada` → `atrasado`
  - default → `futuro`
- **Fuzzy de colunas** (`stripForMatch` + `findCol`): NFD-strip de acentos, remove ` /_-.\t`, lowercase; passes 1) exato → 2) starts-with → 3) includes.
- **Auto-criação** silenciosa:
  - `fornecedores` por `nome` em UPPER ([wbsImport.ts:530-547](src/lib/wbsImport.ts#L530-L547))
  - `medicoes` faltantes ([wbsImport.ts:684-717](src/lib/wbsImport.ts#L684-L717))
- **Recálculo cascata** (`wbsImport.ts:432-456`): quando uma Etapa tem `Casas` alterado, **todos os itens da etapa** têm `qtd_total` e `valor_total_orcado` recalculados como `qtd_por_casa × casas × custo_unitario_orcado`.

#### 1.A.6 FKs e integridade

- `itens_compra.etapa_id` → `etapas.id` — validado por lookup de `etapa.codigo` no preview e no apply
- `itens_compra.fornecedor_id` → `fornecedores.id` — auto-criado se não existir
- `cronograma_distribuicao.etapa_id` → `etapas.id`
- `cronograma_distribuicao.medicao_numero` — não há FK formal verificada no código; medição é auto-criada se ausente
- **Tolerância numérica**: o comparador de mudanças de Etapa usa `String(oldVal) !== String(newVal)`; para números, faz `Number(...) || 0` e ignora se `numNew <= 0` (não considera "esvaziar valor"). Não há tolerância de R$ 0,01 — comparação é estrita.

#### 1.A.7 Exemplo válido (Etapas)

| Código | Nome | Status | Casas | Ordem | Receita CEF | Preço Unitário (Serv) | Qtd/Casa (Serv) | Unidade (Serv) | Data Início Plan | Data Fim Plan | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|
| INFRA | Infraestrutura | futuro | 64 | 1 | 320000 | 5000 | 1 | vb | 2026-01-15 | 2026-06-30 | |

(Linha extraída de `downloadWBSTemplate` em [ImportacaoPage.tsx:1897-1898](src/pages/ImportacaoPage.tsx#L1897-L1898) — confirmado idêntico em `template_wbs_sf_preenchido.xlsx`.)

#### 1.A.8 Exemplo válido (Itens de Compra)

| Etapa Cód | Etapa Nome | Item Cód | Descrição | Tipo | Qtd/Casa | Unidade | Custo Unitário | Fornecedor | Cond. Pagamento |
|---|---|---|---|---|---|---|---|---|---|
| INFRA | Infraestrutura | INFRA-001 | Concreto Usinado FCK 25 | MATERIAL | 2.5 | m³ | 450 | Concreteira ABC | 30/60/90 |

#### 1.A.9 Exemplo válido (Distribuição)

| Etapa Cód | Etapa Nome | Medição | Casas Planejadas | Data Início | Data Fim | Receita a Liberar |
|---|---|---|---|---|---|---|
| INFRA | Infraestrutura | 1 | 16 | 2026-01-15 | 2026-03-15 | 80000 |

---

### 1.B Dados Base (CSV/Excel single-tab)

UI: aba **"Dados Base"** em [ImportacaoPage.tsx:279-412](src/pages/ImportacaoPage.tsx#L279-L412)
Mapeamento de tabelas: `TABLE_MAPPINGS` ([ImportacaoPage.tsx:261-277](src/pages/ImportacaoPage.tsx#L261-L277))

#### 1.B.1 Schema — alvo `etapas`

- **Aba esperada**: a primeira da planilha. Existe auto-detecção de cabeçalho dentro das primeiras 20 linhas (parser procura linhas contendo qualquer das keywords `etapa, item, fornecedor, descricao, descrição, valor, quantidade, casas, codigo, código, data, cond, pagamento, vencimento` — [ImportacaoPage.tsx:68-81](src/pages/ImportacaoPage.tsx#L68-L81)).
- **Linha de cabeçalho**: a primeira linha cujo conteúdo case com a heurística acima; se nada bater, linha 1.
- **Cabeçalhos são normalizados** para snake_case (lowercase + NFD strip accents + `\s+` → `_`) — função `normalizeHeader` ([ImportacaoPage.tsx:28-32](src/pages/ImportacaoPage.tsx#L28-L32)).

| Coluna (snake_case) | Tipo | Obrigatório | Default | Notas |
|---|---|---|---|---|
| `codigo` | text | **sim** | — | required ([ImportacaoPage.tsx:265](src/pages/ImportacaoPage.tsx#L265)) |
| `nome` | text | **sim** | — | required |
| `ordem` | int | não | `i+1` (índice da linha) | `parseInt` cru |
| `data_inicio_plan` | date | não | `null` | string passada como veio (não há `toDateISO`!) |
| `data_fim_plan` | date | não | `null` | idem |
| `casas_total` | int | não | `0` | |
| `valor_total_orcado` | number | não | `0` | aceita vírgula como decimal (`.replace(',', '.')`) |
| `status` | text | não | `'futuro'` | **sem sanitização** — aceita qualquer string |
| `observacoes` | text | não | `null` | |

#### 1.B.2 Schema — alvo `itens_compra`

| Coluna (snake_case) | Tipo | Obrigatório | Default | Notas |
|---|---|---|---|---|
| `codigo` | text | **sim** | — | |
| `descricao` | text | **sim** | — | |
| `tipo` | text | **sim** | — | UPPER apenas; default `'MATERIAL'` se vazio |
| `etapa_codigo` | text | **sim** | — | resolvido contra `etapas.codigo` por `eq` exato; **se não achar, linha rejeitada com `etapa "{cod}" não encontrada`** ([ImportacaoPage.tsx:328-329](src/pages/ImportacaoPage.tsx#L328-L329)) |
| `categoria` | text | não | `null` | |
| `unidade` | text | não | `null` | |
| `qtd_por_casa` | number | não | `null` | |
| `qtd_total` | number | não | `null` | |
| `custo_unitario_orcado` | number | não | `0` | |
| `valor_total_orcado` | number | não | `0` | |
| `fornecedor_nome` | text | não | — | resolvido por `ilike` em `fornecedores.nome`; se não achar, `fornecedor_id` fica `null` (**não cria** — diferente do WBS!) |
| `cond_pagamento` | text | não | `null` | |

#### 1.B.3 Schema — alvo `fornecedores`

| Coluna (snake_case) | Tipo | Obrigatório | Default | Notas |
|---|---|---|---|---|
| `nome` | text | **sim** | — | |
| `cnpj` | text | não | `null` | sem validação de formato |
| `contato` | text | não | `null` | |
| `cond_pagamento_padrao` | text | não | `null` | |
| `observacoes` | text | não | `null` | |

#### 1.B.4 Validações (Dados Base)

- **VR-DB-1** (`ImportacaoPage.tsx:306-307`): linha sem campos obrigatórios → erro literal `Linha {N}: campos faltando: {csv}`
- **VR-DB-2** (`ImportacaoPage.tsx:328-329`): item com `etapa_codigo` inexistente → `Linha {N}: etapa "{cod}" não encontrada`
- **VR-DB-3**: erros do Postgres formatados por `formatError` ([ImportacaoPage.tsx:180-202](src/pages/ImportacaoPage.tsx#L180-L202)) com mesmas mensagens da §1.A.4 (códigos `23505`/`23503`/`23502`/`23514`/`22P02`/`22001`).

#### 1.B.5 Transformações (Dados Base)

- **Números**: `parseFloat(str.replace(',', '.'))` — apenas vírgula→ponto, **não trata milhar BR** nem `R$`. Diferente do WBS.
- **Datas**: passadas cruas — não há `toDateISO` aqui. Se a planilha veio com Excel serial number, vai falhar no INSERT com `22P02`.
- **`tipo`** (em itens_compra): só faz UPPER, sem sinônimos (não usa `sanitizeTipo`).
- **CSV**: separador auto-detectado entre `\t`, `;`, `,` por contagem na primeira linha ([ImportacaoPage.tsx:99-115](src/pages/ImportacaoPage.tsx#L99-L115)).

#### 1.B.6 Exemplo válido (etapas)

| codigo | nome | ordem | data_inicio_plan | data_fim_plan | casas_total | valor_total_orcado | status | observacoes |
|---|---|---|---|---|---|---|---|---|
| EX-01 | Exemplo | 1 | 2026-01-01 | 2026-01-01 | 0 | 0 | futuro | |

(Confirmado em `template_etapas2.xlsx`, aba `Template`, linhas 1-2.)

---

### 1.C Distribuição Standalone

UI: aba **"Distribuição Cronograma"** em [ImportacaoPage.tsx:1100-1255](src/pages/ImportacaoPage.tsx#L1100-L1255)

#### 1.C.1 Schema

- **Aba esperada**: primeira da planilha
- **Linha de cabeçalho**: 1 (auto-detect via mesma heurística de §1.B)
- `DIST_HEADERS` declarado: `['etapa_codigo', 'medicao_numero', 'data', 'casas']` ([ImportacaoPage.tsx:1098](src/pages/ImportacaoPage.tsx#L1098))

| Coluna (snake_case) | Tipo | Obrigatório | Default | Notas |
|---|---|---|---|---|
| `etapa_codigo` | text | **sim** | — | resolvido por `eq` em `etapas.codigo` |
| `medicao_numero` | int | não | auto-incrementado por etapa ([ImportacaoPage.tsx:1146-1150](src/pages/ImportacaoPage.tsx#L1146-L1150)) | |
| `data` | date | **sim** | — | erro literal `Linha {N}: data vazia` se vazia ([ImportacaoPage.tsx:1144](src/pages/ImportacaoPage.tsx#L1144)) |
| `casas` | int | não | `0` | grava em `casas_planejadas` |

> **Divergência template ↔ código**: o arquivo `template_distribuicao2.xlsx` tem **3 colunas** (`etapa_codigo, data, casas`), mas o `DIST_HEADERS` declara 4. O código está blindado: se `medicao_numero` faltar, é auto-incrementado.

#### 1.C.2 Validações

- **VR-DC-1**: `etapa_codigo` ausente em `etapas` → `Linha {N}: etapa "{cod}" não encontrada`
- **VR-DC-2**: `data` vazia → `Linha {N}: data vazia`

#### 1.C.3 Exemplo válido

| etapa_codigo | data | casas |
|---|---|---|
| 7 | 2026-03-16 | 16 |

---

## 2. Pedidos

UI: aba **"Pedidos"** em [ImportacaoPage.tsx:481-689](src/pages/ImportacaoPage.tsx#L481-L689)
Cabeçalhos canônicos: `PEDIDOS_HEADERS` ([ImportacaoPage.tsx:417](src/pages/ImportacaoPage.tsx#L417))

### 2.1 Schema

O parser aceita **dois formatos** simultaneamente, decidindo pelo header detectado ([ImportacaoPage.tsx:451-453](src/pages/ImportacaoPage.tsx#L451-L453)):
- **Formato A (template oficial / snake_case)** — `template_pedidos4.xlsx`
- **Formato B (planilha real PT-BR)** — quando o header contém `etapa`, `item` ou `fornecedor`

- **Aba esperada**: a primeira (parser tenta priorizar abas cujo nome contenha "pedido" — [ImportacaoPage.tsx:135-137](src/pages/ImportacaoPage.tsx#L135-L137))
- **Linha de cabeçalho**: 1 (com auto-detect de header dentro das 20 primeiras linhas via keywords — §1.B)

#### 2.1.A Formato snake_case (template)

| Coluna | Tipo | Obrigatório | Default | Notas |
|---|---|---|---|---|
| `item_codigo` | text | sim para vincular | — | resolvido contra `itens_compra.codigo`; se não casar, fallback por descrição+etapa+fuzzy ([ImportacaoPage.tsx:498-523](src/pages/ImportacaoPage.tsx#L498-L523)) |
| `numero_pedido` | int | não | `null` | |
| `casas_lote` | int | não | `0` | |
| `fornecedor_nome` | text | não | — | resolvido por `ilike` em `fornecedores.nome`; **cria automaticamente** se não existir ([ImportacaoPage.tsx:553-558](src/pages/ImportacaoPage.tsx#L553-L558)) |
| `cond_pagamento` | text | não | `cond_pagamento_padrao` do fornecedor ou `'à vista'` | |
| `data_entrega_prevista` | date | não | `etapa.data_inicio_plan` ou `today+30` ([ImportacaoPage.tsx:563-567](src/pages/ImportacaoPage.tsx#L563-L567)) | |
| `valor_unitario_real` | number | não | `item.custo_unitario_orcado` ([ImportacaoPage.tsx:526](src/pages/ImportacaoPage.tsx#L526)) | |

> Observação: o `template_pedidos4.xlsx` tem **6 colunas** (sem `valor_unitario_real`), mas `PEDIDOS_HEADERS` lista 7. O código tolera ausência (cai no default `item.custo_unitario_orcado`).

#### 2.1.B Formato real PT-BR (planilha do cliente)

Mapeado por `findPedCol` ([ImportacaoPage.tsx:419-432](src/pages/ImportacaoPage.tsx#L419-L432)) para os mesmos campos snake_case:

| Coluna PT-BR (literal aceita) | Mapeada para |
|---|---|
| `ETAPA` ou `etapa` | `_etapa_nome` (auxiliar para match de item) |
| `ITEM` ou `item` ou `descricao` | `_item_descricao` (auxiliar para match de item) |
| `Código` ou `codigo` ou `item_codigo` ou `item_cod` | `item_codigo` |
| `FORNECEDOR` ou `fornecedor_nome` | `fornecedor_nome` |
| `COND PAGTO` ou `COND. PAGTO` ou `cond_pagamento` ou `Cond Pagamento` | `cond_pagamento` |
| `QUANTIDADE DE CASAS` ou `casas_lote` ou `casas` | `casas_lote` |
| `valor_unit._1` ou ` VALOR UNIT. ` ou `valor_unitario_real` ou `VALOR UNIT.` | `valor_unitario_real` |
| `valor_total_1` ou `VALOR TOTAL_1` ou `VALOR TOTAL` | `valor_total_override` (precedência sobre `casas × qtd × unit`) |
| `quant._2` ou `QUANT._2` | `_qtd_entrega` |
| `DATA DA ENTREGA` ou `data_da_entrega` ou `data_entrega_prevista` ou `DATA ENTREGA` | `data_entrega_prevista` |

> O matching de `findPedCol` é case-insensitive **e** ignora `_`, espaços e pontos antes de comparar (substring).

### 2.2 Validações backend

- **VR-PED-1** (`ImportacaoPage.tsx:544`): linha cujo item não foi encontrado → erro literal `Linha {N}: Item "{descricao_ou_codigo}" não encontrado`. **A linha é descartada**, não interrompe o lote.
- **VR-PED-2**: erros do Postgres formatados por `formatError` (§1.A.4).
- **CHECK constraint** ([20260425130000_consolidate_pedido_status.sql](supabase/migrations/20260425130000_consolidate_pedido_status.sql)): `pedidos.status IN ('planejado','pedido_enviado','entregue','parcialmente_pago','pago','cancelado')`. O importador sempre grava `'planejado'` ([ImportacaoPage.tsx:578](src/pages/ImportacaoPage.tsx#L578)).
- **Cascata Σparcelas = valor_total**: NÃO é validada na entrada — é **garantida na geração** por `gerarParcelas` ([src/lib/parcelas.ts:127-164](src/lib/parcelas.ts#L127-L164)), onde a última parcela absorve o resíduo de centavos.

### 2.3 Transformações

- **`parseNumberCell`** ([ImportacaoPage.tsx:40-59](src/pages/ImportacaoPage.tsx#L40-L59)): mesma lógica do `parseNumber` do WBS (BR/US auto, `R$`, ` `).
- **`parsePedDate`** ([ImportacaoPage.tsx:441-449](src/pages/ImportacaoPage.tsx#L441-L449)):
  - Excel serial entre 40000 e 60000 → epoch 1899-12-30 + N
  - `DD/MM/YYYY` ou `DD-MM-YYYY` ou `DD.MM.YYYY` → `YYYY-MM-DD`
  - já ISO → cortado para 10 chars
  - caso contrário → string crua
- **Valor total**: `valor_total_override` (planilha) > `casas × qtd_por_casa × unitario` (calculado) — [ImportacaoPage.tsx:527-529](src/pages/ImportacaoPage.tsx#L527-L529).
- **Quantidade do lote**: prioriza `_qtd_entrega` da planilha; senão `casas × qtd_por_casa` — [ImportacaoPage.tsx:570-571](src/pages/ImportacaoPage.tsx#L570-L571).
- **Auto-criação**: fornecedor é criado quando `fornecedor_nome` não casa por `ilike` ([ImportacaoPage.tsx:553-558](src/pages/ImportacaoPage.tsx#L553-L558)).

### 2.4 FKs e cascatas

- `pedidos.item_compra_id` → `itens_compra.id` — validado por lookup
- `pedidos.fornecedor_id` → `fornecedores.id` — auto-criado se faltar
- **Geração de parcelas**: para cada pedido com `valor_total > 0` e `cond_pagamento`, dispara `gerarParcelas` ([ImportacaoPage.tsx:582-589](src/pages/ImportacaoPage.tsx#L582-L589)). Erros na geração de parcelas não derrubam o pedido (warn console).
- **Trigger DB** ([20260425130000_consolidate_pedido_status.sql](supabase/migrations/20260425130000_consolidate_pedido_status.sql)): `consolidate_pedido_status` consolida `pedidos.status` em função do total pago em parcelas. Tolerância contábil: **R$ 0,01** (`v_pago >= v_total - 0.01` → `pago`).

### 2.5 Exemplo válido (formato snake_case)

| item_codigo | numero_pedido | casas_lote | fornecedor_nome | cond_pagamento | data_entrega_prevista | valor_unitario_real |
|---|---|---|---|---|---|---|
| EX-01 | 1 | 16 | Fornecedor ABC | 30/60 | 2026-05-01 | |

(Confirmado em `template_pedidos4.xlsx`. Quando `valor_unitario_real` está vazio, o sistema usa `itens_compra.custo_unitario_orcado`.)

### 2.6 Exemplo válido (formato real PT-BR)

| ETAPA | ITEM | Código | FORNECEDOR | COND PAGTO | QUANTIDADE DE CASAS | VALOR UNIT. | DATA DA ENTREGA |
|---|---|---|---|---|---|---|---|
| Infraestrutura | Concreto Usinado FCK 25 | INFRA-001 | Concreteira ABC | 30/60/90 | 16 | 450.00 | 15/06/2026 |

---

## 3. Parcelas

### 3.1 Schema do template

**Não existe template de importação direta de parcelas no código.** O arquivo `PAGAMENTOS_2_parcelas_2026-04-14.xlsx` (com aba `Parcelas` e colunas `#, Fornecedor, Valor, Pago, Saldo, Vencimento, Status`) é um **export**, não um import — não há parser que o consuma.

Parcelas são **sempre derivadas** de:
- Pedidos importados (Tab "Pedidos") — via `gerarParcelas` ([ImportacaoPage.tsx:582-589](src/pages/ImportacaoPage.tsx#L582-L589))
- Custos Indiretos importados (Tab "Custos Indiretos") — via `gerarParcelas` ([ImportacaoPage.tsx:797-810](src/pages/ImportacaoPage.tsx#L797-L810))
- BD Realizado — uma única parcela com `status='paga'` por linha ([ImportacaoPage.tsx:2375-2379, 2405-2408](src/pages/ImportacaoPage.tsx#L2375))
- UI manual em `PagamentosPage` (não documentada aqui)

### 3.2 Parser de condição de pagamento (`parsearCondicao`)

Em [src/lib/parcelas.ts:30-61](src/lib/parcelas.ts#L30-L61):

| Entrada (string) | Saída (array de dias após data-base) |
|---|---|
| `30/60` | `[30, 60]` |
| `28/56/84` | `[28, 56, 84]` |
| `0/17` | `[0, 17]` |
| `49` | `[49]` |
| `à vista`, `a vista`, `avista`, `av` | `[0]` |
| `''`, `null`, `undefined` | `[0]` |
| `30,60` ou `30;60` ou `30 60` | `[30, 60]` (split por `[/,;\s]+`) |

Negativos são clampados em 0. Tokens não-numéricos viram 0.

### 3.3 Geração (`gerarParcelas`)

Em [src/lib/parcelas.ts:127-164](src/lib/parcelas.ts#L127-L164). Regras:

- `valorTotal <= 0` → retorna `[]`.
- Divide em N parcelas de `floor(valor_total*100/N)/100`; **a última absorve o resíduo de centavos** para que `Σ parcelas == valor_total` exato.
- Cada `data_vencimento` = `dataBase + diasDaCondicao[i]`, ajustada por `ajustarDiaUtil` ([parcelas.ts:74-87](src/lib/parcelas.ts#L74-L87)):
  - Sábado → Sexta (-1 dia)
  - Domingo → Segunda (+1 dia)
  - **Nenhuma outra regra de feriado é aplicada.**
- Formato gravado: `YYYY-MM-DD` em LOCAL TIME (`formatISODate` — [parcelas.ts:171-176](src/lib/parcelas.ts#L171-L176)) — evita o bug de UTC shift.

### 3.4 Validações DB relevantes (parcelas)

Da migração [20260425100000_add_tipo_to_parcelas.sql](supabase/migrations/20260425100000_add_tipo_to_parcelas.sql):
- `parcelas.tipo NOT NULL DEFAULT 'contratual'`
- CHECK: `tipo IN ('contratual', 'adiantamento')`

> Os imports atuais **nunca passam `tipo` explicitamente** — confiam no DEFAULT. Adiantamentos são gerados separadamente fora do fluxo de import.

Outras colunas escritas pelos imports (com base nos `INSERT`s observados):
- `company_id`, `pedido_id` **ou** `despesa_indireta_id`, `numero_parcela`, `valor`, `valor_pago`, `data_vencimento`, `data_pagamento_real`, `status`, `descricao`.
- `status` aceito pelo código: `'futura'`, `'paga'`, `'parcialmente_paga'` (referenciados em [ImportacaoPage.tsx:2287, 2293](src/pages/ImportacaoPage.tsx#L2287)). **Não foi encontrada CHECK constraint de status** nas migrações disponíveis.

### 3.5 FKs

- `parcelas.pedido_id` → `pedidos.id`
- `parcelas.despesa_indireta_id` → `despesas_indiretas.id`
- A tabela `conciliacao_parcelas` exige **exactly_one_origin** (CHECK constraint em [20260424180000_fix_exactly_one_origin_incluir_mutuo_id.sql](supabase/migrations/20260424180000_fix_exactly_one_origin_incluir_mutuo_id.sql)) — apenas um entre `parcela_id`, `mutuo_id`, `mutuo_parcela_id`, `medicao_id` pode estar preenchido.

### 3.6 Exemplo (parcela gerada)

```
Input:  pedido valor_total=21528, cond_pagamento='30/60', data_entrega=2026-04-15
Output: [
  { numero_parcela: 1, valor: 10764.00, data_vencimento: '2026-05-15', status: 'futura' },
  { numero_parcela: 2, valor: 10764.00, data_vencimento: '2026-06-15', status: 'futura' },
]
```

(Caso testado em [parcelas.ts:303-318](src/lib/parcelas.ts#L303-L318); 14/06/2026 é domingo → empurrado para 15/06.)

---

## 4. Fluxo de Caixa

### 4.1 Não há template de import

**Não existe importador dedicado de Fluxo de Caixa no código.** O Fluxo de Caixa é **derivado em tempo real** pelo hook `useCashFlowEvents` em [src/hooks/useCashFlowEvents.ts](src/hooks/useCashFlowEvents.ts), que consome:

- `parcelas` (via `useParcelas`) — origem principal das saídas (pedidos + custos indiretos)
- `medicoes` (via `useMedicoes`) — entradas previstas de receita CEF
- `cronograma_distribuicao` (via `useDistribuicao`) — datas de liberação de receita
- `mutuos` (via `useMutuos`) — entradas de empréstimo
- `movimentacoes_bancarias` (via `useMovimentacoes`) — realizado bancário
- `pedidos`, `etapas`, `itens_compra` — contexto descritivo
- `contas_bancarias` — saldos iniciais (somados; fallback para `companies.saldo_inicial_caixa`)

Fonte: imports e queries em [useCashFlowEvents.ts:7-16, 81-105](src/hooks/useCashFlowEvents.ts#L7-L16).

### 4.2 Parâmetros do Fluxo

- `companies.saldo_inicial_caixa` (legado) — fallback quando não há contas bancárias.
- `companies.prazo_recebimento_dias` (default 30) — usado em [useCashFlowEvents.ts:114](src/hooks/useCashFlowEvents.ts#L114) para deslocar a data de cada medição.
- A configuração é feita em [src/pages/Configuracoes.tsx:215](src/pages/Configuracoes.tsx#L215) via UI — sem import.

### 4.3 Validações / FKs

Não aplicável — não há gravação a partir de planilha.

### 4.4 Exemplo

Não aplicável.

---

## 5. Realizado (BD Construtora)

UI: aba **"Pagamentos Realizados"** em [ImportacaoPage.tsx:2038-2633](src/pages/ImportacaoPage.tsx#L2038-L2633)
Parser: `parseBdRealizado` em [src/lib/bdRealizadoImport.ts:196-333](src/lib/bdRealizadoImport.ts#L196-L333)

### 5.1 Schema

- **Aba esperada**: o parser **prefere** abas cujo nome (lowercase) contenha `bd_realiz`, `bd realiz` ou `realizado`. Se nenhuma casar, usa a **primeira aba** ([bdRealizadoImport.ts:165-170](src/lib/bdRealizadoImport.ts#L165-L170)).
  - Confirmado: o arquivo `20-04 BD REALIZADO - CONSTRUTORA.xlsx` tem aba `BD REALIZADO`.
- **Linha de cabeçalho**: **detectada automaticamente** dentro das 20 primeiras linhas. O parser conta hits das keywords `['data', 'fornecedor', 'valor', 'categoria', 'tipo', 'conta', 'pagto', 'emissao', 'emissão']`; a primeira linha com **≥3 hits** vira o header ([bdRealizadoImport.ts:175-184](src/lib/bdRealizadoImport.ts#L175-L184)).

#### 5.1.1 Colunas detectadas (preferências por nome — fuzzy substring)

A função `findColumn` ([bdRealizadoImport.ts:149-156](src/lib/bdRealizadoImport.ts#L149-L156)) compara via `norm()` (UPPER + strip accents) e aceita **substring em qualquer direção**.

| Variável interna | Candidatos buscados | Fallback hard-coded | Tipo | Notas |
|---|---|---|---|---|
| `colTipo` | `Tipo` | `Tipo` | text | classificação fina (ignorada na decisão final) |
| `colCat` | `Categoria` | `Categoria` | text | usada para detectar mútuo (ver §5.2) |
| `colDepto` | `Departamento` | `Departamento` | text | usado para resolver `etapa` no apply |
| `colPago` | `Pago ou Recebido`, `Pago`, `Recebido` | `Pago ou Recebido` | number signed | **decide o caminho de import via sinal** |
| `colValorConta` | `Valor da Conta` | `Valor da Conta` | number | informativo |
| `colAPagar` | `A Pagar ou Receber` | `A Pagar ou Receber` | number | informativo |
| `colData` | `Data de Pagto`, `Data de Crédito`, `Data Pagto` | `Data de Pagto ou Recbto (completa)` | date | data principal |
| `colDataEmissao` | `Data de Emissão`, `Emissão` | `Data de Emissão (completa)` | date | fallback se `colData` vazia |
| `colFornecedor` | `Cliente ou Fornecedor`, `Fornecedor`, `Nome Fantasia` | `Cliente ou Fornecedor (Nome Fantasia)` | text | match com `fornecedores.nome` por `ilike`; auto-cria |
| `colConta` | `Conta Corrente` | `Conta Corrente` | text | resolve `contas_bancarias` (cria fallback "Conta Principal" se nada casar) |
| `colItem` | `ITEM` | `ITEM` | text | descrição de item (usado p/ Item Flex) |
| `colMedicao` | `MEDIÇÃO`, `MEDICAO` | `MEDIÇÃO` | text | informativo (vai para `observacoes`) |
| `colObs` | `Observação`, `Observacao` | `Observação da Conta` | text | concatenado em `observacoes` |
| `colOrigem` | `Origem` | `Origem` | text | concatenado em `observacoes` |
| `colNF` | `NF/CF`, `NF` | `NF/CF` | text | concatenado em `observacoes` |
| `colContaPai` | `Conta Pai` | `Conta Pai` | text | gravado em `movimentacoes_bancarias.observacao` (se ≠ `'N/D'`) |

> Como o matching usa substring bidirecional, **qualquer header que contenha a palavra-chave** é reconhecido. Isto torna o parser tolerante mas também sensível a colunas-fantasma com nome similar.

### 5.2 Validações backend

#### 5.2.1 Classificação por SINAL (linha a linha)

Em [bdRealizadoImport.ts:264-310](src/lib/bdRealizadoImport.ts#L264-L310). Categoriza em 4 caminhos (`importPath`):

| Condição | `importPath` | Label | Ação no apply |
|---|---|---|---|
| `\|pago\| < 0.01` | `skip` | `⏭️ Valor zero` | nada |
| `pago > 0` e `categoria ∈ {'EMPRESTIMOS BANCARIOS', 'ENTRADA DE TRANSFERENCIA'}` (após `norm()`) | `mutuo` | `🤝 Cadastrar Mútuo` | INSERT em `mutuos` |
| Idem, mas duplica mútuo existente (`\|valor_captado − abs\| < 1` e `data_captacao == data`) | `skip` | `⏭️ Mútuo duplicado` | nada |
| `pago > 0` (qualquer outra categoria) | `credito` | `💳 Crédito · {cat}` | apenas conta no relatório (não cria registro adicional além da `movimentacoes_bancarias`) |
| `pago < 0` | `despesa` | `📋 Despesa · {depto/cat}` | tenta casar parcela existente; senão cria pedido fantasma OU `despesas_indiretas` |

> O conjunto **CATS_FINANCEIRO_SAIDA** está comentado no código ([bdRealizadoImport.ts:138-145](src/lib/bdRealizadoImport.ts#L138-L145)) — **todas as saídas** vão hoje para o caminho `despesa`, mesmo movimentações financeiras puras.

#### 5.2.2 Validações no apply (UI)

- **VR-BD-1** ([ImportacaoPage.tsx:2234-2237](src/pages/ImportacaoPage.tsx#L2234-L2237)): linha sem `data_pagamento` E sem `data_emissao` → erro literal `#{seq} [Ignorado]: Sem data válida (pagamento/emissão).`
- **VR-BD-2** ([ImportacaoPage.tsx:2257-2261](src/pages/ImportacaoPage.tsx#L2257-L2261)): falha ao inserir `movimentacoes_bancarias` → `#{seq} [Mov]: {pgErr.message}`
- **VR-BD-3** ([ImportacaoPage.tsx:2363-2365](src/pages/ImportacaoPage.tsx#L2363-L2365)): falha ao criar pedido fantasma → `#{seq} [Pedido]: {pgErr.message}`
- **Match de parcela existente** ([ImportacaoPage.tsx:2181-2221](src/pages/ImportacaoPage.tsx#L2181-L2221)) — quando `importPath='despesa'` e `pago<0`, o sistema tenta achar parcela aberta usando score blend:
  - Janela de data: ±120 dias do `data_pagamento`
  - Tolerância valor exato: `±max(valor*0.01, 0.5)` (1%, mínimo R$ 0,50)
  - Match parcial: aceita se `saldo + 0.01 >= valor`
  - Fornecedor: comparado por tokens normalizados (UPPER+NFD, removendo `LTDA, ME, EPP, S.A., SA, CIA, SOLUCOES, INDUSTRIAIS, ...`) — função `fornCompatvel` ([ImportacaoPage.tsx:2150-2168](src/pages/ImportacaoPage.tsx#L2150-L2168))
  - Score: exato=0, parcial=+500, fornecedor incompatível=+2000, +distância% valor (0-100), +diasDiff*2
  - Aceita só se o melhor for fornecedor-compatível **OU** match exato

### 5.3 Transformações

- **Datas** (`parseDate` — [bdRealizadoImport.ts:67-97](src/lib/bdRealizadoImport.ts#L67-L97)):
  - `Date` instance → ISO
  - 5 dígitos puros → Excel serial `(N - 25569) * 86400 * 1000`
  - ISO `YYYY[/.-]MM[/.-]DD` (com correção de typo `202` → `2024`)
  - BR `DD[/.-]MM[/.-]YYYY` (com correção de typo `202` → `2024`)
  - fallback: primeiros 10 chars
- **Números** (`parseNumber` — [bdRealizadoImport.ts:106-128](src/lib/bdRealizadoImport.ts#L106-L128)):
  - parênteses `(R$ 1.320,00)` → **negativo** (notação contábil)
  - `-` prefixo → negativo
  - remove `R$`, espaços, ` `, `()`
  - BR/US auto (mesma lógica do WBS)
- **Normalização de nome** (`norm` — [bdRealizadoImport.ts:63-65](src/lib/bdRealizadoImport.ts#L63-L65)): trim + UPPER + strip accents.

### 5.4 FKs e cascatas

Para cada linha não-skip, o apply pode tocar (em `[ImportacaoPage.tsx:2243-2455]`):

1. `movimentacoes_bancarias` (sempre — origem `'bd_realizado'`)
2. `fornecedores` (auto-create por `nome` se não existir)
3. `etapas` lookup por `ilike '%departamento%'` (apenas leitura)
4. `itens_compra` (auto-create de `Item Flex` com codigo `FLEX` ou item `IMP`)
5. `pedidos` (cria pedido fantasma com `valor_total_real=0`, status `'entregue'`, observação literal `'Pedido Ancoragem de Pagamento (Criado auto - BD Realizado)'`)
6. `parcelas` (1 parcela com `numero_parcela=999`, `status='paga'`, `descricao='Parcela BD Realizado'`)
7. `despesas_indiretas` (caminho alternativo quando não acha etapa)
8. `mutuos` (caminho mutuo)
9. `conciliacoes` + `conciliacao_parcelas` (vincula movimentação à parcela criada/casada — `match_type='exact'`, `confidence=100`)

Todos os IDs ficam rastreados em `tracked_ids` no `audit_logs.dados_depois` para permitir **rollback pontual** ([ImportacaoPage.tsx:1416-1514](src/pages/ImportacaoPage.tsx#L1416-L1514)).

### 5.5 Exemplo válido (uma linha)

| Data de Pagto ou Recbto (completa) | Cliente ou Fornecedor (Nome Fantasia) | Tipo | Categoria | Departamento | ITEM | Valor da Conta | Pago ou Recebido | A Pagar ou Receber | Conta Corrente | Origem | NF/CF | Conta Pai | Observação da Conta | MEDIÇÃO | Data de Emissão (completa) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-04-15 | Concreteira ABC | Despesa | Materiais | INFRA | Concreto | -1320.00 | -1320.00 | 0 | Itaú 0001 | NF | 12345 | N/D | Concreto bloco A | 1 | 2026-04-10 |

(Resultado esperado: classificada como `despesa`. Se houver parcela aberta de R$ 1.320 da Concreteira ABC ±120 dias, é casada e marcada `paga`/`parcialmente_paga`. Senão, vira pedido fantasma + parcela paga 999 ancorada em `Item Flex` da etapa `Infraestrutura`.)

---

## 6. Diferenças entre import e UI

| Campo / comportamento | Import | UI |
|---|---|---|
| **Etapas — fuzzy match de colunas** | NÃO no WBS aba "Etapas" (acesso direto `row['Código']`); SIM em "Itens" e parcial em "Distribuição" | n/a |
| **`status`** de etapa | WBS sanitiza para 4 valores; Dados Base passa cru | UI tem `<select>` controlado |
| **Datas** | WBS aceita Excel serial + ISO + BR; Dados Base passa cru (falha em serial); BD Realizado aceita tudo + corrige typo `202`→`2024` | UI usa `<input type="date">` |
| **Auto-criação de fornecedor** | SIM em WBS (Itens), Pedidos, Custos Indiretos, BD Realizado; NÃO em Dados Base (`itens_compra`) | UI sempre exige fornecedor cadastrado |
| **Auto-criação de medição-pai** | SIM em WBS (`Distribuição`); NÃO em Distribuição standalone | UI requer cadastro prévio |
| **Auto-criação de itens FLEX** | SIM em BD Realizado quando "departamento" casa com etapa | n/a |
| **`numero_pedido`** | Aceito no template snake_case; nunca capturado no formato real PT-BR (sempre `null`) — [ImportacaoPage.tsx:469](src/pages/ImportacaoPage.tsx#L469) | UI permite digitar |
| **`tipo` de parcela (`contratual`/`adiantamento`)** | Imports nunca passam — usam DEFAULT `'contratual'` | UI de adiantamento marca explicitamente |
| **Fornecedor `cnpj`** | Apenas Dados Base aceita; demais imports nunca preenchem | UI tem campo |
| **`valor_pago`, `data_pagamento_real`** | Só BD Realizado preenche | UI manual em PagamentosPage |
| **`observacoes` em pedido** | BD Realizado grava texto fixo; outros imports não preenchem | UI permite editar |
| **`item_compra.qtd_total`** | WBS recalcula via cascata `Casas × Qtd/Casa`; Dados Base aceita literal | UI tem ambos |
| **Parcelas**: import direto | NÃO existe — sempre via `gerarParcelas` ou via BD Realizado (parcela única paga) | UI permite criar/editar parcela manualmente |

---

## 7. Pendências detectadas no código

> Pontos onde o estado atual tem suposições, fallbacks silenciosos, divergências template-vs-parser, ou validações ausentes. Todos relevantes para um kit de validação pré-import.

### 7.1 Divergências template ↔ parser

- **template_pedidos4.xlsx tem 6 colunas, `PEDIDOS_HEADERS` lista 7** ([ImportacaoPage.tsx:417](src/pages/ImportacaoPage.tsx#L417)). O `valor_unitario_real` está ausente do template; o parser cai no `item.custo_unitario_orcado` silenciosamente.
- **template_distribuicao2.xlsx tem 3 colunas, `DIST_HEADERS` lista 4** ([ImportacaoPage.tsx:1098](src/pages/ImportacaoPage.tsx#L1098)). Sem `medicao_numero`; parser auto-incrementa.
- **`template_etapas2.xlsx` (Dados Base) NÃO tem `Receita CEF`, `Preço Unitário (Serv)` etc.** — esses campos só existem no template WBS multi-aba. Quem importar pelo Dados Base perde esses dados.

### 7.2 Validações ausentes ou frouxas

- **Datas em "Dados Base"**: passadas cruas para o INSERT — Excel serial number quebra com erro `22P02`. Não há `toDateISO` neste caminho ([ImportacaoPage.tsx:312-314](src/pages/ImportacaoPage.tsx#L312-L314)).
- **`status` em "Dados Base"**: aceita qualquer string sem CHECK (apenas o DB rejeitaria, e a tabela `etapas` pode não ter constraint — não foi encontrada nas migrations disponíveis).
- **`tipo` em "Dados Base / itens_compra"**: só faz UPPER, não usa `sanitizeTipo` — diferente do WBS. Pode resultar em valor inválido para a CHECK do banco, se houver.
- **`numero_pedido`**: nunca capturado no formato real PT-BR ([ImportacaoPage.tsx:469](src/pages/ImportacaoPage.tsx#L469) — `'numero_pedido': ''` hard-coded).
- **`cond_pagamento`**: aceito como string crua em todos os caminhos. **Não há validação de formato** antes do INSERT — só falha quando `gerarParcelas` parseia em um array vazio (que produz `[0]`, ou seja, "à vista").
- **Σ parcelas == valor_total**: nunca é validado como input — sempre é construído por `gerarParcelas` (a última parcela absorve o resíduo). Se alguém criar parcelas manualmente via outro caminho, não há trigger de consistência.
- **CHECK constraint de `parcelas.status`**: não foi encontrada nas migrações disponíveis; o código usa livremente `'futura'`, `'paga'`, `'parcialmente_paga'` — comportamento depende do schema atual no Supabase.

### 7.3 Comportamentos silenciosos (podem mascarar erros)

- `parseNumber` retorna `0` em qualquer entrada inválida — uma planilha com `R$ -` ou `N/D` em campo numérico vira `0` sem warning.
- `findCol` (`stripForMatch`) faz match por `includes` no terceiro pass — colunas com nomes parecidos podem ser pegas pela errada (ex.: `Qtd/Casa` casa com `Qtd Casas`). Particularmente sensível em pedidos do BD Realizado.
- `bdRealizadoImport.parseDate` "corrige" `202-04-30` para `2024-04-30` automaticamente ([bdRealizadoImport.ts:80, 92](src/lib/bdRealizadoImport.ts#L80)) — não há aviso ao usuário.
- Em `WBS apply`, fornecedor é criado em UPPER (`fornecedoresMap`); se a planilha tem casing inconsistente, vai criar duplicatas mesmo assim porque o lookup é por `UPPER(trim(nome))` mas o INSERT usa o `nome` original.
- Comparação de campos no preview do WBS é por `String(a) !== String(b)` — números `'10.00'` vs `10` empatam, mas datas em formatos diferentes não.
- BD Realizado: `import path = 'despesa'` foi forçado para **TODAS** as saídas ([bdRealizadoImport.ts:138-145](src/lib/bdRealizadoImport.ts#L138-L145)). O conjunto `CATS_FINANCEIRO_SAIDA` (que filtraria empréstimos pagos, distribuição de lucros etc.) está comentado. Comentário no código: `"agora importadas como despesa para depois serem deletadas se necessário"`.

### 7.4 Schema não rastreado

- A migração `20260414143000_fix_parcelas.sql` (200KB) é puro DML (DELETE/INSERT). **Nenhuma migração no diretório cria as tabelas-base** (`etapas`, `itens_compra`, `pedidos`, `parcelas`, `medicoes`, `cronograma_distribuicao`, `despesas_indiretas`, `fornecedores`, `mutuos`, `companies`, `audit_logs`, `movimentacoes_bancarias`, `conciliacoes`). Isto significa que:
  - As CHECK / NOT NULL / FK constraints de origem **não estão neste repositório**.
  - O kit de validação pré-import não pode confiar 100% em "o banco vai bloquear se eu enviar lixo" — pode ou não bloquear, dependendo de como o schema foi setado no Supabase Dashboard.
  - As colunas `valor_saldo` (mencionada como GENERATED ALWAYS em [wbsImport.ts:604, 650](src/lib/wbsImport.ts#L604)) e similares não podem ser confirmadas via migration.

### 7.5 Outros pontos a registrar

- A função `parseComposicaoMedicoes` em [src/lib/composicaoParser.ts](src/lib/composicaoParser.ts) parseia a planilha CEF (`composicao medicoes atual SF.xlsx`) com layout fixo (linhas 4-5 de datas/valores; serviços a partir da linha 8; colunas hardcoded em `MED_COL_MAP`). Não há UI ativa que invoque `importComposicaoToEtapas` na página de importação atual — função existe mas não foi encontrada chamada do React.
- `casas_total` default = `64` está hardcoded em vários pontos ([wbsImport.ts:206, 266, 464, 594, 628](src/lib/wbsImport.ts#L206); [composicaoParser.ts:71, 98](src/lib/composicaoParser.ts#L71)). É uma suposição do projeto Fleury, não um valor configurável.

---

## Apêndice A — Arquivos consultados

### Código (lido integralmente ou em chunks)
- [src/lib/wbsImport.ts](src/lib/wbsImport.ts) — 825 linhas, parser+apply do WBS
- [src/lib/parcelas.ts](src/lib/parcelas.ts) — 376 linhas, gerador de parcelas
- [src/lib/bdRealizadoImport.ts](src/lib/bdRealizadoImport.ts) — 333 linhas, parser do BD Realizado
- [src/lib/composicaoParser.ts](src/lib/composicaoParser.ts) — 280 linhas, parser CEF (sem UI ativa)
- [src/pages/ImportacaoPage.tsx](src/pages/ImportacaoPage.tsx) — 2639 linhas, UI completa
- [src/hooks/useCashFlowEvents.ts](src/hooks/useCashFlowEvents.ts) — fluxo derivado (parcial)
- [src/components/cronograma/ImportPreviewModal.tsx](src/components/cronograma/ImportPreviewModal.tsx) — referenciado mas não lido (modal de confirmação do WBS)

### Migrações inspecionadas
- [supabase/migrations/20260414143000_fix_parcelas.sql](supabase/migrations/20260414143000_fix_parcelas.sql) (1946 linhas, só DML)
- [supabase/migrations/20260423120000_conciliacao_mutuo_captacao.sql](supabase/migrations/20260423120000_conciliacao_mutuo_captacao.sql)
- [supabase/migrations/20260423235000_add_cond_pagamento_despesas_indiretas.sql](supabase/migrations/20260423235000_add_cond_pagamento_despesas_indiretas.sql)
- [supabase/migrations/20260424180000_fix_exactly_one_origin_incluir_mutuo_id.sql](supabase/migrations/20260424180000_fix_exactly_one_origin_incluir_mutuo_id.sql)
- [supabase/migrations/20260425100000_add_tipo_to_parcelas.sql](supabase/migrations/20260425100000_add_tipo_to_parcelas.sql)
- [supabase/migrations/20260425130000_consolidate_pedido_status.sql](supabase/migrations/20260425130000_consolidate_pedido_status.sql)
- (outras 17 migrações listadas, sem `CREATE TABLE` ou `REFERENCES` relevantes para os 5 entities)

### Arquivos .xlsx versionados na raiz inspecionados (extração de sheets + headers)
- `template_etapas2.xlsx` — aba `Template`, 9 colunas snake_case
- `template_pedidos4.xlsx` — aba `Template`, 6 colunas snake_case (sem `valor_unitario_real`)
- `template_distribuicao2.xlsx` — aba `Template`, 3 colunas (sem `medicao_numero`)
- `template_wbs_sf_preenchido.xlsx` — abas `Etapas`, `Itens de Compra`, `Distribuição` (12 / N / 7 colunas)
- `20-04 BD REALIZADO - CONSTRUTORA.xlsx` — aba `BD REALIZADO` (header parsing falhou via regex simples, mas o parser real do app detecta header dinamicamente)
- `PAGAMENTOS_2_parcelas_2026-04-14.xlsx` — aba `Parcelas` — **export, não import**
- `template_pedidos2_v3.xlsx`, `TEMPLATE_PEDIDOS_PREENCHIDO_3.xlsx` — extração de strings inconclusiva (provavelmente shared-string formato), não bateram com PEDIDOS_HEADERS via inspeção bruta; **recomenda-se abrir manualmente para confirmar**

### Outros artefatos
- `LANDING_BRIEFING_POSICIONAMENTO.md` — está aberto no IDE, não foi lido (não é parte da especificação dos imports).
