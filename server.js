const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');
const XLSX = require('xlsx');

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
            'CommissionAmt',
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
            // Check for new product indicator
            const newProductField = getField(row, 'Customer_ Current_Period_New_Product_sales');
            if (newProductField && (newProductField.toLowerCase() === 'yes' || newProductField.toLowerCase() === 'true')) {
                return 'new';
            }
            
            // Check commission amount fields to determine type
            const incentiveComm = parseFloat(getField(row, 'Calculated_Commission_Amount(3)') || 0);
            const newComm = parseFloat(getField(row, 'New_Product_Sale_Calculated_Commission_Amount(2)') || 0);
            const repeatComm = parseFloat(getField(row, 'Calculated_Commission_Amount (1)') || 0);
            
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
                
                // Method 1: Use Revised_Unit_Price if available
                const revisedUnitPrice = getField(row, 'Revised_Unit_Price');
                const quantity = parseFloat(getField(row, CORE_FIELDS.quantity) || 0);
                
                if (revisedUnitPrice && quantity) {
                    salesAmount = parseFloat(revisedUnitPrice) * quantity;
                } else {
                    // Method 2: Calculate from quantity * unit price - line discount
                    const unitPrice = parseFloat(getField(row, CORE_FIELDS.unit_price) || 0);
                    const lineDiscount = parseFloat(getField(row, 'Line_Discount_Amt') || 0);
                    
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
                        quantity: quantity,
                        unit_price: parseFloat(getField(row, CORE_FIELDS.unit_price) || 0),
                        total_discounted_sales: salesAmount,
                        salesperson: getField(row, CORE_FIELDS.salesperson) || '',
                        line_discount: parseFloat(getField(row, 'Line_Discount_Amt') || 0),
                        // Use improved product type detection
                        product_type: productType,
                        is_repeat_product: productType === 'repeat',
                        is_new_product: productType === 'new',
                        is_incentive: productType === 'incentive',
                        reported_commission: reportedCommission,
                        // Add the calculated commission from CSV
                        csv_calculated_commission: parseFloat(getField(row, 'Total_Calculated_Commission_Amount') || 0)
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
                        calculated: transaction.csv_calculated_commission.toFixed(2), // Amount Calculated from CSV
                        reported: transaction.reported_commission.toFixed(2), // Amount Paid
                        difference: (transaction.csv_calculated_commission - transaction.reported_commission).toFixed(2) // Amount Owed
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

// Excel Commission Verification Class
class ExcelCommissionVerifier {
    constructor() {
        this.commissionRates = {
            tier1: { repeat: 0.02, new: 0.03, bonus: 0 },
            tier2: { repeat: 0.01, new: 0.02, bonus: 100 },
            tier3: { repeat: 0.005, new: 0.015, bonus: 300 }
        };
        this.incentiveRate = 0.03;
    }

    // Flexible header matching
    findColumn(headers, possibleNames) {
        const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
        
        for (const name of possibleNames) {
            const normalizedName = name.toLowerCase().trim();
            
            // Exact match
            const exactIndex = normalizedHeaders.indexOf(normalizedName);
            if (exactIndex !== -1) return headers[exactIndex];
            
            // Partial match
            const partialIndex = normalizedHeaders.findIndex(h => 
                h.includes(normalizedName) || normalizedName.includes(h)
            );
            if (partialIndex !== -1) return headers[partialIndex];
        }
        
        return null;
    }

    async processExcelFile(filePath) {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetNames = workbook.SheetNames;
            
            console.log('Excel sheets found:', sheetNames);
            
            // Find detail and summary sheets based on actual structure
            let detailSheet = null;
            let summarySheet = null;
            
            for (const sheetName of sheetNames) {
                const lowerName = sheetName.toLowerCase();
                if (lowerName.includes('detail')) {
                    detailSheet = workbook.Sheets[sheetName];
                    console.log('Found detail sheet:', sheetName);
                } else if (lowerName.includes('summary')) {
                    summarySheet = workbook.Sheets[sheetName];
                    console.log('Found summary sheet:', sheetName);
                }
            }
            
            // If not found by name, use first two sheets
            if (!detailSheet || !summarySheet) {
                if (sheetNames.length >= 2) {
                    summarySheet = workbook.Sheets[sheetNames[0]]; // First sheet = Summary (what was paid)
                    detailSheet = workbook.Sheets[sheetNames[1]];  // Second sheet = Detail (raw data)
                    console.log('Using first sheet as summary:', sheetNames[0]);
                    console.log('Using second sheet as detail:', sheetNames[1]);
                } else {
                    throw new Error('Excel file must contain at least 2 sheets');
                }
            }
            
            // Convert sheets to JSON
            const detailData = XLSX.utils.sheet_to_json(detailSheet);
            const summaryData = XLSX.utils.sheet_to_json(summarySheet);
            
            console.log(`Detail sheet: ${detailData.length} rows`);
            console.log(`Summary sheet: ${summaryData.length} rows`);
            
            return this.verifyCommissionData(detailData, summaryData);
            
        } catch (error) {
            console.error('Excel processing error:', error);
            throw error;
        }
    }

    async verifyCommissionData(detailData, summaryData) {
        if (!detailData || detailData.length === 0) {
            return this.getEmptyResults();
        }
        
        console.log('Processing', detailData.length, 'detail rows');
        console.log('Processing', summaryData.length, 'summary rows');
        
        // Get headers for flexible matching
        const detailHeaders = Object.keys(detailData[0] || {});
        const summaryHeaders = Object.keys(summaryData[0] || {});
        
        console.log('Detail headers:', detailHeaders);
        console.log('Summary headers:', summaryHeaders);
        
        // Map flexible column names based on actual data structure
        const detailColumns = {
            state: this.findColumn(detailHeaders, ['ShipToState', 'BillToState', 'State']),
            customer: this.findColumn(detailHeaders, ['CustomerNo', 'Customer']),
            invoice: this.findColumn(detailHeaders, ['InvoiceNo', 'Invoice']),
            salesperson: this.findColumn(detailHeaders, ['Salesperson_Name', 'Salesperson']),
            revenue: this.findColumn(detailHeaders, ['Total Discounted Revenue', 'Total Revenue', 'Revenue']),
            repeatComm: this.findColumn(detailHeaders, ['Repeat Product Commission', 'Repeat Commission']),
            newComm: this.findColumn(detailHeaders, ['New Product Commission', 'New Commission']),
            incentiveComm: this.findColumn(detailHeaders, ['Incentive Product Commission', 'Incentive Commission']),
            totalComm: this.findColumn(detailHeaders, ['Total Commission']),
            newProduct: this.findColumn(detailHeaders, ['Customer_ Current_Period_New_Product_sales', 'New Product'])
        };
        
        const summaryColumns = {
            state: this.findColumn(summaryHeaders, ['Row Labels', 'State']),
            totalRevenue: this.findColumn(summaryHeaders, ['Sum of Total Discounted Revenue', 'Sum of Total Revenue']),
            repeatComm: this.findColumn(summaryHeaders, ['Sum of Repeat Product Commission', 'Sum of Repeat Commission']),
            newComm: this.findColumn(summaryHeaders, ['Sum of New Product Commission ', 'Sum of New Product Commission', 'New Product Commission']),
            incentiveComm: this.findColumn(summaryHeaders, ['Sum of Incentive Product Commission', 'Sum of Incentive Commission']),
            totalComm: this.findColumn(summaryHeaders, ['Sum of Total Commission']),
            stateBonus: this.findColumn(summaryHeaders, ['added state commission', 'ADDED STATE COMMISISON', 'State Commission', 'State Bonus'])
        };
        
        console.log('Mapped detail columns:', detailColumns);
        console.log('Mapped summary columns:', summaryColumns);
        
        return this.calculateVerificationResults(detailData, summaryData, detailColumns, summaryColumns);
    }

    calculateVerificationResults(detailData, summaryData, detailColumns, summaryColumns) {
        const transactions = [];
        const state_totals = {};
        const paid_by_state = {};
        
        // Process detail data to calculate what should be paid
        for (const row of detailData) {
            const state = row[detailColumns.state];
            const revenue = parseFloat(row[detailColumns.revenue] || 0);
            
            if (state && revenue > 0) {
                // Get commission values from the data or calculate them
                let repeatComm = parseFloat(row[detailColumns.repeatComm] || 0);
                let newComm = parseFloat(row[detailColumns.newComm] || 0);
                let incentiveComm = parseFloat(row[detailColumns.incentiveComm] || 0);
                let totalComm = parseFloat(row[detailColumns.totalComm] || 0);
                
                // If individual commission columns are missing, use total commission
                if (!detailColumns.newComm && !detailColumns.incentiveComm && totalComm > 0) {
                    // Assume all commission is repeat commission if no breakdown available
                    repeatComm = totalComm;
                }
                
                const transaction = {
                    customer_no: row[detailColumns.customer] || '',
                    ship_to_state: state,
                    invoice_no: row[detailColumns.invoice] || '',
                    salesperson: row[detailColumns.salesperson] || '',
                    total_discounted_sales: revenue,
                    repeat_commission: repeatComm,
                    new_commission: newComm,
                    incentive_commission: incentiveComm,
                    total_commission: totalComm,
                    is_new_product: (row[detailColumns.newProduct] || '').toLowerCase() === 'yes'
                };
                
                transactions.push(transaction);
                state_totals[state] = (state_totals[state] || 0) + revenue;
            }
        }
        
        // Process summary data to get what was actually paid
        for (const row of summaryData) {
            const state = row[summaryColumns.state];
            if (state && state !== 'Adam' && state !== 'Grand Total') {
                paid_by_state[state] = {
                    repeat: parseFloat(row[summaryColumns.repeatComm] || 0),
                    new: parseFloat(row[summaryColumns.newComm] || 0),
                    incentive: parseFloat(row[summaryColumns.incentiveComm] || 0),
                    total: parseFloat(row[summaryColumns.totalComm] || 0),
                    bonus: parseFloat(row[summaryColumns.stateBonus] || 0)
                };
            }
        }
        
        console.log('State totals (calculated):', state_totals);
        console.log('Paid by state:', paid_by_state);
        
        // Calculate results
        let total_calculated_commission = 0;
        let total_reported_commission = 0;
        let total_state_bonuses = 0;
        
        const commission_breakdown = {
            repeat: 0,
            new: 0,
            incentive: 0
        };
        
        const state_analysis = [];
        const discrepancies = [];
        
        // Process each state
        for (const [state, total_sales] of Object.entries(state_totals)) {
            const tier = this.getStateTier(total_sales);
            const rates = this.commissionRates[tier];
            
            // Calculate what should be paid
            const state_transactions = transactions.filter(t => t.ship_to_state === state);
            let calculated_commission = 0;
            
            for (const transaction of state_transactions) {
                calculated_commission += transaction.total_commission;
                
                if (transaction.incentive_commission > 0) {
                    commission_breakdown.incentive += transaction.incentive_commission;
                } else if (transaction.new_commission > 0) {
                    commission_breakdown.new += transaction.new_commission;
                } else {
                    commission_breakdown.repeat += transaction.repeat_commission;
                }
            }
            
            // Get what was actually paid
            const paid_data = paid_by_state[state] || { repeat: 0, new: 0, incentive: 0, total: 0, bonus: 0 };
            const reported_commission = paid_data.total;
            const state_bonus = rates.bonus;
            
            total_calculated_commission += calculated_commission;
            total_reported_commission += reported_commission;
            total_state_bonuses += state_bonus;
            
            state_analysis.push({
                state: state,
                total_sales: total_sales.toFixed(2),
                tier: tier,
                commission: calculated_commission.toFixed(2),
                reported: reported_commission.toFixed(2),
                bonus: state_bonus.toFixed(2),
                transactions: state_transactions.length
            });
            
            // Check for discrepancies
            const diff = Math.abs(calculated_commission - reported_commission);
            if (diff > 0.01) {
                discrepancies.push({
                    invoice: 'State Total',
                    state: state,
                    calculated: calculated_commission.toFixed(2),
                    reported: reported_commission.toFixed(2),
                    difference: (calculated_commission - reported_commission).toFixed(2)
                });
            }
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
                repeat: commission_breakdown.repeat.toFixed(2),
                new: commission_breakdown.new.toFixed(2),
                incentive: commission_breakdown.incentive.toFixed(2)
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
                repeat: 0,
                new: 0,
                incentive: 0
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
        
        const filePath = req.file.path;
        const fileExtension = path.extname(req.file.originalname).toLowerCase();
        
        let results;
        
        if (fileExtension === '.xlsx' || fileExtension === '.xls') {
            // Process Excel file
            const verifier = new ExcelCommissionVerifier();
            results = await verifier.processExcelFile(filePath);
        } else {
            // Legacy CSV processing
            const csvData = [];
            
            await new Promise((resolve, reject) => {
                fs.createReadStream(filePath)
                    .pipe(csv())
                    .on('data', (data) => csvData.push(data))
                    .on('end', resolve)
                    .on('error', reject);
            });
            
            const verifier = new CommissionVerifier();
            results = await verifier.verifyCommissionData(csvData);
        }
        
        // Clean up uploaded file
        fs.unlinkSync(filePath);
        
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
        
        reportRows.push(['COMMISSION BREAKDOWN']);
        reportRows.push(['Repeat Product Commission:', '$' + reportData.commission_breakdown.repeat]);
        reportRows.push(['New Product Commission:', '$' + reportData.commission_breakdown.new]);
        reportRows.push(['Incentive Product Commission:', '$' + reportData.commission_breakdown.incentive]);
        reportRows.push([]);
        
        reportRows.push(['STATE ANALYSIS']);
        reportRows.push(['State', 'Total Sales', 'Tier', 'Commission Calculated', 'Commission Paid', 'Bonus Should Be Paid', 'Transactions']);
        
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
            reportRows.push(['Invoice', 'State', 'Amount Calculated', 'Amount Paid', 'Amount Owed']);
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

