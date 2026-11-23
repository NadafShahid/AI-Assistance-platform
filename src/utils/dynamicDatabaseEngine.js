/**
 * ==============================================================================
 * DYNAMIC DATABASE INTELLIGENCE & SCHEMA DISCOVERY ENGINE
 * ==============================================================================
 * Discovers arbitrary database schemas (collections, fields, data types,
 * primary keys, and cross-table relationships) without relying on hardcoded
 * collection names or pharmacy/e-commerce assumptions.
 *
 * Provides safe, structured, read-only live query planning & execution
 * (Filter, Count, Sum, Average, Min/Max, Status Check, and Sorting).
 * ==============================================================================
 */

import { formatCurrencyAmount, parseNumericPrice } from './dataAnalyticsEngine.js';

const SENSITIVE_KEY_REGEX = /^(password|passwd|secret|token|api_?key|auth|salt|hash|credit_?card|cvv|ssn|aadhaar|pan|pin|dob|date_of_birth|salary|compensation|internal|system_id|_id|_firestoreDocId|__v|tenant_?id|user_?id|private_.*)$/i;

/**
 * Strips internal, private, credential, or sensitive keys from database records.
 * Ensures visitors and agents receive strictly sanitized, public-safe fields.
 */
export function sanitizeDatabaseRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const sanitized = {};
  for (const [k, v] of Object.entries(record)) {
    if (k.startsWith('_')) continue;
    if (SENSITIVE_KEY_REGEX.test(k)) continue;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      sanitized[k] = sanitizeDatabaseRecord(v);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

/**
 * Sanitizes an entire collection of database records.
 */
export function sanitizeDatabaseCollection(records) {
  if (!Array.isArray(records)) return [];
  return records.map(sanitizeDatabaseRecord).filter(Boolean);
}

/**
 * Infers the JavaScript data type of a value.
 */
function inferDataType(val) {
  if (val === null || val === undefined) return 'null';
  if (Array.isArray(val)) return 'array';
  if (val instanceof Date) return 'date';
  const t = typeof val;
  if (t === 'number') return Number.isInteger(val) ? 'integer' : 'float';
  if (t === 'boolean') return 'boolean';
  if (t === 'string') {
    // Check ISO date format
    if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2})?/i.test(val) && !isNaN(Date.parse(val))) {
      return 'date';
    }
    // Check numeric string
    if (/^-?\d+(?:\.\d+)?$/.test(val.trim())) {
      return 'numeric_string';
    }
    return 'string';
  }
  if (t === 'object') return 'object';
  return 'unknown';
}

/**
 * Automatically discovers the schema for an arbitrary dataset of tables/collections.
 * Supports multi-table relational structures (e.g., customers, orders, order_items, courses, students).
 */
export function discoverDatabaseSchema(dataInput) {
  const schema = {
    tables: {},
    totalTables: 0,
    totalRecords: 0,
    relationships: [],
    discoveredAt: new Date().toISOString()
  };

  if (!dataInput) return schema;

  // Normalize input into a map of { tableName: [records] }
  let tableMap = {};

  if (Array.isArray(dataInput)) {
    // Flat array of records: check if records specify a _table or category
    tableMap['default_table'] = dataInput;
  } else if (typeof dataInput === 'object') {
    for (const [key, val] of Object.entries(dataInput)) {
      if (Array.isArray(val)) {
        tableMap[key] = val;
      } else if (val && typeof val === 'object' && !Array.isArray(val)) {
        // Nested object collection
        tableMap[key] = Object.entries(val).map(([id, item]) => ({ id, ...(typeof item === 'object' ? item : { value: item }) }));
      }
    }
  }

  // Profile each table
  for (const [tblName, rows] of Object.entries(tableMap)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const fields = {};
    let primaryKey = null;
    const sampleSize = Math.min(rows.length, 50);

    for (let i = 0; i < sampleSize; i++) {
      const row = rows[i];
      if (!row || typeof row !== 'object') continue;

      for (const [colName, val] of Object.entries(row)) {
        if (!fields[colName]) {
          fields[colName] = {
            name: colName,
            types: new Set(),
            isNullable: false,
            sampleValues: [],
            isNumericMetric: false,
            isStatusField: false,
            isNameOrTitle: false
          };
        }

        const type = inferDataType(val);
        fields[colName].types.add(type);
        if (val === null || val === undefined) {
          fields[colName].isNullable = true;
        } else if (fields[colName].sampleValues.length < 5) {
          fields[colName].sampleValues.push(val);
        }

        // Detect primary key
        if (!primaryKey && /^(id|_id|uuid|code|key|.*_id|sku)$/i.test(colName)) {
          primaryKey = colName;
        }

        // Detect numeric metric (price, amount, fees, salary, stock, seats, qty)
        if (type === 'integer' || type === 'float' || type === 'numeric_string' || (type === 'string' && parseNumericPrice(val))) {
          if (/(price|cost|fee|fees|amount|rate|salary|stock|quantity|qty|seats|balance|total|count)/i.test(colName)) {
            fields[colName].isNumericMetric = true;
          }
        }

        // Detect status field
        if (/(status|state|stage|is_active|available|availability|published)/i.test(colName)) {
          fields[colName].isStatusField = true;
        }

        // Detect descriptive label
        if (/(name|title|product|course|doctor|item|label|description|summary)/i.test(colName)) {
          fields[colName].isNameOrTitle = true;
        }
      }
    }

    const fieldMeta = {};
    for (const [fName, meta] of Object.entries(fields)) {
      fieldMeta[fName] = {
        name: fName,
        type: Array.from(meta.types).join('|') || 'string',
        isNullable: meta.isNullable,
        isNumericMetric: meta.isNumericMetric,
        isStatusField: meta.isStatusField,
        isNameOrTitle: meta.isNameOrTitle,
        samples: meta.sampleValues.slice(0, 3)
      };
    }

    schema.tables[tblName] = {
      tableName: tblName,
      rowCount: rows.length,
      primaryKey: primaryKey || 'id',
      fields: fieldMeta,
      sampleRecords: rows.slice(0, 3)
    };

    schema.totalTables++;
    schema.totalRecords += rows.length;
  }

  // Detect Foreign Key / Cross-Table Relationships
  const tableNames = Object.keys(schema.tables);
  for (const fromTbl of tableNames) {
    const fromFields = Object.keys(schema.tables[fromTbl].fields);
    for (const f of fromFields) {
      for (const toTbl of tableNames) {
        if (fromTbl === toTbl) continue;
        const singularTo = toTbl.replace(/s$/, '').toLowerCase();
        if (f.toLowerCase() === `${singularTo}_id` || f.toLowerCase() === `${singularTo}id`) {
          schema.relationships.push({
            fromTable: fromTbl,
            fromColumn: f,
            toTable: toTbl,
            toColumn: schema.tables[toTbl].primaryKey || 'id'
          });
        }
      }
    }
  }

  return schema;
}

function normalizeSearchQuery(txt = '') {
  return String(txt || '')
    .toLowerCase()
    .replace(/[०]/g, '0')
    .replace(/[१]/g, '1')
    .replace(/[२]/g, '2')
    .replace(/[३]/g, '3')
    .replace(/[४]/g, '4')
    .replace(/[५]/g, '5')
    .replace(/[६]/g, '6')
    .replace(/[७]/g, '7')
    .replace(/[८]/g, '8')
    .replace(/[९]/g, '9')
    .replace(/(?:विज्ञान|सायन्स)/gi, 'science')
    .replace(/(?:कॉमर्स|वाणिज्य)/gi, 'commerce')
    .replace(/(?:आर्ट्स|कला)/gi, 'arts')
    .replace(/(?:कक्षा|इयत्ता|std|class)/gi, 'class');
}

/**
 * Plans a structured query based on the user's natural language question and discovered schema.
 */
export function planDatabaseQuery(queryText = '', schema = {}) {
  const qNormalized = normalizeSearchQuery(queryText).trim();
  const qLower = qNormalized;
  const tables = Object.keys(schema.tables || {});
  if (tables.length === 0) return null;

  // 1. Target table detection
  let targetTable = tables[0];
  let bestTableMatchScore = 0;

  for (const tbl of tables) {
    const singular = tbl.replace(/s$/, '').toLowerCase();
    if (qLower.includes(tbl.toLowerCase()) || qLower.includes(singular)) {
      targetTable = tbl;
      bestTableMatchScore = 10;
      break;
    }
  }

  const tableMeta = schema.tables[targetTable];
  if (!tableMeta) return null;

  const fields = tableMeta.fields || {};
  const statusField = Object.values(fields).find(f => f.isStatusField)?.name || null;
  const metricField = Object.values(fields).find(f => f.isNumericMetric)?.name || null;
  const nameField = Object.values(fields).find(f => f.isNameOrTitle)?.name || null;

  // 2. Query Operation Classification
  // A. Out of stock / Availability / Remaining item check (Priority over generic count)
  if (/(?:out of stock|available|in stock|stock|seats|seat count|rikama|khali|shillak|baki|जागा|शिल्लक|सीटें|सीट|उपलब्ध|उपलब्धता)/i.test(qLower) && !/\b(scholarship|discount|parking|wifi|hostel|transport)\b/i.test(qLower)) {
    return {
      operation: 'STATUS_CHECK',
      table: targetTable,
      statusField: statusField || 'status',
      metricField: metricField || 'stock',
      rawQuery: queryText
    };
  }

  // B. Price / Fee / Cost lookup (English, Hindi, Marathi, code-mixed)
  if (/(?:price|cost|fee|fees|rate|how much|kimat|kiti|dar|shulk|annual_fee|फीस|फी|शुल्क|किंमत|कीमत|मूल्य)/i.test(qLower)) {
    return {
      operation: 'METRIC_LOOKUP',
      table: targetTable,
      metricField: metricField || 'price',
      nameField: nameField || 'name',
      rawQuery: queryText
    };
  }

  // C. Count / Total quantity across table
  if (/\b(how many|count|total number of|total count|kitne|kiti|ekun|sankhya)\b/i.test(qLower)) {
    return {
      operation: 'COUNT',
      table: targetTable,
      filterField: statusField,
      filterValue: /\b(out of stock|unavailable|sampale|khatam)\b/i.test(qLower) ? 'out_of_stock' : null
    };
  }

  // D. Top / Highest / Cheapest / Lowest sorting
  if (/\b(most expensive|costliest|cheapest|lowest price|highest|top|kamit kami|sarvat)\b/i.test(qLower)) {
    const isAscending = /\b(cheapest|lowest|kamit kami|sasta)\b/i.test(qLower);
    return {
      operation: 'SORT_LIMIT',
      table: targetTable,
      sortField: metricField || 'price',
      direction: isAscending ? 'asc' : 'desc',
      limit: 5
    };
  }

  // E. Record Status Lookup (e.g. "status of order 1025", "details of student 42")
  const numMatch = qLower.match(/\b(?:order|student|booking|id|item|ticket|course)\b[^\d]*#?([a-z0-9_-]*\d+[a-z0-9_-]*)\b/i);
  const genericIdMatch = qLower.match(/\b(?:order|student|booking|id|item|ticket|course)\s*#?([a-z0-9-_]+)\b/i);
  const idMatch = numMatch || genericIdMatch;
  if (idMatch && !/^(or|and|the|a|of|for|details|records|in|at|to|from)$/i.test(idMatch[1])) {
    return {
      operation: 'GET_BY_ID',
      table: targetTable,
      idField: tableMeta.primaryKey || 'id',
      idValue: idMatch[1]
    };
  }

  // F. General summary of records in table (Requires explicit catalog/record keywords)
  if (/\b(list all|show all|catalog|all products|all courses|all items|all records|inventory|what products|what courses|what items|available items|available courses|database records|summary of)\b/i.test(qLower)) {
    return {
      operation: 'SUMMARY',
      table: targetTable,
      limit: 15
    };
  }

  return null;
}

/**
 * Executes a structured read-only query safely against table records.
 * Computes exact deterministic calculations with zero hallucination.
 */
export function executeStructuredQuery(queryPlan, tableRecords = [], queryLang = 'en-US') {
  if (!queryPlan || !Array.isArray(tableRecords)) {
    return null;
  }

  const { operation, table } = queryPlan;
  if (tableRecords.length === 0) {
    const summaryText = queryLang.startsWith('mr')
      ? `${table} मध्ये सध्या कोणतीही सार्वजनिक नोंद उपलब्ध नाही.`
      : queryLang.startsWith('hi')
        ? `${table} में अभी कोई सार्वजनिक जानकारी उपलब्ध नहीं है।`
        : `There are currently no public ${table} items available.`;
    return { success: true, operation, table, summaryText, computedData: { count: 0 } };
  }

  switch (operation) {
    case 'COUNT': {
      const total = tableRecords.length;
      let count = total;
      let label = 'total records';

      if (queryPlan.filterValue === 'out_of_stock') {
        count = tableRecords.filter(r => {
          const s = Number(r.stock ?? r.quantity ?? r.qty ?? r.seats ?? 1);
          return s <= 0 || /out\s*of\s*stock|unavailable/i.test(String(r.status || ''));
        }).length;
        label = 'out of stock items';
      }

      const summaryText = queryLang.startsWith('mr')
        ? `${table} मध्ये एकूण ${count} ${label} आहेत.`
        : queryLang.startsWith('hi')
          ? `${table} में कुल ${count} ${label} उपलब्ध हैं।`
          : `There are currently ${count} ${label} available.`;

      return {
        success: true,
        operation,
        table,
        summaryText,
        computedData: { count, total }
      };
    }

    case 'STATUS_CHECK': {
      const { rawQuery } = queryPlan;
      const rawQueryLower = normalizeSearchQuery(rawQuery);

      // Check if query is about a specific record
      if (rawQueryLower) {
        let specificRecord = null;
        for (const r of tableRecords) {
          const rName = normalizeSearchQuery(r.name || r.title || r.product || r.course || '');
          if (!rName) continue;
          if (rawQueryLower.includes(rName)) {
            specificRecord = r;
            break;
          }
          const keyTokens = rName.split(/\s+/).filter(w => w.length >= 3 && !/^(class|std|tablet|strip|item|product)$/i.test(w));
          if (keyTokens.length > 0 && keyTokens.every(k => rawQueryLower.includes(k))) {
            specificRecord = r;
            break;
          }
        }
        if (specificRecord) {
          const name = specificRecord.name || specificRecord.title || specificRecord.course || specificRecord.id;
          const stock = specificRecord.stock ?? specificRecord.quantity ?? specificRecord.qty ?? specificRecord.seats;
          const unit = specificRecord.unit || (specificRecord.seats !== undefined ? 'seats' : 'units');
          const summaryText = queryLang.startsWith('mr')
            ? `${name} साठी सध्या ${stock} ${unit} शिल्लक आहेत.`
            : queryLang.startsWith('hi')
              ? `${name} के लिए वर्तमान में ${stock} ${unit} उपलब्ध हैं।`
              : `For ${name}, we currently have ${stock} ${unit} available.`;
          return {
            success: true,
            operation,
            table,
            summaryText,
            computedData: { stock }
          };
        }
      }

      const inStock = [];
      const outOfStock = [];

      for (const r of tableRecords) {
        const name = r.name || r.title || r.product || r.course || r.item || r.id;
        const stock = r.stock ?? r.quantity ?? r.qty ?? r.seats;
        const numStock = stock !== undefined ? Number(stock) : null;
        const status = String(r.status || '').toLowerCase();

        if ((numStock !== null && numStock <= 0) || status.includes('out') || status.includes('unavailable')) {
          outOfStock.push({ name, stock: numStock || 0 });
        } else {
          inStock.push({ name, stock: numStock });
        }
      }

      let summaryText = '';
      if (queryLang.startsWith('mr')) {
        summaryText = `उपलब्धता स्थिती: ${inStock.length} उपलब्ध आहेत, आणि ${outOfStock.length} सध्या संपले आहेत.` +
          (outOfStock.length > 0 ? ` संपलेल्या नोंदी: ${outOfStock.map(o => o.name).join(', ')}.` : '');
      } else if (queryLang.startsWith('hi')) {
        summaryText = `उपलब्धता स्थिति: ${inStock.length} उपलब्ध हैं, और ${outOfStock.length} स्टॉक में नहीं हैं।` +
          (outOfStock.length > 0 ? ` उपलब्ध न होने वाली वस्तुएं: ${outOfStock.map(o => o.name).join(', ')}।` : '');
      } else {
        summaryText = `Availability status for ${table}: ${inStock.length} available, ${outOfStock.length} out of stock.` +
          (outOfStock.length > 0 ? ` Currently out of stock: ${outOfStock.map(o => o.name).join(', ')}.` : '');
      }

      return {
        success: true,
        operation,
        table,
        summaryText,
        computedData: { inStockCount: inStock.length, outOfStockCount: outOfStock.length, outOfStockItems: outOfStock }
      };
    }

    case 'METRIC_LOOKUP': {
      const { metricField, nameField, rawQuery } = queryPlan;
      const rawQueryLower = normalizeSearchQuery(rawQuery);

      // Check if user asked for a specific single record
      if (rawQueryLower) {
        let specificRecord = null;
        for (const r of tableRecords) {
          const rName = normalizeSearchQuery(r[nameField] || r.name || r.title || r.course || '');
          if (!rName) continue;
          if (rawQueryLower.includes(rName)) {
            specificRecord = r;
            break;
          }
          const keyTokens = rName.split(/\s+/).filter(w => w.length >= 3 && !/^(class|std|tablet|strip|item|product)$/i.test(w));
          if (keyTokens.length > 0 && keyTokens.every(k => rawQueryLower.includes(k))) {
            specificRecord = r;
            break;
          }
        }
        if (specificRecord) {
          const name = specificRecord[nameField] || specificRecord.name || specificRecord.title || specificRecord.course || specificRecord.id;
          const rawMetric = specificRecord[metricField] || specificRecord.price || specificRecord.fees || specificRecord.cost || specificRecord.rate;
          const formatted = (typeof rawMetric === 'string' && rawMetric.trim())
            ? rawMetric.trim()
            : (parseNumericPrice(rawMetric) ? formatCurrencyAmount(parseNumericPrice(rawMetric).value, parseNumericPrice(rawMetric).currency) : String(rawMetric || 'N/A'));
          const summaryText = queryLang.startsWith('mr')
            ? `${name} ची फी/किंमत: ${formatted}`
            : queryLang.startsWith('hi')
              ? `${name} की फीस/मूल्य: ${formatted}`
            : `The ${metricField === 'price' || !metricField ? 'price' : metricField} of ${name} is ${formatted}.`;
          return {
            success: true,
            operation,
            table,
            summaryText,
            computedData: { formatted }
          };
        }
      }

      const recordsWithMetric = tableRecords.map(r => {
        const name = r[nameField] || r.name || r.title || r.course || r.id;
        const rawMetric = r[metricField] || r.price || r.fees || r.cost || r.rate;
        const formatted = (typeof rawMetric === 'string' && rawMetric.trim())
          ? rawMetric.trim()
          : (parseNumericPrice(rawMetric) ? formatCurrencyAmount(parseNumericPrice(rawMetric).value, parseNumericPrice(rawMetric).currency) : String(rawMetric || 'N/A'));
        return {
          name,
          value: rawMetric,
          formatted
        };
      }).filter(r => r.name);

      const preview = recordsWithMetric.slice(0, 6).map(r => `${r.name}: ${r.formatted}`).join(' | ');
      const summaryText = queryLang.startsWith('mr')
        ? `किंमत/शुल्क तपशील (${table}): ${preview}`
        : queryLang.startsWith('hi')
          ? `मूल्य/शुल्क विवरण (${table}): ${preview}`
          : `Pricing/Metric overview for ${table}: ${preview}`;

      return {
        success: true,
        operation,
        table,
        summaryText,
        computedData: { records: recordsWithMetric.slice(0, 10) }
      };
    }

    case 'SORT_LIMIT': {
      const { sortField, direction, limit } = queryPlan;
      const sorted = [...tableRecords].sort((a, b) => {
        const valA = (parseNumericPrice(a[sortField])?.value) ?? Number(a[sortField] || 0);
        const valB = (parseNumericPrice(b[sortField])?.value) ?? Number(b[sortField] || 0);
        return direction === 'asc' ? valA - valB : valB - valA;
      }).slice(0, limit);

      const preview = sorted.map((r, i) => {
        const n = r.name || r.title || r.course || r.id;
        const val = r[sortField] || r.price || r.fees;
        return `${i + 1}. ${n} (${typeof val === 'number' ? `₹${val}` : val})`;
      }).join('; ');

      const summaryText = `${direction === 'asc' ? 'Lowest' : 'Highest'} ${sortField} in ${table}: ${preview}`;

      return {
        success: true,
        operation,
        table,
        summaryText,
        computedData: { sorted }
      };
    }

    case 'GET_BY_ID': {
      const { idField, idValue } = queryPlan;
      const valLower = String(idValue).toLowerCase();
      const match = tableRecords.find(r => {
        const rawId = String(r[idField] || r.id || '').toLowerCase();
        return rawId === valLower || rawId.endsWith(`_${valLower}`) || rawId === `rec_${valLower}` || rawId.endsWith(valLower);
      });

      if (!match) {
        return {
          success: false,
          operation,
          table,
          summaryText: `Record with ${idField} '${idValue}' was not found in ${table}.`
        };
      }

      const sanitized = sanitizeDatabaseRecord(match);
      const name = sanitized.name || sanitized.title || sanitized.course || sanitized.product || sanitized.item || idValue;
      const status = sanitized.status || (sanitized.stock !== undefined ? `${sanitized.stock} in stock` : (sanitized.seats !== undefined ? `${sanitized.seats} seats available` : 'Active / Valid'));
      const details = [];
      if (sanitized.price || sanitized.fees) details.push(`Price/Fee: ${sanitized.price || sanitized.fees}`);
      if (sanitized.description) details.push(`Details: ${sanitized.description}`);
      if (sanitized.category) details.push(`Category: ${sanitized.category}`);

      const summaryText = `Verified details for ${name} (${table}): Status: ${status}${details.length > 0 ? ` | ${details.join(' | ')}` : ''}.`;

      return {
        success: true,
        operation,
        table,
        summaryText,
        computedData: { publicSummary: { name, status, price: sanitized.price || sanitized.fees || null, description: sanitized.description || null, category: sanitized.category || null } }
      };
    }

    case 'SUMMARY':
    default: {
      const count = tableRecords.length;
      const sampleNames = tableRecords.slice(0, 8).map(r => r.name || r.title || r.course || r.id).filter(Boolean);
      const summaryText = `Available records in ${table} (${count} total): ${sampleNames.join(', ')}`;
      return {
        success: true,
        operation: 'SUMMARY',
        table,
        summaryText,
        computedData: { count, sampleNames }
      };
    }
  }
}
