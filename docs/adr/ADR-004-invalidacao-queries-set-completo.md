# ADR-004: Invalidação de queries em set completo após mutation financeira

Data: 11/06/2026 · Status: aceito

## Contexto

O estado financeiro é interligado pelo vínculo polimórfico (ADR-002): uma única baixa de medição altera `medicoes` (valor_liberado), cria linha em `conciliacoes`/`conciliacao_parcelas`, pode criar movimentação manual e muda a posição de caixa exibida junto a `parcelas` e `mutuos`. Invalidar só a query "da tela atual" deixava outras telas com dado velho (React Query servindo cache), e o usuário concluía que a operação "não funcionou".

## Decisão

Toda mutation que toca qualquer origem financeira invalida o **set completo** de query keys, não apenas a entidade editada. O conjunto, conforme usado em `src/hooks/useConciliacao.ts`, `useFinanceiro.ts`, `useOperacional.ts`, `useMutuos.ts` e no `INVALIDATE_KEYS` de `src/hooks/useMedicaoParcelas.ts`:

```ts
qc.invalidateQueries({ queryKey: ['conciliacoes'] })
qc.invalidateQueries({ queryKey: ['conciliacao-links'] })
qc.invalidateQueries({ queryKey: ['movimentacoes'] })
qc.invalidateQueries({ queryKey: ['parcelas'] })
qc.invalidateQueries({ queryKey: ['medicoes'] })
qc.invalidateQueries({ queryKey: ['medicao_parcelas'] })
qc.invalidateQueries({ queryKey: ['mutuos'] })
qc.invalidateQueries({ queryKey: ['cronograma_distribuicao'] })
```

A invalidação é por prefixo (`['parcelas']` invalida `['parcelas', companyId, ...]`), então não é preciso conhecer os parâmetros de cada tela. Hooks que mantêm listas próprias declaram a constante de keys uma vez (padrão `INVALIDATE_KEYS`) e a aplicam em todas as mutations.

## Consequências

- Qualquer tela aberta reflete a operação imediatamente após a mutation, sem F5 — inclusive KPIs e painéis derivados que dependem dessas keys.
- Custo aceito: refetch a mais em entidades não afetadas pela operação específica. O volume de dados por tenant é pequeno; consistência visual vale mais que economia de requests.
- Esquecer uma key do set é bug de UX recorrente — mutations novas copiam o set inteiro em vez de escolher "só o que mudou".
- Keys acessórias (`contas_bancarias`, `dashboard-kpis`, `despesas_indiretas`) entram conforme o fluxo as toca, sempre em adição ao set base.
