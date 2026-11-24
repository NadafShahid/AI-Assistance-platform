import { randomUUID } from 'node:crypto';
import { verifyFirebaseIdToken, serviceAccessToken, firestoreGet, firestoreSet, firestoreDelete, firestoreListByField, privateAgentDocumentId } from '../_lib/firebaseServer.js';
import { sanitizePublicRecords } from '../../src/utils/publicDataSanitizer.js';
import { deleteAgentQdrantDocs } from '../../src/services/qdrantVectorStore.js';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function publicView(pub, priv) {
  return {
    id: priv.agentId, widgetId: priv.widgetId, name: pub.name, role: priv.publicRole || priv.role || 'Customer Support Assistant',
    companyName: priv.publicCompanyName || priv.companyName || pub.name,
    greeting: pub.greeting || '', avatar: pub.avatar || '', themeColor: pub.themeColor,
    accentColor: pub.accentColor, position: pub.position, voice: pub.voice,
    navigation: pub.navigation || [], allowedOrigins: pub.allowedOrigins || [], status: pub.status || 'Active',
    archetype: priv.archetype || 'general', model: priv.model || '',
    hasProviderKey: Boolean(String(priv.apiKey || '').trim()),
    prompt: priv.prompt || priv.systemPrompt || '',
    knowledgeBase: Array.isArray(priv.publicKnowledgeBase) ? priv.publicKnowledgeBase : [],
    databaseRecords: sanitizePublicRecords(priv.databaseRecords, priv.publicFieldAllowlist),
    publicFieldAllowlist: priv.publicFieldAllowlist || {},
    uploadedFiles: Array.isArray(priv.uploadedFiles) ? priv.uploadedFiles : [],
    ingestionSummary: priv.ingestionSummary || null,
    updatedAt: priv.updatedAt || null
  };
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
  const claims = await verifyFirebaseIdToken(req).catch(() => null);
  if (!claims?.user_id) return json(res, 401, { error: 'Sign in to manage agents' });
  try {
    const token = await serviceAccessToken(['https://www.googleapis.com/auth/datastore']);
    if (req.method === 'GET') {
      const agentId = String(req.query?.agentId || '').trim();
      if (agentId) {
        const privateId = privateAgentDocumentId(claims.user_id, agentId);
        const priv = await firestoreGet('private_agents', privateId, token);
        if (!priv || priv.tenantId !== claims.user_id || priv.agentId !== agentId) return json(res, 404, { error: 'Agent not found' });
        const pub = await firestoreGet('public_agents', priv.widgetId, token);
        return pub ? json(res, 200, { agent: publicView(pub, priv) }) : json(res, 404, { error: 'Agent not found' });
      }
      const privateAgents = (await firestoreListByField('private_agents', 'tenantId', claims.user_id, token))
        .filter(priv => priv.agentId && priv.widgetId && priv.tenantId === claims.user_id);
      const agents = [];
      const batchSize = 20;
      for (let offset = 0; offset < privateAgents.length; offset += batchSize) {
        const batch = privateAgents.slice(offset, offset + batchSize);
        const views = await Promise.all(batch.map(async (priv) => {
          const pub = await firestoreGet('public_agents', priv.widgetId, token);
          return pub && !pub.isDeleted ? publicView(pub, priv) : null;
        }));
        agents.push(...views.filter(Boolean));
      }
      return json(res, 200, { agents: agents.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))) });
    }

    const agent = req.body?.agent || {};
    const agentId = String(['DELETE', 'PATCH'].includes(req.method) ? (req.query?.agentId || req.body?.agentId || agent.id || agent.name || '') : (agent.id || agent.agentId || agent.name || '')).trim().replace(/\//g, '-');
    if (!agentId || agentId.length > 128 || !agent.name) return json(res, 400, { error: 'A valid agent name and identifier are required' });
    if (req.method === 'DELETE') {
      const privateId = privateAgentDocumentId(claims.user_id, agentId);
      const existing = await firestoreGet('private_agents', privateId, token);
      if (!existing || existing.tenantId !== claims.user_id) return json(res, 404, { error: 'Agent not found' });
      await Promise.all([
        firestoreDelete('private_agents', privateId, token), firestoreDelete('public_agents', existing.widgetId, token),
        firestoreDelete('agents', privateId, token), firestoreDelete('agent_info', privateId, token)
      ]);
      await deleteAgentQdrantDocs(agentId, claims.user_id).catch(() => {});
      return json(res, 200, { success: true });
    }

    if (req.method === 'PATCH') {
      const privateId = privateAgentDocumentId(claims.user_id, agentId);
      const existing = await firestoreGet('private_agents', privateId, token);
      if (!existing || existing.tenantId !== claims.user_id) return json(res, 404, { error: 'Agent not found' });
      const updates = req.body?.updates || {};
      const safeUpdates = {};
      if (Array.isArray(updates.uploadedFiles)) safeUpdates.uploadedFiles = updates.uploadedFiles;
      for (const key of ['storageStatus', 'storageExpiresAt', 'purgedAt', 'cloudSnapshotUrl']) {
        if (Object.hasOwn(updates, key)) safeUpdates[key] = updates[key];
      }
      if (Object.keys(safeUpdates).length) await firestoreSet('private_agents', privateId, { ...safeUpdates, updatedAt: new Date().toISOString() }, token);
      return json(res, 200, { success: true });
    }

    const privateId = privateAgentDocumentId(claims.user_id, agentId);
    const prior = await firestoreGet('private_agents', privateId, token);
    let savedProviderKey = prior?.apiKey;
    const previousId = String(req.body?.previousId || '').trim().replace(/\//g, '-');
    if (previousId && previousId !== agentId) {
      const oldPrivateId = privateAgentDocumentId(claims.user_id, previousId);
      const previous = await firestoreGet('private_agents', oldPrivateId, token);
      if (previous?.tenantId === claims.user_id) {
        savedProviderKey ||= previous.apiKey;
        await Promise.all([firestoreDelete('private_agents', oldPrivateId, token), firestoreDelete('public_agents', previous.widgetId, token)]);
        await deleteAgentQdrantDocs(previousId, claims.user_id).catch(() => {});
      }
    }
    const now = new Date().toISOString();
    const candidateKnowledge = Array.isArray(agent.knowledgeBase) ? agent.knowledgeBase : [];
    const hasKnowledgeInput = candidateKnowledge.length > 0 || Boolean(agent.sourceFile)
      || agent.uploadedFiles?.length > 0 || Object.keys(agent.databaseRecords || {}).length > 0;
    const hasSourceEvidence = candidateKnowledge.some(item => item && typeof item.q === 'string' && typeof item.a === 'string' && item.sourceId && item.chunkId && item.path);
    if (!prior && hasKnowledgeInput && (!hasSourceEvidence || !(Number(agent.ingestionSummary?.extractedChunks) >= 1))) {
      return json(res, 422, { error: 'Process at least one source file and save its extracted evidence before creating this agent' });
    }
    const widgetId = prior?.widgetId || randomUUID();
    const publicConfig = {
      widgetId, name: String(agent.name).slice(0, 160), greeting: String(agent.greeting || '').slice(0, 1000),
      avatar: String(agent.avatar || '').slice(0, 500), themeColor: agent.themeColor || '#6366f1',
      accentColor: agent.accentColor || '#06b6d4', position: agent.position || 'bottom-right',
      voice: agent.voice || 'Adam', navigation: Array.isArray(agent.publicNavigation) ? agent.publicNavigation.slice(0, 30) : [],
      allowedOrigins: Array.isArray(agent.allowedOrigins) ? agent.allowedOrigins.slice(0, 30) : [],
      status: agent.status || 'Active', isDeleted: Boolean(agent.isDeleted), updatedAt: now
    };
    const publicKnowledgeBase = candidateKnowledge.filter(item => item && typeof item.q === 'string' && typeof item.a === 'string' && item.visibility !== 'INTERNAL_SYSTEM' && item.visibility !== 'ADMIN' && item.visibility !== 'STAFF').slice(0, 400);
    const privateConfig = {
      ...agent, tenantId: claims.user_id, ownerId: claims.user_id, agentId, widgetId,
      apiKey: String(agent.apiKey || '').trim() || savedProviderKey || '',
      name: String(agent.name).slice(0, 160), publicRole: String(agent.role || 'Customer Support Assistant').slice(0, 160),
      publicCompanyName: String(agent.companyName || agent.websiteName || agent.name).slice(0, 180),
      publicKnowledgeBase, publicFieldAllowlist: agent.publicFieldAllowlist || {},
      updatedAt: now, createdAt: agent.createdAt || now
    };
    await Promise.all([
      firestoreSet('public_agents', widgetId, publicConfig, token),
      firestoreSet('private_agents', privateId, privateConfig, token)
    ]);
    return json(res, 200, { success: true, agent: publicView(publicConfig, privateConfig) });
  } catch (error) {
    console.error('[agent/manage] Request failed', { message: error?.message });
    return json(res, 503, { error: 'Agent management is temporarily unavailable' });
  }
}
