/**
 * Improved Commission Verification Server
 * 
 * This server implementation integrates the optimized commission calculator
 * and Excel processor to provide a robust, scalable solution.
 * 
 * Key improvements:
 * - Modular architecture with separation of concerns
 * - Streaming file processing with progress tracking
 * - Enhanced error handling and validation
 * - Security improvements for file uploads
 * - Performance monitoring and logging
 * - Graceful error recovery and cleanup
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const OptimizedCommissionCalculator = require('./optimized_commission_calculator');
const OptimizedExcelProcessor = require('./optimized_excel_processor');

class ImprovedCommissionServer {
    constructor(options = {}) {
        this.app = express();
        this.options = {
            port: options.port || process.env.PORT || 8080,
            uploadDir: options.uploadDir || path.join(__dirname, 'uploads'),
            maxFileSize: options.maxFileSize || 50 * 1024 * 1024, // 50MB
            corsOrigin: options.corsOrigin || '*',
            enableRateLimit: options.enableRateLimit !== false,
            logLevel: options.logLevel || 'info',
            ...options
        };

        this.commissionCalculator = new OptimizedCommissionCalculator();
        this.excelProcessor = new OptimizedExcelProcessor({
            maxFileSize: this.options.maxFileSize,
            tempDir: path.join(this.options.uploadDir, 'temp')
        });

        this.activeProcessing = new Map(); // Track active processing sessions
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        // Trust proxy for DigitalOcean Apps and other reverse proxies
        this.app.set('trust proxy', true);

        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "blob:"],
                },
            },
        }));

        // CORS configuration
        this.app.use(cors({
            origin: this.options.corsOrigin,
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            credentials: true
        }));

        // Rate limiting
        if (this.options.enableRateLimit) {
            const limiter = rateLimit({
                windowMs: 15 * 60 * 1000, // 15 minutes
                max: 100, // Limit each IP to 100 requests per windowMs
                message: {
                    error: 'Too many requests from this IP, please try again later.'
                }
            });
            this.app.use('/api/', limiter);
        }

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Static files
        this.app.use(express.static(path.join(__dirname, 'public')));

        // Request logging
        this.app.use((req, res, next) => {
            const start = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - start;
                console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
            });
            next();
        });

        // Ensure upload directory exists
        this.ensureUploadDir();
    }

    /**
     * Setup API routes
     */
    setupRoutes() {
        // Health check endpoint
        this.app.get('/api/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                version: '2.0.0',
                activeProcessing: this.activeProcessing.size
            });
        });

        // File upload configuration
        const upload = multer({
            dest: this.options.uploadDir,
            limits: {
                fileSize: this.options.maxFileSize,
                files: 1
            },
            fileFilter: (req, file, cb) => {
                const allowedTypes = [
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'application/vnd.ms-excel',
                    'text/csv',
                    'application/octet-stream' // Sometimes Excel files are detected as this
                ];
                
                // Get file extension
                const fileExtension = file.originalname.toLowerCase().split('.').pop();
                const allowedExtensions = ['xlsx', 'xls', 'csv'];
                
                // Check both MIME type and file extension
                const validMimeType = allowedTypes.includes(file.mimetype);
                const validExtension = allowedExtensions.includes(fileExtension);
                
                if (validMimeType || validExtension) {
                    console.log(`File accepted: ${file.originalname} (MIME: ${file.mimetype}, Ext: ${fileExtension})`);
                    cb(null, true);
                } else {
                    console.log(`File rejected: ${file.originalname} (MIME: ${file.mimetype}, Ext: ${fileExtension})`);
                    cb(new Error(`Invalid file type. Only Excel (.xlsx, .xls) and CSV files are allowed. Received: ${file.mimetype}`));
                }
            }
        });

        // Commission verification endpoint
        this.app.post('/api/verify-commission', upload.single('excelFile'), async (req, res) => {
            const sessionId = this.generateSessionId();
            
            try {
                if (!req.file) {
                    return res.status(400).json({
                        error: 'No file uploaded',
                        sessionId
                    });
                }

                console.log(`Starting commission verification for session ${sessionId}`);
                
                // Track active processing
                this.activeProcessing.set(sessionId, {
                    startTime: Date.now(),
                    fileName: req.file.originalname,
                    fileSize: req.file.size,
                    status: 'processing'
                });

                // Setup progress tracking
                const progressHandler = (progress) => {
                    console.log(`Session ${sessionId} progress:`, progress);
                    // In a real implementation, you might emit this via WebSocket
                };

                this.excelProcessor.on('progress', progressHandler);
                this.commissionCalculator.on('progress', progressHandler);

                // Process Excel file
                const excelResults = await this.excelProcessor.processExcelFile(req.file.path);
                
                // Initialize commission rules (in a real app, these would come from a database)
                await this.initializeCommissionRules();
                
                // Process transactions from all sheets
                const allTransactions = this.extractTransactionsFromSheets(excelResults.sheets);
                
                // Calculate commissions
                const commissionResults = await this.commissionCalculator.processTransactions(allTransactions);

                // Combine results
                const finalResults = {
                    sessionId,
                    fileName: req.file.originalname,
                    fileSize: req.file.size,
                    processingTime: Date.now() - this.activeProcessing.get(sessionId).startTime,
                    excelProcessing: {
                        sheetsProcessed: Object.keys(excelResults.sheets).length,
                        totalRows: excelResults.summary.totalRows,
                        processedRows: excelResults.summary.processedRows,
                        errors: excelResults.summary.errors
                    },
                    commissionBreakdown: commissionResults.commissionBreakdown,
                    stateAnalysis: commissionResults.stateAnalysisObject,
                    discrepancies: commissionResults.discrepancies,
                    totalCommissionOwed: commissionResults.totalCommissionOwed,
                    processingStats: commissionResults.processingStats
                };

                // Clean up
                await this.cleanup(req.file.path, sessionId);
                
                res.json({
                    success: true,
                    results: finalResults
                });

            } catch (error) {
                console.error(`Error in session ${sessionId}:`, error);
                
                // Clean up on error
                if (req.file) {
                    await this.cleanup(req.file.path, sessionId);
                }

                res.status(500).json({
                    error: error.message,
                    sessionId,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Processing status endpoint
        this.app.get('/api/processing-status/:sessionId', (req, res) => {
            const sessionId = req.params.sessionId;
            const session = this.activeProcessing.get(sessionId);
            
            if (!session) {
                return res.status(404).json({
                    error: 'Session not found',
                    sessionId
                });
            }

            res.json({
                sessionId,
                ...session,
                duration: Date.now() - session.startTime
            });
        });

        // Cancel processing endpoint
        this.app.delete('/api/processing/:sessionId', (req, res) => {
            const sessionId = req.params.sessionId;
            const session = this.activeProcessing.get(sessionId);
            
            if (!session) {
                return res.status(404).json({
                    error: 'Session not found',
                    sessionId
                });
            }

            // Cancel processing
            this.excelProcessor.cancelProcessing();
            this.activeProcessing.delete(sessionId);

            res.json({
                message: 'Processing cancelled',
                sessionId
            });
        });

        // System statistics endpoint
        this.app.get('/api/stats', (req, res) => {
            const memUsage = process.memoryUsage();
            
            res.json({
                server: {
                    uptime: process.uptime(),
                    memory: {
                        rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
                        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
                        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
                        external: Math.round(memUsage.external / 1024 / 1024) + ' MB'
                    },
                    activeProcessing: this.activeProcessing.size
                },
                processing: {
                    excelProcessor: this.excelProcessor.getProcessingStatus(),
                    activeSessions: Array.from(this.activeProcessing.entries()).map(([id, session]) => ({
                        sessionId: id,
                        ...session,
                        duration: Date.now() - session.startTime
                    }))
                }
            });
        });

        // Serve main application
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });
    }

    /**
     * Setup error handling
     */
    setupErrorHandling() {
        // Handle multer errors
        this.app.use((error, req, res, next) => {
            if (error instanceof multer.MulterError) {
                if (error.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        error: `File too large. Maximum size is ${this.options.maxFileSize / 1024 / 1024}MB`
                    });
                }
                return res.status(400).json({
                    error: `Upload error: ${error.message}`
                });
            }
            next(error);
        });

        // Global error handler
        this.app.use((error, req, res, next) => {
            console.error('Unhandled error:', error);
            
            res.status(500).json({
                error: 'Internal server error',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
                timestamp: new Date().toISOString()
            });
        });

        // Handle 404
        this.app.use((req, res) => {
            res.status(404).json({
                error: 'Not found',
                path: req.path,
                method: req.method
            });
        });
    }

    /**
     * Initialize commission rules
     */
    async initializeCommissionRules() {
        // Sample commission rules - in a real app, these would come from a database
        const commissionRules = [
            {
                productType: 'Software',
                salesRegion: 'North',
                calculationType: 'percentage',
                rate: 10,
                type: 'newProduct',
                priority: 1
            },
            {
                productType: 'Hardware',
                salesRegion: 'South',
                calculationType: 'percentage',
                rate: 8,
                type: 'repeat',
                priority: 1
            },
            {
                calculationType: 'percentage',
                rate: 5,
                type: 'repeat',
                priority: 0 // Default rule
            }
        ];

        const stateRules = [
            {
                stateCode: 'CA',
                type: 'bonus',
                bonusType: 'percentage',
                bonusRate: 2,
                name: 'California Bonus'
            },
            {
                stateCode: 'NY',
                type: 'bonus',
                bonusType: 'percentage',
                bonusRate: 1.5,
                name: 'New York Bonus'
            },
            {
                stateCode: 'TX',
                type: 'tax',
                taxRate: 8.25,
                name: 'Texas Sales Tax'
            }
        ];

        this.commissionCalculator.initializeCommissionRules(commissionRules);
        this.commissionCalculator.initializeStateRules(stateRules);
    }

    /**
     * Extract transactions from processed sheets
     * @param {Object} sheets - Processed sheet data
     * @returns {Array} Combined transaction data
     */
    extractTransactionsFromSheets(sheets) {
        const transactions = [];
        
        for (const [sheetName, sheetData] of Object.entries(sheets)) {
            if (sheetData.data && Array.isArray(sheetData.data)) {
                sheetData.data.forEach(row => {
                    transactions.push({
                        ...row,
                        sourceSheet: sheetName
                    });
                });
            }
        }

        console.log(`Extracted ${transactions.length} transactions from ${Object.keys(sheets).length} sheets`);
        return transactions;
    }

    /**
     * Generate unique session ID
     * @returns {string} Session ID
     */
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Ensure upload directory exists
     */
    ensureUploadDir() {
        if (!fs.existsSync(this.options.uploadDir)) {
            fs.mkdirSync(this.options.uploadDir, { recursive: true });
            console.log(`Created upload directory: ${this.options.uploadDir}`);
        }
    }

    /**
     * Clean up files and session data
     * @param {string} filePath - File path to clean up
     * @param {string} sessionId - Session ID to clean up
     */
    async cleanup(filePath, sessionId) {
        try {
            // Remove uploaded file
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`Cleaned up uploaded file: ${filePath}`);
            }

            // Remove session from active processing
            this.activeProcessing.delete(sessionId);

            // Clean up Excel processor
            await this.excelProcessor.cleanup(filePath);

        } catch (error) {
            console.error(`Error during cleanup for session ${sessionId}:`, error);
        }
    }

    /**
     * Start the server
     * @returns {Promise} Server instance
     */
    async start() {
        return new Promise((resolve, reject) => {
            try {
                const server = this.app.listen(this.options.port, '0.0.0.0', () => {
                    console.log(`✅ Improved Commission Verification Server running on port ${this.options.port}`);
                    console.log(`📁 Upload directory: ${this.options.uploadDir}`);
                    console.log(`📊 Max file size: ${this.options.maxFileSize / 1024 / 1024}MB`);
                    console.log(`🔒 Security: Helmet enabled`);
                    console.log(`⚡ Rate limiting: ${this.options.enableRateLimit ? 'Enabled' : 'Disabled'}`);
                    resolve(server);
                });

                server.on('error', reject);

                // Graceful shutdown
                process.on('SIGTERM', () => {
                    console.log('SIGTERM received, shutting down gracefully');
                    server.close(() => {
                        console.log('Server closed');
                        process.exit(0);
                    });
                });

            } catch (error) {
                reject(error);
            }
        });
    }
}

// Start server if this file is run directly
if (require.main === module) {
    const server = new ImprovedCommissionServer();
    server.start().catch(console.error);
}

module.exports = ImprovedCommissionServer;

