const XLSX = require('xlsx');
const fs = require('fs');
const wb = XLSX.readFile('TEMPLATE_PEDIDOS_PREENCHIDO.xlsx');
const output = {};
wb.SheetNames.forEach(s => {
  const ws = wb.Sheets[s];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1});
  output[s] = rows.slice(0, 30);
});
fs.writeFileSync('excel_output.json', JSON.stringify(output, null, 2));
console.log('Done. Sheets:', wb.SheetNames);
