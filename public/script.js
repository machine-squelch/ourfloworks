// script.js
document.addEventListener('DOMContentLoaded', () => {
    const fileDropArea = document.getElementById('file-drop-area');
    const fileInput = document.getElementById('file-input');
    const resultsContainer = document.getElementById('results-container');
    const downloadReportBtn = document.getElementById('download-report-btn');
    const downloadPdfBtn = document.getElementById('download-pdf-btn');
    const downloadButtons = document.querySelector('.download-buttons');
    const loadingOverlay = document.getElementById('loading-overlay');

    let verificationResults = null;

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        fileDropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Highlight drop area when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        fileDropArea.addEventListener(eventName, () => fileDropArea.classList.add('highlight'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        fileDropArea.addEventListener(eventName, () => fileDropArea.classList.remove('highlight'), false);
    });

    // Handle dropped files
    fileDropArea.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }

    // Handle file selection via click
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    function handleFiles(files) {
        const file = files[0];
        if (!file) return;

        // Client-side file validation
        const fileExtension = file.name.split('.').pop().toLowerCase();
        if (fileExtension !== 'csv') {
            alert('Invalid file type. Please upload a .csv file.');
            return;
        }

        const formData = new FormData();
        formData.append('csvFile', file);

        showLoading();

        // Send the file to the server
        fetch('/verify-commission', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => {
                    throw new Error(err.error || 'Server error');
                });
            }
            return response.json();
        })
        .then(data => {
            verificationResults = data;
            displayResults(data);
            hideLoading();
        })
        .catch(error => {
            console.error('Error:', error);
            resultsContainer.innerHTML = `<div class="error-message">${error.message}</div>`;
            hideLoading();
        });
    }

    // Display verification results
    function displayResults(data) {
        let html = '';

        // Summary Section
        html += `
            <h2>Verification Results</h2>
            <div class="summary-section">
                <h3>Summary</h3>
                <p><strong>Total Transactions:</strong> ${data.summary.total_transactions}</p>
                <p><strong>Total States:</strong> ${data.summary.total_states}</p>
                <p><strong>Calculated Commission:</strong> $${data.summary.total_calculated_commission}</p>
                <p><strong>Reported Commission:</strong> $${data.summary.total_reported_commission}</p>
                <p><strong>Difference:</strong> $${data.summary.difference}</p>
                <p><strong>Total State Bonuses:</strong> $${data.summary.total_state_bonuses}</p>
            </div>
        `;

        // Discrepancies Section
        html += `
            <div class="discrepancies-section">
                <h3>Discrepancies</h3>
        `;
        if (data.discrepancies.length > 0) {
            html += `
                <table>
                    <thead>
                        <tr>
                            <th>Invoice No.</th>
                            <th>State</th>
                            <th>Calculated</th>
                            <th>Reported</th>
                            <th>Difference</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.discrepancies.map(d => `
                            <tr class="${parseFloat(d.difference) < 0 ? 'negative' : ''}">
                                <td>${d.invoice}</td>
                                <td>${d.state}</td>
                                <td>$${d.calculated}</td>
                                <td>$${d.reported}</td>
                                <td>$${d.difference}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } else {
            html += `<p>No discrepancies found.</p>`;
        }
        html += `</div>`;

        // State Analysis Section
        html += `
            <div class="state-analysis-section">
                <h3>State Analysis</h3>
                <table>
                    <thead>
                        <tr>
                            <th>State</th>
                            <th>Total Sales</th>
                            <th>Tier</th>
                            <th>Calculated</th>
                            <th>Reported</th>
                            <th>Bonus</th>
                            <th>Transactions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.state_analysis.map(s => `
                            <tr>
                                <td>${s.state}</td>
                                <td>$${s.total_sales}</td>
                                <td>${s.tier}</td>
                                <td>$${s.calculated_commission}</td>
                                <td>$${s.reported_commission}</td>
                                <td>$${s.bonus}</td>
                                <td>${s.transactions}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        resultsContainer.innerHTML = html;
        downloadButtons.style.display = 'block';
    }
    
    // Download CSV report
    downloadReportBtn.addEventListener('click', () => {
        if (!verificationResults) return;
        fetch('/download-report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reportData: verificationResults })
        })
        .then(response => response.blob())
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            const timestamp = new Date().toISOString().slice(0, 16).replace(/[:]/g, '-');
            a.download = `commission_report_${timestamp}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        })
        .catch(error => {
            console.error('Download error:', error);
            alert('Failed to download report.');
        });
    });

    // Download PDF report
    downloadPdfBtn.addEventListener('click', () => {
        if (!verificationResults) return;
        fetch('/download-pdf-report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reportData: verificationResults })
        })
        .then(response => response.blob())
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            const timestamp = new Date().toISOString().slice(0, 16).replace(/[:]/g, '-');
            a.download = `commission_report_${timestamp}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        })
        .catch(error => {
            console.error('Download error:', error);
            alert('Failed to download PDF report.');
        });
    });

    function showLoading() {
        loadingOverlay.style.display = 'flex';
    }

    function hideLoading() {
        loadingOverlay.style.display = 'none';
    }
});