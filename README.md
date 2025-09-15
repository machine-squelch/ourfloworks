# Thinkazoo Commission Verifier - Production Package
**© 2025 Adam Gurley - All Rights Reserved**

## 🚀 Quick Start

```bash
npm install
npm start
```

The application will be available at `http://localhost:8080`

## 📁 Package Contents

This production package contains only the essential files needed to run the commission verification application:

```
commission-verifier-final/
├── server.js              # Main Express server
├── package.json           # Dependencies and scripts
├── package-lock.json      # Locked dependency versions
├── public/                # Frontend assets
│   ├── index.html         # Main web interface
│   ├── script.js          # Frontend JavaScript
│   ├── style.css          # Cyber-themed styling
│   └── dllogoonly.png     # DL Wholesale logo
├── uploads/               # Temporary file upload directory
└── README.md             # This file
```

## 🌐 Deployment Options

### Option 1: Digital Ocean App Platform (Recommended)
1. Create new app in Digital Ocean
2. Connect this repository
3. Configure:
   - **Runtime**: Node.js
   - **Build Command**: `npm install`
   - **Run Command**: `npm start`
   - **Port**: 8080

### Option 2: Heroku
1. Install Heroku CLI
2. `heroku create your-app-name`
3. `git push heroku main`

### Option 3: Railway
1. Connect GitHub repository
2. Deploy automatically

### Option 4: Vercel/Netlify (Serverless)
1. Add `vercel.json` or `netlify.toml` configuration
2. Deploy via Git integration

## 🔧 Environment Variables

```
NODE_ENV=production
PORT=8080
```

## 📊 Commission Structure

- **Tier 1 ($0-$9,999)**: Repeat 2%, New Product 3%
- **Tier 2 ($10k-$49.9k)**: Repeat 1%, New Product 2% + $100 bonus
- **Tier 3 ($50k+)**: Repeat 0.5%, New Product 1.5% + $300 bonus
- **Incentivized SKUs**: Fixed 3%+

## 📋 Data Format Requirements

Upload CSV files with these columns:
- `CustomerNo`, `ShipToState`, `InvoiceNo`, `ItemCode`
- `TransactionDate`, `QuantityShipped`, `UnitPrice`
- `DiscountedRevenue`, `Total Commission`
- Commission breakdown fields

**Important**: Export the DETAIL tab from Google Sheets, not summary data.

## 🔒 Security Features

- HTTP security headers (XSS, clickjacking protection)
- Content Security Policy
- Input sanitization and validation
- File upload restrictions (CSV only, 10MB max)
- Automatic file cleanup
- CORS protection

## 🎯 Features

- **Drag & Drop Upload**: Easy CSV file upload
- **Real-Time Verification**: Instant commission validation
- **State Analysis**: Breakdown by state with tier classification
- **Discrepancy Detection**: Identifies calculation errors
- **Mobile Responsive**: Works on all devices
- **Downloadable Reports**: Generate verification reports

## 🛠️ Technical Stack

- **Backend**: Node.js + Express
- **Frontend**: Vanilla JavaScript + Tailwind CSS
- **File Processing**: Multer + CSV Parser
- **Styling**: Custom cyber theme with animations

## 📱 Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS/Android)

## 🔧 Local Development

```bash
# Install dependencies
npm install

# Start development server
npm start

# Access application
open http://localhost:8080
```

## 📞 Support

For technical support or feature requests, contact the development team.

---

**Ready for immediate deployment and use!**

