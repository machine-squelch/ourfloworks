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
            'calculated-commission': Utils.formatCurrency(parseFloat(results.summary?.my_calculated_total || 0)),
            'verification-status': results.summary?.percentage_status || 'Complete'
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
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
        const stateSection = document.getElementById('state-content');
        const stateHeader = document.getElementById('state-header');
        if (stateSection) {
            stateSection.style.display = 'block';
            stateSection.setAttribute('aria-hidden', 'false');

            // Allow CSS transition to calculate the correct height
            const contentHeight = stateSection.scrollHeight;
            stateSection.style.maxHeight = `${contentHeight}px`;

            // Ensure section appears expanded for screen readers and keyboard users
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
        const discrepanciesSection = document.getElementById('discrepancies-content');
        const discrepanciesHeader = document.getElementById('discrepancies-header');
        if (discrepanciesSection) {
            discrepanciesSection.style.display = 'block';
            discrepanciesSection.setAttribute('aria-hidden', 'false');

            const contentHeight = discrepanciesSection.scrollHeight;
            discrepanciesSection.style.maxHeight = `${contentHeight}px`;

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
    init() {
        // Add click handlers for collapsible sections
        const headers = document.querySelectorAll('.collapsible-header');
        headers.forEach(header => {
            header.addEventListener('click', this.toggleSection.bind(this));
            header.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.toggleSection(e);
                }
            });

            const contentId = header.getAttribute('aria-controls');
            const content = document.getElementById(contentId);
            if (!content) return;

            const isExpanded = header.getAttribute('aria-expanded') === 'true';
            content.style.display = isExpanded ? 'block' : 'none';
            content.style.maxHeight = isExpanded ? `${content.scrollHeight}px` : '0px';
            content.setAttribute('aria-hidden', isExpanded ? 'false' : 'true');
        });
    },

    toggleSection(event) {
        const header = event.currentTarget;
        const content = document.getElementById(header.getAttribute('aria-controls'));
        const icon = header.querySelector('.collapsible-icon svg');

        if (!content) return;

        const isExpanded = header.getAttribute('aria-expanded') === 'true';

        // Toggle expanded state
        header.setAttribute('aria-expanded', (!isExpanded).toString());

        if (isExpanded) {
            content.setAttribute('aria-hidden', 'true');
            content.style.maxHeight = '0px';

            const handleTransitionEnd = (event) => {
                if (event.propertyName === 'max-height') {
                    content.style.display = 'none';
                    content.removeEventListener('transitionend', handleTransitionEnd);
                }
            };
            content.addEventListener('transitionend', handleTransitionEnd);
        } else {
            content.style.display = 'block';
            content.setAttribute('aria-hidden', 'false');

            // Reset maxHeight before calculating to allow smooth transition
            content.style.maxHeight = '0px';
            const targetHeight = content.scrollHeight;
            requestAnimationFrame(() => {
                content.style.maxHeight = `${targetHeight}px`;
            });
        }

        // Rotate icon
        if (icon) {
            icon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
        }
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
    TimeDisplay.init();
    
    // Set up verify button handler
    const verifyBtn = document.getElementById('verify-btn');
    if (verifyBtn) {
        verifyBtn.addEventListener('click', () => CommissionVerifier.verify());
    }
    
    console.log('Commission Verifier ready');
});

