// Modern Commission Verification Web App JavaScript
// World-class UI with enhanced mobile experience + Cloudflare Turnstile
// © 2025 Adam Gurley - All Rights Reserved

'use strict';

// Application state
const AppState = {
    currentFile: null,
    currentResults: null,
    isProcessing: false,
    turnstileToken: null,
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

// Turnstile Integration
const TurnstileManager = {
    // Turnstile success callback
    onSuccess(token) {
        console.log('Turnstile verification successful');
        AppState.turnstileToken = token;
        
        // Enable the verify button
        const verifyBtn = document.getElementById('verify-btn');
        if (verifyBtn && AppState.currentFile) {
            verifyBtn.disabled = false;
            verifyBtn.classList.remove('disabled');
        }
        
        // Update button description
        const description = document.getElementById('verify-description');
        if (description) {
            description.textContent = 'Security verified - Ready to process commission data';
        }
        
        Utils.announce('Security verification completed successfully');
    },

    // Turnstile error callback
    onError(error) {
        console.error('Turnstile verification failed:', error);
        AppState.turnstileToken = null;
        
        // Keep verify button disabled
        const verifyBtn = document.getElementById('verify-btn');
        if (verifyBtn) {
            verifyBtn.disabled = true;
            verifyBtn.classList.add('disabled');
        }
        
        // Show error message
        const description = document.getElementById('verify-description');
        if (description) {
            description.textContent = 'Security verification failed - Please refresh and try again';
        }
        
        Utils.announce('Security verification failed', 'assertive');
    },

    // Show Turnstile widget
    show() {
        const container = document.getElementById('turnstile-container');
        const notice = document.getElementById('security-notice');
        
        if (container) {
            container.style.display = 'flex';
            container.setAttribute('aria-hidden', 'false');
        }
        if (notice) {
            notice.style.display = 'block';
        }
    },

    // Hide Turnstile widget
    hide() {
        const container = document.getElementById('turnstile-container');
        const notice = document.getElementById('security-notice');
        
        if (container) {
            container.style.display = 'none';
            container.setAttribute('aria-hidden', 'true');
        }
        if (notice) {
            notice.style.display = 'none';
        }
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

        // Keyboard support
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
        event.currentTarget.classList.add('drag-over');
    },

    handleDragLeave(event) {
        event.preventDefault();
        event.currentTarget.classList.remove('drag-over');
    },

    handleDrop(event) {
        event.preventDefault();
        event.currentTarget.classList.remove('drag-over');
        
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    },

    processFile(file) {
        // Validate file type
        if (!file.name.toLowerCase().endsWith('.csv')) {
            this.showError('Please select a CSV file only.');
            return;
        }

        // Validate file size (10MB limit)
        if (file.size > 10 * 1024 * 1024) {
            this.showError('File size must be less than 10MB.');
            return;
        }

        AppState.currentFile = file;
        this.showFilePreview(file);
        this.clearErrors();
        
        // Show Turnstile for security verification
        TurnstileManager.show();
        
        Utils.announce(`File ${file.name} selected. Please complete security verification.`);
    },

    showFilePreview(file) {
        const preview = document.getElementById('file-preview');
        const fileName = document.getElementById('file-name');
        const fileSize = document.getElementById('file-size');
        
        if (preview && fileName && fileSize) {
            fileName.textContent = file.name;
            fileSize.textContent = Utils.formatFileSize(file.size);
            preview.classList.remove('hidden');
        }
    },

    removeFile() {
        AppState.currentFile = null;
        AppState.turnstileToken = null;
        
        const preview = document.getElementById('file-preview');
        const fileInput = document.getElementById('csv-file');
        const verifyBtn = document.getElementById('verify-btn');
        const description = document.getElementById('verify-description');
        
        if (preview) preview.classList.add('hidden');
        if (fileInput) fileInput.value = '';
        if (verifyBtn) {
            verifyBtn.disabled = true;
            verifyBtn.classList.add('disabled');
        }
        if (description) {
            description.textContent = 'Upload a CSV file to enable verification';
        }
        
        // Hide Turnstile
        TurnstileManager.hide();
        
        this.clearErrors();
        Utils.announce('File removed');
    },

    showError(message) {
        const errorContainer = document.getElementById('upload-errors');
        if (errorContainer) {
            errorContainer.innerHTML = `
                <div class="error-message">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    <span>${message}</span>
                </div>
            `;
            errorContainer.classList.remove('hidden');
        }
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

// Commission Verification Manager
const VerificationManager = {
    init() {
        const verifyBtn = document.getElementById('verify-btn');
        if (verifyBtn) {
            verifyBtn.addEventListener('click', this.startVerification.bind(this));
        }
    },

    async startVerification() {
        if (!AppState.currentFile) {
            Utils.announce('Please select a CSV file first', 'assertive');
            return;
        }

        if (!AppState.turnstileToken) {
            Utils.announce('Please complete security verification first', 'assertive');
            return;
        }

        AppState.isProcessing = true;
        this.showProgress();
        
        try {
            const formData = new FormData();
            formData.append('csvFile', AppState.currentFile);
            formData.append('turnstileToken', AppState.turnstileToken);

            const response = await fetch('/verify-commission', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Verification failed');
            }

            const results = await response.json();
            AppState.currentResults = results;
            
            this.hideProgress();
            this.showResults(results);
            
            Utils.announce('Commission verification completed successfully');
            
        } catch (error) {
            console.error('Verification error:', error);
            this.hideProgress();
            this.showVerificationError(error.message);
            Utils.announce(`Verification failed: ${error.message}`, 'assertive');
        } finally {
            AppState.isProcessing = false;
        }
    },

    showProgress() {
        const progressSection = document.getElementById('progress-section');
        const resultsSection = document.getElementById('results-section');
        
        if (progressSection) {
            progressSection.classList.remove('hidden');
            Utils.scrollToElement(progressSection, 100);
        }
        if (resultsSection) {
            resultsSection.classList.add('hidden');
        }

        // Simulate progress
        this.animateProgress();
    },

    animateProgress() {
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        const progressPercent = document.getElementById('progress-percent');
        
        const steps = [
            { percent: 20, text: 'Validating file format...' },
            { percent: 40, text: 'Processing CSV data...' },
            { percent: 60, text: 'Calculating commissions...' },
            { percent: 80, text: 'Analyzing discrepancies...' },
            { percent: 100, text: 'Generating report...' }
        ];

        let currentStep = 0;
        const stepInterval = setInterval(() => {
            if (currentStep >= steps.length || !AppState.isProcessing) {
                clearInterval(stepInterval);
                return;
            }

            const step = steps[currentStep];
            if (progressFill) progressFill.style.width = `${step.percent}%`;
            if (progressText) progressText.textContent = step.text;
            if (progressPercent) progressPercent.textContent = `${step.percent}%`;

            currentStep++;
        }, 800);
    },

    hideProgress() {
        const progressSection = document.getElementById('progress-section');
        if (progressSection) {
            progressSection.classList.add('hidden');
        }
    },

    showResults(results) {
        const resultsSection = document.getElementById('results-section');
        if (!resultsSection) return;

        // Update summary cards
        this.updateSummaryCards(results.summary);
        
        // Update commission breakdown
        this.updateCommissionBreakdown(results.commission_breakdown);
        
        // Update state analysis table
        this.updateStateAnalysis(results.state_analysis);
        
        // Update discrepancies table
        this.updateDiscrepancies(results.discrepancies);
        
        // Enable download button
        const downloadBtn = document.getElementById('download-btn');
        if (downloadBtn) {
            downloadBtn.disabled = false;
            downloadBtn.classList.remove('disabled');
        }

        resultsSection.classList.remove('hidden');
        Utils.scrollToElement(resultsSection, 100);
    },

    updateSummaryCards(summary) {
        const elements = {
            'total-transactions': summary.total_transactions,
            'total-states': summary.total_states,
            'calculated-commission': summary.total_calculated_commission,
            'verification-status': parseFloat(summary.difference) === 0 ? 'Perfect' : 'Discrepancies Found'
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                if (id === 'calculated-commission') {
                    element.dataset.format = 'currency';
                    Utils.animateNumber(element, 0, parseFloat(value) || 0);
                } else if (typeof value === 'number') {
                    Utils.animateNumber(element, 0, value);
                } else {
                    element.textContent = value;
                }
            }
        });
    },

    updateCommissionBreakdown(breakdown) {
        const elements = {
            'repeat-commission': breakdown.repeat,
            'new-commission': breakdown.new,
            'incentive-commission': breakdown.incentive,
            'state-bonuses': AppState.currentResults?.summary?.total_state_bonuses || '0.00'
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = Utils.formatCurrency(parseFloat(value) || 0);
            }
        });
    },

    updateStateAnalysis(stateData) {
        const tableBody = document.querySelector('#state-table tbody');
        if (!tableBody) return;

        tableBody.innerHTML = stateData.map(state => `
            <tr>
                <td><strong>${state.state}</strong></td>
                <td>${Utils.formatCurrency(parseFloat(state.total_sales))}</td>
                <td><span class="tier-badge tier-${state.tier.toLowerCase()}">${state.tier.toUpperCase()}</span></td>
                <td>${Utils.formatCurrency(parseFloat(state.commission))}</td>
                <td>${Utils.formatCurrency(parseFloat(state.bonus))}</td>
                <td>${state.transactions}</td>
            </tr>
        `).join('');
    },

    updateDiscrepancies(discrepancies) {
        const tableBody = document.querySelector('#discrepancies-table tbody');
        const countElement = document.getElementById('discrepancy-count');
        
        if (countElement) {
            countElement.textContent = discrepancies.length;
        }

        if (!tableBody) return;

        if (discrepancies.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="no-data">
                        <div class="no-data-content">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                <polyline points="22,4 12,14.01 9,11.01"/>
                            </svg>
                            <p>No discrepancies found! All commission calculations match perfectly.</p>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            tableBody.innerHTML = discrepancies.map(disc => {
                const difference = parseFloat(disc.difference);
                const diffClass = difference > 0 ? 'positive' : 'negative';
                
                return `
                    <tr>
                        <td><strong>${disc.invoice}</strong></td>
                        <td>${disc.state}</td>
                        <td>${Utils.formatCurrency(parseFloat(disc.calculated))}</td>
                        <td>${Utils.formatCurrency(parseFloat(disc.reported))}</td>
                        <td class="difference ${diffClass}">${Utils.formatCurrency(Math.abs(difference))}</td>
                    </tr>
                `;
            }).join('');
        }
    },

    showVerificationError(message) {
        const resultsSection = document.getElementById('results-section');
        if (resultsSection) {
            resultsSection.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="15" y1="9" x2="9" y2="15"/>
                            <line x1="9" y1="9" x2="15" y2="15"/>
                        </svg>
                    </div>
                    <h3>Verification Failed</h3>
                    <p>${message}</p>
                    <button class="secondary-button" onclick="location.reload()">Try Again</button>
                </div>
            `;
            resultsSection.classList.remove('hidden');
            Utils.scrollToElement(resultsSection, 100);
        }
    }
};

// Report Download Manager
const ReportManager = {
    init() {
        const downloadBtn = document.getElementById('download-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', this.downloadReport.bind(this));
        }
    },

    async downloadReport() {
        if (!AppState.currentResults) {
            Utils.announce('No report data available', 'assertive');
            return;
        }

        try {
            const response = await fetch('/download-report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ reportData: AppState.currentResults })
            });

            if (!response.ok) {
                throw new Error('Failed to generate report');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `commission_verification_report_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            Utils.announce('Report downloaded successfully');

        } catch (error) {
            console.error('Download error:', error);
            Utils.announce('Failed to download report', 'assertive');
        }
    }
};

// Collapsible sections manager
const CollapsibleManager = {
    init() {
        const headers = document.querySelectorAll('.collapsible-header');
        headers.forEach(header => {
            header.addEventListener('click', this.toggleSection.bind(this));
            header.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.toggleSection(e);
                }
            });
        });
    },

    toggleSection(event) {
        const header = event.currentTarget;
        const content = header.nextElementSibling;
        const icon = header.querySelector('.collapsible-icon svg');
        const isExpanded = header.getAttribute('aria-expanded') === 'true';

        header.setAttribute('aria-expanded', !isExpanded);
        
        if (content) {
            content.style.maxHeight = isExpanded ? '0' : content.scrollHeight + 'px';
        }
        
        if (icon) {
            icon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
        }

        // Update state
        const sectionId = header.id.replace('-header', '');
        AppState.collapsibleStates[sectionId] = !isExpanded;
    }
};

// Time display manager
const TimeManager = {
    init() {
        this.updateTime();
        setInterval(this.updateTime, 1000);
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

// Global Turnstile callbacks (required by Cloudflare)
window.onTurnstileSuccess = TurnstileManager.onSuccess.bind(TurnstileManager);
window.onTurnstileError = TurnstileManager.onError.bind(TurnstileManager);

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    console.log('Commission Verification App initializing...');
    
    // Initialize all managers
    FileUploadManager.init();
    VerificationManager.init();
    ReportManager.init();
    CollapsibleManager.init();
    TimeManager.init();
    
    console.log('Commission Verification App initialized successfully');
    Utils.announce('Commission verification system ready');
});

