import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
const envContent = fs.readFileSync('.env', 'utf-8');
const env: Record<string, string> = {};
envContent.split(/\r?\n/).forEach(line => {
  const [key, ...rest] = line.split('=');
  if (key) env[key.trim()] = rest.join('=').trim();
});
const supabase = createClient(env['VITE_SUPABASE_URL'], env['VITE_SUPABASE_PUBLISHABLE_KEY']);

async function run() {
  const { data, error } = await supabase
    .from('parcelas')
    .select('*, pedidos(fornecedores(nome), itens_compra(descricao, deleted_at, etapa_id, etapas(nome)))')
    .is('deleted_at', null);
  
  if (error) {
    console.error(error);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}
run();
