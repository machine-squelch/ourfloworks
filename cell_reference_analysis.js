const xlsx = require('xlsx');

function analyzeCellReferences(filename = 'ADAM_OCT2024.xlsx') {
    console.log(`📅 ANALYZING: ${filename}`);
    console.log('');

    const workbook = xlsx.readFile(filename);
    const summarySheet = workbook.Sheets['COMMISSION SUMMARY'];

    console.log('=== COMMISSION SUMMARY SHEET CELL ANALYSIS ===');
    console.log('');

    // Extract all cells and their references
    const cellRefs = Object.keys(summarySheet).filter(key => key !== '!ref' && key !== '!margins');

    console.log('📊 KEY COMMISSION CELLS:');
    console.log('');

    // Focus on the commission-related cells in row 4 (where values are)
    const row4Cells = cellRefs.filter(cell => cell.match(/^[A-Z]+4$/));

    row4Cells.forEach(cellRef => {
        const cell = summarySheet[cellRef];
        if (cell && cell.v !== undefined) {
            console.log(`Cell ${cellRef}: ${cell.v} (Type: ${cell.t}, Formula: ${cell.f || 'N/A'})`);
        }
    });

    console.log('');
    console.log('🎯 SPECIFIC COMMISSION VALUES:');

    // Key cells we identified
    const keyCells = {
        'B4': 'Repeat Product Commission',
        'C4': 'New Product Commission',
        'D4': 'Incentive Product Commission',
        'E4': 'Sum of Total Commission',
        'G4': 'Additional State Commission',
        'H4': 'FINAL COMMISSION'
    };

    Object.entries(keyCells).forEach(([cellRef, description]) => {
        const cell = summarySheet[cellRef];
        if (cell) {
            console.log(`${cellRef} (${description}): $${cell.v}`);
        } else {
            console.log(`${cellRef} (${description}): NOT FOUND`);
        }
    });

    console.log('');
    console.log('💰 PAYMENT DISCREPANCY ANALYSIS:');
    console.log('');

    const finalCommission = summarySheet['H4'] ? summarySheet['H4'].v : 0;
    const actualPayment = 2247.21; // The amount you actually received
    const discrepancy = finalCommission - actualPayment;

    console.log(`DL Calculated (Cell H4): $${finalCommission}`);
    console.log(`Actual Payment Received: $${actualPayment}`);
    console.log(`Discrepancy: $${discrepancy.toFixed(2)}`);

    console.log('');
    console.log('🔍 RATE CALCULATION ANALYSIS:');
    console.log('(Looking for commission rate calculation errors in Detail sheet)');

    // Now analyze the detail sheet for rate calculation errors
    const detailSheet = workbook.Sheets['COMMISSION DETAIL'];
    const detailData = xlsx.utils.sheet_to_json(detailSheet, { header: 1, raw: false });

    const headers = detailData[0];
    const stateCol = headers.indexOf('ShipToState');
    const revenueCol = headers.indexOf('Total Revenue');
    const repeatCommCol = headers.indexOf('Repeat Product Commission');
    const newProductCol = headers.indexOf('Customer_ Current_Period_New_Product_sales');

    // Track state revenues and commission rates
    const stateAnalysis = {};

    for (let i = 1; i < detailData.length; i++) {
        const row = detailData[i];
        const state = row[stateCol];
        const revenue = parseFloat(String(row[revenueCol] || 0).replace(/[,$]/g, '')) || 0;
        const repeatComm = parseFloat(String(row[repeatCommCol] || 0).replace(/[,$]/g, '')) || 0;
        const isNewProduct = parseFloat(String(row[newProductCol] || 0).replace(/[,$]/g, '')) > 0;

        if (state && revenue > 0) {
            if (!stateAnalysis[state]) {
                stateAnalysis[state] = {
                    totalRevenue: 0,
                    repeatCommission: 0,
                    newProductRevenue: 0,
                    newProductCommission: 0,
                    transactions: []
                };
            }

            stateAnalysis[state].totalRevenue += revenue;
            stateAnalysis[state].repeatCommission += repeatComm;

            if (isNewProduct) {
                stateAnalysis[state].newProductRevenue += revenue;
                stateAnalysis[state].newProductCommission += repeatComm; // Assuming commission is in repeat column for new products too
            }

            stateAnalysis[state].transactions.push({
                rowIndex: i + 1, // Excel row number (1-based)
                revenue: revenue,
                commission: repeatComm,
                isNewProduct: isNewProduct
            });
        }
    }

    console.log('');
    console.log('📋 STATE-BY-STATE RATE ANALYSIS:');
    console.log('');

    Object.entries(stateAnalysis).forEach(([state, data]) => {
        const avgRate = data.totalRevenue > 0 ? (data.repeatCommission / data.totalRevenue * 100) : 0;

        console.log(`${state}:`);
        console.log(`  Revenue: $${data.totalRevenue.toFixed(2)}`);
        console.log(`  Commission: $${data.repeatCommission.toFixed(2)}`);
        console.log(`  Average Rate: ${avgRate.toFixed(3)}%`);
        console.log(`  Transactions: ${data.transactions.length}`);
        console.log(`  Sample Rows: ${data.transactions.slice(0, 3).map(t => `Row ${t.rowIndex}`).join(', ')}`);
        console.log('');
    });

    return {
        finalCommission,
        actualPayment,
        discrepancy,
        stateAnalysis
    };
}

// Get filename from command line argument or use default
const filename = process.argv[2] || 'ADAM_OCT2024.xlsx';
analyzeCellReferences(filename);