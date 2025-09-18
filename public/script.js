// Application State Management
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
            this.processFile(file);
        }
    },

    handleDragOver(event) {
        event.preventDefault();
        event.stopPropagation();
        const dropzone = document.getElementById('dropzone');
        dropzone.classList.add('drag-over');
    },

    handleDragLeave(event) {
        event.preventDefault();
        event.stopPropagation();
        const dropzone = document.getElementById('dropzone');
        dropzone.classList.remove('drag-over');
    },

    handleDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        
        const dropzone = document.getElementById('dropzone');
        dropzone.classList.remove('drag-over');
        
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    },

    processFile(file) {
        // Clear any previous errors
        this.clearErrors();

        // Validate file type
        const validExtensions = ['.xlsx', '.xls'];
        const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
        if (!validExtensions.includes(fileExtension)) {
            this.showError('Please select an Excel file (.xlsx or .xls) only.');
            return;
        }

        // Validate file size (50MB limit for Excel files)
        const maxSize = 50 * 1024 * 1024; // 50MB
        if (file.size > maxSize) {
            this.showError('File size must be less than 50MB.');
            return;
        }

        // Store file and update UI
        ReportGenerator.disable();
        AppState.currentFile = file;
        this.showFilePreview(file);
        this.updateVerifyButton();
        
        Utils.announce(`Excel file ${file.name} selected successfully`);
    },

    showFilePreview(file) {
        const preview = document.getElementById('file-preview');
        const fileName = document.getElementById('file-name');
        const fileSize = document.getElementById('file-size');
        const fileStatus = document.getElementById('file-status');

        if (preview && fileName && fileSize && fileStatus) {
            fileName.textContent = file.name;
            fileSize.textContent = Utils.formatFileSize(file.size);
            fileStatus.textContent = 'Ready to verify';
            
            preview.classList.remove('hidden');
        }
    },

    removeFile() {
        AppState.currentFile = null;
        
        const preview = document.getElementById('file-preview');
        const fileInput = document.getElementById('file-input');
        
        if (preview) preview.classList.add('hidden');
        if (fileInput) fileInput.value = '';

        this.updateVerifyButton();
        this.clearErrors();

        ReportGenerator.disable();

        Utils.announce('File removed');
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

// Results Manager - FIXED TO MATCH SERVER RESPONSE
const ResultsManager = {
    show(results) {
        console.log('Received results:', results);
        AppState.results = results;
        ReportGenerator.enable(results);

        this.updateSummaryCards(results);
        this.updateCommissionBreakdown(results);
        this.updateStateAnalysis(results.state_analysis);
        this.updateDiscrepancies(results.discrepancies);
        
        const section = document.getElementById('results-section');
        if (section) {
            section.classList.remove('hidden');
            Utils.scrollToElement('results-section');
        }
        
        Utils.announce('Verification results are now available');
    },

    updateSummaryCards(results) {
        // Calculate total transactions from state analysis
        const totalTransactions = results.state_analysis ? 
            results.state_analysis.reduce((sum, state) => sum + parseInt(state.transactions || 0), 0) : 0;
        
        const totalStates = results.state_analysis ? results.state_analysis.length : 0;
        
        const elements = {
            'total-transactions': totalTransactions,
            'total-states': totalStates,
            'calculated-commission': Utils.formatCurrency(parseFloat(results.summary?.my_calculated_total || 0))
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });

        const statusElement = document.getElementById('verification-status');
        if (statusElement) {
            const rawStatus = results.summary?.percentage_status ?? 'Complete';
            const statusText = typeof rawStatus === 'string' ? rawStatus : String(rawStatus);
            statusElement.textContent = statusText;
            statusElement.classList.toggle('status-error', statusText.toUpperCase().includes('ERROR'));
        }
    },

    updateCommissionBreakdown(results) {
        // Calculate breakdown from state analysis
        let repeatCommission = 0;
        let newProductCommission = 0;
        let incentiveCommission = 0;
        let stateBonuses = 0;
        
        if (results.state_analysis) {
            results.state_analysis.forEach(state => {
                stateBonuses += parseFloat(state.bonus || 0);
            });
        }
        
        // Use summary data for commission totals
        const totalCommission = parseFloat(results.summary?.my_calculated_commission || 0);
        const totalBonuses = parseFloat(results.summary?.my_calculated_bonuses || 0);
        
        const elements = {
            'repeat-commission': Utils.formatCurrency(totalCommission * 0.4), // Approximate split
            'new-commission': Utils.formatCurrency(totalCommission * 0.6), // Approximate split
            'incentive-commission': Utils.formatCurrency(0), // Not separately tracked
            'state-bonuses': Utils.formatCurrency(totalBonuses)
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
    },

    updateStateAnalysis(stateAnalysis) {
        if (!stateAnalysis || !Array.isArray(stateAnalysis)) return;

        const tableBody = document.querySelector('#state-table tbody');
        if (!tableBody) return;
        
        // Clear existing rows
        tableBody.innerHTML = '';
        
        // Add state data rows
        stateAnalysis.forEach(state => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${state.state || 'N/A'}</td>
                <td>${Utils.formatCurrency(parseFloat(state.total_sales || 0))}</td>
                <td>${state.tier || 'N/A'}</td>
                <td>${Utils.formatCurrency(parseFloat(state.my_calculated_commission || 0))}</td>
                <td>${Utils.formatCurrency(parseFloat(state.bonus || 0))}</td>
                <td>${state.transactions || 0}</td>
            `;
            tableBody.appendChild(row);
        });

        // Show the state analysis section
        if (!CollapsibleManager.expandSection('state-header')) {
            const stateSection = document.getElementById('state-content');
            if (stateSection) {
                stateSection.style.display = 'block';
                stateSection.style.maxHeight = `${stateSection.scrollHeight}px`;
                stateSection.setAttribute('aria-hidden', 'false');
            }
            // Ensure section appears expanded for screen readers and keyboard users
            const stateHeader = document.getElementById('state-header');
            if (stateHeader) {
                stateHeader.setAttribute('aria-expanded', 'true');
            }
        }
    },

    updateDiscrepancies(discrepancies) {
        if (!discrepancies || !Array.isArray(discrepancies)) {
            discrepancies = [];
        }
        
        // Update discrepancy count
        const countElement = document.getElementById('discrepancy-count');
        if (countElement) {
            countElement.textContent = discrepancies.length;
        }
        
        const tableBody = document.querySelector('#discrepancies-table tbody');
        if (!tableBody) return;
        
        // Clear existing rows
        tableBody.innerHTML = '';
        
        if (discrepancies.length === 0) {
            // Show "no discrepancies" message
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="5" style="text-align: center; color: #4CAF50; font-weight: bold;">
                    ✅ No discrepancies found - all calculations are accurate!
                </td>
            `;
            tableBody.appendChild(row);
        } else {
            // Add discrepancy rows
            discrepancies.forEach(discrepancy => {
                const row = document.createElement('tr');
                const difference = parseFloat(discrepancy.difference || 0);
                const differenceClass = difference > 0 ? 'positive' : difference < 0 ? 'negative' : 'neutral';
                
                row.innerHTML = `
                    <td>${discrepancy.invoice || 'N/A'}</td>
                    <td>${discrepancy.customer || 'N/A'}</td>
                    <td>${Utils.formatCurrency(parseFloat(discrepancy.my_calculated || 0))}</td>
                    <td>${Utils.formatCurrency(parseFloat(discrepancy.detail_reported || 0))}</td>
                    <td class="${differenceClass}">${Utils.formatCurrency(difference)}</td>
                `;
                tableBody.appendChild(row);
            });
        }

        // Show the discrepancies section
        if (!CollapsibleManager.expandSection('discrepancies-header')) {
            const discrepanciesSection = document.getElementById('discrepancies-content');
            if (discrepanciesSection) {
                discrepanciesSection.style.display = 'block';
                discrepanciesSection.style.maxHeight = `${discrepanciesSection.scrollHeight}px`;
                discrepanciesSection.setAttribute('aria-hidden', 'false');
            }

            const discrepanciesHeader = document.getElementById('discrepancies-header');
            if (discrepanciesHeader) {
                discrepanciesHeader.setAttribute('aria-expanded', 'true');
            }
        }
    }
};

// Commission Verification Handler
const CommissionVerifier = {
    async verify() {
        if (!AppState.currentFile) {
            FileUploadManager.showError('Please select an Excel file');
            return;
        }

        if (AppState.isProcessing) return;

        AppState.isProcessing = true;
        this.updateVerifyButton(true);
        
        try {
            ProgressManager.show();
            ProgressManager.update(10, 'Preparing file upload...');

            const formData = new FormData();
            formData.append('excelFile', AppState.currentFile);

            ProgressManager.update(30, 'Uploading and processing Excel data...');

            // Add timeout and progress simulation for long processing
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

            // Simulate progress during long processing
            let progressPercent = 30;
            const progressInterval = setInterval(() => {
                if (progressPercent < 65) {
                    progressPercent += 5;
                    ProgressManager.update(progressPercent, 'Processing Excel file... This may take up to 2 minutes for large files.');
                }
            }, 5000); // Update every 5 seconds

            const response = await fetch('/verify-commission', {
                method: 'POST',
                body: formData,
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            clearInterval(progressInterval);
            ProgressManager.update(70, 'Processing commission calculations...');

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Server error' }));
                throw new Error(errorData.error || `Server returned ${response.status}: ${response.statusText}`);
            }

            const results = await response.json();
            console.log('Server response:', results);
            
            ProgressManager.update(100, 'Verification complete!');
            
            setTimeout(() => {
                ProgressManager.hide();
                ResultsManager.show(results);
            }, 1000);

        } catch (error) {
            console.error('Verification error:', error);
            ProgressManager.hide();
            
            let errorMessage = 'Failed to verify commission data';
            if (error.name === 'AbortError') {
                errorMessage = 'Processing timeout - file may be too large or complex. Please try with a smaller file.';
            } else if (error.message.includes('Failed to fetch')) {
                errorMessage = 'Network error - please check your connection and try again.';
            } else {
                errorMessage = error.message || errorMessage;
            }
            
            FileUploadManager.showError(errorMessage);
        } finally {
            AppState.isProcessing = false;
            this.updateVerifyButton(false);
        }
    },

    updateVerifyButton(isProcessing) {
        const button = document.getElementById('verify-btn');
        const buttonText = button?.querySelector('.button-text');
        const buttonLoader = button?.querySelector('.button-loader');

        if (!button || !buttonText || !buttonLoader) return;

        if (isProcessing) {
            button.disabled = true;
            buttonText.textContent = 'Processing...';
            buttonLoader.classList.remove('hidden');
        } else {
            FileUploadManager.updateVerifyButton();
            buttonText.textContent = 'Verify Commission Data';
            buttonLoader.classList.add('hidden');
        }
    }
};

// Collapsible sections handler
const CollapsibleManager = {
    sections: new Map(),

    init() {
        const headers = document.querySelectorAll('.collapsible-header');
        headers.forEach(header => {
            const contentId = header.getAttribute('aria-controls');
            const content = document.getElementById(contentId);
            if (!content) return;

            this.sections.set(header.id, { header, content });

            header.addEventListener('click', (event) => {
                event.preventDefault();
                this.toggle(header.id);
            });

            header.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.toggle(header.id);
                }
            });

            const isExpanded = header.getAttribute('aria-expanded') === 'true';
            this.applyState(header, content, isExpanded, false);
        });
    },

    toggle(headerId) {
        const entry = this.sections.get(headerId);
        if (!entry) return;

        const shouldExpand = entry.header.getAttribute('aria-expanded') !== 'true';
        this.applyState(entry.header, entry.content, shouldExpand, true);
    },

    expandSection(headerId, options = {}) {
        const entry = this.sections.get(headerId);
        if (!entry) return false;

        const { animate = false } = options;
        this.applyState(entry.header, entry.content, true, animate);
        return true;
    },

    collapseSection(headerId, options = {}) {
        const entry = this.sections.get(headerId);
        if (!entry) return false;

        const { animate = false } = options;
        this.applyState(entry.header, entry.content, false, animate);
        return true;
    },

    applyState(header, content, expand, animate) {
        if (!header || !content) return;

        if (content._collapseListener) {
            content.removeEventListener('transitionend', content._collapseListener);
            content._collapseListener = null;
        }

        header.setAttribute('aria-expanded', expand.toString());
        const icon = header.querySelector('.collapsible-icon svg'); 
        if (icon) {
            icon.style.transform = expand ? 'rotate(180deg)' : 'rotate(0deg)';
        }

        if (expand) {
            content.setAttribute('aria-hidden', 'false');
            content.style.display = 'block';

            const setHeight = () => {
                const targetHeight = content.scrollHeight;
                content.style.maxHeight = `${targetHeight}px`;
            };

            if (animate) {
                content.style.maxHeight = '0px';
                requestAnimationFrame(setHeight);
            } else {
                setHeight();
            }
        } else {
            content.setAttribute('aria-hidden', 'true');

            const finalizeCollapse = () => {
                if (header.getAttribute('aria-expanded') === 'false') {
                    content.style.display = 'none';
                    content.style.maxHeight = '0px';
                }

                if (content._collapseListener) {
                    content.removeEventListener('transitionend', content._collapseListener);
                    content._collapseListener = null;
                }
            };

            if (animate) {
                const startHeight = content.scrollHeight;
                if (startHeight === 0) {
                    finalizeCollapse();
                    return;
                }

                content.style.maxHeight = `${startHeight}px`;
                requestAnimationFrame(() => {
                    content.style.maxHeight = '0px';
                });

                const handleTransitionEnd = (event) => {
                    if (event.propertyName !== 'max-height') return;
                    finalizeCollapse();
                };

                content._collapseListener = handleTransitionEnd;
                content.addEventListener('transitionend', handleTransitionEnd);
            } else {
                finalizeCollapse();
            }
        }
    }
};

// Detailed PDF report generator
const ReportGenerator = {
    button: null,
    libraryPromise: null,
    lastResults: null,
    margin: 48,
    lineHeight: 14,
    maxDiscrepancyEntries: 15,
    logoPath: '/dllogoonly.png',
    logoPromise: null,
    logoDataUrl: null,
    logoWidth: 0,
    logoHeight: 0,
    theme: {
        primary: [16, 55, 114],
        secondary: [56, 136, 216],
        accent: [236, 244, 255],
        text: [45, 45, 45],
        muted: [110, 120, 140],
        error: [220, 53, 69]
    },

    init() {
        this.button = document.getElementById('download-btn');
        if (!this.button) return;

        this.disable();
        this.button.addEventListener('click', async (event) => {
            event.preventDefault();

            const results = AppState.results || this.lastResults;
            if (!results) {
                alert('Upload and verify a commission file before downloading the report.');
                return;
            }

            this.button.setAttribute('aria-busy', 'true');
            this.button.classList.add('is-generating');

            try {
                await this.download(results);
            } catch (error) {
                console.error('Report generation failed:', error);
                alert('Unable to generate the PDF report. Please try again.');
            } finally {
                this.button.classList.remove('is-generating');
                this.button.removeAttribute('aria-busy');
            }
        });
    },

    enable(results) {
        if (!this.button) return;
        this.lastResults = results || AppState.results;
        this.button.disabled = false;
        this.button.classList.remove('disabled');
        this.button.setAttribute('aria-disabled', 'false');
        this.button.title = 'Download a PDF summary of the verification results';
    },

    disable() {
        if (!this.button) return;
        this.lastResults = null;
        this.button.disabled = true;
        this.button.classList.add('disabled');
        this.button.setAttribute('aria-disabled', 'true');
        this.button.title = 'Run a verification to enable report downloads';
    },

    async download(results) {
        if (!results) {
            throw new Error('No verification results available for report generation');
        }

        const jsPDFConstructor = await this.ensureLibrary();
        const doc = new jsPDFConstructor({
            orientation: 'portrait',
            unit: 'pt',
            format: 'letter'
        });

        const margin = this.margin;
        const pageWidth = doc.internal.pageSize.getWidth();
        const contentWidth = pageWidth - margin * 2;
        const { primary, secondary, accent, text } = this.theme;

        let branding = null;
        try {
            branding = await this.loadLogo();
        } catch (logoError) {
            console.warn('Report logo unavailable:', logoError);
        }

        const headerHeight = 110;
        doc.setFillColor(primary[0], primary[1], primary[2]);
        doc.rect(0, 0, pageWidth, headerHeight, 'F');

        doc.setFillColor(secondary[0], secondary[1], secondary[2]);
        doc.rect(0, headerHeight - 18, pageWidth, 18, 'F');

        if (branding?.dataUrl) {
            const ratio = branding.width && branding.height ? branding.height / branding.width : null;
            const maxWidth = 132;
            const maxHeight = headerHeight - 36;
            let logoWidth = Math.min(maxWidth, branding.width ? branding.width * 0.4 : maxWidth);
            if (!Number.isFinite(logoWidth) || logoWidth <= 0) {
                logoWidth = maxWidth;
            }
            let logoHeight = ratio && Number.isFinite(ratio) && ratio > 0 ? logoWidth * ratio : maxHeight * 0.6;
            if (!Number.isFinite(logoHeight) || logoHeight <= 0) {
                logoHeight = maxHeight * 0.6;
            }
            if (logoHeight > maxHeight && ratio && Number.isFinite(ratio) && ratio > 0) {
                logoHeight = maxHeight;
                logoWidth = Math.min(maxWidth, logoHeight / ratio);
            }

            const logoX = Math.max(margin, pageWidth - margin - logoWidth);
            const logoY = Math.max(16, (headerHeight - logoHeight) / 2);

            try {
                doc.addImage(branding.dataUrl, 'PNG', logoX, logoY, logoWidth, logoHeight, undefined, 'FAST');
            } catch (imageError) {
                console.warn('Unable to embed report logo:', imageError);
            }
        }

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(26);
        doc.text('Commission Verification Report', margin, headerHeight / 2 - 6);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(13);
        doc.text('Comprehensive commission audit summary', margin, headerHeight / 2 + 18);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.setTextColor(text[0], text[1], text[2]);
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);

        let y = headerHeight + 28;

        const headerLines = [
            `Generated: ${new Date().toLocaleString()}`,
            AppState.currentFile ? `Source File: ${AppState.currentFile.name}` : null,
            `Discrepancies Identified: ${(Array.isArray(results.discrepancies) ? results.discrepancies.length : 0).toLocaleString('en-US')}`
        ].filter(Boolean);

        if (headerLines.length) {
            const headerWrapped = [];
            headerLines.forEach(line => {
                const wrapped = this.wrapText(doc, line, contentWidth);
                headerWrapped.push(...wrapped);
            });

            const infoPadding = 12;
            const infoHeight = headerWrapped.length * this.lineHeight + infoPadding * 2;

            y = this.ensureSpace(doc, y, margin, infoHeight);

            const infoTop = y;
            doc.setFillColor(accent[0], accent[1], accent[2]);
            doc.setDrawColor(secondary[0], secondary[1], secondary[2]);
            doc.roundedRect(margin - 8, infoTop, contentWidth + 16, infoHeight, 10, 10, 'FD');

            let infoY = infoTop + infoPadding + this.lineHeight - 2;
            doc.setTextColor(primary[0], primary[1], primary[2]);
            headerWrapped.forEach(line => {
                doc.text(line, margin, infoY);
                infoY += this.lineHeight;
            });

            doc.setDrawColor(200, 200, 200);
            doc.setTextColor(text[0], text[1], text[2]);
            y = infoTop + infoHeight + 20;
        }

        y = this.addSummary(doc, results, margin, contentWidth, y);
        y = this.addStateHighlights(doc, results, margin, contentWidth, y);
        y = this.addDiscrepancies(doc, results, margin, contentWidth, y);

        doc.save(`commission-report-${this.formatDateForFilename(new Date())}.pdf`);
        Utils.announce('Detailed PDF report downloaded');
    },

    async ensureLibrary() {
        if (window.jspdf?.jsPDF) {
            return window.jspdf.jsPDF;
        }

        if (!this.libraryPromise) {
            this.libraryPromise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                script.async = true;
                script.onload = () => {
                    if (window.jspdf?.jsPDF) {
                        resolve(window.jspdf.jsPDF);
                    } else {
                        reject(new Error('PDF library loaded but jsPDF is unavailable'));
                    }
                };
                script.onerror = () => reject(new Error('Failed to load PDF library'));
                document.head.appendChild(script);
            });
        }

        try {
            const jsPDFConstructor = await this.libraryPromise;
            if (!jsPDFConstructor) {
                throw new Error('PDF library unavailable after loading');
            }
            return jsPDFConstructor;
        } catch (error) {
            this.libraryPromise = null;
            throw error;
        }
    },

    async loadLogo() {
        if (this.logoDataUrl && this.logoWidth && this.logoHeight) {
            return {
                dataUrl: this.logoDataUrl,
                width: this.logoWidth,
                height: this.logoHeight
            };
        }

        if (!this.logoPromise) {
            this.logoPromise = new Promise((resolve, reject) => {
                const img = new Image();
                img.decoding = 'async';
                img.crossOrigin = 'anonymous';

                img.onload = () => {
                    try {
                        const width = img.naturalWidth || img.width;
                        const height = img.naturalHeight || img.height;

                        if (!width || !height) {
                            throw new Error('Logo dimensions unavailable');
                        }

                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const context = canvas.getContext('2d');
                        context.drawImage(img, 0, 0);
                        const dataUrl = canvas.toDataURL('image/png');

                        this.logoDataUrl = dataUrl;
                        this.logoWidth = width;
                        this.logoHeight = height;

                        resolve({ dataUrl, width, height });
                    } catch (error) {
                        reject(error);
                    }
                };

                img.onerror = () => reject(new Error('Logo image failed to load'));

                try {
                    img.src = new URL(this.logoPath, window.location.href).href;
                } catch (error) {
                    reject(error);
                }
            }).catch(error => {
                this.logoPromise = null;
                throw error;
            });
        }

        return this.logoPromise;
    },

    addSummary(doc, results, margin, width, y) {
        y = this.addSectionTitle(doc, 'Summary', margin, y);

        const summary = results.summary || {};
        const totalTransactions = Array.isArray(results.state_analysis)
            ? results.state_analysis.reduce((sum, state) => sum + (this.parseInteger(state.transactions) ?? 0), 0)
            : 0;
        const totalStates = Array.isArray(results.state_analysis) ? results.state_analysis.length : 0;
        const discrepancyCount = typeof summary.total_discrepancies === 'number'
            ? summary.total_discrepancies
            : (Array.isArray(results.discrepancies) ? results.discrepancies.length : 0);

        const summaryItems = [
            { label: 'Total Transactions Reviewed', value: totalTransactions.toLocaleString('en-US') },
            { label: 'States Included', value: totalStates.toLocaleString('en-US') },
            { label: 'Calculated Commission', value: this.formatCurrencyValue(summary.my_calculated_commission) },
            { label: 'Calculated Bonuses', value: this.formatCurrencyValue(summary.my_calculated_bonuses) },
            { label: 'Calculated Total', value: this.formatCurrencyValue(summary.my_calculated_total) },
            { label: 'Reported Detail Total', value: this.formatCurrencyValue(summary.detail_reported_total) },
            { label: 'Actual Payment (Summary)', value: this.formatCurrencyValue(summary.actual_payment) },
            { label: 'Payment Difference vs Actual', value: this.formatCurrencyValue(summary.payment_difference), color: this.shouldHighlightDifference(summary.payment_difference) ? 'error' : 'default' },
            { label: 'Payment Status', value: summary.payment_status || 'Unknown', color: summary.payment_status && summary.payment_status !== 'CORRECT' ? 'error' : 'default' },
            { label: 'Verification Status', value: summary.percentage_status || 'Complete', color: this.isErrorStatus(summary.percentage_status) ? 'error' : 'default' },
            { label: 'Discrepancies Found', value: discrepancyCount.toLocaleString('en-US'), color: discrepancyCount > 0 ? 'error' : 'default' }
        ];

        const labelWidth = Math.min(240, width * 0.45);
        const valueWidth = Math.max(120, width - labelWidth);
        const { primary, secondary, accent, text, error } = this.theme;

        summaryItems.forEach(item => {
            const valueText = String(item.value ?? '');
            const wrappedValue = this.wrapText(doc, valueText, valueWidth);
            const blockHeight = Math.max(this.lineHeight + 10, wrappedValue.length * this.lineHeight + 10);
            y = this.ensureSpace(doc, y, margin, blockHeight);

            const baseline = y;
            const blockTop = baseline - this.lineHeight + 4;

            doc.setFillColor(accent[0], accent[1], accent[2]);
            doc.setDrawColor(secondary[0], secondary[1], secondary[2]);
            doc.roundedRect(margin - 8, blockTop, width + 16, blockHeight, 8, 8, 'FD');

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(primary[0], primary[1], primary[2]);
            doc.text(item.label, margin, baseline);

            const valuePalette = item.color === 'error' ? error : text;
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(valuePalette[0], valuePalette[1], valuePalette[2]);
            wrappedValue.forEach((line, index) => {
                doc.text(line, margin + labelWidth, baseline + (index * this.lineHeight));
            });

            const blockBottom = blockTop + blockHeight;
            y = blockBottom + 8;
            doc.setTextColor(text[0], text[1], text[2]);
        });

        doc.setDrawColor(200, 200, 200);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(text[0], text[1], text[2]);
        return y;
    },

    addStateHighlights(doc, results, margin, width, y) {
        const states = Array.isArray(results.state_analysis) ? results.state_analysis : [];
        if (!states.length) {
            return y;
        }

        const topStates = states
            .map(state => ({
                data: state,
                difference: this.parseNumber(state.commission_difference) ?? 0,
                discrepancies: this.parseInteger(state.discrepancies_count) ?? 0
            }))
            .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
            .slice(0, Math.min(5, states.length));

        if (!topStates.length) {
            return y;
        }

        const { primary, secondary, accent, text, muted, error } = this.theme;

        y = this.addSectionTitle(doc, 'State Highlights', margin, y);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(muted[0], muted[1], muted[2]);
        doc.text('Top states ranked by commission variance', margin, y);
        y += this.lineHeight + 6;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(text[0], text[1], text[2]);

        const blockPadding = 10;

        topStates.forEach(entry => {
            const state = entry.data;
            const header = `${state.state || 'N/A'} — ${this.formatCurrencyValue(state.total_sales)} in Sales`;
            const headerLines = this.wrapText(doc, header, width);
            const detailEntries = [
                { text: `Tier ${state.tier || 'N/A'} • Transactions: ${this.formatCount(state.transactions)}`, color: 'default' },
                { text: `Calculated vs Reported: ${this.formatCurrencyValue(state.my_calculated_commission)} vs ${this.formatCurrencyValue(state.detail_reported_commission)}`, color: 'default' },
                { text: `Bonuses: ${this.formatCurrencyValue(state.bonus)}`, color: 'default' },
                { text: `Commission Difference: ${this.formatCurrencyValue(state.commission_difference)}`, color: Math.abs(entry.difference) > 0.01 ? 'error' : 'default' },
                { text: `Discrepancies Logged: ${this.formatCount(state.discrepancies_count)}`, color: entry.discrepancies > 0 ? 'error' : 'default' }
            ];

            detailEntries.forEach(item => {
                item.lines = this.wrapText(doc, item.text, width);
            });

            const headerHeight = headerLines.length * this.lineHeight;
            const detailsHeight = detailEntries.reduce((sum, item) => sum + item.lines.length * this.lineHeight, 0);
            const blockHeight = headerHeight + detailsHeight + blockPadding * 2;

            y = this.ensureSpace(doc, y, margin, blockHeight);

            const blockTop = y;
            doc.setFillColor(accent[0], accent[1], accent[2]);
            doc.setDrawColor(secondary[0], secondary[1], secondary[2]);
            doc.roundedRect(margin - 8, blockTop, width + 16, blockHeight, 8, 8, 'FD');
            doc.setFillColor(secondary[0], secondary[1], secondary[2]);
            doc.rect(margin - 8, blockTop, 6, blockHeight, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(primary[0], primary[1], primary[2]);
            let lineY = blockTop + blockPadding + this.lineHeight;
            headerLines.forEach((line, index) => {
                doc.text(line, margin, lineY + (index * this.lineHeight));
            });

            let contentY = lineY + headerHeight - this.lineHeight;
            doc.setFont('helvetica', 'normal');

            detailEntries.forEach(item => {
                const palette = item.color === 'error' ? error : text;
                item.lines.forEach(line => {
                    contentY += this.lineHeight;
                    doc.setTextColor(palette[0], palette[1], palette[2]);
                    doc.text(line, margin, contentY);
                });
            });

            doc.setTextColor(text[0], text[1], text[2]);
            y = blockTop + blockHeight + 14;
        });

        doc.setDrawColor(200, 200, 200);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(text[0], text[1], text[2]);
        return y;
    },

    addDiscrepancies(doc, results, margin, width, y) {
        const discrepancies = Array.isArray(results.discrepancies) ? results.discrepancies : [];
        const { primary, secondary, accent, text, muted, error } = this.theme;

        y = this.addSectionTitle(doc, 'Detailed Discrepancies', margin, y);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(muted[0], muted[1], muted[2]);
        doc.text('Each variance references the original Excel cell for rapid manager review.', margin, y);
        y += this.lineHeight + 6;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(text[0], text[1], text[2]);

        const blockPadding = 10;

        if (!discrepancies.length) {
            const message = 'No discrepancies were detected — reported and calculated totals align.';
            const messageLines = this.wrapText(doc, message, width);
            const blockHeight = messageLines.length * this.lineHeight + blockPadding * 2;

            y = this.ensureSpace(doc, y, margin, blockHeight);

            const blockTop = y;
            doc.setFillColor(accent[0], accent[1], accent[2]);
            doc.setDrawColor(secondary[0], secondary[1], secondary[2]);
            doc.roundedRect(margin - 8, blockTop, width + 16, blockHeight, 8, 8, 'FD');

            let lineY = blockTop + blockPadding + this.lineHeight - 2;
            doc.setTextColor(primary[0], primary[1], primary[2]);
            messageLines.forEach(line => {
                doc.text(line, margin, lineY);
                lineY += this.lineHeight;
            });

            doc.setDrawColor(200, 200, 200);
            doc.setTextColor(text[0], text[1], text[2]);
            return blockTop + blockHeight + 8;
        }

        discrepancies.slice(0, this.maxDiscrepancyEntries).forEach((discrepancy, index) => {
            const header = `${index + 1}. Invoice ${discrepancy.invoice || 'N/A'} — ${discrepancy.customer || 'Unknown State'}`;
            const headerLines = this.wrapText(doc, header, width);
            const commissionType = this.formatCommissionType(discrepancy.commission_type);
            const diffNumber = this.parseNumber(discrepancy.difference) ?? 0;

            const detailEntries = [
                { text: `Sales Amount: ${this.formatCurrencyValue(discrepancy.sales_amount)} (${commissionType})`, color: 'default' },
                { text: `Calculated vs Reported: ${this.formatCurrencyValue(discrepancy.my_calculated)} vs ${this.formatCurrencyValue(discrepancy.detail_reported)}`, color: 'default' },
                { text: `Difference: ${this.formatCurrencyValue(discrepancy.difference)} (${discrepancy.status || 'Status Unknown'})`, color: Math.abs(diffNumber) > 0.01 ? 'error' : 'default' },
                { text: `Excel Reference: ${this.formatSheetReference(discrepancy)}`, color: 'default' }
            ];

            detailEntries.forEach(item => {
                item.lines = this.wrapText(doc, item.text, width);
            });

            const headerHeight = headerLines.length * this.lineHeight;
            const detailsHeight = detailEntries.reduce((sum, item) => sum + item.lines.length * this.lineHeight, 0);
            const blockHeight = headerHeight + detailsHeight + blockPadding * 2;

            y = this.ensureSpace(doc, y, margin, blockHeight);

            const blockTop = y;
            doc.setFillColor(accent[0], accent[1], accent[2]);
            doc.setDrawColor(secondary[0], secondary[1], secondary[2]);
            doc.roundedRect(margin - 8, blockTop, width + 16, blockHeight, 8, 8, 'FD');
            doc.setFillColor(secondary[0], secondary[1], secondary[2]);
            doc.rect(margin - 8, blockTop, 6, blockHeight, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(primary[0], primary[1], primary[2]);
            let lineY = blockTop + blockPadding + this.lineHeight;
            headerLines.forEach((line, lineIndex) => {
                doc.text(line, margin, lineY + (lineIndex * this.lineHeight));
            });

            let contentY = lineY + headerHeight - this.lineHeight;
            doc.setFont('helvetica', 'normal');

            detailEntries.forEach(item => {
                const palette = item.color === 'error' ? error : text;
                item.lines.forEach(line => {
                    contentY += this.lineHeight;
                    doc.setTextColor(palette[0], palette[1], palette[2]);
                    doc.text(line, margin, contentY);
                });
            });

            doc.setTextColor(text[0], text[1], text[2]);
            y = blockTop + blockHeight + 18;
        });

        if (discrepancies.length > this.maxDiscrepancyEntries) {
            const remaining = discrepancies.length - this.maxDiscrepancyEntries;
            const notice = `+${remaining} additional discrepancies not shown in this summary.`;
            const noticeLines = this.wrapText(doc, notice, width);
            const requiredHeight = noticeLines.length * this.lineHeight + 6;
            y = this.ensureSpace(doc, y, margin, requiredHeight);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(muted[0], muted[1], muted[2]);
            noticeLines.forEach((line, idx) => {
                doc.text(line, margin, y + (idx * this.lineHeight));
            });
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(text[0], text[1], text[2]);
            y += noticeLines.length * this.lineHeight + 4;
        }

        doc.setDrawColor(200, 200, 200);
        doc.setTextColor(text[0], text[1], text[2]);
        return y;
    },

    addSectionTitle(doc, title, margin, y) {
        const { primary, secondary, accent, text } = this.theme;
        const pageWidth = doc.internal.pageSize.getWidth();
        const contentWidth = pageWidth - margin * 2;
        const blockHeight = this.lineHeight + 14;

        y = this.ensureSpace(doc, y, margin, blockHeight + 6);

        const blockTop = y;
        doc.setFillColor(accent[0], accent[1], accent[2]);
        doc.setDrawColor(secondary[0], secondary[1], secondary[2]);
        doc.roundedRect(margin - 8, blockTop, contentWidth + 16, blockHeight, 8, 8, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(primary[0], primary[1], primary[2]);
        const textBaseline = blockTop + blockHeight - 8;
        doc.text(title, margin, textBaseline);

        const nextY = blockTop + blockHeight + 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.setTextColor(text[0], text[1], text[2]);
        doc.setDrawColor(200, 200, 200);
        return nextY;
    },

    ensureSpace(doc, y, margin, required = 0) {
        const pageHeight = doc.internal.pageSize.getHeight();
        if (y + required > pageHeight - margin) {
            doc.addPage();
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(12);
            return margin;
        }
        return y;
    },

    wrapText(doc, text, width) {
        const value = text ?? '';
        if (!width || width <= 0) {
            return [String(value)];
        }
        return doc.splitTextToSize(String(value), width);
    },

    parseNumber(value) {
        if (typeof value === 'number') {
            return Number.isFinite(value) ? value : null;
        }
        if (typeof value === 'string') {
            const cleaned = value.replace(/[^0-9.-]+/g, '');
            if (!cleaned) return null;
            const parsed = parseFloat(cleaned);
            return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
    },

    parseInteger(value) {
        if (typeof value === 'number') {
            return Number.isFinite(value) ? Math.round(value) : null;
        }
        if (typeof value === 'string') {
            const cleaned = value.replace(/[^0-9-]+/g, '');
            if (!cleaned) return null;
            const parsed = parseInt(cleaned, 10);
            return Number.isNaN(parsed) ? null : parsed;
        }
        return null;
    },

    formatCount(value) {
        const num = this.parseInteger(value);
        return num === null ? '0' : num.toLocaleString('en-US');
    },

    formatCurrencyValue(value) {
        const num = this.parseNumber(value);
        return num === null ? 'N/A' : Utils.formatCurrency(num);
    },

    shouldHighlightDifference(value) {
        const num = this.parseNumber(value);
        return num !== null && Math.abs(num) > 0.01;
    },

    isErrorStatus(status) {
        return typeof status === 'string' && status.toUpperCase().includes('ERROR');
    },

    formatCommissionType(type) {
        if (!type) return 'Commission';
        const normalised = type.replace(/_/g, ' ');
        return normalised.replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    },

    formatSheetReference(discrepancy) {
        if (!discrepancy) return 'DETAIL!N/A';
        const sheet = discrepancy.sheet_name || 'DETAIL';
        const cell = discrepancy.cell_reference || 'N/A';
        const rowNumber = this.parseInteger(discrepancy.row_number);
        const rowLabel = rowNumber === null ? 'Row N/A' : `Row ${rowNumber}`;
        return `${sheet}!${cell} (${rowLabel})`;
    },

    formatDateForFilename(date) {
        const pad = (num) => String(num).padStart(2, '0');
        return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
    }
};

// Time Display
const TimeDisplay = {
    init() {
        this.updateTime();
        setInterval(() => this.updateTime(), 1000);
    },

    updateTime() {
        const timeElement = document.getElementById('current-time');
        if (timeElement) {
            const now = new Date();
            const timeString = now.toLocaleTimeString('en-US', { 
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            timeElement.textContent = timeString;
        }
    }
};

// Application Initialization
document.addEventListener('DOMContentLoaded', function() {
    console.log('Commission Verifier initializing...');
    
    // Initialize all managers
    FileUploadManager.init();
    CollapsibleManager.init();
    ReportGenerator.init();
    TimeDisplay.init();
    
    // Set up verify button handler
    const verifyBtn = document.getElementById('verify-btn');
    if (verifyBtn) {
        verifyBtn.addEventListener('click', () => CommissionVerifier.verify());
    }
    
    console.log('Commission Verifier ready');
});

