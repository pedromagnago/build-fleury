# Build Fleury — Fluxos de Processos

> Mapa completo de todos os fluxos, ações e decisões da plataforma.
> Cada seção descreve: quem inicia, o que acontece, decisões automáticas e manuais, e o que é afetado.

---

## Sumário de fluxos

| # | Fluxo | Iniciado por | Frequência |
|---|---|---|---|
| 1 | Setup inicial do projeto | Supervisor | Uma vez |
| 2 | Importação de dados | Supervisor | Uma vez (+ reimportações) |
| 3 | Gestão do cronograma | Gestor de obra | Diário/semanal |
| 4 | Gestão de compras e pedidos | Gestor de obra / Operador | Diário |
| 5 | Geração automática de parcelas | Sistema | Automático |
| 6 | Upload e processamento de documentos (IA) | Gestor de obra | A cada NF/recibo |
| 7 | Auditoria de classificações da IA | Operador | Diário |
| 8 | Registro manual de pagamentos | Operador | Diário |
| 9 | Avanço físico da obra | Gestor de obra | Semanal |
| 10 | Medições contratuais (receitas) | Supervisor | Por medição |
| 11 | Conciliação bancária | Operador | Semanal |
| 12 | Simulação de cenários | Supervisor | Sob demanda |
| 13 | Dashboard e alertas | Sistema / Todos | Contínuo |
| 14 | Relatórios e exportações | Supervisor / Investidor | Quinzenal |
| 15 | Configurações e administração | Supervisor | Sob demanda |

---

## Fluxo 1 — Setup inicial do projeto

**Quem:** Supervisor
**Quando:** Primeiro acesso ao sistema
**Rota:** `/configuracoes` → `/importacao`

```
Supervisor acessa /configuracoes
    │
    ├── Preenche dados do projeto
    │     Nome, município, estado, qtd casas, área por casa
    │     Data início obras, saldo inicial de caixa
    │     Faturamento contrato, custo total contrato
    │
    ├── Cadastra contas bancárias
    │     Nome, banco, agência, conta, saldo inicial
    │
    ├── Convida usuários
    │     Email + role (super_admin / supervisor / operador / cliente)
    │     → Sistema envia convite via Supabase Auth
    │     → Usuário cria senha no primeiro acesso
    │
    ├── Configura limiares
    │     Desvio orçamentário para alerta (%)
    │     Saldo mínimo de caixa para alerta (R$)
    │     Dias de atraso para alerta
    │
    └── Configura IA
          Score mínimo para fila (default: 0.40)
          Score para auto-aprovação (default: 0.95)
          Auto-aprovação ativa? (default: desligado)
          Máximo de exemplos de correção no prompt (default: 20)
```

**Saída:** Projeto pronto para receber dados.

---

## Fluxo 2 — Importação de dados

**Quem:** Supervisor
**Quando:** Após setup, antes de operar
**Rota:** `/importacao`

```
Supervisor acessa /importacao
    │
    ├── Aba "Cronograma"
    │     Upload de planilha Excel ou CSV
    │     → Sistema detecta separador e encoding
    │     → Preview em tabela dos dados parseados
    │     → Validação: campos obrigatórios, tipos, datas
    │     → SE erros → mostra lista de erros por linha
    │     → SE ok → botão "Importar"
    │     → Cria registros em: etapas + cronograma_distribuicao
    │     → Log de importação salvo
    │
    ├── Aba "Itens de compra"
    │     Upload de planilha de compras
    │     → Mesma mecânica de preview + validação
    │     → Vincula cada item à etapa pelo código
    │     → Cria registros em: fornecedores + itens_compra
    │     → SE fornecedor não existe → cria automaticamente
    │
    ├── Aba "Pedidos"
    │     Upload de pedidos planejados (lotes por medição)
    │     → Vincula ao item de compra + fornecedor
    │     → Cria registros em: pedidos
    │     → DISPARA: geração automática de parcelas (Fluxo 5)
    │
    ├── Aba "Medições"
    │     Upload ou cadastro manual das medições contratuais
    │     → Número, valor planejado, data prevista
    │     → Vincula etapas à medição (quais etapas liberam qual medição)
    │
    └── Aba "Orçamento executivo" (opcional)
          Upload do orçamento de composição detalhado
          → Serve como referência de valores orçados por casa
          → Alimenta validações e comparativos
```

**Saída:** Base completa do projeto carregada. Dashboard começa a mostrar dados.

### Reimportação

```
Supervisor escolhe "Reimportar" em qualquer aba
    │
    ├── Sistema avisa: "Isso substituirá os dados atuais. Deseja continuar?"
    │
    ├── SE sim:
    │     → Cria snapshot do estado atual (audit_log)
    │     → Soft-delete dos registros existentes
    │     → Importa novos dados
    │     → Recalcula todas as views materializadas
    │
    └── SE não: cancela
```

---

## Fluxo 3 — Gestão do cronograma

**Quem:** Gestor de obra
**Quando:** Sempre que houver mudança de datas na obra
**Rota:** `/cronograma`

### 3.1 Visualização

```
Usuário acessa /cronograma
    │
    └── Sistema exibe Gantt simplificado
          Linhas = etapas de obra (30+)
          Colunas = semanas/dias
          Barras = período de execução (planejado vs real)
          Marcos verticais = medições contratuais
          Cor da barra:
            Verde = no prazo (data_fim_real <= data_fim_plan)
            Amarelo = em risco (avanço < esperado)
            Vermelho = atrasado (data_fim_plan < hoje e não concluído)
            Cinza = futuro (não iniciado)
```

### 3.2 Alterar data de uma etapa (cascata)

```
Gestor arrasta barra de uma etapa para nova data
    │
    ├── Sistema calcula impacto ANTES de salvar:
    │     Quantos pedidos serão afetados?
    │     Quantas parcelas terão nova data de vencimento?
    │     Qual o delta no fluxo de caixa?
    │     Alguma medição é impactada?
    │
    ├── Exibe painel de impacto "Antes vs Depois"
    │     Lista de parcelas afetadas com data antiga → data nova
    │     Fluxo de caixa: mini-gráfico comparativo
    │     SE saldo fica negativo em algum dia → alerta vermelho
    │
    ├── Gestor confirma? 
    │     │
    │     ├── SIM:
    │     │     → Atualiza etapa (data_inicio_plan, data_fim_plan)
    │     │     → Recalcula data_entrega_prevista de todos os pedidos da etapa
    │     │     → Recalcula data_vencimento de todas as parcelas desses pedidos
    │     │     → Refresh da view v_fluxo_caixa_projetado
    │     │     → Registra no audit_log (antes/depois, quem, quando)
    │     │     → SE etapa tem dependentes (depende_de)
    │     │           → Alerta: "Etapa X depende desta. Deseja propagar?"
    │     │           → SE sim: cascata recursiva nas dependentes
    │     │
    │     └── NÃO: descarta alteração
    │
    └── Atualiza visual do Gantt em tempo real
```

### 3.3 Expandir etapa (ver detalhes)

```
Gestor clica em etapa para expandir
    │
    └── Exibe sub-linhas:
          ├── MATERIAL: lista de itens com valor total e fornecedor
          ├── MÃO DE OBRA: lista de itens com valor total e fornecedor
          └── EQUIPAMENTO: lista de itens com valor total
          
          Cada sub-linha mostra: valor orçado │ valor consumido │ saldo
          Link para ir à tela de compras filtrada por essa etapa
```

---

## Fluxo 4 — Gestão de compras e pedidos

**Quem:** Gestor de obra / Operador
**Quando:** Ao planejar compras, enviar pedidos, registrar entregas
**Rota:** `/compras`

### 4.1 Visualização e filtros

```
Usuário acessa /compras
    │
    └── Tabela de itens agrupada por etapa
          Filtros: etapa, fornecedor, tipo (material/mão de obra/equip.), status
          Busca por nome do item ou fornecedor
          
          Para cada item:
            Código │ Descrição │ Tipo │ Unidade
            Qtd total │ Custo unit. orçado │ Valor total orçado
            Fornecedor │ Condição de pagamento
            Valor consumido │ Saldo disponível │ % consumido
            
          Expansão do item mostra pedidos:
            Pedido 1: casas X, qtd Y, valor Z, data entrega, status
            Pedido 2: ...
```

### 4.2 Editar item de compra

```
Usuário edita fornecedor, preço ou condição de pagamento
    │
    ├── SE muda fornecedor:
    │     → Atualiza fornecedor do item
    │     → SE fornecedor não existe → modal para cadastrar novo
    │     → Registra no audit_log
    │
    ├── SE muda preço unitário:
    │     → Recalcula valor_total_orcado (qtd × novo preço)
    │     → Recalcula valor_saldo
    │     → Recalcula valor_total_orcado da etapa
    │     → Refresh de v_orcado_vs_realizado
    │     → Registra no audit_log
    │
    └── SE muda condição de pagamento:
          → Recalcula data_vencimento de TODAS as parcelas futuras desse item
          → Refresh de v_fluxo_caixa_projetado
          → Registra no audit_log
```

### 4.3 Criar novo pedido

```
Usuário clica "Novo pedido" no item
    │
    ├── Preenche: casas do lote, preço negociado, data entrega prevista
    │
    ├── Sistema calcula: qtd_lote = qtd_por_casa × casas_lote
    │                     valor_total = qtd_lote × valor_unitario
    │
    ├── Salva pedido com status "planejado"
    │
    └── DISPARA: geração automática de parcelas (Fluxo 5)
```

### 4.4 Registrar envio de pedido

```
Usuário marca pedido como "enviado"
    │
    → Muda status: planejado → pedido_enviado
    → Registra data de envio
    → Registra no audit_log
```

### 4.5 Registrar entrega

```
Usuário marca pedido como "entregue"
    │
    ├── Informa data_entrega_real
    ├── SE data_entrega_real ≠ data_entrega_prevista:
    │     → Recalcula parcelas com base na data REAL de entrega
    │     → Alerta: "Entrega X dias antes/depois do previsto"
    │
    ├── Muda status: pedido_enviado → entregue
    └── Registra no audit_log
```

### 4.6 Visão por fornecedor

```
Usuário ativa filtro "Agrupar por fornecedor"
    │
    └── Para cada fornecedor:
          Nome │ CNPJ │ Condição padrão
          Total de itens │ Valor total de compras
          Próximas parcelas a vencer (data + valor)
          Histórico de entregas (no prazo vs atrasadas)
```

### 4.7 Curva ABC

```
Usuário acessa aba "Curva ABC"
    │
    └── Ranking de itens por valor total decrescente
          Item │ Etapa │ Valor total │ % do total │ % acumulado │ Classe (A/B/C)
          
          Classe A = itens que somam até 80% do valor total
          Classe B = próximos 15%
          Classe C = últimos 5%
          
          Gráfico de Pareto: barras + linha acumulada
```

---

## Fluxo 5 — Geração automática de parcelas

**Quem:** Sistema (automático)
**Quando:** Ao criar pedido, alterar condição de pagamento, ou alterar data de entrega
**Gatilho:** INSERT ou UPDATE em `pedidos`

```
Pedido criado ou atualizado
    │
    ├── Sistema parseia a condição de pagamento
    │     Exemplos:
    │       "30/60"      → 2 parcelas: entrega+30d, entrega+60d
    │       "28/56/84"   → 3 parcelas: entrega+28d, entrega+56d, entrega+84d
    │       "0/17"       → 2 parcelas: na entrega, entrega+17d
    │       "49"          → 1 parcela: entrega+49d
    │       "à vista"     → 1 parcela: na data de entrega
    │
    ├── Calcula valor de cada parcela
    │     valor_parcela = valor_total_pedido / numero_de_parcelas
    │     (arredondamento: última parcela absorve centavos restantes)
    │
    ├── Calcula data de cada parcela
    │     data_vencimento = data_entrega_prevista + dias_da_condição
    │     SE data cai em sábado → move para sexta
    │     SE data cai em domingo → move para segunda
    │
    ├── SE já existem parcelas para este pedido:
    │     → Remove parcelas com status "futura" (não pagas)
    │     → Mantém parcelas já pagas intactas
    │     → Gera novas parcelas apenas para o saldo
    │
    ├── Insere parcelas na tabela `parcelas`
    │
    └── Refresh de v_fluxo_caixa_projetado
```

---

## Fluxo 6 — Upload e processamento de documentos (IA)

**Quem:** Gestor de obra (ou Operador)
**Quando:** Ao receber NF, recibo, pedido de compra, comprovante
**Rota:** `/documentos`

### 6.1 Upload

```
Usuário acessa /documentos → clica "Upload"
    │
    ├── Seleciona arquivo(s): PDF, imagem (JPG/PNG), XML NF-e
    │     Validação: tipo permitido, tamanho máximo (configurável)
    │
    ├── Arquivo salvo no Supabase Storage
    │     Path: /documents/{company_id}/{ano}/{mes}/{filename}
    │
    ├── Registro criado na tabela `documentos`
    │     status = "recebido"
    │
    └── DISPARA: Edge Function "process-document" (assíncrono)
```

### 6.2 Processamento pela IA (Edge Function)

```
Edge Function "process-document" recebe documento_id
    │
    ├── ETAPA 1 — Extração (OCR + OpenAI API)
    │     │
    │     ├── Baixa arquivo do Storage
    │     ├── SE PDF/imagem → envia como documento para OpenAI API
    │     ├── SE XML NF-e → parseia XML diretamente (sem IA)
    │     │
    │     ├── Prompt de extração pede JSON estruturado:
    │     │     tipo_documento, fornecedor (razão, CNPJ),
    │     │     valor_total, data_emissão, data_vencimento,
    │     │     condição_pagamento, itens [{descrição, qtd, unidade, valor}]
    │     │
    │     ├── SE extração falha ou dados muito incompletos:
    │     │     → status = "erro"
    │     │     → erro_detalhe = "Extração falhou: [motivo]"
    │     │     → FIM (documento vai para revisão manual)
    │     │
    │     └── Atualiza status: "recebido" → "processando"
    │
    ├── ETAPA 2 — Classificação (OpenAI API + contexto)
    │     │
    │     ├── Busca lista de etapas do projeto
    │     ├── Busca lista de itens_compra com fornecedores e valores
    │     ├── Busca últimas 20 correções de auditoria (few-shot)
    │     │
    │     ├── Prompt de classificação recebe:
    │     │     Dados extraídos + etapas + itens + exemplos de correção
    │     │     Pede: etapa_id, item_compra_id, justificativa, score (0-1)
    │     │
    │     ├── SE score < 0.40 (limiar mínimo configurável):
    │     │     → Classificação rejeitada automaticamente
    │     │     → status_auditoria = "rejeitado_ia"
    │     │     → Documento fica disponível para classificação manual
    │     │
    │     └── Retorna: etapa, item, score, justificativa
    │
    ├── ETAPA 3 — Match com orçamento
    │     │
    │     ├── Query SQL busca itens de compra que correspondam:
    │     │     WHERE etapa_id = proposta AND tipo = proposta AND valor_saldo > 0
    │     │
    │     ├── SE múltiplos candidatos:
    │     │     → Segundo prompt OpenAI API para desempate
    │     │     → Critérios: similaridade de descrição, fornecedor, valor próximo
    │     │
    │     ├── SE nenhum candidato:
    │     │     → score reduzido para 0.30
    │     │     → justificativa = "Nenhum item orçamentário encontrado"
    │     │     → Vai para fila de auditoria como "sem match"
    │     │
    │     └── Localiza pedido correspondente (mesmo item + fornecedor + datas próximas)
    │
    ├── ETAPA 4 — Cálculo de saldo e score final
    │     │
    │     ├── valor_orcado_item = item_compra.valor_total_orcado
    │     ├── valor_ja_consumido = item_compra.valor_consumido
    │     ├── valor_saldo_antes = valor_orcado - valor_consumido
    │     ├── valor_saldo_depois = valor_saldo_antes - valor_extraido
    │     │
    │     ├── SE valor_saldo_depois < 0:
    │     │     → Alerta: "Documento ultrapassa saldo do item"
    │     │     → Score reduzido em 0.20
    │     │
    │     └── Score final = média ponderada(extração, classificação, match, saldo)
    │
    ├── Insere registro em `classificacoes_ia`
    │
    ├── DECISÃO: auto-approve?
    │     │
    │     ├── SE auto-approve ativo E score >= limiar:
    │     │     → status_auditoria = "aprovado"
    │     │     → DISPARA: ação pós-aprovação (Fluxo 7, ação "Aprovar")
    │     │
    │     └── SE não:
    │           → status_auditoria = "pendente"
    │           → Notifica operador (badge na tela de auditoria)
    │
    └── Atualiza documento: status = "classificado"
```

### 6.3 Documentos com múltiplos itens

```
SE documento tem itens que pertencem a etapas diferentes:
    │
    ├── IA separa por etapa/tipo
    ├── Gera uma classificação para cada grupo de itens
    ├── Todas as classificações ficam vinculadas ao mesmo documento_id
    └── Na fila de auditoria, aparecem agrupadas com indicador "1 de 3", "2 de 3"...
```

---

## Fluxo 7 — Auditoria de classificações da IA

**Quem:** Operador financeiro
**Quando:** Sempre que há itens pendentes na fila
**Rota:** `/auditoria`

### 7.1 Tela da fila

```
Operador acessa /auditoria
    │
    ├── Indicadores no topo:
    │     Pendentes │ Aprovadas (30d) │ Taxa acerto │ Score médio
    │
    ├── Tabela com classificações:
    │     Filtros: status, score, fornecedor, etapa, data
    │     Ordenação: mais antiga primeiro (FIFO)
    │     Destaque verde: score >= 0.85 (alta confiança)
    │     Destaque amarelo: score 0.50-0.84 (média confiança)
    │     Destaque vermelho: score 0.40-0.49 (baixa confiança)
    │
    └── Clique em item abre painel de revisão
```

### 7.2 Revisão de uma classificação

```
Operador abre classificação
    │
    ├── LADO ESQUERDO: documento original
    │     Preview do PDF/imagem
    │     Dados extraídos pela IA em destaque
    │
    ├── LADO DIREITO: proposta da IA
    │     Fornecedor extraído │ CNPJ │ Valor
    │     Etapa proposta │ Item de compra proposto │ Pedido proposto
    │     Score │ Justificativa da IA
    │     Saldo antes → saldo depois
    │
    ├── AÇÃO 1: Aprovar
    │     │
    │     ├── Confirma que a classificação está correta
    │     ├── Sistema executa ação pós-aprovação:
    │     │     1. Localiza parcela correspondente
    │     │        (pedido + fornecedor + valor próximo + data próxima)
    │     │     2. SE parcela encontrada:
    │     │          → Registra pagamento (data_pagamento_real, valor_pago)
    │     │          → Vincula comprovante (storage_path)
    │     │          → Atualiza status parcela: a_vencer → paga
    │     │     3. SE parcela NÃO encontrada:
    │     │          → Cria nova parcela "avulsa" vinculada ao item
    │     │          → Status: paga
    │     │     4. Atualiza item_compra.valor_consumido += valor
    │     │     5. Recalcula item_compra.valor_saldo
    │     │     6. Refresh v_fluxo_caixa_projetado + v_orcado_vs_realizado
    │     │     7. Registra no audit_log
    │     │
    │     └── Classificação: status = "aprovado", auditado_por, auditado_em
    │
    ├── AÇÃO 2: Corrigir
    │     │
    │     ├── Operador edita campos:
    │     │     Etapa (dropdown) │ Item de compra (dropdown filtrado pela etapa)
    │     │     Valor │ Fornecedor │ Data
    │     │
    │     ├── Sistema salva correções em JSONB `correcoes`
    │     │     { campo: { de: "valor_antigo", para: "valor_novo" } }
    │     │
    │     ├── Correção é registrada para feedback loop da IA
    │     │     → Próximas classificações usam essa correção como exemplo
    │     │
    │     └── Após corrigir → mesmo fluxo de "Aprovar" com dados corrigidos
    │
    └── AÇÃO 3: Rejeitar
          │
          ├── Motivo obrigatório (texto livre)
          ├── Classificação: status = "rejeitado"
          ├── Documento volta para status "recebido" (pode ser reclassificado)
          └── Registra no audit_log
```

---

## Fluxo 8 — Registro manual de pagamentos

**Quem:** Operador
**Quando:** Ao efetuar ou confirmar um pagamento sem documento via IA
**Rota:** `/pagamentos`

### 8.1 Pagar parcela existente

```
Operador acessa /pagamentos
    │
    ├── Filtra por: a_vencer, vencidas, por fornecedor, por etapa
    │
    ├── Seleciona parcela → clica "Registrar pagamento"
    │     │
    │     ├── Preenche: data pagamento, valor pago, forma (PIX/boleto/cartão)
    │     ├── Seleciona conta bancária de origem
    │     ├── Upload de comprovante (opcional)
    │     │
    │     ├── SE valor_pago = valor_parcela:
    │     │     → Pagamento total
    │     │     → Status parcela: paga
    │     │
    │     ├── SE valor_pago < valor_parcela:
    │     │     → Pagamento parcial
    │     │     → Saldo da parcela = valor - valor_pago
    │     │     → Status: parcialmente_paga
    │     │
    │     └── SE valor_pago > valor_parcela:
    │           → Alerta: "Valor excede a parcela. Confirma?"
    │           → SE sim: registra (pode ser juros/multa)
    │
    ├── Atualiza item_compra.valor_consumido
    ├── Recalcula valor_saldo
    ├── Cria movimentação bancária na conta selecionada
    ├── Refresh v_fluxo_caixa + v_orcado_vs_realizado
    └── Registra no audit_log
```

### 8.2 Criar pagamento avulso (sem parcela prévia)

```
Operador clica "Novo pagamento"
    │
    ├── Preenche: fornecedor, valor, data, etapa, item, descrição
    ├── Seleciona conta bancária
    ├── Upload de comprovante
    │
    ├── Sistema cria parcela "avulsa" já com status paga
    ├── Vincula ao item de compra (atualiza consumido/saldo)
    ├── Cria movimentação bancária
    └── Registra no audit_log
```

### 8.3 Agenda de pagamentos

```
Operador acessa aba "Agenda"
    │
    └── Visualização por período:
          Hoje: parcelas vencendo hoje
          Esta semana: próximos 7 dias
          Este mês: próximos 30 dias
          
          Para cada dia: lista de parcelas com fornecedor, valor, etapa
          Total do dia │ Total da semana │ Total do mês
          
          Saldo projetado após todos os pagamentos do período
          SE saldo fica negativo → alerta visual vermelho
```

---

## Fluxo 9 — Avanço físico da obra

**Quem:** Gestor de obra
**Quando:** Semanalmente (frequência configurável)
**Rota:** `/avanco`

### 9.1 Registrar avanço

```
Gestor acessa /avanco
    │
    ├── Grid: etapas nas linhas × medições nas colunas
    │     Cada célula: meta (casas) / real (casas)
    │     Cores: verde (atingiu) │ amarelo (em andamento) │ vermelho (atrasado) │ cinza (futuro)
    │
    ├── Seleciona etapa → informa casas concluídas
    │     │
    │     ├── SE requer foto (configurável): upload obrigatório
    │     ├── Campo de observações (opcional)
    │     │
    │     ├── Sistema calcula:
    │     │     percentual = casas_concluidas / casas_total
    │     │
    │     ├── SE percentual >= meta de alguma medição:
    │     │     → Verifica se TODAS as etapas vinculadas à medição atingiram a meta
    │     │     → SE sim: medição muda para "em_medicao" (pronta para solicitar)
    │     │     → Notifica supervisor: "Medição X pode ser solicitada"
    │     │
    │     ├── SE avanço atrasado vs cronograma:
    │     │     → Calcula projeção de quando a meta será atingida
    │     │     → SE projeção ultrapassa data da medição:
    │     │           → Alerta: "Medição X em risco de atraso"
    │     │           → Impacto no fluxo: receita da medição pode atrasar
    │     │
    │     └── Registra no audit_log
    │
    └── Atualiza status das etapas automaticamente
          Cálculo baseado em: data_inicio_real, avanço, data_fim_plan
```

### 9.2 Alerta de inatividade

```
Sistema verifica periodicamente (pg_cron diário):
    │
    ├── Para cada etapa com status "em_andamento":
    │     │
    │     └── SE último registro de avanço > X dias (configurável):
    │           → Gera alerta: "Etapa Y sem atualização há Z dias"
    │           → Notifica gestor de obra
    │
    └── Para cada etapa com status "futuro" que já deveria ter iniciado:
          → Gera alerta: "Etapa Y deveria ter iniciado em DD/MM"
```

---

## Fluxo 10 — Medições contratuais (receitas)

**Quem:** Supervisor
**Quando:** Quando medição atinge condições de liberação
**Rota:** `/medicoes`

```
Supervisor acessa /medicoes
    │
    ├── Cards por medição:
    │     Número │ Valor planejado │ Data prevista │ Status
    │     Barra de progresso: % das etapas vinculadas concluídas
    │
    ├── Clicar em medição → detalhe:
    │     Lista de etapas vinculadas com meta vs real
    │     SE todas as metas atingidas → botão "Solicitar medição"
    │
    ├── Solicitar medição:
    │     → Status: futura → em_medicao
    │     → Registra data de solicitação
    │
    ├── Registrar liberação:
    │     │
    │     ├── Informa: data_liberacao, valor_liberado
    │     │
    │     ├── SE valor_liberado = valor_planejado:
    │     │     → Liberação total
    │     │
    │     ├── SE valor_liberado < valor_planejado:
    │     │     → Liberação parcial (glosa)
    │     │     → Registra diferença
    │     │     → Alerta: "Medição X teve glosa de R$ Y"
    │     │
    │     ├── Status: em_medicao → liberada
    │     ├── Cria movimentação bancária (entrada)
    │     ├── Refresh v_fluxo_caixa_projetado
    │     └── Registra no audit_log
    │
    └── Registrar recebimento (quando $ cai na conta):
          → Status: liberada → paga
          → Informa data e conta bancária
          → Atualiza saldo da conta
```

---

## Fluxo 11 — Conciliação bancária

**Quem:** Operador
**Quando:** Semanalmente
**Rota:** `/conciliacao`

```
Operador acessa /conciliacao
    │
    ├── Seleciona conta bancária
    │
    ├── Upload de extrato (CSV/OFX)
    │     → Sistema parseia: data, descrição, valor, tipo (débito/crédito)
    │     → Registra em movimentacoes_bancarias com conciliado = false
    │
    ├── Match automático:
    │     │
    │     ├── Para cada linha do extrato:
    │     │     Busca parcela com:
    │     │       valor = valor_extrato (tolerância ±R$0,50)
    │     │       data_pagamento_real próxima da data_extrato (±3 dias)
    │     │       mesma conta bancária
    │     │
    │     ├── SE match único encontrado:
    │     │     → Concilia automaticamente
    │     │     → movimentacao.conciliado = true
    │     │     → Vincula à parcela
    │     │
    │     ├── SE múltiplos matches:
    │     │     → Marca como "possível match" para revisão manual
    │     │
    │     └── SE nenhum match:
    │           → Marca como "não conciliado"
    │
    ├── Revisão manual dos não conciliados:
    │     Operador vincula manualmente extrato ↔ parcela
    │     OU marca como "sem correspondência" (ex: tarifa bancária)
    │
    ├── Ajuste de saldo:
    │     SE saldo do sistema ≠ saldo do extrato:
    │       → Operador registra ajuste com motivo
    │       → Cria registro em ajustes_saldo
    │
    └── Resumo:
          Conciliados: X │ Pendentes: Y │ Divergentes: Z
          Saldo sistema │ Saldo extrato │ Diferença
```

---

## Fluxo 12 — Simulação de cenários

**Quem:** Supervisor
**Quando:** Antes de tomar decisão financeira
**Rota:** `/simulador`

```
Supervisor acessa /simulador
    │
    ├── Cenário "Base" (gerado automaticamente):
    │     Fluxo de caixa com todas as parcelas e medições no prazo atual
    │
    ├── Criar novo cenário:
    │     Nome │ Descrição
    │     → Copia dados do cenário base
    │
    ├── Editar cenário (lado esquerdo da tela):
    │     │
    │     ├── Lista de parcelas futuras (editáveis):
    │     │     Cada linha: fornecedor │ valor │ data │ etapa
    │     │     Ações inline:
    │     │       Arrastar data (calendário)
    │     │       Editar valor
    │     │       Parcelar (dividir em N parcelas)
    │     │       Remover (cancelar compra)
    │     │
    │     ├── Lista de medições futuras (editáveis):
    │     │     Cada linha: número │ valor │ data
    │     │     Ação: adiar data
    │     │
    │     └── Código de cores:
    │           Azul = valor original │ Verde = alterado neste cenário
    │
    ├── Gráfico de fluxo de caixa (lado direito, atualizado em tempo real):
    │     Eixo X: dias/semanas
    │     Eixo Y: saldo acumulado
    │     Linha vermelha pontilhada: saldo zero
    │     Cards: saldo mínimo │ data do pior dia │ dias com saldo negativo
    │
    ├── Comparar cenários:
    │     Seleciona 2+ cenários
    │     Gráfico com linhas sobrepostas:
    │       Base (cinza tracejado) │ Cenário A (azul) │ Cenário B (verde)
    │     Tabela comparativa de métricas:
    │       Saldo mínimo │ Dias negativos │ Pior data │ Custo total
    │
    └── Cenários NÃO afetam o planejamento real
          São apenas projeções para tomada de decisão
```

---

## Fluxo 13 — Dashboard e alertas

**Quem:** Sistema (automático) / Todos (visualização)
**Quando:** Contínuo
**Rota:** `/dashboard` + `/notificacoes`

### 13.1 Refresh de dados

```
pg_cron dispara refresh de views materializadas:
    │
    ├── A cada 15 minutos:
    │     v_fluxo_caixa_projetado
    │     v_orcado_vs_realizado
    │
    ├── A cada hora:
    │     v_curva_s
    │     v_indicadores_evm
    │
    └── Ao alterar dados (trigger):
          Qualquer UPDATE em parcelas, pedidos, medicoes, avancos
          → Marca views como "stale"
          → Próximo acesso ao dashboard dispara refresh sob demanda
```

### 13.2 Geração automática de alertas

```
Sistema verifica periodicamente:
    │
    ├── Parcelas vencidas não pagas
    │     → Alerta severidade "alta"
    │     → "Parcela de R$ X para [Fornecedor] venceu em DD/MM"
    │
    ├── Saldo projetado negativo
    │     → Alerta severidade "crítica"
    │     → "Saldo ficará negativo (R$ -X) em DD/MM"
    │
    ├── Desvio orçamentário acima do limiar
    │     → Alerta severidade "alta"
    │     → "Etapa X consumiu Y% do orçado (limiar: Z%)"
    │
    ├── Medição em risco (avanço abaixo da meta)
    │     → Alerta severidade "média"
    │     → "Medição X em risco: Y% da meta atingida"
    │
    ├── Etapa atrasada
    │     → Alerta severidade "média"
    │     → "Etapa X atrasada em Y dias"
    │
    ├── Classificação IA pendente há muito tempo
    │     → Alerta severidade "baixa"
    │     → "X documentos aguardando auditoria há mais de 24h"
    │
    └── Cronograma desatualizado
          → Alerta severidade "baixa"
          → "Cronograma não é editado há X dias"
```

### 13.3 Notificações

```
Alerta gerado
    │
    ├── Badge no sino do header (contagem de não lidos)
    │
    ├── SE configurado email:
    │     → Envia email para os roles configurados
    │
    └── Página /notificacoes:
          Lista de alertas com: tipo │ severidade │ mensagem │ data │ lido/não lido
          Filtros por tipo e severidade
          Ação: marcar como lido │ ir para tela relacionada
```

---

## Fluxo 14 — Relatórios e exportações

**Quem:** Supervisor / Investidor
**Quando:** Quinzenal ou sob demanda
**Rota:** `/relatorios`

```
Usuário acessa /relatorios
    │
    ├── Relatório: Fluxo de caixa
    │     Período selecionável
    │     Tabela: data │ entradas │ saídas │ saldo
    │     Gráfico: saldo acumulado
    │     Exportar: Excel │ PDF
    │
    ├── Relatório: Orçado × Realizado
    │     Por etapa: orçado │ consumido │ saldo │ %
    │     Por fornecedor: total comprado │ total pago │ pendente
    │     Exportar: Excel │ PDF
    │
    ├── Relatório: Contas a pagar
    │     Filtro por status, fornecedor, período
    │     Total por período │ Total por fornecedor
    │     Exportar: Excel │ PDF
    │
    ├── Relatório: Avanço físico
    │     Etapa │ Meta │ Real │ % │ Previsão de conclusão
    │     Gráfico de barras empilhadas
    │     Exportar: Excel │ PDF
    │
    ├── Relatório: Medições
    │     Número │ Valor │ Status │ Data prevista │ Data real │ Glosa
    │     Exportar: Excel │ PDF
    │
    └── Relatório: Investidor
          Resumo executivo: custo contrato, faturamento, resultado
          Fluxo de aportes vs recebimentos
          Projeção de retorno
          Exportar: PDF (formatado para apresentação)
```

---

## Fluxo 15 — Configurações e administração

**Quem:** Supervisor
**Rota:** `/configuracoes`

### 15.1 Dados do projeto

```
Editar: nome, município, casas, área, data início, saldo, faturamento, custo
    → Recalcula indicadores dependentes
    → Registra no audit_log
```

### 15.2 Usuários

```
Convidar: email + role
    → Supabase Auth envia convite
    → Ao aceitar, user_roles é criado
    
Alterar role: dropdown de roles
Desativar: user_roles.active = false (soft)
Ver log de ações: link para audit_log filtrado pelo usuário
```

### 15.3 Condições de pagamento

```
Cadastrar condições padrão (ex: "30/60/90", "28/56/84", "à vista")
    → Disponíveis como dropdown em itens de compra e pedidos
    
Vincular condição padrão a fornecedor
    → Ao criar pedido com esse fornecedor, preenche automaticamente
```

### 15.4 Limiares e alertas

```
Desvio orçamentário para alerta: slider 0-100%
Saldo mínimo de caixa: campo numérico
Dias de atraso para alerta no cronograma: campo numérico
Dias máximos na fila de auditoria: campo numérico
Notificações por email: toggle por tipo de alerta
```

### 15.5 Configuração da IA

```
Score mínimo para fila: slider 0-1 (default: 0.40)
Score para alta confiança: slider 0-1 (default: 0.85)
Score para auto-aprovação: slider 0-1 (default: 0.95)
Auto-aprovação ativa: toggle (default: desligado)
Exemplos de correção no prompt: toggle + limite numérico
Tipos de arquivo aceitos: checkboxes (PDF, JPG, PNG, XML)
Tamanho máximo por arquivo: campo numérico (MB)

Indicadores exibidos:
  Taxa de acerto (30d) │ Score médio │ Top erros
```

### 15.6 Medições

```
Cadastrar/editar medições:
  Número │ Valor planejado │ Data prevista │ Etapas vinculadas
  
Para cada etapa vinculada: meta de casas concluídas (%) para liberar
```

---

## Mapa de acesso por role

| Fluxo / Tela | Cliente | Operador | Supervisor | Super admin |
|---|---|---|---|---|
| Dashboard | Simplificado | Completo | Completo | Completo |
| Cronograma | Somente leitura | Somente leitura | Editar | Editar |
| Compras | Somente leitura | Editar | Editar | Editar |
| Pagamentos | — | Editar | Editar | Editar |
| Upload documentos | Enviar | Enviar | Enviar | Enviar |
| Auditoria IA | — | Auditar | Auditar | Auditar |
| Avanço físico | Registrar | Registrar | Registrar | Registrar |
| Medições | — | — | Gerenciar | Gerenciar |
| Conciliação | — | Operar | Operar | Operar |
| Simulador | — | — | Criar/editar | Criar/editar |
| Relatórios | Limitado | Gerar | Gerar | Gerar |
| Importação | — | — | Importar | Importar |
| Configurações | — | — | Parcial | Total |
| Notificações | Próprias | Próprias | Todas | Todas |

---

## Glossário de termos

| Termo | Significado |
|---|---|
| Etapa | Fase da obra (ex: Fundação Radier, Paredes, Cobertura) |
| Item de compra | Material, mão de obra ou equipamento vinculado a uma etapa |
| Pedido | Lote de compra de um item (ex: 32 casas, entrega em 15/04) |
| Parcela | Pagamento individual gerado a partir de um pedido + condição de pagamento |
| Medição | Receita contratual liberada ao atingir metas físicas |
| Condição de pagamento | Prazo em dias após a entrega (ex: 30/60 = 2 parcelas) |
| Cascata | Propagação automática: data da etapa → pedidos → parcelas → fluxo |
| Score de confiança | Nota 0-1 da IA sobre a certeza da classificação |
| Auto-approve | Aprovação automática quando score >= limiar configurável |
| Saldo remanescente | Orçado - Consumido = valor que ainda pode ser gasto |
| CFF | Cronograma físico-financeiro: integra etapas, custos e datas |
| EVM | Earned Value Management: indicadores SPI, CPI, EAC |
| Curva S | Gráfico acumulado de planejado vs realizado ao longo do tempo |
| Curva ABC | Ranking de itens por valor: A=80%, B=15%, C=5% |
| Cenário | Simulação hipotética sem afetar dados reais |
| Conciliação | Verificação extrato bancário vs parcelas registradas |
| Few-shot | Exemplos de correções anteriores injetados no prompt da IA |
