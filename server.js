const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Parser } = require('json2csv');
const crypto = require('crypto');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const REPORT_TTL = 10 * 60 * 1000; // 10 minutes
const DISCREPANCY_TOLERANCE = 0.5;

const COMMISSION_STRUCTURE = [
    {
        id: 'tier1',
        label: 'Tier 1',
        min: 0,
        max: 9999.99,
        rates: { repeat: 0.02, new: 0.03, incentive: 0.03 },
        bonus: 0
    },
    {
        id: 'tier2',
        label: 'Tier 2',
        min: 10000,
        max: 49999.99,
        rates: { repeat: 0.01, new: 0.02, incentive: 0.03 },
        bonus: 100
    },
    {
        id: 'tier3',
        label: 'Tier 3',
        min: 50000,
        max: Number.POSITIVE_INFINITY,
        rates: { repeat: 0.005, new: 0.015, incentive: 0.03 },
        bonus: 300
    }
];

const HEADER_ALIASES = {
    state: ['billtostate', 'state', 'state/province', 'shiptostate', 'region'],
    sales: [
        'total discounted revenue',
        'total revenue',
        'revenue',
        'amount',
        'net sales',
        'invoice total',
        'sales'
    ],
    repeat: ['repeat product commission', 'repeat commission', 'repeat'],
    new: ['new product commission', 'new product commission', 'new commission', 'new product commission  '],
    incentive: ['incentive product commission', 'incentive commission', 'incentive'],
    invoice: ['invoiceno', 'invoice', 'invoice number', 'invoice#', 'invoice #'],
    customer: ['customerno', 'customer', 'customer number', 'customer name', 'customername'],
    description: ['item description', 'description', 'product', 'product description'],
    saleType: ['sale type', 'type', 'product type', 'commission type']
};

const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.xls']);
const EXCEL_MIME_TYPES = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
]);

const reportCache = new Map();
const fsPromises = fs.promises;

const uploadsDir = path.join(os.tmpdir(), 'thinkazoo-uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const safeName = file.originalname.replace(/[^a-z0-9.]+/gi, '-');
        cb(null, `${timestamp}-${safeName}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();

        if (!ALLOWED_EXTENSIONS.has(extension)) {
            cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
            return;
        }

        if (file.mimetype &&
            file.mimetype !== 'application/octet-stream' &&
            !EXCEL_MIME_TYPES.has(file.mimetype)) {
            cb(new Error('Invalid file type supplied.')); 
            return;
        }

        cb(null, true);
    }
});

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'", 'https://cdnjs.cloudflare.com'],
            "style-src": ["'self'", 'https://fonts.googleapis.com'],
            "font-src": ["'self'", 'https://fonts.gstatic.com'],
            "img-src": ["'self'", 'data:', 'blob:'],
            "connect-src": ["'self'"],
            "object-src": ["'none'"],
            "frame-ancestors": ["'none'"],
            "base-uri": ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many requests. Please try again later.'
});

app.use(limiter);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error('Origin not allowed'));
    },
    methods: ['GET', 'POST'],
    optionsSuccessStatus: 204
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

const staticDir = path.join(__dirname, 'public');
app.use(express.static(staticDir, {
    setHeaders: (res, servedPath) => {
        if (servedPath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=604800');
        }
    }
}));

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/verify-commission', upload.single('commissionFile'), async (req, res, next) => {
    if (!req.file) {
        res.status(400).json({ error: 'No file uploaded. Please provide an .xlsx or .xls workbook.' });
        return;
    }

    try {
        const workbook = XLSX.readFile(req.file.path, { cellDates: false });
        const sheetName = workbook.SheetNames[0];

        if (!sheetName) {
            res.status(400).json({ error: 'No worksheets were found in the uploaded workbook.' });
            return;
        }

        const sheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
        const analysis = analyzeRows(rawRows);

        const reportId = crypto.randomUUID();
        const cachedReport = {
            ...analysis,
            fileName: req.file.originalname,
            sheetName
        };

        reportCache.set(reportId, cachedReport);
        const cleanupTimer = setTimeout(() => {
            reportCache.delete(reportId);
        }, REPORT_TTL);
        if (typeof cleanupTimer.unref === 'function') {
            cleanupTimer.unref();
        }

        res.json({
            reportId,
            fileName: req.file.originalname,
            sheetName,
            generatedAt: analysis.generatedAt,
            summary: analysis.summary,
            stateBreakdown: analysis.stateBreakdown,
            rows: analysis.rows,
            discrepancies: analysis.discrepancies
        });
    } catch (error) {
        next(error);
    } finally {
        fsPromises.unlink(req.file.path).catch(() => {});
    }
});

app.post('/download-report', async (req, res, next) => {
    try {
        const reportId = typeof req.body?.reportId === 'string' ? req.body.reportId : '';

        if (!reportId) {
            res.status(400).json({ error: 'Missing reportId. Please verify your data before downloading a report.' });
            return;
        }

        const report = reportCache.get(reportId);

        if (!report) {
            res.status(404).json({ error: 'Report not found or has expired. Please run the verification again.' });
            return;
        }

        const csv = buildCsvReport(report);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="commission-verification-${Date.now()}.csv"`);
        res.send(csv);
    } catch (error) {
        next(error);
    }
});

app.use((err, req, res, next) => {
    if (err.message === 'Origin not allowed') {
        res.status(403).json({ error: 'The requesting origin is not permitted to access this resource.' });
        return;
    }

    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({ error: 'File too large. The maximum supported size is 50 MB.' });
            return;
        }
        res.status(400).json({ error: err.message });
        return;
    }

    if (err.message && err.message.includes('Excel')) {
        res.status(400).json({ error: err.message });
        return;
    }

    // eslint-disable-next-line no-console
    console.error('Unhandled error during request processing:', err);
    res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
});

app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Thinkazoo commission verifier listening on port ${PORT}`);
});

function analyzeRows(rawRows) {
    const processedRows = [];
    const discrepancies = [];
    const stateTotals = new Map();

    let totalSales = 0;
    let processedRecords = 0;
    let totalVarianceMagnitude = 0;
    let maxVarianceMagnitude = 0;

    const totalsExpected = { repeat: 0, new: 0, incentive: 0 };
    const totalsReported = { repeat: 0, new: 0, incentive: 0 };

    rawRows.forEach((row, index) => {
        const normalized = normalizeRow(row, index);
        if (!normalized) {
            return;
        }

        const tierInfo = determineTier(normalized.sales);
        const expected = {
            repeat: roundCurrency(normalized.sales * tierInfo.rates.repeat),
            new: roundCurrency(normalized.sales * tierInfo.rates.new),
            incentive: normalized.reported.incentive > 0
                ? roundCurrency(normalized.sales * tierInfo.rates.incentive)
                : 0
        };

        const variance = {
            repeat: roundCurrency(expected.repeat - normalized.reported.repeat),
            new: roundCurrency(expected.new - normalized.reported.new),
            incentive: roundCurrency(expected.incentive - normalized.reported.incentive)
        };

        const rowHasDiscrepancy = ['repeat', 'new', 'incentive'].some(type =>
            Math.abs(variance[type]) > DISCREPANCY_TOLERANCE &&
            (expected[type] !== 0 || normalized.reported[type] !== 0)
        );

        const rowRecord = {
            rowNumber: normalized.rowNumber,
            invoice: normalized.invoice,
            customer: normalized.customer,
            state: normalized.state,
            tier: tierInfo.label,
            sales: roundCurrency(normalized.sales),
            description: normalized.description,
            expected,
            reported: normalized.reported,
            variance,
            notes: rowHasDiscrepancy ? 'Variance exceeds tolerance' : ''
        };

        processedRows.push(rowRecord);
        processedRecords += 1;
        totalSales += normalized.sales;

        totalsExpected.repeat += expected.repeat;
        totalsExpected.new += expected.new;
        totalsExpected.incentive += expected.incentive;

        totalsReported.repeat += normalized.reported.repeat;
        totalsReported.new += normalized.reported.new;
        totalsReported.incentive += normalized.reported.incentive;

        totalVarianceMagnitude += Math.abs(variance.repeat) + Math.abs(variance.new) + Math.abs(variance.incentive);
        maxVarianceMagnitude = Math.max(
            maxVarianceMagnitude,
            Math.abs(variance.repeat),
            Math.abs(variance.new),
            Math.abs(variance.incentive)
        );

        if (!stateTotals.has(normalized.state)) {
            stateTotals.set(normalized.state, {
                sales: 0,
                expected: { repeat: 0, new: 0, incentive: 0 },
                reported: { repeat: 0, new: 0, incentive: 0 }
            });
        }

        const stateData = stateTotals.get(normalized.state);
        stateData.sales += normalized.sales;
        stateData.expected.repeat += expected.repeat;
        stateData.expected.new += expected.new;
        stateData.expected.incentive += expected.incentive;
        stateData.reported.repeat += normalized.reported.repeat;
        stateData.reported.new += normalized.reported.new;
        stateData.reported.incentive += normalized.reported.incentive;

        if (rowHasDiscrepancy) {
            ['repeat', 'new', 'incentive'].forEach(type => {
                if (Math.abs(variance[type]) > DISCREPANCY_TOLERANCE &&
                    (expected[type] !== 0 || normalized.reported[type] !== 0)) {
                    discrepancies.push({
                        rowNumber: rowRecord.rowNumber,
                        invoice: rowRecord.invoice,
                        customer: rowRecord.customer,
                        state: rowRecord.state,
                        type,
                        expected: expected[type],
                        reported: normalized.reported[type],
                        variance: variance[type]
                    });
                }
            });
        }
    });

    const stateBreakdown = [];
    let totalBonus = 0;

    stateTotals.forEach((data, state) => {
        const tierInfo = determineTier(data.sales);
        const variance = {
            repeat: roundCurrency(data.expected.repeat - data.reported.repeat),
            new: roundCurrency(data.expected.new - data.reported.new),
            incentive: roundCurrency(data.expected.incentive - data.reported.incentive)
        };

        totalBonus += tierInfo.bonus;

        stateBreakdown.push({
            state,
            tier: tierInfo.label,
            totalSales: roundCurrency(data.sales),
            expected: {
                repeat: roundCurrency(data.expected.repeat),
                new: roundCurrency(data.expected.new),
                incentive: roundCurrency(data.expected.incentive)
            },
            reported: {
                repeat: roundCurrency(data.reported.repeat),
                new: roundCurrency(data.reported.new),
                incentive: roundCurrency(data.reported.incentive)
            },
            variance,
            bonus: tierInfo.bonus
        });
    });

    stateBreakdown.sort((a, b) => b.totalSales - a.totalSales);

    const summary = {
        totalRows: rawRows.length,
        processedRows,
        totalSales: roundCurrency(totalSales),
        totals: {
            expected: {
                repeat: roundCurrency(totalsExpected.repeat),
                new: roundCurrency(totalsExpected.new),
                incentive: roundCurrency(totalsExpected.incentive)
            },
            reported: {
                repeat: roundCurrency(totalsReported.repeat),
                new: roundCurrency(totalsReported.new),
                incentive: roundCurrency(totalsReported.incentive)
            }
        },
        variance: {
            repeat: roundCurrency(totalsExpected.repeat - totalsReported.repeat),
            new: roundCurrency(totalsExpected.new - totalsReported.new),
            incentive: roundCurrency(totalsExpected.incentive - totalsReported.incentive)
        },
        totalBonus: roundCurrency(totalBonus),
        discrepancyCount: discrepancies.length,
        averageVariance: processedRecords > 0
            ? roundCurrency(totalVarianceMagnitude / (processedRecords * 3))
            : 0,
        maxVariance: roundCurrency(maxVarianceMagnitude),
        notice: processedRecords === 0
            ? 'No rows with sales data were detected in the uploaded workbook.'
            : ''
    };

    const generatedAt = new Date().toISOString();

    discrepancies.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

    return {
        generatedAt,
        summary,
        stateBreakdown,
        rows: processedRows,
        discrepancies
    };
}

function normalizeRow(row, index) {
    const sanitizedEntries = Object.entries(row)
        .filter(([, value]) => value !== null && value !== undefined && value !== '')
        .map(([key, value]) => [key.trim(), typeof value === 'string' ? value.trim() : value]);

    if (sanitizedEntries.length === 0) {
        return null;
    }

    const normalizedMap = new Map();
    sanitizedEntries.forEach(([key, value]) => {
        const normalizedKey = normalizeHeaderName(key);
        if (!normalizedKey) {
            return;
        }
        normalizedMap.set(normalizedKey, value);
    });

    const salesValue = getValue(normalizedMap, 'sales');
    const sales = parseNumber(salesValue);

    if (!Number.isFinite(sales) || sales === 0) {
        return null;
    }

    const reportedRepeat = roundCurrency(parseNumber(getValue(normalizedMap, 'repeat')));
    const reportedNew = roundCurrency(parseNumber(getValue(normalizedMap, 'new')));
    const reportedIncentive = roundCurrency(parseNumber(getValue(normalizedMap, 'incentive')));

    return {
        rowNumber: index + 2,
        invoice: toText(getValue(normalizedMap, 'invoice')) || `Row ${index + 2}`,
        customer: toText(getValue(normalizedMap, 'customer')) || 'Unspecified Customer',
        state: toText(getValue(normalizedMap, 'state')) || 'Unassigned',
        description: toText(getValue(normalizedMap, 'description')),
        sales,
        reported: {
            repeat: reportedRepeat,
            new: reportedNew,
            incentive: reportedIncentive
        }
    };
}

function getValue(map, aliasKey) {
    const aliases = HEADER_ALIASES[aliasKey];
    if (!aliases) {
        return undefined;
    }

    for (const alias of aliases) {
        const normalizedAlias = normalizeHeaderName(alias);
        if (map.has(normalizedAlias)) {
            return map.get(normalizedAlias);
        }
    }

    return undefined;
}

function normalizeHeaderName(header) {
    return header
        .toLowerCase()
        .replace(/[^a-z0-9#&/()\s.-]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function determineTier(totalSales) {
    return COMMISSION_STRUCTURE.find(tier => totalSales >= tier.min && totalSales <= tier.max) || COMMISSION_STRUCTURE[COMMISSION_STRUCTURE.length - 1];
}

function roundCurrency(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseNumber(value) {
    if (value === null || value === undefined) {
        return 0;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }

    if (typeof value !== 'string') {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : 0;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return 0;
    }

    const isNegative = trimmed.includes('(') && trimmed.includes(')');
    const normalized = trimmed.replace(/[^0-9.-]+/g, '');

    if (!normalized || normalized === '-' || normalized === '.') {
        return 0;
    }

    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed)) {
        return 0;
    }

    return isNegative ? -parsed : parsed;
}

function toText(value) {
    if (value === null || value === undefined) {
        return '';
    }

    if (typeof value === 'string') {
        return value.trim();
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value.toString() : '';
    }

    return String(value).trim();
}

function buildCsvReport(report) {
    const detailFields = [
        'Row',
        'Invoice',
        'Customer',
        'State',
        'Tier',
        'Sales',
        'Expected Repeat',
        'Reported Repeat',
        'Variance Repeat',
        'Expected New',
        'Reported New',
        'Variance New',
        'Expected Incentive',
        'Reported Incentive',
        'Variance Incentive'
    ];

    const detailRows = report.rows.map(row => ({
        'Row': row.rowNumber,
        'Invoice': row.invoice,
        'Customer': row.customer,
        'State': row.state,
        'Tier': row.tier,
        'Sales': toCsvNumber(row.sales),
        'Expected Repeat': toCsvNumber(row.expected.repeat),
        'Reported Repeat': toCsvNumber(row.reported.repeat),
        'Variance Repeat': toCsvNumber(row.variance.repeat),
        'Expected New': toCsvNumber(row.expected.new),
        'Reported New': toCsvNumber(row.reported.new),
        'Variance New': toCsvNumber(row.variance.new),
        'Expected Incentive': toCsvNumber(row.expected.incentive),
        'Reported Incentive': toCsvNumber(row.reported.incentive),
        'Variance Incentive': toCsvNumber(row.variance.incentive)
    }));

    const stateFields = [
        'State',
        'Tier',
        'Total Sales',
        'Expected Repeat',
        'Reported Repeat',
        'Variance Repeat',
        'Expected New',
        'Reported New',
        'Variance New',
        'Expected Incentive',
        'Reported Incentive',
        'Variance Incentive',
        'Bonus'
    ];

    const stateRows = report.stateBreakdown.map(state => ({
        'State': state.state,
        'Tier': state.tier,
        'Total Sales': toCsvNumber(state.totalSales),
        'Expected Repeat': toCsvNumber(state.expected.repeat),
        'Reported Repeat': toCsvNumber(state.reported.repeat),
        'Variance Repeat': toCsvNumber(state.variance.repeat),
        'Expected New': toCsvNumber(state.expected.new),
        'Reported New': toCsvNumber(state.reported.new),
        'Variance New': toCsvNumber(state.variance.new),
        'Expected Incentive': toCsvNumber(state.expected.incentive),
        'Reported Incentive': toCsvNumber(state.reported.incentive),
        'Variance Incentive': toCsvNumber(state.variance.incentive),
        'Bonus': toCsvNumber(state.bonus)
    }));

    const detailParser = new Parser({ fields: detailFields });
    const stateParser = new Parser({ fields: stateFields });

    const detailCsv = detailRows.length > 0
        ? detailParser.parse(detailRows)
        : `${detailFields.join(',')}`;
    const stateCsv = stateRows.length > 0
        ? stateParser.parse(stateRows)
        : `${stateFields.join(',')}`;

    const summaryLines = [
        'Metric,Value',
        `Total Rows,${report.summary.totalRows}`,
        `Processed Rows,${report.summary.processedRows}`,
        `Total Sales,${toCsvNumber(report.summary.totalSales)}`,
        `Expected Repeat,${toCsvNumber(report.summary.totals.expected.repeat)}`,
        `Reported Repeat,${toCsvNumber(report.summary.totals.reported.repeat)}`,
        `Variance Repeat,${toCsvNumber(report.summary.variance.repeat)}`,
        `Expected New,${toCsvNumber(report.summary.totals.expected.new)}`,
        `Reported New,${toCsvNumber(report.summary.totals.reported.new)}`,
        `Variance New,${toCsvNumber(report.summary.variance.new)}`,
        `Expected Incentive,${toCsvNumber(report.summary.totals.expected.incentive)}`,
        `Reported Incentive,${toCsvNumber(report.summary.totals.reported.incentive)}`,
        `Variance Incentive,${toCsvNumber(report.summary.variance.incentive)}`,
        `Total Bonus,${toCsvNumber(report.summary.totalBonus)}`,
        `Discrepancy Count,${report.summary.discrepancyCount}`,
        `Average Variance,${toCsvNumber(report.summary.averageVariance)}`
    ];

    return [
        'Commission Detail',
        detailCsv,
        '',
        'State Breakdown',
        stateCsv,
        '',
        'Summary',
        summaryLines.join('\n')
    ].join('\n');
}

function toCsvNumber(value) {
    return roundCurrency(value).toFixed(2);
}
