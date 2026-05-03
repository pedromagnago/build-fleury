# Kit do Claude Project — Build Fleury

Cinco arquivos para configurar um Claude Project que vira assistente especialista em importação do Build Fleury.

## Como usar

1. **Crie um Project novo** em claude.ai → menu lateral → "Projects" → "Create project".
2. **Cole as instruções**: abra `00_INSTRUCOES_DO_PROJETO.md`, copie o conteúdo INTEIRO, cole no campo "Set custom instructions" do projeto.
3. **Suba os arquivos de conhecimento**: clique em "Add content" → faça upload dos 4 arquivos:
   - `01_TEMPLATES_CANONICOS.md`
   - `02_MAPA_DO_CODIGO.md`
   - `03_SNIPPETS_CRITICOS.md`
   - `04_RECEITAS_E_FAQ.md`
4. **Não suba o `00_*` como arquivo** — ele vai como instruções, não como knowledge.

## Atualização

Toda vez que mexer no código de import, atualize:

- `01_TEMPLATES_CANONICOS.md` — se mudou header, alias, validação ou mensagem de erro.
- `03_SNIPPETS_CRITICOS.md` — se mudou alguma das funções listadas.
- `02_MAPA_DO_CODIGO.md` — só se mudou estrutura de pastas/arquivos.

Substitua o arquivo no Project (botão de overwrite). O `00_*` raramente muda.

## Documento-fonte

A versão completa e exaustiva é `IMPORT_TEMPLATES_CANONICAL.md` na raiz do repo. O `01_*` deste kit é uma versão enxuta, otimizada para uso de runtime do agente.
