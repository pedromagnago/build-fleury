const xlsx = require('xlsx');

function check() {
    console.log("Reading excel...");
    const workbook = xlsx.readFile('TEMPLATE_PEDIDOS_PREENCHIDO.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);
    console.log("Total rows:", data.length);
    
    let expectedTotal = 0;
    const totals = { 14: 0, 15: 0, 16: 0, 17: 0 };
    const counts = { 14: 0, 15: 0, 16: 0, 17: 0 };

    data.forEach((row, idx) => {
        const pedidoId = parseInt(row['Nº do Pedido Original']);
        let valorTotalStr = String(row['Valor Total_'] || row['Valor Total '] || '0');
        // Handle comma decimal separator
        let valorTotal = parseFloat(valorTotalStr.replace(/\./g, '').replace(',', '.'));
        if (isNaN(valorTotal)) valorTotal = 0;
        
        if ([14, 15, 16, 17].includes(pedidoId)) {
            expectedTotal += valorTotal;
            totals[pedidoId] += valorTotal;
            counts[pedidoId] += 1;
        }
    });

    console.log('Total in Excel:', expectedTotal.toFixed(3));
    console.log('Totals per order:', totals);
    console.log('Counts per order:', counts);
    console.log('---');
    
    // DB SUMS: 
    // 14: 196 items, total $685296.29
    // 15: 193 items, total $657825.64
    // 16: 37 items, total $152815.70
    // 17: 11 items, total $29533.65
    
    // EXPECTED 440 items (but we got 437)
    // 3 items are missing! Let's find which ones.
}
check();
