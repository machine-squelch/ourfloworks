const xlsx = require('xlsx');

function debugTransactions() {
    const workbook = xlsx.readFile('ADAM_OCT2024.xlsx');
    const detailSheet = workbook.Sheets['COMMISSION DETAIL'];
    const data = xlsx.utils.sheet_to_json(detailSheet, { header: 1, raw: false });

    console.log('=== COMMISSION DETAIL SHEET ANALYSIS ===');
    console.log('Headers (Row 1):', data[0]);
    console.log('\n=== SAMPLE TRANSACTIONS ===');

    // Show first 5 transactions
    for (let i = 1; i <= 5 && i < data.length; i++) {
        const row = data[i];
        console.log(`\nTransaction ${i}:`);

        // Map headers to values
        const headers = data[0];
        headers.forEach((header, j) => {
            if (header && row[j]) {
                console.log(`  ${header}: ${row[j]}`);
            }
        });
    }

    console.log('\n=== COMMISSION COLUMN ANALYSIS ===');

    // Find commission-related columns
    const headers = data[0];
    const commissionCols = [];
    headers.forEach((header, i) => {
        if (header && String(header).toLowerCase().includes('commission')) {
            commissionCols.push({ index: i, name: header });
            console.log(`Found commission column ${i}: "${header}"`);
        }
    });

    console.log('\n=== COMMISSION VALUES SAMPLE ===');

    // Show commission values for first 10 transactions
    for (let i = 1; i <= 10 && i < data.length; i++) {
        const row = data[i];
        console.log(`\nRow ${i + 1}:`);

        commissionCols.forEach(col => {
            const value = row[col.index];
            if (value) {
                console.log(`  ${col.name}: ${value}`);
            }
        });
    }

    // Count types of transactions
    console.log('\n=== TRANSACTION TYPE ANALYSIS ===');
    let repeatCount = 0;
    let newCount = 0;
    let incentiveCount = 0;
    let totalCommissionSum = 0;
    let repeatCommissionSum = 0;

    const totalCommissionIndex = headers.findIndex(h =>
        String(h || '').toLowerCase() === 'total commission'
    );
    const repeatCommissionIndex = headers.findIndex(h =>
        String(h || '').toLowerCase() === 'repeat product commission'
    );

    console.log(`Total Commission column index: ${totalCommissionIndex}`);
    console.log(`Repeat Product Commission column index: ${repeatCommissionIndex}`);

    for (let i = 1; i < data.length; i++) {
        const row = data[i];

        const totalCommission = parseFloat(String(row[totalCommissionIndex] || 0).replace(/[,$]/g, '')) || 0;
        const repeatCommission = parseFloat(String(row[repeatCommissionIndex] || 0).replace(/[,$]/g, '')) || 0;

        if (totalCommission > 0) {
            totalCommissionSum += totalCommission;
        }
        if (repeatCommission > 0) {
            repeatCommissionSum += repeatCommission;
            repeatCount++;
        }
    }

    console.log(`\nSUMMARY:`);
    console.log(`Total transactions with commission: ${data.length - 1}`);
    console.log(`Repeat product transactions: ${repeatCount}`);
    console.log(`Sum of Total Commission column: $${totalCommissionSum.toFixed(2)}`);
    console.log(`Sum of Repeat Product Commission column: $${repeatCommissionSum.toFixed(2)}`);
}

debugTransactions();