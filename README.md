# Thinkazoo Commission Verification Web App
**© 2025 Adam Gurley - All Rights Reserved**

## Overview
A professional, security-enhanced web application for verifying commission calculations. Features a modern cyber-themed interface with comprehensive verification capabilities and enterprise-level security.

## 🔒 Security Features
- **HTTP Security Headers**: XSS, clickjacking, and MIME sniffing protection
- **Content Security Policy**: Prevents code injection attacks
- **Input Sanitization**: All user inputs are sanitized and validated
- **File Upload Security**: Strict validation and automatic cleanup
- **CORS Protection**: Domain-restricted in production
- **Client-Side Protection**: Developer tools blocking and data cleanup
- **Copyright Protection**: Comprehensive intellectual property protection

## Features
- **Excel File Upload**: Drag & drop or browse to upload commission data
- **Real-time Verification**: Instant validation against official commission structure
- **State Analysis**: Breakdown by state with tier classification and bonuses
- **Discrepancy Detection**: Identifies calculation errors with detailed reporting
- **Downloadable Reports**: Generate CSV reports for record keeping
- **Mobile Responsive**: Works on all devices with touch support
- **Secure Processing**: No data retention, secure file handling

## Commission Structure Verified
- **Tier 1 ($0-$9,999)**: Repeat 2%, New Product 3%
- **Tier 2 ($10k-$49.9k)**: Repeat 1%, New Product 2% + $100 state bonus
- **Tier 3 ($50k+)**: Repeat 0.5%, New Product 1.5% + $300 state bonus
- **Incentivized SKUs**: Fixed 3%+ (varies by product)

## Deployment Instructions

### Digital Ocean App Platform
1. Create a new app in Digital Ocean App Platform
2. Connect your GitHub repository
3. Use the following configuration:
   - **Runtime**: Node.js
   - **Build Command**: `npm install`
   - **Run Command**: `npm start`
   - **Port**: 8080
   - **Instance Size**: Basic (512MB RAM)

### Environment Variables
```
NODE_ENV=production
PORT=8080
```

### Custom Domain Setup
1. Add `ourfloworks.com` as a custom domain
2. Update DNS records to point to Digital Ocean
3. Enable SSL certificate (automatic)

## Local Development
```bash
npm install
npm start
# App runs on http://localhost:8080
```

## File Structure
```
commission-webapp/
├── server.js              # Express server with verification logic
├── package.json           # Dependencies and scripts
├── public/
│   ├── index.html         # Main web interface
│   ├── script.js          # Frontend JavaScript
│   ├── style.css          # Cyber-themed styling
│   └── dllogoonly.png     # DL Wholesale logo
├── uploads/               # Temporary Excel upload directory
└── README.md             # This file
```

## API Endpoints
- `GET /` - Main web interface
- `POST /verify-commission` - Upload and verify Excel workbook
- `POST /download-report` - Generate verification report

## Usage Instructions
1. Upload xls or xlsx file to the web app
2. Review verification results
3. Download detailed report if needed

## Additional Security Controls
- File type validation
- File size limits (50MB max)
- Temporary file cleanup
- Input sanitization
- CORS protection

## Browser Support
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS/Android)

## Technical Stack
- **Backend**: Node.js + Express
- **Frontend**: Vanilla JavaScript + Custom CSS
- **File Processing**: Multer + XLSX Parser
- **Styling**: Custom cyber theme with animations
- **Deployment**: Digital Ocean App Platform

## Support
For technical support or feature requests, contact the development team.

---
© 2025 Adam Gurley - Thinkaszoo Commission Verifier

