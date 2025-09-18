const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const ExcelJS = require('exceljs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const ROOT = process.cwd();
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const REPORT_DIR = path.join(ROOT, 'reports');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(REPORT_DIR, { recursive: true });

const upload = multer({ dest: UPLOAD_DIR });

const BASE_RATES = [
  { min: 0, max: 9999, repeat: 0.02, new: 0.03 },
  { min: 10000, max: 49999, repeat: 0.01, new: 0.02 },
  { min: 50000, max: Infinity, repeat: 0.005, new: 0.015 }
];

const BONUS = [
  { min: 10000, max: 49999, bonus: 100 },
  { min: 50000, max: Infinity, bonus: 300 }
];

const DEFAULT_INCENTIVE = 0.03;

function pickTier(total) {
  return BASE_RATES.find(tier => total >= tier.min && total <= tier.max);
}

function pickBonus(total) {
  const tierBonus = BONUS.find(item => total >= item.min && total <= item.max);
  return tierBonus ? tierBonus.bonus : 0;
}

function normalizeHeader(header) {
  return String(header || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function mapRow(row) {
  const normalized = {};
  Object.entries(row).forEach(([key, value]) => {
    normalized[normalizeHeader(key)] = value;
  });

  const state =
    normalized.state ||
    normalized.billingstate ||
    normalized.shipstate ||
    normalized.st ||
    normalized.region;

  const subtotalRaw =
    normalized.linesubtotal ||
    normalized.subtotal ||
    normalized.amount ||
    normalized.extendedprice ||
    normalized.total;

  const typeRaw = normalized.purchasetype || normalized.type || normalized.newrepeat || normalized.isnew;

  const incentiveFlag =
    normalized.isincentivized ||
    normalized.incentivized ||
    normalized.incentive ||
    normalized.onincentivelist;

  const incentiveRate =
    normalized.incentiverateoverride ||
    normalized.incentrate ||
    normalized.incentiverate;

  const lineSubtotal = Number(subtotalRaw) || 0;
  let purchaseType = String(typeRaw ?? '').toLowerCase();
  if (purchaseType === 'true' || purchaseType === 'yes' || purchaseType === '1') purchaseType = 'new';
  if (purchaseType === 'false' || purchaseType === 'no' || purchaseType === '0') purchaseType = 'repeat';
  if (!['new', 'repeat'].includes(purchaseType)) {
    const isNew = String(typeRaw ?? '').toLowerCase() === 'new' || Boolean(normalized.isnew);
    purchaseType = isNew ? 'new' : 'repeat';
  }

  const isIncentivized = String(incentiveFlag ?? '').toLowerCase() === 'true' || Boolean(incentiveFlag);
  const incentiveRateOverride = incentiveRate != null && incentiveRate !== '' ? Number(incentiveRate) : null;

  return {
    state: String(state || '').trim(),
    lineSubtotal,
    purchaseType,
    isIncentivized,
    incentiveRateOverride
  };
}

function readWorkbook(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheetNames = workbook.SheetNames.map(name => ({ raw: name, norm: name.toLowerCase() }));
  const detailsName = sheetNames.find(sheet => sheet.norm.includes('detail'))?.raw || sheetNames[0]?.raw;
  const summaryName = sheetNames.find(sheet => sheet.norm.includes('summary'))?.raw;

  const detailsRows = detailsName ? xlsx.utils.sheet_to_json(workbook.Sheets[detailsName]) : [];
  const summaryRows = summaryName ? xlsx.utils.sheet_to_json(workbook.Sheets[summaryName]) : [];

  return { detailsRows, summaryRows };
}

function computeFromDetails(detailsRows) {
  const mapped = detailsRows.map(mapRow).filter(row => row.state && row.lineSubtotal > 0);
  const byState = new Map();

  mapped.forEach(row => {
    if (!byState.has(row.state)) {
      byState.set(row.state, { lines: [], totalSales: 0 });
    }
    const entry = byState.get(row.state);
    entry.lines.push(row);
    entry.totalSales += row.lineSubtotal;
  });

  const stateResults = [];

  byState.forEach((data, state) => {
    const tier = pickTier(data.totalSales);
    const bonus = pickBonus(data.totalSales);
    let stateCommission = 0;

    const lines = data.lines.map(line => {
      let rate = 0;
      if (line.isIncentivized) {
        rate = line.incentiveRateOverride ?? DEFAULT_INCENTIVE;
      } else {
        rate = tier[line.purchaseType];
      }
      const commission = line.lineSubtotal * rate;
      stateCommission += commission;
      return {
        state,
        lineSubtotal: line.lineSubtotal,
        purchaseType: line.purchaseType,
        isIncentivized: line.isIncentivized,
        appliedRate: rate,
        commission
      };
    });

    stateResults.push({
      state,
      totalSales: data.totalSales,
      commission: stateCommission,
      stateBonus: bonus,
      totalWithBonus: stateCommission + bonus,
      lines
    });
  });

  const grandTotals = stateResults.reduce(
    (totals, state) => {
      totals.totalSales += state.totalSales;
      totals.commission += state.commission;
      totals.stateBonus += state.stateBonus;
      totals.totalWithBonus += state.totalWithBonus;
      return totals;
    },
    { totalSales: 0, commission: 0, stateBonus: 0, totalWithBonus: 0 }
  );

  return { states: stateResults, grand: grandTotals };
}

function compareAgainstSummary(summaryRows, recomputedStates) {
  if (!summaryRows || summaryRows.length === 0) {
    return [];
  }

  const normalizedRows = summaryRows.map(row => {
    const normalized = {};
    Object.entries(row).forEach(([key, value]) => {
      normalized[normalizeHeader(key)] = value;
    });
    return normalized;
  });

  return recomputedStates.map(state => {
    const summaryRow = normalizedRows.find(
      entry => String(entry.state || entry.region || entry.st).trim() === state.state
    );

    if (!summaryRow) {
      return {
        state: state.state,
        summaryFound: false,
        ourTotalWithBonus: state.totalWithBonus,
        delta: null
      };
    }

    const summaryTotal =
      Number(
        summaryRow.totalwithbonus ||
          summaryRow.total ||
          summaryRow.commissiontotal ||
          summaryRow.paid ||
          summaryRow.amount
      ) || 0;

    return {
      state: state.state,
      summaryFound: true,
      summaryTotal,
      ourTotalWithBonus: state.totalWithBonus,
      delta: Number((state.totalWithBonus - summaryTotal).toFixed(2))
    };
  });
}

async function writePerFileReport(fileBase, recompute, comparisons) {
  const workbook = new ExcelJS.Workbook();

  const detailsSheet = workbook.addWorksheet('Details Recalc');
  detailsSheet.columns = [
    { header: 'State', key: 'state', width: 12 },
    { header: 'LineSubtotal', key: 'lineSubtotal', width: 14 },
    { header: 'PurchaseType', key: 'purchaseType', width: 12 },
    { header: 'IsIncentivized', key: 'isIncentivized', width: 14 },
    { header: 'AppliedRate', key: 'appliedRate', width: 12 },
    { header: 'Commission', key: 'commission', width: 14 }
  ];
  recompute.states.forEach(state => {
    state.lines.forEach(line => {
      detailsSheet.addRow({
        state: line.state,
        lineSubtotal: Number(line.lineSubtotal.toFixed(2)),
        purchaseType: line.purchaseType,
        isIncentivized: line.isIncentivized,
        appliedRate: Number(line.appliedRate.toFixed(6)),
        commission: Number(line.commission.toFixed(2))
      });
    });
  });

  const statesSheet = workbook.addWorksheet('State Totals');
  statesSheet.columns = [
    { header: 'State', key: 'state', width: 12 },
    { header: 'TotalSales', key: 'totalSales', width: 14 },
    { header: 'Commission', key: 'commission', width: 14 },
    { header: 'StateBonus', key: 'stateBonus', width: 12 },
    { header: 'TotalWithBonus', key: 'totalWithBonus', width: 16 }
  ];
  recompute.states.forEach(state => {
    statesSheet.addRow({
      state: state.state,
      totalSales: Number(state.totalSales.toFixed(2)),
      commission: Number(state.commission.toFixed(2)),
      stateBonus: Number(state.stateBonus.toFixed(2)),
      totalWithBonus: Number(state.totalWithBonus.toFixed(2))
    });
  });

  const compareSheet = workbook.addWorksheet('Summary Compare');
  compareSheet.columns = [
    { header: 'State', key: 'state', width: 12 },
    { header: 'SummaryFound', key: 'summaryFound', width: 14 },
    { header: 'SummaryTotal', key: 'summaryTotal', width: 14 },
    { header: 'OurTotalWithBonus', key: 'ourTotalWithBonus', width: 18 },
    { header: 'Delta(Our - Summary)', key: 'delta', width: 18 }
  ];
  comparisons.forEach(entry => {
    compareSheet.addRow({
      state: entry.state,
      summaryFound: entry.summaryFound,
      summaryTotal: entry.summaryTotal != null ? Number(entry.summaryTotal.toFixed(2)) : null,
      ourTotalWithBonus: Number(entry.ourTotalWithBonus.toFixed(2)),
      delta: entry.delta != null ? Number(entry.delta.toFixed(2)) : null
    });
  });

  const outPath = path.join(REPORT_DIR, `${fileBase}-recalc.xlsx`);
  await workbook.xlsx.writeFile(outPath);
  return outPath;
}

async function writeTotalSummaryReport(aggregate) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Total Summary');
  sheet.columns = [
    { header: 'State', key: 'state', width: 12 },
    { header: 'TotalSales', key: 'totalSales', width: 14 },
    { header: 'Commission', key: 'commission', width: 14 },
    { header: 'StateBonus', key: 'stateBonus', width: 12 },
    { header: 'TotalWithBonus', key: 'totalWithBonus', width: 16 }
  ];
  (aggregate.states || []).forEach(state => {
    sheet.addRow({
      state: state.state,
      totalSales: Number(state.totalSales.toFixed(2)),
      commission: Number(state.commission.toFixed(2)),
      stateBonus: Number(state.stateBonus.toFixed(2)),
      totalWithBonus: Number(state.totalWithBonus.toFixed(2))
    });
  });

  const outPath = path.join(REPORT_DIR, 'Total Summary.xlsx');
  await workbook.xlsx.writeFile(outPath);
  return outPath;
}

app.use(express.static(path.join(ROOT, 'public')));

app.post('/api/commission/upload', upload.array('files', 20), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const perFile = [];
    const totalStatesMap = new Map();

    for (const file of files) {
      const fullPath = path.resolve(file.path);
      const baseName = path.basename(file.originalname, path.extname(file.originalname));
      const { detailsRows, summaryRows } = readWorkbook(fullPath);
      const recompute = computeFromDetails(detailsRows);
      const comparisons = compareAgainstSummary(summaryRows, recompute.states);
      const reportPath = await writePerFileReport(baseName || 'report', recompute, comparisons);

      recompute.states.forEach(state => {
        if (!totalStatesMap.has(state.state)) {
          totalStatesMap.set(state.state, { ...state });
        } else {
          const existing = totalStatesMap.get(state.state);
          existing.totalSales += state.totalSales;
          existing.commission += state.commission;
          existing.stateBonus += state.stateBonus;
          existing.totalWithBonus += state.totalWithBonus;
          totalStatesMap.set(state.state, existing);
        }
      });

      try {
        fs.unlinkSync(fullPath);
      } catch (cleanupError) {
        console.warn('Failed to remove uploaded file', cleanupError);
      }

      perFile.push({
        file: file.originalname,
        result: recompute,
        comparison: comparisons,
        reportDownload: `/api/commission/report/${encodeURIComponent(path.basename(reportPath))}`
      });
    }

    const totalStates = Array.from(totalStatesMap.values()).sort((a, b) => a.state.localeCompare(b.state));
    const totalSummaryPath = await writeTotalSummaryReport({ states: totalStates });
    const totalSummaryDownload = `/api/commission/report/${encodeURIComponent(path.basename(totalSummaryPath))}`;

    return res.json({
      ok: true,
      perFile,
      totalSummaryDownload
    });
  } catch (error) {
    console.error('Commission processing failed', error);
    return res.status(500).json({ error: 'Processing failed', detail: error.message });
  }
});

app.get('/api/commission/report/:file', (req, res) => {
  const filePath = path.join(REPORT_DIR, req.params.file);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Not found');
  }
  res.download(filePath);
});

app.get(['/healthz', '/health'], (_req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`commission server ready on :${PORT}`);
});
