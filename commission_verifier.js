/**
 * Commission Verifier - Calculate Shortfall
 * 
 * Compares what you SHOULD have been paid vs what you WERE paid
 * and shows the exact amount you were shorted.
 */

class CommissionVerifier {
    constructor() {
        // Commission rates from agreement
        this.commissionRates = {
            '$0-9999': { repeat: 0.02, new: 0.03 },
            '$10000-49999': { repeat: 0.01, new: 0.02 },
            '$50000+': { repeat: 0.005, new: 0.015 }
        };
        
        // Fixed bonuses for tier transitions
        this.tierBonuses = {
            '$10000-49999': 100,  // $100 for hitting $10K
            '$50000+': 300        // $300 for hitting $50K
        };
    }

    /**
     * Main verification function
     * @param {Object} sheets - Excel sheets data
     * @returns {Object} Verification results
     */
    verifyCommission(sheets) {
        console.log('🔍 Starting commission verification...');
        
        // Extract data from both sheets
        const summaryData = this.extractSummaryData(sheets);
        const transactionData = this.extractTransactionData(sheets);
        
        // Calculate what SHOULD be paid
        const shouldBePaid = this.calculateCorrectCommission(transactionData);
        
        // Compare with what WAS paid
        const wasPaid = summaryData.totalPaid;
        const shortfall = shouldBePaid.totalCommission - wasPaid;
        
        console.log(`💰 Should be paid: $${shouldBePaid.totalCommission.toFixed(2)}`);
        console.log(`💸 Was paid: $${wasPaid.toFixed(2)}`);
        console.log(`📉 Shortfall: $${shortfall.toFixed(2)}`);
        
        const results = {
            shouldBePaid: shouldBePaid,
            wasPaid: wasPaid,
            shortfall: shortfall,
            shortfallPercentage: ((shortfall / shouldBePaid.totalCommission) * 100).toFixed(2),
            verification: {
                isUnderpaid: shortfall > 0,
                isOverpaid: shortfall < 0,
                isPaidCorrectly: Math.abs(shortfall) < 0.01
            },
            breakdown: this.createDetailedBreakdown(shouldBePaid, summaryData)
        };

        // Generate visualizations
        const CommissionVisualizer = require('./commission_visualizer');
        const visualizer = new CommissionVisualizer();
        results.visualizations = visualizer.generateVisualizationData(results);

        return results;
    }

    /**
     * Extract summary data (what was paid)
     * @param {Object} sheets - Excel sheets
     * @returns {Object} Summary data
     */
    extractSummaryData(sheets) {
        console.log('📋 Extracting summary data...');
        
        // Look for summary sheet (Sheet2 typically)
        const summarySheet = sheets['Sheet2'] || sheets['Summary'];
        
        if (!summarySheet || !summarySheet.data) {
            throw new Error('Summary sheet not found');
        }
        
        const summaryData = {
            totalPaid: 0,
            stateBreakdown: {},
            rawData: summarySheet.data
        };
        
        // Parse summary sheet to find total commission paid
        summarySheet.data.forEach((row, index) => {
            if (index === 0) return; // Skip header
            
            // Look for commission amounts in the summary
            // Adjust these column indices based on your summary sheet structure
            const state = row[0];
            const amount = parseFloat(row[1]) || 0;
            
            if (state && amount > 0) {
                summaryData.stateBreakdown[state] = amount;
                summaryData.totalPaid += amount;
            }
        });
        
        console.log(`📊 Summary shows total paid: $${summaryData.totalPaid.toFixed(2)}`);
        return summaryData;
    }

    /**
     * Extract transaction data (detailed sales)
     * @param {Object} sheets - Excel sheets
     * @returns {Array} Transaction data
     */
    extractTransactionData(sheets) {
        console.log('📋 Extracting transaction data...');
        
        // Look for detail sheet (Sheet1 typically)
        const detailSheet = sheets['Sheet1'] || sheets['Detail'];
        
        if (!detailSheet || !detailSheet.data) {
            throw new Error('Detail sheet not found');
        }
        
        const transactions = [];
        const headers = detailSheet.headers || detailSheet.data[0];
        
        detailSheet.data.forEach((row, index) => {
            if (index === 0) return; // Skip header
            
            // Create transaction object
            const transaction = {};
            headers.forEach((header, colIndex) => {
                transaction[header] = row[colIndex];
            });
            
            // Only include valid transactions
            if (this.isValidTransaction(transaction)) {
                transactions.push(transaction);
            }
        });
        
        console.log(`📊 Found ${transactions.length} valid transactions`);
        return transactions;
    }

    /**
     * Check if transaction is valid for commission calculation
     * @param {Object} transaction - Transaction to validate
     * @returns {boolean} Is valid
     */
    isValidTransaction(transaction) {
        // Must have revenue amount
        const revenue = parseFloat(transaction['Total Revenue']) || 0;
        if (revenue <= 0) return false;
        
        // Must have state
        const state = transaction['BillToState'] || transaction['ShipToState'];
        if (!state) return false;
        
        // Must be Adam's sale
        if (transaction['SalespersonCode'] !== '00ADM') return false;
        
        return true;
    }

    /**
     * Calculate correct commission based on agreement
     * @param {Array} transactions - Transaction data
     * @returns {Object} Correct commission calculation
     */
    calculateCorrectCommission(transactions) {
        console.log('🧮 Calculating correct commission...');
        
        // Group by state and calculate totals
        const stateData = {};
        
        transactions.forEach(transaction => {
            const state = transaction['ShipToState'] || transaction['BillToState'];
            const revenue = parseFloat(transaction['Total Revenue']) || 0;
            const isNew = transaction['Customer_ Current_Period_New_Product_sales'] === 'Yes';
            
            if (!stateData[state]) {
                stateData[state] = {
                    totalRevenue: 0,
                    newRevenue: 0,
                    repeatRevenue: 0,
                    transactions: []
                };
            }
            
            stateData[state].totalRevenue += revenue;
            stateData[state].transactions.push(transaction);
            
            if (isNew) {
                stateData[state].newRevenue += revenue;
            } else {
                stateData[state].repeatRevenue += revenue;
            }
        });
        
        // Calculate commission for each state
        let totalCommission = 0;
        const stateBreakdown = {};
        
        Object.entries(stateData).forEach(([state, data]) => {
            const tier = this.getTier(data.totalRevenue);
            const rates = this.commissionRates[tier];
            
            const repeatCommission = data.repeatRevenue * rates.repeat;
            const newCommission = data.newRevenue * rates.new;
            const tierBonus = this.tierBonuses[tier] || 0;
            
            const stateTotal = repeatCommission + newCommission + tierBonus;
            
            stateBreakdown[state] = {
                totalRevenue: data.totalRevenue,
                tier: tier,
                repeatRevenue: data.repeatRevenue,
                newRevenue: data.newRevenue,
                repeatCommission: repeatCommission,
                newCommission: newCommission,
                tierBonus: tierBonus,
                totalCommission: stateTotal,
                transactionCount: data.transactions.length
            };
            
            totalCommission += stateTotal;
            
            console.log(`${state}: $${data.totalRevenue.toFixed(2)} revenue → $${stateTotal.toFixed(2)} commission (${tier})`);
        });
        
        return {
            totalCommission,
            stateBreakdown,
            transactionCount: transactions.length
        };
    }

    /**
     * Determine revenue tier
     * @param {number} revenue - Total revenue
     * @returns {string} Tier key
     */
    getTier(revenue) {
        if (revenue >= 50000) return '$50000+';
        if (revenue >= 10000) return '$10000-49999';
        return '$0-9999';
    }

    /**
     * Create detailed breakdown for comparison
     * @param {Object} shouldBePaid - Correct calculation
     * @param {Object} wasPaid - Summary data
     * @returns {Object} Detailed breakdown
     */
    createDetailedBreakdown(shouldBePaid, wasPaid) {
        const breakdown = {
            stateComparison: {},
            discrepancies: []
        };
        
        // Compare each state
        Object.entries(shouldBePaid.stateBreakdown).forEach(([state, correct]) => {
            const paid = wasPaid.stateBreakdown[state] || 0;
            const difference = correct.totalCommission - paid;
            
            breakdown.stateComparison[state] = {
                shouldBePaid: correct.totalCommission,
                wasPaid: paid,
                difference: difference,
                percentageOff: paid > 0 ? ((difference / correct.totalCommission) * 100).toFixed(2) : 'N/A'
            };
            
            if (Math.abs(difference) > 0.01) {
                breakdown.discrepancies.push({
                    state: state,
                    type: difference > 0 ? 'underpaid' : 'overpaid',
                    amount: Math.abs(difference),
                    details: correct
                });
            }
        });
        
        return breakdown;
    }
}

module.exports = CommissionVerifier;

