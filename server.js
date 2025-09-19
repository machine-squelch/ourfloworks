const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { Parser } = require('json2csv');

const app = express();
const PORT = process.env.PORT || 8085;

// Basic middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());
app.use(express.static('public'));

// Multer configuration for Excel files
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB for Excel files
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.xlsx', '.xls'];
        const fileExtension = path.extname(file.originalname).toLowerCase();

        if (allowedTypes.includes(fileExtension)) {
            cb(null, true);
        } else {
            cb(new Error('Only Excel files (.xlsx, .xls) are allowed'), false);
        }
    }
});

// Excel Processing Class
class ExcelProcessor {
    constructor() {
        this.commissionRates = {
            tier1: { repeat: 0.02, new: 0.03, bonus: 0 },
            tier2: { repeat: 0.01, new: 0.02, bonus: 100 },
            tier3: { repeat: 0.005, new: 0.015, bonus: 300 }
        };
        this.incentiveRate = 0.03;
    }

    // Process Excel file and extract both Summary and Detail sheets
    async processExcelFile(filePath) {
        try {
            console.log('Reading Excel file:', filePath);

            const workbook = xlsx.readFile(filePath, { cellDates: true });
            const sheetNames = workbook.SheetNames;

            console.log('Available sheets:', sheetNames);

            // Find Summary and Detail sheets with flexible naming
            const summarySheet = this.findSheet(sheetNames, ['summary', '1', 'sheet1']);
            const detailSheet = this.findSheet(sheetNames, ['detail', 'details', '2', 'sheet2']);

            if (!summarySheet || !detailSheet) {
                throw new Error(`Required sheets not found. Found: ${sheetNames.join(', ')}. Need Summary/Detail or 1/2 sheets.`);
            }

            console.log(`Using Summary sheet: "${summarySheet}", Detail sheet: "${detailSheet}"`);

            // Process Summary sheet to get reported commission
            const summaryData = this.processSummarySheet(workbook.Sheets[summarySheet]);

            // Process Detail sheet to calculate commission
            const detailData = this.processDetailSheet(workbook.Sheets[detailSheet]);

            // Verify commission calculation
            const results = this.calculateCommissionVerification(summaryData, detailData);

            return results;

        } catch (error) {
            console.error('Excel processing error:', error);
            throw error;
        }
    }

    // Find sheet with flexible naming
    findSheet(sheetNames, possibleNames) {
        for (const name of possibleNames) {
            const found = sheetNames.find(sheet =>
                sheet.toLowerCase().trim() === name.toLowerCase() ||
                sheet.toLowerCase().includes(name.toLowerCase())
            );
            if (found) return found;
        }
        return null;
    }

    // Process Summary sheet to extract reported commission
    processSummarySheet(worksheet) {
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
        let reportedCommission = 0;
        let stateBonuses = 0;
        let currentPriority = 0; // Track priority of current commission value

        // Comprehensive DL reporting capture
        let dlReported = {
            amountDueSalesperson: { value: 0, cell: '', found: false },
            finalCommission: { value: 0, cell: '', found: false },
            repeatCommission: { value: 0, cell: '', found: false },
            newProductCommission: { value: 0, cell: '', found: false },
            incentiveCommission: { value: 0, cell: '', found: false },
            sumTotalCommission: { value: 0, cell: '', found: false },
            stateBonus: { value: 0, cell: '', found: false },
            totalRevenue: { value: 0, cell: '', found: false }
        };

        console.log('Processing Summary sheet...');
        console.log('Summary sheet data preview:');

        // Log first 20 rows to understand structure
        for (let i = 0; i < Math.min(20, data.length); i++) {
            const row = data[i];
            if (row && row.length > 0) {
                console.log(`Row ${i + 1}:`, row.filter(cell => cell !== null && cell !== undefined && cell !== ''));
            }
        }

        // Helper function to get Excel cell reference
        const getCellRef = (row, col) => {
            return String.fromCharCode(65 + col) + (row + 1);
        };

        // Look for all DL reported values in the summary sheet
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;

            for (let j = 0; j < row.length; j++) {
                const cell = row[j];
                if (!cell) continue;

                const cellStr = String(cell).toLowerCase();
                const cellRef = getCellRef(i, j);

                // Look for specific DL reported fields - prioritize main commission totals
                if (cellStr.includes('total commission') || cellStr.includes('commission total')) {
                    const value = this.extractNumericValue(row, j + 1) || this.extractNumericValue(data[i + 1] || [], j);
                    if (value && value > 0) {
                        dlReported.finalCommission = { value, cell: getCellRef(i, j + 1), found: true };
                        console.log(`Found Total Commission: "${cell}" = $${value.toFixed(2)} (Cell ${dlReported.finalCommission.cell})`);

                        // Update legacy reportedCommission for backward compatibility
                        if (currentPriority <= 4) {
                            reportedCommission = value;
                            currentPriority = 4;
                        }
                    }
                }
                else if (cellStr.includes('amount due') && cellStr.includes('salesperson')) {
                    const value = this.extractNumericValue(row, j + 1) || this.extractNumericValue(data[i + 1] || [], j);
                    if (value && value > 0) {
                        dlReported.amountDueSalesperson = { value, cell: getCellRef(i, j + 1), found: true };
                        console.log(`Found Amount Due Salesperson: "${cell}" = $${value.toFixed(2)} (Cell ${dlReported.amountDueSalesperson.cell})`);
                    }
                }
                else if (cellStr.includes('final') && cellStr.includes('commission')) {
                    // Look in the same column but next row for the actual value
                    const nextRow = data[i + 1] || [];
                    const value = nextRow[j]; // Get exact same column position in next row
                    if (value && value > 0) {
                        dlReported.finalCommission = { value, cell: getCellRef(i + 1, j), found: true };
                        console.log(`Found Final Commission: "${cell}" = $${value.toFixed(2)} (Cell ${dlReported.finalCommission.cell}) - Raw value: ${value}`);

                        // Update legacy reportedCommission for backward compatibility
                        if (currentPriority <= 3) {
                            reportedCommission = value;
                            currentPriority = 3;
                        }
                    }
                }
                else if (cellStr.includes('repeat') && cellStr.includes('commission')) {
                    const value = this.extractNumericValue(row, j + 1) || this.extractNumericValue(data[i + 1] || [], j);
                    if (value && value > 0) {
                        dlReported.repeatCommission = { value, cell: getCellRef(i, j + 1), found: true };
                        console.log(`Found Repeat Commission: "${cell}" = $${value.toFixed(2)} (Cell ${dlReported.repeatCommission.cell})`);
                    }
                }
                else if (cellStr.includes('new product commission') || (cellStr.includes('new') && cellStr.includes('commission'))) {
                    const value = this.extractNumericValue(row, j + 1) || this.extractNumericValue(data[i + 1] || [], j);
                    if (value && value > 0) {
                        dlReported.newProductCommission = { value, cell: getCellRef(i, j + 1), found: true };
                        console.log(`Found New Product Commission: "${cell}" = $${value.toFixed(2)} (Cell ${dlReported.newProductCommission.cell})`);
                    }
                }
                else if (cellStr.includes('incentive') && cellStr.includes('commission')) {
                    const value = this.extractNumericValue(row, j + 1) || this.extractNumericValue(data[i + 1] || [], j);
                    if (value && value > 0) {
                        dlReported.incentiveCommission = { value, cell: getCellRef(i, j + 1), found: true };
                        console.log(`Found Incentive Commission: "${cell}" = $${value.toFixed(2)} (Cell ${dlReported.incentiveCommission.cell})`);
                    }
                }
                else if (cellStr.includes('sum of total commission') || (cellStr.includes('sum') && cellStr.includes('total') && cellStr.includes('commission'))) {
                    const value = this.extractNumericValue(row, j + 1) || this.extractNumericValue(data[i + 1] || [], j);
                    if (value && value > 0) {
                        dlReported.sumTotalCommission = { value, cell: getCellRef(i, j + 1), found: true };
                        console.log(`Found Sum of Total Commission: "${cell}" = $${value.toFixed(2)} (Cell ${dlReported.sumTotalCommission.cell})`);

                        // Update legacy reportedCommission for backward compatibility if no final commission found
                        if (currentPriority <= 2) {
                            reportedCommission = value;
                            currentPriority = 2;
                        }
                    }
                }
                else if ((cellStr.includes('additional state') && cellStr.includes('commission')) ||
                         (cellStr.includes('state') && cellStr.includes('bonus'))) {
                    const value = this.extractNumericValue(row, j + 1) || this.extractNumericValue(data[i + 1] || [], j);
                    if (value && value > 0) {
                        dlReported.stateBonus = { value, cell: getCellRef(i, j + 1), found: true };
                        stateBonuses += value;
                        console.log(`Found State Bonus: "${cell}" = $${value.toFixed(2)} (Cell ${dlReported.stateBonus.cell})`);
                    }
                }
                else if (cellStr.includes('commission') && (cellStr.includes('total') || cellStr.includes('grand') || cellStr.includes('sum'))) {
                    const value = this.extractNumericValue(row, j + 1) || this.extractNumericValue(data[i + 1] || [], j);
                    if (value && value > 0) {
                        dlReported.finalCommission = { value, cell: getCellRef(i, j + 1), found: true };
                        console.log(`Found Commission Total: "${cell}" = $${value.toFixed(2)} (Cell ${dlReported.finalCommission.cell})`);

                        // Update legacy reportedCommission for backward compatibility
                        if (currentPriority <= 3) {
                            reportedCommission = value;
                            currentPriority = 3;
                        }
                    }
                }
                else if (cellStr.includes('total revenue')) {
                    const value = this.extractNumericValue(row, j + 1) || this.extractNumericValue(data[i + 1] || [], j);
                    if (value && value > 0) {
                        dlReported.totalRevenue = { value, cell: getCellRef(i, j + 1), found: true };
                        console.log(`Found Total Revenue: "${cell}" = $${value.toFixed(2)} (Cell ${dlReported.totalRevenue.cell})`);
                    }
                }
            }
        }

        return {
            reportedCommission,
            stateBonuses,
            summaryFound: reportedCommission > 0,
            dlReported: dlReported
        };
    }

    // Extract numeric value from same column (exact index)
    extractSameColumnValue(row, index) {
        if (!row || index >= row.length) return null;

        const cell = row[index];
        if (cell !== null && cell !== undefined) {
            const num = parseFloat(String(cell).replace(/[,$]/g, ''));
            if (!isNaN(num) && num > 0) {
                return num;
            }
        }
        return null;
    }

    // Extract numeric value from a cell or nearby cells
    extractNumericValue(row, startIndex) {
        for (let i = Math.max(0, startIndex - 1); i <= Math.min(row.length - 1, startIndex + 3); i++) {
            const cell = row[i];
            if (cell !== null && cell !== undefined) {
                const num = parseFloat(String(cell).replace(/[,$]/g, ''));
                if (!isNaN(num) && num > 0) {
                    return num;
                }
            }
        }
        return null;
    }

    // Process Detail sheet to extract transaction data
    processDetailSheet(worksheet) {
        const jsonData = xlsx.utils.sheet_to_json(worksheet);

        console.log(`Processing ${jsonData.length} detail records...`);

        if (jsonData.length === 0) {
            return [];
        }

        // Log first row to understand structure
        console.log('Detail sheet columns:', Object.keys(jsonData[0]));

        const transactions = [];
        const state_totals = {};

        // Field mapping - try to find the right columns flexibly
        for (const row of jsonData) {
            try {
                const transaction = this.extractTransactionData(row);

                if (transaction && transaction.ship_to_state && transaction.total_discounted_sales > 0) {
                    transactions.push(transaction);

                    const state = transaction.ship_to_state;
                    state_totals[state] = (state_totals[state] || 0) + transaction.total_discounted_sales;
                }
            } catch (error) {
                console.error('Error processing transaction row:', error);
            }
        }

        console.log(`Processed ${transactions.length} valid transactions across ${Object.keys(state_totals).length} states`);

        return { transactions, state_totals };
    }

    // Extract transaction data from a row with flexible field matching
    extractTransactionData(row) {
        // Flexible field matching
        const getField = (possibleNames) => {
            for (const name of possibleNames) {
                const key = Object.keys(row).find(k =>
                    k.toLowerCase().includes(name.toLowerCase()) ||
                    this.normalizeFieldName(k) === this.normalizeFieldName(name)
                );
                if (key && row[key] !== null && row[key] !== undefined && row[key] !== '') {
                    return row[key];
                }
            }
            return null;
        };

        // Extract fields with multiple possible names
        const shipToState = getField(['ship to state', 'state', 'shiptostate', 'ship_to_state']);
        const customerNo = getField(['customer no', 'customer', 'customerno', 'customer_no']);

        // Try to extract DL's already-calculated commission values
        const dlRepeatCommission = getField(['repeat product commission', 'repeat commission']);
        const dlTotalCommission = getField(['total commission']);
        const invoiceNo = getField(['invoice no', 'invoice', 'invoiceno', 'invoice_no']);
        const itemCode = getField(['item code', 'item', 'itemcode', 'item_code', 'part', 'sku']);

        // Calculate sales amount
        let salesAmount = 0;

        // Try multiple approaches to get sales amount
        const totalRevenue = getField(['total discounted revenue', 'revenue', 'total', 'net amount', 'line total']);
        if (totalRevenue) {
            salesAmount = parseFloat(String(totalRevenue).replace(/[,$]/g, '')) || 0;
        } else {
            // Calculate from quantity * unit price - discount
            const quantity = parseFloat(getField(['quantity', 'qty', 'quantityshipped', 'quantity_shipped']) || 0);
            const unitPrice = parseFloat(String(getField(['unit price', 'price', 'unitprice', 'unit_price']) || 0).replace(/[,$]/g, ''));
            const discount = parseFloat(String(getField(['line discount', 'discount', 'line_discount_amt']) || 0).replace(/[,$]/g, ''));

            salesAmount = (quantity * unitPrice) - discount;
        }

        // Determine commission type
        let isRepeat = false;
        let isNew = false;
        let isIncentive = false;

        // Look for commission type indicators
        const purchaseType = getField(['purchase type', 'type', 'customer type']);
        const commissionType = getField(['commission type', 'comm type']);

        if (purchaseType) {
            const typeStr = String(purchaseType).toLowerCase();
            isRepeat = typeStr.includes('repeat') || typeStr.includes('existing');
            isNew = typeStr.includes('new');
        }

        // Check for incentive indicators
        const incentiveFlag = getField(['incentive', 'incentivized', 'is incentive']);
        if (incentiveFlag) {
            isIncentive = this.parseBooleanField(incentiveFlag);
        }

        // Extract commission values directly from each column instead of classifying
        const repeatCommission = parseFloat(String(getField(['repeat product commission', 'repeat commission']) || 0).replace(/[,$]/g, '')) || 0;
        const newCommission = parseFloat(String(getField(['new product commission']) || 0).replace(/[,$]/g, '')) || 0;
        const incentiveCommission = parseFloat(String(getField(['incentive product commission', 'incentive commission']) || 0).replace(/[,$]/g, '')) || 0;
        const totalCommission = parseFloat(String(getField(['total commission', 'commission']) || 0).replace(/[,$]/g, '')) || 0;

        return {
            customer_no: customerNo || '',
            ship_to_state: shipToState,
            invoice_no: invoiceNo || '',
            item_code: itemCode || '',
            total_discounted_sales: salesAmount,
            repeat_commission: repeatCommission,
            new_commission: newCommission,
            incentive_commission: incentiveCommission,
            total_commission: totalCommission,
            // Keep legacy fields for compatibility but derive from commission amounts
            is_repeat_product: repeatCommission > 0,
            is_new_product: newCommission > 0,
            is_incentive: incentiveCommission > 0,
            reported_commission: totalCommission
        };
    }

    normalizeFieldName(name) {
        return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    parseBooleanField(value) {
        if (!value) return false;
        const str = String(value).toLowerCase().trim();
        return str === 'true' || str === '1' || str === 'yes' || parseFloat(str) > 0;
    }

    // Calculate commission verification results
    calculateCommissionVerification(summaryData, detailData) {
        const { transactions, state_totals } = detailData;

        let total_calculated_commission = 0;
        let total_state_bonuses = 0;

        // Use DL's reported values ONLY from summary sheet - no calculations
        const dl_totals = {
            // Get DL's final commission total from summary sheet
            totalCommission: summaryData.dlReported.finalCommission.value ||
                           summaryData.reportedCommission,
            // Get DL's breakdown from summary sheet
            repeatCommission: summaryData.dlReported.repeatCommission.value || 0,
            newCommission: summaryData.dlReported.newProductCommission.value || 0,
            incentiveCommission: summaryData.dlReported.incentiveCommission.value || 0,
            stateBonus: summaryData.dlReported.stateBonus.value || 0
        };

        // Track states with transactions for proportional DL state bonus allocation
        const statesWithTransactions = new Set();
        let totalClaudeStateBonus = 0;

        console.log('DL Summary Sheet Values:', dl_totals);

        const commission_breakdown = {
            repeat: 0,
            new: 0,
            incentive: 0
        };

        const error_analysis = [];
        const discrepancies = [];
        const rate_errors = [];  // Track commission rate calculation errors

        // Process each state
        for (const [state, total_sales] of Object.entries(state_totals)) {
            const tier = this.getStateTier(total_sales);
            const rates = this.commissionRates[tier];

            let state_commission = 0;
            const state_transactions = transactions.filter(t => t.ship_to_state === state);

            // Track revenue and commission by type for rate analysis
            let repeatRevenue = 0, newRevenue = 0;
            let actualRepeatComm = 0, actualNewComm = 0, actualIncentiveComm = 0;

            // Track what DL reported for this state
            let dlStateCommission = 0;

            for (const transaction of state_transactions) {
                // Use commission values directly from Excel columns
                const repeatComm = transaction.repeat_commission || 0;
                const newComm = transaction.new_commission || 0;
                const incentiveComm = transaction.incentive_commission || 0;
                const revenue = transaction.total_discounted_sales || 0;

                // Track revenue and commission for rate calculation
                if (repeatComm > 0) {
                    repeatRevenue += revenue;
                    actualRepeatComm += repeatComm;
                }
                if (newComm > 0) {
                    newRevenue += revenue;
                    actualNewComm += newComm;
                }
                if (incentiveComm > 0) {
                    actualIncentiveComm += incentiveComm;
                }

                // Add to breakdown by commission type
                commission_breakdown.repeat += repeatComm;
                commission_breakdown.new += newComm;
                commission_breakdown.incentive += incentiveComm;

                // Total commission for this transaction
                const transactionTotal = repeatComm + newComm + incentiveComm;
                state_commission += transactionTotal;

                // Add DL's reported commission for this state
                dlStateCommission += transaction.total_commission || transactionTotal;
            }

            // Analyze commission rates for this state
            const expectedRates = rates;
            let rateErrors = [];

            if (repeatRevenue > 0) {
                const actualRepeatRate = (actualRepeatComm / repeatRevenue) * 100;
                const expectedRepeatRate = expectedRates.repeat * 100;
                const expectedRepeatComm = repeatRevenue * expectedRates.repeat;
                const repeatDiff = actualRepeatComm - expectedRepeatComm;

                if (Math.abs(repeatDiff) > 0.01) {
                    rateErrors.push({
                        type: 'repeat',
                        expected_rate: expectedRepeatRate,
                        actual_rate: actualRepeatRate,
                        revenue: repeatRevenue,
                        expected_commission: expectedRepeatComm,
                        actual_commission: actualRepeatComm,
                        difference: repeatDiff
                    });
                }
            }

            if (newRevenue > 0) {
                const actualNewRate = (actualNewComm / newRevenue) * 100;
                const expectedNewRate = expectedRates.new * 100;
                const expectedNewComm = newRevenue * expectedRates.new;
                const newDiff = actualNewComm - expectedNewComm;

                if (Math.abs(newDiff) > 0.01) {
                    rateErrors.push({
                        type: 'new',
                        expected_rate: expectedNewRate,
                        actual_rate: actualNewRate,
                        revenue: newRevenue,
                        expected_commission: expectedNewComm,
                        actual_commission: actualNewComm,
                        difference: newDiff
                    });
                }
            }

            if (rateErrors.length > 0) {
                rate_errors.push({
                    state: state,
                    tier: tier,
                    total_sales: total_sales,
                    errors: rateErrors
                });
            }

            // Calculate state bonus only if there are sales
            const state_bonus = state_transactions.length > 0 ? rates.bonus : 0;
            total_state_bonuses += state_bonus;

            // Track states with transactions and their Claude-calculated commission
            if (state_transactions.length > 0) {
                statesWithTransactions.add(state);
                totalClaudeStateBonus += state_bonus;
            }

            // Skip individual state tracking - we'll do error analysis at the end

            total_calculated_commission += state_commission;
        }

        total_calculated_commission += total_state_bonuses;

        // Create focused error analysis comparing DL vs Claude
        const total_difference = total_calculated_commission - dl_totals.totalCommission;

        if (Math.abs(total_difference) > 0.01) {
            error_analysis.push({
                issue: "Total Commission Calculation",
                description: "DL's summary sheet total vs Claude's proper calculation",
                dl_value: dl_totals.totalCommission.toFixed(2),
                claude_value: total_calculated_commission.toFixed(2),
                difference: total_difference.toFixed(2),
                impact: total_difference > 0 ? "DL underpaid" : "DL overpaid"
            });
        }

        // Check state bonus differences
        const state_bonus_diff = total_state_bonuses - dl_totals.stateBonus;
        if (Math.abs(state_bonus_diff) > 0.01) {
            error_analysis.push({
                issue: "State Bonus Calculation",
                description: "State bonus calculation discrepancy",
                dl_value: dl_totals.stateBonus.toFixed(2),
                claude_value: total_state_bonuses.toFixed(2),
                difference: state_bonus_diff.toFixed(2),
                impact: state_bonus_diff > 0 ? "DL underpaid bonuses" : "DL overpaid bonuses"
            });
        }

        // Check for discrepancies (overall only since we don't have individual transaction reporting)
        const difference = total_calculated_commission - dl_totals.totalCommission;

        if (Math.abs(difference) > 0.01) {
            discrepancies.push({
                invoice: 'SUMMARY',
                state: 'ALL',
                calculated: total_calculated_commission.toFixed(2),
                reported: dl_totals.totalCommission.toFixed(2),
                difference: difference.toFixed(2)
            });
        }

        return {
            summary: {
                total_transactions: transactions.length,
                total_states: Object.keys(state_totals).length,
                total_calculated_commission: total_calculated_commission.toFixed(2),
                total_reported_commission: dl_totals.totalCommission.toFixed(2),
                difference: (total_calculated_commission - dl_totals.totalCommission).toFixed(2),
                total_state_bonuses: total_state_bonuses.toFixed(2)
            },
            commission_breakdown: {
                repeat: commission_breakdown.repeat.toFixed(2),
                new: commission_breakdown.new.toFixed(2),
                incentive: commission_breakdown.incentive.toFixed(2)
            },
            dl_breakdown: {
                repeat: dl_totals.repeatCommission.toFixed(2),
                new: dl_totals.newCommission.toFixed(2),
                incentive: dl_totals.incentiveCommission.toFixed(2),
                total: dl_totals.totalCommission.toFixed(2),
                stateBonus: dl_totals.stateBonus.toFixed(2)
            },
            error_analysis: error_analysis,
            discrepancies: discrepancies,
            rate_errors: rate_errors,
            dlReported: summaryData.dlReported,  // Add comprehensive DL reported values with cell references
            commission_structure: {
                tier1: 'Tier 1 ($0-$9,999): Repeat 2%, New Product 3%',
                tier2: 'Tier 2 ($10k-$49.9k): Repeat 1%, New Product 2% + $100 bonus',
                tier3: 'Tier 3 ($50k+): Repeat 0.5%, New Product 1.5% + $300 bonus',
                incentive: 'Incentivized SKUs: Fixed 3%+'
            }
        };
    }

    getStateTier(totalSales) {
        if (totalSales >= 50000) return 'tier3';
        if (totalSales >= 10000) return 'tier2';
        return 'tier1';
    }
}

// File upload route for Excel files
app.post('/verify-commission', upload.single('excelFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('Processing Excel file:', req.file.originalname);

        const processor = new ExcelProcessor();
        const results = await processor.processExcelFile(req.file.path);

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        res.json(results);

    } catch (error) {
        console.error('Verification error:', error);

        // Clean up file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            error: 'Failed to process Excel file',
            details: error.message
        });
    }
});

// Download report route (unchanged)
app.post('/download-report', (req, res) => {
    try {
        const { reportData } = req.body;

        if (!reportData) {
            return res.status(400).json({ error: 'No report data provided' });
        }

        const reportRows = [];

        reportRows.push(['COMMISSION VERIFICATION REPORT']);
        reportRows.push(['Generated:', new Date().toISOString()]);
        reportRows.push([]);

        reportRows.push(['SUMMARY']);
        reportRows.push(['Total Transactions:', reportData.summary.total_transactions]);
        reportRows.push(['Total States:', reportData.summary.total_states]);
        reportRows.push(['Calculated Commission:', '$' + reportData.summary.total_calculated_commission]);
        reportRows.push(['Reported Commission:', '$' + reportData.summary.total_reported_commission]);
        reportRows.push(['Difference:', '$' + reportData.summary.difference]);
        reportRows.push(['State Bonuses:', '$' + reportData.summary.total_state_bonuses]);
        reportRows.push([]);

        reportRows.push(['ERROR ANALYSIS']);
        reportRows.push(['Issue', 'DL Calculated', 'Claude Calculated', 'Difference']);

        if (reportData.error_analysis && reportData.error_analysis.length > 0) {
            reportData.error_analysis.forEach(error => {
                reportRows.push([
                    error.issue,
                    '$' + error.dl_value,
                    '$' + error.claude_value,
                    '$' + error.difference
                ]);
            });
        } else {
            reportRows.push(['No calculation errors found - DL calculations match Claude analysis']);
        }

        reportRows.push([]);

        reportRows.push(['DISCREPANCIES']);
        if (reportData.discrepancies.length > 0) {
            reportRows.push(['Invoice', 'State', 'Calculated', 'Reported', 'Difference']);
            reportData.discrepancies.forEach(disc => {
                reportRows.push([
                    disc.invoice,
                    disc.state,
                    '$' + disc.calculated,
                    '$' + disc.reported,
                    '$' + disc.difference
                ]);
            });
        } else {
            reportRows.push(['No discrepancies found']);
        }

        const csvContent = reportRows.map(row =>
            row.map(cell => `"${cell}"`).join(',')
        ).join('\n');

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `commission_verification_report_${timestamp}.csv`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvContent);

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Commission Verification Server running on port ${PORT}`);
    console.log(`Access the application at: http://localhost:${PORT}`);
    console.log('Server configured to process Excel files with Summary and Detail sheets');
});