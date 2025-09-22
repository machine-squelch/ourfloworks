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

        console.log('Processing Summary sheet with', data.length, 'rows');

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

        // Search for key commission values in the summary sheet
        for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
            const row = data[rowIndex];
            if (!row || row.length === 0) continue;

            for (let colIndex = 0; colIndex < row.length; colIndex++) {
                const cellValue = row[colIndex];
                if (!cellValue) continue;

                const cellStr = String(cellValue).toLowerCase().trim();
                const cellRef = this.getExcelCellReference(rowIndex + 1, colIndex + 1);

                // Look for commission-related labels and extract values from adjacent cells
                if (this.matchesPattern(cellStr, ['amount due salesperson', 'amount due to salesperson', 'salesperson amount due'])) {
                    const value = this.extractAdjacentNumericValue(data, rowIndex, colIndex);
                    if (value) {
                        dlReported.amountDueSalesperson = { value, cell: cellRef, found: true };
                        reportedCommission = Math.max(reportedCommission, value);
                    }
                }
                else if (this.matchesPattern(cellStr, ['final commission', 'total commission amount', 'commission total'])) {
                    const value = this.extractAdjacentNumericValue(data, rowIndex, colIndex);
                    if (value) {
                        dlReported.finalCommission = { value, cell: cellRef, found: true };
                        reportedCommission = Math.max(reportedCommission, value);
                    }
                }
                else if (this.matchesPattern(cellStr, ['repeat product commission', 'repeat commission'])) {
                    const value = this.extractAdjacentNumericValue(data, rowIndex, colIndex);
                    if (value) {
                        dlReported.repeatCommission = { value, cell: cellRef, found: true };
                    }
                }
                else if (this.matchesPattern(cellStr, ['new product commission'])) {
                    const value = this.extractAdjacentNumericValue(data, rowIndex, colIndex);
                    if (value) {
                        dlReported.newProductCommission = { value, cell: cellRef, found: true };
                    }
                }
                else if (this.matchesPattern(cellStr, ['incentive commission', 'incentive product commission'])) {
                    const value = this.extractAdjacentNumericValue(data, rowIndex, colIndex);
                    if (value) {
                        dlReported.incentiveCommission = { value, cell: cellRef, found: true };
                    }
                }
                else if (this.matchesPattern(cellStr, ['state bonus', 'state bonuses'])) {
                    const value = this.extractAdjacentNumericValue(data, rowIndex, colIndex);
                    if (value) {
                        dlReported.stateBonus = { value, cell: cellRef, found: true };
                        stateBonuses = value;
                    }
                }
                else if (this.matchesPattern(cellStr, ['total revenue', 'gross revenue'])) {
                    const value = this.extractAdjacentNumericValue(data, rowIndex, colIndex);
                    if (value) {
                        dlReported.totalRevenue = { value, cell: cellRef, found: true };
                    }
                }
                // Also try to extract if the cell itself is a numeric value that looks like commission
                else {
                    const numValue = this.parseNumericValue(cellValue);
                    if (numValue && numValue > 100 && numValue < 10000) {
                        // Potential commission value - check context
                        const context = this.getRowContext(row, colIndex);
                        if (this.seemsLikeCommission(context)) {
                            reportedCommission = Math.max(reportedCommission, numValue);
                        }
                    }
                }
            }
        }

        // If no specific commission found, try to find any large monetary value
        if (reportedCommission === 0) {
            console.log('No specific commission labels found, searching for monetary values...');
            for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
                const row = data[rowIndex];
                if (!row) continue;

                for (let colIndex = 0; colIndex < row.length; colIndex++) {
                    const value = this.parseNumericValue(row[colIndex]);
                    if (value && value > 500 && value < 5000) {
                        console.log(`Found potential commission value: ${value} at ${this.getExcelCellReference(rowIndex + 1, colIndex + 1)}`);
                        reportedCommission = Math.max(reportedCommission, value);
                    }
                }
            }
        }

        console.log('Summary sheet processing results:');
        console.log(`  Reported Commission: ${reportedCommission}`);
        console.log(`  State Bonuses: ${stateBonuses}`);
        console.log('  DL Reported Values:', Object.entries(dlReported)
            .filter(([key, data]) => data.found)
            .map(([key, data]) => `${key}: ${data.value} (${data.cell})`)
        );

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

    // Helper methods for summary sheet processing
    matchesPattern(cellStr, patterns) {
        return patterns.some(pattern =>
            cellStr.includes(pattern) ||
            this.normalizeFieldName(cellStr).includes(this.normalizeFieldName(pattern))
        );
    }

    extractAdjacentNumericValue(data, rowIndex, colIndex) {
        // Check right, down, and diagonal cells for numeric values
        const positions = [
            [rowIndex, colIndex + 1],     // Right
            [rowIndex, colIndex + 2],     // Right + 1
            [rowIndex + 1, colIndex],     // Down
            [rowIndex + 1, colIndex + 1], // Diagonal
            [rowIndex, colIndex - 1],     // Left (sometimes labels are on the right)
        ];

        for (const [r, c] of positions) {
            if (r >= 0 && r < data.length && c >= 0) {
                const row = data[r];
                if (row && c < row.length) {
                    const value = this.parseNumericValue(row[c]);
                    if (value && value > 0) {
                        return value;
                    }
                }
            }
        }
        return null;
    }

    parseNumericValue(cell) {
        if (cell === null || cell === undefined) return null;
        const str = String(cell).replace(/[,$%]/g, '');
        const num = parseFloat(str);
        return isNaN(num) ? null : num;
    }

    getExcelCellReference(row, col) {
        let result = '';
        while (col > 0) {
            col--;
            result = String.fromCharCode(65 + (col % 26)) + result;
            col = Math.floor(col / 26);
        }
        return result + row;
    }

    getRowContext(row, colIndex) {
        const context = [];
        for (let i = Math.max(0, colIndex - 2); i <= Math.min(row.length - 1, colIndex + 2); i++) {
            if (row[i]) {
                context.push(String(row[i]).toLowerCase());
            }
        }
        return context.join(' ');
    }

    seemsLikeCommission(context) {
        const commissionKeywords = ['commission', 'due', 'amount', 'total', 'pay', 'owed'];
        return commissionKeywords.some(keyword => context.includes(keyword));
    }

    parseBooleanField(value) {
        if (!value) return false;
        const str = String(value).toLowerCase().trim();
        return str === 'true' || str === '1' || str === 'yes' || parseFloat(str) > 0;
    }

    // Calculate commission verification results
    calculateCommissionVerification(summaryData, detailData) {
        const { transactions, state_totals } = detailData;

        // Use DL's reported values from summary sheet
        const dl_totals = {
            totalCommission: summaryData.dlReported.finalCommission.value ||
                           summaryData.reportedCommission,
            repeatCommission: summaryData.dlReported.repeatCommission.value || 0,
            newCommission: summaryData.dlReported.newProductCommission.value || 0,
            incentiveCommission: summaryData.dlReported.incentiveCommission.value || 0,
            stateBonus: summaryData.dlReported.stateBonus.value || 0
        };

        console.log('DL Summary Sheet Values:', dl_totals);

        // RECALCULATE commissions per PDF rules
        const claude_breakdown = {
            repeat: 0,
            new: 0,
            incentive: 0
        };

        let claude_total_commission = 0;
        let claude_state_bonuses = 0;
        const error_analysis = [];
        const discrepancies = [];
        const rate_errors = [];

        // Process each state separately per PDF rules
        for (const [state, total_sales] of Object.entries(state_totals)) {
            const tier = this.getStateTier(total_sales);
            const rates = this.commissionRates[tier];

            // Calculate state bonus per PDF rules
            const state_bonus = rates.bonus;
            claude_state_bonuses += state_bonus;

            console.log(`State ${state}: $${total_sales.toFixed(2)} sales -> ${tier} (${rates.repeat*100}%/${rates.new*100}% + $${state_bonus})`);

            const state_transactions = transactions.filter(t => t.ship_to_state === state);

            let state_repeat_commission = 0;
            let state_new_commission = 0;
            let state_incentive_commission = 0;

            for (const transaction of state_transactions) {
                const revenue = transaction.total_discounted_sales || 0;

                // Determine transaction type and calculate commission per PDF rules
                if (transaction.repeat_commission > 0) {
                    // This is a repeat purchase
                    const calculated_comm = revenue * rates.repeat;
                    state_repeat_commission += calculated_comm;
                    claude_breakdown.repeat += calculated_comm;
                } else if (transaction.new_commission > 0) {
                    // This is a new product purchase
                    const calculated_comm = revenue * rates.new;
                    state_new_commission += calculated_comm;
                    claude_breakdown.new += calculated_comm;
                } else if (transaction.incentive_commission > 0) {
                    // This is an incentivized SKU - fixed 3%+ rate
                    const calculated_comm = revenue * this.incentiveRate;
                    state_incentive_commission += calculated_comm;
                    claude_breakdown.incentive += calculated_comm;
                }
            }

            claude_total_commission += state_repeat_commission + state_new_commission + state_incentive_commission;
            }

        // Add state bonuses to total commission per PDF rules
        const claude_total_with_bonuses = claude_total_commission + claude_state_bonuses;

        // Calculate differences
        const commission_difference = claude_total_with_bonuses - dl_totals.totalCommission;
        const state_bonus_difference = claude_state_bonuses - dl_totals.stateBonus;

        console.log(`Claude calculated: $${claude_total_with_bonuses.toFixed(2)} (comm: $${claude_total_commission.toFixed(2)} + bonus: $${claude_state_bonuses.toFixed(2)})`);
        console.log(`DL reported: $${dl_totals.totalCommission.toFixed(2)}`);
        console.log(`Difference: $${commission_difference.toFixed(2)}`);

        // Create error analysis
        if (Math.abs(commission_difference) > 0.01) {
            error_analysis.push({
                issue: "Total Commission Calculation",
                description: "DL's summary sheet total vs Claude's proper calculation per PDF rules",
                dl_value: dl_totals.totalCommission.toFixed(2),
                claude_value: claude_total_with_bonuses.toFixed(2),
                difference: commission_difference.toFixed(2),
                impact: commission_difference > 0 ? "DL underpaid" : "DL overpaid"
            });
        }

        if (Math.abs(state_bonus_difference) > 0.01) {
            error_analysis.push({
                issue: "State Bonus Calculation",
                description: "State bonus calculation per PDF rules",
                dl_value: dl_totals.stateBonus.toFixed(2),
                claude_value: claude_state_bonuses.toFixed(2),
                difference: state_bonus_difference.toFixed(2),
                impact: state_bonus_difference > 0 ? "DL underpaid bonuses" : "DL overpaid bonuses"
            });
        }

        // Add discrepancy entry
        discrepancies.push({
            invoice: "SUMMARY",
            state: "ALL",
            calculated: claude_total_with_bonuses.toFixed(2),
            reported: dl_totals.totalCommission.toFixed(2),
            difference: commission_difference.toFixed(2)
        });

        // Return comprehensive results
        return {
            summary: {
                total_transactions: transactions.length,
                total_states: Object.keys(state_totals).length,
                total_calculated_commission: claude_total_with_bonuses.toFixed(2),
                total_reported_commission: dl_totals.totalCommission.toFixed(2),
                difference: commission_difference.toFixed(2),
                total_state_bonuses: claude_state_bonuses.toFixed(2)
            },
            commission_breakdown: {
                repeat: claude_breakdown.repeat.toFixed(2),
                new: claude_breakdown.new.toFixed(2),
                incentive: claude_breakdown.incentive.toFixed(2)
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
            dlReported: summaryData.dlReported,
            commission_structure: {
                tier1: "Tier 1 ($0-$9,999): Repeat 2%, New Product 3%",
                tier2: "Tier 2 ($10k-$49.9k): Repeat 1%, New Product 2% + $100 bonus",
                tier3: "Tier 3 ($50k+): Repeat 0.5%, New Product 1.5% + $300 bonus",
                incentive: "Incentivized SKUs: Fixed 3%+"
            }
        };
    }

    // Get commission tier based on total sales per state (per PDF rules)
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

// PDF report generation route
app.post('/generate-pdf', (req, res) => {
    try {
        const { reportData } = req.body;

        if (!reportData) {
            return res.status(400).json({ error: 'No report data provided' });
        }

        // Return success - PDF generation handled client-side with jsPDF
        res.json({
            success: true,
            message: 'PDF generation initiated client-side'
        });

    } catch (error) {
        console.error('PDF generation error:', error);
        res.status(500).json({ error: 'Failed to prepare PDF data' });
    }
});

// Legacy CSV download route (to be removed)
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
