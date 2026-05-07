const fs = require('fs/promises');
const { Parser } = require('json2csv');
const { parse } = require('csv-parse/sync');

function normalizeCsvValue(value) {
    if (value instanceof Date) {
        return value.toISOString();
    }

    if (value && typeof value === 'object') {
        return JSON.stringify(value);
    }

    return value;
}

async function writeRowsToCsv(filePath, rows = []) {
    const normalizedRows = rows.map((row) => {
        const normalizedRow = {};

        Object.entries(row || {}).forEach(([key, value]) => {
            normalizedRow[key] = normalizeCsvValue(value);
        });

        return normalizedRow;
    });

    const fields = normalizedRows.length ? Object.keys(normalizedRows[0]) : [];
    const parser = new Parser({ fields });
    const csv = normalizedRows.length ? parser.parse(normalizedRows) : fields.join(',');

    await fs.writeFile(filePath, `${csv}\n`, 'utf8');
}

function coerceCsvValue(value) {
    if (value === '') return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);

    try {
        if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
            return JSON.parse(value);
        }
    } catch {
        return value;
    }

    return value;
}

async function readCsvAsJson(filePath) {
    const csvContent = await fs.readFile(filePath, 'utf8');
    const rows = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
    });

    return rows.map((row) => {
        const normalizedRow = {};

        Object.entries(row).forEach(([key, value]) => {
            normalizedRow[key] = coerceCsvValue(value);
        });

        return normalizedRow;
    });
}

module.exports = {
    writeRowsToCsv,
    readCsvAsJson,
};
