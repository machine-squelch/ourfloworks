const xlsx = require('xlsx');

function findRemainingDiscrepancy() {
    const workbook = xlsx.readFile('ADAM_OCT2024.xlsx');
    const detailSheet = workbook.Sheets['COMMISSION DETAIL'];
    const summarySheet = workbook.Sheets['COMMISSION SUMMARY'];

    const detailData = xlsx.utils.sheet_to_json(detailSheet, { header: 1, raw: false });
    const summaryData = xlsx.utils.sheet_to_json(summarySheet, { header: 1, raw: false });

    // Get detail transaction sums
    const headers = detailData[0];
    const repeatCommCol = headers.indexOf('Repeat Product Commission');
    const newCommCol = headers.indexOf('New Product Commission');
    const incentiveCommCol = headers.indexOf('Incentive Product Commission');
    const totalCommCol = headers.indexOf('Total Commission');

    let detailRepeatSum = 0;
    let detailNewSum = 0;
    let detailIncentiveSum = 0;
    let detailTotalSum = 0;

    console.log('=== TRANSACTION DETAIL SUMS ===');

    for (let i = 1; i < detailData.length; i++) {
        const row = detailData[i];

        const repeat = parseFloat(String(row[repeatCommCol] || 0).replace(/[,$]/g, '')) || 0;
        const newProd = parseFloat(String(row[newCommCol] || 0).replace(/[,$]/g, '')) || 0;
        const incentive = parseFloat(String(row[incentiveCommCol] || 0).replace(/[,$]/g, '')) || 0;
        const total = parseFloat(String(row[totalCommCol] || 0).replace(/[,$]/g, '')) || 0;

        detailRepeatSum += repeat;
        detailNewSum += newProd;
        detailIncentiveSum += incentive;
        detailTotalSum += total;
    }

    console.log(`Repeat Product Commission: $${detailRepeatSum.toFixed(2)}`);
    console.log(`New Product Commission: $${detailNewSum.toFixed(2)}`);
    console.log(`Incentive Product Commission: $${detailIncentiveSum.toFixed(2)}`);
    console.log(`Total Commission: $${detailTotalSum.toFixed(2)}`);
    console.log(`Sum check: $${(detailRepeatSum + detailNewSum + detailIncentiveSum).toFixed(2)}`);

    // Get summary sheet values
    console.log('\n=== SUMMARY SHEET VALUES ===');
    console.log('Row 4 (Values):');
    const summaryRow4 = summaryData[3]; // 0-indexed, so row 4 is index 3

    if (summaryRow4) {
        console.log(`Col B - Repeat Product Commission: $${summaryRow4[1] || 'N/A'}`);
        console.log(`Col C - New Product Commission: $${summaryRow4[2] || 'N/A'}`);
        console.log(`Col D - Incentive Product Commission: $${summaryRow4[3] || 'N/A'}`);
        console.log(`Col E - Sum of Total Commission: $${summaryRow4[4] || 'N/A'}`);
        console.log(`Col G - Additional State Commission: $${summaryRow4[6] || 'N/A'}`);
        console.log(`Col H - FINAL COMMISSION: $${summaryRow4[7] || 'N/A'}`);
    }

    // Calculate differences
    console.log('\n=== DETAILED DISCREPANCY ANALYSIS ===');

    const summaryRepeat = parseFloat(String(summaryRow4[1] || 0).replace(/[,$]/g, '')) || 0;
    const summaryNew = parseFloat(String(summaryRow4[2] || 0).replace(/[,$]/g, '')) || 0;
    const summaryIncentive = parseFloat(String(summaryRow4[3] || 0).replace(/[,$]/g, '')) || 0;
    const summarySumTotal = parseFloat(String(summaryRow4[4] || 0).replace(/[,$]/g, '')) || 0;

    console.log(`\n📊 CATEGORY BREAKDOWN:`);
    console.log(`Repeat: Detail $${detailRepeatSum.toFixed(2)} vs Summary $${summaryRepeat.toFixed(2)} = ${(detailRepeatSum - summaryRepeat >= 0 ? '+' : '')}$${(detailRepeatSum - summaryRepeat).toFixed(2)}`);
    console.log(`New: Detail $${detailNewSum.toFixed(2)} vs Summary $${summaryNew.toFixed(2)} = ${(detailNewSum - summaryNew >= 0 ? '+' : '')}$${(detailNewSum - summaryNew).toFixed(2)}`);
    console.log(`Incentive: Detail $${detailIncentiveSum.toFixed(2)} vs Summary $${summaryIncentive.toFixed(2)} = ${(detailIncentiveSum - summaryIncentive >= 0 ? '+' : '')}$${(detailIncentiveSum - summaryIncentive).toFixed(2)}`);

    const totalDiff = detailTotalSum - summarySumTotal;
    console.log(`\n🎯 TOTAL COMMISSION:`);
    console.log(`Detail transactions sum: $${detailTotalSum.toFixed(2)}`);
    console.log(`Summary "Sum of Total": $${summarySumTotal.toFixed(2)}`);
    console.log(`Difference: ${totalDiff >= 0 ? '+' : ''}$${totalDiff.toFixed(2)}`);

    // Check if there are transactions that might be excluded
    console.log(`\n📋 TRANSACTION COUNT:`);
    console.log(`Total detail rows: ${detailData.length - 1}`);
    console.log(`Transactions with commission: ${detailData.slice(1).filter(row => {
        const total = parseFloat(String(row[totalCommCol] || 0).replace(/[,$]/g, '')) || 0;
        return total > 0;
    }).length}`);

    return {
        detailTotalSum,
        summarySumTotal,
        totalDiff: detailTotalSum - summarySumTotal
    };
}

findRemainingDiscrepancy();