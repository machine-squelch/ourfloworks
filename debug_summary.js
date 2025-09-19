const xlsx = require('xlsx');

function debugSummarySheet() {
    const workbook = xlsx.readFile('ADAM_OCT2024.xlsx');
    const summarySheetName = 'COMMISSION SUMMARY';

    if (!workbook.SheetNames.includes(summarySheetName)) {
        console.log('No COMMISSION SUMMARY sheet found');
        console.log('Available sheets:', workbook.SheetNames);
        return;
    }

    const summarySheet = workbook.Sheets[summarySheetName];
    const data = xlsx.utils.sheet_to_json(summarySheet, { header: 1, raw: false });

    console.log('=== COMMISSION SUMMARY SHEET CONTENTS ===');

    data.forEach((row, i) => {
        if (row.some(cell => cell !== null && cell !== undefined && cell !== '')) {
            console.log(`Row ${i + 1}:`, row.map((cell, j) => `Col${j + 1}: ${cell || ''}`).filter(str => str !== 'Col' + (str.indexOf(':') + 1) + ': ').join(' | '));
        }
    });

    console.log('\n=== LOOKING FOR COMMISSION VALUES ===');

    data.forEach((row, i) => {
        row.forEach((cell, j) => {
            if (cell && !isNaN(parseFloat(cell))) {
                const num = parseFloat(cell);
                if (num > 0) {
                    console.log(`Row ${i + 1}, Col ${j + 1}: ${cell} -> ${num} (numeric)`);
                }
            }
        });
    });

    console.log('\n=== CHECKING FOR COMMISSION/TOTAL KEYWORDS ===');

    data.forEach((row, i) => {
        row.forEach((cell, j) => {
            const cellStr = String(cell || '').toLowerCase();
            if (cellStr.includes('commission') || cellStr.includes('total')) {
                console.log(`Row ${i + 1}, Col ${j + 1}: "${cell}" (keyword match)`);

                // Check adjacent cells for values
                const nextCell = row[j + 1];
                const nextRowSameCol = data[i + 1] ? data[i + 1][j] : null;
                const prevRowSameCol = data[i - 1] ? data[i - 1][j] : null;

                if (nextCell && !isNaN(parseFloat(nextCell))) {
                    console.log(`  -> Next cell has value: ${nextCell}`);
                }
                if (nextRowSameCol && !isNaN(parseFloat(nextRowSameCol))) {
                    console.log(`  -> Next row same col has value: ${nextRowSameCol}`);
                }
                if (prevRowSameCol && !isNaN(parseFloat(prevRowSameCol))) {
                    console.log(`  -> Prev row same col has value: ${prevRowSameCol}`);
                }
            }
        });
    });
}

debugSummarySheet();