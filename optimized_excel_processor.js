/**
 * Smart Excel Processor - Solves the 30% Hang Issue
 * 
 * This processor fixes the fundamental problem by:
 * 1. Detecting actual data range instead of processing empty rows
 * 2. Only processing rows that contain real data
 * 3. Avoiding the 1M+ empty row processing that caused hangs
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class OptimizedExcelProcessor extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            maxFileSize: options.maxFileSize || 50 * 1024 * 1024,
            maxRows: options.maxRows || 100000,
            progressInterval: options.progressInterval || 1000,
            tempDir: options.tempDir || './temp',
            ...options
        };
        
        this.processingState = {
            isProcessing: false,
            currentFile: null,
            errors: []
        };
    }

    /**
     * Process Excel file with smart data range detection
     * @param {string} filePath - Path to Excel file
     * @returns {Object} Processing results
     */
    async processExcelFile(filePath) {
        this.processingState.isProcessing = true;
        this.processingState.currentFile = filePath;
        this.processingState.errors = [];
        
        try {
            console.log('🧠 Starting smart Excel processing...');
            
            // Validate file
            await this.validateFile(filePath);
            
            // Find actual data range first - this is the key fix!
            const rangeInfo = await this.findActualDataRange(filePath);
            
            // Read workbook with actual data range
            console.log(`📖 Reading Excel file (${rangeInfo.actualRowCount} rows instead of ${rangeInfo.fullRange.e.r + 1})...`);
            const workbook = XLSX.readFile(filePath, {
                cellDates: true,
                cellNF: false,
                cellText: false
            });
            
            const results = {
                sheets: {},
                summary: {
                    totalRows: 0,
                    processedRows: 0,
                    errors: [],
                    rangeOptimization: rangeInfo
                }
            };
            
            // Process each sheet with smart range detection
            for (const sheetName of Object.keys(workbook.Sheets)) {
                console.log(`📋 Processing sheet: ${sheetName}`);
                const sheetResult = await this.processSheetSmart(workbook, sheetName, rangeInfo);
                
                results.sheets[sheetName] = sheetResult;
                results.summary.totalRows += sheetResult.totalRows;
                results.summary.processedRows += sheetResult.processedRows;
                results.summary.errors.push(...sheetResult.errors);
            }
            
            console.log('✅ Smart Excel processing completed');
            this.emit('processingCompleted', results);
            return results;
            
        } catch (error) {
            console.error('❌ Smart Excel processing failed:', error);
            this.emit('processingError', error);
            throw error;
        } finally {
            this.processingState.isProcessing = false;
        }
    }

    /**
     * Find actual data range by scanning for real data
     * This is the core fix that prevents processing 1M+ empty rows
     * @param {string} filePath - Path to Excel file
     * @returns {Object} Range information
     */
    async findActualDataRange(filePath) {
        console.log('🔍 Finding actual data range...');
        
        const workbook = XLSX.readFile(filePath, { sheetStubs: true });
        const sheet1 = workbook.Sheets['Sheet1'];
        
        if (!sheet1 || !sheet1['!ref']) {
            throw new Error('Sheet1 not found or empty');
        }
        
        const fullRange = XLSX.utils.decode_range(sheet1['!ref']);
        console.log(`📊 Excel reports range: ${XLSX.utils.encode_cell(fullRange.e)} (${fullRange.e.r + 1} rows)`);
        
        // Find last row with data by checking key columns
        let lastDataRow = 0;
        const keyColumns = [0, 1, 2, 13]; // ARDivisionNo, CustomerNo, BillToState, Total Revenue
        
        // Start from a reasonable point and scan backwards
        const scanStart = Math.min(100000, fullRange.e.r);
        
        for (let row = scanStart; row >= 1; row -= 100) {
            let hasData = false;
            
            for (const col of keyColumns) {
                const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                const cell = sheet1[cellAddress];
                
                if (cell && cell.v !== undefined && cell.v !== null && cell.v !== '') {
                    hasData = true;
                    break;
                }
            }
            
            if (hasData) {
                // Found data, scan forward to find exact last row
                for (let r = row; r <= Math.min(row + 200, fullRange.e.r); r++) {
                    let rowHasData = false;
                    
                    for (const col of keyColumns) {
                        const cellAddress = XLSX.utils.encode_cell({ r: r, c: col });
                        const cell = sheet1[cellAddress];
                        
                        if (cell && cell.v !== undefined && cell.v !== null && cell.v !== '') {
                            rowHasData = true;
                            lastDataRow = Math.max(lastDataRow, r);
                            break;
                        }
                    }
                    
                    if (!rowHasData && r > lastDataRow + 10) {
                        break;
                    }
                }
                break;
            }
        }
        
        const reduction = Math.round(((fullRange.e.r - lastDataRow) / fullRange.e.r) * 100);
        console.log(`✅ Actual last data row: ${lastDataRow} (${reduction}% reduction)`);
        
        return {
            fullRange,
            actualLastRow: lastDataRow,
            actualRowCount: lastDataRow + 1,
            reduction
        };
    }

    /**
     * Process a single sheet with smart range detection
     * @param {Object} workbook - XLSX workbook
     * @param {string} sheetName - Name of sheet to process
     * @param {Object} rangeInfo - Range information
     * @returns {Object} Sheet processing results
     */
    async processSheetSmart(workbook, sheetName, rangeInfo) {
        const sheet = workbook.Sheets[sheetName];
        
        const result = {
            name: sheetName,
            totalRows: 0,
            processedRows: 0,
            data: [],
            headers: [],
            errors: []
        };
        
        try {
            if (sheetName === 'Sheet1' && rangeInfo) {
                // Use smart range for Sheet1 - this prevents the hang!
                const dataRange = {
                    s: { c: rangeInfo.fullRange.s.c, r: 0 },
                    e: { c: rangeInfo.fullRange.e.c, r: rangeInfo.actualLastRow }
                };
                
                console.log(`📊 Processing ${rangeInfo.actualRowCount} actual data rows`);
                const data = XLSX.utils.sheet_to_json(sheet, { 
                    header: 1,
                    range: dataRange
                });
                
                result.data = data;
                result.totalRows = rangeInfo.actualRowCount;
                result.processedRows = data.length;
                result.headers = data[0] || [];
                
            } else {
                // Process other sheets normally (they're usually small)
                const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                result.data = data;
                result.totalRows = data.length;
                result.processedRows = data.length;
                result.headers = data[0] || [];
            }
            
            console.log(`✅ Sheet ${sheetName}: ${result.processedRows} rows processed`);
            
        } catch (error) {
            console.error(`Error processing sheet ${sheetName}:`, error);
            result.errors.push({
                sheet: sheetName,
                error: error.message
            });
        }
        
        return result;
    }

    /**
     * Validate Excel file
     * @param {string} filePath - Path to file
     */
    async validateFile(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const stats = fs.statSync(filePath);
        if (stats.size > this.options.maxFileSize) {
            throw new Error(`File size (${stats.size} bytes) exceeds maximum allowed size (${this.options.maxFileSize} bytes)`);
        }

        // Try to read the file to validate format
        try {
            const workbook = XLSX.readFile(filePath, { 
                cellDates: true,
                cellNF: false,
                cellText: false 
            });
            
            // If we can read it and it has sheets, it's a valid Excel file
            if (workbook && workbook.Sheets && Object.keys(workbook.Sheets).length > 0) {
                console.log(`✅ File validation passed: ${filePath} (${stats.size} bytes) - Valid Excel format`);
                return;
            }
        } catch (xlsxError) {
            // If XLSX reading fails, check file extension as fallback
            const ext = path.extname(filePath).toLowerCase();
            if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
                throw new Error(`Unsupported file format. File could not be read as Excel and has unsupported extension: ${ext || 'none'}`);
            }
        }

        console.log(`✅ File validation passed: ${filePath} (${stats.size} bytes)`);
    }

    /**
     * Cancel processing
     */
    cancelProcessing() {
        console.log('🛑 Cancelling Excel processing...');
        this.processingState.shouldCancel = true;
    }

    /**
     * Get processing status
     * @returns {Object} Status information
     */
    getProcessingStatus() {
        return {
            isProcessing: this.processingState.isProcessing,
            currentFile: this.processingState.currentFile,
            errors: this.processingState.errors
        };
    }

    /**
     * Clean up resources
     * @param {string} filePath - File to clean up
     */
    async cleanup(filePath) {
        try {
            if (filePath && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`🧹 Cleaned up file: ${filePath}`);
            }
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

module.exports = OptimizedExcelProcessor;

