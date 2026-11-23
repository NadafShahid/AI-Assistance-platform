import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
process.env.FIREBASE_PROJECT_ID = 'unit-test-project';
const { default: handler } = await import('../api/agent/query.js');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: 'test@unit-test-project.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
delete process.env.GROQ_API_KEY;

const privateAgent = {
  agentId: 'store-agent', widgetId: 'widget-store-a', tenantId: 'tenant-a', publicRole: 'Store Support',
  publicKnowledgeBase: [{ q: 'Returns', a: 'Items can be returned within 14 days.' }],
  publicFieldAllowlist: { products: ['name', 'price', 'stock', 'description', 'email', 'supplierCost', 'tenantId'] },
  databaseRecords: [{ collection: 'products', name: 'Desk Lamp', price: 500, stock: 4, description: 'LED lamp', email: 'private@example.invalid', supplierCost: 180, tenantId: 'tenant-a' }]
};
const publicAgent = { widgetId: 'widget-store-a', name: 'Shop Assistant', greeting: 'Welcome!', themeColor: '#123456', allowedOrigins: ['https://shop.example'] };
const encode = value => {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (value && typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, val]) => [key, encode(val)])) } };
  return { nullValue: null };
};

globalThis.fetch = async (url) => {
  if (String(url).includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'unit-token' }), { status: 200 });
  if (String(url).includes('documents:runQuery')) {
    const doc = { name: 'projects/unit-test-project/databases/(default)/documents/private_agents/tenant-hash', fields: Object.fromEntries(Object.entries(privateAgent).map(([key, value]) => [key, encode(value)])) };
    return new Response(JSON.stringify([{ document: doc }]), { status: 200 });
  }
  const collection = String(url).match(/documents\/(public_agents|private_agents)\/([^?]+)/)?.[1];
  const id = String(url).match(/documents\/(?:public_agents|private_agents)\/([^?]+)/)?.[1];
  if (collection !== 'public_agents' || id !== 'widget-store-a') return new Response('', { status: 404 });
  const data = publicAgent;
  return new Response(JSON.stringify({ name: `projects/unit-test-project/databases/(default)/documents/${collection}/${id}`, fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)])) }), { status: 200 });
};

async function invoke(method, body = {}, query = {}, origin = 'https://shop.example') {
  const result = { headers: {}, statusCode: 0, body: '' };
  const res = {
    status(code) { result.statusCode = code; return this; },
    setHeader(key, value) { result.headers[key] = value; return this; },
    end(data = '') { result.body = data; }
  };
  await handler({ method, body, query, headers: { origin } }, res);
  return { ...result, json: JSON.parse(result.body || '{}') };
}

const config = await invoke('GET', {}, { agentId: 'widget-store-a' });
assert.equal(config.statusCode, 200);
assert.deepEqual(Object.keys(config.json).sort(), ['greeting', 'name', 'themeColor', 'widgetId']);
assert.equal(config.json.name, 'Shop Assistant');
assert(!JSON.stringify(config.json).includes('tenant-a'));

const answer = await invoke('POST', { agentId: 'widget-store-a', message: 'What is the price of Desk Lamp?', conversationId: 'session-1' });
assert.equal(answer.statusCode, 200);
assert.match(answer.json.reply, /500/);
assert.equal(answer.json.conversationId, 'session-1');
assert(!JSON.stringify(answer.json).includes('private@example.invalid'));
assert(!JSON.stringify(answer.json).includes('supplierCost'));
assert(!JSON.stringify(answer.json).includes('tenant-a'));
assert(!('databaseToolResult' in answer.json));

const otherOrigin = await invoke('GET', {}, { agentId: 'widget-store-a' }, 'https://attacker.example');
assert.equal(otherOrigin.statusCode, 403);
const unknown = await invoke('GET', {}, { agentId: 'other-agent' });
assert.equal(unknown.statusCode, 404);

console.log('PASS agent query API config, origin, allowlist, and public response contract');
