# Como configurar seu Assistente do Build Fleury no Claude

Olá! Este passo a passo te ajuda a montar um **assistente pessoal** dentro do Claude que conhece seu sistema (o Build Fleury) e te ajuda na hora de importar planilhas.

Você não precisa saber nada de técnica. É parecido com criar uma pasta com instruções: você joga uns arquivos lá dentro e pronto, o Claude usa eles para te responder.

**Tempo total**: cerca de 10 minutos.
**Você vai precisar de**:
- Um computador com navegador (Chrome, Firefox, Edge ou Safari).
- Uma conta no Claude (claude.ai). Se ainda não tem, crie agora — é grátis começar.
- A pasta `claude_project_kit` que recebeu junto com este guia (são 5 arquivos `.md`).

---

## Passo 1 — Entrar no Claude

1. Abra seu navegador e vá em **claude.ai**.
2. Faça login com seu e-mail e senha (ou conta Google).

> Se aparecer uma tela perguntando para escolher um plano, pode escolher "Free" para começar. Mais à frente, se precisar mais espaço, dá pra trocar para o pago.

---

## Passo 2 — Criar um "Projeto" novo

Pense num **Projeto** do Claude como uma "sala particular" onde você guarda umas instruções e arquivos. Toda vez que você conversar dentro dessa sala, o Claude vai lembrar do que está lá guardado.

1. Olhe na **barra do lado esquerdo** da tela.
2. Procure por **"Projects"** (ou "Projetos", se estiver em português). Pode estar com um ícone de pastinha 📁.
3. Clique em **"+ New project"** ou **"+ Novo projeto"** (botão azul ou roxo, geralmente no topo).

Vai abrir uma janelinha pedindo:

- **Project name** (nome do projeto): escreva **`Assistente Build Fleury`** (ou outro nome que faça sentido pra você).
- **Description** (descrição) — opcional: pode escrever algo simples como **`Me ajuda a importar planilhas no sistema`**.

Clique em **"Create project"**.

✅ Pronto, sua sala particular existe.

---

## Passo 3 — Colar as **Instruções do Projeto**

Agora vamos dizer ao Claude **como ele deve te tratar e o que ele faz**. Isso vai num campo separado, chamado "Custom instructions" (Instruções personalizadas).

1. Dentro do projeto que você acabou de criar, procure um botão chamado **"Set custom instructions"** ou **"Edit instructions"** (geralmente fica num quadrinho na parte de cima, com um ícone de lápis ✏️ ou engrenagem ⚙️).
2. Vai abrir uma caixa de texto grande, em branco.
3. Abra a pasta `claude_project_kit` no seu computador.
4. Localize o arquivo **`00_INSTRUCOES_DO_PROJETO.md`**.
5. Abra esse arquivo (clique duas vezes — vai abrir no Bloco de Notas, TextEdit, ou no editor que você tiver).
6. **Selecione TUDO** (atalho: `Ctrl + A` no Windows, `Cmd + A` no Mac).
7. **Copie** (`Ctrl + C` ou `Cmd + C`).
8. Volte ao Claude, clique dentro da caixa de instruções e **cole** (`Ctrl + V` ou `Cmd + V`).
9. Clique em **"Save"** ou **"Save instructions"**.

✅ As instruções estão salvas. O Claude já sabe que ele é "o assistente do Build Fleury".

> ⚠️ **Importante**: este arquivo `00_*` vai **só nas instruções**, não como anexo. Ele é diferente dos outros 4.

---

## Passo 4 — Anexar os arquivos de **conhecimento**

Os outros 4 arquivos (`01`, `02`, `03`, `04`) são a "biblioteca" do assistente — onde ele vai pesquisar quando você fizer uma pergunta.

1. Dentro do mesmo projeto, procure um botão chamado **"Add content"** ou **"Add files"** ou **"+ Add to project knowledge"** (pode ter um ícone de clipe 📎 ou de arquivo).
2. Vai abrir uma janela do seu computador.
3. Navegue até a pasta `claude_project_kit`.
4. Selecione os 4 arquivos:
   - `01_TEMPLATES_CANONICOS.md`
   - `02_MAPA_DO_CODIGO.md`
   - `03_SNIPPETS_CRITICOS.md`
   - `04_RECEITAS_E_FAQ.md`

   > Dica para selecionar os 4 de uma vez: clique no primeiro, segure `Shift`, clique no último.

5. Clique em **"Open"** ou **"Abrir"** ou **"Upload"**.
6. Espere uns 10-30 segundos enquanto o Claude lê os arquivos.

Você deve ver os 4 arquivos listados dentro do projeto, com nome e tamanho.

✅ A biblioteca está montada.

> ⚠️ **NÃO suba** o `00_INSTRUCOES_DO_PROJETO.md` aqui. Esse já foi colado no passo 3. Subir ele de novo aqui pode confundir o assistente.

---

## Passo 5 — Conversar com seu assistente

1. Ainda dentro do projeto, procure a caixa de mensagem na parte de baixo (igual a um chat normal).
2. **Teste**: digite algo simples como:

   > **`Olá, qual seu papel neste projeto?`**

3. Aperte Enter.
4. Em alguns segundos, o Claude vai te responder explicando que é seu assistente do Build Fleury.

Se a resposta veio coerente (mencionou "Build Fleury", "importação de planilhas", etc.), **deu certo!** ✅

Se a resposta foi genérica (tipo "Sou o Claude, te ajudo no que precisar"), provavelmente algum passo não pegou. Volte ao passo 3 e confira se as instruções foram salvas mesmo.

---

## Como usar no dia a dia

Toda vez que precisar:

- Abra **claude.ai**.
- No menu lateral, clique em **"Projects"** e abra **"Assistente Build Fleury"**.
- Faça sua pergunta na caixa de chat.

### Exemplos de perguntas que ele responde bem

- *"Olha aqui o cabeçalho da minha planilha de pedidos: ETAPA, ITEM, FORNECEDOR, QUANTIDADE DE CASAS, DATA DA ENTREGA, VALOR. Vai funcionar?"*
- *"Está dando erro `23505` quando tento importar etapas. O que é isso?"*
- *"Quero importar pagamentos antigos do banco. Qual aba do sistema eu uso?"*
- *"Por que minhas parcelas estão saindo com vencimento na sexta-feira em vez de sábado?"*
- *"O sistema reconhece a coluna 'Cód. Etapa' (com ponto) ou só 'Etapa Cód'?"*
- *"Quanto tempo o sistema dá para casar um pagamento com a parcela aberta?"*

### Como mandar uma planilha

Você **não precisa subir o arquivo** inteiro. Basta:

1. Abrir a planilha no Excel.
2. Selecionar as 3 primeiras linhas (incluindo o cabeçalho).
3. Copiar (`Ctrl+C`) e colar (`Ctrl+V`) no chat do Claude.

Ou, se preferir, descreva: *"a planilha tem as colunas X, Y e Z, e a primeira linha é..."*.

---

## Quando atualizar o assistente

Toda vez que o **Pedro/equipe técnica** te avisar que mudou alguma coisa no sistema, ele vai te mandar arquivos novos da pasta `claude_project_kit`. Quando isso acontecer:

1. Entre no seu projeto no Claude.
2. Encontre o arquivo antigo (ex.: `01_TEMPLATES_CANONICOS.md`).
3. **Apague** o antigo (botão de lixeirinha 🗑️ ao lado do nome).
4. Suba o novo (passo 4 acima, mas só com o arquivo que mudou).

Se o arquivo `00_INSTRUCOES_DO_PROJETO.md` mudar, repita o passo 3 (cole o conteúdo novo no campo de instruções, sobrescrevendo o antigo).

---

## Problemas comuns

### "O Claude está me respondendo coisas erradas"
- Confira se os 4 arquivos `01` a `04` aparecem listados dentro do projeto.
- Confira se as instruções (`00`) foram coladas no campo certo (Custom instructions), não como arquivo.
- Tente fechar a aba e abrir o Claude de novo.

### "Não acho o botão 'New project' ou 'Add content'"
- Você precisa estar logado. Verifique no canto superior direito se aparece seu nome ou e-mail.
- Em alguns planos gratuitos, o botão de Projects não aparece. Se for o caso, tente atualizar o plano para um pago, ou entre em contato com a equipe técnica para ver alternativas.

### "Subi um arquivo errado, como apagar?"
- Dentro do projeto, na lista de arquivos, passe o mouse em cima do nome. Vai aparecer um ícone de lixeirinha 🗑️ ou três pontinhos `⋮`. Clique e escolha "Delete" ou "Remove".

### "Aparece um erro 'file too large'"
- Os 4 arquivos do kit são pequenos (cada um tem menos de 50 KB). Se aparecer esse erro, pode ser problema de internet — tente de novo em 1 minuto.

### "O Claude diz que não viu os arquivos"
- Pergunte: *"Quais arquivos você tem disponível neste projeto?"*. Ele deve listar os 4. Se não aparecer nenhum, o upload falhou — refaça o passo 4.

---

## Resumo em 1 parágrafo

Cria um **Project** no Claude. **Cola** o conteúdo do arquivo `00_*` no campo de **instruções** desse projeto. **Sobe** os outros 4 arquivos (`01`, `02`, `03`, `04`) como **conteúdo do projeto**. Depois é só conversar dentro desse projeto sempre que tiver dúvida sobre importar planilha no Build Fleury.

---

## Precisa de ajuda?

Qualquer dificuldade em qualquer um dos passos, **mande uma mensagem para a equipe técnica** (Pedro). Manda um print da tela onde você travou — é o jeito mais rápido de resolver.

Boa sorte! 🚀
