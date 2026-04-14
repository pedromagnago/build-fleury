/**
 * import_pedidos.cjs — Importação de pedidos do template Excel
 * 
 * Lê TEMPLATE_PEDIDOS_PREENCHIDO.xlsx, faz match com itens_compra e fornecedores
 * existentes no Supabase, e insere 440 registros na tabela pedidos + parcelas.
 */

const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

// ═══════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════
const SUPABASE_URL = 'https://pbqweliufnpxsyewhdmc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBicXdlbGl1Zm5weHN5ZXdoZG1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTk5ODIsImV4cCI6MjA5MDczNTk4Mn0.S-tmZa9FojnuIARQrS6yq9Psbnr32RVn2p0hieJ34-o';
const COMPANY_ID = '54e7018a-5475-4132-a15d-913b1d28d5d0';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function normalize(str) {
  if (!str) return '';
  return str.toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function excelDateToISO(serial) {
  if (!serial || typeof serial !== 'number') return null;
  // Excel serial date → JS Date
  const epoch = new Date(1899, 11, 30);
  const d = new Date(epoch.getTime() + serial * 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parsearCondicao(cond) {
  if (!cond || String(cond).trim() === '') return [0];
  const normalized = String(cond).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (normalized === 'a vista' || normalized === 'avista' || normalized === 'av') return [0];
  const parts = normalized.split(/[/,;\s]+/).map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return [0];
  return parts.map(p => { const n = parseInt(p, 10); return isNaN(n) ? 0 : Math.max(n, 0); });
}

function ajustarDiaUtil(d) {
  const date = new Date(d.getTime());
  if (date.getDay() === 6) date.setDate(date.getDate() - 1); // Sat → Fri
  if (date.getDay() === 0) date.setDate(date.getDate() + 1); // Sun → Mon
  return date;
}

function formatISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function gerarParcelas(pedidoId, companyId, valorTotal, condPagamento, dataEntregaISO) {
  if (valorTotal <= 0 || !condPagamento || !dataEntregaISO) return [];
  const dias = parsearCondicao(condPagamento);
  const n = dias.length;
  const valorBase = Math.floor((valorTotal * 100) / n) / 100;
  const somaBase = Math.round(valorBase * (n - 1) * 100) / 100;
  const valorUltima = Math.round((valorTotal - somaBase) * 100) / 100;
  
  const [y, m, day] = dataEntregaISO.split('-').map(Number);
  const dataEntrega = new Date(y, m - 1, day);
  
  return dias.map((d, i) => {
    const dataVenc = new Date(dataEntrega.getTime());
    dataVenc.setDate(dataVenc.getDate() + d);
    const dataAjustada = ajustarDiaUtil(dataVenc);
    return {
      company_id: companyId,
      pedido_id: pedidoId,
      numero_parcela: i + 1,
      valor: i === n - 1 ? valorUltima : valorBase,
      data_vencimento: formatISODate(dataAjustada),
      status: 'futura',
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  Build Fleury — Importação de Pedidos');
  console.log('═══════════════════════════════════════════\n');

  // 1. Read Excel
  console.log('📄 Lendo TEMPLATE_PEDIDOS_PREENCHIDO.xlsx...');
  const wb = XLSX.readFile('TEMPLATE_PEDIDOS_PREENCHIDO.xlsx');
  const ws = wb.Sheets['Template'];
  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const dataRows = allRows.slice(1).filter(r => r.some(cell => cell != null && cell !== ''));
  console.log(`   ${dataRows.length} linhas de dados encontradas.\n`);

  // 2. Fetch reference data from Supabase
  console.log('🔍 Buscando dados de referência do Supabase...');
  
  const { data: etapas } = await supabase.from('etapas').select('id, nome').eq('company_id', COMPANY_ID);
  console.log(`   ${etapas.length} etapas`);
  
  const { data: itensCompra } = await supabase.from('itens_compra').select('id, descricao, etapa_id').eq('company_id', COMPANY_ID);
  console.log(`   ${itensCompra.length} itens de compra`);
  
  let { data: fornecedores } = await supabase.from('fornecedores').select('id, nome').eq('company_id', COMPANY_ID);
  console.log(`   ${fornecedores.length} fornecedores\n`);

  // 3. Create missing fornecedores
  const fornecedorMap = new Map();
  fornecedores.forEach(f => fornecedorMap.set(normalize(f.nome), f.id));

  const fornecedoresNoPlanilha = [...new Set(dataRows.map(r => r[11]).filter(Boolean))];
  const missing = fornecedoresNoPlanilha.filter(name => !fornecedorMap.has(normalize(name)));
  
  if (missing.length > 0) {
    console.log(`🆕 Criando ${missing.length} fornecedor(es) faltante(s): ${missing.join(', ')}`);
    for (const nome of missing) {
      const { data, error } = await supabase.from('fornecedores').insert({ company_id: COMPANY_ID, nome }).select().single();
      if (error) { console.error(`   ❌ Erro ao criar "${nome}":`, error.message); continue; }
      fornecedorMap.set(normalize(nome), data.id);
      console.log(`   ✅ Criado: "${nome}" → ${data.id}`);
    }
    console.log();
  }

  // 4. Build etapa lookup (nome normalizado → id)
  const etapaMap = new Map();
  etapas.forEach(e => etapaMap.set(normalize(e.nome), e.id));

  // 5. Build item lookup (descricao normalizada + etapa_id → id)
  const itemMap = new Map();
  itensCompra.forEach(ic => {
    const key = normalize(ic.descricao) + '|||' + ic.etapa_id;
    itemMap.set(key, ic.id);
  });

  // 6. Group rows by NÚMERO DO PEDIDO
  const groups = new Map();
  dataRows.forEach(row => {
    const numPedido = row[20];
    if (!numPedido) return;
    const key = String(numPedido);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  console.log(`📦 ${groups.size} pedidos encontrados:`);
  for (const [num, rows] of groups) {
    console.log(`   Pedido ${num}: ${rows.length} itens`);
  }
  console.log();

  // 7. Get next numero_pedido
  const { data: maxResult } = await supabase.from('pedidos')
    .select('numero_pedido')
    .eq('company_id', COMPANY_ID)
    .order('numero_pedido', { ascending: false })
    .limit(1);
  
  let nextNum = (maxResult && maxResult.length > 0 ? maxResult[0].numero_pedido : 0) + 1;
  console.log(`🔢 Próximo numero_pedido: ${nextNum}\n`);

  // 8. Trigger already disabled via MCP

  // 9. Insert pedidos by group
  let totalInserted = 0;
  let totalErrors = 0;
  let allCreatedPedidos = [];
  const unmatchedItems = [];

  const sortedGroups = [...groups.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));

  for (const [excelNum, rows] of sortedGroups) {
    const currentNum = nextNum++;
    console.log(`\n📥 Inserindo Pedido #${currentNum} (Excel: ${excelNum}, ${rows.length} itens)...`);

    const payloads = [];

    for (const row of rows) {
      const etapaNome = normalize(row[0]);
      const itemDescricao = normalize(row[2]);
      const fornecedorNome = normalize(row[11]);

      // Match etapa
      const etapaId = etapaMap.get(etapaNome);
      if (!etapaId) {
        unmatchedItems.push({ type: 'etapa', value: row[0], item: row[2] });
        continue;
      }

      // Match item_compra
      const itemKey = itemDescricao + '|||' + etapaId;
      const itemCompraId = itemMap.get(itemKey);
      if (!itemCompraId) {
        unmatchedItems.push({ type: 'item', value: row[2], etapa: row[0] });
        continue;
      }

      // Match fornecedor
      const fornecedorId = fornecedorNome ? fornecedorMap.get(fornecedorNome) : null;
      if (fornecedorNome && !fornecedorId) {
        unmatchedItems.push({ type: 'fornecedor', value: row[11] });
      }

      const dataEntrega = excelDateToISO(row[19]);
      const condPagamento = row[12] ? String(row[12]) : null;

      payloads.push({
        company_id: COMPANY_ID,
        item_compra_id: itemCompraId,
        fornecedor_id: fornecedorId || null,
        numero_pedido: currentNum,
        casas_lote: row[15] || null,
        qtd_lote: row[16] || null,
        valor_unitario_real: row[17] || null,
        valor_total_real: row[18] || null,
        cond_pagamento: condPagamento,
        data_entrega_prevista: dataEntrega,
        status: 'planejado',
      });
    }

    if (payloads.length === 0) {
      console.log(`   ⚠️ Nenhum item válido para este pedido.`);
      continue;
    }

    // Insert in batches of 50
    for (let i = 0; i < payloads.length; i += 50) {
      const batch = payloads.slice(i, i + 50);
      const { data, error } = await supabase.from('pedidos').insert(batch).select('id, valor_total_real, cond_pagamento, data_entrega_prevista');
      if (error) {
        console.error(`   ❌ Erro no batch ${Math.floor(i/50)+1}:`, error.message);
        totalErrors += batch.length;
      } else {
        allCreatedPedidos.push(...data);
        totalInserted += data.length;
        process.stdout.write(`   ✅ ${Math.min(i + 50, payloads.length)}/${payloads.length} inseridos\r`);
      }
    }
    console.log(`   ✅ ${payloads.length} itens inseridos como Pedido #${currentNum}`);
  }

  // 10. Trigger will be re-enabled via MCP after script completes

  // 11. Generate and insert parcelas
  console.log('\n💳 Gerando parcelas...');
  const allParcelas = [];
  
  for (const pedido of allCreatedPedidos) {
    if (!pedido.valor_total_real || pedido.valor_total_real <= 0) continue;
    if (!pedido.cond_pagamento || !pedido.data_entrega_prevista) continue;
    
    const parcelas = gerarParcelas(
      pedido.id, COMPANY_ID,
      pedido.valor_total_real,
      pedido.cond_pagamento,
      pedido.data_entrega_prevista
    );
    allParcelas.push(...parcelas);
  }

  console.log(`   ${allParcelas.length} parcelas geradas.`);

  if (allParcelas.length > 0) {
    let parcelasInserted = 0;
    for (let i = 0; i < allParcelas.length; i += 100) {
      const batch = allParcelas.slice(i, i + 100);
      const { error } = await supabase.from('parcelas').insert(batch);
      if (error) {
        console.error(`   ❌ Erro ao inserir parcelas batch ${Math.floor(i/100)+1}:`, error.message);
      } else {
        parcelasInserted += batch.length;
      }
    }
    console.log(`   ✅ ${parcelasInserted} parcelas inseridas.`);
  }

  // 12. Report
  console.log('\n═══════════════════════════════════════════');
  console.log('  RELATÓRIO FINAL');
  console.log('═══════════════════════════════════════════');
  console.log(`  Pedidos inseridos: ${totalInserted}`);
  console.log(`  Erros: ${totalErrors}`);
  console.log(`  Parcelas geradas: ${allParcelas.length}`);
  
  if (unmatchedItems.length > 0) {
    console.log(`\n  ⚠️ ${unmatchedItems.length} itens não encontrados:`);
    const byType = {};
    unmatchedItems.forEach(u => {
      if (!byType[u.type]) byType[u.type] = [];
      byType[u.type].push(u);
    });
    for (const [type, items] of Object.entries(byType)) {
      console.log(`\n  Tipo: ${type} (${items.length})`);
      const unique = [...new Set(items.map(i => i.value))];
      unique.slice(0, 10).forEach(v => console.log(`    - "${v}"`));
      if (unique.length > 10) console.log(`    ... e mais ${unique.length - 10}`);
    }
  }

  console.log('\n═══════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
