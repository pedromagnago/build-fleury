const XLSX = require('xlsx');
const fs = require('fs');

const workbook = XLSX.readFile('BD REALIZADO - CONSTRUTORA.xlsx');
console.log('Sheets:', workbook.SheetNames);

workbook.SheetNames.forEach(sheetName => {
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`\n--- Sheet: ${sheetName} ---`);
  console.log('Headers:', data[0]);
  console.log('Row 1:', data[1]);
  console.log('Row 2:', data[2]);
});
