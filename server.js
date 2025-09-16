const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 8080;

// Production-ready middleware configuration
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

// Configure trust proxy for DigitalOcean
app.set('trust proxy', 1);

// Production-safe rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for trusted proxies
    skip: (req) => {
        // Skip rate limiting in development
        return process.env.NODE_ENV === 'development';
    }
});

app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static('public'));

// Create uploads directory
const uploadsDir = process.env.NODE_ENV === 'production' ? '/tmp/uploads' : './uploads';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads with production settings
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ];
        
        if (allowedTypes.includes(file.mimetype) || 
            file.originalname.toLowerCase().endsWith('.xlsx') || 
            file.originalname.toLowerCase().endsWith('.xls')) {
            cb(null, true);
        } else {
            cb(new Error('Only Excel files (.xlsx, .xls) are allowed'), false);
        }
    }
});

// Commission verification class with production optimizations
class CommissionVerifier {
    constructor() {
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
        try {
            const rates = this.COMMISSION_STRUCTURE[tier].rates;
            const rate = rates[commissionType];
            const salesAmount = this.getSalesAmount(transaction);
            
            return salesAmount * rate;
        } catch (error) {
            console.error('Error calculating commission:', error);
            return 0;
        }
    }

    // Helper function to find column value with flexible naming
    getColumnValue(transaction, possibleNames) {
        for (const name of possibleNames) {
            if (transaction[name] !== null && transaction[name] !== undefined && transaction[name] !== '') {
                return transaction[name];
            }
        }
        return null;
    }

    // Get sales amount with flexible column naming
    getSalesAmount(transaction) {
        const possibleNames = [
            'Total Discounted Revenue',
            'TOTAL REVENUE',
            'Total Revenue',
            'Revenue'
        ];
        const value = this.getColumnValue(transaction, possibleNames);
        return parseFloat(value || 0);
    }

    // Process a single transaction with error handling
    processTransaction(transaction, tier, rowIndex) {
        try {
            const result = {
                invoice: transaction.InvoiceNo || 'N/A',
                customer: transaction.CustomerNo || 'N/A',
                sales: this.getSalesAmount(transaction),
                rowNumber: rowIndex + 2,
                commissions: {}
            };

            // Check repeat product commission with flexible naming
            const repeatNames = ['Repeat Product Commission', 'Repeat Commission'];
            const repeatValue = this.getColumnValue(transaction, repeatNames);
            if (repeatValue !== null) {
                const calculated = this.calculateCommissionByType(transaction, tier, 'repeat');
                const reported = parseFloat(repeatValue) || 0;
                result.commissions.repeat = {
                    calculated: calculated,
                    reported: reported,
                    difference: calculated - reported,
                    cellReference: `Row ${result.rowNumber}`
                };
            }

            // Check new product commission with flexible naming
            const newNames = ['New Product Commission ', 'New Product Commission'];
            const newValue = this.getColumnValue(transaction, newNames);
            if (newValue !== null) {
                const calculated = this.calculateCommissionByType(transaction, tier, 'new');
                const reported = parseFloat(newValue) || 0;
                result.commissions.new = {
                    calculated: calculated,
                    reported: reported,
                    difference: calculated - reported,
                    cellReference: `Row ${result.rowNumber}`
                };
            }

            // Check incentive product commission with flexible naming
            const incentiveNames = ['Incentive Product Commission', 'Incentive Commission'];
            const incentiveValue = this.getColumnValue(transaction, incentiveNames);
            if (incentiveValue !== null) {
                const calculated = this.calculateCommissionByType(transaction, tier, 'incentive');
                const reported = parseFloat(incentiveValue) || 0;
                result.commissions.incentive = {
                    calculated: calculated,
                    reported: reported,
                    difference: calculated - reported,
                    cellReference: `Row ${result.rowNumber}`
                };
            }

            return result;
        } catch (error) {
            console.error('Error processing transaction:', error);
            return {
                invoice: 'ERROR',
                customer: 'ERROR',
                sales: 0,
                rowNumber: rowIndex + 2,
                commissions: {}
            };
        }
    }

    // Process DETAIL sheet with memory optimization
    processDetailSheet(detailData) {
        try {
            console.log(`Processing ${detailData.length} detail rows`);
            const stateGroups = {};

            // Process in chunks to avoid memory issues
            const chunkSize = 100;
            for (let i = 0; i < detailData.length; i += chunkSize) {
                const chunk = detailData.slice(i, i + chunkSize);
                
                chunk.forEach((row, chunkIndex) => {
                    const actualIndex = i + chunkIndex;
                    const state = row.ShipToState;
                    const salesAmount = this.getSalesAmount(row);
                    
                    if (!state || salesAmount <= 0) return;

                    if (!stateGroups[state]) {
                        stateGroups[state] = {
                            transactions: [],
                            totalSales: 0
                        };
                    }

                    row.originalRowIndex = actualIndex;
                    stateGroups[state].transactions.push(row);
                    stateGroups[state].totalSales += salesAmount;
                });
            }

            console.log(`Grouped into ${Object.keys(stateGroups).length} states`);

            // Process each state
            const stateResults = [];
            let totalCalculatedCommission = 0;
            let totalReportedCommission = 0;
            let totalStateBonuses = 0;
            let totalDiscrepancies = [];

            Object.keys(stateGroups).forEach(state => {
                try {
                    const stateData = stateGroups[state];
                    const tier = this.getTier(stateData.totalSales);
                    const bonus = this.COMMISSION_STRUCTURE[tier].bonus;
                    
                    let stateCalculatedCommission = 0;
                    let stateReportedCommission = 0;
                    const stateDiscrepancies = [];

                    // Process transactions in smaller batches
                    stateData.transactions.forEach((transaction, index) => {
                        const processedTransaction = this.processTransaction(transaction, tier, transaction.originalRowIndex || index);

                        Object.keys(processedTransaction.commissions).forEach(type => {
                            const comm = processedTransaction.commissions[type];
                            stateCalculatedCommission += comm.calculated;
                            stateReportedCommission += comm.reported;

                            if (Math.abs(comm.difference) > 0.01) {
                                stateDiscrepancies.push({
                                    invoice: processedTransaction.invoice,
                                    customer: processedTransaction.customer,
                                    type: type,
                                    sales: processedTransaction.sales,
                                    calculated: comm.calculated,
                                    reported: comm.reported,
                                    difference: comm.difference,
                                    tier: tier,
                                    rowNumber: processedTransaction.rowNumber,
                                    cellReference: comm.cellReference,
                                    sheetName: 'DETAIL'
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
                        transactions: stateData.transactions.length,
                        discrepancies: stateDiscrepancies
                    });

                    totalCalculatedCommission += stateCalculatedCommission;
                    totalReportedCommission += stateReportedCommission;
                    totalStateBonuses += bonus;
                    totalDiscrepancies = totalDiscrepancies.concat(stateDiscrepancies);
                } catch (stateError) {
                    console.error(`Error processing state ${state}:`, stateError);
                }
            });

            return {
                stateResults: stateResults,
                totalCalculatedCommission: totalCalculatedCommission,
                totalReportedCommission: totalReportedCommission,
                totalStateBonuses: totalStateBonuses,
                discrepancies: totalDiscrepancies
            };
        } catch (error) {
            console.error('Error processing detail sheet:', error);
            throw error;
        }
    }

    // Process SUMMARY sheet with error handling
    processSummarySheet(summaryData) {
        try {
            let actualPayment = 0;
            
            // Look for payment information in summary
            summaryData.forEach(row => {
                Object.keys(row).forEach(key => {
                    const value = parseFloat(row[key]);
                    if (!isNaN(value) && value > 0) {
                        actualPayment = Math.max(actualPayment, value);
                    }
                });
            });

            return { actualPayment };
        } catch (error) {
            console.error('Error processing summary sheet:', error);
            return { actualPayment: 0 };
        }
    }
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        version: '2.0.0'
    });
});

// Main verification endpoint with comprehensive error handling
app.post('/verify-commission', upload.single('excelFile'), async (req, res) => {
    let filePath = null;
    
    try {
        if (!req.file) {
            return res.status(400).json({ 
                error: 'No file uploaded',
                message: 'Please select an Excel file to upload'
            });
        }

        filePath = req.file.path;
        console.log(`Processing file: ${req.file.originalname}`);

        // Read Excel file with error handling
        let workbook;
        try {
            workbook = XLSX.readFile(filePath, { 
                cellDates: true,
                cellNF: false,
                cellText: false
            });
        } catch (readError) {
            console.error('Error reading Excel file:', readError);
            return res.status(400).json({
                error: 'Invalid Excel file',
                message: 'Unable to read the Excel file. Please ensure it is a valid .xlsx or .xls file.'
            });
        }

        const sheetNames = workbook.SheetNames;
        console.log('Available sheets:', sheetNames);

        // Find sheets with flexible naming
        const detailSheetName = sheetNames.find(name => 
            name.toLowerCase().includes('detail')
        );
        const summarySheetName = sheetNames.find(name => 
            name.toLowerCase().includes('summary')
        );

        if (!detailSheetName || !summarySheetName) {
            return res.status(400).json({
                error: 'Required sheets not found',
                message: 'Excel file must contain both DETAIL and SUMMARY sheets',
                availableSheets: sheetNames
            });
        }

        // Process sheets with timeout protection
        const processingTimeout = setTimeout(() => {
            throw new Error('Processing timeout - file too large or complex');
        }, 60000); // 60 second timeout

        try {
            // Convert sheets to JSON
            const detailSheet = workbook.Sheets[detailSheetName];
            const summarySheet = workbook.Sheets[summarySheetName];

            const detailData = XLSX.utils.sheet_to_json(detailSheet);
            const summaryData = XLSX.utils.sheet_to_json(summarySheet);

            console.log(`DETAIL sheet: ${detailData.length} rows`);
            console.log(`SUMMARY sheet: ${summaryData.length} rows`);

            // Initialize verifier and process data
            const verifier = new CommissionVerifier();
            const calculatedResults = verifier.processDetailSheet(detailData);
            const summaryResults = verifier.processSummarySheet(summaryData);

            clearTimeout(processingTimeout);

            // Build response
            const response = {
                summary: {
                    my_calculated_total: (calculatedResults.totalCalculatedCommission + calculatedResults.totalStateBonuses).toFixed(2),
                    my_calculated_commission: calculatedResults.totalCalculatedCommission.toFixed(2),
                    my_calculated_bonuses: calculatedResults.totalStateBonuses.toFixed(2),
                    detail_reported_commission: calculatedResults.totalReportedCommission.toFixed(2),
                    detail_reported_total: calculatedResults.totalReportedCommission.toFixed(2),
                    actual_payment: summaryResults.actualPayment.toFixed(2),
                    percentage_errors: Math.abs(calculatedResults.totalCalculatedCommission - calculatedResults.totalReportedCommission).toFixed(2),
                    payment_difference: ((calculatedResults.totalCalculatedCommission + calculatedResults.totalStateBonuses) - summaryResults.actualPayment).toFixed(2),
                    percentage_status: calculatedResults.discrepancies.length > 0 ? 'ERRORS FOUND' : 'CORRECT',
                    payment_status: Math.abs((calculatedResults.totalCalculatedCommission + calculatedResults.totalStateBonuses) - summaryResults.actualPayment) > 0.01 ? 
                        ((calculatedResults.totalCalculatedCommission + calculatedResults.totalStateBonuses) > summaryResults.actualPayment ? 'UNDERPAID' : 'OVERPAID') : 'CORRECT',
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
                discrepancies: calculatedResults.discrepancies.slice(0, 100).map(disc => ({ // Limit to first 100 discrepancies
                    invoice: disc.invoice,
                    customer: disc.customer,
                    commission_type: disc.type,
                    sales_amount: disc.sales.toFixed(2),
                    tier: disc.tier,
                    my_calculated: disc.calculated.toFixed(2),
                    detail_reported: disc.reported.toFixed(2),
                    difference: disc.difference.toFixed(2),
                    status: disc.difference > 0 ? 'UNDERCALCULATED' : 'OVERCALCULATED',
                    row_number: disc.rowNumber,
                    cell_reference: disc.cellReference,
                    sheet_name: disc.sheetName
                })),
                commission_structure: {
                    tier1: "Tier 1 ($0-$9,999): Repeat 2%, New Product 3%",
                    tier2: "Tier 2 ($10k-$49.9k): Repeat 1%, New Product 2% + $100 bonus",
                    tier3: "Tier 3 ($50k+): Repeat 0.5%, New Product 1.5% + $300 bonus",
                    incentive: "Incentivized SKUs: Fixed 3%+"
                }
            };

            res.json(response);

        } catch (processingError) {
            clearTimeout(processingTimeout);
            throw processingError;
        }

    } catch (error) {
        console.error('Verification error:', error);
        
        // Return appropriate error response
        if (error.message.includes('timeout')) {
            res.status(408).json({
                error: 'Processing timeout',
                message: 'File is too large or complex to process. Please try with a smaller file.'
            });
        } else {
            res.status(500).json({
                error: 'Processing failed',
                message: 'An error occurred while processing your file. Please try again.',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    } finally {
        // Clean up uploaded file
        if (filePath && fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (cleanupError) {
                console.error('Error cleaning up file:', cleanupError);
            }
        }
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'File too large',
                message: 'File size must be less than 50MB'
            });
        }
    }
    
    res.status(500).json({
        error: 'Server error',
        message: 'An unexpected error occurred'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        message: 'The requested resource was not found'
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Production Commission Verification Server running on port ${PORT}`);
    console.log(`📁 Upload directory: ${uploadsDir}`);
    console.log(`📊 Max file size: 50MB`);
    console.log(`🔒 Security: Helmet enabled`);
    console.log(`⚡ Rate limiting: Enabled`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});

