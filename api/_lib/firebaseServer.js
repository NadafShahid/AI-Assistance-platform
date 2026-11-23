import { createSign, createPublicKey, createHash, verify as verifySignature } from 'node:crypto';

export const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'ai-agent-11df2';
export const FIREBASE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || `${FIREBASE_PROJECT_ID}.firebasestorage.app`;
export function privateAgentDocumentId(tenantId, agentId) {
  if (!tenantId || !agentId) throw new Error('Tenant and agent identifiers are required');
  return createHash('sha256').update(`${tenantId}:${agentId}`).digest('hex');
}
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
let certCache = { expiresAt: 0, keys: null };
const tokenCache = new Map();

function encode(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64url'); }

export async function serviceAccessToken(scopes = ['https://www.googleapis.com/auth/datastore']) {
  const scope = [...scopes].sort().join(' ');
  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
  if (!account.client_email || !account.private_key) throw new Error('Server Firebase credentials are not configured');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: account.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(account.private_key, 'base64url')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  if (!response.ok) throw new Error('Could not authenticate with Firebase services');
  const result = await response.json();
  tokenCache.set(scope, { token: result.access_token, expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000 });
  return result.access_token;
}

export async function verifyFirebaseIdToken(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const pieces = token.split('.');
  if (pieces.length !== 3) return null;
  try {
    const header = JSON.parse(Buffer.from(pieces[0], 'base64url').toString());
    const claims = JSON.parse(Buffer.from(pieces[1], 'base64url').toString());
    if (header.alg !== 'RS256' || !header.kid || claims.aud !== FIREBASE_PROJECT_ID || claims.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}` || !claims.sub) return null;
    if (Number(claims.exp) <= Date.now() / 1000 || Number(claims.iat) > Date.now() / 1000 + 60) return null;
    if (!certCache.keys || certCache.expiresAt < Date.now()) {
      const response = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
      if (!response.ok) return null;
      const data = await response.json();
      const maxAge = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] || 3600);
      certCache = { keys: data.keys || [], expiresAt: Date.now() + maxAge * 1000 };
    }
    const jwk = certCache.keys.find(key => key.kid === header.kid);
    if (!jwk) return null;
    const valid = verifySignature('RSA-SHA256', Buffer.from(`${pieces[0]}.${pieces[1]}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(pieces[2], 'base64url'));
    return valid ? claims : null;
  } catch { return null; }
}

function decodeValue(value) {
  if (!value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('nullValue' in value) return null;
  return null;
}

function decodeFields(fields = {}) { return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)])); }

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)])) } };
  return { stringValue: String(value) };
}

export async function firestoreGet(collection, id, token) {
  const response = await fetch(`${FIRESTORE_BASE}/${collection}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore read failed (${response.status})`);
  const doc = await response.json();
  return { ...decodeFields(doc.fields), _documentName: doc.name };
}

export async function firestoreListByField(collection, field, value, token) {
  const response = await fetch(`${FIRESTORE_BASE}:runQuery`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: collection }],
      where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: encodeValue(value) } },
      limit: 500
    } })
  });
  if (!response.ok) throw new Error(`Firestore query failed (${response.status})`);
  const results = await response.json();
  return results.filter(item => item.document).map(item => ({ ...decodeFields(item.document.fields), _documentName: item.document.name }));
}

export async function firestoreSet(collection, id, value, token, merge = true) {
  const url = new URL(`${FIRESTORE_BASE}/${collection}/${encodeURIComponent(id)}`);
  if (merge) for (const key of Object.keys(value)) url.searchParams.append('updateMask.fieldPaths', key);
  const response = await fetch(url, {
    method: merge ? 'PATCH' : 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)])) })
  });
  if (!response.ok) throw new Error(`Firestore write failed (${response.status})`);
  return true;
}

export async function firestoreDelete(collection, id, token) {
  const response = await fetch(`${FIRESTORE_BASE}/${collection}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok && response.status !== 404) throw new Error(`Firestore delete failed (${response.status})`);
}

export async function downloadPrivateObject(objectName, token) {
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(FIREBASE_BUCKET)}/o/${encodeURIComponent(objectName)}?alt=media`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Could not read uploaded object (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

export async function deletePrivateObject(objectName, token) {
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(FIREBASE_BUCKET)}/o/${encodeURIComponent(objectName)}`;
  const response = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok && response.status !== 404) throw new Error(`Could not clean up uploaded object (${response.status})`);
}
