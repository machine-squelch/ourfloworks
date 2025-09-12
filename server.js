const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');

// Create uploads directory if it doesn't exist (DigitalOcean fix)
const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Created uploads directory');
}

const app = express();
const PORT = process.env.PORT || 8080;

// Basic middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static('public'));

// Health check endpoint for DigitalOcean
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Simple multer configuration - accept all files
const upload = multer({ 
    dest: 'uploads/',
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
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
        
        // Log first row structure
        console.log('CSV columns:', Object.keys(csvData[0]));
        
        // CORE COLUMNS ONLY - ignore all extra columns
        const CORE_FIELDS = {
            customer_no: 'CustomerNo',
            ship_to_state: 'ShipToState', 
            invoice_no: 'InvoiceNo',
            item_code: 'ItemCode',
            transaction_date: 'TransactionDate',
            quantity: 'QuantityShipped',
            unit_price: 'UnitPrice',
            salesperson: 'Salesperson_Name',
            line_discount: 'Line_Discount_Amt',
            // These fields may or may not exist - handle gracefully
            total_discounted_sales: 'Total Discounted Revenue',
            is_repeat_product: 'Repeat Product Commission',
            is_new_product: 'New Product Commission', 
            is_incentive: 'Incentive Product Commission'
        };
        
        // Multiple possible field names for reported commission
        const POSSIBLE_REPORTED_FIELDS = [
            'Total_Calculated_Commission_Amount',
            'Reported_Commission',
            'Original_Commission',
            'System_Commission',
            'Sage_Commission',
            'Commission_Amount',
            'Calculated_Commission'
        ];
        
        // Simple field getter that only looks for exact matches
        function getField(row, fieldName) {
            return row.hasOwnProperty(fieldName) && row[fieldName] !== undefined && row[fieldName] !== null && row[fieldName] !== '' 
                ? row[fieldName] 
                : null;
        }
        
        // Get reported commission from multiple possible field names
        function getReportedCommission(row) {
            for (const fieldName of POSSIBLE_REPORTED_FIELDS) {
                const value = getField(row, fieldName);
                if (value !== null && value !== undefined && value !== '') {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) {
                        return numValue;
                    }
                }
            }
            return 0;
        }
        
        // Improved product type detection with fallback logic
        const determineProductType = (row) => {
            // Try boolean fields first
            if (this.parseBooleanField(getField(row, CORE_FIELDS.is_incentive))) return 'incentive';
            if (this.parseBooleanField(getField(row, CORE_FIELDS.is_new_product))) return 'new';
            if (this.parseBooleanField(getField(row, CORE_FIELDS.is_repeat_product))) return 'repeat';
            
            // Fallback: check commission amounts in these fields
            const incentiveComm = parseFloat(getField(row, CORE_FIELDS.is_incentive) || 0);
            const newComm = parseFloat(getField(row, CORE_FIELDS.is_new_product) || 0);
            const repeatComm = parseFloat(getField(row, CORE_FIELDS.is_repeat_product) || 0);
            
            if (incentiveComm > 0) return 'incentive';
            if (newComm > 0) return 'new';
            if (repeatComm > 0) return 'repeat';
            
            // Default to repeat if unclear
            return 'repeat';
        };
        
        for (let i = 0; i < csvData.length; i++) {
            const row = csvData[i];
            
            try {
                // Extract ONLY core fields
                const shipToState = getField(row, CORE_FIELDS.ship_to_state);
                const customerNo = getField(row, CORE_FIELDS.customer_no);
                const invoiceNo = getField(row, CORE_FIELDS.invoice_no);
                
                // Calculate sales amount - try multiple approaches
                let salesAmount = 0;
                
                // Method 1: Use Total Discounted Revenue if available
                const totalDiscountedRevenue = getField(row, CORE_FIELDS.total_discounted_sales);
                if (totalDiscountedRevenue) {
                    salesAmount = parseFloat(totalDiscountedRevenue) || 0;
                } else {
                    // Method 2: Calculate from quantity * unit price - line discount
                    const quantity = parseFloat(getField(row, CORE_FIELDS.quantity) || 0);
                    const unitPrice = parseFloat(getField(row, CORE_FIELDS.unit_price) || 0);
                    const lineDiscount = parseFloat(getField(row, CORE_FIELDS.line_discount) || 0);
                    
                    salesAmount = (quantity * unitPrice) - lineDiscount;
                }
                
                // Log first few rows for debugging
                if (i < 3) {
                    console.log(`Row ${i + 1}:`);
                    console.log('  State:', shipToState);
                    console.log('  Customer:', customerNo);
                    console.log('  Invoice:', invoiceNo);
                    console.log('  Sales Amount:', salesAmount);
                }
                
                // Only process rows with valid state and positive sales amount
                if (shipToState && salesAmount > 0) {
                    const productType = determineProductType(row);
                    const reportedCommission = getReportedCommission(row);
                    
                    // Enhanced logging for first few rows
                    if (i < 3) {
                        console.log('  Product Type:', productType);
                        console.log('  Reported Commission:', reportedCommission);
                        console.log('  Available commission fields:');
                        POSSIBLE_REPORTED_FIELDS.forEach(field => {
                            const value = getField(row, field);
                            if (value !== null) {
                                console.log(`    ${field}: ${value}`);
                            }
                        });
                    }
                    
                    const transaction = {
                        customer_no: customerNo || '',
                        ship_to_state: shipToState,
                        invoice_no: invoiceNo || '',
                        item_code: getField(row, CORE_FIELDS.item_code) || '',
                        transaction_date: getField(row, CORE_FIELDS.transaction_date) || '',
                        quantity: parseFloat(getField(row, CORE_FIELDS.quantity) || 0),
                        unit_price: parseFloat(getField(row, CORE_FIELDS.unit_price) || 0),
                        total_discounted_sales: salesAmount,
                        salesperson: getField(row, CORE_FIELDS.salesperson) || '',
                        line_discount: parseFloat(getField(row, CORE_FIELDS.line_discount) || 0),
                        // Use improved product type detection
                        product_type: productType,
                        is_repeat_product: productType === 'repeat',
                        is_new_product: productType === 'new',
                        is_incentive: productType === 'incentive',
                        reported_commission: reportedCommission
                    };
                    
                    transactions.push(transaction);
                    state_totals[shipToState] = (state_totals[shipToState] || 0) + salesAmount;
                }
            } catch (error) {
                console.error(`Error processing row ${i + 1}:`, error);
            }
        }
        
        console.log('Processed', transactions.length, 'valid transactions');
        
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

