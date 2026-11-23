import { executeCentralAIResponse } from '../../src/services/centralAiEngine.js';
import { sanitizePublicRecords } from '../../src/utils/publicDataSanitizer.js';
import { firestoreGet, firestoreListByField, serviceAccessToken, verifyFirebaseIdToken, privateAgentDocumentId } from '../_lib/firebaseServer.js';

const PUBLIC_AGENT_FIELDS = ['name', 'greeting', 'avatar', 'themeColor', 'accentColor', 'position', 'voice', 'navigation'];

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function publicConfig(agent) {
  return Object.fromEntries(PUBLIC_AGENT_FIELDS.filter(key => agent[key] !== undefined).map(key => [key, agent[key]]));
}

function safePublicSources(sources = []) {
  return sources.slice(0, 5).map(source => ({ title: String(source || '').slice(0, 120) }));
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (req.method === 'OPTIONS') {
    res.status(204).setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
    return res.end();
  }
  if (req.method !== 'POST' && req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const requestedId = String(req.method === 'GET' ? req.query?.agentId : req.body?.agentId || '').trim();
    if (!requestedId || requestedId.length > 128) return json(res, 400, { error: 'A valid widget identifier is required' });
    const token = await serviceAccessToken(['https://www.googleapis.com/auth/datastore']);
    let pub = await firestoreGet('public_agents', requestedId, token);
    let priv = null;
    let ownerClaims = null;
    if (pub?.widgetId) {
      const matches = await firestoreListByField('private_agents', 'widgetId', requestedId, token);
      priv = matches.find(item => item.widgetId === requestedId && item.agentId) || null;
    } else {
      ownerClaims = await verifyFirebaseIdToken(req).catch(() => null);
      if (ownerClaims?.user_id) {
        priv = await firestoreGet('private_agents', privateAgentDocumentId(ownerClaims.user_id, requestedId), token);
        if (priv?.widgetId) pub = await firestoreGet('public_agents', priv.widgetId, token);
      }
    }
    const agentId = String(priv?.agentId || '');
    if (!pub || !priv || pub.isDeleted || pub.status === 'inactive') return json(res, 404, { error: 'Widget is unavailable' });
    if (!priv.tenantId || !priv.agentId || priv.agentId !== agentId || (pub.widgetId && pub.widgetId !== priv.widgetId)) return json(res, 403, { error: 'Agent authorization failed' });
    const allowedOrigins = Array.isArray(pub.allowedOrigins) ? pub.allowedOrigins : [];
    let ownerPreview = false;
    if (origin && allowedOrigins.length && !allowedOrigins.includes(origin)) {
      ownerClaims ||= await verifyFirebaseIdToken(req).catch(() => null);
      ownerPreview = Boolean(ownerClaims?.user_id && ownerClaims.user_id === priv.tenantId);
      if (!ownerPreview) return json(res, 403, { error: 'Widget origin is not authorized' });
    }
    res.setHeader('Access-Control-Allow-Origin', origin && (allowedOrigins.includes(origin) || ownerPreview) ? origin : '*');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'GET') return json(res, 200, { ...publicConfig(pub), widgetId: pub.widgetId });
    const userMessage = String(req.body?.message || '').trim();
    if (!userMessage || userMessage.length > 4000) return json(res, 400, { error: 'A valid message is required' });
    const databaseRecords = sanitizePublicRecords(priv.databaseRecords, priv.publicFieldAllowlist);
    const conversationId = String(req.body?.conversationId || '').slice(0, 128) || `${agentId}:${Date.now()}`;
    const providerKey = priv.apiKey || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || '';
    const configuredModel = String(priv.model || '');
    const model = providerKey.startsWith('gsk_')
      ? (configuredModel.includes('8B') ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile')
      : (process.env.GEMINI_MODEL || (configuredModel.includes('2.0') ? 'gemini-2.0-flash' : 'gemini-2.5-flash'));
    const result = await executeCentralAIResponse({
      userMessage,
      sessionId: conversationId,
      agentConfig: { name: pub.name, role: priv.publicRole || priv.role || 'Customer Support Assistant', companyName: priv.publicCompanyName || priv.companyName || pub.name },
      tenantId: priv.tenantId,
      agentId,
      databaseRecords,
      knowledgeBase: Array.isArray(priv.publicKnowledgeBase) ? priv.publicKnowledgeBase : [],
      siteBlueprint: null,
      apiKey: providerKey,
      model
    });
    return json(res, 200, {
      reply: String(result.reply || '').slice(0, 4000),
      language: result.language || 'en-US',
      conversationId,
      optionalPublicSources: safePublicSources(result.groundedSources || []),
      optionalNavigationAction: null
    });
  } catch (error) {
    console.error('[agent/query] Request failed', { message: error?.message });
    return json(res, 503, { error: 'The assistant is temporarily unavailable' });
  }
}
