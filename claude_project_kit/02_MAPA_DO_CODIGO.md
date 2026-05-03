# 02 — Mapa do código (Build Fleury)

> Orientação rápida para o assistente saber onde olhar quando o Pedro pedir "mexe em X" ou "por que isso aconteceu?".

## Stack

- **Frontend**: React 18 + Vite + TypeScript, Tailwind, shadcn/ui (Radix), `lucide-react`, `sonner` (toasts), `@tanstack/react-query`.
- **Backend**: Supabase (Postgres + Auth + Edge Functions). Cliente JS em `src/lib/supabase.ts`.
- **Edge Functions** (Deno): só `recepcao-embed` e `recepcao-extrair` em `supabase/functions/`. Importação **não usa** Edge Functions — tudo roda no cliente.
- **Excel**: lib `xlsx` (SheetJS).

## Diretório raiz

```
Fleury_2/
├── src/
│   ├── pages/                    # rotas (uma .tsx por página)
│   ├── components/               # componentes reutilizáveis
│   ├── hooks/                    # React Query hooks (1 por entidade)
│   ├── contexts/                 # AuthContext, ProjectContext, TourContext
│   ├── lib/                      # parsers, exporters, utils, supabase client
│   └── App.tsx                   # roteador + providers
├── supabase/
│   ├── functions/                # Edge Functions (não tocam import)
│   └── migrations/               # SQL — quase só DML/data fixes (ver §schema)
├── public/
└── *.xlsx                        # planilhas de teste/template versionadas na raiz
```

## Páginas (`src/pages/`)

| Arquivo | Rota | Função |
|---|---|---|
| `ImportacaoPage.tsx` | `/importacao` | **Tudo de import vive aqui.** 2639 linhas, 8 abas (`wbs`, `dados`, `pedidos`, `indiretos`, `medicoes`, `distribuicao`, `pagamentos`, `logs`). |
| `CronogramaPage.tsx` | `/cronograma` | Visão WBS + Gantt + Cash flow chart. |
| `ComprasPage.tsx` | `/compras` | Listagem de pedidos, conferência. |
| `PagamentosPage.tsx` | `/pagamentos` | Pagamento manual de parcelas, conciliação. |
| `RecebimentosPage.tsx` | `/recebimentos` | Faturamento CEF, medições liberadas. |
| `ConciliacaoPage.tsx` | `/conciliacao` | Engine de match de movimentação ↔ parcela. |
| `MutuosPage.tsx` | `/mutuos` | Empréstimos e adiantamentos. |
| `MedicoesPage.tsx` | `/medicoes` | Cadastro/atualização de medições. |
| `DespesasIndiretasPage.tsx` | `/despesas-indiretas` | CRUD de custos indiretos. |
| `RecepcaoPage.tsx` | `/recepcao` | OCR de NF-e (usa Edge Functions). |
| `Configuracoes.tsx` | `/config` | `saldo_inicial_caixa`, `prazo_recebimento_dias`, contas bancárias. |
| `Dashboard.tsx` | `/` | Widgets: fluxo de caixa, donut de maturidade, KPIs. |

## Lib (`src/lib/`)

| Arquivo | O que faz | Quando consultar |
|---|---|---|
| `wbsImport.ts` | Parse + preview + apply do WBS multi-aba (Etapas/Itens/Distribuição) | qualquer pergunta sobre import de cronograma |
| `bdRealizadoImport.ts` | Parse + classificação do BD Realizado | dúvidas de import de pagamentos realizados |
| `parcelas.ts` | `parsearCondicao` + `gerarParcelas` + `regenerarParcelas` + `ajustarDiaUtil` | dúvidas sobre como vencimento é calculado |
| `composicaoParser.ts` | Parser de composição CEF (planilha de medições) | **órfão**: parser existe mas nenhuma UI o invoca hoje |
| `wbsExport.ts` | Exporta WBS em formato compatível com import | quando precisar reproduzir o template oficial |
| `exportExcel.ts` | Helpers de export (parcelas, fornecedores, etc.) | exports diversos |
| `ofxParser.ts` | Parse de OFX bancário | conciliação |
| `reconciliationEngine.ts` | Engine de match mov↔parcela | ConciliacaoPage |
| `auditLog.ts` | Helpers para `audit_logs` | rastreamento de imports |
| `supabase.ts` | Cliente Supabase singleton | — |
| `utils.ts` | `formatCurrency`, `cn`, etc. | — |

## Hooks (`src/hooks/`)

Cada hook é um wrapper React Query sobre uma tabela. Padrão: `useX()` retorna `{data, isLoading, ...}`; mutations expostas como funções nomeadas.

- `useEtapas`, `useCompras` (= itens), `usePedidos` (em `useCompras.ts`), `useFinanceiro` (parcelas, contas bancárias), `useOperacional` (medições, distribuição, movimentações), `useMutuos`, `useDespesasIndiretas`, `useConciliacao`, `useCashFlowEvents`, `useGestaoUsuarios`, `useBankRules`.

## Contexts

- `AuthContext` — sessão Supabase, perfil do usuário.
- `ProjectContext` — empresa atual (`currentCompany`), troca de projeto. Campos relevantes:
  - `saldo_inicial_caixa: number`
  - `prazo_recebimento_dias: number` (default 30)
- `TourContext` — onboarding/tutorial.

## Componentes-chave

- `components/cronograma/ImportPreviewModal.tsx` — modal de confirmação WBS (mostra diff antes do apply).
- `components/cronograma/WBSTable.tsx`, `Gantt`, `CashFlowChart` — visualizações principais.
- `components/financeiro/EditParcelaModal.tsx`, `ConsolidarPedidosWizard.tsx`, `NovoAdiantamentoDialog.tsx` — fluxos financeiros.
- `components/conciliacao/` — UI da conciliação manual.
- `components/ui/` — wrappers shadcn (Button, Dialog, Select, etc.).

## Tabelas principais (Supabase)

> **CREATE TABLE não está versionado nas migrations** — schema foi setado direto no Dashboard. CHECK/NOT NULL/FK podem existir e não estarem documentadas. Quando o Pedro descrever erro de constraint, **peça o texto literal**.

Tabelas confirmadas pelo uso no código:

```
companies                 — multi-tenant raiz (id, nome, saldo_inicial_caixa, prazo_recebimento_dias)
contas_bancarias          — (company_id, nome, banco, ativa, saldo_inicial)
etapas                    — (company_id, codigo, nome, status, casas_total, ordem,
                             faturamento_valor_total, faturamento_preco_unitario,
                             faturamento_quantidade_unitaria, faturamento_unidade,
                             data_inicio_plan, data_fim_plan, observacoes,
                             valor_total_orcado, deleted_at)
itens_compra              — (company_id, etapa_id, codigo, descricao, tipo,
                             qtd_por_casa, qtd_total, unidade, custo_unitario_orcado,
                             valor_total_orcado, valor_consumido,
                             valor_saldo {GENERATED}, fornecedor_id, cond_pagamento,
                             categoria, deleted_at)
fornecedores              — (company_id, nome, cnpj, contato,
                             cond_pagamento_padrao, observacoes)
pedidos                   — (company_id, item_compra_id, fornecedor_id, numero_pedido,
                             casas_lote, qtd_lote, valor_unitario_real, valor_total_real,
                             cond_pagamento, data_entrega_prevista, data_entrega_real,
                             status, observacoes)
parcelas                  — (company_id, pedido_id?, despesa_indireta_id?,
                             numero_parcela, valor, valor_pago, data_vencimento,
                             data_pagamento_real, status, tipo, observacoes,
                             descricao, deleted_at)
medicoes                  — (company_id, numero, data_prevista, data_liberacao,
                             valor_planejado, valor_liberado, status,
                             percentual_fisico_meta, percentual_fisico_real)
cronograma_distribuicao   — (company_id, etapa_id, medicao_numero, casas_planejadas,
                             casas_realizadas, data_inicio, data_fim,
                             valor_liberado_faturamento)
despesas_indiretas        — (company_id, categoria, descricao, fornecedor_id,
                             valor_orcado, valor_consumido, data_inicio, data_fim,
                             cond_pagamento, ativo, recorrente, frequencia,
                             observacoes, deleted_at)
movimentacoes_bancarias   — (company_id, conta_id, data, descricao, valor, tipo,
                             categoria, conciliado, conciliado_em, observacao, origem)
mutuos                    — (company_id, fornecedor_id, nome, tipo, valor_captado,
                             data_captacao, status, observacoes)
conciliacoes              — (company_id, movimentacao_id, match_type, confidence,
                             diferenca, status)
conciliacao_parcelas      — (conciliacao_id, parcela_id?, mutuo_parcela_id?,
                             mutuo_id?, medicao_id?, valor_aplicado)
                              [CHECK exactly_one_origin]
audit_logs                — (company_id, tabela, acao, agente, dados_antes,
                             dados_depois, created_at)
```

## CHECK constraints conhecidas (das migrations)

- `parcelas.tipo IN ('contratual', 'adiantamento')` — em `20260425100000_add_tipo_to_parcelas.sql`
- `pedidos.status IN ('planejado','pedido_enviado','entregue','parcialmente_pago','pago','cancelado')` — em `20260425130000_consolidate_pedido_status.sql`
- `conciliacao_parcelas` exactly_one_origin (1 entre `parcela_id`, `mutuo_id`, `mutuo_parcela_id`, `medicao_id`) — em `20260424180000`

## Triggers conhecidas

- `consolidate_pedido_status`: AFTER INSERT/UPDATE/DELETE em `parcelas` → atualiza `pedidos.status` quando `Σ valor_pago ≥ valor_total - 0.01`.
- `sync_parcela_valor_pago_trigger`: sincroniza `parcelas.valor_pago` a partir de conciliações (ver `20260424160000`).
- Vários auto-reconcile / backfill (migrations `20260423-20260425`).

## Convenções

- **Nada de `any` cru** sem motivo — código preza tipos. Nas planilhas use `Record<string, unknown>` ou tipos `Parsed*`.
- **`audit_logs` recebe TUDO** — todo import grava log com `dados_depois.type` discriminador (`import_lote`, `import_wbs`, `import_bd_realizado_v3_history`).
- **Soft delete** via `deleted_at` em `etapas`, `itens_compra`, `parcelas`, `despesas_indiretas`. Lookups consideram `is('deleted_at', null)`.
- **Multi-tenant**: cada query filtra por `eq('company_id', currentCompany.id)`.
- **Tolerância contábil R$ 0,01** em comparações de pagamento (`v_pago >= v_total - 0.01`).

## Onde NÃO mexer sem alinhar com o Pedro

- Schema de tabelas (CREATE/ALTER) — não está versionado, mexer cego é destrutivo.
- Lógica de `consolidate_pedido_status` ou de `gerarParcelas` (tolerância de centavos é load-bearing).
- Função `findCol` em `wbsImport.ts` — várias planilhas legadas dependem do fuzzy match atual.

## Onde geralmente é seguro alterar

- Headers do template baixado (`downloadWBSTemplate`, `downloadTemplate`) — só afeta arquivos novos.
- Aliases em `findCol` / `findPedCol` — só amplia compatibilidade.
- Mensagens de erro literais (`formatError`, `formatDbError`) — UI only.
- Adicionar nova validação preventiva no preview (não bloquear apply).
