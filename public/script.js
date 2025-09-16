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
        
        Utils.announce('Verification results are now available');
    },

    updateSummaryCards(summary) {
        const elements = {
            'total-transactions': summary.total_transactions,
            'total-states': summary.total_states,
            'calculated-commission': Utils.formatCurrency(summary.total_calculated_commission),
            'reported-commission': Utils.formatCurrency(summary.total_reported_commission)
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
    },

    updateCommissionBreakdown(breakdown) {
        // Implementation for commission breakdown display
        console.log('Commission breakdown:', breakdown);
    },

    updateStateAnalysis(stateAnalysis) {
        // Implementation for state analysis display
        console.log('State analysis:', stateAnalysis);
    },

    updateDiscrepancies(discrepancies) {
        // Implementation for discrepancies display
        console.log('Discrepancies:', discrepancies);
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

// Application Initialization
document.addEventListener('DOMContentLoaded', function() {
    console.log('Commission Verifier initializing...');
    
    // Initialize all managers
    FileUploadManager.init();
    TimeDisplay.init();
    
    // Set up verify button handler
    const verifyBtn = document.getElementById('verify-btn');
    if (verifyBtn) {
        verifyBtn.addEventListener('click', () => CommissionVerifier.verify());
    }
    
    console.log('Commission Verifier ready');
});
