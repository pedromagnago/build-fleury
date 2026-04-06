# Prompt — Carregar Composição de Medições integrado ao /schedule (Cronograma Físico)

## Contexto do sistema

O Build Fleury é uma plataforma de controle orçamentário para construção de 64 casas em São Francisco de Paula/RS. A página `/schedule` (`src/pages/schedule/Schedule.tsx`) já existe com 3 tabs:

- **Avanço Físico** — Grid serviços × medições (meta % / real %)
- **Medições & Pagamentos** — Tabela das 8 medições com valores e status
- **Serviços** — Lista dos serviços do cronograma

As 3 tabelas Supabase já existem e têm CRUD completo em `src/hooks/useSchedule.ts`:
- `cronograma_servicos` — com `useCreateServico`, `useUpdateServico`, `useDeleteServico`
- `medicoes` — com `useCreateMedicao`, `useUpdateMedicao`, `useDeleteMedicao`
- `medicoes_metas` — com `useMedicoesMetas` (read) + insert via Supabase direto

O hook `useCompany()` fornece `companyId`. React Query keys: `['cronograma-servicos']`, `['medicoes']`, `['medicoes-metas']`, `['avanco-fisico']`.

---

## O que implementar

### Estado vazio com call-to-action de upload

Quando a página `/schedule` carrega e **não existem serviços nem medições** (os 3 arrays estão vazios), exibir um **empty state** com:

1. Ícone ilustrativo (FileSpreadsheet ou Upload)
2. Título: "Nenhuma composição carregada"
3. Subtítulo: "Faça upload da planilha de composição de medições para popular o cronograma físico"
4. Botão principal: "Carregar composição de medições" (abre file picker para `.xlsx`)
5. Botão secundário: "Ou cadastre manualmente" (revela as tabs normais vazias)

### Fluxo após upload

1. **Parse do `.xlsx`** no browser usando a lib `xlsx` (já importada no projeto: `import * as XLSX from 'xlsx'` — vide `src/pages/import/ImportPage.tsx`)
2. **Preview inline** substituindo o empty state — mostra os dados extraídos em 3 seções colapsáveis antes de gravar
3. **Botão "Confirmar importação"** grava nas 3 tabelas em cascata
4. **Após gravar**, invalida as queries e a tela já mostra o grid de avanço populado

### Botão de reimportação (quando já tem dados)

Quando já existem dados, adicionar um botão discreto no header da página (ao lado do título "Cronograma Físico"):
- Ícone de upload pequeno + "Reimportar composição"
- Ao clicar, abre AlertDialog: "Já existem X serviços, Y medições e Z metas. Reimportar substituirá todos os dados. Deseja continuar?"
- Se confirmar: deleta dados existentes da company → roda o mesmo fluxo de upload

---

## Estrutura da planilha `composicao_medicoes.xlsx`

Aba única: `composicao medicoes`

### Dados dos serviços (rows 8 em diante, 0-indexed):
| Coluna (0-indexed) | Conteúdo |
|---------------------|----------|
| 1 | Código do serviço (1 a 31, o 20 não existe) |
| 2 | Nome do serviço |
| 3 | Unidade ("casa") |
| 4 | Quantidade (64) |
| 5 | Preço unitário por casa |
| 6 | Valor total (preço × quantidade) |

### Metas por medição (mesmas rows, colunas diferentes):
| Medição | Col meta_casas | Col valor_liberado |
|---------|----------------|--------------------|
| 1 | 14 | 15 |
| 2 | 17 | 18 |
| 3 | 20 | 21 |
| 4 | 24 | 25 |
| 5 | 27 | 28 |
| 6 | 30 | 31 |
| 7 | 33 | 34 |
| 8 | 36 | 37 |

### Datas das medições (row 4, mesmas colunas):
| Medição | Data início (col meta) | Data fim (col valor) |
|---------|------------------------|----------------------|
| 1 | 2026-03-16 | 2026-03-28 |
| 2 | 2026-03-30 | 2026-04-11 |
| 3 | 2026-04-13 | 2026-04-25 |
| 4 | 2026-04-27 | 2026-05-09 |
| 5 | 2026-05-11 | 2026-05-23 |
| 6 | 2026-05-25 | 2026-06-06 |
| 7 | 2026-06-08 | 2026-06-20 |
| 8 | 2026-06-22 | 2026-07-04 |

### Totais das medições (row 5, colunas de valor):
| Medição | Valor (R$) |
|---------|------------|
| 1 | 722.674,76 |
| 2 | 626.297,15 |
| 3 | 1.277.686,36 |
| 4 | 1.087.095,47 |
| 5 | 1.464.251,18 |
| 6 | 511.296,76 |
| 7 | 835.349,16 |
| 8 | 835.349,16 |
| **Total** | **7.360.000,00** |

---

## Código de parsing

```typescript
import * as XLSX from 'xlsx';

interface ParsedServico {
  nome: string;
  preco_unitario: number;
  quantidade: number;
  valor_total: number;
}

interface ParsedMedicao {
  numero: number;
  data_inicio: string;
  data_fim: string;
  valor_planejado: number;
  status: string;
}

interface ParsedMeta {
  servico_nome: string;
  medicao_numero: number;
  meta_percentual: number;
  meta_casas: number;
  valor_liberado: number;
}

interface ComposicaoParsed {
  servicos: ParsedServico[];
  medicoes: ParsedMedicao[];
  metas: ParsedMeta[];
}

const MED_COL_MAP: Record<number, [number, number]> = {
  1: [14, 15], 2: [17, 18], 3: [20, 21], 4: [24, 25],
  5: [27, 28], 6: [30, 31], 7: [33, 34], 8: [36, 37],
};

function excelDateToISO(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'number') {
    // Excel serial date
    const date = new Date((val - 25569) * 86400000);
    return date.toISOString().split('T')[0];
  }
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return String(val).split('T')[0];
}

export function parseComposicaoMedicoes(file: ArrayBuffer): ComposicaoParsed {
  const wb = XLSX.read(file, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];

  // 1. Extrair serviços (rows 8+)
  const servicos: ParsedServico[] = [];
  for (let i = 8; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const cod = row[1];
    const nome = row[2];
    if (cod == null || nome == null || typeof cod !== 'number') continue;
    servicos.push({
      nome: String(nome).replace(/\n/g, ' ').trim(),
      preco_unitario: Number(row[5]) || 0,
      quantidade: Number(row[4]) || 64,
      valor_total: Number(row[6]) || 0,
    });
  }

  // 2. Extrair medições (row 4 = datas, row 5 = valores)
  const medicoes: ParsedMedicao[] = Object.entries(MED_COL_MAP).map(([num, [startCol, endCol]]) => ({
    numero: Number(num),
    data_inicio: excelDateToISO(data[4]?.[startCol]),
    data_fim: excelDateToISO(data[4]?.[endCol]),
    valor_planejado: Number(data[5]?.[endCol]) || 0,
    status: 'futura',
  }));

  // 3. Extrair metas (mesmas rows dos serviços)
  const metas: ParsedMeta[] = [];
  for (let i = 8; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const nome = row[2];
    const qtdTotal = Number(row[4]) || 64;
    if (row[1] == null || nome == null) continue;
    const nomeClean = String(nome).replace(/\n/g, ' ').trim();

    for (const [num, [metaCol, valCol]] of Object.entries(MED_COL_MAP)) {
      const metaCasas = Number(row[metaCol]) || 0;
      if (metaCasas > 0) {
        metas.push({
          servico_nome: nomeClean,
          medicao_numero: Number(num),
          meta_percentual: metaCasas / qtdTotal,
          meta_casas: metaCasas,
          valor_liberado: Number(row[valCol]) || 0,
        });
      }
    }
  }

  return { servicos, medicoes, metas };
}
```

---

## Gravação no Supabase (cascata em 3 etapas)

```typescript
async function importComposicao(
  parsed: ComposicaoParsed,
  companyId: string,
  substituir: boolean = false,
): Promise<{ servicos: number; medicoes: number; metas: number }> {
  // Se substituir, deletar dados existentes NESTA ORDEM (FK constraints)
  if (substituir) {
    await supabase.from('medicoes_metas').delete().eq('company_id', companyId);
    await supabase.from('avanco_fisico').delete().eq('company_id', companyId);
    await supabase.from('medicoes').delete().eq('company_id', companyId);
    await supabase.from('cronograma_servicos').delete().eq('company_id', companyId);
  }

  // PASSO 1: Inserir serviços e obter IDs
  const { data: servicosInseridos, error: errServ } = await supabase
    .from('cronograma_servicos')
    .insert(parsed.servicos.map(s => ({
      company_id: companyId,
      nome: s.nome,
      preco_unitario: s.preco_unitario,
      quantidade: s.quantidade,
      valor_total: s.valor_total,
    })))
    .select('id, nome');

  if (errServ) throw errServ;

  // PASSO 2: Inserir medições
  const { error: errMed } = await supabase
    .from('medicoes')
    .insert(parsed.medicoes.map(m => ({
      company_id: companyId,
      numero: m.numero,
      data_inicio: m.data_inicio,
      data_fim: m.data_fim,
      valor_planejado: m.valor_planejado,
      status: 'futura',
      valor_liberado: 0,
    })));

  if (errMed) throw errMed;

  // PASSO 3: Inserir metas (resolver servico_nome → servico_id)
  const nomeToId: Record<string, string> = {};
  (servicosInseridos ?? []).forEach(s => {
    nomeToId[s.nome.toLowerCase().trim()] = s.id;
  });

  const metasComId = parsed.metas
    .map(m => {
      const sid = nomeToId[m.servico_nome.toLowerCase().trim()];
      if (!sid) return null;
      return {
        company_id: companyId,
        servico_id: sid,
        medicao_numero: m.medicao_numero,
        meta_percentual: m.meta_percentual,
        meta_casas: m.meta_casas,
        valor_liberado: m.valor_liberado,
      };
    })
    .filter(Boolean);

  const { error: errMetas } = await supabase
    .from('medicoes_metas')
    .insert(metasComId);

  if (errMetas) throw errMetas;

  // PASSO 4: Audit log
  await supabase.from('audit_logs').insert({
    company_id: companyId,
    tabela: 'composicao_medicoes',
    acao: 'INSERT',
    agente: 'sistema',
    dados_depois: {
      type: 'import_composicao_medicoes',
      servicos: parsed.servicos.length,
      medicoes: parsed.medicoes.length,
      metas: metasComId.length,
    },
  });

  return {
    servicos: parsed.servicos.length,
    medicoes: parsed.medicoes.length,
    metas: metasComId.length,
  };
}
```

---

## Alterações no Schedule.tsx

### Lógica de empty state

```tsx
// No componente Schedule(), após os hooks:
const isEmpty = !loadingServicos && !loadingMedicoes
  && (!servicos || servicos.length === 0)
  && (!medicoes || medicoes.length === 0);

// No return:
if (isEmpty) {
  return <ComposicaoUploadEmptyState onImported={() => {
    // invalida todas as queries para repopular
    queryClient.invalidateQueries({ queryKey: ['cronograma-servicos'] });
    queryClient.invalidateQueries({ queryKey: ['medicoes'] });
    queryClient.invalidateQueries({ queryKey: ['medicoes-metas'] });
  }} />;
}

// Caso contrário, renderiza as tabs normais com botão de reimport no header
```

### Header com botão de reimportação

```tsx
<div className="flex items-center justify-between">
  <h1 className="text-2xl font-semibold tracking-tighter">Cronograma Físico</h1>
  <Button variant="outline" size="sm" onClick={() => setShowReimport(true)}>
    <Upload className="h-3.5 w-3.5 mr-1.5" /> Reimportar composição
  </Button>
</div>
```

---

## Preview antes de confirmar (componente ComposicaoPreview)

Após o parsing, antes de gravar, mostrar na própria tela do `/schedule` um preview com:

### Seção 1 — Resumo (cards)
```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ 30 serviços  │  │ 8 medições   │  │ 84 metas     │  │ R$ 7.360.000 │
│ detectados   │  │ Mar–Jul 2026 │  │ serv×med     │  │ total        │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

### Seção 2 — Grid visual (miniatura do que vai aparecer)
Tabela compacta mostrando serviços nas linhas × M1–M8 nas colunas. Cada célula mostra `casas (%)` se houver meta. Células vazias = "—". Isso é exatamente o que o grid de avanço vai mostrar depois — o usuário já vê o resultado antes de confirmar.

### Seção 3 — Validação
- ✅ Total serviços = Total medições (tolerância R$ 1)
- ✅ Todos os serviços nas metas existem na lista
- ✅ Datas em ordem cronológica
- ✅ Nenhum valor negativo
- ❌ (se houver erro, mostra em vermelho e desabilita o botão Confirmar)

### Rodapé
```
[Cancelar]  [Confirmar importação — 30 serviços, 8 medições, 84 metas]
```

---

## Queries a invalidar após importação

```typescript
queryClient.invalidateQueries({ queryKey: ['cronograma-servicos'] });
queryClient.invalidateQueries({ queryKey: ['medicoes'] });
queryClient.invalidateQueries({ queryKey: ['medicoes-metas'] });
queryClient.invalidateQueries({ queryKey: ['avanco-fisico'] });
queryClient.invalidateQueries({ queryKey: ['servicos-situacao'] });
queryClient.invalidateQueries({ queryKey: ['etapas-hierarquicas'] });
queryClient.invalidateQueries({ queryKey: ['impactos'] });
```

---

## Arquivos a criar/modificar

| Arquivo | Ação |
|---------|------|
| `src/pages/schedule/Schedule.tsx` | Modificar — adicionar empty state, botão reimport, lógica de upload |
| `src/lib/parseComposicao.ts` | **Criar** — função `parseComposicaoMedicoes()` isolada |
| `src/components/schedule/ComposicaoUpload.tsx` | **Criar** — empty state + file picker + preview + confirmação |
| `src/components/schedule/ComposicaoPreview.tsx` | **Criar** — preview dos dados parseados com grid visual e validações |
| `src/hooks/useSchedule.ts` | Modificar — adicionar `useImportComposicao()` mutation que faz a gravação em cascata |

---

## Dados extraídos da planilha (referência para testes)

### 30 serviços (nome → valor total):
```
ADM DE OBRA – ENGENHEIRO+ MESTRE MENSALISTA → R$ 596.096,97
INSTALAÇÕES E CANTEIRO DE OBRAS → R$ 96.377,61
ENSAIO DE RESISTÊNCIA A COMPRESSÃO → R$ 21.213,93
LOCAÇÃO DE OBRA → R$ 97.554,43
CAIXA DE INSPEÇÃO E GORDURA → R$ 120.335,30
ESPERAS DE ESGOTO RADIER → R$ 112.790,08
RADIER → R$ 872.011,61
PAREDES PRÉ MOLDADAS DE CONCRETO → R$ 1.784.912,70
GRAUTEAMENTO → R$ 42.169,96
IMPERMEABILIZAÇÃO → R$ 140.448,52
CAIXA D'ÁGUA E BARRILETE → R$ 49.022,60
COBERTURA → R$ 760.486,49
RUFOS E CALHAS → R$ 152.078,57
SOLEIRAS → R$ 10.807,28
PORTAS EXTERNAS → R$ 244.986,79
JANELAS EM ALUMINIO → R$ 263.950,23
AZULEJOS → R$ 81.854,06
PISOS E RODAPÉS → R$ 145.854,41
PORTAS INTERNAS → R$ 245.374,39
EMASSAMENTO INTERNO → R$ 202.292,02
PINTURA INTERNA → R$ 224.066,82
TEXTURA EXTERNA → R$ 75.147,15
PINTURA EXTERNA → R$ 240.994,59
ELETRICA EFIAÇÃO + TOMADAS → R$ 346.428,26
LOUÇAS E METAIS → R$ 159.674,86
ENTRADA DE ENERGIA → R$ 197.108,47
ENTRADA DE ÁGUA → R$ 20.530,37
PASSEIO PUBLICO → R$ 48.949,98
LIMPEZA FINAL DE OBRA → R$ 6.481,56
DESPESAS ACESSÓRIAS → R$ 0,00
```

### Distribuição de metas (84 registros):
- M1: ADM 8 casas (12,5%), Instalações 64 (100%), Ensaio 32 (50%), Locação 32 (50%), Esperas 32 (50%), Radier 32 (50%), Despesas 34 (53,1%)
- M2: ADM 8 (12,5%), Ensaio 32 (50%), Locação 32 (50%), Esperas 32 (50%), Radier 32 (50%), Despesas 2 (3,9%)
- M3: ADM 8, Cx Inspeção 24 (37,5%), Paredes 24, Grauteamento 24, Impermeab. 24, Cx Água 24, Cobertura 24, Rufos 24, Soleiras 16 (25%), Azulejos 16, Pisos 16, Despesas 2
- M4: ADM 8, Cx Inspeção 20 (31,3%), Paredes 20, Grauteamento 20, Impermeab. 20, Cx Água 20, Cobertura 20, Rufos 20, Soleiras 16, Azulejos 16, Pisos 16, Despesas 2
- M5: ADM 8, Cx Inspeção 20, Paredes 20, Grauteamento 20, Impermeab. 20, Cx Água 20, Cobertura 20, Rufos 20, Soleiras 16, Portas Ext. 32 (50%), Janelas 32, Azulejos 16, Pisos 16, Portas Int. 32, Despesas 3
- M6: ADM 8, Soleiras 16, Portas Ext. 32, Janelas 32, Azulejos 16, Pisos 16, Portas Int. 32, Despesas 2
- M7: ADM 8, Emassamento 32 (50%), Pintura Int. 32, Textura Ext. 32, Pintura Ext. 32, Elétrica 32, Louças 32, En. Energia 32, En. Água 32, Passeio 32, Limpeza 32, Despesas 2
- M8: mesmos da M7 (Despesas 14)

---

## Regras de negócio

1. A importação grava em cascata: serviços → medições → metas. Se qualquer etapa falhar, exibir erro claro
2. O `company_id` vem de `useCompany()` — obrigatório em todas inserções
3. O `valor_liberado` em `medicoes_metas` é calculado: `meta_percentual × valor_total_servico`
4. A constraint UNIQUE(company_id, numero) em `medicoes` impede duplicatas — limpar antes se reimportando
5. A constraint UNIQUE(company_id, servico_id, medicao_numero) em `medicoes_metas` impede duplicatas
6. Após importação, o grid de avanço deve mostrar imediatamente os 30 serviços × 8 medições preenchidos
7. O `ImpactPanel` e `MedicoesTable` já consomem dos mesmos hooks — vão refletir os dados automaticamente
8. O botão "Cadastre manualmente" no empty state apenas esconde o empty state e mostra as tabs normais (vazias)
