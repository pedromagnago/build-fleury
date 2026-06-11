# Pacote de decisão — Divergências WBS (Realize - SFP)

**Origem:** `analise_divergencias_wbs_realize_sfp.md` (29/05/2026)
**Empresa:** Realize - SFP (`company_id` iniciando em `c2af1493`)
**Baseline:** Realize - SFP — Apresentação (`998e86f0`), foto do WBS de 06/05/2026

> **NENHUM script deste pacote foi executado.** São entregas para revisão do analista.
> Todos os scripts usam placeholders `__ASSIM__` que **quebram de propósito** se não
> forem substituídos (UUID inválido). Rode sempre primeiro com `ROLLBACK` (modo teste).

---

## Resumo executivo

Três divergências inflam o custo orçado do WBS da empresa original em relação ao baseline. O excesso bruto potencial soma **até R$ 603.666** (R$ 88.748 + R$ 478.120 + R$ 36.798).

| # | Etapa / Item | Natureza | Impacto orçado | Script |
|---|---|---|---|---|
| 1 | ESPERAS DE ESGOTO RADIER (`ESGOTO-REAL`) | `valor_total_orcado` auto-inflado pela fórmula de extrapolação (R$ 12.298 × 64 casas) | **+R$ 88.748** de excesso | `01-esperas-esgoto-radier.sql` |
| 2 | PAREDES PRÉ MOLDADAS — CIMENTO (`DIMARCK-CIMENTO` × `CIMENTO-REAL`) | Mudança de canal de compra (kit DIMARCK → compra direta); saldo aberto sem uso | até **+R$ 478.120** de saldo obsoleto | `02-paredes-cimento-opcao-a.sql` / `02-paredes-cimento-opcao-b.sql` |
| 3 | PAREDES PRÉ MOLDADAS — FERRO (`DIMARCK-FERRO` × `FERRO-REAL`) | Possível NF duplicada GERDAU (NF 000193620 × NF 141, ambas R$ 36.798,01) | até **−R$ 36.798** de custo duplicado | `03-paredes-ferro.sql` |

---

## Divergência 1 — ESPERAS DE ESGOTO RADIER (+R$ 88.748)

**O que aconteceu:** a NF 26253 (Irmãos Salvador, R$ 12.298,41) não encontrou pedido planejado e a recepção criou automaticamente o item `ESGOTO-REAL` com `valor_total_orcado` extrapolado para R$ 101.046,35 — valor que não corresponde a nenhum orçamento real. O item `AUTO-S06-C32C29AD` (Marciana Gorete, R$ 130.177) já cobre o grupo principal.

**Decisão pendente:**
- **Opção A (implementada no script 01):** compra adicional — orçado do `ESGOTO-REAL` passa a refletir apenas o realizado (`qtd_total = 1`, `custo_unitario_orcado = 12.298,41`, `valor_total_orcado = 12.298,41`). Reduz o WBS em **R$ 88.748**.
- **Opção B (sem script — pedir se for o caso):** compra sobreposta ao `AUTO-S06-C32C29AD` — migrar os pedidos do `ESGOTO-REAL` para o `AUTO-S06` e desativar o `ESGOTO-REAL` (`deleted_at = now()`). Reduz o WBS em **R$ 101.046**.

**Validar antes de executar (obra/engenharia):**
- [ ] A compra da Irmãos Salvador é material **adicional** não previsto no pedido da Marciana Gorete, ou **sobreposta** ao mesmo conjunto de esperas?
- [ ] Se adicional: haverá novas compras desse item nos próximos lotes (orçado deve projetar algo) ou o realizado encerra o item?

**Risco:** baixo. Correção direta de valor auto-gerado; nenhuma conciliação ou parcela é tocada.

---

## Divergência 2 — PAREDES — CIMENTO (até +R$ 478.120)

**O que aconteceu:** o plano previa cimento via kit industrializado DIMARCK (`DIMARCK-CIMENTO`, R$ 512.000 = 64 casas × R$ 8.000). Na prática a obra comprou cimento direto de Votorantim, InterCement e EGX (21 NFs, R$ 275.013), o que gerou o item automático `CIMENTO-REAL`. O `DIMARCK-CIMENTO` recebeu só 2 NFs (EGX, R$ 33.880) e carrega **R$ 478.120 de saldo aberto sem compra prevista**.

**Decisão pendente:**
- **Opção A (`02-paredes-cimento-opcao-a.sql`) — refletir o realizado:** ajustar `DIMARCK-CIMENTO` para `qtd_total = 2`, `custo_unitario_orcado = 16.940,00`, `valor_total_orcado = 33.880,00`. Mantém os dois itens ativos; elimina os R$ 478.120 de saldo fantasma.
- **Opção B (`02-paredes-cimento-opcao-b.sql`) — consolidar (migrar pedidos e desativar item):** migrar os pedidos/NFs do `DIMARCK-CIMENTO` para o `CIMENTO-REAL`, somar os R$ 33.880 ao orçado do `CIMENTO-REAL` e desativar o `DIMARCK-CIMENTO` (`deleted_at = now()`). Resta um único item de cimento no WBS.

**Validar antes de executar (engenheiro/mestre de obras):**
- [ ] O cimento das 21 NFs diretas **foi entregue à DIMARCK** para fabricação das paredes (mesmo insumo) ou foi usado direto na obra (laje, radier, grauteamento — insumos distintos)?
- [ ] A compra direta virou o modelo permanente, ou o kit DIMARCK voltará a incluir cimento nos próximos lotes? (Se voltar, nenhuma das opções se aplica como está — o orçado precisa de projeção da engenharia.)

**Riscos:**
- Opção A: baixo — só altera campos de orçamento do item.
- Opção B: médio — move FKs de `pedido_itens`/`pedidos`/`recepcao_matches`; conferir após a migração se `valor_consumido`/`valor_saldo` do `CIMENTO-REAL` recalcularam (se forem mantidos por trigger). Se não recalcularem, acionar o time de dev antes do COMMIT.

---

## Divergência 3 — PAREDES — FERRO (até −R$ 36.798)

**O que aconteceu:** dois pedidos de GERDAU com **valor idêntico** (R$ 36.798,01) e numeração de NF muito diferente:
- `DIMARCK-FERRO` pedido **711** — NF **000193620**
- `FERRO-REAL` pedido **701** — NF **141**

Pode ser a mesma entrega cadastrada duas vezes (numeração digitada errada) ou duas entregas distintas com valor coincidente.

**Decisão pendente:**
- **Se duplicata confirmada (script 03, Parte B):** reverter a NF 141 via RPC `excluir_recepcao_doc` (o trigger `fn_recepcao_doc_revert_consumo` restaura `qtd_recebida` e exclui o pedido âncora em cascade) e ajustar o `valor_total_orcado` do `FERRO-REAL` para **R$ 58.038,61** (94.836,62 − 36.798,01).
- **Se NFs distintas:** não executar a Parte B. Se o ferro do `FERRO-REAL` foi entregue ao DIMARCK (mesmo insumo), aplicar ao `DIMARCK-FERRO` o mesmo raciocínio da Opção A do cimento (ajustar saldo ao realizado) — script sob demanda após a decisão.

**Validar antes de executar (GERDAU + financeiro):**
- [ ] Solicitar à GERDAU os DANFes da NF **000193620** e da NF **141**: comparar chave de acesso, CNPJ emitente, data de emissão e itens. Só a chave de acesso prova duplicidade.
- [ ] Conferir se o pedido 701 tem **parcelas pagas ou conciliações ativas** (o script verifica). Se tiver, fazer o estorno pela RPC de estorno **antes** de excluir a NF — caso contrário, abortar e acionar o dev.

**Risco:** alto se executado sem o DANFe — excluir NF legítima remove recebimento real. O script só tem efeito após preencher manualmente o `doc_id` confirmado.

---

## Pendência adicional (sem script neste pacote)

- **S05.002 — JOELHO ESGOTO 100MMX45º duplicado:** cadastrado 2× em 27/05/2026 (20:43 e 20:44), idênticos (R$ 272,50), nenhum pedido vinculado. Decidir qual manter e desativar o outro via `deleted_at`. Correção trivial — pode ser anexada ao script 01 após decisão.

---

## Regras de execução (todas os scripts)

1. **Substituir todos os placeholders** `__COMPANY_ID__`, `__ITEM_ID...__`, `__DOC_ID...__` etc. — cada script traz o SELECT de localização para obtê-los. Os placeholders são UUIDs inválidos de propósito: se esquecer, o Postgres rejeita.
2. **Rodar primeiro em modo teste:** executar o bloco inteiro e terminar com `ROLLBACK;`. Conferir os SELECTs de antes/depois. Só então rodar de novo com `COMMIT;`.
3. **Execução via Supabase Studio (SQL direto) ou sistema — nunca importação em lote** (observação técnica da análise).
4. Todos os UPDATEs têm `WHERE` por `id` + `company_id` e gravam `audit_logs` no shape do projeto (`company_id`, `tabela`, `acao`, `registro_id`, `agente`, `dados_antes`, `dados_depois`, `resumo`).
5. Após o COMMIT, abrir o **Painel de Controle / Auditoria** do app e conferir `useHealthChecks` (16 regras) e as 4 equações contábeis — checkpoint padrão pós-mudança.
