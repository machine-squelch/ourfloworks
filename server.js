const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');

const app = express();
const PORT = process.env.PORT || 8080;

// Basic middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static('public'));

// Multer configuration with file type filter
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 50 * 1024 * 1024 // 10MB
    },
    fileFilter: (req, file, cb) => {
        // Accept CSV files based on extension and MIME type
        const isCSV = file.originalname.toLowerCase().endsWith('.csv') || 
                     file.mimetype === 'text/csv' || 
                     file.mimetype === 'application/csv' ||
                     file.mimetype === 'text/plain';
        
        if (isCSV) {
            cb(null, true);
        } else {
            cb(new Error('File type not supported. Please upload CSV files only.'), false);
        }
    }
});

// Commission Verification Class
class CommissionVerifier {
    constructor() {
        this.commissionRates = {
            tier1: { repeat: 0.02, new: 0.03, bonus: 0 },
            tier2: { repeat: 0.01, new: 0.02, bonus: 100 },
            tier3: { repeat: 0.005, new: 0.015, bonus: 300 }
        };
        this.incentiveRate = 0.03;
    }

    parseBooleanField(value) {
        if (!value) return false;
        const str = String(value).toLowerCase().trim();
        return str === 'true' || str === '1' || str === 'yes' || parseFloat(str) > 0;
    }

    async verifyCommissionData(csvData) {
        const transactions = [];
        const state_totals = {};

        console.log('Processing', csvData.length, 'rows');

        if (csvData.length === 0) {
            return this.getEmptyResults();
        }

        // Use the first row's headers for mapping
        const headers = Object.keys(csvData[0]);
        console.log('CSV headers detected:', headers);
        
        const normalize = (str) => String(str).toLowerCase().replace(/[\s_]+/g, '');
        
        function findColumnName(possibleNames) {
            for (const name of possibleNames) {
                const normalizedName = normalize(name);
                const foundHeader = headers.find(h => normalize(h) === normalizedName);
                if (foundHeader) {
                    return foundHeader;
                }
            }
            return null;
        }

        // Updated column mapping to match actual CSV structure
        const CORE_FIELDS = {
            customer_no: findColumnName(['CustomerNo', 'Customer #']),
            ship_to_state: findColumnName(['ShipToState', 'State']),
            invoice_no: findColumnName(['InvoiceNo', 'InvoiceNumber']),
            item_code: findColumnName(['ItemCode']),
            transaction_date: findColumnName(['TransactionDate', 'Date']),
            quantity: findColumnName(['QuantityShipped', 'Quantity']),
            unit_price: findColumnName(['UnitPrice', 'Unit Price']),
            salesperson: findColumnName(['Salesperson_Name', 'Salesperson', 'SalesPersonName']),
            reported_commission: findColumnName(['Total_Calculated_Commission_Amount', 'ReportedCommission']),
            line_discount: findColumnName(['Line_Discount_Amt', 'LineDiscount', 'Discount']),
            total_discounted_sales: findColumnName(['Total Discounted Revenue', 'TotalDiscountedRevenue', 'SalesAmount'])
        };
        
        // Updated boolean field mapping - these are commission amounts, not boolean flags
        const repeatCommissionCol = findColumnName(['Repeat Product Commission', 'RepeatProductCommission', 'IsRepeatProduct']);
        const newCommissionCol = findColumnName(['New Product Commission', 'NewProductCommission', 'IsNewProduct']);
        const incentiveCommissionCol = findColumnName(['Incentive Product Commission', 'IncentiveProductCommission', 'IsIncentive']);

        console.log('Column mappings found:');
        console.log('Core fields:', CORE_FIELDS);
        console.log('Commission fields:', {
            repeat: repeatCommissionCol,
            new: newCommissionCol,
            incentive: incentiveCommissionCol
        });

        for (let i = 0; i < csvData.length; i++) {
            const row = csvData[i];

            try {
                // Check for critical columns
                const shipToState = row[CORE_FIELDS.ship_to_state];
                
                // Calculate sales amount
                let salesAmount = 0;
                const totalDiscountedRevenue = row[CORE_FIELDS.total_discounted_sales];
                
                if (totalDiscountedRevenue) {
                    salesAmount = parseFloat(totalDiscountedRevenue) || 0;
                } else {
                    const quantity = parseFloat(row[CORE_FIELDS.quantity] || 0);
                    const unitPrice = parseFloat(row[CORE_FIELDS.unit_price] || 0);
                    const lineDiscount = parseFloat(row[CORE_FIELDS.line_discount] || 0);
                    salesAmount = (quantity * unitPrice) - lineDiscount;
                }

                if (shipToState && salesAmount > 0) {
                    // Determine product type based on which commission field has a value
                    const repeatCommission = parseFloat(row[repeatCommissionCol] || 0);
                    const newCommission = parseFloat(row[newCommissionCol] || 0);
                    const incentiveCommission = parseFloat(row[incentiveCommissionCol] || 0);
                    
                    let isRepeat = false;
                    let isNew = false;
                    let isIncentive = false;
                    
                    // Logic: if a commission field has a value > 0, that's the product type
                    if (incentiveCommission > 0) {
                        isIncentive = true;
                    } else if (newCommission > 0) {
                        isNew = true;
                    } else if (repeatCommission > 0) {
                        isRepeat = true;
                    }

                    const transaction = {
                        customer_no: row[CORE_FIELDS.customer_no] || '',
                        ship_to_state: shipToState,
                        invoice_no: row[CORE_FIELDS.invoice_no] || '',
                        item_code: row[CORE_FIELDS.item_code] || '',
                        transaction_date: row[CORE_FIELDS.transaction_date] || '',
                        quantity: parseFloat(row[CORE_FIELDS.quantity] || 0),
                        unit_price: parseFloat(row[CORE_FIELDS.unit_price] || 0),
                        total_discounted_sales: salesAmount,
                        salesperson: row[CORE_FIELDS.salesperson] || '',
                        line_discount: parseFloat(row[CORE_FIELDS.line_discount] || 0),
                        is_repeat_product: isRepeat,
                        is_new_product: isNew,
                        is_incentive: isIncentive,
                        reported_commission: parseFloat(row[CORE_FIELDS.reported_commission] || 0)
                    };

                    transactions.push(transaction);
                    state_totals[shipToState] = (state_totals[shipToState] || 0) + salesAmount;
                }
            } catch (error) {
                console.error(`Error processing row ${i + 1}:`, error);
            }
        }

        console.log('Processed', transactions.length, 'valid transactions');
        console.log('State totals:', state_totals);

        if (transactions.length === 0) {
            return this.getEmptyResults();
        }

        return this.calculateVerificationResults(transactions, state_totals);
    }
    
    getEmptyResults() {
        return {
            summary: {
                total_transactions: 0,
                total_states: 0,
                total_calculated_commission: 0,
                total_reported_commission: 0,
                difference: 0,
                total_state_bonuses: 0
            },
            commission_breakdown: {
                'repeat': 0,
                'new': 0,
                'incentive': 0
            },
            state_analysis: [],
            discrepancies: [],
            commission_structure: {
                tier1: 'Tier 1 ($0-$9,999): Repeat 2%, New Product 3%',
                tier2: 'Tier 2 ($10k-$49.9k): Repeat 1%, New Product 2% + $100 bonus',
                tier3: 'Tier 3 ($50k+): Repeat 0.5%, New Product 1.5% + $300 bonus',
                incentive: 'Incentivized SKUs: Fixed 3%+'
            }
        };
    }

    calculateVerificationResults(transactions, state_totals) {
        let total_calculated_commission = 0;
        let total_reported_commission = 0;
        let total_state_bonuses = 0;

        const commission_breakdown = {
            'repeat': 0,
            'new': 0,
            'incentive': 0
        };

        const state_analysis = [];
        const discrepancies = [];

        // Process each state
        for (const [state, total_sales] of Object.entries(state_totals)) {
            const tier = this.getStateTier(total_sales);
            const rates = this.commissionRates[tier];

            let state_commission = 0;
            let state_reported = 0;

            const state_transactions = transactions.filter(t => t.ship_to_state === state);

            for (const transaction of state_transactions) {
                let commission = 0;

                if (transaction.is_incentive) {
                    commission = transaction.total_discounted_sales * this.incentiveRate;
                    commission_breakdown.incentive += commission;
                } else if (transaction.is_new_product) {
                    commission = transaction.total_discounted_sales * rates.new;
                    commission_breakdown.new += commission;
                } else {
                    commission = transaction.total_discounted_sales * rates.repeat;
                    commission_breakdown.repeat += commission;
                }

                state_commission += commission;
                state_reported += transaction.reported_commission;

                const diff = Math.abs(commission - transaction.reported_commission);
                if (diff > 0.01) {
                    discrepancies.push({
                        invoice: transaction.invoice_no,
                        state: state,
                        calculated: commission.toFixed(2),
                        reported: transaction.reported_commission.toFixed(2),
                        difference: (commission - transaction.reported_commission).toFixed(2)
                    });
                }
            }

            const state_bonus = rates.bonus;
            total_state_bonuses += state_bonus;

            state_analysis.push({
                state: state,
                total_sales: total_sales.toFixed(2),
                tier: tier,
                commission: state_commission.toFixed(2),
                reported: state_reported.toFixed(2),
                bonus: state_bonus.toFixed(2),
                transactions: state_transactions.length
            });

            total_calculated_commission += state_commission;
            total_reported_commission += state_reported;
        }

        total_calculated_commission += total_state_bonuses;

        return {
            summary: {
                total_transactions: transactions.length,
                total_states: Object.keys(state_totals).length,
                total_calculated_commission: total_calculated_commission.toFixed(2),
                total_reported_commission: total_reported_commission.toFixed(2),
                difference: (total_calculated_commission - total_reported_commission).toFixed(2),
                total_state_bonuses: total_state_bonuses.toFixed(2)
            },
            commission_breakdown: {
                'repeat': commission_breakdown.repeat.toFixed(2),
                'new': commission_breakdown.new.toFixed(2),
                'incentive': commission_breakdown.incentive.toFixed(2)
            },
            state_analysis: state_analysis,
            discrepancies: discrepancies,
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

// File upload route
app.post('/verify-commission', upload.single('csvFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('Processing file:', req.file.originalname);

        const csvData = [];
        const filePath = req.file.path;

        // Parse CSV
        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => csvData.push(data))
                .on('end', resolve)
                .on('error', reject);
        });

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        // Verify commission data
        const verifier = new CommissionVerifier();
        const results = await verifier.verifyCommissionData(csvData);

        res.json(results);

    } catch (error) {
        console.error('Verification error:', error);

        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        // Check for file type error from Multer
        if (error.message === 'File type not supported. Please upload CSV files only.') {
            return res.status(415).json({ error: error.message });
        }

        res.status(500).json({
            error: 'Failed to process file',
            details: error.message
        });
    }
});

// Download report route
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

        reportRows.push(['STATE ANALYSIS']);
        reportRows.push(['State', 'Total Sales', 'Tier', 'Commission', 'Reported', 'Bonus', 'Transactions']);

        reportData.state_analysis.forEach(state => {
            reportRows.push([
                state.state,
                '$' + state.total_sales,
                state.tier,
                '$' + state.commission,
                '$' + state.reported,
                '$' + state.bonus,
                state.transactions
            ]);
        });

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
});

