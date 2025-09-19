const xlsx = require('xlsx');

function testExtractNumericValue(row, startIndex) {
    console.log(`Testing extractNumericValue for row=${JSON.stringify(row)}, startIndex=${startIndex}`);

    for (let i = Math.max(0, startIndex - 1); i <= Math.min(row.length - 1, startIndex + 3); i++) {
        const cell = row[i];
        console.log(`  Checking index ${i}: cell="${cell}"`);

        if (cell !== null && cell !== undefined) {
            const num = parseFloat(String(cell).replace(/[,$]/g, ''));
            console.log(`    Parsed as: ${num}, isNaN: ${isNaN(num)}, > 0: ${num > 0}`);

            if (!isNaN(num) && num > 0) {
                console.log(`    FOUND VALUE: ${num}`);
                return num;
            }
        }
    }
    console.log(`    NO VALUE FOUND`);
    return null;
}

function debugFinalCommission() {
    const workbook = xlsx.readFile('ADAM_OCT2024.xlsx');
    const summarySheet = workbook.Sheets['COMMISSION SUMMARY'];
    const data = xlsx.utils.sheet_to_json(summarySheet, { header: 1, raw: false });

    console.log('=== TESTING FINAL COMMISSION EXTRACTION ===');

    data.forEach((row, i) => {
        row.forEach((cell, j) => {
            const cellStr = String(cell || '').toLowerCase();
            if (cellStr.includes('final') && cellStr.includes('commission')) {
                console.log(`\nFound "FINAL COMMISSION" at Row ${i + 1}, Col ${j + 1}: "${cell}"`);
                console.log(`Current row:`, row);
                console.log(`Next row:`, data[i + 1] || []);
                console.log(`Previous row:`, data[i - 1] || []);

                // Test current row extraction
                console.log(`\nTesting current row extraction:`);
                const value1 = testExtractNumericValue(row, j);

                // Test next row extraction
                console.log(`\nTesting next row extraction:`);
                const value2 = testExtractNumericValue(data[i + 1] || [], j);

                // Test previous row extraction
                console.log(`\nTesting previous row extraction:`);
                const value3 = testExtractNumericValue(data[i - 1] || [], j);

                console.log(`\nFinal result: ${value1 || value2 || value3}`);
            }
        });
    });
}

debugFinalCommission();