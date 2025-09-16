const express = require('express');
const cors = require('cors');
const multer = require('multer');
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
        version: '2.0.0'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Configure multer for Excel file uploads
const upload = multer({ 
    dest: 'uploads/',
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept Excel files
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.mimetype === 'application/vnd.ms-excel' ||
            file.originalname.toLowerCase().endsWith('.xlsx') ||
            file.originalname.toLowerCase().endsWith('.xls')) {
            cb(null, true);
        } else {
            cb(new Error('Only Excel files (.xlsx, .xls) are allowed'), false);
        }
    }
});

// Commission calculation class
class CommissionCalculator {
    constructor() {
        // Official commission structure from PDF
        this.COMMISSION_STRUCTURE = {
            tier1: {
                threshold: { min: 0, max: 9999.99 },
                rates: { repeat: 0.02, new: 0.03, incentive: 0.03 },
                bonus: 0
            },
            tier2: {
                threshold: { min: 10000, max: 49999.99 },
                rates: { repeat: 0.01, new: 0.02, incentive: 0.03 },
                bonus: 100
            },
            tier3: {
                threshold: { min: 50000, max: Infinity },
                rates: { repeat: 0.005, new: 0.015, incentive: 0.03 },
                bonus: 300
            }
        };
    }

    // Determine tier based on total sales
    getTier(totalSales) {
        if (totalSales <= this.COMMISSION_STRUCTURE.tier1.threshold.max) return 'tier1';
        if (totalSales <= this.COMMISSION_STRUCTURE.tier2.threshold.max) return 'tier2';
        return 'tier3';
    }

    // Calculate commission for a transaction based on commission type
    calculateCommissionByType(transaction, tier, commissionType) {
        const rates = this.COMMISSION_STRUCTURE[tier].rates;
        const rate = rates[commissionType];
        const salesAmount = parseFloat(transaction['Total Discounted Revenue'] || 0);
        
        return salesAmount * rate;
    }

    // Process a single transaction and check all commission types
    processTransaction(transaction, tier) {
        const result = {
            invoice: transaction.InvoiceNo,
            customer: transaction.CustomerNo,
            sales: parseFloat(transaction['Total Discounted Revenue'] || 0),
            commissions: {}
        };

        // Check repeat product commission
        const repeatValue = transaction['Repeat Product Commission'];
        if (repeatValue !== null && repeatValue !== undefined && repeatValue !== '') {
            const calculated = this.calculateCommissionByType(transaction, tier, 'repeat');
            const reported = parseFloat(repeatValue) || 0;
            result.commissions.repeat = {
                calculated: calculated,
                reported: reported,
                difference: calculated - reported
            };
        }

        // Check new product commission
        const newValue = transaction['New Product Commission '] || transaction['New Product Commission'];
        if (newValue !== null && newValue !== undefined && newValue !== '') {
            const calculated = this.calculateCommissionByType(transaction, tier, 'new');
            const reported = parseFloat(newValue) || 0;
            result.commissions.new = {
                calculated: calculated,
                reported: reported,
                difference: calculated - reported
            };
        }

        // Check incentive product commission
        const incentiveValue = transaction['Incentive Product Commission'];
        if (incentiveValue !== null && incentiveValue !== undefined && incentiveValue !== '') {
            const calculated = this.calculateCommissionByType(transaction, tier, 'incentive');
            const reported = parseFloat(incentiveValue) || 0;
            result.commissions.incentive = {
                calculated: calculated,
                reported: reported,
                difference: calculated - reported
            };
        }

        return result;
    }

    // Process DETAIL sheet and calculate commissions
    processDetailSheet(detailData) {
        const stateGroups = {};
        const allTransactions = [];

        // Group transactions by state to determine tiers
        detailData.forEach(row => {
            const state = row.ShipToState;
            const salesAmount = parseFloat(row['Total Discounted Revenue'] || 0);
            
            if (!state || salesAmount <= 0) return;

            if (!stateGroups[state]) {
                stateGroups[state] = {
                    transactions: [],
                    totalSales: 0
                };
            }

            stateGroups[state].transactions.push(row);
            stateGroups[state].totalSales += salesAmount;
        });

        // Process each state and its transactions
        const stateResults = [];
        let totalCalculatedCommission = 0;
        let totalReportedCommission = 0;
        let totalStateBonuses = 0;
        let totalDiscrepancies = [];

        Object.keys(stateGroups).forEach(state => {
            const stateData = stateGroups[state];
            const tier = this.getTier(stateData.totalSales);
            const bonus = this.COMMISSION_STRUCTURE[tier].bonus;
            
            let stateCalculatedCommission = 0;
            let stateReportedCommission = 0;
            const stateTransactions = [];
            const stateDiscrepancies = [];

            // Process each transaction in this state
            stateData.transactions.forEach(transaction => {
                const processedTransaction = this.processTransaction(transaction, tier);
                stateTransactions.push(processedTransaction);

                // Sum up commissions for this transaction
                Object.keys(processedTransaction.commissions).forEach(type => {
                    const comm = processedTransaction.commissions[type];
                    stateCalculatedCommission += comm.calculated;
                    stateReportedCommission += comm.reported;

                    // Track discrepancies
                    if (Math.abs(comm.difference) > 0.01) { // Allow for small rounding differences
                        stateDiscrepancies.push({
                            invoice: processedTransaction.invoice,
                            customer: processedTransaction.customer,
                            type: type,
                            sales: processedTransaction.sales,
                            calculated: comm.calculated,
                            reported: comm.reported,
                            difference: comm.difference,
                            tier: tier
                        });
                    }
                });
            });

            stateResults.push({
                state: state,
                totalSales: stateData.totalSales,
                tier: tier,
                calculatedCommission: stateCalculatedCommission,
                reportedCommission: stateReportedCommission,
                commissionDifference: stateCalculatedCommission - stateReportedCommission,
                bonus: bonus,
                transactions: stateTransactions.length,
                discrepancies: stateDiscrepancies
            });

            totalCalculatedCommission += stateCalculatedCommission;
            totalReportedCommission += stateReportedCommission;
            totalStateBonuses += bonus;
            totalDiscrepancies = totalDiscrepancies.concat(stateDiscrepancies);
        });

        return {
            stateResults: stateResults,
            totalCalculatedCommission: totalCalculatedCommission,
            totalReportedCommission: totalReportedCommission,
            totalStateBonuses: totalStateBonuses,
            grandTotalCalculated: totalCalculatedCommission + totalStateBonuses,
            grandTotalReported: totalReportedCommission + totalStateBonuses,
            discrepancies: totalDiscrepancies
        };
    }

    // Extract actual payment from SUMMARY sheet
    extractActualPayment(summaryData) {
        // Look for the grand total row
        const grandTotalRow = summaryData.find(row => 
            row['Row Labels'] && row['Row Labels'].toString().toLowerCase().includes('grand total')
        );

        if (grandTotalRow) {
            // Look for the final total column (often unnamed or in last column)
            const columns = Object.keys(grandTotalRow);
            const lastColumn = columns[columns.length - 1];
            
            // Try different possible column names for actual payment
            const possiblePaymentColumns = [
                'Unnamed: 7', 'Total Paid', 'Actual Payment', 'Final Total', lastColumn
            ];

            for (const col of possiblePaymentColumns) {
                if (grandTotalRow[col] && !isNaN(parseFloat(grandTotalRow[col]))) {
                    return parseFloat(grandTotalRow[col]);
                }
            }

            // Fallback: sum commission + state bonus if available
            const commission = parseFloat(grandTotalRow['Sum of Total Commission'] || 0);
            const stateBonus = parseFloat(grandTotalRow['ADDED STATE COMMISISON'] || 0);
            
            if (commission > 0) {
                return commission + stateBonus;
            }
        }

        return 0;
    }
}

// Main verification endpoint
app.post('/verify-commission', upload.single('excelFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No Excel file uploaded' });
        }

        console.log(`Processing Excel file: ${req.file.originalname}`);

        // Read Excel file
        const workbook = XLSX.readFile(req.file.path);
        const sheetNames = workbook.SheetNames;
        
        console.log('Available sheets:', sheetNames);

        // Find DETAIL and SUMMARY sheets (case insensitive)
        const detailSheetName = sheetNames.find(name => 
            name.toLowerCase().includes('detail')
        );
        const summarySheetName = sheetNames.find(name => 
            name.toLowerCase().includes('summary')
        );

        if (!detailSheetName || !summarySheetName) {
            return res.status(400).json({ 
                error: 'Excel file must contain both DETAIL and SUMMARY sheets',
                availableSheets: sheetNames
            });
        }

        // Convert sheets to JSON
        const detailSheet = workbook.Sheets[detailSheetName];
        const summarySheet = workbook.Sheets[summarySheetName];
        
        const detailData = XLSX.utils.sheet_to_json(detailSheet);
        const summaryData = XLSX.utils.sheet_to_json(summarySheet);

        console.log(`DETAIL sheet: ${detailData.length} rows`);
        console.log(`SUMMARY sheet: ${summaryData.length} rows`);

        // Initialize calculator and process data
        const calculator = new CommissionCalculator();
        
        // Calculate what SHOULD be paid from DETAIL sheet
        const calculatedResults = calculator.processDetailSheet(detailData);
        
        // Extract what WAS actually paid from SUMMARY sheet
        const actualPayment = calculator.extractActualPayment(summaryData);

        // Calculate difference between my calculation and actual payment
        const paymentDifference = calculatedResults.grandTotalCalculated - actualPayment;
        
        // Calculate difference between my calculation and what's reported in DETAIL sheet
        const calculationDifference = calculatedResults.totalCalculatedCommission - calculatedResults.totalReportedCommission;

        // Prepare response
        const response = {
            summary: {
                // What I calculated should be paid
                my_calculated_total: calculatedResults.grandTotalCalculated.toFixed(2),
                my_calculated_commission: calculatedResults.totalCalculatedCommission.toFixed(2),
                my_calculated_bonuses: calculatedResults.totalStateBonuses.toFixed(2),
                
                // What was reported in DETAIL sheet
                detail_reported_commission: calculatedResults.totalReportedCommission.toFixed(2),
                detail_reported_total: calculatedResults.grandTotalReported.toFixed(2),
                
                // What was actually paid (from SUMMARY sheet)
                actual_payment: actualPayment.toFixed(2),
                
                // Differences
                percentage_errors: calculationDifference.toFixed(2),
                payment_difference: paymentDifference.toFixed(2),
                
                // Status
                percentage_status: Math.abs(calculationDifference) < 0.01 ? 'CORRECT' : 'ERRORS FOUND',
                payment_status: Math.abs(paymentDifference) < 0.01 ? 'CORRECT' : (paymentDifference > 0 ? 'UNDERPAID' : 'OVERPAID'),
                
                total_discrepancies: calculatedResults.discrepancies.length
            },
            state_analysis: calculatedResults.stateResults.map(state => ({
                state: state.state,
                total_sales: state.totalSales.toFixed(2),
                tier: state.tier,
                my_calculated_commission: state.calculatedCommission.toFixed(2),
                detail_reported_commission: state.reportedCommission.toFixed(2),
                commission_difference: state.commissionDifference.toFixed(2),
                bonus: state.bonus.toFixed(2),
                transactions: state.transactions,
                discrepancies_count: state.discrepancies.length
            })),
            discrepancies: calculatedResults.discrepancies.map(disc => ({
                invoice: disc.invoice,
                customer: disc.customer,
                commission_type: disc.type,
                sales_amount: disc.sales.toFixed(2),
                tier: disc.tier,
                my_calculated: disc.calculated.toFixed(2),
                detail_reported: disc.reported.toFixed(2),
                difference: disc.difference.toFixed(2),
                status: disc.difference > 0 ? 'UNDERCALCULATED' : 'OVERCALCULATED'
            })),
            commission_structure: {
                tier1: "Tier 1 ($0-$9,999): Repeat 2%, New Product 3%",
                tier2: "Tier 2 ($10k-$49.9k): Repeat 1%, New Product 2% + $100 bonus",
                tier3: "Tier 3 ($50k+): Repeat 0.5%, New Product 1.5% + $300 bonus",
                incentive: "Incentivized SKUs: Fixed 3%+"
            }
        };

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        res.json(response);

    } catch (error) {
        console.error('Verification error:', error);
        
        // Clean up file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ 
            error: 'Failed to process Excel file',
            details: error.message
        });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Commission Verification Server v2.0 running on port ${PORT}`);
    console.log(`Access the application at: http://localhost:${PORT}`);
    console.log('Now supports Excel files with DETAIL and SUMMARY sheets');
});

