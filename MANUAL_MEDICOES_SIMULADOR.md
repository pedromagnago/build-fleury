# Manual de Uso: Gestão de Medições e Simulador de Receitas (Build Fleury)

Bem-vindo ao novo módulo analítico de Medições e Simulação de Caixa Comercial. Este guia ajudará você a interagir, testar e utilizar todas as novas funcionalidades que trazem granularidade de nível de serviço para as medições de faturamento.

---

## 1. Módulo de Medições (Faturamento)

A nova página de Medições foi totalmente remodelada. Antes, ela atuava como um repositório de valores globais. Agora, ela espelha o fluxo de `Pedidos`, agindo como uma central analítica onde cada medição contém os serviços (etapas) que a compõem.

### 1.1 Navegando na Interface

1. **Acesse Menu Lateral > Operação > Medições.**
2. Você verá um painel com os KPIs principais (Cena atualizada):
   - **Receita Serviços:** O total liberado (faturado) para recebimento.
   - **% Físico Médio:** O status médio de avanço físico.
3. As medições aparecerão listadas. **Clique em qualquer medição para expandi-la (efeito "accordion/sanfona").**
   - Ao expandir, você verá a visão analítica.
   - Serão exibidos todos os serviços (etapas) vinculados àquela medição, incluindo Metas de Casas, Total de Casas Realizadas e o Valor Faturado.

### 1.2 Importação da Planilha da Caixa (CEF)

A base de toda essa visão analítica nasce do cronograma da Caixa:

1. **Botão de Importação:** No canto superior direito, clique em "Importar Distribuição (CEF)".
2. **Seleção de Arquivo:** Escolha a planilha padrão da CEF (a mesma utilizada no importador de composição).
3. **Mágica:** O sistema de forma autônoma fará a conexão (match) dos serviços pelo nome. Ele irá atualizar a etapa e gravar no banco de dados a divisão correta de cada medição (tabela `cronograma_distribuicao`).

### 1.3 Ações em Lote (Bulk Actions)

Se precisar simular impactos rapidamente direto na gestão ou corrigir status:

1. **Selecionar:** Clique nos "checkboxes" situados ao lado de cada uma das medições exibidas. A barra flutuante aparecerá no rodapé.
2. **Mover Datas:** Clique na opção "Mover para..." e modifique a data de previsão de pagamento em bloco de todas as medições selecionadas.
3. **Mudar de Status:** Atualize o ciclo de vida da medição marcando o novo status:
   - `Futura` (ainda aguardando período)
   - `Em Medição` (sendo aferida pelo setor responsável)
   - `Liberada` (autorizada pela CEF/Cliente, virou dinheiro quase garantido)
   - `Paga` (o valor já caiu na conta)

> **Regra de Ouro:** Medições com status "Paga" param de refletir nas projeções futuras do Simulador, pois entende-se que esse caixa já compõe o seu saldo inicial na conta corrente.

---

## 2. Simulador (Fluxo de Caixa)

O simulador também acompanhou o salto tecnológico! Ele deixou de calcular receitas baseadas no valor cheio planejado da medição. Agora, ele cruza os dados com as "Distribuições" (serviços previstos para cada parcela de pagamento).

### 2.1 Como interagir e testar

1. **Acesse Menu Lateral > Simulação (Fluxo de Caixa).**
2. Se existirem medições e cronogramas de distribuição amarrados (`cronograma_distribuicao` com valores `> 0`), o Simulador vai lê-los imediatamente.
3. **Lista Analítica:** 
   - No painel da esquerda do simulador, onde são simuladas as entradas (Receitas), você agora verá que as linhas não são apenas "Medição 1". 
   - Você verá as linhas exibidas como `M1 — Serviço X` ou `M4 — Serviço de Pintura`, representando perfeitamente a granularidade real.
4. **Impacto Instantâneo:** 
   - Qualquer atraso da medição na aba de medição impacta as dezenas ou centenas de serviços correspondentes e suas entradas de receita no gráfico simultaneamente.

---

## 3. Roteiro Passo-a-Passo de Teste

Quer garantir que está tudo perfeito? Siga este roteiro:

1. Suba uma tabela CEF no botão "Importar" na aba Medições.
2. Observe que as Medições do 1 a 8 apareceram, gerando os valores corretos no KPI.
3. Expanda uma medição clicando nela e verifique se as linhas internas abrem corretamente mostrando casas realizadas vs. planejadas.
4. Selecione uma das medições que tenha, digamos, previsão de Receita em Maio. Mude a data da medição inteira para Junho usando a Barra Inferior (Lote).
5. Mude a aba para a página do "Simulador".
6. Observe o fluxo. As barras do gráfico e a linha do saldo de caixa final deverão ter refletido perfeitamente o atraso daquela receita para Junho, tudo contabilizado serviço a serviço!

### Checklist de Erros (O que checar em caso de problema?)
- As etapas (serviços) devem ter `nomes` similares/iguais à base do excel para que o sistema consiga linkar automaticamente.
- O campo "Faturamento ($)" no Cronograma deve possuir um valor, caso nulo/zero o simulador vai tratar como Entrada de `R$ 0,00`.

**Divirta-se!** A plataforma agora opera com precisão cirúrgica de nível de serviço!
