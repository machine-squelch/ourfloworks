const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const PDFDocument = require('pdfkit');

const app = express();
const port = 8085;

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Ensure uploads directory exists
const fs = require('fs');
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Commission rules from PDF
const COMMISSION_RULES = {
    tier1: { min: 0, max: 9999, repeat: 0.02, newProduct: 0.03, bonus: 0 },
    tier2: { min: 10000, max: 49999, repeat: 0.01, newProduct: 0.02, bonus: 100 },
    tier3: { min: 50000, max: Infinity, repeat: 0.005, newProduct: 0.015, bonus: 300 }
};

const INCENTIVE_RATE = 0.03; // Fixed 3%+ for incentivized SKUs

// Serve static files
app.use(express.static('public'));

// Commission calculation class
class CommissionCalculator {
    constructor() {
        this.rules = COMMISSION_RULES;
    }

    // Determine tier based on state's monthly sales
    getStateTier(stateSales) {
        if (stateSales <= this.rules.tier1.max) return 'tier1';
        if (stateSales <= this.rules.tier2.max) return 'tier2';
        return 'tier3';
    }

    // Process Excel file and analyze commission structure
    processExcelFile(filePath) {
        console.log(`\n=== PROCESSING: ${path.basename(filePath)} ===`);

        const workbook = xlsx.readFile(filePath);
        const sheetNames = workbook.SheetNames;

        console.log('Available sheets:', sheetNames);

        // Try to identify Summary and Details sheets
        const summarySheet = this.findSummarySheet(workbook, sheetNames);
        const detailsSheet = this.findDetailsSheet(workbook, sheetNames);

        if (!summarySheet || !detailsSheet) {
            console.log('Could not identify Summary and/or Details sheets');
            return null;
        }

        console.log(`Using Summary: "${summarySheet}", Details: "${detailsSheet}"`);

        // Process both sheets
        const summaryData = this.processSummarySheet(workbook.Sheets[summarySheet]);
        const detailsData = this.processDetailsSheet(workbook.Sheets[detailsSheet]);

        // Calculate what should have been paid
        const calculatedCommission = this.calculateCorrectCommission(detailsData);

        // Compare with what was actually paid
        const comparison = {
            file: path.basename(filePath),
            dlPaid: summaryData.totalPaid,
            shouldPay: calculatedCommission.total,
            difference: calculatedCommission.total - summaryData.totalPaid,
            breakdown: calculatedCommission.breakdown,
            stateAnalysis: calculatedCommission.stateAnalysis
        };

        console.log('\n--- RESULTS ---');
        console.log(`DL Paid You: $${summaryData.totalPaid.toFixed(2)}`);
        console.log(`Should Pay You: $${calculatedCommission.total.toFixed(2)}`);
        console.log(`They Owe You: $${comparison.difference.toFixed(2)}`);

        return comparison;
    }

    // Find the summary sheet (various possible names)
    findSummarySheet(workbook, sheetNames) {
        const possibleNames = ['SUMMARY', 'Summary', 'Sheet1', 'summary'];
        return sheetNames.find(name => possibleNames.includes(name)) || sheetNames[0];
    }

    // Find the details sheet (various possible names)
    findDetailsSheet(workbook, sheetNames) {
        const possibleNames = ['DETAIL', 'DETAILS', 'Details', 'Sheet2', 'detail', 'details'];
        return sheetNames.find(name => possibleNames.includes(name)) || sheetNames[1];
    }

    // Process summary sheet to find what DL paid
    processSummarySheet(worksheet) {
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

        console.log('\n--- ANALYZING SUMMARY SHEET ---');
        console.log(`Summary sheet has ${data.length} rows`);

        let totalPaid = 0;

        // Look for commission-related values (this will need refinement based on actual data)
        for (let i = 0; i < data.length; i++) {
            for (let j = 0; j < (data[i] || []).length; j++) {
                const cell = data[i][j];
                if (typeof cell === 'number' && cell > 100 && cell < 10000) {
                    // Potential commission value - this logic needs refinement
                    console.log(`Potential commission value: $${cell} at row ${i+1}, col ${j+1}`);
                    if (cell > totalPaid) {
                        totalPaid = cell; // Take the largest reasonable value for now
                    }
                }
            }
        }

        console.log(`Detected DL paid amount: $${totalPaid}`);
        return { totalPaid };
    }

    // Process details sheet to get transaction data
    processDetailsSheet(worksheet) {
        const jsonData = xlsx.utils.sheet_to_json(worksheet);

        console.log('\n--- ANALYZING DETAILS SHEET ---');
        console.log(`Details sheet has ${jsonData.length} rows`);

        if (jsonData.length === 0) {
            console.log('No data in details sheet');
            return { transactions: [] };
        }

        console.log('Column headers:', Object.keys(jsonData[0]));

        // Process each transaction
        const transactions = jsonData.map(row => {
            return this.parseTransactionRow(row);
        }).filter(t => t !== null);

        console.log(`Processed ${transactions.length} valid transactions`);
        return { transactions };
    }

    // Parse individual transaction row
    parseTransactionRow(row) {
        // This will need to be flexible for different column names
        // Common variations: State, BillToState, ShipToState, etc.

        const state = row.State || row.BillToState || row.ShipToState || row['Ship To State'];
        const revenue = row.Revenue || row['Total Revenue'] || row['Total Discounted Revenue'];

        // Determine transaction type (repeat, new, incentive)
        const isRepeat = row['Repeat Commission'] || row['Repeat Product Commission'];
        const isNew = row['New Commission'] || row['New Product Commission'];
        const isIncentive = row['Incentive Commission'] || row['Incentivized'];

        if (!state || !revenue) {
            return null; // Skip invalid rows
        }

        let type = 'repeat'; // default
        if (isNew > 0) type = 'new';
        if (isIncentive > 0) type = 'incentive';

        return {
            state: state,
            revenue: parseFloat(revenue) || 0,
            type: type
        };
    }

    // Calculate correct commission based on PDF rules
    calculateCorrectCommission(detailsData) {
        const { transactions } = detailsData;

        console.log('\n--- CALCULATING CORRECT COMMISSION ---');

        // Group transactions by state
        const stateData = {};

        transactions.forEach(transaction => {
            if (!stateData[transaction.state]) {
                stateData[transaction.state] = {
                    totalRevenue: 0,
                    repeatRevenue: 0,
                    newRevenue: 0,
                    incentiveRevenue: 0
                };
            }

            stateData[transaction.state].totalRevenue += transaction.revenue;
            stateData[transaction.state][`${transaction.type}Revenue`] += transaction.revenue;
        });

        let totalCommission = 0;
        let totalBonuses = 0;
        const stateAnalysis = [];
        const breakdown = { repeat: 0, new: 0, incentive: 0, bonuses: 0 };

        // Calculate commission for each state
        Object.keys(stateData).forEach(state => {
            const data = stateData[state];
            const tier = this.getStateTier(data.totalRevenue);
            const rates = this.rules[tier];

            // Calculate commissions by type
            const repeatComm = data.repeatRevenue * rates.repeat;
            const newComm = data.newRevenue * rates.newProduct;
            const incentiveComm = data.incentiveRevenue * INCENTIVE_RATE;
            const stateBonus = rates.bonus;

            const stateTotal = repeatComm + newComm + incentiveComm + stateBonus;

            console.log(`${state}: $${data.totalRevenue.toFixed(2)} → ${tier} → $${stateTotal.toFixed(2)} (+ $${stateBonus} bonus)`);

            totalCommission += repeatComm + newComm + incentiveComm;
            totalBonuses += stateBonus;

            breakdown.repeat += repeatComm;
            breakdown.new += newComm;
            breakdown.incentive += incentiveComm;
            breakdown.bonuses += stateBonus;

            stateAnalysis.push({
                state,
                revenue: data.totalRevenue,
                tier,
                commission: stateTotal,
                bonus: stateBonus
            });
        });

        return {
            total: totalCommission + totalBonuses,
            breakdown,
            stateAnalysis
        };
    }

    // Generate PDF report with dashboard-style formatting
    generatePDFReport(data, res) {
        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 40, bottom: 40, left: 40, right: 40 }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Commission_Report_${data.file}.pdf`);
        doc.pipe(res);

        // Background
        doc.fillColor('#f8f9fa')
           .rect(0, 0, 595, 842)
           .fill();

        // Header with DL logo and title
        try {
            doc.image(path.join(__dirname, 'public', 'dllogoonly.png'), 50, 50, { width: 60, height: 60 });
        } catch (e) {
            // Fallback if logo not found
            this.drawSimpleLogo(doc, 50, 50);
        }

        doc.fontSize(26)
           .fillColor('#2d3748')
           .font('Helvetica-Bold')
           .text('Commission Analysis', 130, 55);

        doc.fontSize(14)
           .fillColor('#4a5568')
           .font('Helvetica')
           .text(`File: ${data.file}`, 130, 85)
           .text(`Generated: ${new Date().toLocaleDateString()}`, 130, 100);

        let yPos = 140;

        // Top metric cards row
        const cardWidth = 120;
        const cardHeight = 80;
        const cardSpacing = 15;

        // Card 1: DL Paid
        this.drawDashboardCard(doc, 50, yPos, cardWidth, cardHeight, '#ffffff', '#3182ce');
        doc.fontSize(11)
           .fillColor('#4a5568')
           .text('DL Paid You', 55, yPos + 15);
        doc.fontSize(20)
           .fillColor('#3182ce')
           .font('Helvetica-Bold')
           .text(`$${data.dlPaid.toFixed(0)}`, 55, yPos + 35);

        // Card 2: Should Pay
        this.drawDashboardCard(doc, 50 + cardWidth + cardSpacing, yPos, cardWidth, cardHeight, '#ffffff', '#38a169');
        doc.fontSize(11)
           .fillColor('#4a5568')
           .font('Helvetica')
           .text('Should Pay', 55 + cardWidth + cardSpacing, yPos + 15);
        doc.fontSize(20)
           .fillColor('#38a169')
           .font('Helvetica-Bold')
           .text(`$${data.shouldPay.toFixed(0)}`, 55 + cardWidth + cardSpacing, yPos + 35);

        // Card 3: Difference
        const diffColor = data.difference > 0 ? '#38a169' : '#3182ce';
        this.drawDashboardCard(doc, 50 + 2 * (cardWidth + cardSpacing), yPos, cardWidth, cardHeight, '#ffffff', diffColor);
        doc.fontSize(11)
           .fillColor('#4a5568')
           .font('Helvetica')
           .text('They Owe', 55 + 2 * (cardWidth + cardSpacing), yPos + 15);
        doc.fontSize(20)
           .fillColor(diffColor)
           .font('Helvetica-Bold')
           .text(`$${Math.abs(data.difference).toFixed(0)}`, 55 + 2 * (cardWidth + cardSpacing), yPos + 35);

        // Card 4: States
        this.drawDashboardCard(doc, 50 + 3 * (cardWidth + cardSpacing), yPos, cardWidth, cardHeight, '#ffffff', '#3182ce');
        doc.fontSize(11)
           .fillColor('#4a5568')
           .font('Helvetica')
           .text('States', 55 + 3 * (cardWidth + cardSpacing), yPos + 15);
        doc.fontSize(20)
           .fillColor('#3182ce')
           .font('Helvetica-Bold')
           .text(`${data.stateAnalysis.length}`, 55 + 3 * (cardWidth + cardSpacing), yPos + 35);

        yPos += cardHeight + 30;

        // Commission breakdown section
        this.drawDashboardCard(doc, 50, yPos, 240, 140, '#ffffff', '#e2e8f0');
        doc.fontSize(16)
           .fillColor('#2d3748')
           .font('Helvetica-Bold')
           .text('Commission Breakdown', 60, yPos + 15);

        const breakdownItems = [
            { label: 'Repeat Sales', value: data.breakdown.repeat, color: '#38a169' },
            { label: 'New Product', value: data.breakdown.new, color: '#3182ce' },
            { label: 'Incentives', value: data.breakdown.incentive, color: '#38a169' },
            { label: 'State Bonuses', value: data.breakdown.bonuses, color: '#3182ce' }
        ];

        breakdownItems.forEach((item, index) => {
            const itemY = yPos + 40 + (index * 22);

            // Color bar
            doc.fillColor(item.color)
               .rect(60, itemY + 2, 15, 12)
               .fill();

            doc.fontSize(11)
               .fillColor('#4a5568')
               .font('Helvetica')
               .text(item.label, 85, itemY + 4);

            doc.fontSize(12)
               .fillColor('#2d3748')
               .font('Helvetica-Bold')
               .text(`$${item.value.toFixed(0)}`, 200, itemY + 4);
        });

        // State analysis chart
        this.drawDashboardCard(doc, 310, yPos, 245, 140, '#ffffff', '#e2e8f0');
        doc.fontSize(16)
           .fillColor('#2d3748')
           .font('Helvetica-Bold')
           .text('State Performance', 320, yPos + 15);

        yPos += 180;

        // State details table
        this.drawDashboardCard(doc, 50, yPos, 505, 25 + (data.stateAnalysis.length * 20), '#ffffff', '#e2e8f0');

        // Table header
        doc.fillColor('#f7fafc')
           .rect(60, yPos + 10, 485, 25)
           .fill();

        doc.fontSize(11)
           .fillColor('#4a5568')
           .font('Helvetica-Bold')
           .text('STATE', 70, yPos + 20)
           .text('REVENUE', 140, yPos + 20)
           .text('TIER', 220, yPos + 20)
           .text('COMMISSION', 280, yPos + 20)
           .text('BONUS', 370, yPos + 20)
           .text('TOTAL', 430, yPos + 20);

        // Table rows
        data.stateAnalysis.forEach((state, index) => {
            const rowY = yPos + 35 + (index * 20);
            const rowColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa';

            doc.fillColor(rowColor)
               .rect(60, rowY, 485, 20)
               .fill();

            const tierColor = state.tier === 'tier1' ? '#3182ce' : state.tier === 'tier2' ? '#38a169' : '#38a169';

            doc.fontSize(10)
               .fillColor('#2d3748')
               .font('Helvetica')
               .text(state.state, 70, rowY + 6)
               .text(`$${state.revenue.toFixed(0)}`, 140, rowY + 6)
               .fillColor(tierColor)
               .text(state.tier.toUpperCase(), 220, rowY + 6)
               .fillColor('#2d3748')
               .text(`$${(state.commission - state.bonus).toFixed(0)}`, 280, rowY + 6)
               .text(`$${state.bonus}`, 370, rowY + 6)
               .fillColor('#38a169')
               .font('Helvetica-Bold')
               .text(`$${state.commission.toFixed(0)}`, 430, rowY + 6);
        });

        // Footer
        doc.fontSize(9)
           .fillColor('#a0aec0')
           .font('Helvetica')
           .text('Generated by Commission Analysis Engine • Based on DL Wholesale Agreement', 50, 800, { align: 'center', width: 505 });

        doc.end();
    }

    // Draw simple logo fallback (if DL logo not found)
    drawSimpleLogo(doc, x, y) {
        const size = 60;

        // Main circle background (blue)
        doc.fillColor('#3182ce')
           .circle(x + size/2, y + size/2, size/2)
           .fill();

        // Inner circle (white)
        doc.fillColor('#ffffff')
           .circle(x + size/2, y + size/2, size/2 - 8)
           .fill();

        // DL text
        doc.fillColor('#3182ce')
           .fontSize(20)
           .font('Helvetica-Bold')
           .text('DL', x + size/2 - 12, y + size/2 - 8);
    }

    // Draw dashboard-style card with shadow
    drawDashboardCard(doc, x, y, width, height, fillColor, accentColor) {
        // Shadow
        doc.fillColor('#e2e8f0')
           .roundedRect(x + 2, y + 2, width, height, 8)
           .fill();

        // Main card
        doc.fillColor(fillColor)
           .roundedRect(x, y, width, height, 8)
           .fill();

        // Accent line at top
        doc.fillColor(accentColor)
           .roundedRect(x, y, width, 4, 8)
           .fill();

        // Subtle border
        doc.strokeColor('#e2e8f0')
           .lineWidth(1)
           .roundedRect(x, y, width, height, 8)
           .stroke();
    }
}

// API endpoint to process a single Excel file
app.post('/analyze', upload.single('excelFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const calculator = new CommissionCalculator();
        const result = calculator.processExcelFile(req.file.path);

        if (!result) {
            return res.status(400).json({ error: 'Could not process Excel file' });
        }

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        res.json(result);
    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Generate PDF report for a specific file
app.get('/pdf-report/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'xlsx files', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        const calculator = new CommissionCalculator();
        const result = calculator.processExcelFile(filePath);

        if (!result) {
            return res.status(400).json({ error: 'Could not process Excel file' });
        }

        calculator.generatePDFReport(result, res);
    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Analyze a specific file from the xlsx files directory
app.get('/analyze-file/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'xlsx files', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        const calculator = new CommissionCalculator();
        const result = calculator.processExcelFile(filePath);

        if (!result) {
            return res.status(400).json({ error: 'Could not process Excel file' });
        }

        res.json(result);
    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// List available files
app.get('/files', (req, res) => {
    try {
        const xlsxDir = path.join(__dirname, 'xlsx files');
        const files = fs.readdirSync(xlsxDir)
            .filter(file => file.endsWith('.xlsx') && !file.includes('Zone.Identifier'))
            .sort();
        res.json(files);
    } catch (error) {
        res.status(500).json({ error: 'Could not read files directory' });
    }
});

app.listen(port, () => {
    console.log(`Commission Analysis Server running on port ${port}`);
    console.log(`Access the application at: http://localhost:${port}`);
});