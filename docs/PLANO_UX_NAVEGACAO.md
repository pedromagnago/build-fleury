# Plano de UX e Navegação — Build Fleury

> Reorganização do front-end para refletir o fluxo sequencial da metodologia financeira. O objetivo é que o operador de um projeto em andamento consiga navegar de forma natural, seguindo a ordem real das operações.

---

## 1. Princípio de Design

**O menu é o projeto em andamento.** A ordem das seções reflete a sequência temporal do ciclo financeiro — da esquerda para a direita, de cima para baixo, o usuário segue o fluxo natural do projeto. Seções posteriores dependem de seções anteriores estarem bem preenchidas.

**Hierarquia de urgência no topo:** o Painel de Controle (alertas e pendências) fica fixo no topo da navegação — é o ponto de entrada de qualquer sessão de trabalho.

---

## 2. Nova Estrutura de Navegação (Sidebar)

```
┌─────────────────────────────┐
│  🏗 Build Fleury            │
│  [Projeto Atual ▾]          │
├─────────────────────────────┤
│  ● PAINEL DE CONTROLE       │  ← entrada de qualquer sessão
│  ● Cronograma de Caixa      │  ← visão financeira temporal
├─────────────────────────────┤
│  PLANEJAMENTO               │
│    ○ WBS & Orçamento        │
│    ○ Fornecedores           │
│    ○ Cronograma Físico      │
├─────────────────────────────┤
│  COMPRAS                    │
│    ○ Pedidos                │
│    ○ Recepção de NF         │
│    ○ Adiantamentos          │
├─────────────────────────────┤
│  FATURAMENTO                │
│    ○ Medições               │
│    ○ Recebimentos           │
├─────────────────────────────┤
│  FINANCEIRO                 │
│    ○ Pagamentos             │
│    ○ Custos Indiretos       │
│    ○ Capital de Giro        │
├─────────────────────────────┤
│  CAIXA                      │
│    ○ Extrato Bancário       │
│    ○ Conciliação            │
├─────────────────────────────┤
│  GESTÃO                     │
│    ○ Relatórios             │
│    ○ Documentos             │
│    ○ Importação             │
│    ○ Auditoria              │
│    ○ Usuários               │
└─────────────────────────────┘
```

### Mapeamento de rotas (atual → novo)

| Rota atual | Nova rota | Label atual | Label novo |
|------------|-----------|-------------|------------|
| `/cronograma` | `/cronograma` | Painel de Bordo | Cronograma de Caixa |
| `/painel-controle` | `/painel-controle` | Painel de Controle | Painel de Controle |
| `/compras` | `/wbs` | Compras (tab WBS) | WBS & Orçamento |
| `/compras` | `/compras` | Compras (tab Pedidos) | Pedidos |
| `/recepcao` | `/recepcao` | — (sem item de menu) | Recepção de NF |
| _(novo)_ | `/adiantamentos` | — | Adiantamentos |
| `/medicoes` → redirect | `/medicoes` | — | Medições |
| `/recebimentos` | `/recebimentos` | Recebimentos | Recebimentos |
| `/pagamentos` | `/pagamentos` | Pagamentos | Pagamentos |
| `/despesas-indiretas` | `/custos-indiretos` | Custos Indiretos | Custos Indiretos |
| `/mutuos` | `/capital-de-giro` | Capital de Giro | Capital de Giro |
| `/conciliacao` | `/extrato` | — (sem item de menu) | Extrato Bancário |
| `/conciliacao` | `/conciliacao` | Conciliação | Conciliação |
| `/avanco` | `/avanco` | Avanço Físico | _(mover para Gestão)_ |

---

## 3. Design de Cada Tela

### 3.1 Painel de Controle (`/painel-controle`)

**Propósito:** ponto de partida de qualquer sessão. Mostra o que está errado ou pendente e leva diretamente à origem.

Layout:
```
┌─────────────────────────────────────────────────────────────────┐
│ PAINEL DE CONTROLE                         [projeto: SFP ▾]     │
├─────────────────────────────────────────────────────────────────┤
│ ALERTAS CRÍTICOS (vermelho)                                      │
│ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐  │
│ │ 3 parcelas       │ │ 2 medições       │ │ 1 adiantamento   │  │
│ │ vencidas         │ │ liberadas sem    │ │ não abatido há   │  │
│ │ sem pagamento    │ │ parcela gerada   │ │ 45 dias          │  │
│ │ [→ Pagamentos]   │ │ [→ Medições]     │ │ [→ Adiantamentos]│  │
│ └──────────────────┘ └──────────────────┘ └──────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│ PENDÊNCIAS OPERACIONAIS (amarelo)                                │
│  ● 5 NFs em rascunho aguardando vinculação a pedido  [→ Recepção]│
│  ● 8 movimentações bancárias não conciliadas          [→ Extrato]│
│  ● 2 pedidos com status_entrega = parcial há > 30 dias [→ Pedidos]│
│  ● Saldo orçamentário negativo em 3 itens             [→ WBS]   │
├─────────────────────────────────────────────────────────────────┤
│ SAÚDE FINANCEIRA                                                 │
│  Orçado:    R$ 4.200.000  │  Comprometido: R$ 3.100.000         │
│  Consumido: R$ 2.750.000  │  Saldo livre:  R$ 1.100.000         │
│                                                                  │
│  Caixa atual: R$ 320.000  │  Projeção 30d: R$ 180.000           │
│  A receber:   R$ 450.000  │  A pagar 30d:  R$ 590.000           │
├─────────────────────────────────────────────────────────────────┤
│ PRÓXIMOS VENCIMENTOS (7 dias)                                    │
│  [tabela: parcela | fornecedor | valor | data | status]         │
│                                                                  │
│ PRÓXIMOS RECEBIMENTOS (7 dias)                                   │
│  [tabela: medição | valor | data_prevista | status]             │
└─────────────────────────────────────────────────────────────────┘
```

**Cada alerta é um deep-link** — clica e vai direto ao item problemático na tela de origem, já com o filtro aplicado.

---

### 3.2 Cronograma de Caixa (`/cronograma`)

**Propósito:** visão financeira temporal do projeto — linha do tempo de entradas e saídas.

Tabs:
- **Fluxo de Caixa** — gráfico + tabela diária/semanal/mensal (realizado + projetado)
- **Simulador** — cenários what-if
- **Cronograma Físico** — distribuição de etapas por quinzena

KPIs fixos no topo: saldo atual · projeção 30d · projeção 90d · déficit previsto (se houver)

---

### 3.3 WBS & Orçamento (`/wbs`)

**Propósito:** estrutura orçamentária do projeto. Tela de planejamento, raramente alterada em execução.

Tabs:
- **WBS** — árvore de etapas com valor orçado, consumido, saldo e % execução
- **Itens de Compra** — tabela detalhada por etapa com filtros
- **Overhead** — despesas indiretas com `etapa_id` vinculada à etapa Overhead

KPIs: orçamento total · consumido · saldo · % consumo · nº itens com saldo negativo

Ação primária: Exportar WBS · Importar WBS

---

### 3.4 Pedidos (`/compras`)

**Propósito:** gestão de pedidos de compra — da criação ao recebimento físico.

Tabs:
- **Pedidos** — lista com duplo status (entrega + pagamento), filtros por status
- **Itens do Pedido** — visão analítica de todos os itens de todos os pedidos

KPIs: pedidos em aberto · valor total comprometido · pedidos com entrega vencida · pedidos com pagamento vencido

Ações primárias: Novo Pedido · Exportar

Badge de alerta visível na tab "Pedidos com entrega vencida" e "Pedidos com pagamento vencido"

---

### 3.5 Recepção de NF (`/recepcao`)

**Propósito:** entrada e processamento de notas fiscais recebidas de fornecedores.

Fluxo visual na tela (stepper horizontal):
```
[1. Importar NF] → [2. Extrair Dados] → [3. Vincular ao Pedido] → [4. Confirmar Consumo] → [5. Gerar Parcelas]
```

Tabs:
- **Rascunhos** — NFs importadas aguardando vinculação (badge com contagem)
- **Processadas** — NFs confirmadas com pedido vinculado
- **Histórico** — log de todos os consumos

KPIs: NFs em rascunho · NFs processadas no mês · Valor total de NFs no mês

---

### 3.6 Adiantamentos (`/adiantamentos`)

**Propósito:** controle de pagamentos antecipados a fornecedores vinculados a pedidos.

Layout:
```
┌────────────────────────────────────────────────────────────┐
│ ADIANTAMENTOS                                               │
├────────────────────────────────────────────────────────────┤
│ KPIs: Total adiantado | Em aberto | Abatido | Risco        │
├────────────────────────────────────────────────────────────┤
│ Tabs: Pendentes de Abatimento | Abatidos | Todos           │
├────────────────────────────────────────────────────────────┤
│ Tabela: Fornecedor | Pedido | Valor | Data pgto |          │
│         Prazo abatimento | Status | Ação                   │
└────────────────────────────────────────────────────────────┘
```

Alerta automático: adiantamento sem abatimento após prazo configurável (padrão: 30 dias).

---

### 3.7 Medições (`/medicoes`)

**Propósito:** controle do faturamento — geração, aprovação e acompanhamento de medições.

Tabs:
- **Medições** — lista com status (futura, em medição, liberada, paga)
- **Parcelas de Recebimento** — cronograma detalhado de entradas por medição

KPIs: valor medido no mês · valor liberado · valor recebido · medições em atraso

Fluxo de status visível na tela:
```
[futura] → [em medição] → [liberada] → [paga]
                                ↓
                    (gera parcelas de recebimento)
```

---

### 3.8 Recebimentos (`/recebimentos`)

**Propósito:** cronograma de parcelas de recebimento (espelho das medições liberadas).

Idêntico ao modelo de Pagamentos, mas para entradas:
- Tabs: A Receber · Recebidos · Vencidos
- KPIs: a receber hoje · a receber 7d · a receber 30d · vencido

---

### 3.9 Pagamentos (`/pagamentos`)

**Propósito:** cronograma de parcelas de saída (pedidos + despesas indiretas).

Tabs:
- **A Pagar** — filtro padrão por data_prevista_pagamento (próximos 30d)
- **Vencidos** — badge com contagem
- **Pagos** — histórico

KPIs: a pagar hoje · a pagar 7d · a pagar 30d · vencido

Ação primária: Registrar Pagamento (abre dialog de conciliação rápida)

---

### 3.10 Custos Indiretos (`/custos-indiretos`)

**Propósito:** gestão de despesas indiretas do projeto.

Tabs:
- **Despesas** — lista com tipo (recorrente/pontual), status, valor
- **Parcelas** — cronograma de saídas geradas pelas despesas

KPIs: total previsto no mês · total pago · total a vencer · total vencido

---

### 3.11 Capital de Giro (`/capital-de-giro`)

**Propósito:** controle de mútuos, empréstimos e financiamentos.

Tabs:
- **Instrumentos** — lista de mútuos por tipo e status
- **Amortizações** — cronograma de pagamentos futuros
- **Captações** — entradas planejadas de novos instrumentos

KPIs: total captado ativo · total a amortizar 30d · taxa média ponderada

---

### 3.12 Extrato Bancário (`/extrato`)

**Propósito:** importação e visualização do extrato bancário antes da conciliação.

Tabs:
- **Não Conciliados** — movimentações sem match (badge com contagem)
- **Conciliados** — movimentações com origem identificada
- **Todos** — visão completa do extrato

Ação primária: Importar OFX · Conciliar selecionados

---

### 3.13 Conciliação (`/conciliacao`)

**Propósito:** match entre extrato e origens financeiras (parcelas, medições, mútuos, adiantamentos).

Fluxo visual:
```
[Selecionar movimentação] → [Sistema sugere match] → [Confirmar/Ajustar] → [Aprovar]
```

Tabs:
- **Sugeridas** — matches automáticos aguardando confirmação
- **Em Revisão** — confirmadas, aguardando aprovação
- **Aprovadas** — conciliação finalizada

---

## 4. Mudanças de Implementação (Sidebar)

### Arquivo a alterar: `src/components/layout/Sidebar.tsx`

Nova estrutura de `sections`:

```typescript
const sections = [
  {
    label: 'Visão Geral',
    items: [
      { to: '/painel-controle', icon: Gauge,         label: 'Painel de Controle' },
      { to: '/cronograma',      icon: CalendarRange,  label: 'Cronograma de Caixa' },
    ],
  },
  {
    label: 'Planejamento',
    items: [
      { to: '/wbs',             icon: LayoutList,     label: 'WBS & Orçamento' },
      { to: '/fornecedores',    icon: Building2,      label: 'Fornecedores' },
    ],
  },
  {
    label: 'Compras',
    items: [
      { to: '/compras',         icon: ShoppingCart,   label: 'Pedidos' },
      { to: '/recepcao',        icon: FileInput,      label: 'Recepção de NF' },
      { to: '/adiantamentos',   icon: HandCoins,      label: 'Adiantamentos' },
    ],
  },
  {
    label: 'Faturamento',
    items: [
      { to: '/medicoes',        icon: ClipboardList,  label: 'Medições' },
      { to: '/recebimentos',    icon: TrendingUp,     label: 'Recebimentos' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { to: '/pagamentos',      icon: CreditCard,     label: 'Pagamentos' },
      { to: '/custos-indiretos',icon: Building2,      label: 'Custos Indiretos' },
      { to: '/capital-de-giro', icon: Landmark,       label: 'Capital de Giro' },
    ],
  },
  {
    label: 'Caixa',
    items: [
      { to: '/extrato',         icon: FileText,       label: 'Extrato Bancário' },
      { to: '/conciliacao',     icon: ArrowLeftRight, label: 'Conciliação' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { to: '/relatorios',      icon: BarChart3,      label: 'Relatórios' },
      { to: '/avanco',          icon: TrendingUp,     label: 'Avanço Físico' },
      { to: '/documentos',      icon: FileText,       label: 'Documentos' },
      { to: '/importacao',      icon: Upload,         label: 'Importação' },
      { to: '/auditoria',       icon: Shield,         label: 'Auditoria' },
      { to: '/logs',            icon: Bug,            label: 'Logs' },
      { to: '/usuarios',        icon: Users,          label: 'Usuários' },
    ],
  },
]
```

---

## 5. Badges de Alerta na Navegação

Cada item de menu com pendências operacionais exibe um badge numérico vermelho ou amarelo:

| Item | Badge | Condição |
|------|-------|----------|
| Painel de Controle | vermelho | nº de alertas críticos ativos |
| Recepção de NF | amarelo | NFs em rascunho |
| Adiantamentos | vermelho | adiantamentos vencidos sem abatimento |
| Medições | amarelo | medições liberadas sem parcelas geradas |
| Recebimentos | vermelho | parcelas_recebimento vencidas |
| Pagamentos | vermelho | parcelas vencidas sem pagamento |
| Extrato Bancário | amarelo | movimentações não conciliadas |

Esses badges são calculados por um hook global `useAlertCounts` que roda em background, sem bloquear a navegação.

---

## 6. Padrão de Tela por Módulo

Toda tela segue o padrão Fleury:

```
┌────────────────────────────────────────────────────────────┐
│ PageHeader: título + subtitle + ações primárias            │
├────────────────────────────────────────────────────────────┤
│ KPI Cards (3-5 cards com os números mais importantes)      │
├────────────────────────────────────────────────────────────┤
│ Tabs (quando há sub-seções)                                │
├────────────────────────────────────────────────────────────┤
│ Filtros Accordion (colapsados por padrão em execução)      │
├────────────────────────────────────────────────────────────┤
│ Tabela sticky-header com paginação                         │
├────────────────────────────────────────────────────────────┤
│ BulkActionBar (aparece ao selecionar linhas)               │
└────────────────────────────────────────────────────────────┘
```

---

## 7. Prioridade de Implementação

### Fase 1 — Reorganização de Navegação (sem nova lógica)
1. Atualizar `Sidebar.tsx` com nova estrutura de seções
2. Adicionar rota `/recepcao` ao menu (já existe a página)
3. Criar redirect `/medicoes` → `/medicoes` (página própria)
4. Criar redirect `/despesas-indiretas` → `/custos-indiretos`
5. Criar redirect `/mutuos` → `/capital-de-giro`
6. Separar WBS do `ComprasPage` → nova rota `/wbs`

### Fase 2 — Novas Telas
7. Tela `/adiantamentos` (nova entidade)
8. Tab "Parcelas de Recebimento" em `MedicoesPage`
9. Tela `/extrato` separada de `/conciliacao`
10. Tela `/fornecedores` separada (hoje está embutida em Compras)

### Fase 3 — Badges e Alertas
11. Hook `useAlertCounts` com contagem de pendências
12. Badge na sidebar por item
13. Deep-links no Painel de Controle