# 04 — Receitas e FAQ (Build Fleury)

> Playbook prático: como o assistente deve responder os pedidos mais frequentes.

## Receita 1 — "Validar planilha antes de subir"

**Pergunta típica**: "Olha esse arquivo aqui, vai dar problema?" (com headers ou amostra colada).

**Procedimento**:

1. Identifique a entidade-alvo cruzando com o mapa de `01_TEMPLATES_CANONICOS.md`. Se o usuário não disse, infira pelos headers (presença de `ETAPA`+`ITEM`+`FORNECEDOR` → Pedidos; `BD REALIZADO`/`Pago ou Recebido` → Realizado; etc.). Se ambíguo, **pergunte**.
2. Para cada coluna fornecida, marque `✅ ok / ⚠️ alias aceito / ❌ não reconhecido / 🚨 bloqueador`.
3. Se houver bloqueador, dê a correção mínima (renomear coluna, adicionar aba, converter formato).
4. Se for só warning, explique o que vai acontecer (será `null`, vira `0`, é ignorado, etc.).
5. Termine com **uma frase** sobre se está liberado ou não.

**Não faça**: não baixe nem peça o arquivo inteiro. Não invente colunas. Não simule a importação se não tem o conteúdo real.

---

## Receita 2 — "Por que esse erro de import?"

**Pergunta típica**: cola um toast / log de erro do app.

**Procedimento**:

1. Identifique a mensagem em `01_TEMPLATES_CANONICOS.md` ou `03_SNIPPETS_CRITICOS.md` §K (erros Postgres).
2. Códigos comuns:
   - `23505` → duplicidade. Pergunte qual campo (a mensagem traz).
   - `23503` → FK quebrada. Algum lookup falhou (etapa, fornecedor, item).
   - `23502` → coluna NOT NULL ficou null. Verifique se o parser conseguiu extrair o valor.
   - `23514` → CHECK violada. Provável `tipo` ou `status` inválido — peça o texto literal do erro.
   - `22P02` → tipo errado. Quase sempre é data crua (Excel serial em campo date).
3. Linhas tipo `Linha {N}: ...`: aponte a linha exata na planilha original e o motivo.
4. `Etapa "{X}" não encontrada` → o `etapa_codigo`/`Etapa Cód` não bate com o `etapas.codigo` do banco. Peça pra ele baixar `template_etapas2.xlsx` ou olhar a aba "Cronograma" para ver os códigos válidos.

---

## Receita 3 — "Parcelas saíram erradas"

**Pergunta típica**: "Pedido X tem 3 parcelas mas eu queria 4" / "datas vieram em sábado".

**Procedimento**:

1. `parsearCondicao` decide o número e os dias (§A em `03_SNIPPETS_CRITICOS.md`).
2. Confirme o `cond_pagamento` gravado no pedido — se for `30/60/90`, são 3; se `28/56/84/112`, são 4.
3. Para sábado/domingo: a data alvo cai num fim de semana → ajuste para sexta (sábado) ou segunda (domingo). É feature, não bug. Feriado **não** é tratado.
4. Soma de parcelas ≠ valor total: impossível por design (última absorve resíduo). Se aconteceu, pode ser parcela editada manualmente — investigar o histórico em `audit_logs`.
5. Mudou data de entrega? `regenerarParcelas` apaga as não pagas e gera novas; pagas ficam intocadas e contam pro saldo.

---

## Receita 4 — "Como corrigir uma importação que entrou errada?"

**Caminhos**:

- **WBS**: não tem rollback automático — o WBS faz UPDATE/INSERT in-place. Use a UI para editar etapa/item ou re-importe com correção.
- **Pedidos / Custos Indiretos / BD Realizado**: cada lote registra `audit_logs` com `tracked_ids`. Na aba **"Logs de Importação"**, expanda o card e clique em "Reverter". Remove tudo que aquele import criou.
- **Rollback fallback** (sem `tracked_ids`): para BD Realizado antigos, deleta por `origem='bd_realizado'` global — pode apagar coisa de outros imports do mesmo tipo. Atenção.

---

## Receita 5 — "Adicionar suporte a um header novo"

**Pergunta típica**: "A planilha do cliente Y usa `Cód. Etapa` em vez de `Etapa Cód`. Posso aceitar?"

**Procedimento**:

1. Localize o `findCol` ou `findPedCol` relevante (§C em `03_SNIPPETS_CRITICOS.md` ou tab Pedidos em `01_TEMPLATES_CANONICOS.md`).
2. Adicione o alias na lista de possibilities.
3. Diga ao Pedro **qual edição** fazer e em qual arquivo:linha.
4. Lembre: o `findCol` faz NFD-strip + remove `\s/_-.`, então variações já são cobertas; só precisa adicionar se for palavra realmente diferente.
5. Para **WBS aba "Etapas"** (que antes não tinha fuzzy), agora tem aliases — siga a tabela em `01_TEMPLATES_CANONICOS.md` §1.A.

---

## Receita 6 — "Quero importar 'Fluxo de Caixa' direto"

**Resposta curta**: não dá. O Fluxo é derivado.

**Resposta longa**:
- O dashboard mostra fluxo a partir das parcelas (saídas) + medições/distribuição (entradas) + mútuos + saldo inicial das contas.
- Para que o fluxo "tenha conteúdo", preencha **na ordem**: WBS → Pedidos (gera parcelas) → Medições → Mútuos (se houver). O fluxo se forma sozinho.
- O saldo inicial vem das `contas_bancarias` (Configurações). Se não houver, cai no `companies.saldo_inicial_caixa`.

---

## Receita 7 — "Diferença entre os 3 caminhos de import de Cronograma"

| Caminho | Quando usar | Limites |
|---|---|---|
| **WBS Completa (Excel)** | Sempre que possível. Formato oficial. | Exige 3 abas com nomes exatos. |
| **Dados Base (CSV/XLSX)** | Migração legada, importações pontuais. | Snake_case forçado. Não cria fornecedor automaticamente em itens_compra. |
| **Distribuição standalone** | Atualizar só distribuição sem mexer em etapas/itens. | Header em snake_case. |

---

## Receita 8 — "Auditoria: o que mudou no último import?"

1. Na aba **"Logs de Importação"** o card mostra contagens (criadas/atualizadas) por entidade.
2. Cada log grava em `audit_logs.dados_depois`:
   - `type: 'import_lote' | 'import_wbs' | 'import_bd_realizado_v3_history'`
   - `success`, `total`, `errors[]`
   - WBS adicionalmente: `etapas: {criadas, atualizadas}`, `itens: {...}`, `distribuicoes: {...}`, `errors[]`, `warnings[]`, `diagnostics[]`
   - BD Realizado adicionalmente: `tracked_ids: { mov_ids, pedido_ids, despesa_ids, mutuo_ids, item_flex_ids, parcela_ids, conciliacao_ids }`
3. Pedro pode baixar log de erros como `.txt` direto da UI.

---

## FAQ rápido

**Q: Onde fica o número 64 (casas)?**
A: `DEFAULT_CASAS` em `src/lib/wbsImport.ts`. Centralizado após P4.16.

**Q: O sistema reconhece feriados?**
A: Não. `ajustarDiaUtil` só desvia sábado e domingo.

**Q: Posso importar uma parcela já paga (data_pagamento_real preenchida)?**
A: Direto, não há template. Mas via BD Realizado, sim — o sistema cria parcela única com `numero_parcela=999`, `status='paga'` e ancora num pedido fantasma.

**Q: O que vira `Item Flex`?**
A: Linha do BD Realizado classificada como `despesa` cujo `Departamento` casa com etapa, mas o `ITEM` da planilha não casa com nenhum item existente. O sistema cria um item de código `FLEX` (genérico) ou `IMP` (com descrição) para ancorar a parcela. Some `tipo='MATERIAL'`, `valor_total_orcado=0` (não infla "Consumido" da WBS, só "Pago").

**Q: O que acontece se eu importar duas vezes a mesma planilha de pedidos?**
A: Cria duplicatas. Não há dedupe baseado em `numero_pedido` — se o cliente colocar `numero_pedido=1` em dois lotes, vão coexistir. Use a aba "Logs" para reverter um deles.

**Q: O `Fornecedor` em maiúsculas vs minúsculas vira o mesmo registro?**
A: O lookup é por `ilike` (case-insensitive), então **acha** o existente. Mas se não achar, **cria** com o casing original — pós P2.11, o nome é `trim + squash de espaços` (sem mexer em case). Se houver variação real (ex.: `Concreteira ABC` vs `Concreteira  ABC` com 2 espaços), não duplica mais.

**Q: Posso importar pedidos sem cadastrar o item antes?**
A: Não. O parser tenta resolver `item_codigo` → `descrição+etapa` → fuzzy. Se falhar, a linha é descartada com `Item "..." não encontrado`. Cadastre o item primeiro (via WBS).

**Q: O `cond_pagamento` aceita `0` (à vista numérico)?**
A: Sim. `parsearCondicao('0')` → `[0]` → 1 parcela na data de entrega.

**Q: Onde fica o limite de 120 dias para match de parcela no BD Realizado?**
A: `src/pages/ImportacaoPage.tsx:2191` (constante hard-coded). Cobre condições típicas até 30/60/90/120.

**Q: Existe uma config para alterar 64 casas no projeto inteiro?**
A: Não no banco. Hoje só editar `DEFAULT_CASAS`. Se um projeto tiver número diferente, **a planilha de Etapas precisa preencher a coluna `Casas` em todas as linhas** — não confiar no default.

**Q: Como o sistema sabe se uma medição já existe?**
A: `medicoes.numero` (int, único por `company_id`) é a chave. Distribuição referencia pelo número, não por id.

**Q: Status de parcela tem CHECK no banco?**
A: Não foi encontrado nas migrations. O código usa `'futura'`, `'paga'`, `'parcialmente_paga'`. Pedro: **se um valor diferente entrar, o banco aceita**. Sugestão de adicionar CHECK está em P3.13 (não aplicado ainda).

**Q: O parser trata BOM no CSV?**
A: O download do log de erros injeta BOM (`0xEF, 0xBB, 0xBF`) ao salvar. O parser de CSV de input usa `TextDecoder` UTF-8 que **descarta** BOM automaticamente — não é um problema.

---

## Pequeno checklist do que NUNCA esquecer

1. `company_id` — toda inserção precisa.
2. `findCol` faz fuzzy mas o terceiro pass é `includes` — colunas com nomes parecidos colidem (ex.: `Qtd Casas` ↔ `Qtd/Casa`).
3. Datas: `toDateISO` aceita 3 formatos, mas Dados Base **não usa** `toDateISO` em datas de Pedido/Despesa-indireta — só em etapas (P0.1 aplicado).
4. WBS aba "Etapas" agora aceita `Codigo` sem acento (P0.4); WBS aba "Itens" sempre aceitou.
5. BD Realizado: ano de 3 dígitos é **rejeitado**, não corrigido (P2.9).
6. Mútuos auto-skipam se já existirem (mesmo valor ±1, mesma data).
7. Custos indiretos `Categoria` default = `'Indireto'`.
8. `valor_saldo` em `itens_compra` é GENERATED ALWAYS — não tente gravar.
9. Trigger `consolidate_pedido_status` atualiza status do pedido automaticamente (`pago` ≥ total - 0.01).

---

## Modelos de resposta para casos comuns

### Modelo A — Validação OK

```
🎯 Cronograma WBS

✅ Aba "Etapas": 12 colunas reconhecidas, todas aceitas (incluindo "Codigo" sem acento via alias).
✅ 3 etapas válidas, todas com Casas=64 e Status="futuro".
✅ Datas em formato BR — serão convertidas para ISO automaticamente.

🛠️ Pode subir.
```

### Modelo B — Bloqueador

```
🎯 Pedidos (formato PT-BR detectado)

🚨 BLOQUEADOR
- Linha 5: ITEM="Concreto X" não existe no Cronograma. Linha será descartada.
- Linha 12: COND PAGTO="3060" — sem barra, vira [3060] (3060 dias!). Use "30/60".

⚠️ Atenção
- Coluna "VALOR TOTAL" usa . como decimal e , como milhar — vai ser parseado como BR (milhar=., decimal=,). Confira valores em torno de R$ 1k.

🛠️ AÇÃO
1. Cadastre "Concreto X" via WBS antes deste import.
2. Corrija linha 12 para "30/60".
```

### Modelo C — Não sei

```
Não tenho dados suficientes para responder. Preciso de:
- as primeiras 3 linhas da aba que está importando (incluindo o header)
- o nome literal da aba

Sem isso eu chuto.
```
