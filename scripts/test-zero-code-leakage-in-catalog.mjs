/** Regression suite for safe ingestion and the secure published widget path. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  detectFileType, analyzeFullStackFiles, isValidCustomerCatalogName, isCustomerSafeFaq
} from '../src/utils/codebaseAnalyzer.js';

console.log('ZERO CODE LEAKAGE AND SECURE WIDGET REGRESSION SUITE');

const uploadedFiles = [
  { name: 'firebase-database.js', content: "await fetch('/api/admissions', { method: 'POST', body: JSON.stringify({ firstName }) });" },
  { name: 'script.js', content: "document.getElementById('apply').addEventListener('click', e => e.preventDefault());" },
  { name: 'README.md', content: '# Admin guide\n- click Deploy as Web App\n- Open your sheet' },
  { name: 'index.html', content: '<section><h2>Courses</h2><div class="course-card"><h3>Std 11th - 12th Science</h3><p>Physics, Chemistry and Mathematics</p><span>₹25,000 / year</span></div></section>' }
];
assert.equal(detectFileType(uploadedFiles[0].name, uploadedFiles[0].content), 'backend');
assert.equal(detectFileType(uploadedFiles[1].name, uploadedFiles[1].content), 'frontend');
const analysis = analyzeFullStackFiles(uploadedFiles);
assert(analysis.databaseRecords.some(row => row.name === 'Std 11th - 12th Science'));
assert(!analysis.databaseRecords.some(row => /firstName|method:|sdkDb|res\.json/i.test(row.name)));
assert(!(analysis.combinedKnowledge || []).some(entry => /deploy as web app|open your sheet/i.test(`${entry.q} ${entry.a}`)));

for (const name of ['Std 11th - 12th Science', 'B.Sc Computer Science', 'Dolo 650mg Tablet', 'iPhone 16 Pro', 'Paneer Tikka Masala']) {
  assert(isValidCustomerCatalogName(name), `Expected public catalog item: ${name}`);
}
for (const name of ['firstName: firstName', 'method: POST', 'sdkDb.collection', 'user_id', '.replace']) {
  assert(!isValidCustomerCatalogName(name), `Rejected code artifact: ${name}`);
}
assert(!isCustomerSafeFaq('How do I query the database schema?', 'SELECT * FROM customers'));

const widget = fs.readFileSync('public/widget.js', 'utf8');
const api = fs.readFileSync('api/agent/query.js', 'utf8');
const packager = fs.readFileSync('src/utils/agentPackager.js', 'utf8');
const manageApi = fs.readFileSync('api/agent/manage.js', 'utf8');
assert(widget.includes('/api/agent/query'));
for (const unsafe of ['databaseRecords', 'databaseConfig', 'supabaseKey', 'firestore.googleapis.com', 'api.groq.com', 'api.openai.com']) assert(!widget.includes(unsafe), `Widget leaked ${unsafe}`);
assert(api.includes("firestoreGet('public_agents'") && api.includes("firestoreGet('private_agents'"));
assert(api.includes('privateAgentDocumentId') && api.includes('priv.tenantId') && api.includes('sanitizePublicRecords'));
assert(manageApi.includes('claims.user_id') && manageApi.includes('tenantId: claims.user_id') && manageApi.includes('public_agents'));
assert(!/database:\s*agent\.(?:database|databaseConfig|dbRecords|databaseRecords)/.test(packager));

console.log('PASS: ingestion, catalog validation, and public widget data boundary');
