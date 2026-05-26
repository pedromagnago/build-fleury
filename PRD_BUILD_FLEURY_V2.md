# PRD — Build Fleury v2
## Plataforma de Controle Orçamentário de Obras com Cronograma Integrado e IA

**Versão:** 2.0
**Data:** 02/04/2026
**Referências normativas:** NBR 16636:2017 (ABNT), PMBOK 7ª ed. (PMI), EVM/ANSI EIA-748

---

## 1. Visão do produto

Plataforma web para gestão orçamentária e financeira de obras de construção civil. O sistema coloca o cronograma de execução como fonte única de verdade, conectando etapas de obra → itens de compra → pagamentos → fluxo de caixa numa cadeia automatizada. Inclui IA para classificar documentos de obra (notas fiscais, recibos, pedidos) e vinculá-los automaticamente ao orçamento, com auditoria humana obrigatória.

### 1.1 Problema que resolve

Na gestão de obras, cronograma físico e controle financeiro vivem separados. O gestor de obra pensa em sequência de serviços e datas; o financeiro pensa em categorias e lançamentos. Quando uma data muda na obra, alguém precisa manualmente atualizar dezenas de pagamentos e recalcular o fluxo de caixa. Notas fiscais e recibos chegam em papel ou PDF e precisam ser digitados um a um no sistema.

O resultado: fluxo de caixa desatualizado, decisões com dados velhos, retrabalho diário e risco de estouro de orçamento sem aviso prévio.

### 1.2 Como resolve

O cronograma de execução dirige tudo. Cada etapa da obra tem itens de compra vinculados (material, mão de obra, equipamento), com fornecedor, preço e condição de pagamento. Quando uma data muda no cronograma, o sistema recalcula automaticamente datas de entrega, parcelas de pagamento e fluxo de caixa. Documentos enviados pelo gestor de obra são processados por IA que extrai dados, classifica e propõe lançamentos — o operador financeiro apenas audita e aprova.

---

## 2. Princípios de design

1. **Cronograma é a fonte única de verdade** — toda alteração de prazo ou custo nasce no cronograma e cascateia para compras, pagamentos e fluxo de caixa.
2. **Orçado = Consumido + Saldo futuro** — o total orçamentário é imutável salvo revisão formal. O que muda é a composição entre real e previsto.
3. **CFF integrado** — cronograma físico-financeiro conecta etapa de obra, itens de compra, condição de pagamento e fluxo de caixa numa cadeia única (NBR 16636:2017).
4. **IA sempre auditada** — nenhuma classificação vira definitiva sem aprovação humana. Auto-approve apenas acima do limiar de confiança configurável.
5. **Soft delete** — nunca deletar dados financeiros.
6. **Audit log em tudo** — toda ação rastreada (quem, quando, o quê, valor anterior, valor novo).
7. **TypeScript strict** — nunca usar `any`.
8. **RLS em 100% das tabelas** — isolamento multi-tenant.
9. **Configurável sem código** — limiares, datas, condições de pagamento, score mínimo de IA, tudo ajustável via interface.

---

## 3. Stakeholders e personas

| Papel | O que faz no sistema | Frequência |
|---|---|---|
| Gestor de obra | Edita cronograma, registra avanço físico, faz upload de documentos, negocia com fornecedores, visualiza fluxo de caixa | Diário |
| Operador financeiro | Audita classificações da IA, registra pagamentos reais, concilia bancário | Diário |
| Supervisor | Visão executiva, alertas de desvio, aprova revisões orçamentárias, configura limiares | Semanal |
| Investidor | Recebe relatórios periódicos com fluxo de aportes vs recebimentos | Quinzenal/mensal |

---

## 4. Modelo de dados

### 4.1 Hierarquia central (EAP — Estrutura Analítica do Projeto)

```
Projeto (company)
  └── Etapa de obra
        └── Serviço (material / mão de obra / equipamento)
              └── Item de compra
                    ├── Fornecedor
                    ├── Preço unitário
                    ├── Condição de pagamento (ex: 30/60/90)
                    └── Pedidos (lotes de compra)
                          ├── Quantidade do lote
                          ├── Data de entrega prevista
                          └── Parcelas de pagamento (geradas automaticamente)
```

### 4.2 Cadeia de cascata

```
Cronograma (datas de execução por etapa)
    │
    ▼
Pedidos de compra (data entrega = f(data de execução da etapa))
    │
    ▼
Parcelas de pagamento (data vencimento = data entrega + condição de pagamento)
    │
    ▼
Fluxo de caixa projetado (soma de todas parcelas + receitas de medição)
```

Regra: quando o gestor altera a data de uma etapa no cronograma, o sistema recalcula datas de entrega dos pedidos daquela etapa, recalcula parcelas com base na condição negociada, e atualiza o fluxo de caixa.

### 4.3 Pipeline de IA (integrado à cadeia)

```
Documento (upload: NF, recibo, pedido, comprovante)
    │
    ▼
OCR + Extração (Edge Function + OpenAI API)
    │  Extrai: fornecedor, CNPJ, valor, itens, data, condição de pagamento
    ▼
Classificação (Edge Function + OpenAI API)
    │  Identifica: etapa de obra, tipo de serviço, item de compra vinculado
    │  Calcula: saldo disponível, score de confiança (0 a 1)
    ▼
Fila de auditoria
    │  Score >= limiar configurável → auto-approve
    │  Score < limiar → aguarda aprovação humana
    ▼
Ação pós-aprovação
    ├── Registra pagamento real na parcela correspondente
    ├── Atualiza valor_consumido no item de compra
    ├── Recalcula saldo remanescente
    └── Atualiza fluxo de caixa
```

### 4.4 Tabelas do banco de dados

#### Estrutura do projeto

**`companies`** — Projeto/tenant
- id, razao_social, nome_fantasia, municipio, estado, qtd_casas, area_casa_m2, data_inicio_obras, saldo_inicial_caixa, faturamento_contrato, custo_total_contrato, status (ativo/suspenso/concluído), config (JSONB com limiares e configurações)

**`user_roles`** — Permissões
- id, user_id (FK→auth.users), company_id (FK), role (super_admin/supervisor/operador/cliente), active

#### Cronograma

**`etapas`** — Etapas de obra
- id, company_id, codigo, nome, ordem, data_inicio_plan, data_fim_plan, data_inicio_real, data_fim_real, casas_total, valor_total_orcado, status (futuro/em_andamento/concluido/atrasado), depende_de (FK→etapas), observacoes

**`cronograma_distribuicao`** — Distribuição de casas por etapa e medição
- id, company_id, etapa_id (FK), medicao_numero, casas_planejadas, data_inicio, data_fim, casas_realizadas

#### Compras

**`fornecedores`**
- id, company_id, nome, cnpj, contato, cond_pagamento_padrao, observacoes

**`itens_compra`** — Itens detalhados vinculados à etapa
- id, company_id, etapa_id (FK), codigo, descricao, tipo (MATERIAL/MÃO DE OBRA/EQUIPAMENTO), categoria, unidade, qtd_por_casa, qtd_total, custo_unitario_orcado, valor_total_orcado, fornecedor_id (FK), cond_pagamento, valor_consumido (default 0), valor_saldo (GENERATED: valor_total_orcado - valor_consumido)

**`pedidos`** — Lotes de compra vinculados a item
- id, company_id, item_compra_id (FK), numero_pedido, casas_lote, qtd_lote, valor_unitario_real, valor_total_real, fornecedor_id (FK), cond_pagamento, data_entrega_prevista, data_entrega_real, status (planejado/pedido_enviado/entregue/pago), observacoes

#### Financeiro

**`parcelas`** — Geradas automaticamente a partir de pedido + condição de pagamento
- id, company_id, pedido_id (FK), numero_parcela, valor, data_vencimento, data_pagamento_real, valor_pago, forma_pagamento, conta_bancaria_id (FK), status (futura/a_vencer/paga/vencida), comprovante_path

**`medicoes`** — Receitas contratuais
- id, company_id, numero, valor_planejado, data_prevista, data_liberacao, valor_liberado, status (futura/em_medicao/liberada/paga), percentual_fisico_meta, percentual_fisico_real, observacoes

**`contas_bancarias`**
- id, company_id, nome, banco, agencia, conta, tipo, saldo_inicial, ativa

**`movimentacoes_bancarias`** — Extrato para conciliação
- id, company_id, conta_id (FK), data, descricao, valor, tipo (entrada/saida), categoria, conciliado, conciliado_em, parcela_id (FK)

#### IA e documentos

**`documentos`** — Uploads do gestor de obra
- id, company_id, nome_arquivo, storage_path, tamanho_bytes, tipo_mime, enviado_por (FK→auth.users), status (recebido/processando/classificado/erro), erro_detalhe

**`classificacoes_ia`** — Propostas da IA para auditoria
- id, company_id, documento_id (FK), fornecedor_extraido, cnpj_extraido, valor_extraido, data_vencimento_extraida, itens_extraidos (JSONB), etapa_proposta_id (FK→etapas), item_compra_proposto_id (FK→itens_compra), pedido_proposto_id (FK→pedidos), valor_orcado_item, valor_ja_consumido, valor_saldo_antes, valor_saldo_depois, score_confianca (0 a 1), justificativa_ia, status_auditoria (pendente/aprovado/corrigido/rejeitado), auditado_por (FK), auditado_em, correcoes (JSONB), motivo_rejeicao

**`alertas`**
- id, company_id, tipo, severidade, titulo, mensagem, dados (JSONB), lido, lido_por, created_at

**`audit_logs`**
- id, company_id, tabela, registro_id, acao (INSERT/UPDATE/DELETE), agente (humano/ia/sistema), usuario_id, dados_antes (JSONB), dados_depois (JSONB), created_at

#### Avanço físico

**`avancos`**
- id, company_id, etapa_id (FK), data_registro, casas_concluidas, percentual (GENERATED: casas_concluidas / qtd_casas), registrado_por (FK), observacoes, fotos (TEXT[])

#### Cenários

**`cenarios`**
- id, company_id, nome, descricao, ativo, criado_por (FK)

**`cenario_ajustes`**
- id, company_id, cenario_id (FK), tipo_ajuste (adiar_parcela/alterar_valor/adiar_medicao/alterar_cond_pagamento), referencia_id (UUID da parcela/medição/pedido), valor_original, valor_novo, data_original, data_novo

#### Views materializadas

**`v_fluxo_caixa_projetado`** — Para cada dia: saídas (parcelas), entradas (medições), saldo acumulado desde o saldo_inicial.

**`v_orcado_vs_realizado`** — Por etapa: valor orçado, consumido, saldo, percentual.

**`v_curva_s`** — Acumulado temporal: planejado vs realizado, com projeção EVM.

**`v_indicadores_evm`** — PV, EV, AC, SPI (EV/PV), CPI (EV/AC), EAC.

---

## 5. Módulos e telas

### 5.1 Cronograma de execução — tela principal

**Rota:** `/cronograma`
**Acesso:** Gestor de obra, Supervisor, Operador

Visualização tipo Gantt simplificado. Linhas = etapas de obra, colunas = semanas/dias, barras = período de execução. Cada etapa expande para mostrar sub-linhas de material e mão de obra.

**Funcionalidades:**
- Visualizar todas as etapas com datas planejadas e reais
- Arrastar barras para alterar datas (com painel de impacto antes de confirmar)
- Expandir etapa para ver itens de compra vinculados
- Distribuição de casas por medição
- Marcos verticais mostrando medições contratuais
- Indicador visual de status: no prazo / em risco / atrasado
- Painel lateral de impacto: ao alterar data, mostra quantas parcelas serão afetadas e o delta no fluxo de caixa

**Comportamento da cascata:** Mover data de etapa → recalcula datas de entrega dos pedidos → recalcula parcelas → regenera fluxo de caixa → mostra "Antes vs Depois" para confirmação.

### 5.2 Compras (detalhamento de itens)

**Rota:** `/compras`
**Acesso:** Gestor de obra, Operador

Tabela agrupada por etapa → item, com fornecedor, preço, condição, pedidos.

**Funcionalidades:**
- Listar itens agrupados por etapa, filtrar por fornecedor/tipo
- Ver pedidos planejados com quantidades, valores e datas
- Editar fornecedor, preço, condição de pagamento (recalcula parcelas)
- Registrar pedido enviado, entrega recebida
- Curva ABC dos insumos
- Visão por fornecedor: total de compras, próximas datas

### 5.3 Pagamentos

**Rota:** `/pagamentos`
**Acesso:** Operador, Supervisor

**Funcionalidades:**
- Listar parcelas por status/data/fornecedor/etapa
- Registrar pagamento (data, valor, forma, comprovante)
- Pagamento parcial
- Agenda da semana: parcelas vencendo nos próximos 7 dias
- Visão por fornecedor com próximos vencimentos
- Alertas para parcelas vencidas

### 5.4 Upload de documentos + IA

**Rota:** `/documentos`
**Acesso:** Gestor de obra, Operador

**Funcionalidades:**
- Upload de documentos: NF (PDF/imagem/XML NF-e), recibo, pedido de compra, comprovante de pagamento
- Processamento automático por IA ao fazer upload:
  1. Extração: OCR + OpenAI API extrai fornecedor, CNPJ, itens, valores, datas
  2. Classificação: identifica etapa de obra, item de compra, pedido correspondente
  3. Match orçamentário: localiza a previsão de pagamento mais provável, calcula saldo
  4. Score de confiança (0 a 1) com justificativa
- Histórico de uploads com status: recebido → processando → classificado → aprovado/rejeitado
- Preview do documento ao lado da proposta da IA

### 5.5 Fila de auditoria

**Rota:** `/auditoria`
**Acesso:** Operador, Supervisor

**Layout:** Documento original (lado esquerdo) × proposta da IA (lado direito).

**Funcionalidades:**
- Lista de classificações pendentes com filtros (status, score, fornecedor, etapa)
- Indicadores: pendentes, aprovadas, taxa de acerto, score médio
- Para cada proposta: fornecedor, valor, etapa, item, parcela vinculada, saldo antes/depois, score, justificativa
- 3 ações:
  - **Aprovar** → registra pagamento na parcela, atualiza consumido, recalcula saldo e fluxo
  - **Corrigir** → ajusta etapa/item/valor → depois aprovar
  - **Rejeitar** → motivo obrigatório
- Auto-approve configurável: score >= limiar → aprovação automática sem fila
- Aprendizado: correções alimentam exemplos futuros no prompt da IA (few-shot)

### 5.6 Dashboard

**Rota:** `/dashboard`
**Acesso:** Todos

| Widget | Dados | Visual |
|---|---|---|
| Barra Regra de Ouro | Orçado = Consumido + Saldo | Barra segmentada |
| Cards resumo | Orçado, Consumido, Saldo, % execução | 4 cards |
| Fluxo de caixa projetado | Saldo acumulado dia a dia | Gráfico de área |
| Curva S | PV vs EV vs AC acumulados | 3 linhas |
| Indicadores EVM | SPI, CPI, EAC | Cards com semáforo |
| Top desvios | Etapas com maior diferença orçado vs real | Lista |
| Medições | Status de cada medição | Timeline |
| Avanço físico | % geral do projeto | Barra de progresso |
| Próximos pagamentos | Vencendo em 7 dias | Mini-tabela |
| Saldo mínimo projetado | Pior saldo futuro e data | Card com alerta |
| IA - últimos documentos | Uploads recentes e status | Mini-tabela |

### 5.7 Medições (receitas)

**Rota:** `/medicoes`
**Acesso:** Supervisor, Gestor

- Cards por medição com valor, data prevista, status
- Etapas vinculadas com meta física vs avanço real
- Indicador de risco se avanço abaixo da meta
- Registrar liberação (data + valor real)
- Impacto no fluxo de caixa quando medição atrasa

### 5.8 Avanço físico

**Rota:** `/avanco`
**Acesso:** Gestor, Operador

- Grid: etapas × medições
- Registrar casas concluídas por etapa
- Upload de fotos como evidência
- Verificação automática se metas de medição foram atingidas

### 5.9 Conciliação bancária

**Rota:** `/conciliacao`
**Acesso:** Operador

- Importar extrato (CSV/OFX)
- Match automático extrato ↔ parcelas pagas
- Match manual para não conciliados
- Divergências e ajustes de saldo

### 5.10 Simulador de cenários

**Rota:** `/simulador`
**Acesso:** Supervisor

- Criar cenário a partir do planejamento atual
- Editar datas, valores, condições sem afetar o real
- Gráfico comparativo: cenário vs base
- Aplicável para: "e se atrasarmos X?", "e se negociarmos Y dias?"

### 5.11 Importação de dados

**Rota:** `/importacao`
**Acesso:** Supervisor

- Upload de planilhas Excel com dados iniciais do projeto (cronograma, itens de compra, orçamento)
- Templates CSV para cada tipo de dado
- Preview e validação antes de confirmar
- Suporte a formato numérico brasileiro

### 5.12 Configurações

**Rota:** `/configuracoes`
**Acesso:** Supervisor

- Dados do projeto (nome, casas, datas, saldo inicial)
- Usuários e roles
- Condições de pagamento padrão por fornecedor
- Limiares de alerta (desvio %, saldo mínimo, dias de atraso)
- Medições (valores, datas, etapas vinculadas)
- IA: score mínimo para auto-approve, ativar/desativar auto-approve
- Tipos de arquivo aceitos no upload

---

## 6. IA — Detalhamento técnico

### 6.1 Pipeline de processamento

```
Upload → Armazenamento (Supabase Storage)
  → Edge Function "process-document"
    → Etapa 1: Extração (OCR + OpenAI API)
    → Etapa 2: Classificação (OpenAI API + contexto do orçamento)
    → Etapa 3: Match com orçamento (SQL + OpenAI API para desempate)
    → Etapa 4: Cálculo de saldo e score
    → Insere em classificacoes_ia
    → Se score >= limiar → auto-approve → registra pagamento
    → Se score < limiar → status "pendente" → notifica operador
```

### 6.2 Extração (Etapa 1)

A IA recebe o documento e extrai dados estruturados:

**Input:** Arquivo (PDF, imagem, XML NF-e)
**Output:** JSON com tipo_documento, fornecedor (razão social, CNPJ), valor_total, data_emissão, data_vencimento, condição_pagamento, itens (descrição, quantidade, unidade, valor unitário, valor total)

Se o campo não for legível, retorna null. Valores em BRL, datas em ISO.

### 6.3 Classificação (Etapa 2)

A IA recebe os dados extraídos + a lista de etapas e itens de compra do projeto:

**Input:** Dados extraídos + tabela de etapas + tabela de itens_compra
**Output:** etapa_id, item_compra_id, justificativa, score_confianca (0 a 1)

Regras:
- Usar apenas etapas e itens existentes no projeto
- Priorizar match pela descrição dos itens, não pelo nome do fornecedor
- Se incerto, reduzir score
- Score < 0.5 = rejeitado automaticamente

### 6.4 Match com orçamento (Etapa 3)

Query SQL busca itens de compra que correspondam à etapa e tipo propostos, com saldo > 0. Se múltiplos candidatos, segundo prompt da IA decide qual é o mais provável.

### 6.5 Aprendizado (feedback loop)

Toda correção feita pelo auditor é registrada. Correções recentes são injetadas no prompt de classificação como exemplos (few-shot learning):

```
CORREÇÕES ANTERIORES:
- Fornecedor "X" com item "Y": IA disse etapa A, correto é etapa B
```

Limite: últimas 20 correções para não estourar contexto.

### 6.6 Ação pós-aprovação

Quando classificação é aprovada (manual ou auto):
1. Localiza parcela correspondente (pedido + fornecedor + valor próximo + data próxima)
2. Registra pagamento na parcela (data_pagamento_real, valor_pago, comprovante)
3. Atualiza valor_consumido no item de compra
4. Recalcula valor_saldo
5. Se há comprovante, vincula ao storage_path
6. Registra tudo no audit_log

---

## 7. Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Estilização | Tailwind CSS + shadcn/ui |
| Estado servidor | TanStack Query |
| Formulários | React Hook Form + Zod |
| Gráficos | Recharts |
| Backend | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| IA | OpenAI GPT-4o / GPT-4o-mini — extração, classificação, match, simulador |
| Cron | pg_cron (refresh de views materializadas) |

---

## 8. Fases de construção

### Fase 1 — Fundação (semana 1-2)

- [ ] Schema completo no Supabase + RLS + Auth
- [ ] Tela de importação (Excel/CSV → banco)
- [ ] Carga inicial dos dados do projeto
- [ ] Views materializadas (fluxo de caixa, orçado vs realizado, curva S, EVM)

### Fase 2 — Cronograma + Compras (semana 3-4)

- [ ] Tela de cronograma (Gantt simplificado, barras arrastáveis)
- [ ] Lógica de cascata (etapa → pedido → parcela → fluxo)
- [ ] Painel de impacto (antes vs depois)
- [ ] Tela de compras (itens, pedidos, fornecedores)
- [ ] Geração automática de parcelas

### Fase 3 — Financeiro + IA + Dashboard (semana 5-7)

- [ ] Tela de pagamentos (registro, agenda, alertas)
- [ ] Tela de medições (receitas, liberação)
- [ ] Upload de documentos + processamento IA (Edge Function)
- [ ] Fila de auditoria (aprovar/corrigir/rejeitar)
- [ ] Auto-approve por score
- [ ] Ação pós-aprovação (registrar pagamento, atualizar saldo)
- [ ] Feedback loop (correções → exemplos futuros)
- [ ] Dashboard completo com todos os widgets + indicadores EVM

### Fase 4 — Avanço físico + Conciliação + Simulador (semana 8-9)

- [ ] Avanço físico (grid, fotos, impacto em medições)
- [ ] Conciliação bancária (importar extrato, match)
- [ ] Simulador de cenários

### Fase 5 — Refinamento (semana 10)

- [ ] Relatórios para investidor
- [ ] Exportar PDF/Excel
- [ ] Configurações completas
- [ ] Performance, testes, ajustes

---

## 9. Métricas de sucesso

| Métrica | Meta |
|---|---|
| Tempo de atualização do fluxo após alterar cronograma | < 5 segundos |
| Cobertura de parcelas geradas automaticamente | 100% dos pedidos |
| Taxa de acerto da IA na classificação | > 80% sem correção |
| Tempo médio de auditoria por documento | < 2 minutos |
| Conciliação bancária automática | > 90% |
| Desvio orçamentário identificado antecipadamente | > 7 dias antes |
| Precisão do fluxo projetado vs real | Desvio < 10% no saldo mensal |

---

## 10. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Gestor não atualiza cronograma | Alertas de "última atualização há X dias", dashboard mostra data do último edit |
| Fornecedor muda condição de pagamento | Edição a qualquer momento com recálculo automático de parcelas |
| Medição atrasa e receita não entra | Simulador mostra cenário de atraso, alerta antecipado |
| IA classifica errado | Auditoria humana obrigatória, auto-approve apenas acima do limiar, feedback loop melhora acurácia |
| Dados iniciais com inconsistências | Validação rigorosa na importação com preview, log de importação |
| Volume alto de parcelas | Paginação, views materializadas, refresh assíncrono |
| Documento ilegível no OCR | IA retorna score baixo, documento vai para auditoria manual com flag "extração incerta" |

---

## 11. Fora do escopo (v2)

- Integração com ERP externo (Omie, SAP, TOTVS etc.)
- App mobile nativo (web responsivo é suficiente)
- Controle de estoque físico no canteiro
- BIM (Building Information Modeling)
- Geração automática de contratos
- Folha de pagamento de funcionários
