const xlsx = require('xlsx');

class CommissionProcessor {
    extractTransactionData(row, headerMap) {
        const getField = (fieldNames) => {
            return this.findFieldInRow(row, fieldNames, headerMap);
        };

        // Customer and location info
        const customerNo = getField(['customer no', 'customerno', 'customer_no']);
        const shipToState = getField(['ship to state', 'shiptosate', 'state']);
        const invoiceNo = getField(['invoice no', 'invoiceno', 'invoice_no']);
        const itemCode = getField(['item code', 'itemcode', 'item_code']);

        // Sales amount
        const salesAmount = parseFloat(String(getField(['total revenue', 'sales', 'total sales', 'revenue']) || 0).replace(/[,$]/g, '')) || 0;

        // Determine transaction type
        let isRepeat = false;
        let isNew = false;
        let isIncentive = false;

        // Check for purchase type indicators
        const purchaseType = getField(['customer_ current_period_new_product_sales', 'purchase type', 'product type', 'type']);
        if (purchaseType) {
            const typeStr = String(purchaseType).toLowerCase();
            isRepeat = typeStr.includes('repeat') || typeStr.includes('existing');
            isNew = typeStr.includes('new');
        }

        // Check for incentive indicators
        const incentiveFlag = getField(['incentive', 'incentivized', 'is incentive']);
        if (incentiveFlag) {
            isIncentive = this.parseBooleanField(incentiveFlag);
        }

        // Get reported commission from Excel file - prioritize total commission over repeat commission
        const reportedCommission = parseFloat(String(getField(['total commission', 'commission']) || 0).replace(/[,$]/g, '')) || 0;

        // Check if this is a new product sale
        const newProductSales = parseFloat(String(getField(['customer_ current_period_new_product_sales', 'new product sales', 'current period new product sales', 'new product sale']) || 0).replace(/[,$]/g, '')) || 0;
        if (newProductSales > 0) {
            isNew = true;
            isRepeat = false;
        }

        // Default to repeat if no type specified
        if (!isRepeat && !isNew && !isIncentive) {
            isRepeat = true;
        }

        return {
            customer_no: customerNo || '',
            ship_to_state: shipToState,
            invoice_no: invoiceNo || '',
            item_code: itemCode || '',
            total_discounted_sales: salesAmount,
            is_repeat_product: isRepeat,
            is_new_product: isNew,
            is_incentive: isIncentive,
            reported_commission: reportedCommission,
            new_product_sales: newProductSales
        };
    }

    findFieldInRow(row, fieldNames, headerMap) {
        for (const fieldName of fieldNames) {
            const normalizedField = this.normalizeFieldName(fieldName);
            for (const [header, index] of Object.entries(headerMap)) {
                if (this.normalizeFieldName(header) === normalizedField) {
                    return row[index];
                }
            }
        }
        return null;
    }

    normalizeFieldName(name) {
        return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    parseBooleanField(value) {
        if (!value) return false;
        const str = String(value).toLowerCase().trim();
        return str === 'true' || str === '1' || str === 'yes' || parseFloat(str) > 0;
    }
}

function debugCommissionExtraction() {
    const workbook = xlsx.readFile('ADAM_OCT2024.xlsx');
    const detailSheet = workbook.Sheets['COMMISSION DETAIL'];
    const data = xlsx.utils.sheet_to_json(detailSheet, { header: 1, raw: false });

    const processor = new CommissionProcessor();

    // Create header map
    const headers = data[0];
    const headerMap = {};
    headers.forEach((header, index) => {
        if (header) headerMap[header] = index;
    });

    console.log('=== TESTING COMMISSION EXTRACTION ===');
    console.log('Header map keys:', Object.keys(headerMap));

    let totalExtracted = 0;
    let repeatSum = 0;
    let newSum = 0;
    let incentiveSum = 0;
    let count = 0;

    console.log('\n=== FIRST 5 TRANSACTIONS ===');
    for (let i = 1; i <= 5 && i < data.length; i++) {
        const row = data[i];
        const transaction = processor.extractTransactionData(row, headerMap);

        console.log(`\nTransaction ${i}:`);
        console.log(`  State: ${transaction.ship_to_state}`);
        console.log(`  Sales: $${transaction.total_discounted_sales}`);
        console.log(`  Commission: $${transaction.reported_commission}`);
        console.log(`  Type: Repeat=${transaction.is_repeat_product}, New=${transaction.is_new_product}, Incentive=${transaction.is_incentive}`);
    }

    console.log('\n=== PROCESSING ALL TRANSACTIONS ===');
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const transaction = processor.extractTransactionData(row, headerMap);

        if (transaction.reported_commission > 0) {
            totalExtracted += transaction.reported_commission;
            count++;

            if (transaction.is_incentive) {
                incentiveSum += transaction.reported_commission;
            } else if (transaction.is_new_product) {
                newSum += transaction.reported_commission;
            } else {
                repeatSum += transaction.reported_commission;
            }
        }
    }

    console.log(`\nSUMMARY:`);
    console.log(`Total transactions processed: ${data.length - 1}`);
    console.log(`Transactions with commission: ${count}`);
    console.log(`Total extracted commission: $${totalExtracted.toFixed(2)}`);
    console.log(`Repeat commission: $${repeatSum.toFixed(2)}`);
    console.log(`New commission: $${newSum.toFixed(2)}`);
    console.log(`Incentive commission: $${incentiveSum.toFixed(2)}`);
    console.log(`Sum check: $${(repeatSum + newSum + incentiveSum).toFixed(2)}`);
}

debugCommissionExtraction();