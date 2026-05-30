# Plano do Painel de Controle — Build Fleury

> O Painel de Controle é a única tela que um gestor precisa ver ao abrir a ferramenta. Ele mostra o que está errado, o que está pendente e quanto dinheiro existe. Cada item leva diretamente à tela e ao registro que precisa de ação.

---

## 1. Diagnóstico do Painel Atual

O `PainelControlePage` atual já possui estrutura sólida em auditoria técnica:

| Seção existente | Qualidade | Limitação |
|-----------------|-----------|-----------|
| Grade de Integridade por Origem | Excelente | Não cobre adiantamentos; linka para a tela genérica, não ao item específico |
| Auditoria Contábil (3 equações) | Excelente | Mantém |
| Rastreabilidade Bancária | Bom | Só aparece se há problema; sem contagem visível |
| InconsistenciasTable | Bom | Não diferencia crítico de advertência |
| KPI Cards macro (recolhíveis) | Suficiente | Escondidos por padrão — informação importante demais para ser colapsada |
| Breakdown por tipo de custo | Bom | Adiantamentos não aparecem como categoria própria |
| GapInspectorDrawer | Bom | Drawer, não deep-link direto ao registro |
| **Faltando** | — | Alertas operacionais de próximos vencimentos |
| **Faltando** | — | Saldo de caixa atual + projeção 30d |
| **Faltando** | — | Adiantamentos não abatidos |
| **Faltando** | — | Parcelas de recebimento vencidas |
| **Faltando** | — | Contagem de badges por módulo |

---

## 2. Estrutura Proposta do Painel

O painel deve ter **3 zonas fixas de leitura sequencial**:

```
ZONA 1 — AGORA (O que está errado e o que vence em 7 dias)
ZONA 2 — INTEGRIDADE (Cada real tem representação completa no FC?)
ZONA 3 — CUSTO DO PROJETO (Onde estamos financeiramente no projeto)
```

---

## 3. Zona 1 — Alertas e Urgências

### 3.1 Bloco de Alertas Críticos

Severidade **vermelha** — bloqueiam o fechamento financeiro ou representam risco imediato:

| Alerta | Fonte | Deep-link |
|--------|-------|-----------|
| Parcelas de pedido vencidas sem pagamento | `parcelas WHERE status = 'vencida' AND pedido_id IS NOT NULL` | `/pagamentos?filtro=vencidas` |
| Parcelas de recebimento vencidas | `medicao_parcelas WHERE status = 'vencida'` | `/recebimentos?filtro=vencidas` |
| Adiantamentos sem abatimento > 30 dias | `adiantamentos WHERE status != 'abatido' AND data_pagamento < hoje-30d` | `/adiantamentos?filtro=em-aberto` |
| Movimentações não conciliadas > 15 dias | `movimentacoes WHERE conciliado = false AND data < hoje-15d` | `/extrato?filtro=nao-conciliadas` |
| Saldo orçamentário negativo em itens de compra | `itens_compra WHERE valor_saldo < 0` | `/wbs?filtro=saldo-negativo` |

### 3.2 Bloco de Pendências Operacionais

Severidade **amarela** — precisam de ação mas não são urgentes:

| Pendência | Fonte | Deep-link |
|-----------|-------|-----------|
| NFs em rascunho aguardando vinculação | `recepcao_docs WHERE status = 'rascunho'` | `/recepcao?tab=rascunhos` |
| Medições liberadas sem parcelas de recebimento geradas | `medicoes WHERE status = 'liberada' AND id NOT IN (SELECT medicao_id FROM medicao_parcelas)` | `/medicoes?filtro=sem-parcelas` |
| Pedidos com entrega vencida | `pedidos WHERE status_entrega != 'entregue' AND data_entrega_prevista < hoje` | `/compras?filtro=entrega-vencida` |
| Pedidos sem condição de pagamento (sem parcelas) | `pedidos WHERE status != 'cancelado' AND id NOT IN (SELECT pedido_id FROM parcelas)` | `/compras?filtro=sem-parcelas` |
| Despesas indiretas ativas sem parcela futura | `despesas_indiretas WHERE ativo = true AND id NOT IN (SELECT despesa_indireta_id FROM parcelas WHERE status != 'paga')` | `/custos-indiretos?filtro=sem-parcela` |

### 3.3 Bloco: Saldo e Projeção de Caixa

KPIs sempre visíveis no topo da Zona 1 (não recolhíveis):

```
┌─────────────────┬──────────────────┬──────────────────┬──────────────────┐
│  Saldo Atual    │  A Receber 30d   │  A Pagar 30d     │  Posição Líquida │
│  R$ 320.000     │  R$ 450.000      │  R$ 590.000      │  − R$ 140.000    │
│  [conta X + Y]  │  [3 medições]    │  [12 parcelas]   │  [déficit!]      │
└─────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

A **Posição Líquida** = Saldo Atual + A Receber 30d − A Pagar 30d.
- Se negativa → alerta crítico ("déficit de caixa em 30 dias")
- Se positiva → informativo verde

### 3.4 Bloco: Próximos Vencimentos (7 dias)

Duas tabelas compactas lado a lado:

**Saídas (próximos 7 dias)**
```
Data  | Fornecedor          | Valor      | Origem    | Ação
----  | ------              | ------     | ------    | ----
02/06 | Multiplex Estruturas| R$ 45.000  | Pedido #12| [Pagar]
03/06 | Energia Elétrica    | R$ 2.300   | Indireto  | [Pagar]
05/06 | Banco Itaú (mútuo)  | R$ 18.000  | Mútuo #3  | [Pagar]
```

**Entradas (próximos 7 dias)**
```
Data  | Cliente             | Valor      | Origem      | Ação
----  | ------              | ------     | ------      | ----
04/06 | CEF — Medição 4     | R$ 180.000 | Med. parc 1 | [Confirmar]
07/06 | CEF — Medição 4     | R$ 90.000  | Med. parc 2 | [Confirmar]
```

---

## 4. Zona 2 — Integridade por Origem

### Manter o componente `OrigemIntegridadeGrid` existente, com duas adições:

**Nova linha: Adiantamentos**
```typescript
{
  label: 'Adiantamentos',
  sublabel: 'saídas vinculadas a pedido',
  dot: 'bg-orange-500',
  route: '/adiantamentos',
  inspectKey: 'adiantamentos',
  registrado: totalAdiantamentos,
  noFC: adiantamentosComDataPagamento,
  gap: adiantamentosGap,
  gapNote: 'adiantamentos sem data de pagamento → invisíveis ao FC',
  severity: adiantamentosGap > 0.5 ? 'gap' : 'ok',
}
```

**Nova linha: Recebimentos (Medição → Parcelas)**
```typescript
{
  label: 'Recebimentos (med. → parcelas)',
  sublabel: 'entradas estruturadas',
  dot: 'bg-teal-500',
  route: '/recebimentos',
  inspectKey: 'medicao_parcelas',
  registrado: medicoesLiberadasTotal,
  noFC: medicoesComParcelas,
  gap: medicoesLiberadasSemParcela,
  gapNote: 'medições liberadas sem parcelas de recebimento geradas',
  severity: medicoesLiberadasSemParcela > 0.5 ? 'gap' : 'ok',
}
```

### Deep-links diretos (melhoria dos links existentes)

O botão "Inspecionar" atual abre um Drawer. Adicionar ao lado um botão "Ir à origem" que navega para a tela com filtro pré-aplicado:

```
[Inspecionar ↗]  [→ Compras (filtro: sem parcelas)]
```

---

## 5. Zona 3 — Custo do Projeto

### Manter o breakdown existente, com ajustes:

**Tornar os KPI Cards sempre visíveis** (remover o toggle `showMacro`). A auditoria macro não deve ser escondida — ela é a razão de existir da tela.

**Adicionar linha "Adiantamentos" na tabela de Conciliação 3 Fontes:**
```
🤝 Adiantamentos    |  previsto: R$ X  |  real: R$ Y
```

**Ajustar nomenclatura do Capital de Giro:**
- Separar "Capital de Giro" (mútuos de entrada) de "Adiantamentos Feitos" (mutuos categoria=adiantamento_feito) na tabela de breakdown
- Hoje estão misturados na subtração `isAdiFeito()` — expor isso visualmente

**Adicionar linha de Margem do Projeto:**
```
Receita (medições planejadas): R$ 8.200.000
Custo Total do Projeto:        R$ 6.100.000
─────────────────────────────────────────
Margem Bruta:                  R$ 2.100.000  (25,6%)
Margem Atual (realizado):      R$ 450.000    (real pago vs real recebido)
```

---

## 6. Hook `useAlertCounts` (Novo)

Hook global que alimenta os badges da sidebar e as contagens do Painel:

```typescript
interface AlertCounts {
  // Críticos (vermelho)
  parcelasVencidas: number          // pagamentos
  recebimentosVencidos: number      // recebimentos
  adiantamentosEmRisco: number      // adiantamentos
  movimentacoesAntigas: number      // extrato
  itensComSaldoNegativo: number     // wbs

  // Pendências (amarelo)
  nfsRascunho: number               // recepcao
  medicoesLiberadasSemParcela: number // medicoes
  pedidosEntregaVencida: number     // compras
  pedidosSemParcelas: number        // compras
  despesasSemParcela: number        // custos-indiretos

  // Totais derivados
  totalCriticos: number
  totalPendencias: number
}
```

**Estratégia de performance:** o hook roda com `staleTime: 60_000` (1 minuto) e não bloqueia a navegação. Os badges da sidebar são atualizados em segundo plano.

---

## 7. Seção de Adiantamentos no Painel (Nova)

Dentro da Zona 2 (ou como seção própria), bloco específico de adiantamentos:

```
┌──────────────────────────────────────────────────────────────┐
│ ADIANTAMENTOS A FORNECEDORES                                  │
│ Total adiantado: R$ 85.000  |  Abatido: R$ 45.000            │
│ Em aberto: R$ 40.000        |  Risco (> 30 dias): R$ 20.000  │
├──────────────────────────────────────────────────────────────┤
│ Fornecedor A  |  Pedido #5   |  R$ 20.000  |  45 dias  |  ⚠️ │
│ Fornecedor B  |  Pedido #8   |  R$ 20.000  |  12 dias  |  ✓  │
└──────────────────────────────────────────────────────────────┘
```

---

## 8. Plano de Implementação

### Fase 1 — Sem nova entidade (melhoria do existente)

| Item | Arquivo | Esforço |
|------|---------|---------|
| Tornar KPI Cards sempre visíveis | `PainelControlePage.tsx` | Baixo |
| Adicionar Zona 1: Saldo + Projeção 30d | `PainelControlePage.tsx` + `useCashFlowEvents` | Médio |
| Adicionar Zona 1: Alertas Críticos | `PainelControlePage.tsx` + queries diretas | Médio |
| Adicionar Zona 1: Próximos Vencimentos 7d | `PainelControlePage.tsx` | Médio |
| Deep-links diretos (além do Drawer) | `OrigemIntegridadeGrid` | Baixo |
| Hook `useAlertCounts` | `src/hooks/useAlertCounts.ts` | Médio |
| Badges na sidebar | `Sidebar.tsx` + `useAlertCounts` | Baixo |
| Adicionar margem do projeto | `PainelControlePage.tsx` | Baixo |

### Fase 2 — Após criação das novas entidades

| Item | Depende de | Arquivo |
|------|-----------|---------|
| Linha "Adiantamentos" na Grade de Integridade | Tabela `adiantamentos` | `PainelControlePage.tsx` |
| Linha "Recebimentos" na Grade de Integridade | Tabela `medicao_parcelas` | `PainelControlePage.tsx` |
| Bloco de Adiantamentos na Zona 2 | Tabela `adiantamentos` | `PainelControlePage.tsx` |
| Alertas de adiantamentos em risco | Tabela `adiantamentos` | `useAlertCounts.ts` |
| Alerta "medições liberadas sem parcelas" | Tabela `medicao_parcelas` | `useAlertCounts.ts` |
| Atualizar Conciliação 3 Fontes com adiantamentos | Tabela `adiantamentos` | `PainelControlePage.tsx` |

---

## 9. Regra de Ouro do Painel

**Cada número é clicável e leva à origem exata do problema.**

Nunca mostrar um valor de gap sem um link que leva ao(s) registro(s) que compõem aquele gap. O painel não é relatório — é central de comando. O usuário deve conseguir ir de "R$ 45.000 em parcelas vencidas" direto para a lista das 3 parcelas vencidas específicas, com o botão "Pagar" disponível.

Hierarquia de severidade visual:
- 🔴 **Vermelho** — bloqueia o fechamento; ação imediata
- 🟡 **Amarelo** — pendência operacional; ação nos próximos dias
- 🟢 **Verde** — OK, informativo
- ⚫ **Cinza** — histórico, sem ação necessária

---

## 10. Checklist de Verificação — Painel Completo

O painel está completo quando responder "sim" a todas estas perguntas sem sair da tela:

- [ ] Qual é o saldo de caixa hoje?
- [ ] O projeto vai ter déficit nos próximos 30 dias?
- [ ] Quais parcelas vencem esta semana?
- [ ] Há NFs que ainda não foram vinculadas a pedidos?
- [ ] Algum adiantamento a fornecedor está sem retorno?
- [ ] Alguma medição foi liberada mas ainda não tem parcelas de recebimento?
- [ ] Todos os pagamentos feitos têm movimentação conciliada no banco?
- [ ] Algum item de compra ultrapassou o orçamento?
- [ ] Quanto de margem bruta o projeto tem projetado?
- [ ] As equações contábeis (Eq A, B, C) estão fechadas?
