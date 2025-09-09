// Commission Verification Web App JavaScript
// © 2025 Adam Gurley - All Rights Reserved
// Proprietary and Confidential Software

let currentResults = null;
let currentFilename = null;

// Security: Clear sensitive data on page unload
window.addEventListener('beforeunload', function() {
    if (currentResults) {
        currentResults = null;
    }
    if (window.selectedFile) {
        window.selectedFile = null;
    }
});

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    updateTime();
    setInterval(updateTime, 1000);
    
    // Add copyright protection notice
    console.log('%c© 2025 Adam Gurley - All Rights Reserved', 
        'color: #00ff00; font-size: 16px; font-weight: bold;');
    console.log('%cDL Wholesale Commission Verification System', 
        'color: #00ffff; font-size: 12px;');
    console.log('%cUnauthorized access or modification is prohibited.', 
        'color: #ff0000; font-size: 12px;');
});

function initializeApp() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('csv-file');
    const verifyBtn = document.getElementById('verify-btn');
    const downloadBtn = document.getElementById('download-btn');

    // File upload handling
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);
    
    // Button handlers
    verifyBtn.addEventListener('click', verifyCommission);
    downloadBtn.addEventListener('click', downloadReport);
    
    // Megaglitch effect on logo click
    const logo = document.querySelector('img.crt-logo');
    if (logo) {
        logo.addEventListener('click', activateMegaGlitch);
        logo.style.cursor = 'pointer';
    }
}

function updateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { 
        hour12: false,
        timeZone: 'UTC'
    });
    const timeElement = document.getElementById('time');
    if (timeElement) {
        timeElement.textContent = `${timeString}_UTC`;
    }
}

function activateMegaGlitch() {
    // Apply megaglitch to the entire page
    const body = document.body;
    
    // Add megaglitch class temporarily
    body.style.animation = 'mega-glitch 2s ease-in-out';
    
    // Also glitch the logo specifically
    const logo = document.querySelector('img.crt-logo');
    if (logo) {
        logo.style.animation = 'mega-glitch 2s ease-in-out';
    }
    
    // Add screen flash effect
    const flash = document.createElement('div');
    flash.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100vw; height: 100vh;
        background: rgba(255, 255, 255, 0.8);
        z-index: 9999;
        pointer-events: none;
        animation: flash-effect 0.1s ease-out;
    `;
    
    // Add flash animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes flash-effect {
            0% { opacity: 1; }
            100% { opacity: 0; }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(flash);
    
    // Clean up after animation
    setTimeout(() => {
        body.style.animation = '';
        if (logo) logo.style.animation = '';
        if (flash.parentNode) flash.parentNode.removeChild(flash);
        if (style.parentNode) style.parentNode.removeChild(style);
    }, 2000);
    
    console.log('%cMEGAGLITCH ACTIVATED!', 'color: #ff00ff; font-size: 20px; font-weight: bold;');
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('border-cyan-400');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('border-cyan-400');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
}

function handleFile(file) {
    // Enhanced security validation
    if (!file.name.toLowerCase().endsWith('.csv')) {
        showError('Security Error: Only CSV files are allowed.');
        return;
    }
    
    // Check for suspicious file names
    const suspiciousPatterns = ['.exe', '.js', '.html', '.php', '.asp', '<script', 'javascript:'];
    const fileName = file.name.toLowerCase();
    
    for (let pattern of suspiciousPatterns) {
        if (fileName.includes(pattern)) {
            showError('Security Error: Suspicious file detected.');
            return;
        }
    }
    
    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
        showError('File size must be less than 10MB.');
        return;
    }
    
    // Validate file is not empty
    if (file.size === 0) {
        showError('File cannot be empty.');
        return;
    }
    
    // Additional MIME type validation
    const allowedTypes = ['text/csv', 'application/csv', 'text/plain'];
    if (file.type && !allowedTypes.includes(file.type)) {
        showError('Invalid file type. Please select a valid CSV file.');
        return;
    }
    
    // Display file info
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('file-size').textContent = formatFileSize(file.size);
    document.getElementById('file-info').classList.remove('hidden');
    
    // Enable verify button
    document.getElementById('verify-btn').disabled = false;
    document.getElementById('verify-btn').classList.remove('opacity-50');
    
    // Store file for verification
    window.selectedFile = file;
    currentFilename = file.name;
    
    // Hide previous results
    document.getElementById('results-section').classList.add('hidden');
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function verifyCommission() {
    if (!window.selectedFile) {
        showError('Please select a CSV file first.');
        return;
    }
    
    // Show loading
    showLoading();
    
    try {
        const formData = new FormData();
        formData.append('csvFile', window.selectedFile);
        
        const response = await fetch('/verify-commission', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Verification failed');
        }
        
        const data = await response.json();
        currentResults = data;
        
        // Hide loading and show results
        hideLoading();
        displayResults(data);
        
    } catch (error) {
        hideLoading();
        showError(`Verification failed: ${error.message}`);
    }
}

function showLoading() {
    document.getElementById('loading-section').classList.remove('hidden');
    document.getElementById('results-section').classList.add('hidden');
    
    // Animate progress bar
    let progress = 0;
    const progressBar = document.getElementById('progress-bar');
    const interval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress > 90) progress = 90;
        progressBar.style.width = `${progress}%`;
    }, 200);
    
    // Store interval for cleanup
    window.progressInterval = interval;
}

function hideLoading() {
    if (window.progressInterval) {
        clearInterval(window.progressInterval);
    }
    
    // Complete progress bar
    document.getElementById('progress-bar').style.width = '100%';
    
    setTimeout(() => {
        document.getElementById('loading-section').classList.add('hidden');
    }, 500);
}

function displayResults(results) {
    // Update summary
    document.getElementById('total-transactions').textContent = results.summary.total_transactions.toLocaleString();
    document.getElementById('total-states').textContent = results.summary.total_states;
    document.getElementById('calculated-commission').textContent = `$${results.summary.total_calculated_commission}`;
    
    // Verification status
    const isVerified = Math.abs(parseFloat(results.summary.difference)) < 0.01;
    const statusElement = document.getElementById('verification-status');
    if (isVerified) {
        statusElement.textContent = 'VERIFIED';
        statusElement.className = 'text-green-400 text-xl font-bold';
    } else {
        statusElement.textContent = 'DISCREPANCY';
        statusElement.className = 'text-red-400 text-xl font-bold';
    }
    
    // Commission breakdown
    document.getElementById('repeat-commission').textContent = `$${results.commission_breakdown.repeat}`;
    document.getElementById('new-commission').textContent = `$${results.commission_breakdown.new}`;
    document.getElementById('incentive-commission').textContent = `$${results.commission_breakdown.incentive}`;
    document.getElementById('state-bonuses').textContent = `$${results.summary.total_state_bonuses}`;
    
    // State analysis
    displayStateAnalysis(results.state_analysis);
    
    // Discrepancies
    displayDiscrepancies(results.discrepancies);
    
    // Show results section
    document.getElementById('results-section').classList.remove('hidden');
    
    // Scroll to results
    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
}

function displayStateAnalysis(stateAnalysis) {
    const container = document.getElementById('state-analysis-grid');
    container.innerHTML = '';
    
    stateAnalysis.forEach(state => {
        const stateCard = document.createElement('div');
        stateCard.className = 'bg-gray-900 bg-opacity-50 p-4 rounded border border-green-400';
        
        // Determine tier color based on tier name
        const tierColor = state.tier === 'tier3' ? 'text-pink-400' : 
                         state.tier === 'tier2' ? 'text-cyan-400' : 'text-green-400';
        
        // Format tier display
        let tierDisplay = '';
        if (state.tier === 'tier3') {
            tierDisplay = '$50k+ (0.5%/1.5%)';
        } else if (state.tier === 'tier2') {
            tierDisplay = '$10k-$49.9k (1%/2%)';
        } else {
            tierDisplay = '$0-$9,999 (2%/3%)';
        }
        
        stateCard.innerHTML = `
            <h4 class="${tierColor} font-bold text-lg">${state.state}</h4>
            <p class="text-gray-300 text-sm">${tierDisplay}</p>
            <p class="text-yellow-400 font-bold">$${state.total_sales}</p>
            <p class="text-green-400 text-sm">Bonus: $${state.bonus}</p>
        `;
        
        container.appendChild(stateCard);
    });
}

function displayDiscrepancies(discrepancies) {
    const container = document.getElementById('discrepancies-content');
    
    if (discrepancies.length === 0) {
        container.innerHTML = `
            <div class="bg-green-900 bg-opacity-50 p-4 rounded border border-green-400 text-center">
                <p class="text-green-400 font-bold">✅ NO DISCREPANCIES FOUND</p>
                <p class="text-gray-300 text-sm">All commission calculations are correct!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="bg-red-900 bg-opacity-50 p-4 rounded border border-red-400 mb-4">
            <p class="text-red-400 font-bold">⚠️ ${discrepancies.length} DISCREPANCIES FOUND</p>
            <p class="text-gray-300 text-sm">Review the following transactions:</p>
        </div>
    `;
    
    const table = document.createElement('div');
    table.className = 'overflow-x-auto';
    
    let tableHTML = `
        <table class="w-full text-sm">
            <thead>
                <tr class="border-b border-gray-600">
                    <th class="text-left p-2 text-cyan-400">Invoice</th>
                    <th class="text-left p-2 text-cyan-400">State</th>
                    <th class="text-left p-2 text-cyan-400">Calculated</th>
                    <th class="text-left p-2 text-cyan-400">Reported</th>
                    <th class="text-left p-2 text-cyan-400">Difference</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    discrepancies.slice(0, 20).forEach(disc => {
        const diffValue = parseFloat(disc.difference);
        const diffColor = diffValue > 0 ? 'text-green-400' : 'text-red-400';
        tableHTML += `
            <tr class="border-b border-gray-700">
                <td class="p-2 text-gray-300">${disc.invoice}</td>
                <td class="p-2 text-gray-300">${disc.state}</td>
                <td class="p-2 text-yellow-400">$${disc.calculated}</td>
                <td class="p-2 text-gray-300">$${disc.reported}</td>
                <td class="p-2 ${diffColor}">$${disc.difference}</td>
            </tr>
        `;
    });
    
    tableHTML += '</tbody></table>';
    
    if (discrepancies.length > 20) {
        tableHTML += `<p class="text-gray-400 text-sm mt-2">... and ${discrepancies.length - 20} more discrepancies</p>`;
    }
    
    table.innerHTML = tableHTML;
    container.appendChild(table);
}

async function downloadReport() {
    if (!currentResults) {
        showError('No verification results to download.');
        return;
    }
    
    try {
        const response = await fetch('/download-report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                reportData: currentResults
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to generate report');
        }
        
        // Download the file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `commission_verification_report_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showSuccess('Report downloaded successfully!');
        
    } catch (error) {
        showError(`Failed to download report: ${error.message}`);
    }
}

function showError(message) {
    // Create error notification
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-red-900 border border-red-400 text-red-400 px-4 py-2 rounded z-50';
    notification.textContent = `ERROR: ${message}`;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        document.body.removeChild(notification);
    }, 5000);
}

function showSuccess(message) {
    // Create success notification
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-green-900 border border-green-400 text-green-400 px-4 py-2 rounded z-50';
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        document.body.removeChild(notification);
    }, 3000);
}

// Glitch effects (from original template)
function triggerMegaGlitch() {
    document.body.classList.add('mega-glitch');
    setTimeout(() => {
        document.body.classList.remove('mega-glitch');
    }, 2000);
}

// Add some cyber effects
setInterval(() => {
    const elements = document.querySelectorAll('.flicker');
    elements.forEach(el => {
        if (Math.random() < 0.1) {
            el.style.opacity = Math.random() < 0.5 ? '0.3' : '1';
            setTimeout(() => {
                el.style.opacity = '1';
            }, 100);
        }
    });
}, 2000);

