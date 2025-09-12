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
