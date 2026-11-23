import assert from 'node:assert/strict';
import JSZip from 'jszip';
import XLSX from 'xlsx';
import { extractOne, sqlProductRows, inspectZipArchive } from '../api/agent/ingest.js';

function context() { return { tenantId: 'tenant-a', agentId: 'agent-a', sourceId: 'source-a', databaseRecords: [], publicFieldAllowlist: {} }; }
async function expectFailure(name, bytes, message) {
  await assert.rejects(() => extractOne(name, bytes, context()), message);
}

const markdown = Buffer.from('# Return Policy\n\nCustomers may return unused items within thirty calendar days after delivery with a valid receipt.');
const mdChunks = await extractOne('returns.md', markdown, context());
assert(mdChunks.length && mdChunks[0].path === 'returns.md' && mdChunks[0].sourceId === 'source-a');

const csv = Buffer.from('name,price,stock,category\nDesk Lamp,500,4,Lighting\n');
const csvContext = context();
const csvChunks = await extractOne('products.csv', csv, csvContext);
assert(csvChunks.length && csvContext.databaseRecords[0].name === 'Desk Lamp');
assert.deepEqual(csvContext.publicFieldAllowlist.products.sort(), ['category', 'name', 'price', 'stock']);
const archive = new JSZip();
archive.file('data/products.csv', csv);
const archiveBytes = await archive.generateAsync({ type: 'nodebuffer' });
const loadedArchive = await JSZip.loadAsync(archiveBytes, { checkCRC32: true });
const zipEntry = Object.values(loadedArchive.files).find(entry => !entry.dir);
assert((await extractOne(zipEntry.name, await zipEntry.async('nodebuffer'), context())).length);
await expectFailure('customers.csv', Buffer.from('name,email\nCustomer One,person@example.test\n'), /No public, readable content/);

const jsonContext = context();
const jsonChunks = await extractOne('catalog.json', Buffer.from(JSON.stringify([{ name: 'Desk Lamp', price: 500, description: 'A dimmable desk lamp with adjustable height and a warm LED bulb.' }])), jsonContext);
assert(jsonChunks.length && jsonContext.databaseRecords.length === 1);

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['name', 'price', 'stock'], ['Desk Lamp', 500, 4]]), 'Products');
const xlsxContext = context();
const xlsxChunks = await extractOne('catalog.xlsx', XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), xlsxContext);
assert(xlsxChunks.length && xlsxContext.databaseRecords[0].name === 'Desk Lamp');

const docx = new JSZip();
docx.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
docx.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
docx.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Customers may return unused items within thirty calendar days after delivery with a valid receipt.</w:t></w:r></w:p></w:body></w:document>');
const docxBytes = await docx.generateAsync({ type: 'nodebuffer' });
assert((await extractOne('policy.docx', docxBytes, context())).length);

function makePdf(text) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const bodies = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  bodies.forEach((body, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}
assert((await extractOne('policy.pdf', makePdf('Returns are accepted within thirty calendar days after delivery with a valid receipt.'), context())).length);

const sql = "INSERT INTO products (name, price, stock) VALUES ('Desk Lamp', 500, 4);";
assert.equal(sqlProductRows(sql)[0].name, 'Desk Lamp');
const sqlContext = context();
assert((await extractOne('products.sql', Buffer.from(sql), sqlContext)).length);
assert.equal(sqlContext.databaseRecords[0].name, 'Desk Lamp');

await expectFailure('empty.txt', Buffer.alloc(0), /File is empty/);
await expectFailure('malformed.json', Buffer.from('{broken'), /Invalid JSON/);
await expectFailure('credentials.env', Buffer.from('SECRET=value'), /cannot be published/);
await expectFailure('unknown.bin', Buffer.from([0, 1, 2, 3]), /Unsupported file type/);
await expectFailure('broken.docx', Buffer.from('not a zip file'), /corrupt|zip|central/i);
await expectFailure('oversized.txt', Buffer.alloc(50 * 1024 * 1024 + 1), /50 MB/);

const exactlyTwoHundred = { files: Object.fromEntries(Array.from({ length: 200 }, (_, index) => [`${index}.txt`, { name: `${index}.txt`, dir: false, _data: { uncompressedSize: 1 } }])) };
assert.equal(inspectZipArchive(exactlyTwoHundred).entries.length, 200);
const tooManyFiles = { files: { ...exactlyTwoHundred.files, '200.txt': { name: '200.txt', dir: false, _data: { uncompressedSize: 1 } } } };
assert.throws(() => inspectZipArchive(tooManyFiles), /more than 200 files/);
assert.throws(() => inspectZipArchive({ files: { 'large.txt': { name: 'large.txt', dir: false, _data: { uncompressedSize: 200 * 1024 * 1024 + 1 } } } }), /200 MB/);

console.log('PASS: PDF, Markdown, CSV, JSON, XLSX, DOCX, SQL, private-field rejection, malformed/empty/unsupported and file/ZIP limit fixtures');
