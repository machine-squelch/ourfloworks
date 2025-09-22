// Updated Application State Management for New Server Response
const AppState = {
    currentFile: null,
    isProcessing: false,
    results: null
};

// Utility Functions
const Utils = {
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    },

    announce(message, priority = 'polite') {
        const announcer = document.createElement('div');
        announcer.setAttribute('aria-live', priority);
        announcer.setAttribute('aria-atomic', 'true');
        announcer.className = 'sr-only';
        announcer.textContent = message;
        document.body.appendChild(announcer);
        setTimeout(() => document.body.removeChild(announcer), 1000);
    },

    scrollToElement(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const headerHeight = 80;
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerHeight;

        window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
        });
    }
};

// File Upload Manager
const FileUploadManager = {
    init() {
        const dropzone = document.getElementById('dropzone');
        const fileInput = document.getElementById('file-input');
        const removeBtn = document.getElementById('remove-file');

        if (!dropzone || !fileInput) return;

        // File input change handler
        fileInput.addEventListener('change', this.handleFileSelect.bind(this));

        // Remove file handler
        if (removeBtn) {
            removeBtn.addEventListener('click', this.removeFile.bind(this));
        }

        // Dropzone handlers
        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('dragover', this.handleDragOver.bind(this));
        dropzone.addEventListener('dragleave', this.handleDragLeave.bind(this));
        dropzone.addEventListener('drop', this.handleDrop.bind(this));

        // Keyboard support for dropzone
        dropzone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInput.click();
            }
        });
    },

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.validateAndSetFile(file);
        }
    },

    handleDragOver(event) {
        event.preventDefault();
        event.currentTarget.classList.add('dragover');
    },

    handleDragLeave(event) {
        event.preventDefault();
        event.currentTarget.classList.remove('dragover');
    },

    handleDrop(event) {
        event.preventDefault();
        event.currentTarget.classList.remove('dragover');

        const file = event.dataTransfer.files[0];
        if (file) {
            this.validateAndSetFile(file);
        }
    },

    validateAndSetFile(file) {
        this.clearErrors();

        // Validate file type - Accept Excel files
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
            this.showError('Please upload an Excel file (.xlsx or .xls) with Summary and Detail sheets.');
            return;
        }

        // Validate file size (50MB limit for Excel)
        if (file.size > 50 * 1024 * 1024) {
            this.showError('File size exceeds 50MB limit.');
            return;
        }

        AppState.currentFile = file;
        this.showFilePreview(file);
        this.updateVerifyButton();
    },

    showFilePreview(file) {
        const preview = document.getElementById('file-preview');
        const fileName = document.getElementById('file-name');
        const fileSize = document.getElementById('file-size');
        const fileStatus = document.getElementById('file-status');

        if (!preview || !fileName || !fileSize || !fileStatus) return;

        fileName.textContent = file.name;
        fileSize.textContent = Utils.formatFileSize(file.size);
        fileStatus.textContent = 'Ready to verify';

        preview.classList.remove('hidden');
    },

    removeFile() {
        AppState.currentFile = null;

        const preview = document.getElementById('file-preview');
        const fileInput = document.getElementById('file-input');

        if (preview) preview.classList.add('hidden');
        if (fileInput) fileInput.value = '';

        this.updateVerifyButton();
        this.clearErrors();
    },

    updateVerifyButton() {
        const verifyBtn = document.getElementById('verify-btn');
        const description = document.getElementById('verify-description');

        if (!verifyBtn || !description) return;

        if (AppState.currentFile) {
            verifyBtn.disabled = false;
            verifyBtn.classList.remove('disabled');
            description.textContent = 'Ready to process commission data';
        } else {
            verifyBtn.disabled = true;
            verifyBtn.classList.add('disabled');
            description.textContent = 'Upload an Excel file to enable verification';
        }
    },

    showError(message) {
        const errorContainer = document.getElementById('upload-errors');
        if (!errorContainer) return;

        errorContainer.innerHTML = `
            <div class="error-message">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                ${message}
            </div>
        `;
        errorContainer.classList.remove('hidden');

        Utils.announce(message, 'assertive');
    },

    clearErrors() {
        const errorContainer = document.getElementById('upload-errors');
        if (errorContainer) {
            errorContainer.classList.add('hidden');
            errorContainer.innerHTML = '';
        }
    }
};

// Progress Manager
const ProgressManager = {
    show() {
        const section = document.getElementById('progress-section');
        if (section) {
            section.classList.remove('hidden');
            Utils.scrollToElement('progress-section');
        }
    },

    hide() {
        const section = document.getElementById('progress-section');
        if (section) {
            section.classList.add('hidden');
        }
    },

    update(percent, message) {
        const fill = document.getElementById('progress-fill');
        const text = document.getElementById('progress-text');
        const percentElement = document.getElementById('progress-percent');

        if (fill) fill.style.width = `${percent}%`;
        if (text) text.textContent = message;
        if (percentElement) percentElement.textContent = `${percent}%`;
    }
};

// Updated Results Manager for New Server Response
const ResultsManager = {
    show(results) {
        console.log('Received results:', results);

        if (!results || !results.summary) {
            console.error('Invalid results format');
            return;
        }

        AppState.results = results;

        this.updateSummaryCards(results.summary);
        this.updateCommissionBreakdown(results.commission_breakdown);
        this.updateSimpleComparison(results);
        this.updateErrorAnalysis(results.error_analysis);

        // Enable download buttons
        const pdfBtn = document.getElementById('download-pdf-btn');
        if (pdfBtn) pdfBtn.disabled = false;

        const section = document.getElementById('results-section');
        if (section) {
            section.classList.remove('hidden');
            Utils.scrollToElement('results-section');
        }

        Utils.announce('Verification results are now available');
    },

    updateSummaryCards(summary) {
        // Update summary cards with clear DL vs Claude distinction
        const totalTransactions = document.getElementById('total-transactions');
        const totalStates = document.getElementById('total-states');
        const calculatedCommission = document.getElementById('calculated-commission');
        const reportedCommission = document.getElementById('reported-commission');
        const commissionDifference = document.getElementById('commission-difference');
        const verificationStatus = document.getElementById('verification-status');

        if (totalTransactions) {
            totalTransactions.textContent = summary.total_transactions;
        }
        if (totalStates) {
            totalStates.textContent = summary.total_states;
        }
        if (calculatedCommission) {
            calculatedCommission.textContent = Utils.formatCurrency(summary.total_calculated_commission);
        }
        if (reportedCommission) {
            reportedCommission.textContent = Utils.formatCurrency(summary.total_reported_commission);
        }
        if (commissionDifference) {
            const difference = parseFloat(summary.difference);
            commissionDifference.textContent = Utils.formatCurrency(Math.abs(difference));

            // Color code the difference
            if (Math.abs(difference) < 0.01) {
                commissionDifference.style.color = 'var(--color-success)';
            } else if (difference > 0) {
                commissionDifference.style.color = 'var(--color-owed)';
            } else {
                commissionDifference.style.color = 'var(--color-warning)';
            }
        }
        if (verificationStatus) {
            const difference = parseFloat(summary.difference);
            if (Math.abs(difference) < 0.01) {
                verificationStatus.textContent = 'VERIFIED ✓';
                verificationStatus.className = 'card-value status-success';
            } else {
                verificationStatus.textContent = 'DISCREPANCY';
                verificationStatus.className = 'card-value status-error';
            }
        }
    },

    updateCommissionBreakdown(breakdown) {
        const repeatElement = document.getElementById('repeat-commission');
        const newElement = document.getElementById('new-commission');
        const incentiveElement = document.getElementById('incentive-commission');
        const bonusElement = document.getElementById('state-bonuses');

        if (repeatElement) repeatElement.textContent = Utils.formatCurrency(breakdown.repeat);
        if (newElement) newElement.textContent = Utils.formatCurrency(breakdown.new);
        if (incentiveElement) incentiveElement.textContent = Utils.formatCurrency(breakdown.incentive);
        if (bonusElement) bonusElement.textContent = Utils.formatCurrency(AppState.results.summary.total_state_bonuses);
    },

    updateAmountOwed(results) {
        const amountElement = document.getElementById('amount-owed');
        const explanationElement = document.getElementById('owed-explanation');

        if (!amountElement) return;

        const difference = parseFloat(results.summary.difference);
        const amountOwed = Math.abs(difference);

        amountElement.textContent = Utils.formatCurrency(amountOwed);

        if (explanationElement) {
            if (amountOwed < 0.01) {
                explanationElement.textContent = 'All calculations match - no amount owed';
                amountElement.style.color = 'var(--color-success)';
            } else if (difference > 0) {
                explanationElement.textContent = 'Company underpaid - amount owed to salesperson';
                amountElement.style.color = 'var(--color-owed)';
            } else {
                explanationElement.textContent = 'Company overpaid - amount owed by salesperson';
                amountElement.style.color = 'var(--color-warning)';
            }
        }
    },

    updateErrorAnalysis(errorAnalysis) {
        const tableBody = document.querySelector('#state-table tbody');
        if (!tableBody) return;

        tableBody.innerHTML = '';

        if (!Array.isArray(errorAnalysis) || errorAnalysis.length === 0) {
            // Show "No errors found" message
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="4" style="text-align: center; color: #22c55e; padding: 20px;">
                    ✅ No calculation errors found - DL's commission calculations match Claude's analysis
                </td>
            `;
            tableBody.appendChild(row);
            return;
        }

        errorAnalysis.forEach(error => {
            const row = document.createElement('tr');

            const diffClass = parseFloat(error.difference) > 0 ? 'difference-positive' : 'difference-negative';

            row.innerHTML = `
                <td><strong>${error.issue}</strong><br><small>${error.description}</small></td>
                <td class="dl-data">${Utils.formatCurrency(error.dl_value)}</td>
                <td class="claude-data">${Utils.formatCurrency(error.claude_value)}</td>
                <td class="${diffClass}">
                    ${Utils.formatCurrency(error.difference)}<br>
                    <small>${error.impact}</small>
                </td>
            `;

            tableBody.appendChild(row);
        });
    },

    updateRateErrors(rateErrors) {
        const section = document.getElementById('rate-errors-section');
        const content = document.getElementById('rate-errors-content');

        if (!section || !content) return;

        if (!rateErrors || rateErrors.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        content.innerHTML = '';

        let totalUnderpayment = 0;

        rateErrors.forEach(stateError => {
            const stateDiv = document.createElement('div');
            stateDiv.className = 'rate-error-state';

            let stateUnderpayment = 0;
            let errorsHtml = '';

            stateError.errors.forEach(error => {
                stateUnderpayment += Math.abs(error.difference);
                totalUnderpayment += Math.abs(error.difference);

                const errorType = error.type === 'repeat' ? 'Repeat Product' :
                                error.type === 'new' ? 'New Product' : 'Incentive Product';

                errorsHtml += `
                    <div class="rate-error-detail">
                        <div class="error-type">${errorType} Commission</div>
                        <div class="error-rates">
                            <span class="error-expected">Expected: ${error.expected_rate.toFixed(1)}%</span>
                            <span class="error-actual">DL Used: ${error.actual_rate.toFixed(3)}%</span>
                        </div>
                        <div class="error-amounts">
                            <span class="error-revenue">Revenue: ${Utils.formatCurrency(error.revenue)}</span>
                            <span class="error-underpaid">Underpaid: ${Utils.formatCurrency(Math.abs(error.difference))}</span>
                        </div>
                    </div>
                `;
            });

            stateDiv.innerHTML = `
                <div class="rate-error-header">
                    <h4>${stateError.state} - ${stateError.tier.toUpperCase()} (${Utils.formatCurrency(stateError.total_sales)} sales)</h4>
                    <span class="state-underpaid">Total Underpaid: ${Utils.formatCurrency(stateUnderpayment)}</span>
                </div>
                <div class="rate-error-details">
                    ${errorsHtml}
                </div>
            `;

            content.appendChild(stateDiv);
        });

        // Add total summary
        const totalDiv = document.createElement('div');
        totalDiv.className = 'rate-errors-total';
        totalDiv.innerHTML = `
            <div class="total-underpayment">
                <strong>Total Commission Rate Calculation Errors: ${Utils.formatCurrency(totalUnderpayment)}</strong>
            </div>
        `;
        content.appendChild(totalDiv);
    },

    updateSimpleComparison(results) {
        // Update Grand Totals
        const dlTotalCommissionEl = document.getElementById('dl-total-commission');
        const claudeTotalCommissionEl = document.getElementById('claude-total-commission');
        const differenceTotalCommissionEl = document.getElementById('difference-total-commission');

        const dlStateBonusesEl = document.getElementById('dl-state-bonuses');
        const claudeStateBonusesEl = document.getElementById('claude-state-bonuses');
        const differenceStateBonusesEl = document.getElementById('difference-state-bonuses');

        const summary = results.summary || {};
        const dlReported = results.dlReported || {};

        // Get DL values
        const dlTotalCommission = (dlReported.finalCommission && dlReported.finalCommission.found)
            ? dlReported.finalCommission.value
            : parseFloat(summary.total_reported_commission) || 0;

        const dlStateBonuses = (dlReported.stateBonus && dlReported.stateBonus.found)
            ? dlReported.stateBonus.value
            : 0;

        // Get Claude values
        const claudeTotalCommission = parseFloat(summary.total_calculated_commission) || 0;
        const claudeStateBonuses = parseFloat(summary.total_state_bonuses) || 0;

        // Calculate differences
        const commissionDifference = claudeTotalCommission - dlTotalCommission;
        const bonusDifference = claudeStateBonuses - dlStateBonuses;

        // Update Grand Totals
        if (dlTotalCommissionEl) dlTotalCommissionEl.textContent = `DL: ${Utils.formatCurrency(dlTotalCommission)}`;
        if (claudeTotalCommissionEl) claudeTotalCommissionEl.textContent = `Claude: ${Utils.formatCurrency(claudeTotalCommission)}`;
        if (differenceTotalCommissionEl) {
            const sign = commissionDifference >= 0 ? '+' : '';
            differenceTotalCommissionEl.textContent = `Diff: ${sign}${Utils.formatCurrency(commissionDifference)}`;
            differenceTotalCommissionEl.className = Math.abs(commissionDifference) < 0.01 ? 'difference-total' :
                                                   commissionDifference > 0 ? 'difference-total positive' : 'difference-total negative';
        }

        if (dlStateBonusesEl) dlStateBonusesEl.textContent = `DL: ${Utils.formatCurrency(dlStateBonuses)}`;
        if (claudeStateBonusesEl) claudeStateBonusesEl.textContent = `Claude: ${Utils.formatCurrency(claudeStateBonuses)}`;
        if (differenceStateBonusesEl) {
            const sign = bonusDifference >= 0 ? '+' : '';
            differenceStateBonusesEl.textContent = `Diff: ${sign}${Utils.formatCurrency(bonusDifference)}`;
            differenceStateBonusesEl.className = Math.abs(bonusDifference) < 0.01 ? 'difference-total' :
                                                bonusDifference > 0 ? 'difference-total positive' : 'difference-total negative';
        }

        // Update State Details
        this.updateStateDetails(results);

        // Update New Product Details
        this.updateNewProductDetails(results);
    },

    updateStateDetails(results) {
        const dlStateDetails = document.getElementById('dl-state-details');
        const claudeStateDetails = document.getElementById('claude-state-details');

        if (!dlStateDetails || !claudeStateDetails) return;

        dlStateDetails.innerHTML = '';
        claudeStateDetails.innerHTML = '';

        const errorAnalysis = results.error_analysis || [];

        errorAnalysis.forEach(error => {
            // Error details for comparison sections (simplified)
            const dlErrorItem = document.createElement('div');
            dlErrorItem.className = 'error-item';
            dlErrorItem.innerHTML = `
                <div class="error-type">${error.issue}</div>
                <div class="error-value">${Utils.formatCurrency(error.dl_value)}</div>
            `;
            dlStateDetails.appendChild(dlErrorItem);

            // Claude error details
            const claudeErrorItem = document.createElement('div');
            claudeErrorItem.className = 'error-item';
            claudeErrorItem.innerHTML = `
                <div class="error-type">${error.issue}</div>
                <div class="error-value">${Utils.formatCurrency(error.claude_value)}</div>
            `;
            claudeStateDetails.appendChild(claudeErrorItem);
        });
    },

    updateNewProductDetails(results) {
        const dlNewProductDetails = document.getElementById('dl-new-product-details');
        const claudeNewProductDetails = document.getElementById('claude-new-product-details');

        if (!dlNewProductDetails || !claudeNewProductDetails) return;

        dlNewProductDetails.innerHTML = '';
        claudeNewProductDetails.innerHTML = '';

        // For now, show placeholder message - we'd need transaction-level data to show actual part numbers
        dlNewProductDetails.innerHTML = `
            <div class="product-item">
                <div class="product-number">DL's new product details not yet available</div>
                <div class="product-commission">Need Excel detail analysis</div>
            </div>
        `;

        claudeNewProductDetails.innerHTML = `
            <div class="product-item">
                <div class="product-number">Total New Product Commission:</div>
                <div class="product-commission">${Utils.formatCurrency(results.commission_breakdown?.new || 0)}</div>
            </div>
        `;
    },

    updateDiscrepancies(discrepancies) {
        const countElement = document.getElementById('discrepancy-count');
        const tableBody = document.querySelector('#discrepancies-table tbody');

        if (countElement) {
            countElement.textContent = Array.isArray(discrepancies) ? discrepancies.length : 0;
        }

        if (!tableBody) return;

        tableBody.innerHTML = '';

        if (!Array.isArray(discrepancies) || discrepancies.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="no-discrepancies">No discrepancies found</td>
                </tr>
            `;
            return;
        }

        discrepancies.forEach(disc => {
            const row = document.createElement('tr');
            const difference = parseFloat(disc.difference);
            const diffClass = difference > 0 ? 'difference-positive' : 'difference-negative';

            row.innerHTML = `
                <td>${disc.invoice}</td>
                <td>${disc.state}</td>
                <td>${Utils.formatCurrency(disc.calculated)}</td>
                <td>${Utils.formatCurrency(disc.reported)}</td>
                <td class="${diffClass}">${Utils.formatCurrency(disc.difference)}</td>
            `;

            tableBody.appendChild(row);
        });
    }
};

// PDF Generator using jsPDF
const PDFGenerator = {
    async generateReport() {
        if (!AppState.results) {
            alert('No results available. Please upload a file first.');
            return;
        }

        // Show loading state
        const btn = document.getElementById('download-pdf-btn');
        const btnText = btn?.querySelector('.button-text');
        const btnLoader = btn?.querySelector('.button-loader');

        if (btn) btn.disabled = true;
        if (btnText) btnText.textContent = 'Generating PDF...';
        if (btnLoader) btnLoader.classList.remove('hidden');

        try {
            // Use the globally available jsPDF (loaded from CDN in HTML)
            const { jsPDF } = window.jspdf || window;

            if (!jsPDF) {
                throw new Error('PDF library not available. Please refresh the page and try again.');
            }

            const doc = new jsPDF();
            const results = AppState.results;

            // Set up fonts and styling
            doc.setFont('helvetica');

            // Header
            doc.setFontSize(20);
            doc.setFont('helvetica', 'bold');
            doc.text('COMMISSION VERIFICATION REPORT', 20, 30);

            doc.setFontSize(12);
            doc.setFont('helvetica', 'normal');
            doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 40);

            let yPos = 60;

            // Amount Owed Section (Most Important)
            const difference = parseFloat(results.summary.difference);
            const amountOwed = Math.abs(difference);

            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 107, 53); // Orange color for emphasis
            doc.text('AMOUNT OWED TO SALESPERSON', 20, yPos);

            yPos += 15;
            doc.setFontSize(24);
            doc.text(Utils.formatCurrency(amountOwed), 20, yPos);

            yPos += 10;
            doc.setFontSize(10);
            doc.setTextColor(100, 100, 100);
            if (amountOwed < 0.01) {
                doc.text('All calculations match - no amount owed', 20, yPos);
            } else if (difference > 0) {
                doc.text('Company underpaid - amount owed to salesperson', 20, yPos);
            } else {
                doc.text('Company overpaid - amount owed by salesperson', 20, yPos);
            }

            yPos += 25;

            // Summary Section
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('SUMMARY', 20, yPos);

            yPos += 10;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');

            const summaryData = [
                ['Total Transactions:', results.summary.total_transactions],
                ['Total States:', results.summary.total_states],
                ['Calculated Commission:', Utils.formatCurrency(results.summary.total_calculated_commission)],
                ['Reported Commission:', Utils.formatCurrency(results.summary.total_reported_commission)],
                ['Difference:', Utils.formatCurrency(results.summary.difference)],
                ['State Bonuses:', Utils.formatCurrency(results.summary.total_state_bonuses)]
            ];

            summaryData.forEach(([label, value]) => {
                doc.text(`${label} ${value}`, 20, yPos);
                yPos += 8;
            });

            yPos += 10;

            // Commission Breakdown
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('COMMISSION BREAKDOWN', 20, yPos);

            yPos += 10;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');

            const breakdownData = [
                ['Repeat Product:', Utils.formatCurrency(results.commission_breakdown.repeat)],
                ['New Product:', Utils.formatCurrency(results.commission_breakdown.new)],
                ['Incentive Product:', Utils.formatCurrency(results.commission_breakdown.incentive)]
            ];

            breakdownData.forEach(([label, value]) => {
                doc.text(`${label} ${value}`, 20, yPos);
                yPos += 8;
            });

            // Add new page if needed
            if (yPos > 250) {
                doc.addPage();
                yPos = 30;
            }

            // Error Analysis Table
            yPos += 15;
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('ERROR ANALYSIS', 20, yPos);

            yPos += 15;

            // Table headers
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            const headers = ['Issue', 'DL Calculated', 'Claude Calculated', 'Difference'];
            let xPos = 20;
            const colWidths = [50, 30, 30, 30];

            headers.forEach((header, i) => {
                doc.text(header, xPos, yPos);
                xPos += colWidths[i];
            });

            yPos += 8;

            // Error Analysis data
            doc.setFont('helvetica', 'normal');
            if (results.error_analysis && results.error_analysis.length > 0) {
                results.error_analysis.forEach(error => {
                    if (yPos > 270) {
                        doc.addPage();
                        yPos = 30;
                    }

                    xPos = 20;
                    const rowData = [
                        error.issue,
                        `$${error.dl_value}`,
                        `$${error.claude_value}`,
                        `$${error.difference}`
                    ];

                    rowData.forEach((data, i) => {
                        doc.text(data, xPos, yPos);
                        xPos += colWidths[i];
                    });

                    yPos += 6;
                });
            } else {
                doc.text('✅ No calculation errors found - DL calculations match Claude analysis', 20, yPos);
                yPos += 10;
            }

            // Discrepancies section if any exist
            if (results.discrepancies && results.discrepancies.length > 0) {
                yPos += 15;

                if (yPos > 250) {
                    doc.addPage();
                    yPos = 30;
                }

                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text(`DISCREPANCIES (${results.discrepancies.length})`, 20, yPos);

                yPos += 15;

                // Discrepancy table headers
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                const discHeaders = ['Invoice', 'State', 'Calculated', 'Reported', 'Difference'];
                xPos = 20;
                const discColWidths = [30, 20, 30, 30, 30];

                discHeaders.forEach((header, i) => {
                    doc.text(header, xPos, yPos);
                    xPos += discColWidths[i];
                });

                yPos += 8;

                // Discrepancy data
                doc.setFont('helvetica', 'normal');
                results.discrepancies.forEach(disc => {
                    if (yPos > 270) {
                        doc.addPage();
                        yPos = 30;
                    }

                    xPos = 20;
                    const discRowData = [
                        disc.invoice,
                        disc.state,
                        `$${disc.calculated}`,
                        `$${disc.reported}`,
                        `$${disc.difference}`
                    ];

                    discRowData.forEach((data, i) => {
                        doc.text(data, xPos, yPos);
                        xPos += discColWidths[i];
                    });

                    yPos += 6;
                });
            }

            // Generate filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const filename = `commission_report_${timestamp}.pdf`;

            // Download the PDF
            doc.save(filename);

        } catch (error) {
            console.error('PDF generation failed:', error);
            alert('PDF generation failed. Please try again.');
        } finally {
            // Reset button state
            if (btn) btn.disabled = false;
            if (btnText) btnText.textContent = '📄 Generate PDF Report';
            if (btnLoader) btnLoader.classList.add('hidden');
        }
    }
};

// Commission Processor
const CommissionProcessor = {
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    async process() {
        if (!AppState.currentFile || AppState.isProcessing) return;

        AppState.isProcessing = true;

        try {
            ProgressManager.show();
            ProgressManager.update(5, 'Preparing file upload...');

            await this.delay(200);
            ProgressManager.update(15, 'Validating file format...');

            const formData = new FormData();
            formData.append('excelFile', AppState.currentFile);

            await this.delay(300);
            ProgressManager.update(25, 'Uploading file to server...');

            await this.delay(200);
            ProgressManager.update(35, 'File upload in progress...');

            const response = await fetch('/verify-commission', {
                method: 'POST',
                body: formData
            });

            ProgressManager.update(50, 'Processing Excel sheets...');
            await this.delay(300);

            ProgressManager.update(65, 'Analyzing commission data...');
            await this.delay(200);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            ProgressManager.update(75, 'Calculating rate discrepancies...');
            await this.delay(300);

            const results = await response.json();

            ProgressManager.update(85, 'Generating detailed breakdown...');
            await this.delay(200);

            ProgressManager.update(95, 'Finalizing results...');
            await this.delay(300);

            ProgressManager.update(100, 'Complete!');
            await this.delay(200);

            ProgressManager.hide();
            ResultsManager.show(results);

        } catch (error) {
            console.error('Processing error:', error);
            ProgressManager.hide();
            FileUploadManager.showError(error.message || 'Failed to process commission data');
        } finally {
            AppState.isProcessing = false;

            // Reset verify button
            const verifyBtn = document.getElementById('verify-btn');
            const buttonText = verifyBtn?.querySelector('.button-text');
            const buttonLoader = verifyBtn?.querySelector('.button-loader');

            if (verifyBtn) verifyBtn.disabled = false;
            if (buttonText) buttonText.textContent = 'Verify Commission Data';
            if (buttonLoader) buttonLoader.classList.add('hidden');
        }
    }
};


// Time Display Manager
const TimeManager = {
    init() {
        this.updateTime();
        setInterval(() => this.updateTime(), 1000);
    },

    updateTime() {
        const timeElement = document.getElementById('current-time');
        if (timeElement) {
            const now = new Date();
            timeElement.textContent = now.toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        }
    }
};

// Application Initialization
document.addEventListener('DOMContentLoaded', function() {
    // Initialize all managers
    FileUploadManager.init();
    TimeManager.init();

    // Set up event listeners
    const verifyBtn = document.getElementById('verify-btn');
    if (verifyBtn) {
        verifyBtn.addEventListener('click', CommissionProcessor.process.bind(CommissionProcessor));
    }

    const pdfBtn = document.getElementById('download-pdf-btn');
    if (pdfBtn) {
        pdfBtn.addEventListener('click', PDFGenerator.generateReport.bind(PDFGenerator));
    }


    // Set up verify button state management
    const verifyButton = document.getElementById('verify-btn');
    if (verifyButton) {
        verifyButton.addEventListener('click', function() {
            if (AppState.isProcessing) return;

            const buttonText = this.querySelector('.button-text');
            const buttonLoader = this.querySelector('.button-loader');

            if (buttonText) buttonText.textContent = 'Processing...';
            if (buttonLoader) buttonLoader.classList.remove('hidden');
            this.disabled = true;
        });
    }

    console.log('Commission Verification App initialized');
});