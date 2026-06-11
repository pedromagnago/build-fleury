# ADR-005: Pagamento/recebimento parcial como padrão

Data: 11/06/2026 · Status: aceito

## Contexto

Em obra, recebimento parcial de medição e pagamento parcial de parcela são corriqueiros (liberação em tranches pelo banco, pagamento fracionado a fornecedor). As primeiras versões dos fluxos de baixa tratavam só o caso total, gerando retrabalho a cada feature financeira: campo de valor travado no total, status binário pago/não-pago e baixas que sumiam da lista após o primeiro recebimento parcial.

## Decisão

Toda operação de baixa/recebimento/pagamento aceita valor **parcial ou total**, em todas as origens (parcela, medição, parcela de mútuo, captação, despesa indireta):

- **UI:** campo `valor` sempre editável, pré-preenchido com o saldo restante (não com o total), exibindo saldo ao lado do total. O botão de baixa permanece disponível enquanto saldo > 0, mesmo após baixa parcial anterior. Valor ≠ saldo é sinalizado como "parcial" ou "excede saldo".
- **Status intermediário visível:** saldo entre 0 e total ⇒ `parcialmente_paga` (parcelas/mútuo) ou `liberada` (medições), exibido como "parcial" com saldo restante nas listagens (Recebimentos, Pagamentos). Status intermediário nunca é tratado como concluído; quitação compara com tolerância de centavos (ADR-001).
- **Sem duplicação de linhas:** baixa parcial atualiza a mesma linha com saldo restante; o histórico fica nas conciliações/auditoria.
- **Parser de número BR:** entradas de valor passam por `parseValorBR` (`src/lib/utils.ts`), que aceita `1.695.261,56`, `1695261,56`, `1695261.56` e `1.695.261` — vírgula presente ⇒ decimal e pontos são milhar; senão heurística de milhar para múltiplos pontos ou ponto seguido de 3 dígitos. Nunca `replace(',', '.')` simples.
- **Backend:** o parcial é nativo em `aplicarDeltaOrigem` e na trigger de parcelas — somam o delta e derivam o status do saldo (ADR-001).

## Consequências

- Nenhuma feature financeira nova precisa "ganhar suporte a parcial" depois — parcial é o caso base e total é o caso particular (delta = saldo).
- Listagens e KPIs devem cruzar status com saldo (tolerância 0.01) em vez de confiar só no enum — `liberada` não significa "recebido por completo".
- Múltiplas baixas parciais sobre a mesma origem geram múltiplos vínculos em `conciliacao_parcelas`, todos somados no recálculo de saldo.
- Custo: validações de formulário precisam tratar três faixas (parcial, total, excedente) em vez de uma igualdade simples.
