# Briefing de Posicionamento — Landing Build Fleury

**Objetivo do documento:** alinhar público, concorrência, promessa central e keywords-âncora **antes** de definir estrutura e copy da landing. Tudo aqui é hipótese inicial baseada no PRD; campos marcados com `[CONFIRMAR]` precisam de validação do Pedro.

---

## 1. Quem compra (ICP — Ideal Customer Profile)

### 1.1 Empresa-alvo
- **Setor:** construção civil — incorporadoras e construtoras de obras verticais e horizontais.
- **Porte:** pequeno e médio (5 a 50 obras simultâneas, faturamento R$ 5M–R$ 200M/ano). `[CONFIRMAR]`
- **Maturidade digital:** já saiu da planilha, mas o ERP atual (ou Sienge, ou nada) não conecta cronograma com financeiro.
- **Gatilho de compra:**
  - Estouro recente de orçamento numa obra.
  - Auditoria/investidor cobrando previsibilidade de fluxo de caixa.
  - Time financeiro afogado em digitação de NF/recibo.
  - Troca de gestor/sócio querendo profissionalizar controle.

### 1.2 Personas (decisão e uso)

| Persona | Papel na compra | Dor principal | O que precisa ouvir |
|---|---|---|---|
| **Sócio/Diretor** | Decisor econômico | "Não sei se a obra vai dar prejuízo até a obra acabar" | Previsibilidade, ROI, redução de risco |
| **Gerente financeiro / CFO** | Decisor técnico | Retrabalho diário, dado velho, conciliação manual | Automação, integração, auditoria |
| **Gestor de obra / engenheiro** | Usuário diário | Cronograma vive numa planilha, financeiro noutra | UX simples, mobile, foto vira lançamento |
| **Operador financeiro** | Usuário diário | Digita NF/recibo um por um | IA classifica, ele só audita |

**Decisor primário da landing:** Sócio + Gerente financeiro (eles começam a busca). Gestor de obra entra na demo.

---

## 2. Quem somos contra (posicionamento competitivo — April Dunford)

### 2.1 Alternativas que o cliente considera

| Alternativa | Como o cliente pensa | Onde perde |
|---|---|---|
| **Planilha (Excel/Sheets)** | "Tá funcionando, custa zero" | Cronograma e financeiro vivem separados; sem auditoria; sem multi-usuário sério |
| **Sienge** | Líder de mercado, ERP completo | Caro, implantação longa (meses), pesado para construtora pequena, cronograma físico fraco |
| **Mobuss / Obra Prima / Construct App** | Foco em obra (cronograma, RDO, app de campo) | Financeiro raso, sem cascata cronograma → fluxo de caixa |
| **Vobi** | Reformas/arquitetura, design bonito | Não atende construtora de incorporação, foco residencial pequeno |
| **ERP genérico (Omie, Bling, Conta Azul)** | Barato, fácil | Não entende obra (etapa, EAP, medição), nada de cronograma |

### 2.2 Categoria onde competimos
**Não somos:** "ERP de construtora" (perde pra Sienge na percepção).
**Somos:** **"Plataforma de controle orçamentário de obras com cronograma como fonte única da verdade"** — categoria nova, ancorada no benefício de *ver o futuro do fluxo de caixa em tempo real*.

### 2.3 Diferenciais defensáveis (features → valor)
1. **Cascata cronograma → pedidos → parcelas → fluxo de caixa** — único no mercado nesse nível de integração. `[CONFIRMAR vs Sienge]`
2. **IA com auditoria humana obrigatória** — extrai NF/recibo, propõe lançamento, financeiro só aprova.
3. **Implantação rápida** — sem migração de ERP, começa pela próxima obra. `[CONFIRMAR prazo real: 7 dias? 30 dias?]`
4. **Multi-tenant com RLS em 100% das tabelas** — argumento de segurança/LGPD pesado pra investidor.
5. **Conformidade NBR 16636 + PMBOK + EVM** — vira selo de seriedade técnica.

---

## 3. Promessa central (one-liner)

Três opções pra escolher/combinar:

**A. Foco no medo (Sócio):**
> Saiba hoje se a obra vai estourar o orçamento — não daqui a 3 meses.

**B. Foco no ganho operacional (CFO):**
> O cronograma da obra atualiza o fluxo de caixa sozinho. O financeiro só audita.

**C. Foco na categoria (posicionamento):**
> A primeira plataforma onde mover uma data no cronograma já recalcula compras, pagamentos e fluxo de caixa.

**Recomendação:** **C como H1** (define categoria) + **A como sub-headline** (ativa o medo). B vira seção de benefícios.

`[CONFIRMAR voz da marca: mais técnica/sóbria ou mais provocativa?]`

---

## 4. Mensagens por objeção

| Objeção | Resposta na landing |
|---|---|
| "Vou ter que migrar tudo do Sienge/planilha?" | "Comece pela próxima obra. Migração só quando você quiser." |
| "Quanto tempo de implantação?" | "Primeira obra rodando em 7 dias." `[CONFIRMAR]` |
| "IA erra. Vou confiar?" | "IA propõe, humano aprova. Nada vira definitivo sem auditoria." |
| "Preço?" | Página dedicada ou faixa pública (a definir). Recomendo **faixa pública** — reduz fricção. `[DECIDIR]` |
| "LGPD / segurança?" | Multi-tenant com RLS, audit log em tudo, soft delete. Selo visível. |
| "Funciona no celular do mestre de obra?" | Sim — foto de NF vira lançamento. `[CONFIRMAR escopo mobile real]` |

---

## 5. Keywords-âncora (SEO)

Pesquisa preliminar — volumes a confirmar com Keyword Planner / Ahrefs.

### 5.1 Transacionais (foco da landing)
| Keyword | Intenção | Prioridade |
|---|---|---|
| software de gestão de obras | Comparação | Alta |
| sistema controle orçamentário construtora | Comparação | Alta |
| ERP para construtora pequena | Comparação | Alta |
| alternativa Sienge | Comparação direta | Média |
| controle financeiro construção civil | Comparação | Média |
| cronograma físico financeiro software | Nicho | Média |

### 5.2 Informacionais (blog, não landing)
- como controlar fluxo de caixa de obra
- o que é cronograma físico-financeiro
- como evitar estouro de orçamento em obra
- NBR 16636 na prática
- planilha de controle de obra (capturar quem busca planilha → migrar pra SaaS)

### 5.3 Long-tail/branded (futuro)
- build fleury preço
- build fleury vs sienge
- build fleury implantação

**Keyword principal da home:** `software de gestão de obras` + variação no H1 com `controle orçamentário`.

---

## 6. Provas a coletar antes do go-live

Sem essas provas, a landing converte mal. Lista de coleta:

- [ ] **3 logos de cliente** (mesmo que beta) pra logo bar.
- [ ] **1 case escrito** com número concreto (ex: "reduziu retrabalho financeiro em X horas/semana").
- [ ] **1 depoimento em vídeo de 30s** — sócio ou CFO.
- [ ] **Screenshots reais do produto** (cronograma, fluxo de caixa, tela de IA classificando).
- [ ] **Selo NBR 16636 / PMBOK** (texto, não logo) pra seção de credibilidade.
- [ ] **Política de privacidade + termos** publicados (LGPD).
- [ ] **CNPJ + endereço no rodapé** (sinal E-E-A-T pro Google).

---

## 7. Métricas de sucesso da landing

| Métrica | Meta inicial | Meta 3 meses |
|---|---|---|
| Conversão visitor → demo | 2% | 5% |
| Conversão visitor → trial/contato | 3% | 7% |
| Tempo na página | 45s | 90s |
| Bounce rate | < 65% | < 50% |
| Core Web Vitals | Todos verdes | Todos verdes |
| Posição média keyword principal | — | Top 20 em 3 meses |

---

## 8. Decisões pendentes (Pedro responde)

1. **Domínio da landing:** `buildfleury.com.br`? Domínio próprio ou subdomínio do FullBPO? `[?]`
2. **Preço público ou "fale com vendas"?** `[?]`
3. **CTA primário:** "Agendar demo" / "Começar teste grátis" / "Falar com especialista"? `[?]`
4. **Voz da marca:** técnica/sóbria (estilo Sienge) ou provocativa/moderna (estilo Vobi)? `[?]`
5. **Idioma:** só PT-BR no v1? `[?]`
6. **Tem orçamento pra Ads no go-live?** Se sim, landing precisa de variantes A/B desde o dia 1. `[?]`
7. **Existe brandbook/identidade visual?** Cores, tipografia, logo. `[?]`

---

## 9. Próximos passos

1. **Pedro responde decisões pendentes (seção 8)** — bloqueante.
2. **Pedro confirma/ajusta hipóteses marcadas com `[CONFIRMAR]`**.
3. Em cima do briefing fechado, eu produzo:
   - Wireframe textual da landing (seções, ordem, hierarquia).
   - Copy de cada seção.
   - Schema.org + meta tags.
   - Checklist de Core Web Vitals na implementação Vite.
