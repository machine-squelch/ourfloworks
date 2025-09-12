// Modern Commission Verification Web App JavaScript
// World-class UI with enhanced mobile experience
// © 2025 Adam Gurley - All Rights Reserved

'use strict';

// Application state
const AppState = {
    currentFile: null,
    currentResults: null,
    isProcessing: false,
    collapsibleStates: {
        state: false,
        discrepancies: false
    }
};

// Utility functions
const Utils = {
    // Format file size
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    // Format currency
    formatCurrency(amount) {
        if (typeof amount === 'string') {
            amount = parseFloat(amount);
        }
        if (isNaN(amount)) return '$0.00';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    },

    // Animate number counting
    animateNumber(element, start, end, duration = 1000) {
        const startTime = performance.now();
        const diff = end - start;
        
        const updateNumber = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const current = start + (diff * easeOut);
            
            if (element.dataset.format === 'currency') {
                element.textContent = this.formatCurrency(current);
            } else {
                element.textContent = Math.floor(current).toLocaleString();
            }
            
            if (progress < 1) {
                requestAnimationFrame(updateNumber);
            }
        };
        
        requestAnimationFrame(updateNumber);
    },

    // Announce to screen readers
    announce(message, priority = 'polite') {
        const announcer = document.getElementById('announcements');
        if (announcer) {
            announcer.textContent = message;
            announcer.setAttribute('aria-live', priority);
            
            // Clear after announcement
            setTimeout(() => {
                announcer.textContent = '';
            }, 1000);
        }
    },

    // Debounce function
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Smooth scroll to element
    scrollToElement(element, offset = 0) {
        if (!element) return;
        
        const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
        const offsetPosition = elementPosition - offset;
        
        window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
        });
    }
};

// Accessibility manager
const AccessibilityManager = {
    // Focus management for dynamic content
    manageFocus(element) {
        if (!element) return;
        
        element.setAttribute('tabindex', '-1');
        element.focus();
        
        const removeFocusHandler = () => {
            element.removeAttribute('tabindex');
            element.removeEventListener('blur', removeFocusHandler);
        };
        
        element.addEventListener('blur', removeFocusHandler);
    },

    // Keyboard navigation for custom elements
    setupKeyboardNavigation() {
        // Handle collapsible sections with keyboard
        document.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' || e.key === ' ') && 
                e.target.hasAttribute('role') && 
                e.target.getAttribute('role') === 'button') {
                
                e.preventDefault();
                e.target.click();
            }
        });
    },

    // Update ARIA attributes
    updateAriaAttributes(element, attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
            element.setAttribute(key, value);
        });
    }
};

// File upload manager
const FileUploadManager = {
    allowedTypes: ['text/csv'],
    maxFileSize: 10 * 1024 * 1024, // 10MB

    init() {
        const dropzone = document.getElementById('dropzone');
        const fileInput = document.getElementById('csv-file');
        const removeBtn = document.getElementById('remove-file');

        if (!dropzone || !fileInput) return;

        // Event listeners
        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('dragover', this.handleDragOver.bind(this));
        dropzone.addEventListener('dragleave', this.handleDragLeave.bind(this));
        dropzone.addEventListener('drop', this.handleDrop.bind(this));
        fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        
        if (removeBtn) {
            removeBtn.addEventListener('click', this.removeFile.bind(this));
        }

        // Keyboard accessibility
        dropzone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInput.click();
            }
        });
    },

    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const dropzone = e.currentTarget;
        dropzone.classList.add('drag-over');
        
        // Update ARIA
        AccessibilityManager.updateAriaAttributes(dropzone, {
            'aria-describedby': 'upload-instructions',
            'aria-expanded': 'true'
        });
    },

    handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Only remove if leaving the dropzone completely
        if (!e.currentTarget.contains(e.relatedTarget)) {
            e.currentTarget.classList.remove('drag-over');
        }
    },

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const dropzone = e.currentTarget;
        dropzone.classList.remove('drag-over');
        
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    },

    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    },

    processFile(file) {
        // Clear previous errors
        this.clearErrors();
        
        // Validate file
        const validation = this.validateFile(file);
        if (!validation.valid) {
            this.showErrors(validation.errors);
            return;
        }

        // Store file and show preview
        AppState.currentFile = file;
        this.showFilePreview(file);
        this.enableVerificationButton();
        
        Utils.announce(`File ${file.name} selected and ready for verification`);
    },

    validateFile(file) {
        const errors = [];

        // Check file type
        if (!this.allowedTypes.includes(file.type)) {
            errors.push(`File type '${file.type}' not supported. Please use CSV files only.`);
        }

        // Check file size
        if (file.size > this.maxFileSize) {
            errors.push(`File size ${Utils.formatFileSize(file.size)} exceeds the ${Utils.formatFileSize(this.maxFileSize)} limit.`);
        }

        // Check if file is empty
        if (file.size === 0) {
            errors.push('File is empty. Please select a valid CSV file with data.');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    showFilePreview(file) {
        const preview = document.getElementById('file-preview');
        const fileName = document.getElementById('file-name');
        const fileSize = document.getElementById('file-size');
        
        if (!preview || !fileName || !fileSize) return;

        fileName.textContent = file.name;
        fileSize.textContent = Utils.formatFileSize(file.size);
        
        preview.classList.remove('hidden');
        preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },

    removeFile() {
        AppState.currentFile = null;
        
        // Hide preview
        const preview = document.getElementById('file-preview');
        if (preview) {
            preview.classList.add('hidden');
        }

        // Clear file input
        const fileInput = document.getElementById('csv-file');
        if (fileInput) {
            fileInput.value = '';
        }

        // Disable verification button
        this.disableVerificationButton();
        
        Utils.announce('File removed');
    },

    enableVerificationButton() {
        const verifyBtn = document.getElementById('verify-btn');
        const description = document.getElementById('verify-description');
        
        if (verifyBtn) {
            verifyBtn.disabled = false;
            verifyBtn.classList.add('enabled');
        }
        
        if (description) {
            description.textContent = 'Click to verify your commission data';
        }
    },

    disableVerificationButton() {
        const verifyBtn = document.getElementById('verify-btn');
        const description = document.getElementById('verify-description');
        
        if (verifyBtn) {
            verifyBtn.disabled = true;
            verifyBtn.classList.remove('enabled');
        }
        
        if (description) {
            description.textContent = 'Upload a CSV file to enable verification';
        }
    },

    showErrors(errors) {
        const errorContainer = document.getElementById('upload-errors');
        if (!errorContainer || !errors.length) return;

        const errorHTML = `
            <div class="error-content">
                <div class="error-header">
                    <h4>Upload Error</h4>
                    <button class="error-close" onclick="FileUploadManager.clearErrors()">×</button>
                </div>
                <ul class="error-list">
                    ${errors.map(error => `<li>${error}</li>`).join('')}
                </ul>
            </div>
        `;

        errorContainer.innerHTML = errorHTML;
        errorContainer.classList.remove('hidden');
        
        // Announce errors
        Utils.announce(`Upload failed: ${errors[0]}`, 'assertive');
    },

    clearErrors() {
        const errorContainer = document.getElementById('upload-errors');
        if (errorContainer) {
            errorContainer.innerHTML = '';
            errorContainer.classList.add('hidden');
        }
    }
};

// Progress manager
const ProgressManager = {
    show() {
        const section = document.getElementById('progress-section');
        if (section) {
            section.classList.remove('hidden');
            Utils.scrollToElement(section, 100);
        }
    },

    hide() {
        const section = document.getElementById('progress-section');
        if (section) {
            section.classList.add('hidden');
        }
    },

    updateProgress(percentage, text = 'Processing...') {
        const fill = document.getElementById('progress-fill');
        const percentSpan = document.getElementById('progress-percent');
        const textSpan = document.getElementById('progress-text');

        if (fill) {
            fill.style.width = `${Math.min(100, Math.max(0, percentage))}%`;
        }

        if (percentSpan) {
            percentSpan.textContent = `${Math.round(percentage)}%`;
        }

        if (textSpan) {
            textSpan.textContent = text;
        }

        // Announce progress milestones
        if (percentage % 25 === 0 && percentage > 0) {
            Utils.announce(`${percentage}% complete`);
        }
    },

    simulate(duration = 3000) {
        return new Promise((resolve) => {
            let progress = 0;
            const steps = [
                { progress: 20, text: 'Reading CSV data...' },
                { progress: 40, text: 'Parsing transactions...' },
                { progress: 60, text: 'Calculating commissions...' },
                { progress: 80, text: 'Analyzing discrepancies...' },
                { progress: 95, text: 'Finalizing results...' },
                { progress: 100, text: 'Complete!' }
            ];

            let currentStep = 0;
            const stepDuration = duration / steps.length;

            const updateStep = () => {
                if (currentStep < steps.length) {
                    const step = steps[currentStep];
                    this.updateProgress(step.progress, step.text);
                    currentStep++;
                    
                    setTimeout(updateStep, stepDuration);
                } else {
                    resolve();
                }
            };

            updateStep();
        });
    }
};

// Results manager
const ResultsManager = {
    show(data) {
        const section = document.getElementById('results-section');
        if (!section) return;

        // Store results
        AppState.currentResults = data;

        // Update summary cards with animations
        this.updateSummaryCards(data.summary || {});
        this.updateCommissionBreakdown(data.commission_breakdown || {});
        this.updateStateAnalysis(data.state_analysis || []);
        this.updateDiscrepancies(data.discrepancies || []);

        // Show section
        section.classList.remove('hidden');
        Utils.scrollToElement(section, 100);

        Utils.announce('Verification results are ready');
    },

    updateSummaryCards(summary) {
        const cards = {
            'total-transactions': { value: summary.total_transactions || 0, format: 'number' },
            'total-states': { value: summary.total_states || 0, format: 'number' },
            'calculated-commission': { value: parseFloat(summary.total_calculated_commission) || 0, format: 'currency' },
            'verification-status': { 
                value: summary.difference && parseFloat(summary.difference) === 0 ? '✓ Verified' : '⚠ Issues Found',
                format: 'text'
            }
        };

        Object.entries(cards).forEach(([id, config]) => {
            const element = document.getElementById(id);
            if (element) {
                if (config.format === 'currency') {
                    element.dataset.format = 'currency';
                    Utils.animateNumber(element, 0, config.value, 1500);
                } else if (config.format === 'number') {
                    Utils.animateNumber(element, 0, config.value, 1200);
                } else {
                    element.textContent = config.value;
                }
            }
        });
    },

    updateCommissionBreakdown(breakdown) {
        const items = {
            'repeat-commission': parseFloat(breakdown.repeat) || 0,
            'new-commission': parseFloat(breakdown.new) || 0,
            'incentive-commission': parseFloat(breakdown.incentive) || 0,
            'state-bonuses': parseFloat(AppState.currentResults?.summary?.total_state_bonuses) || 0
        };

        Object.entries(items).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                setTimeout(() => {
                    element.textContent = Utils.formatCurrency(value);
                }, Math.random() * 500 + 200);
            }
        });
    },

    updateStateAnalysis(stateData) {
        const grid = document.getElementById('state-analysis-grid');
        if (!grid || !stateData.length) return;

        const stateCards = stateData.map(state => `
            <div class="state-card" data-tier="${state.tier}">
                <div class="state-header">
                    <h4 class="state-name">${state.state}</h4>
                    <span class="state-tier tier-${state.tier.replace('tier', '')}">${state.tier.toUpperCase()}</span>
                </div>
                <div class="state-stats">
                    <div class="stat-row">
                        <span class="stat-label">Sales:</span>
                        <span class="stat-value">${Utils.formatCurrency(parseFloat(state.total_sales))}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Commission:</span>
                        <span class="stat-value">${Utils.formatCurrency(parseFloat(state.commission))}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Bonus:</span>
                        <span class="stat-value">${Utils.formatCurrency(parseFloat(state.bonus))}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Transactions:</span>
                        <span class="stat-value">${state.transactions}</span>
                    </div>
                </div>
            </div>
        `).join('');

        grid.innerHTML = stateCards;

        // Add CSS for state cards if not already present
        this.addStateCardStyles();
    },

    updateDiscrepancies(discrepancies) {
        const list = document.getElementById('discrepancies-list');
        const countElement = document.getElementById('discrepancy-count');
        
        if (!list) return;

        // Update count
        if (countElement) {
            countElement.textContent = discrepancies.length;
            if (discrepancies.length > 0) {
                countElement.classList.remove('hidden');
            } else {
                countElement.classList.add('hidden');
            }
        }

        if (discrepancies.length === 0) {
            list.innerHTML = `
                <div class="no-discrepancies">
                    <div class="success-icon">✅</div>
                    <h4>No Discrepancies Found</h4>
                    <p>All commission calculations match the expected amounts.</p>
                </div>
            `;
            return;
        }

        const discrepancyItems = discrepancies.map((disc, index) => `
            <div class="discrepancy-item" data-severity="${Math.abs(parseFloat(disc.difference)) > 10 ? 'high' : 'low'}">
                <div class="discrepancy-header">
                    <span class="discrepancy-invoice">Invoice: ${disc.invoice}</span>
                    <span class="discrepancy-state">${disc.state}</span>
                </div>
                <div class="discrepancy-details">
                    <div class="amount-row">
                        <span class="amount-label">Calculated:</span>
                        <span class="amount-value calculated">${Utils.formatCurrency(parseFloat(disc.calculated))}</span>
                    </div>
                    <div class="amount-row">
                        <span class="amount-label">Reported:</span>
                        <span class="amount-value reported">${Utils.formatCurrency(parseFloat(disc.reported))}</span>
                    </div>
                    <div class="amount-row difference">
                        <span class="amount-label">Difference:</span>
                        <span class="amount-value ${parseFloat(disc.difference) > 0 ? 'positive' : 'negative'}">
                            ${Utils.formatCurrency(parseFloat(disc.difference))}
                        </span>
                    </div>
                </div>
            </div>
        `).join('');

        list.innerHTML = discrepancyItems;
        this.addDiscrepancyStyles();
    },

    addStateCardStyles() {
        if (document.getElementById('state-card-styles')) return;

        const styles = `
            <style id="state-card-styles">
                .state-card {
                    padding: var(--space-lg);
                    background: var(--glass-bg);
                    border: 1px solid var(--glass-border);
                    border-radius: var(--border-radius);
                    transition: all var(--transition-normal) var(--ease-out-cubic);
                }
                
                .state-card:hover {
                    transform: translateY(-2px);
                    box-shadow: var(--glass-shadow);
                    border-color: rgba(255, 255, 255, 0.2);
                }
                
                .state-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--space-md);
                }
                
                .state-name {
                    font-size: var(--text-lg);
                    font-weight: 700;
                    margin: 0;
                    color: var(--color-neon-cyan);
                    font-family: 'JetBrains Mono', monospace;
                }
                
                .state-tier {
                    padding: var(--space-xs) var(--space-sm);
                    border-radius: var(--border-radius-sm);
                    font-size: var(--text-xs);
                    font-weight: 600;
                    font-family: 'JetBrains Mono', monospace;
                }
                
                .tier-1 {
                    background: rgba(0, 255, 136, 0.1);
                    border: 1px solid rgba(0, 255, 136, 0.3);
                    color: var(--color-neon-green);
                }
                
                .tier-2 {
                    background: rgba(0, 255, 255, 0.1);
                    border: 1px solid rgba(0, 255, 255, 0.3);
                    color: var(--color-neon-cyan);
                }
                
                .tier-3 {
                    background: rgba(255, 0, 128, 0.1);
                    border: 1px solid rgba(255, 0, 128, 0.3);
                    color: var(--color-neon-pink);
                }
                
                .state-stats {
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-sm);
                }
                
                .stat-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .stat-label {
                    font-size: var(--text-sm);
                    color: var(--color-text-secondary);
                }
                
                .stat-value {
                    font-size: var(--text-sm);
                    font-weight: 600;
                    color: var(--color-text-primary);
                    font-family: 'JetBrains Mono', monospace;
                }
            </style>
        `;

        document.head.insertAdjacentHTML('beforeend', styles);
    },

    addDiscrepancyStyles() {
        if (document.getElementById('discrepancy-styles')) return;

        const styles = `
            <style id="discrepancy-styles">
                .discrepancy-item {
                    padding: var(--space-lg);
                    margin-bottom: var(--space-md);
                    background: var(--glass-bg);
                    border: 1px solid var(--glass-border);
                    border-radius: var(--border-radius);
                    border-left: 4px solid var(--color-warning);
                }
                
                .discrepancy-item[data-severity="high"] {
                    border-left-color: var(--color-error);
                    background: rgba(239, 68, 68, 0.05);
                }
                
                .discrepancy-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--space-md);
                    flex-wrap: wrap;
                    gap: var(--space-sm);
                }
                
                .discrepancy-invoice {
                    font-weight: 600;
                    color: var(--color-text-primary);
                    font-family: 'JetBrains Mono', monospace;
                }
                
                .discrepancy-state {
                    background: var(--color-surface);
                    padding: var(--space-xs) var(--space-sm);
                    border-radius: var(--border-radius-sm);
                    font-size: var(--text-xs);
                    font-weight: 500;
                    color: var(--color-text-secondary);
                }
                
                .discrepancy-details {
                    display: grid;
                    gap: var(--space-sm);
                }
                
                .amount-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .amount-row.difference {
                    border-top: 1px solid var(--glass-border);
                    padding-top: var(--space-sm);
                    font-weight: 600;
                }
                
                .amount-label {
                    font-size: var(--text-sm);
                    color: var(--color-text-secondary);
                }
                
                .amount-value {
                    font-family: 'JetBrains Mono', monospace;
                    font-weight: 600;
                }
                
                .amount-value.calculated {
                    color: var(--color-neon-green);
                }
                
                .amount-value.reported {
                    color: var(--color-neon-cyan);
                }
                
                .amount-value.positive {
                    color: var(--color-success);
                }
                
                .amount-value.negative {
                    color: var(--color-error);
                }
                
                .no-discrepancies {
                    text-align: center;
                    padding: var(--space-2xl);
                    color: var(--color-success);
                }
                
                .success-icon {
                    font-size: var(--text-3xl);
                    margin-bottom: var(--space-md);
                }
                
                .no-discrepancies h4 {
                    margin: 0 0 var(--space-sm) 0;
                    color: var(--color-success);
                }
                
                .no-discrepancies p {
                    margin: 0;
                    color: var(--color-text-secondary);
                }
            </style>
        `;

        document.head.insertAdjacentHTML('beforeend', styles);
    }
};

// Collapsible sections manager
const CollapsibleManager = {
    init() {
        const toggles = document.querySelectorAll('[aria-expanded]');
        toggles.forEach(toggle => {
            toggle.addEventListener('click', this.handleToggle.bind(this));
        });
    },

    handleToggle(e) {
        const trigger = e.currentTarget;
        const contentId = trigger.id.replace('-toggle', '-content');
        const content = document.getElementById(contentId);
        
        if (!content) return;

        const isExpanded = trigger.getAttribute('aria-expanded') === 'true';
        const newState = !isExpanded;

        // Update ARIA attributes
        trigger.setAttribute('aria-expanded', newState);
        content.setAttribute('aria-hidden', !newState);

        // Update state
        if (trigger.id === 'state-toggle') {
            AppState.collapsibleStates.state = newState;
        } else if (trigger.id === 'discrepancies-toggle') {
            AppState.collapsibleStates.discrepancies = newState;
        }

        // Announce change
        const sectionName = trigger.querySelector('.subsection-title').textContent;
        Utils.announce(`${sectionName} ${newState ? 'expanded' : 'collapsed'}`);
    }
};

// Commission verification handler
const CommissionVerifier = {
    async verify() {
        if (!AppState.currentFile) {
            Utils.announce('Please select a file first', 'assertive');
            return;
        }

        if (AppState.isProcessing) return;

        try {
            AppState.isProcessing = true;
            
            // Update UI
            this.updateVerifyButton(true);
            ProgressManager.show();

            // Simulate progress
            await ProgressManager.simulate(2000);

            // Prepare form data
            const formData = new FormData();
            formData.append('csvFile', AppState.currentFile);

            // Make API call
            const response = await fetch('/verify-commission', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }

            const results = await response.json();

            // Hide progress and show results
            ProgressManager.hide();
            ResultsManager.show(results);

        } catch (error) {
            console.error('Verification failed:', error);
            
            ProgressManager.hide();
            this.showError(error.message || 'Verification failed. Please try again.');
            
            Utils.announce('Verification failed', 'assertive');
        } finally {
            AppState.isProcessing = false;
            this.updateVerifyButton(false);
        }
    },

    updateVerifyButton(isLoading) {
        const button = document.getElementById('verify-btn');
        const buttonText = button?.querySelector('.button-text');
        const buttonLoader = button?.querySelector('.button-loader');

        if (!button || !buttonText || !buttonLoader) return;

        if (isLoading) {
            button.disabled = true;
            buttonText.textContent = 'Verifying...';
            buttonLoader.classList.remove('hidden');
        } else {
            button.disabled = false;
            buttonText.textContent = 'Verify Commission Data';
            buttonLoader.classList.add('hidden');
        }
    },

    showError(message) {
        // You could implement a toast notification system here
        alert(`Error: ${message}`);
    }
};

// Download manager
const DownloadManager = {
    async downloadReport() {
        if (!AppState.currentResults) {
            Utils.announce('No results to download', 'assertive');
            return;
        }

        try {
            const response = await fetch('/download-report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(AppState.currentResults)
            });

            if (!response.ok) {
                throw new Error('Failed to generate report');
            }

            // Create download link
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `commission_verification_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            Utils.announce('Report downloaded successfully');

        } catch (error) {
            console.error('Download failed:', error);
            Utils.announce('Download failed', 'assertive');
        }
    }
};

// Time display manager
const TimeManager = {
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

// Application initialization
class App {
    constructor() {
        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.onDOMReady());
        } else {
            this.onDOMReady();
        }
    }

    onDOMReady() {
        // Initialize managers
        FileUploadManager.init();
        CollapsibleManager.init();
        TimeManager.init();
        AccessibilityManager.setupKeyboardNavigation();

        // Event listeners
        this.setupEventListeners();

        // Security and copyright notice
        this.setupSecurityNotices();

        // Clean up on page unload
        this.setupCleanup();

        Utils.announce('Application ready');
    }

    setupEventListeners() {
        // Verify button
        const verifyBtn = document.getElementById('verify-btn');
        if (verifyBtn) {
            verifyBtn.addEventListener('click', () => CommissionVerifier.verify());
        }

        // Download button
        const downloadBtn = document.getElementById('download-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => DownloadManager.downloadReport());
        }

        // Logo click for fun effect
        const logo = document.querySelector('.crt-display');
        if (logo) {
            logo.addEventListener('click', this.triggerLogoEffect.bind(this));
        }
    }

    setupSecurityNotices() {
        // Console security message
        console.log('%c© 2025 Adam Gurley - All Rights Reserved', 
            'color: #00ffff; font-size: 16px; font-weight: bold;');
        console.log('%cThinkazoo Commission Verification System', 
            'color: #00ff88; font-size: 12px;');
        console.log('%cUnauthorized access or modification is prohibited.', 
            'color: #ff0080; font-size: 12px;');
    }

    setupCleanup() {
        window.addEventListener('beforeunload', () => {
            // Clear sensitive data
            if (AppState.currentFile) {
                AppState.currentFile = null;
            }
            if (AppState.currentResults) {
                AppState.currentResults = null;
            }
        });
    }

    triggerLogoEffect() {
        const logo = document.querySelector('.crt-display');
        if (!logo) return;

        logo.style.animation = 'none';
        setTimeout(() => {
            logo.style.animation = 'logoGlitch 0.5s ease-in-out';
        }, 10);

        // Add temporary glitch effect
        logo.classList.add('mega-glitch');
        setTimeout(() => {
            logo.classList.remove('mega-glitch');
        }, 500);

        Utils.announce('System diagnostic complete');
    }
}

// Add some additional glitch effect styles
const glitchStyles = `
    <style id="glitch-effects">
        @keyframes logoGlitch {
            0%, 100% { transform: scale(1) rotate(0deg); }
            20% { transform: scale(1.1) rotate(-2deg); }
            40% { transform: scale(0.9) rotate(1deg); }
            60% { transform: scale(1.05) rotate(-1deg); }
            80% { transform: scale(0.95) rotate(2deg); }
        }
        
        .mega-glitch {
            animation: logoGlitch 0.5s ease-in-out !important;
        }
        
        .mega-glitch::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(90deg, transparent, rgba(0, 255, 255, 0.3), transparent);
            animation: glitchSweep 0.5s ease-in-out;
        }
        
        @keyframes glitchSweep {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }
    </style>
`;

document.head.insertAdjacentHTML('beforeend', glitchStyles);

// Initialize application
const app = new App();