import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizePublicRecords } from '../src/utils/publicDataSanitizer.js';
import { privateAgentDocumentId } from '../api/_lib/firebaseServer.js';
import { autoDevelopAgentFromBrief } from '../src/utils/autoAgentDeveloper.js';

const records = [{
  name: 'Public Item', price: 500, stock: 3, email: 'customer@example.test', phone: '+1 555 555 5555',
  address: '12 Secret Lane', supplierCost: 80, internalNotes: 'never expose', customerId: 'c-1', tenantId: 'tenant-a',
  passwordHash: 'hash', apiKey: 'private', sku: 'PUB-1', collection: 'products'
}];
const exposed = sanitizePublicRecords(records, { products: ['name', 'price', 'stock', 'sku', 'email', 'phone', 'address', 'supplierCost', 'internalNotes', 'customerId', 'tenantId', 'passwordHash', 'apiKey'] });
assert.deepEqual(exposed, [{ name: 'Public Item', price: 500, stock: 3, sku: 'PUB-1' }]);
assert.notEqual(privateAgentDocumentId('tenant-a', 'agent-x'), privateAgentDocumentId('tenant-b', 'agent-x'));
const briefAgent = await autoDevelopAgentFromBrief('Financial consultancy with a meeting room');
assert.deepEqual(briefAgent.knowledgeBase, [], 'A short agent brief must not invent business facts');
assert.match(briefAgent.greeting, /^Hello!/);

const queryApi = fs.readFileSync(new URL('../api/agent/query.js', import.meta.url), 'utf8');
const widget = fs.readFileSync(new URL('../public/widget.js', import.meta.url), 'utf8');
const qdrant = fs.readFileSync(new URL('../src/services/qdrantVectorStore.js', import.meta.url), 'utf8');
const firestoreRules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
assert(queryApi.includes('reply: String(result.reply') && queryApi.includes('conversationId'));
for (const forbidden of ['databaseToolResult', 'rawChunks', 'queryPlan', 'schema', 'toolTrace']) assert(!queryApi.includes(`response.${forbidden}`));
for (const forbidden of ['databaseRecords', 'supabaseKey', 'firestore.googleapis.com', 'api.groq.com', 'api.openai.com']) assert(!widget.includes(forbidden));
assert(qdrant.includes("{ key: 'tenantId', match: { value: tenantId } }") && qdrant.includes("{ key: 'agentId', match: { value: agentId } }") && qdrant.includes("{ key: 'visibility', match: { value: options.visibility || 'PUBLIC' } }"));
assert(firestoreRules.includes('match /private_agents/{agentId} { allow read, write: if false; }'));
assert(firestoreRules.includes('request.resource.data.ownerId == request.auth.uid'));
console.log('PASS: allowlist minimization, tenant-specific agent IDs, public response, Qdrant filters, and Firestore rules');
