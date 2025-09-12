// server.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');

// --- Configuration and Security Setup ---
const app = express();
const PORT = process.env.PORT || 8080;
const UPLOAD_DIR = 'uploads/';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB as per security specs

// Set up security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});

// Configure CORS
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://ourfloworks.com', 'https://www.ourfloworks.com'] 
        : '*',
    credentials: false
};
app.use(cors(corsOptions));

// Basic middleware for body parsing and serving static files
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(UPLOAD_DIR)) {
            fs.mkdirSync(UPLOAD_DIR);
        }
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const sanitizedFilename = path.basename(file.originalname);
        cb(null, `${Date.now()}-${sanitizedFilename}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only CSV files are allowed.'), false);
        }
    }
});

/**
 * @class CommissionVerifier
 * @description Core business logic for commission verification.
 */
class CommissionVerifier {
    constructor() {
        this.commissionRates = {
            tier1: { repeat: 0.02, new: 0.03, bonus: 0 },
            tier2: { repeat: 0.01, new: 0.02, bonus: 100 },
            tier3: { repeat: 0.005, new: 0.015, bonus: 300 }
        };
        this.incentiveRate = 0.03;
        this.CORE_FIELDS = {
            customer_no: 'CustomerNo',
            ship_to_state: 'ShipToState',
            invoice_no: 'InvoiceNo',
            item_code: 'ItemCode',
            transaction_date: 'TransactionDate',
            quantity: 'QuantityShipped',
            unit_price: 'UnitPrice',
            salesperson: 'Salesperson_Name',
            reported_commission: 'Total_Calculated_Commission_Amount',
            line_discount: 'Line_Discount_Amt',
            total_discounted_sales: 'Total Discounted Revenue',
            is_repeat_product: 'Repeat Product Commission',
            is_new_product: 'New Product Commission',
            is_incentive: 'Incentive Product Commission'
        };
    }

    /**
     * Parses a boolean-like value from a string.
     * @param {*} value
     * @returns {boolean}
     */
    parseBooleanField(value) {
        if (typeof value === 'boolean') return value;
        if (!value) return false;
        const str = String(value).toLowerCase().trim();
        return str === 'true' || str === '1' || str === 'yes' || parseFloat(str) > 0;
    }

    /**
     * Safely retrieves a field value from a row, handling potential missing keys.
     * @param {Object} row
     * @param {string} fieldName
     * @returns {*}
     */
    getField(row, fieldName) {
        const value = row[fieldName];
        return (value !== undefined && value !== null && value !== '') ? value : null;
    }

    /**
     * Calculates the commission for a single transaction.
     * @param {Object} transaction
     * @param {string} tier
     * @returns {number}
     */
    calculateTransactionCommission(transaction, tier) {
        const rates = this.commissionRates[tier];
        if (this.parseBooleanField(transaction.is_incentive)) {
            return transaction.total_discounted_sales * this.incentiveRate;
        } else if (this.parseBooleanField(transaction.is_new_product)) {
            return transaction.total_discounted_sales * rates.new;
        } else {
            return transaction.total_discounted_sales * rates.repeat;
        }
    }

    /**
     * Determines the commission tier based on total sales for a state.
     * @param {number} totalSales
     * @returns {string}
     */
    getStateTier(totalSales) {
        if (totalSales >= 50000) return 'tier3';
        if (totalSales >= 10000) return 'tier2';
        return 'tier1';
    }

    /**
     * Verifies commission data from a stream of CSV rows.
     * @param {Array<Object>} csvData
     * @returns {Promise<Object>}
     */
    async verifyCommissionData(csvData) {
        if (csvData.length === 0) {
            return this.getEmptyResults();
        }

        const transactions = [];
        const state_totals = {};
        
        for (let i = 0; i < csvData.length; i++) {
            const row = csvData[i];
            
            try {
                let salesAmount = 0;
                const totalDiscountedRevenue = this.getField(row, this.CORE_FIELDS.total_discounted_sales);
                if (totalDiscountedRevenue) {
                    salesAmount = parseFloat(totalDiscountedRevenue) || 0;
                } else {
                    const quantity = parseFloat(this.getField(row, this.CORE_FIELDS.quantity) || 0);
                    const unitPrice = parseFloat(this.getField(row, this.CORE_FIELDS.unit_price) || 0);
                    const lineDiscount = parseFloat(this.getField(row, this.CORE_FIELDS.line_discount) || 0);
                    salesAmount = (quantity * unitPrice) - lineDiscount;
                }

                const shipToState = this.getField(row, this.CORE_FIELDS.ship_to_state);
                
                if (shipToState && salesAmount > 0) {
                    const transaction = {
                        customer_no: this.getField(row, this.CORE_FIELDS.customer_no) || '',
                        ship_to_state: shipToState,
                        invoice_no: this.getField(row, this.CORE_FIELDS.invoice_no) || '',
                        item_code: this.getField(row, this.CORE_FIELDS.item_code) || '',
                        transaction_date: this.getField(row, this.CORE_FIELDS.transaction_date) || '',
                        quantity: parseFloat(this.getField(row, this.CORE_FIELDS.quantity) || 0),
                        unit_price: parseFloat(this.getField(row, this.CORE_FIELDS.unit_price) || 0),
                        total_discounted_sales: salesAmount,
                        salesperson: this.getField(row, this.CORE_FIELDS.salesperson) || '',
                        line_discount: parseFloat(this.getField(row, this.CORE_FIELDS.line_discount) || 0),
                        is_repeat_product: this.parseBooleanField(this.getField(row, this.CORE_FIELDS.is_repeat_product)),
                        is_new_product: this.parseBooleanField(this.getField(row, this.CORE_FIELDS.is_new_product)),
                        is_incentive: this.parseBooleanField(this.getField(row, this.CORE_FIELDS.is_incentive)),
                        reported_commission: parseFloat(this.getField(row, this.CORE_FIELDS.reported_commission) || 0)
                    };
                    transactions.push(transaction);
                    state_totals[shipToState] = (state_totals[shipToState] || 0) + salesAmount;
                }
            } catch (error) {
                console.error(`Error processing row ${i + 1}:`, error);
            }
        }
        
        return this.calculateVerificationResults(transactions, state_totals);
    }

    /**
     * Calculates the final verification report based on processed transactions.
     * @param {Array<Object>} transactions
     * @param {Object} state_totals
     * @returns {Object}
     */
    calculateVerificationResults(transactions, state_totals) {
        let total_calculated_commission = 0;
        let total_reported_commission = 0;
        let total_state_bonuses = 0;
        
        const commission_breakdown = { 'repeat': 0, 'new': 0, 'incentive': 0 };
        const state_analysis = [];
        const discrepancies = [];
        
        for (const [state, total_sales] of Object.entries(state_totals)) {
            const tier = this.getStateTier(total_sales);
            const rates = this.commissionRates[tier];
            
            let state_calculated_commission = 0;
            let state_reported_commission = 0;
            const state_transactions = transactions.filter(t => t.ship_to_state === state);
            
            for (const transaction of state_transactions) {
                const commission = this.calculateTransactionCommission(transaction, tier);
                
                if (this.parseBooleanField(transaction.is_incentive)) {
                    commission_breakdown.incentive += commission;
                } else if (this.parseBooleanField(transaction.is_new_product)) {
                    commission_breakdown.new += commission;
                } else {
                    commission_breakdown.repeat += commission;
                }
                
                state_calculated_commission += commission;
                state_reported_commission += transaction.reported_commission;
                
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
                calculated_commission: state_calculated_commission.toFixed(2),
                reported_commission: state_reported_commission.toFixed(2),
                bonus: state_bonus.toFixed(2),
                transactions: state_transactions.length
            });
            
            total_calculated_commission += state_calculated_commission;
            total_reported_commission += state_reported_commission;
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

    /**
     * Returns an empty results object for when no data is processed.
     * @returns {Object}
     */
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
}

/**
 * Generates a professional PDF report from the verification data.
 * @param {Object} reportData
 * @param {Object} res - Express response object
 */
function generatePdfReport(reportData, res) {
    const doc = new PDFDocument();
    
    // Set headers for PDF download
    const filename = `commission_verification_report_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Pipe the document to the response stream
    doc.pipe(res);

    // --- Report Content ---
    doc.fontSize(20).text('Commission Verification Report', { align: 'center' });
    doc.moveDown();
    
    // Summary
    doc.fontSize(16).text('Summary');
    doc.fontSize(12);
    doc.text(`Total Transactions: ${reportData.summary.total_transactions}`);
    doc.text(`Total States: ${reportData.summary.total_states}`);
    doc.text(`Calculated Commission: $${reportData.summary.total_calculated_commission}`);
    doc.text(`Reported Commission: $${reportData.summary.total_reported_commission}`);
    doc.text(`Difference: $${reportData.summary.difference}`);
    doc.text(`Total State Bonuses: $${reportData.summary.total_state_bonuses}`);
    doc.moveDown();

    // Commission Breakdown
    doc.fontSize(16).text('Commission Breakdown');
    doc.fontSize(12);
    doc.text(`Repeat Product Commission: $${reportData.commission_breakdown.repeat}`);
    doc.text(`New Product Commission: $${reportData.commission_breakdown.new}`);
    doc.text(`Incentive Product Commission: $${reportData.commission_breakdown.incentive}`);
    doc.moveDown();
    
    // State Analysis
    doc.fontSize(16).text('State Analysis');
    doc.fontSize(12);
    const tableTop = doc.y;
    const itemHeight = 20;
    const tableLeft = 50;

    const headers = ['State', 'Total Sales', 'Tier', 'Calculated', 'Reported', 'Bonus'];
    doc.font('Helvetica-Bold');
    headers.forEach((header, i) => {
        doc.text(header, tableLeft + (i * 90), tableTop, { width: 80, align: 'left' });
    });
    doc.moveDown();
    doc.font('Helvetica');
    
    let currentY = doc.y;
    reportData.state_analysis.forEach(state => {
        currentY += itemHeight;
        doc.text(state.state, tableLeft, currentY, { width: 80, align: 'left' });
        doc.text(`$${state.total_sales}`, tableLeft + 90, currentY, { width: 80, align: 'left' });
        doc.text(state.tier, tableLeft + 180, currentY, { width: 80, align: 'left' });
        doc.text(`$${state.calculated_commission}`, tableLeft + 270, currentY, { width: 80, align: 'left' });
        doc.text(`$${state.reported_commission}`, tableLeft + 360, currentY, { width: 80, align: 'left' });
        doc.text(`$${state.bonus}`, tableLeft + 450, currentY, { width: 80, align: 'left' });
    });

    doc.moveDown(2);

    // Discrepancies
    doc.fontSize(16).text('Discrepancies');
    doc.fontSize(12);
    if (reportData.discrepancies.length > 0) {
        const discTableTop = doc.y;
        const discHeaders = ['Invoice', 'State', 'Calculated', 'Reported', 'Difference'];
        doc.font('Helvetica-Bold');
        discHeaders.forEach((header, i) => {
            doc.text(header, tableLeft + (i * 100), discTableTop, { width: 80, align: 'left' });
        });
        doc.moveDown();
        doc.font('Helvetica');

        let discY = doc.y;
        reportData.discrepancies.forEach(disc => {
            discY += itemHeight;
            doc.text(disc.invoice, tableLeft, discY, { width: 80, align: 'left' });
            doc.text(disc.state, tableLeft + 100, discY, { width: 80, align: 'left' });
            doc.text(`$${disc.calculated}`, tableLeft + 200, discY, { width: 80, align: 'left' });
            doc.text(`$${disc.reported}`, tableLeft + 300, discY, { width: 80, align: 'left' });
            doc.text(`$${disc.difference}`, tableLeft + 400, discY, { width: 80, align: 'left' });
        });
    } else {
        doc.text('No discrepancies found.');
    }

    doc.end();
}

// --- API Endpoints ---
const verifier = new CommissionVerifier();

app.post('/verify-commission', upload.single('csvFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        const filePath = req.file.path;
        const csvData = [];
        
        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => csvData.push(data))
                .on('end', resolve)
                .on('error', reject);
        });

        fs.unlink(filePath, (err) => {
            if (err) console.error('Failed to delete temporary file:', err);
        });
        
        const results = await verifier.verifyCommissionData(csvData);
        res.json(results);
        
    } catch (error) {
        console.error('Verification error:', error);
        
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Failed to delete file on error:', err);
            });
        }
        
        res.status(500).json({
            error: 'Failed to process file.',
            details: error.message
        });
    }
});

app.post('/download-pdf-report', (req, res) => {
    try {
        const { reportData } = req.body;
        if (!reportData) {
            return res.status(400).json({ error: 'No report data provided' });
        }
        generatePdfReport(reportData, res);
    } catch (error) {
        console.error('PDF generation error:', error);
        res.status(500).json({ error: 'Failed to generate PDF report' });
    }
});

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
                '$' + state.calculated_commission,
                '$' + state.reported_commission,
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

// --- Server Startup ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Commission Verification Server running on port ${PORT}`);
    console.log(`Access the application at: http://localhost:${PORT}`);
});