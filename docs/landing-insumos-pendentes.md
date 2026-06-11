# Landing — insumos pendentes (só o Pedro pode fornecer)

Checklist do que falta para a landing e as páginas legais ficarem 100% reais. Cada item aponta o TODO/marcador no código. Os TODOs **não** devem ser removidos antes de o insumo ser aplicado.

## 1. Canal real de demo
- [ ] Definir o canal: Calendly, WhatsApp (wa.me) ou formulário
- [ ] Substituir a constante `DEMO_CTA_HREF` (hoje um `mailto:` provisório)
- Onde: `src/pages/LandingPage.tsx:26` (TODO) e `:27` (constante usada em header, hero, CTA final e footer)

## 2. Logos autorizados de clientes/parceiros
- [ ] Obter autorização de uso de marca de cada cliente
- [ ] Entregar arquivos (SVG/PNG fundo transparente) — hoje são nomes fictícios em texto
- Onde: `src/pages/LandingPage.tsx:228` (TODO no componente `LogoBar`, array `logos` na linha 229)

## 3. Depoimento real
- [ ] Nome, cargo, empresa, foto e (idealmente) um número de resultado
- [ ] Autorização por escrito para publicação
- Onde: `src/pages/LandingPage.tsx:589` (TODO no componente `Testimonial`; placeholder "Nome do cliente / Cargo, Construtora Exemplo" nas linhas 600-601)

## 4. Razão social + CNPJ
- [ ] Razão social completa da empresa operadora do Build Fleury
- [ ] CNPJ
- [ ] Endereço completo da sede (usado na Política de Privacidade)
- Onde:
  - `src/pages/LandingPage.tsx:738` (TODO no copyright do footer)
  - `src/pages/legal/PrivacidadePage.tsx` — marcadores `[PREENCHER: razão social]`, `[PREENCHER: CNPJ]`, `[PREENCHER: endereço completo]` (seção "1. Quem somos")
  - `src/pages/legal/TermosPage.tsx` — marcadores `[PREENCHER: razão social]`, `[PREENCHER: CNPJ]` (seção "1. Objeto e aceitação")

## 5. Encarregado LGPD (DPO)
- [ ] Nome do encarregado
- [ ] E-mail de contato do encarregado
- Onde: `src/pages/legal/PrivacidadePage.tsx` — marcadores `[PREENCHER: nome do encarregado]` e `[PREENCHER: e-mail do encarregado]` (seção "10. Encarregado")

## 6. Complementos das páginas legais
- [ ] Data de publicação das duas páginas — `[PREENCHER: data de publicação]` em `PrivacidadePage.tsx` e `TermosPage.tsx`
- [ ] Cidade/UF do foro — `[PREENCHER: cidade/UF do foro]` em `src/pages/legal/TermosPage.tsx` (seção "9. Lei aplicável e foro")
- [ ] E-mail de contato para dúvidas sobre os termos — `[PREENCHER: e-mail de contato]` em `TermosPage.tsx`
- [ ] Revisão jurídica dos textos antes de publicar (os textos são minuta, não parecer jurídico)

## Observações
- Os marcadores `[PREENCHER: ...]` são renderizados com destaque âmbar na tela (componente `Preencher` em `src/pages/legal/LegalLayout.tsx`) — fáceis de localizar visualmente.
- O TODO em `src/pages/LandingPage.tsx:730` referencia os marcadores das páginas legais já criadas (`/privacidade` e `/termos`).
