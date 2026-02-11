const fs = require('fs');
const path = require('path');

// Read a few CSV files and check rows with passed=0
const DATA_DIR = path.join(__dirname, 'Columbus-OH');

function parseCSV(text) {
    const rows = [];
    let i = 0;
    const len = text.length;
    while (i < len) {
        const row = [];
        while (i < len) {
            if (text[i] === '"') {
                i++;
                let field = '';
                while (i < len) {
                    if (text[i] === '"') {
                        if (i + 1 < len && text[i + 1] === '"') { field += '"'; i += 2; }
                        else { i++; break; }
                    } else { field += text[i]; i++; }
                }
                row.push(field);
            } else {
                let field = '';
                while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') { field += text[i]; i++; }
                row.push(field);
            }
            if (i < len && text[i] === ',') { i++; } else { break; }
        }
        if (i < len && text[i] === '\r') i++;
        if (i < len && text[i] === '\n') i++;
        if (row.length > 1) rows.push(row);
    }
    return rows;
}

const files = fs.readdirSync(DATA_DIR).filter(f => f.includes('Voted-Items.csv'));
let count = 0;
for (const f of files) {
    const text = fs.readFileSync(path.join(DATA_DIR, f), 'utf-8');
    const rows = parseCSV(text);
    const headers = rows[0];
    const passedIdx = headers.indexOf('passed');
    const titleIdx = headers.indexOf('title');
    const actionIdx = headers.indexOf('action');
    const actionTextIdx = headers.indexOf('action_text');
    const matterStatusIdx = headers.indexOf('matter_status_name');

    for (let r = 1; r < rows.length; r++) {
        if (rows[r][passedIdx] === '0') {
            count++;
            console.log('File:', f);
            console.log('  title:', (rows[r][titleIdx] || '').substring(0, 100));
            console.log('  action:', (rows[r][actionIdx] || '').substring(0, 100));
            console.log('  action_text:', (rows[r][actionTextIdx] || '').substring(0, 150));
            console.log('  matter_status:', rows[r][matterStatusIdx]);
            console.log('');
        }
    }
}
console.log('Total passed=0 rows:', count);
