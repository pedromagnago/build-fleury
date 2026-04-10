import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing ENV vars!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function scan() {
  const { data: etapas, error: errEtapas } = await supabase.from('etapas').select('*');
  const { data: distribuicoes, error: errDist } = await supabase.from('cronograma_distribuicao').select('*');

  if (errEtapas || errDist) {
    console.error(errEtapas, errDist);
    return;
  }

  let wbsReceita = 0;
  let distReceitaNova = 0;
  let distReceitaAntiga = 0;
  let orcamentoTeorico = 0;

  console.log("================== RELATÓRIO DE RECEITAS ==================");

  etapas.forEach(e => {
    const dists = distribuicoes.filter(d => d.etapa_id === e.id);
    const sumCasas = dists.reduce((s, d) => s + (d.casas_planejadas || 0), 0);
    const sumLibFatur = dists.reduce((s, d) => s + (d.valor_liberado_faturamento || 0), 0);
    
    // Como a WBSDashboardCards calcula
    const wbsValue = Number(e.faturamento_valor_total) || sumLibFatur;
    wbsReceita += wbsValue;

    // Como o painel de Medições novo calcula
    const pu = Number(e.faturamento_preco_unitario) || 0;
    const medValue = sumCasas * pu;
    distReceitaNova += medValue;

    distReceitaAntiga += sumLibFatur;

    const theorical = (Number(e.faturamento_quantidade) || 0) * pu;
    orcamentoTeorico += theorical;

    const diff = wbsValue - medValue;

    if (Math.abs(diff) > 0.01) {
      console.log(`Etapa [${e.item}] ${e.descricao}:`);
      console.log(`  - WBS usa (fat_valor_total ou sumLib): ${wbsValue.toFixed(2)}`);
      console.log(`  - Medições usa (sumCasas * PU): ${medValue.toFixed(2)} (Casas dist: ${sumCasas}, PU: ${pu})`);
      console.log(`  - e.faturamento_valor_total no banco: ${e.faturamento_valor_total}`);
      console.log(`  - Quantidade teórica no banco: ${e.faturamento_quantidade}`);
      console.log(`  - Diferença: ${diff.toFixed(2)}`);
      console.log(`---------------------------------------------------------`);
    }
  });

  console.log("===========================================================");
  console.log(`Total WBS (Painel de Bordo): ${wbsReceita.toFixed(2)}`);
  console.log(`Total Medições Panel (Nova Lógica): ${distReceitaNova.toFixed(2)}`);
  console.log(`Total Distribuições (Antigas, sumLibFatur): ${distReceitaAntiga.toFixed(2)}`);
  console.log(`Total Orçamento Teórico (Todas casas * PU): ${orcamentoTeorico.toFixed(2)}`);
}

scan();
