# Manual de Uso e Resumo Executivo: Plataforma Build Fleury

## Bem-vindo(a)!
Este é o seu guia rápido e prático para operar, interagir e extrair o máximo do sistema **Build Fleury**.
O sistema funciona através do perfeito casamento entre: **Avanço Físico (Engenharia) × Contatos e Gastos (Compras/Pagamentos) × Faturamento (Medições da Caixa)**.

Leia este documento com o sistema aberto e vá acompanhando como se fosse um "Tour" guiado.

---

## Passo 1: Acessando e Selecionando a Obra
1. O Build Fleury é multi-projeto, ou seja, suas informações ficam retidas apenas dentro da construção específica onde você navega.
2. Na tela inicial (**Project Selector**), o sistema perguntará em qual Obra/Projeto você deseja trabalhar (ex. "Residencial XPTO").
3. Clique em **Acessar Obra** para entrar na visão focada unicamente nesse projeto.

---

## Passo 2: O Coração do Negócio - "Cronograma (Orçamento/WBS)"
Tudo no sistema orbita a sua árvore de serviços. Vamos começar mapeando ela.

* **Onde ir:** Menu Lateral `Planejamento` > `Cronograma`.
* **Como testar:**
  - Este é o WBS (Work Breakdown Structure). A estrutura é baseada em "Sanfonas" (Acordeão). Você tem `Capítulos` -> `Subcapítulos` -> `Itens (Serviços)`. Clique nas linhas para abrir a malha da obra e ir afunilando seu detalhamento.
  - Visualize que cada "Serviço" possui um **Orçamento Base** e também um **Faturamento Acumulado (Distribuído entre casas)**. Esta é a meta física de sua obra, que servirá de base.

---

## Passo 3: Criando as Despesas e Distribuições - "Compras"
As compras aqui não são planilhas soltas de "comprar cimento", elas amarram o Custo no seu Cronograma no mesmo minuto em que a Ordem de Compra surge.

* **Onde ir:** Menu Lateral `Operação` > `Pedidos de Compra`.
* **Como testar:**
  - Clique em **Novo Pedido**. Adicione o Fornecedor.
  - Na aba de "Itens", adicione o que está contratando (Ex: Tijolo, Concreto). 
  - **O detalhe genial:** Embaixo do Item, acesse a  **"Distribuição Analítica"**. Vincule aquele gasto diretamente a um Serviço do Cronograma que acessamos acima. 
  - Você pode testar mudar os status: O Pedido nasce em "Cotação", vai para "Em Aprovação" e ao ir para "Aprovado", a Conta a Pagar dele passa a ser um compromisso financeiro real na empresa.

---

## Passo 4: O Fluxo de Saída - "Contas a Pagar e Mútuos"
* **Onde ir:** Menu Lateral `Financeiro` > `Contas a Pagar`.
* **Como testar:**
  - Perceba que o Pedido do "Passo 3" já gerou, automaticamente, as faturas no tempo estipulado.
  - Modifique as **datas e status** de uma conta ou altere seu valor nominal. Essa tabela é o pulsar das saídas financeiras da Construtora.

---

## Passo 5: As Entradas - "Medições e Importação CEF"
É hora de ver o dinheiro do banco entrar contra o avanço das suas obras.

* **Onde ir:** Menu Lateral `Financeiro` > `Medições`.
* **Como testar:**
  - A aba de medições abandonou o conceito "preencher uma meta estática no valor X". Ela lista **exatamente o que compõe aquele lote financeiro** com a caixa.
  - **Expanda a medição:** Clique em qualquer bloco (Medição 1, Medição 2) e observe a sanfona abrir exibindo a granularidade (quantas casas, em qual etapa e por que valor foram medidas).
  - Explore as ações em lote da barra inferior. Selecione várias caixinhas (`checkbox`) e simule **Mudar as datas e os status**. 
  - Status como "Paga" removem do simulador a incerteza - ou seja, esse dinheiro passa a contar pelo Saldo Inicial.

---

## Passo 6: A Obra Prima - "Simulador de Fluxo de Caixa"
Toda essa alimentação dos passos 2 a 5 correm para aqui e ajudam a garantir que a tesouraria sobreviva aos desencontros naturais das datas de uma grande construção de obras financiadas. 

* **Onde ir:** Menu Lateral `Inteligência / Previsibilidade` > `Simulador de Caixa`.
* **Como testar MÁGICO e Validar o Software:** 
  1. Veja na curva do gráfico de liquidez ou na tabela mês a mês a projeção de Caixa da sua Obra, juntando seus "Pagamentos programados" - "Próximas Medições a Receber".
  2. Mantenha em mente (ou tire "print") de como está o mês de **Outubro** no gráfico. 
  3. **Simulando um Caos:** Vá nas "Medições" (Passo 5) e pegue uma medição gorda que "cairia em Outubro", atrase-a intencionalmente para **Dezembro** (mudando a data dela para lá e Salvando).
  4. Retorne ao **Simulador**. A magia ocorreu: Todo o rombo financeiro do mês e o fluxo foi redesenhado mostrando exatamente onde faltará caixa em Outubro pela obra ter atrasado.
  5. Você poderá fazer o mesmo na aba das despesas: Puxando uma conta grande a pagar para mais tarde e reequilibrando a balança.

---

## Dicas Finais para Uso Avançado
- **Efeito Borboleta:** Tudo está atrelado. Mexer em algo no `Cronograma` muda indicadores em outras páginas. Atrasar uma Medição que está no status  `Futura`  reconstrói as visões de previsão para investidores no simulador.
- Use a **Dashboard** (Página Inicial da Obra logada) para checar a saúde "A Faturar", "Custo Embutido", etc.
- A Plataforma é feita para simular realidades antes que ela sufoque a construtora. Explore, atrase as coisas de propósito, veja os relógios andarem de forma integrada e bons testes!
