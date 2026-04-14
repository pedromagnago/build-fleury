const XLSX = require('xlsx');
const wb = XLSX.readFile('TEMPLATE_PEDIDOS_PREENCHIDO.xlsx');
const ws = wb.Sheets['Template'];
const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

console.log('Total rows (incluindo header):', allRows.length);
console.log('Header:', JSON.stringify(allRows[0]));

const dataRows = allRows.slice(1).filter(r => r.some(cell => cell != null && cell !== ''));
console.log('Data rows (não-vazias):', dataRows.length);

// Count by pedido number (col 20)
const groups = {};
let nullPedido = 0;
dataRows.forEach(r => {
  const num = r[20];
  if (num == null || num === '' || num === undefined) {
    nullPedido++;
  } else {
    const k = String(num);
    groups[k] = (groups[k] || 0) + 1;
  }
});
console.log('\nDistribuição por NÚMERO DO PEDIDO:');
Object.entries(groups).sort((a,b) => Number(a[0]) - Number(b[0])).forEach(([k,v]) => {
  console.log(`  Pedido ${k}: ${v} linhas`);
});
console.log(`  Sem pedido: ${nullPedido} linhas`);
console.log('  TOTAL:', Object.values(groups).reduce((a,b) => a+b, 0) + nullPedido);

// Show sample of a row WITHOUT pedido number if any
if (nullPedido > 0) {
  const sample = dataRows.find(r => r[20] == null || r[20] === '');
  console.log('\nAmostra de linha SEM pedido:', JSON.stringify(sample));
}
