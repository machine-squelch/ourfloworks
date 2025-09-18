(() => {
    'use strict';

    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    const ALLOWED_EXTENSIONS = ['.xlsx', '.xls'];
    const PREVIEW_LIMIT = 25;

    const dropZone = document.querySelector('[data-drop-zone]');
    const fileInput = document.querySelector('[data-file-input]');
    const browseButton = document.querySelector('[data-browse]');
    const uploadButton = document.querySelector('[data-upload-button]');
    const fileMeta = document.querySelector('[data-file-meta]');
    const resultsPanel = document.getElementById('results-panel');
    const resultsMeta = document.querySelector('[data-results-meta]');
    const csvButton = document.querySelector('[data-download-csv]');
    const pdfButton = document.querySelector('[data-generate-pdf]');
    const announcer = document.querySelector('[data-announcer]');
    const stateTableBody = document.querySelector('#state-table tbody');
    const discrepancyTableBody = document.querySelector('#discrepancy-table tbody');
    const discrepancyHint = document.querySelector('[data-discrepancy-hint]');
    const detailTableBody = document.querySelector('#detail-table tbody');
    const previewMeta = document.querySelector('[data-preview-meta]');
    const sessionClock = document.getElementById('session-clock');

    const summaryFields = {
        totalSales: document.querySelector('[data-field="totalSales"]'),
        discrepancyCount: document.querySelector('[data-field="discrepancyCount"]'),
        totalBonus: document.querySelector('[data-field="totalBonus"]'),
        averageVariance: document.querySelector('[data-field="averageVariance"]')
    };

    const currencyFormatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    const integerFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
    const dateTimeFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

    let selectedFile = null;
    let currentReport = null;
    let cachedLogoDataUrl = null;

    const libraryLoader = {
        jsPdfPromise: null,
        autoTablePromise: null,
        async loadJsPdf() {
            if (!this.jsPdfPromise) {
                this.jsPdfPromise = new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                    script.onload = () => {
                        if (window.jspdf?.jsPDF) {
                            resolve(window.jspdf.jsPDF);
                        } else {
                            reject(new Error('jsPDF failed to load.'));
                        }
                    };
                    script.onerror = () => reject(new Error('Unable to load jsPDF library.'));
                    document.head.appendChild(script);
                });
            }
            return this.jsPdfPromise;
        },
        async loadAutoTable() {
            await this.loadJsPdf();
            if (!this.autoTablePromise) {
                this.autoTablePromise = new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
                    script.onload = () => {
                        if (window.jspdf?.jsPDF?.API?.autoTable) {
                            resolve();
                        } else {
                            reject(new Error('jsPDF autoTable failed to initialise.'));
                        }
                    };
                    script.onerror = () => reject(new Error('Unable to load jsPDF autoTable plugin.'));
                    document.head.appendChild(script);
                });
            }
            return this.autoTablePromise;
        }
    };

    function init() {
        bindEvents();
        startClock();
        announce('Ready for verification. Upload a workbook to begin.');
    }

    function bindEvents() {
        dropZone.addEventListener('dragover', event => {
            event.preventDefault();
            dropZone.classList.add('is-active');
        });

        dropZone.addEventListener('dragenter', event => {
            event.preventDefault();
            dropZone.classList.add('is-active');
        });

        dropZone.addEventListener('dragleave', event => {
            if (event.relatedTarget && dropZone.contains(event.relatedTarget)) {
                return;
            }
            dropZone.classList.remove('is-active');
        });

        dropZone.addEventListener('drop', event => {
            event.preventDefault();
            dropZone.classList.remove('is-active');
            const file = event.dataTransfer?.files?.[0];
            if (file) {
                handleFileSelection(file);
            }
        });

        dropZone.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInput.click();
            }
        });

        fileInput.addEventListener('change', event => {
            const file = event.target.files?.[0];
            if (file) {
                handleFileSelection(file);
            }
        });

        browseButton.addEventListener('click', () => fileInput.click());
        uploadButton.addEventListener('click', () => selectedFile && verifyFile(selectedFile));
        csvButton.addEventListener('click', () => currentReport && downloadCsv());
        pdfButton.addEventListener('click', () => currentReport && generatePdf());
    }

    function startClock() {
        const tick = () => {
            const now = new Date();
            if (sessionClock) {
                sessionClock.textContent = now.toLocaleTimeString('en-US', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
            }
        };

        tick();
        setInterval(tick, 1000);
    }

    function handleFileSelection(file) {
        const validationError = validateFile(file);
        if (validationError) {
            setFileMeta(validationError, 'error');
            announce(validationError);
            selectedFile = null;
            uploadButton.disabled = true;
            return;
        }

        selectedFile = file;
        setFileMeta(`Ready: ${file.name} (${formatBytes(file.size)})`);
        uploadButton.disabled = false;
        fileInput.value = '';
        announce(`Selected ${file.name}. Press verify to begin.`);
    }

    function validateFile(file) {
        if (!file) {
            return 'Please choose a workbook to verify.';
        }

        const extensionMatch = file.name.match(/\.([^.]+)$/);
        const extension = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : '';

        if (!ALLOWED_EXTENSIONS.includes(extension)) {
            return 'Unsupported file type. Upload an Excel workbook (.xlsx or .xls).';
        }

        if (file.size > MAX_FILE_SIZE) {
            return 'File is larger than 50 MB. Please upload a smaller workbook.';
        }

        return '';
    }

    async function verifyFile(file) {
        if (!file) {
            return;
        }

        setUploadButtonLoading(true);
        setFileMeta(`Verifying ${file.name}…`);
        announce('Uploading workbook for verification.');

        try {
            const formData = new FormData();
            formData.append('commissionFile', file);

            const response = await fetch('/verify-commission', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorPayload = await tryParseJson(response);
                const message = errorPayload?.error || 'Verification failed. Please try again.';
                throw new Error(message);
            }

            const data = await response.json();
            currentReport = data;
            renderResults(data);
            setFileMeta(`Verified ${file.name}`, 'success');
            announce(`Verification complete for ${file.name}.`);
        } catch (error) {
            console.error(error);
            const message = error.message || 'Unexpected error during verification.';
            setFileMeta(message, 'error');
            announce(message);
        } finally {
            setUploadButtonLoading(false);
        }
    }

    async function downloadCsv() {
        if (!currentReport?.reportId) {
            return;
        }

        csvButton.disabled = true;
        announce('Preparing CSV report.');

        try {
            const response = await fetch('/download-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reportId: currentReport.reportId })
            });

            if (!response.ok) {
                const errorPayload = await tryParseJson(response);
                const message = errorPayload?.error || 'Unable to generate CSV report.';
                throw new Error(message);
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `thinkazoo-commission-report-${formatTimestamp(new Date())}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            announce('CSV report downloaded.');
        } catch (error) {
            console.error(error);
            resultsMeta.textContent = error.message;
            announce(error.message);
        } finally {
            csvButton.disabled = false;
        }
    }

    async function generatePdf() {
        if (!currentReport) {
            return;
        }

        pdfButton.disabled = true;
        announce('Building colorful PDF report.');

        try {
            const jsPDF = await libraryLoader.loadJsPdf();
            await libraryLoader.loadAutoTable();
            const logoDataUrl = await fetchLogo();

            const doc = new jsPDF({ unit: 'pt', format: 'a4' });
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            drawPdfHeader(doc, pageWidth, logoDataUrl);
            let currentY = 150;

            currentY = drawPdfSummary(doc, currentY, pageWidth, currentReport.summary);
            currentY = drawPdfStateTable(doc, currentY + 30, pageWidth, currentReport.stateBreakdown);
            currentY = drawPdfDiscrepancies(doc, currentY + 40, currentReport.discrepancies);
            drawPdfFooter(doc, pageHeight);

            doc.save(`thinkazoo-commission-report-${formatTimestamp(new Date())}.pdf`);
            announce('PDF report ready.');
        } catch (error) {
            console.error(error);
            const message = error.message || 'Unable to generate PDF report.';
            resultsMeta.textContent = message;
            announce(message);
        } finally {
            pdfButton.disabled = false;
        }
    }

    function drawPdfHeader(doc, pageWidth, logoDataUrl) {
        doc.setFillColor(12, 27, 60);
        doc.rect(0, 0, pageWidth, 120, 'F');

        if (logoDataUrl) {
            doc.addImage(logoDataUrl, 'PNG', 40, 26, 70, 70);
        }

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.text('Thinkazoo Commission Verification Report', 120, 55);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.text(`Generated: ${formatDateTime(currentReport.generatedAt)}`, 120, 80);
        doc.text(`Workbook: ${currentReport.fileName}`, 120, 98);
    }

    function drawPdfSummary(doc, startY, pageWidth, summary) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(35, 43, 97);
        doc.text('Summary', 40, startY);

        const cardWidth = (pageWidth - 120) / 2;
        const cardHeight = 70;
        const cardSpacing = 20;

        const cards = [
            { label: 'Total Sales', value: formatCurrency(summary.totalSales) },
            { label: 'Discrepancies', value: integerFormatter.format(summary.discrepancyCount) },
            { label: 'Total Bonus', value: formatCurrency(summary.totalBonus) },
            { label: 'Max Variance', value: formatCurrency(summary.maxVariance) }
        ];

        let maxRowIndex = 0;

        cards.forEach((card, index) => {
            const rowIndex = Math.floor(index / 2);
            const columnIndex = index % 2;
            const cardX = 40 + columnIndex * (cardWidth + cardSpacing);
            const cardY = startY + 20 + rowIndex * (cardHeight + cardSpacing);

            doc.setFillColor(244, 248, 255);
            doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 12, 12, 'F');

            doc.setTextColor(92, 105, 135);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            doc.text(card.label, cardX + 16, cardY + 26);

            doc.setTextColor(24, 34, 71);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.text(card.value, cardX + 16, cardY + 48);

            maxRowIndex = Math.max(maxRowIndex, rowIndex);
        });

        const summaryY = startY + 20 + (maxRowIndex + 1) * cardHeight + maxRowIndex * cardSpacing + 20;

        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(92, 105, 135);
        const maxWidth = pageWidth - 80;
        doc.text(`Average variance: ${formatCurrency(summary.averageVariance)} | Rows processed: ${summary.processedRows}/${summary.totalRows}`, 40, summaryY, { maxWidth });

        if (summary.notice) {
            doc.text(summary.notice, 40, summaryY + 16, { maxWidth });
        }

        return summaryY + 28;
    }

    function drawPdfStateTable(doc, startY, pageWidth, states) {
        if (!Array.isArray(states) || states.length === 0) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(12);
            doc.setTextColor(92, 105, 135);
            doc.text('No state breakdown available for this workbook.', 40, startY);
            return startY + 20;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(35, 43, 97);
        doc.text('State Breakdown', 40, startY);

        doc.autoTable({
            startY: startY + 12,
            head: [['State', 'Tier', 'Sales', 'Bonus', 'Variance Repeat', 'Variance New', 'Variance Incentive']],
            body: states.map(state => [
                state.state,
                state.tier,
                formatCurrency(state.totalSales),
                formatCurrency(state.bonus),
                formatVarianceValue(state.variance.repeat),
                formatVarianceValue(state.variance.new),
                formatVarianceValue(state.variance.incentive)
            ]),
            margin: { left: 40, right: 40 },
            styles: {
                fontSize: 10,
                fillColor: [248, 250, 255],
                textColor: [35, 43, 97]
            },
            headStyles: {
                fillColor: [35, 43, 97],
                textColor: [255, 255, 255],
                fontStyle: 'bold'
            },
            alternateRowStyles: {
                fillColor: [255, 255, 255]
            }
        });

        return doc.lastAutoTable.finalY;
    }

    function drawPdfDiscrepancies(doc, startY, discrepancies) {
        const hasData = Array.isArray(discrepancies) && discrepancies.length > 0;

        if (!hasData) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(35, 43, 97);
            doc.text('Discrepancy Log', 40, startY);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(12);
            doc.setTextColor(92, 105, 135);
            doc.text('No discrepancies exceeded the ±$0.50 tolerance.', 40, startY + 18);
            return startY + 30;
        }

        const rows = discrepancies.slice(0, 24).map(entry => [
            String(entry.rowNumber),
            entry.invoice,
            entry.customer,
            entry.state,
            entry.type.toUpperCase(),
            formatCurrency(entry.expected),
            formatCurrency(entry.reported),
            formatVarianceValue(entry.variance)
        ]);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(35, 43, 97);
        doc.text('Discrepancy Log', 40, startY);

        doc.autoTable({
            startY: startY + 12,
            head: [['Row', 'Invoice', 'Customer', 'State', 'Type', 'Expected', 'Reported', 'Variance']],
            body: rows,
            margin: { left: 40, right: 40 },
            styles: {
                fontSize: 10,
                fillColor: [250, 252, 255],
                textColor: [35, 43, 97]
            },
            headStyles: {
                fillColor: [255, 110, 199],
                textColor: [4, 11, 24],
                fontStyle: 'bold'
            },
            alternateRowStyles: {
                fillColor: [255, 255, 255]
            }
        });

        if (discrepancies.length > rows.length) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(10);
            doc.setTextColor(92, 105, 135);
            doc.text(`+${discrepancies.length - rows.length} additional variance entries available in CSV report.`, 40, doc.lastAutoTable.finalY + 16);
            return doc.lastAutoTable.finalY + 30;
        }

        return doc.lastAutoTable.finalY;
    }

    function drawPdfFooter(doc, pageHeight) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(120, 132, 170);
        doc.text('Secure processing • No data retention • Thinkazoo Commission Verification Web App', 40, pageHeight - 30);
    }

    async function fetchLogo() {
        if (cachedLogoDataUrl) {
            return cachedLogoDataUrl;
        }

        const response = await fetch('dllogoonly.png');
        if (!response.ok) {
            throw new Error('Unable to load logo for PDF.');
        }

        const blob = await response.blob();
        cachedLogoDataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to encode logo for PDF.'));
            reader.readAsDataURL(blob);
        });

        return cachedLogoDataUrl;
    }

    function renderResults(report) {
        if (!report?.summary) {
            return;
        }

        resultsPanel.classList.remove('is-hidden');
        csvButton.disabled = false;
        pdfButton.disabled = false;

        const { summary } = report;
        summaryFields.totalSales.textContent = formatCurrency(summary.totalSales);
        summaryFields.discrepancyCount.textContent = integerFormatter.format(summary.discrepancyCount);
        summaryFields.totalBonus.textContent = formatCurrency(summary.totalBonus);
        summaryFields.averageVariance.textContent = formatCurrency(summary.averageVariance);

        const metaParts = [];
        if (summary.notice) {
            metaParts.push(summary.notice);
        }
        metaParts.push(`Processed ${summary.processedRows} of ${summary.totalRows} rows.`);
        metaParts.push(`Generated ${formatDateTime(report.generatedAt)}.`);
        resultsMeta.textContent = metaParts.join(' ');

        renderStateTable(report.stateBreakdown);
        renderDiscrepancies(report.discrepancies);
        renderDetailPreview(report.rows);
    }

    function renderStateTable(states) {
        stateTableBody.innerHTML = '';

        if (!Array.isArray(states) || states.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 7;
            cell.textContent = 'No state data available.';
            row.appendChild(cell);
            stateTableBody.appendChild(row);
            return;
        }

        states.forEach(state => {
            const row = document.createElement('tr');
            row.appendChild(createCell(state.state));
            row.appendChild(createCell(state.tier));
            row.appendChild(createCell(formatCurrency(state.totalSales)));
            row.appendChild(createCell(formatCurrency(state.bonus)));
            row.appendChild(createVarianceCell(state.variance.repeat));
            row.appendChild(createVarianceCell(state.variance.new));
            row.appendChild(createVarianceCell(state.variance.incentive));
            stateTableBody.appendChild(row);
        });
    }

    function renderDiscrepancies(discrepancies) {
        discrepancyTableBody.innerHTML = '';

        if (!Array.isArray(discrepancies) || discrepancies.length === 0) {
            discrepancyHint.textContent = 'No discrepancies detected within the ±$0.50 tolerance.';
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 8;
            cell.textContent = 'All reported commissions matched the calculated expectations within tolerance.';
            row.appendChild(cell);
            discrepancyTableBody.appendChild(row);
            return;
        }

        const topEntry = discrepancies[0];
        discrepancyHint.textContent = `Identified ${discrepancies.length} variance entries. Highest variance is ${formatVarianceValue(topEntry.variance)} on invoice ${topEntry.invoice}.`;

        discrepancies.slice(0, 40).forEach(entry => {
            const row = document.createElement('tr');
            row.appendChild(createCell(entry.rowNumber));
            row.appendChild(createCell(entry.invoice));
            row.appendChild(createCell(entry.customer));
            row.appendChild(createCell(entry.state));
            row.appendChild(createCell(entry.type.toUpperCase()));
            row.appendChild(createCell(formatCurrency(entry.expected)));
            row.appendChild(createCell(formatCurrency(entry.reported)));
            row.appendChild(createVarianceCell(entry.variance));
            discrepancyTableBody.appendChild(row);
        });

        if (discrepancies.length > 40) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 8;
            cell.textContent = `+${discrepancies.length - 40} additional discrepancies available in exported reports.`;
            row.appendChild(cell);
            discrepancyTableBody.appendChild(row);
        }
    }

    function renderDetailPreview(rows) {
        detailTableBody.innerHTML = '';

        const previewRows = Array.isArray(rows) ? rows.slice(0, PREVIEW_LIMIT) : [];
        previewMeta.textContent = `Previewing the first ${previewRows.length} of ${rows?.length || 0} rows.`;

        if (previewRows.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 9;
            cell.textContent = 'No detail rows to display.';
            row.appendChild(cell);
            detailTableBody.appendChild(row);
            return;
        }

        previewRows.forEach(entry => {
            const row = document.createElement('tr');
            row.appendChild(createCell(entry.rowNumber));
            row.appendChild(createCell(entry.invoice));
            row.appendChild(createCell(entry.customer));
            row.appendChild(createCell(entry.state));
            row.appendChild(createCell(entry.tier));
            row.appendChild(createCell(formatCurrency(entry.sales)));
            row.appendChild(createVarianceCell(entry.variance.repeat));
            row.appendChild(createVarianceCell(entry.variance.new));
            row.appendChild(createVarianceCell(entry.variance.incentive));
            detailTableBody.appendChild(row);
        });

        if ((rows?.length || 0) > PREVIEW_LIMIT) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 9;
            cell.textContent = `+${rows.length - PREVIEW_LIMIT} additional rows available via CSV or PDF reports.`;
            row.appendChild(cell);
            detailTableBody.appendChild(row);
        }
    }

    function setUploadButtonLoading(isLoading) {
        uploadButton.classList.toggle('is-loading', isLoading);
        uploadButton.disabled = isLoading;
    }

    function setFileMeta(message, status) {
        fileMeta.textContent = message;
        fileMeta.classList.remove('is-error', 'is-success');
        if (status === 'error') {
            fileMeta.classList.add('is-error');
        } else if (status === 'success') {
            fileMeta.classList.add('is-success');
        }
    }

    function createCell(value) {
        const cell = document.createElement('td');
        cell.textContent = value === null || value === undefined ? '' : String(value);
        return cell;
    }

    function createVarianceCell(value) {
        const cell = document.createElement('td');
        const amount = Number(value) || 0;
        cell.textContent = formatVarianceValue(amount);
        if (amount > 0) {
            cell.classList.add('variance-positive');
        } else if (amount < 0) {
            cell.classList.add('variance-negative');
        }
        return cell;
    }

    function formatCurrency(value) {
        return currencyFormatter.format(Number(value) || 0);
    }

    function formatVarianceValue(value) {
        const amount = Number(value) || 0;
        if (amount === 0) {
            return currencyFormatter.format(0);
        }
        const absolute = currencyFormatter.format(Math.abs(amount));
        return amount > 0 ? `+${absolute}` : `-${absolute}`;
    }

    function formatBytes(bytes) {
        if (!Number.isFinite(bytes)) {
            return '0 B';
        }
        const units = ['B', 'KB', 'MB', 'GB'];
        let value = bytes;
        let index = 0;
        while (value >= 1024 && index < units.length - 1) {
            value /= 1024;
            index += 1;
        }
        const decimals = value >= 10 || index === 0 ? 0 : 1;
        return `${value.toFixed(decimals)} ${units[index]}`;
    }

    function formatDateTime(dateLike) {
        try {
            return dateTimeFormatter.format(new Date(dateLike));
        } catch (error) {
            return String(dateLike || '');
        }
    }

    function formatTimestamp(date) {
        const target = date instanceof Date ? date : new Date(date);
        const pad = value => String(value).padStart(2, '0');
        return `${target.getFullYear()}${pad(target.getMonth() + 1)}${pad(target.getDate())}-${pad(target.getHours())}${pad(target.getMinutes())}`;
    }

    async function tryParseJson(response) {
        try {
            return await response.clone().json();
        } catch (error) {
            return null;
        }
    }

    function announce(message) {
        if (announcer) {
            announcer.textContent = message;
        }
    }

    init();
})();
