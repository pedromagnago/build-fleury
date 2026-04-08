const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k) acc[k.trim().replace(/\r/g, '')] = v.join('=').trim().replace(/\r/g, '').replace(/^"|"$/g, '');
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('itens_compra').select('codigo, descricao, custo_unitario_orcado, valor_total_orcado, qtd_por_casa, qtd_total').order('created_at', {ascending: false}).limit(5);
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}
run();
