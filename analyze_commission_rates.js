const xlsx = require('xlsx');

class CommissionRateAnalyzer {
    constructor() {
        this.commissionRates = {
            tier1: { repeat: 0.02, new: 0.03, bonus: 0 },      // 2%, 3%
            tier2: { repeat: 0.01, new: 0.02, bonus: 100 },    // 1%, 2%
            tier3: { repeat: 0.005, new: 0.015, bonus: 300 }   // 0.5%, 1.5%
        };
    }

    getStateTier(salesAmount) {
        if (salesAmount >= 50000) return 'tier3';
        if (salesAmount >= 10000) return 'tier2';
        return 'tier1';
    }

    analyzeRates() {
        const workbook = xlsx.readFile('ADAM_OCT2024.xlsx');
        const detailSheet = workbook.Sheets['COMMISSION DETAIL'];
        const data = xlsx.utils.sheet_to_json(detailSheet, { header: 1, raw: false });

        // Create header map
        const headers = data[0];
        const headerMap = {};
        headers.forEach((header, index) => {
            if (header) headerMap[header] = index;
        });

        // Get column indices
        const stateCol = headerMap['ShipToState'];
        const revenueCol = headerMap['Total Revenue'];
        const repeatCommCol = headerMap['Repeat Product Commission'];
        const newCommCol = headerMap['New Product Commission'];

        // Group by state
        const stateData = {};

        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const state = row[stateCol];
            const revenue = parseFloat(String(row[revenueCol] || 0).replace(/[,$]/g, '')) || 0;
            const repeatComm = parseFloat(String(row[repeatCommCol] || 0).replace(/[,$]/g, '')) || 0;
            const newComm = parseFloat(String(row[newCommCol] || 0).replace(/[,$]/g, '')) || 0;

            if (!state || revenue <= 0) continue;

            if (!stateData[state]) {
                stateData[state] = {
                    totalRevenue: 0,
                    repeatRevenue: 0,
                    newRevenue: 0,
                    repeatCommission: 0,
                    newCommission: 0,
                    transactions: []
                };
            }

            stateData[state].totalRevenue += revenue;

            if (repeatComm > 0) {
                stateData[state].repeatRevenue += revenue;
                stateData[state].repeatCommission += repeatComm;
            }

            if (newComm > 0) {
                stateData[state].newRevenue += revenue;
                stateData[state].newCommission += newComm;
            }

            stateData[state].transactions.push({
                revenue, repeatComm, newComm
            });
        }

        console.log('=== COMMISSION RATE ANALYSIS BY STATE ===\n');

        for (const [state, data] of Object.entries(stateData)) {
            const tier = this.getStateTier(data.totalRevenue);
            const expectedRates = this.commissionRates[tier];

            console.log(`🏛️  STATE: ${state}`);
            console.log(`💰 Total Sales: $${data.totalRevenue.toFixed(2)}`);
            console.log(`⭐ Tier: ${tier.toUpperCase()}`);
            console.log(`📋 Expected Rates: Repeat ${(expectedRates.repeat * 100).toFixed(1)}%, New ${(expectedRates.new * 100).toFixed(1)}%`);

            // Calculate actual rates used by DL
            let actualRepeatRate = 0;
            let actualNewRate = 0;

            if (data.repeatRevenue > 0) {
                actualRepeatRate = (data.repeatCommission / data.repeatRevenue) * 100;
            }
            if (data.newRevenue > 0) {
                actualNewRate = (data.newCommission / data.newRevenue) * 100;
            }

            console.log(`🧮 DL's Actual Rates:`);
            if (data.repeatRevenue > 0) {
                console.log(`   Repeat: ${actualRepeatRate.toFixed(3)}% (on $${data.repeatRevenue.toFixed(2)} = $${data.repeatCommission.toFixed(2)})`);
                const expectedRepeatComm = data.repeatRevenue * expectedRates.repeat;
                const repeatDiff = data.repeatCommission - expectedRepeatComm;
                console.log(`   Expected: ${(expectedRates.repeat * 100).toFixed(1)}% = $${expectedRepeatComm.toFixed(2)}`);
                console.log(`   Difference: ${repeatDiff >= 0 ? '+' : ''}$${repeatDiff.toFixed(2)}`);
            }

            if (data.newRevenue > 0) {
                console.log(`   New: ${actualNewRate.toFixed(3)}% (on $${data.newRevenue.toFixed(2)} = $${data.newCommission.toFixed(2)})`);
                const expectedNewComm = data.newRevenue * expectedRates.new;
                const newDiff = data.newCommission - expectedNewComm;
                console.log(`   Expected: ${(expectedRates.new * 100).toFixed(1)}% = $${expectedNewComm.toFixed(2)}`);
                console.log(`   Difference: ${newDiff >= 0 ? '+' : ''}$${newDiff.toFixed(2)}`);
            }

            console.log(`\n${'='.repeat(60)}\n`);
        }
    }
}

const analyzer = new CommissionRateAnalyzer();
analyzer.analyzeRates();