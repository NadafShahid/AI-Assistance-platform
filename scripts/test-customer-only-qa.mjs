/**
 * Automated Verification: Customer-Only Training & Developer/Database Query Elimination
 */
import assert from 'node:assert';
import fs from 'node:fs';
import { isCustomerSafeFaq, analyzeDatabaseFile } from '../src/utils/codebaseAnalyzer.js';
import { extractKnowledgeFromJson } from '../src/utils/aiKnowledgeExtractor.js';

console.log('🧪 Starting Customer-Only Training & Developer Query Elimination Tests...\n');

// Test 1: Verify isCustomerSafeFaq blocks technical developer/database questions
console.log('Test 1: Blocking technical developer/database questions...');
const technicalQuestions = [
  'What tables are in the database?',
  'What is the database schema?',
  'How to run a SQL query?',
  'What is the foreign key for orders?',
  'Show me the database tables',
  'What is the postgres connection string?',
  'What is the API key and secret?',
  'What is the table_name?',
  'SELECT * FROM products;',
  'What is varchar(255)?',
  'What are the details of Augmentin 625?'
];

for (const q of technicalQuestions) {
  const isSafe = isCustomerSafeFaq(q, 'Some answer');
  assert(!isSafe, `Technical question must be rejected: "${q}"`);
}
console.log('✓ Test 1 Passed: All technical developer/database questions strictly rejected.');

// Test 2: Verify isCustomerSafeFaq allows genuine customer questions
console.log('\nTest 2: Approving genuine customer-facing questions...');
const customerQuestions = [
  { q: 'What is Dolo 650 Tablet?', a: 'Dolo 650 Tablet is available at ₹30.00. Available in stock: 15 Strip. Paracetamol for fever.' },
  { q: 'How much does Augmentin 625 cost?', a: 'The price of Augmentin 625 is ₹185.50 per strip.' },
  { q: 'Is Nike Air Max in stock?', a: 'Yes, we have 25 pairs available in stock.' },
  { q: 'What are your store hours?', a: 'We are open Monday to Saturday from 9 AM to 9 PM.' },
  { q: 'Where are you located?', a: 'We are located at 123 MG Road, Mumbai.' },
  { q: 'What is your return policy?', a: 'Items can be returned within 14 days of purchase with a receipt.' }
];

for (const { q, a } of customerQuestions) {
  const isSafe = isCustomerSafeFaq(q, a);
  assert(isSafe, `Customer question must be accepted: "${q}"`);
}
console.log('✓ Test 2 Passed: All genuine customer questions approved.');

// Test 3: Database JSON with internal columns must NOT create raw object dumps
console.log('\nTest 3: Ingesting database JSON rows without dumping internal columns...');
const rawDbJson = JSON.stringify([
  {
    id: 101,
    name: "Augmentin 625 Duo Tablet",
    price: "₹185.50",
    stock: 42,
    unit: "Strip",
    created_at: "2024-01-01T10:00:00Z",
    updated_at: "2024-02-01T12:00:00Z",
    supplier_id: 889,
    internal_sku: "AUG-625-GSK",
    deleted_at: null,
    is_active: 1
  }
]);

const analyzed = analyzeDatabaseFile('inventory.json', rawDbJson);
assert(analyzed.databaseRecords.length === 1, 'Should extract 1 database record');
assert(analyzed.databaseRecords[0].name === 'Augmentin 625 Duo Tablet', 'Name must match');

// Check knowledge base
for (const entry of analyzed.knowledgeBase) {
  assert(!entry.a.includes('supplier_id'), 'Answer must NOT dump supplier_id');
  assert(!entry.a.includes('created_at'), 'Answer must NOT dump created_at');
  assert(!entry.a.includes('internal_sku'), 'Answer must NOT dump internal_sku');
  assert(!entry.q.includes('details of'), 'Question must NOT be mechanical details dump');
}
console.log('✓ Test 3 Passed: Zero internal database columns leaked into Knowledge Base.');

// Test 4: Verify widget.js Customer-Only Prompt Contract
console.log('\nTest 4: Verifying widget.js Customer-Only Prompt Contract...');
const widgetSrc = fs.readFileSync('public/widget.js', 'utf-8');
assert(widgetSrc.includes('AUDIENCE IS CONSUMER / CUSTOMER ONLY'), 'widget.js must declare consumer-only audience');
assert(widgetSrc.includes('NEVER answer technical database queries, schema questions'), 'widget.js must forbid database query answers');
console.log('✓ Test 4 Passed: widget.js prompt contains strict customer-only rules.');

// Test 5: Verify the single production answer engine enforces customer-only interactions.
console.log('\nTest 5: Verifying central backend Customer-Only Rule...');
const centralSrc = fs.readFileSync('src/services/centralAiEngine.js', 'utf-8');
assert(centralSrc.includes('STRICT CUSTOMER-ONLY INTERACTIONS'), 'central AI engine must include customer-only rule');
assert(!fs.readFileSync('src/services/aiCompletionService.js', 'utf-8').includes('export async function generateAIResponse'), 'Browser answer generation must not remain as a parallel production path');
console.log('✓ Test 5 Passed: answer generation is centralized and customer-only.');

console.log('\n🎉 ALL CUSTOMER-ONLY TRAINING & DEVELOPER QUERY ELIMINATION TESTS PASSED 100%! 🚀');
