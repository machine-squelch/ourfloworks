const xlsx = require('xlsx');

function comprehensiveAnalysis(filename = 'ADAM_JAN2024.xlsx') {
    console.log(`🔍 COMPREHENSIVE DISCREPANCY ANALYSIS: ${filename}`);
    console.log('=' .repeat(60));
    console.log('');

    const workbook = xlsx.readFile(filename);

    // Try different sheet name variations
    let summarySheetName = 'COMMISSION SUMMARY';
    let detailSheetName = 'COMMISSION DETAIL';

    if (!workbook.Sheets[summarySheetName]) {
        summarySheetName = 'SUMMARY';
        detailSheetName = 'DETAIL';
    }

    const summarySheet = workbook.Sheets[summarySheetName];
    const detailSheet = workbook.Sheets[detailSheetName];

    console.log('📊 STEP 1: WHAT DL REPORTED IN SUMMARY SHEET');
    console.log('');

    // Get all cells from summary sheet
    const summaryData = xlsx.utils.sheet_to_json(summarySheet, { header: 1, raw: false });

    console.log('Summary Sheet Structure:');
    summaryData.slice(0, 8).forEach((row, i) => {
        console.log(`Row ${i + 1}: [${row.map(cell => cell || 'EMPTY').join(' | ')}]`);
    });

    console.log('');
    console.log('🎯 STEP 2: KEY DL REPORTED VALUES');
    console.log('');

    // Find "Amount Due Salesperson" or similar
    let amountDueSalesperson = 0;
    let amountDueCell = '';
    let finalCommission = 0;
    let finalCommissionCell = '';
    let stateBonus = 0;
    let stateBonusCell = '';

    for (let rowIndex = 0; rowIndex < summaryData.length; rowIndex++) {
        const row = summaryData[rowIndex];
        for (let colIndex = 0; colIndex < row.length; colIndex++) {
            const cellValue = String(row[colIndex] || '').toLowerCase();

            // Look for "Amount Due Salesperson"
            if (cellValue.includes('amount due') || cellValue.includes('due salesperson')) {
                // Check adjacent cells for the value
                if (row[colIndex + 1]) {
                    amountDueSalesperson = parseFloat(String(row[colIndex + 1]).replace(/[,$]/g, '')) || 0;
                    amountDueCell = xlsx.utils.encode_cell({ r: rowIndex, c: colIndex + 1 });
                }
                console.log(`Found "${cellValue}" in Cell ${xlsx.utils.encode_cell({ r: rowIndex, c: colIndex })}: $${amountDueSalesperson}`);
            }

            // Look for Final Commission variations
            if (cellValue.includes('final') && cellValue.includes('commission')) {
                if (row[colIndex + 1]) {
                    finalCommission = parseFloat(String(row[colIndex + 1]).replace(/[,$]/g, '')) || 0;
                    finalCommissionCell = xlsx.utils.encode_cell({ r: rowIndex, c: colIndex + 1 });
                }
                console.log(`Found "${cellValue}" in Cell ${xlsx.utils.encode_cell({ r: rowIndex, c: colIndex })}: $${finalCommission}`);
            }

            // Look for State Bonus
            if ((cellValue.includes('state') && cellValue.includes('commission')) ||
                (cellValue.includes('additional') && cellValue.includes('state'))) {
                if (row[colIndex + 1]) {
                    stateBonus = parseFloat(String(row[colIndex + 1]).replace(/[,$]/g, '')) || 0;
                    stateBonusCell = xlsx.utils.encode_cell({ r: rowIndex, c: colIndex + 1 });
                }
                console.log(`Found "${cellValue}" in Cell ${xlsx.utils.encode_cell({ r: rowIndex, c: colIndex })}: $${stateBonus}`);
            }
        }
    }

    console.log('');
    console.log('💰 STEP 3: DL\'S REPORTED AMOUNTS');
    console.log('');
    console.log(`Amount Due Salesperson (Cell ${amountDueCell}): $${amountDueSalesperson.toFixed(2)}`);
    console.log(`Final Commission (Cell ${finalCommissionCell}): $${finalCommission.toFixed(2)}`);
    console.log(`State Bonus (Cell ${stateBonusCell}): $${stateBonus.toFixed(2)}`);

    console.log('');
    console.log('🧮 STEP 4: CLAUDE\'S RECALCULATION FROM DETAIL SHEET');
    console.log('');

    // Process detail sheet
    const detailData = xlsx.utils.sheet_to_json(detailSheet, { header: 1, raw: false });
    const headers = detailData[0];

    console.log('Detail Sheet Headers:');
    headers.forEach((header, i) => {
        console.log(`  Col ${String.fromCharCode(65 + i)}: "${header}"`);
    });

    // Find relevant columns
    const stateCol = headers.findIndex(h => String(h).toLowerCase().includes('state'));
    const revenueCol = headers.findIndex(h =>
        String(h).toLowerCase().includes('revenue') ||
        String(h).toLowerCase().includes('total revenue')
    );
    const commissionCol = headers.findIndex(h =>
        String(h).toLowerCase().includes('commission') &&
        !String(h).toLowerCase().includes('repeat')
    );
    const repeatCommCol = headers.findIndex(h =>
        String(h).toLowerCase().includes('repeat') &&
        String(h).toLowerCase().includes('commission')
    );

    console.log('');
    console.log(`State Column: ${stateCol >= 0 ? String.fromCharCode(65 + stateCol) + ' - ' + headers[stateCol] : 'NOT FOUND'}`);
    console.log(`Revenue Column: ${revenueCol >= 0 ? String.fromCharCode(65 + revenueCol) + ' - ' + headers[revenueCol] : 'NOT FOUND'}`);
    console.log(`Commission Column: ${commissionCol >= 0 ? String.fromCharCode(65 + commissionCol) + ' - ' + headers[commissionCol] : 'NOT FOUND'}`);
    console.log(`Repeat Commission Column: ${repeatCommCol >= 0 ? String.fromCharCode(65 + repeatCommCol) + ' - ' + headers[repeatCommCol] : 'NOT FOUND'}`);

    // Calculate state totals
    const stateAnalysis = {};
    let totalDetailCommission = 0;

    for (let i = 1; i < detailData.length && i < 1000; i++) { // Limit for performance
        const row = detailData[i];
        const state = stateCol >= 0 ? row[stateCol] : '';
        const revenue = revenueCol >= 0 ? parseFloat(String(row[revenueCol] || 0).replace(/[,$]/g, '')) || 0 : 0;
        const commission = commissionCol >= 0 ? parseFloat(String(row[commissionCol] || 0).replace(/[,$]/g, '')) || 0 : 0;

        if (state && revenue > 0) {
            if (!stateAnalysis[state]) {
                stateAnalysis[state] = { revenue: 0, commission: 0, transactions: 0 };
            }
            stateAnalysis[state].revenue += revenue;
            stateAnalysis[state].commission += commission;
            stateAnalysis[state].transactions++;
        }

        totalDetailCommission += commission;
    }

    console.log('');
    console.log('📈 CLAUDE\'S CALCULATED STATE TOTALS:');
    Object.entries(stateAnalysis).forEach(([state, data]) => {
        const rate = data.revenue > 0 ? (data.commission / data.revenue * 100) : 0;
        console.log(`${state}: Revenue $${data.revenue.toFixed(2)}, Commission $${data.commission.toFixed(2)}, Rate ${rate.toFixed(3)}%`);
    });

    console.log('');
    console.log('🎯 STEP 5: THE ACTUAL DISCREPANCY BREAKDOWN');
    console.log('');

    const claudeTotal = totalDetailCommission;
    const dlReportedCommission = Math.max(finalCommission, amountDueSalesperson - stateBonus);

    console.log(`DL's Reported Commission (excluding state bonus): $${dlReportedCommission.toFixed(2)}`);
    console.log(`Claude's Detail Sheet Sum: $${claudeTotal.toFixed(2)}`);
    console.log(`Commission Calculation Difference: $${(claudeTotal - dlReportedCommission).toFixed(2)}`);
    console.log('');
    console.log(`DL's Reported State Bonus: $${stateBonus.toFixed(2)}`);
    console.log(`DL's Total Amount Due: $${amountDueSalesperson.toFixed(2)}`);
    console.log('');

    console.log('🔍 STEP 6: ANSWER TO YOUR QUESTIONS');
    console.log('');
    console.log('Q: Why does "Amount Due Salesperson" show $326.53 but only $40 in calculation errors?');
    console.log(`A: Amount Due ($${amountDueSalesperson.toFixed(2)}) includes BOTH commission AND state bonus.`);
    console.log(`   Commission portion: $${(amountDueSalesperson - stateBonus).toFixed(2)}`);
    console.log(`   State bonus portion: $${stateBonus.toFixed(2)}`);
    console.log('');
    console.log('Q: Are state bonuses based on DL\'s reporting or Claude\'s calculations?');
    console.log(`A: Currently using DL's reported state bonus of $${stateBonus.toFixed(2)} from cell ${stateBonusCell}`);
    console.log('   This should be verified against Claude\'s state revenue calculations.');

    return {
        dlAmountDue: amountDueSalesperson,
        dlStateBonus: stateBonus,
        dlCommission: dlReportedCommission,
        claudeCommission: claudeTotal,
        stateAnalysis
    };
}

// Get filename from command line argument or use default
const filename = process.argv[2] || 'ADAM_JAN2024.xlsx';
comprehensiveAnalysis(filename);