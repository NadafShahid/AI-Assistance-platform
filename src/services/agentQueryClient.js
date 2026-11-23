import { auth } from '../firebase';

export async function queryAgent(agentId, message, conversationId = '') {
  const cleanId = String(agentId || '').trim();
  const cleanMessage = String(message || '').trim();
  if (!cleanId || !cleanMessage) throw new Error('Choose an agent and enter a message');
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (auth.currentUser) headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  const response = await fetch('/api/agent/query', {
    method: 'POST', headers,
    body: JSON.stringify({ agentId: cleanId, message: cleanMessage, conversationId: String(conversationId || '').slice(0, 128) }),
    signal: AbortSignal.timeout(25000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.reply) throw new Error(data.error || 'The secure agent service did not return an answer');
  return data;
}
