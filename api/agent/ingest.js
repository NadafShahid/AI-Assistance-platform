import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { createWorker } from 'tesseract.js';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  FIREBASE_BUCKET, serviceAccessToken, verifyFirebaseIdToken,
  downloadPrivateObject, deletePrivateObject
} from '../_lib/firebaseServer.js';
import { getQdrantClient, upsertQdrantDocuments } from '../../src/services/qdrantVectorStore.js';

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_BATCH_FILES = 200;
const MAX_ZIP_EXPANDED = 200 * 1024 * 1024;
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const MAX_CHUNK_CHARS = 1200;
const MAX_CHUNKS = 200;
const COLLECTION = process.env.QDRANT_COLLECTION || 'echo_agent_vectors';
const SUPPORTED_TEXT = /\.(txt|md|markdown|csv|tsv|json|sql|html?|css|scss|js|jsx|ts|tsx|vue|svelte|py|go|java|php|rb|prisma)$/i;
const PRIVATE_EXT = /\.(env|pem|key|p12|pfx|keystore|tfstate)$/i;
const PUBLIC_FIELD_NAMES = new Set(['name', 'title', 'product', 'description', 'publicdescription', 'price', 'publicprice', 'stock', 'stockstatus', 'availability', 'category', 'image', 'publicimage', 'sku', 'unit', 'question', 'answer', 'q', 'a', 'policy', 'hours', 'content']);
const FORBIDDEN_FIELD = /(?:email|phone|mobile|address|password|secret|token|api.?key|credential|customer|user.?id|tenant.?id|agent.?id|supplier|cost|margin|profit|internal|notes|admin|employee|payment|card|ssn|aadhaar|pan|dob)/i;

function json(res, status, value) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
}

function safeName(value) {
  return String(value || 'upload').split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180) || 'upload';
}

function splitText(text, title, sourceId, agentId, tenantId, sourcePath, sourceType = 'document') {
  const normalized = String(text || '').replace(/\u0000/g, ' ').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
  if (normalized.length < 30) return [];
  const paragraphs = normalized.split(/\n\s*\n|(?<=[.!?])\s+(?=[A-Z0-9])/u).map(s => s.trim()).filter(s => s.length >= 25);
  const chunks = [];
  let current = '';
  for (const paragraph of paragraphs) {
    const parts = paragraph.length > MAX_CHUNK_CHARS
      ? paragraph.match(new RegExp(`[\\s\\S]{1,${MAX_CHUNK_CHARS}}`, 'g')) || []
      : [paragraph];
    for (const part of parts) {
      if (current && current.length + part.length + 1 > MAX_CHUNK_CHARS) {
        chunks.push(current); current = '';
      }
      current += `${current ? '\n' : ''}${part}`;
    }
  }
  if (current) chunks.push(current);
  return chunks.map((content, index) => {
    const pageNumber = Number(content.match(/(?:^|\n)Page\s+(\d+)/i)?.[1] || 0) || null;
    const sheetName = content.match(/(?:^|\n)Sheet:\s*([^\n]+)/i)?.[1] || '';
    const section = content.match(/^#{1,4}\s+([^\n]+)/m)?.[1] || sheetName || title;
    return ({
    q: `${title}${chunks.length > 1 ? ` — passage ${index + 1}` : ''}`,
    a: content,
    source: safeName(sourcePath),
    sourceId,
    sourceType,
    documentId: sourceId,
    chunkId: `${sourceId}_${index}`,
    path: safeName(sourcePath),
    section,
    ...(pageNumber ? { pageNumber } : {}),
    title,
    visibility: 'PUBLIC',
    tenantId,
    agentId,
    lastUpdated: new Date().toISOString()
  });
  });
}

function csvRows(text) {
  const wb = XLSX.read(text, { type: 'string', raw: true, dense: true, sheetRows: 10001 });
  return wb.SheetNames.flatMap(sheet => XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: '', raw: false, blankrows: false }).map((row, index) => ({ ...row, __sourceSheet: sheet, __sourceRow: index + 2 })));
}

export function sqlProductRows(sql) {
  const rows = [];
  const statementPattern = /INSERT\s+INTO\s+[`"']?([a-zA-Z0-9_]+)[`"']?\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);/gi;
  for (const match of String(sql).matchAll(statementPattern)) {
    const table = match[1].toLowerCase();
    if (!/(?:products?|catalog|inventory|items?)/i.test(table)) continue;
    const columns = match[2].split(',').map(field => field.trim().replace(/^[`"']|[`"']$/g, ''));
    if (columns.some(column => FORBIDDEN_FIELD.test(column))) continue;
    const allowedColumns = columns.map(column => PUBLIC_FIELD_NAMES.has(column.toLowerCase().replace(/[^a-z]/g, '')) ? column : null);
    if (!allowedColumns.some(column => column && /^(name|title|product)$/i.test(column)) || !allowedColumns.some(column => column && /price|stock|availability|category|sku|description/i.test(column))) continue;
    const valuesText = match[3];
    const tuples = [];
    let tuple = '', quoted = false, quoteChar = '', depth = 0;
    for (let i = 0; i < valuesText.length; i++) {
      const char = valuesText[i];
      if (quoted) {
        tuple += char;
        if (char === quoteChar && valuesText[i - 1] !== '\\') quoted = false;
      } else if (char === "'" || char === '"') { quoted = true; quoteChar = char; tuple += char; }
      else if (char === '(') { if (depth++ > 0) tuple += char; }
      else if (char === ')') { if (--depth === 0) { tuples.push(tuple); tuple = ''; } else tuple += char; }
      else if (depth > 0) tuple += char;
    }
    for (const values of tuples) {
      const fields = [];
      let value = '', inQuote = false, quote = '';
      for (let i = 0; i < values.length; i++) {
        const char = values[i];
        if (inQuote) {
          if (char === quote && values[i - 1] !== '\\') inQuote = false;
          else value += char;
        } else if (char === "'" || char === '"') { inQuote = true; quote = char; }
        else if (char === ',') { fields.push(value.trim()); value = ''; }
        else value += char;
      }
      fields.push(value.trim());
      if (fields.length !== columns.length) continue;
      rows.push(Object.fromEntries(columns.map((column, index) => [column, fields[index]])));
    }
  }
  return rows;
}

export function inspectZipArchive(zip, priorExpandedBytes = 0) {
  const entries = Object.values(zip?.files || {}).filter(entry => !entry.dir && !entry.name.split('/').some(part => part.startsWith('.')));
  if (entries.length > MAX_BATCH_FILES) throw new Error('ZIP has more than 200 files');
  const expectedSize = entries.reduce((sum, entry) => sum + Number(entry._data?.uncompressedSize || 0), 0);
  if (expectedSize > MAX_ZIP_EXPANDED || priorExpandedBytes + expectedSize > MAX_ZIP_EXPANDED) throw new Error('ZIP expanded content exceeds 200 MB limit');
  return { entries, expectedSize };
}

export function publicRows(rows, sourceId, tenantId, agentId, fileName) {
  const allowlist = {};
  const records = [];
  const safeRows = [];
  const privateSource = /(?:customer|orders?|bookings?|users?|employees?|payments?)/i.test(fileName);
  for (const [rowIndex, row] of rows.slice(0, 1000).entries()) {
    if (privateSource || Object.keys(row || {}).some(key => FORBIDDEN_FIELD.test(key))) continue;
    const safe = {};
    for (const [key, value] of Object.entries(row || {})) {
      const normalized = key.toLowerCase().replace(/[^a-z]/g, '');
      if (!PUBLIC_FIELD_NAMES.has(normalized) || FORBIDDEN_FIELD.test(key) || value === '' || value === null || value === undefined || typeof value === 'object') continue;
      safe[key] = value;
    }
    const nameKey = Object.keys(safe).find(key => /^(name|title|product)$/i.test(key));
    if (!nameKey || !String(safe[nameKey]).trim()) continue;
    if (!['price', 'publicprice', 'stock', 'stockstatus', 'availability', 'category', 'sku', 'description', 'publicdescription'].some(key => Object.keys(safe).some(field => field.toLowerCase().replace(/[^a-z]/g, '') === key))) continue;
    const source = safeName(fileName);
    const collection = 'products';
    allowlist[collection] = [...new Set([...(allowlist[collection] || []), ...Object.keys(safe)])];
    records.push({ ...safe, collection, sourceId, tenantId, agentId, source: `${source}${row.__sourceSheet ? ` / ${row.__sourceSheet}` : ''}`, rowNumber: Number(row.__sourceRow || rowIndex + 2), section: row.__sourceSheet || '', visibility: 'PUBLIC' });
    safeRows.push(safe);
  }
  return { records, allowlist, safeRows };
}

function safeStructuredText(value, parentKey = '') {
  if (Array.isArray(value)) return value.map(item => safeStructuredText(item, parentKey)).filter(Boolean).join('\n');
  if (!value || typeof value !== 'object') {
    const key = parentKey.toLowerCase().replace(/[^a-z]/g, '');
    if (!PUBLIC_FIELD_NAMES.has(key) || FORBIDDEN_FIELD.test(parentKey)) return '';
    return String(value).trim();
  }
  const lines = [];
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_FIELD.test(key)) continue;
    const normalized = key.toLowerCase().replace(/[^a-z]/g, '');
    if (!PUBLIC_FIELD_NAMES.has(normalized)) continue;
    const text = safeStructuredText(child, key);
    if (text) lines.push(`${key}: ${text}`);
  }
  return lines.join('\n');
}

function stripHtml(text) {
  return String(text || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
}

function redactContactData(text) {
  return String(text || '')
    .replace(/^\s*(?:customer\s*(?:name|id)?|user\s*(?:name|id)?|email|e-mail|phone|mobile|address|supplier\s*(?:cost|name)?|internal\s*notes?|payment\s*(?:id|details?)?|password(?:\s*hash)?|api\s*key)\s*[:=].*$/gim, '[redacted private field]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted email]')
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '[redacted phone]');
}

async function ocrImage(buffer) {
  const worker = await createWorker(['eng', 'hin', 'mar']);
  try {
    const result = await worker.recognize(buffer);
    return String(result.data?.text || '').trim();
  } finally { await worker.terminate(); }
}

async function extractPdf(buffer, title) {
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true });
  const document = await task.promise;
  if (document.numPages > 500) { await task.destroy(); throw new Error('PDF exceeds the 500 page extraction limit'); }
  const pageTexts = [];
  for (let pageNo = 1; pageNo <= document.numPages; pageNo++) {
    const page = await document.getPage(pageNo);
    const content = await page.getTextContent();
    let text = content.items.map(item => item.str || '').join(' ').trim();
    if (text.length < 30) {
      const viewport = page.getViewport({ scale: 1.4 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      text = await ocrImage(canvas.toBuffer('image/png'));
    }
    if (text) pageTexts.push(`Page ${pageNo}\n${text}`);
  }
  await task.destroy();
  return pageTexts.join('\n\n');
}

export async function extractOne(name, buffer, context) {
  const ext = name.toLowerCase().split('.').pop();
  if (!buffer?.length) throw new Error('File is empty');
  if (buffer.length > MAX_FILE_BYTES) throw new Error('File exceeds 50 MB limit');
  if (PRIVATE_EXT.test(name)) throw new Error('Credential and environment files cannot be published as agent knowledge');
  let text = '';
  let rows = [];
  if (SUPPORTED_TEXT.test(name)) {
    if (buffer.length > MAX_TEXT_BYTES) throw new Error('Text file exceeds 8 MB extraction limit');
    text = new TextDecoder('utf-8').decode(buffer);
    if (ext === 'json') {
      let parsed;
      try { parsed = JSON.parse(text); } catch { throw new Error('Invalid JSON file'); }
      if (Array.isArray(parsed)) rows = parsed.filter(item => item && typeof item === 'object');
      else if (Array.isArray(parsed.products)) rows = parsed.products;
      else if (Array.isArray(parsed.items)) rows = parsed.items;
      else if (Array.isArray(parsed.records)) rows = parsed.records;
      text = safeStructuredText(parsed);
    } else if (ext === 'csv' || ext === 'tsv') {
      rows = csvRows(ext === 'tsv' ? text.replace(/\t/g, ',') : text);
      text = safeStructuredText(rows);
    } else if (ext === 'sql') {
      rows = sqlProductRows(text);
      text = '';
    } else if (ext === 'html' || ext === 'htm') {
      text = stripHtml(text);
    } else if (/\.(js|jsx|ts|tsx|vue|svelte|py|go|java|php|rb|prisma|css|scss)$/i.test(name)) {
      throw new Error('Source code is internal by default and was not added to public answer knowledge');
    }
  } else if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value || '';
    if (result.messages?.some(message => message.type === 'error')) throw new Error('Word document contains unsupported or corrupt content');
  } else if (ext === 'xlsx' || ext === 'xls') {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, cellFormula: false, sheetRows: 10001 });
    for (const sheetName of workbook.SheetNames) {
      const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false, blankrows: false }).map((row, index) => ({ ...row, __sourceSheet: sheetName, __sourceRow: index + 2 }));
      rows.push(...sheetRows);
      text += `\n\nSheet: ${sheetName}\n${safeStructuredText(sheetRows)}`;
    }
  } else if (ext === 'pdf') text = await extractPdf(buffer, name);
  else if (/^(png|jpe?g|webp|bmp|tiff?)$/i.test(ext)) text = await ocrImage(buffer);
  else throw new Error('Unsupported file type');

  if (rows.length) {
    const parsedRows = publicRows(rows, context.sourceId, context.tenantId, context.agentId, name);
    context.databaseRecords.push(...parsedRows.records);
    for (const [collection, fields] of Object.entries(parsedRows.allowlist)) context.publicFieldAllowlist[collection] = [...new Set([...(context.publicFieldAllowlist[collection] || []), ...fields])];
    const faqRows = /(?:customer|orders?|bookings?|users?|employees?|payments?)/i.test(name) ? [] : rows.filter(row => row && typeof row === 'object' && (typeof row.q === 'string' || typeof row.question === 'string') && (typeof row.a === 'string' || typeof row.answer === 'string'));
    text = parsedRows.safeRows.length ? safeStructuredText(parsedRows.safeRows) : safeStructuredText(faqRows);
  }
  text = redactContactData(text);
  if (!text.trim()) throw new Error('No public, readable content was found after filtering private fields');
  const title = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || name;
  return splitText(text, title, context.sourceId, context.agentId, context.tenantId, name, /\.(js|jsx|ts|tsx|py|go|java|php|rb|prisma|css|scss)$/i.test(name) ? 'source_code' : 'document');
}

async function loadFiles(files, tenantId, agentId, storageToken) {
  const context = { tenantId, agentId, databaseRecords: [], publicFieldAllowlist: {} };
  const chunks = [];
  const outcomes = [];
  let expandedBytes = 0;
  for (const file of files) {
    const path = String(file.path || '');
    if (!path.startsWith(`staging/${tenantId}/`) || path.includes('..')) {
      outcomes.push({ file: safeName(file.name), status: 'failed', reason: 'Upload path is not owned by the signed-in tenant' });
      continue;
    }
    const sourceId = randomUUID();
    try {
      const data = await downloadPrivateObject(path, storageToken);
      expandedBytes += data.length;
      if (data.length > MAX_FILE_BYTES) throw new Error('File exceeds 50 MB limit');
      if (/\.zip$/i.test(file.name)) {
        const zip = await JSZip.loadAsync(data, { checkCRC32: true });
        const { entries } = inspectZipArchive(zip, expandedBytes);
        const zipChunks = [];
        let fileFailures = 0;
        for (const entry of entries) {
          const childName = safeName(entry.name);
          try {
            const child = await entry.async('nodebuffer');
            expandedBytes += child.length;
            zipChunks.push(...await extractOne(childName, child, { ...context, sourceId: `${sourceId}_${randomUUID()}` }));
          } catch (error) {
            fileFailures++;
            outcomes.push({ file: `${safeName(file.name)} / ${childName}`, status: 'failed', reason: String(error.message || 'Extraction failed').slice(0, 180) });
          }
          if (expandedBytes > MAX_ZIP_EXPANDED) throw new Error('ZIP expanded content exceeds 200 MB limit');
        }
        chunks.push(...zipChunks);
        outcomes.push({ file: safeName(file.name), status: zipChunks.length ? 'extracted' : 'failed', extractedChunks: zipChunks.length, failedEntries: fileFailures, ...(zipChunks.length ? {} : { reason: 'No supported, readable knowledge was found in the ZIP' }) });
      } else {
        const extracted = await extractOne(safeName(file.name), data, { ...context, sourceId });
        chunks.push(...extracted);
        outcomes.push({ file: safeName(file.name), status: 'extracted', extractedChunks: extracted.length });
      }
    } catch (error) {
      outcomes.push({ file: safeName(file.name), status: 'failed', reason: String(error.message || 'Extraction failed').slice(0, 180) });
    }
  }
  return { chunks: chunks.slice(0, MAX_CHUNKS), outcomes, databaseRecords: context.databaseRecords, publicFieldAllowlist: context.publicFieldAllowlist };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  let claims;
  try { claims = await verifyFirebaseIdToken(req); } catch { claims = null; }
  if (!claims) return json(res, 401, { error: 'Sign in to process uploaded knowledge' });
  const files = Array.isArray(req.body?.files) ? req.body.files : [];
  const agentId = String(req.body?.agentId || '').trim();
  if (!agentId || agentId.length > 128 || !files.length || files.length > MAX_BATCH_FILES) return json(res, 400, { error: 'Provide an agent identifier and between 1 and 200 uploaded files' });
  if (!process.env.QDRANT_URL || !process.env.QDRANT_API_KEY || !process.env.OPENAI_API_KEY) return json(res, 503, { error: 'Knowledge indexing is not configured. Set server-side QDRANT_URL, QDRANT_API_KEY, and OPENAI_API_KEY before ingesting files.' });
  let storageToken;
  try {
    storageToken = await serviceAccessToken(['https://www.googleapis.com/auth/devstorage.read_write']);
    const result = await loadFiles(files, claims.user_id, agentId, storageToken);
    const successful = result.chunks.length;
    const failures = result.outcomes.filter(item => item.status === 'failed').length;
    if (!successful) return json(res, 422, { error: 'No useful knowledge was extracted; the agent was not created', files: result.outcomes, extractedChunks: 0 });
    const indexed = await upsertQdrantDocuments(result.chunks.map(chunk => ({ pageContent: `${chunk.q}\n${chunk.a}`, metadata: chunk })), {
      collectionName: COLLECTION, tenantId: claims.user_id, agentId,
      url: process.env.QDRANT_URL, apiKey: process.env.QDRANT_API_KEY
    });
    if (!indexed.success || indexed.backend !== 'qdrant_remote') throw new Error('Knowledge could not be indexed in the configured vector store');
    return json(res, 200, {
      success: true,
      files: result.outcomes,
      extractedFileCount: result.outcomes.filter(item => item.status === 'extracted').length,
      failedFileCount: failures,
      extractedChunks: successful,
      knowledgeBase: result.chunks,
      databaseRecords: result.databaseRecords,
      publicFieldAllowlist: result.publicFieldAllowlist,
      sourceSummary: result.outcomes.filter(item => item.status === 'extracted').map(item => item.file)
    });
  } catch (error) {
    console.error('[agent/ingest] Failed', { message: error?.message });
    return json(res, 503, { error: 'Uploaded files could not be safely processed. No agent was created.' });
  } finally {
    if (storageToken) {
      for (const file of files) {
        const path = String(file.path || '');
        if (path.startsWith(`staging/${claims.user_id}/`) && !path.includes('..')) await deletePrivateObject(path, storageToken).catch(() => {});
      }
    }
  }
}
