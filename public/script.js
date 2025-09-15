// Commission Verification App - Optimized for Performance
const AppState = {
    currentFile: null,
    isProcessing: false,
    results: null
};

// Performance optimizations
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
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
        const fileInput = document.getElementById('csv-file');
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
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
            this.showError('Please select an Excel file (.xlsx or .xls) only.');
            return;
        }

        // Validate file size (50MB limit)
        const maxSize = 50 * 1024 * 1024; // 50MB
        if (file.size > maxSize) {
            this.showError('File size must be less than 50MB.');
            return;
        }

        // Store file and update UI
        AppState.currentFile = file;
        this.showFilePreview(file);
        this.updateVerifyButton();
        
        Utils.announce(`File ${file.name} selected successfully`);
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
        const fileInput = document.getElementById('csv-file');
        
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

// Results Manager
const ResultsManager = {
    show(results) {
        AppState.results = results;
        
        this.updateSummaryCards(results.summary);
        this.updateCommissionBreakdown(results.commission_breakdown);
        this.updateStateAnalysis(results.state_analysis);
        this.updateDiscrepancies(results.discrepancies);
        
        const section = document.getElementById('results-section');
        if (section) {
            section.classList.remove('hidden');
            Utils.scrollToElement('results-section');
        }
        
        // Enable download button
        const downloadBtn = document.getElementById('download-btn');
        if (downloadBtn) {
            downloadBtn.disabled = false;
        }
        
        Utils.announce('Verification results are now available');
    },

    updateSummaryCards(summary) {
        const elements = {
            'total-transactions': summary.total_transactions,
            'total-states': summary.total_states,
            'calculated-commission': Utils.formatCurrency(summary.total_calculated_commission),
            'reported-commission': Utils.formatCurrency(summary.total_reported_commission),
            'state-bonuses': Utils.formatCurrency(summary.total_state_bonuses || 0)
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
        
        // Update verification status based on difference
        const statusElement = document.getElementById('verification-status');
        if (statusElement) {
            const difference = parseFloat(summary.difference || 0);
            if (Math.abs(difference) < 0.01) {
                statusElement.textContent = 'VERIFIED';
                statusElement.className = 'card-value status-verified';
            } else {
                statusElement.textContent = 'DISCREPANCY';
                statusElement.className = 'card-value status-discrepancy';
            }
        }
    },

    updateCommissionBreakdown(breakdown) {
        // Update commission breakdown values
        const elements = {
            'repeat-commission': Utils.formatCurrency(breakdown.repeat || 0),
            'new-commission': Utils.formatCurrency(breakdown.new || 0),
            'incentive-commission': Utils.formatCurrency(breakdown.incentive || 0)
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
        
        console.log('Commission breakdown updated:', breakdown);
    },

    updateStateAnalysis(stateAnalysis) {
        const tableBody = document.querySelector('#state-table tbody');
        if (!tableBody) return;
        
        // Clear existing rows
        tableBody.innerHTML = '';
        
        if (!stateAnalysis || stateAnalysis.length === 0) {
            const row = tableBody.insertRow();
            row.innerHTML = '<td colspan="7" class="no-data">No state data available</td>';
            return;
        }
        
        // Populate table with state data
        stateAnalysis.forEach(state => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${state.state}</td>
                <td>${Utils.formatCurrency(state.total_sales)}</td>
                <td class="tier-${state.tier}">${state.tier.toUpperCase()}</td>
                <td>${Utils.formatCurrency(state.commission)}</td>
                <td>${Utils.formatCurrency(state.reported)}</td>
                <td>${Utils.formatCurrency(state.bonus)}</td>
                <td>${state.transactions}</td>
            `;
        });
        
        console.log('State analysis updated:', stateAnalysis);
    },

    updateDiscrepancies(discrepancies) {
        const tableBody = document.querySelector('#discrepancies-table tbody');
        const discrepancyCount = document.getElementById('discrepancy-count');
        const totalOwedElement = document.getElementById('total-commission-owed');
        
        if (!tableBody) return;
        
        // Clear existing rows
        tableBody.innerHTML = '';
        
        // Update discrepancy count
        if (discrepancyCount) {
            discrepancyCount.textContent = discrepancies ? discrepancies.length : 0;
        }
        
        if (!discrepancies || discrepancies.length === 0) {
            const row = tableBody.insertRow();
            row.innerHTML = '<td colspan="5" class="no-data">No discrepancies found</td>';
            if (totalOwedElement) {
                totalOwedElement.innerHTML = '<strong>$0.00</strong>';
            }
            return;
        }
        
        let totalOwed = 0;
        
        // Populate table with discrepancy data
        discrepancies.forEach(discrepancy => {
            const row = tableBody.insertRow();
            const difference = parseFloat(discrepancy.difference);
            const rowClass = difference > 0 ? 'positive-diff' : difference < 0 ? 'negative-diff' : '';
            
            // Add to total owed (only positive differences)
            if (difference > 0) {
                totalOwed += difference;
            }
            
            row.className = rowClass;
            row.innerHTML = `
                <td>${discrepancy.invoice}</td>
                <td>${discrepancy.state}</td>
                <td>${Utils.formatCurrency(discrepancy.calculated)}</td>
                <td>${Utils.formatCurrency(discrepancy.reported)}</td>
                <td class="difference">${difference >= 0 ? '+' : ''}${Utils.formatCurrency(difference)}</td>
            `;
        });
        
        // Update total commission owed
        if (totalOwedElement) {
            totalOwedElement.innerHTML = `<strong>${Utils.formatCurrency(totalOwed)}</strong>`;
        }
        
        console.log('Discrepancies updated:', discrepancies);
        console.log('Total commission owed:', totalOwed);
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
            formData.append('csvFile', AppState.currentFile);

            ProgressManager.update(30, 'Uploading and parsing CSV data...');

            const response = await fetch('/verify-commission', {
                method: 'POST',
                body: formData
            });

            ProgressManager.update(70, 'Processing commission calculations...');

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Verification failed');
            }

            const results = await response.json();
            
            ProgressManager.update(100, 'Verification complete!');
            
            setTimeout(() => {
                ProgressManager.hide();
                ResultsManager.show(results);
            }, 1000);

        } catch (error) {
            console.error('Verification error:', error);
            ProgressManager.hide();
            FileUploadManager.showError(error.message || 'Failed to verify commission data');
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

// Collapsible Section Manager
const CollapsibleManager = {
    init() {
        const headers = document.querySelectorAll('.collapsible-header');
        headers.forEach(header => {
            header.addEventListener('click', this.toggleSection.bind(this));
        });
    },

    toggleSection(event) {
        const header = event.currentTarget;
        const content = header.nextElementSibling;
        const icon = header.querySelector('.collapsible-icon');
        
        if (!content || !icon) return;
        
        const isExpanded = header.getAttribute('aria-expanded') === 'true';
        
        // Toggle aria-expanded
        header.setAttribute('aria-expanded', !isExpanded);
        
        // Toggle content visibility
        if (isExpanded) {
            content.style.maxHeight = '0';
            content.style.opacity = '0';
            icon.style.transform = 'rotate(0deg)';
        } else {
            content.style.maxHeight = content.scrollHeight + 'px';
            content.style.opacity = '1';
            icon.style.transform = 'rotate(180deg)';
        }
        
        // Add transition classes
        content.style.transition = 'max-height 0.3s ease, opacity 0.3s ease';
        icon.style.transition = 'transform 0.3s ease';
    }
};

// Application Initialization
document.addEventListener('DOMContentLoaded', function() {
    console.log('Commission Verifier initializing...');
    
    // Initialize all managers
    FileUploadManager.init();
    TimeDisplay.init();
    CollapsibleManager.init();
    
    // Set up verify button handler
    const verifyBtn = document.getElementById('verify-btn');
    if (verifyBtn) {
        verifyBtn.addEventListener('click', () => CommissionVerifier.verify());
    }
    
    console.log('Commission Verifier ready');
});
