import * as XLSX from 'xlsx';
import { safeSheetToJson } from '@/lib/safeXlsx';
import { supabase } from '@/lib/supabase';

export interface ParsedServico {
  nome: string;
  preco_unitario: number;
  quantidade: number;
  valor_total: number;
  unidade: string;
  quantidade_por_casa: number;
}

export interface ParsedMedicao {
  numero: number;
  data_inicio: string;
  data_fim: string;
  valor_planejado: number;
  status: string;
}

export interface ParsedMeta {
  servico_nome: string;
  medicao_numero: number;
  meta_percentual: number;
  meta_casas: number;
  valor_liberado: number;
}

export interface ComposicaoParsed {
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
    return date.toISOString().split('T')[0] ?? '';
  }
  if (val instanceof Date) return val.toISOString().split('T')[0] ?? '';
  return String(val).split('T')[0] ?? '';
}

export function parseComposicaoMedicoes(file: ArrayBuffer): ComposicaoParsed {
  const wb = XLSX.read(file, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]!]!;
  const data = safeSheetToJson<unknown[]>(sheet, { header: 1, defval: null });

  // 1. Extrair serviços (rows 8+)
  const servicos: ParsedServico[] = [];
  for (let i = 8; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const cod = row[1];
    const nome = row[2];
    if (cod == null || nome == null || typeof cod !== 'number') continue;
    
    // Ignore lines that are just totals or non-service related
    if (String(nome).toLowerCase().includes('total')) continue;

    const unidadeRaw = row[3] != null ? String(row[3]).trim().toUpperCase() : 'UND';
    const qtdTotal = Number(row[4]) || 64;
    const casasDefault = 64;
    const qtdPorCasa = qtdTotal > 0 ? qtdTotal / casasDefault : 1;

    servicos.push({
      nome: String(nome).replace(/\n/g, ' ').trim(),
      preco_unitario: Number(row[5]) || 0,
      quantidade: qtdTotal,
      valor_total: Number(row[6]) || 0,
      unidade: unidadeRaw,
      quantidade_por_casa: qtdPorCasa,
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

    if (nomeClean.toLowerCase().includes('total')) continue;

    for (const [num, [metaCol, valCol]] of Object.entries(MED_COL_MAP)) {
      const metaCasas = parseFloat(String(row[metaCol])) || 0;
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

// Gravação no Supabase unificada com as Etapas e Distribuições
export async function importComposicaoToEtapas(
  parsed: ComposicaoParsed,
  companyId: string,
  substituir: boolean = false
): Promise<{ etapasCriadas: number; etapasAtualizadas: number; medicoes: number; distribuicoes: number }> {
  
  if (substituir) {
    // Clear only faturamento-specific details or start fresh
    // But since we are mapping to Etapas, we don't want to delete Etapas!
    // Instead we clear the Faturamento data and distibutions?
    // Let's just delete the distribuicao and medicoes to easily recreate them.
    await supabase.from('medicoes').delete().eq('company_id', companyId);
    await supabase.from('cronograma_distribuicao').delete().eq('company_id', companyId);
    
    // Clear Faturamento from Etapas
    await supabase.from('etapas')
      .update({ faturamento_valor_total: null, faturamento_preco_unitario: null })
      .eq('company_id', companyId);
  }

  // 1. Fetch current Etapas to match by name
  const { data: currentEtapasData, error: errFetch } = await supabase
    .from('etapas')
    .select('id, nome, ordem')
    .eq('company_id', companyId);
    
  if (errFetch) throw errFetch;
  
  const currentEtapas = currentEtapasData || [];
  
  // Create a map to easily find Etapas by normalized name
  const normalizeString = (s: string) => s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, "");
  
  const nomeToId: Record<string, string> = {};
  currentEtapas.forEach(e => {
    nomeToId[normalizeString(e.nome)] = e.id;
  });

  // Calculate highest order
  let highestOrder = currentEtapas.length > 0 ? Math.max(...currentEtapas.map(e => e.ordem)) : 0;

  // Track created vs updated
  let etapasCriadas = 0;
  let etapasAtualizadas = 0;

  // Process Serviços from Excel
  for (const s of parsed.servicos) {
    const norm = normalizeString(s.nome);
    const existingId = nomeToId[norm];

    if (existingId) {
      // Update existing
      await supabase.from('etapas')
        .update({
          faturamento_valor_total: s.valor_total,
          faturamento_preco_unitario: s.preco_unitario,
          faturamento_quantidade_unitaria: s.quantidade_por_casa,
          faturamento_unidade: s.unidade,
        })
        .eq('id', existingId);
      etapasAtualizadas++;
    } else {
      // Create new Etapa if not found
      highestOrder += 10;
      const { data: newE } = await supabase.from('etapas')
        .insert({
          company_id: companyId,
          nome: s.nome,
          codigo: `SRV-${highestOrder}`, // Temporary code
          ordem: highestOrder,
          casas_total: s.quantidade,
          valor_total_orcado: 0,
          status: 'futuro',
          faturamento_valor_total: s.valor_total,
          faturamento_preco_unitario: s.preco_unitario,
          faturamento_quantidade_unitaria: s.quantidade_por_casa,
          faturamento_unidade: s.unidade,
        })
        .select('id')
        .single();
        
      if (newE) {
        nomeToId[norm] = newE.id;
        etapasCriadas++;
      }
    }
  }

  // 3. Inserir Medições
  const { error: errMed } = await supabase
    .from('medicoes')
    .insert(parsed.medicoes.map(m => ({
      company_id: companyId,
      numero: m.numero,
      data_prevista: m.data_inicio,
      data_liberacao: null,
      valor_planejado: m.valor_planejado,
      status: 'futura',
      valor_liberado: 0,
      percentual_fisico_meta: 0,
      percentual_fisico_real: 0
    })));

  if (errMed) throw errMed;

  // 4. Inserir Distribuições (Metas)
  const distsToInsert = parsed.metas.map(m => {
    const norm = normalizeString(m.servico_nome);
    const sid = nomeToId[norm];
    if (!sid) return null;
    
    // Find medicao dates
    const med = parsed.medicoes.find(x => x.numero === m.medicao_numero);
    
    return {
      company_id: companyId,
      etapa_id: sid,
      medicao_numero: m.medicao_numero,
      casas_planejadas: m.meta_casas,
      casas_realizadas: 0,
      data_inicio: med?.data_inicio || null,
      data_fim: med?.data_fim || null,
      valor_liberado_faturamento: m.valor_liberado,
    };
  }).filter(Boolean);

  let distribuicoesCriadas = 0;
  if (distsToInsert.length > 0) {
    const { error: errMetas } = await supabase
      .from('cronograma_distribuicao')
      .insert(distsToInsert);
      
    if (errMetas) throw errMetas;
    distribuicoesCriadas = distsToInsert.length;
  }

  // Log audit
  await supabase.from('audit_logs').insert({
    company_id: companyId,
    tabela: 'etapas',
    acao: 'IMPORTACAO',
    agente: 'sistema',
    dados_depois: {
      type: 'import_faturamento_cef',
      etapas_criadas: etapasCriadas,
      etapas_atualizadas: etapasAtualizadas,
      medicoes: parsed.medicoes.length,
      distribuicoes: distribuicoesCriadas,
    },
  });

  return {
    etapasCriadas,
    etapasAtualizadas,
    medicoes: parsed.medicoes.length,
    distribuicoes: distribuicoesCriadas,
  };
}
