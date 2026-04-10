import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey);

async function scan() {
  const { data: etapas, error: errEtapas } = await supabase.from('etapas').select('*');
  const { data: distribuicoes, error: errDist } = await supabase.from('cronograma_distribuicao').select('*');

  if (errEtapas || errDist) {
    console.error(errEtapas, errDist);
    return;
  }

  let wbsReceita = 0;
  let medReceita = 0;
  let budgetReceita = 0;

  console.log("===========================================================");
  console.log("   VARREDURA DOS VALORES DE RECEITA E INCONSISTÊNCIAS");
  console.log("===========================================================\n");

  etapas.sort((a,b) => a.ordem - b.ordem).forEach(e => {
    const dists = distribuicoes.filter(d => d.etapa_id === e.id);
    const sumCasasDist = dists.reduce((s, d) => s + (d.casas_planejadas || 0), 0);
    const sumLibFatur = dists.reduce((s, d) => s + (d.valor_liberado_faturamento || 0), 0);
    
    // Valor total previsto pro projeto:
    const fatValTotal = Number(e.faturamento_valor_total) || sumLibFatur;
    wbsReceita += fatValTotal;

    // Novo modelo de medições: Quantidade de peças planejadas vezes o unitário
    const pu = Number(e.faturamento_preco_unitario) || 0;
    const medValue = sumCasasDist * pu;
    medReceita += medValue;

    // Se as 64 peças fossem faturadas por esse unitário
    const budgetValue = (Number(e.faturamento_quantidade_unitaria) || 0) * pu;
    budgetReceita += budgetValue;

    const diferencaPainel = fatValTotal - medValue;

    if (Math.abs(diferencaPainel) > 0.01) {
      console.log(`[ATENÇÃO] ${e.codigo} - ${e.nome} \n   => DIFERENÇA REGISTRADA: R$ ${diferencaPainel.toFixed(2)}`);
      
      if (!e.faturamento_preco_unitario || !e.faturamento_quantidade_unitaria || !e.faturamento_valor_total) {
         console.log(`   - MOTIVO PROVÁVEL: Células cruciais de faturamento estão vazias (NULL) no banco de dados para esta etapa.`);
      } else {
         console.log(`   - MOTIVO PROVÁVEL: A métrica "Valor Total" importada da CEF (R$ ${fatValTotal.toFixed(2)}) difere de "Casas Faturadas x Preço Unitário" (R$ ${medValue.toFixed(2)}).`);
         if (sumCasasDist < Number(e.faturamento_quantidade_unitaria)) {
           console.log(`      ... O sistema esperava faturar ${e.faturamento_quantidade_unitaria} unidades no total, mas em cronograma_distribuicao apenas ${sumCasasDist} casas estão distribuídas/planejadas.`);
         }
         else if (pu * sumCasasDist !== fatValTotal) {
           console.log(`      ... O multiplicador ( ${sumCasasDist} casas x ${pu} de Preço Unit ) não bate rigidamente com o valor bruto fornecido pela CEF.`);
         }
      }
      console.log(`   * WBS lê o CEF Inteiro: R$ ${fatValTotal.toFixed(2)}`);
      console.log(`   * Medições (NOVA aba) lê: R$ ${medValue.toFixed(2)}`);
      console.log("------------------------------------------");
    }
  });

  console.log("\n===========================================================");
  console.log("RESUMO GERAL DOS PAINÉIS (ONDE A RECEITA APARECE)");
  console.log(`(1) Receita CEF (Painel WBS WBSDashboardCards) : R$ ${wbsReceita.toFixed(2)}`)
  console.log(`(2) Total Receita Acumulada (Medições nova)  : R$ ${medReceita.toFixed(2)}`)
  console.log(`(3) Receita Teórica 100% (Qtd * P.Unitário)    : R$ ${budgetReceita.toFixed(2)}`)
  
  if (Math.abs(wbsReceita - medReceita) > 0.01) {
    console.log(`\nPERCEPÇÃO: A discrepância final que você vê na receita (R$ ${Math.abs(wbsReceita - medReceita).toFixed(2)}) existe porque o painel 'WBS' soma os TOTAIS da CEF. Já o painel 'Medições', que é analítico e por unidade de casa, esbarra no problema dos valores nulos/arredondamento nas etapas citadas.`);
  } else {
    console.log(`\nPERCEPÇÃO: Os totais gerais batem matematicamente, mas podem haver discrepâncias pontuais dentro do array de casas.`);
  }

}

scan();
