import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadBytesResumable, deleteObject } from 'firebase/storage';
import { isValidCustomerCatalogName, isCustomerSafeFaq } from './utils/codebaseAnalyzer.js';

function cleanDatabaseRecords(records) {
  if (!Array.isArray(records)) return [];
  return records.filter(r => r && isValidCustomerCatalogName(r.name || r.title || r.product, r));
}

function cleanKnowledgeBase(kb) {
  if (!Array.isArray(kb)) return [];
  return kb.filter(item => item && (
    (item.visibility === 'PUBLIC' && item.sourceId && item.chunkId && item.path && typeof item.q === 'string' && typeof item.a === 'string') ||
    isCustomerSafeFaq(item.q, item.a)
  ));
}
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAslA6IJZYcnWmvoEoGSagyQLBmyqsXOOk",
  authDomain: "ai-agent-11df2.firebaseapp.com",
  projectId: "ai-agent-11df2",
  storageBucket: "ai-agent-11df2.firebasestorage.app",
  messagingSenderId: "871360023618",
  appId: "1:871360023618:web:b175f8f8a46d82dc6df1db",
  measurementId: "G-V56ZLJMGBC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

export async function uploadIngestionFiles(files = []) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in before uploading knowledge files');
  if (!Array.isArray(files) || !files.length || files.length > 200) throw new Error('Select between 1 and 200 files');
  const jobId = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const uploaded = [];
  try {
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) throw new Error(`${file.name} exceeds the 50 MB file limit`);
      const safeName = String(file.name || 'upload').split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180);
      const path = `staging/${user.uid}/${jobId}/${safeName}`;
      const uploadTask = uploadBytesResumable(ref(storage, path), file, { contentType: file.type || 'application/octet-stream', customMetadata: { ownerUid: user.uid, jobId } });
      await new Promise((resolve, reject) => uploadTask.on('state_changed', undefined, reject, resolve));
      uploaded.push({ name: safeName, path, size: file.size, mimeType: file.type || 'application/octet-stream' });
    }
  } catch (error) {
    await Promise.all(uploaded.map(file => deleteObject(ref(storage, file.path)).catch(() => {})));
    throw error;
  }
  return { jobId, files: uploaded, idToken: await user.getIdToken() };
}

// Authentication Helpers & Session Persistence
const USER_SESSION_KEY = 'echo_user_session';

export function getSavedUserSession() {
  try {
    const raw = localStorage.getItem(USER_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function saveUserSession(user) {
  try {
    if (user) {
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_SESSION_KEY);
    }
  } catch (e) {}
}

export async function loginWithEmail(email, password) {
  try {
    const res = await signInWithEmailAndPassword(auth, email, password);
    const userObj = {
      uid: res.user.uid,
      email: res.user.email,
      displayName: res.user.displayName || email.split('@')[0],
      avatar: res.user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${res.user.uid}`,
      role: 'Workspace Admin',
      isGuest: false
    };
    saveUserSession(userObj);
    return userObj;
  } catch (err) {
    throw err;
  }
}

export async function registerWithEmail(email, password, displayName) {
  try {
    const res = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName && res.user) {
      await updateProfile(res.user, { displayName });
    }
    const userObj = {
      uid: res.user.uid,
      email: res.user.email,
      displayName: displayName || email.split('@')[0],
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${res.user.uid}`,
      role: 'Workspace Creator',
      isGuest: false
    };
    saveUserSession(userObj);
    return userObj;
  } catch (err) {
    throw err;
  }
}

export async function loginWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    const res = await signInWithPopup(auth, provider);
    const userObj = {
      uid: res.user.uid,
      email: res.user.email,
      displayName: res.user.displayName || 'Google User',
      avatar: res.user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${res.user.uid}`,
      role: 'Workspace Admin',
      isGuest: false
    };
    saveUserSession(userObj);
    return userObj;
  } catch (err) {
    throw err;
  }
}

export function loginAsGuest(name = 'Alex Rivera', role = 'Cloud Architect & AI Lead') {
  const guestUser = {
    uid: `guest_${Date.now()}`,
    email: 'alex.rivera@workspace.io',
    displayName: name,
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces',
    role: role,
    isGuest: true
  };
  saveUserSession(guestUser);
  return guestUser;
}

export async function logoutUser() {
  try {
    await signOut(auth);
  } catch (e) {}
  saveUserSession(null);
}

// Collection References
export const AGENTS_COLLECTION = 'agents';
export const AGENT_INFO_COLLECTION = 'agent_info';
export const USER_INFO_COLLECTION = 'user_info';
export const CONVERSATIONS_COLLECTION = 'conversations';

async function agentApiRequest(method, path = '', body = undefined) {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to access agents');
  const idToken = await user.getIdToken();
  const response = await fetch(`/api/agent/manage${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Secure agent service is unavailable');
  return data;
}

/**
/**
 * Helper to ensure human-readable database titles without any encrypted/hash IDs
 */
export function getCleanTitleId(nameOrAgent) {
  if (!nameOrAgent) return 'Voice Assistant';
  const raw = typeof nameOrAgent === 'string' ? nameOrAgent : (nameOrAgent.name || nameOrAgent.title || nameOrAgent.id || 'Voice Assistant');
  let clean = raw.trim();
  // Strip out old encrypted prefixes like 'agent_help_desk_kg4n' or 'session_...'
  if (/^agent_[a-z0-9_]+$/i.test(clean)) {
    clean = clean.replace(/^agent_/, '').replace(/_[a-z0-9]{4,6}$/, '').replace(/_/g, ' ');
    clean = clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  // Sanitize forward slashes for Firestore document ID safety
  return clean.replace(/\//g, '-').trim() || 'Voice Assistant';
}

/**
 * Fetch all voice help desk agents
 */
export async function getAgents() {
  try {
    const response = await agentApiRequest('GET');
    return Array.isArray(response.agents) ? response.agents : [];
  } catch (error) {
    console.warn("Could not fetch agents from Firestore, falling back:", error);
    return [];
  }
}

/**
 * Real-time subscription to agents
 */
export function subscribeToAgents(callback, onError) {
  let active = true;
  let timer;
  const refresh = async () => {
    try {
      const response = await agentApiRequest('GET');
      if (!Array.isArray(response.agents)) throw new Error('Invalid assistant list response');
      if (active) callback(response.agents);
    } catch (error) {
      if (active) onError?.(error);
    }
    if (active) timer = setTimeout(refresh, 10000);
  };
  refresh();
  return () => { active = false; if (timer) clearTimeout(timer); };
}

/**
 * Fetch a single agent by ID or Name/Title (with localStorage caching)
 */
export async function getAgentById(agentId) {
  const titleId = getCleanTitleId(agentId);
  try {
    const response = await agentApiRequest('GET', `?agentId=${encodeURIComponent(titleId)}`);
    return response.agent || null;
  } catch (error) {
    if (/not found/i.test(error.message || '')) return null;
    throw error;
  }
}

/**
 * Deeply sanitize an object to strip undefined values so Firestore setDoc never throws.
 */
function sanitizeForFirestore(obj) {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj;
  if (typeof obj._methodName === 'string' || obj.constructor?.name === 'FieldValue') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item)).filter(item => item !== undefined);
  }
  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = sanitizeForFirestore(value);
    }
  }
  return clean;
}

/**
 * Create, update, or rename an agent using its clean Name/Title for the database document.
 * When renaming (options.previousId / options.previousName / agent._previousId / agent._firestoreDocId),
 * AWAITS deleting the old Firestore documents so renaming NEVER creates a duplicate agent!
 */
export async function saveAgent(agent, options = {}) {
  const titleId = getCleanTitleId(agent.name || agent.title || agent.id);
  await auth.authStateReady();
  const tenantId = auth.currentUser?.uid;
  if (!tenantId) throw new Error('Sign in to save your assistant.');

  // Collect all previous IDs / names that differ from the new titleId so old docs are ALWAYS deleted on rename
  const prevIdsToPurge = new Set();
  const addOldCandidate = (val) => {
    if (!val) return;
    const raw = String(val).trim();
    const cleaned = getCleanTitleId(raw);
    if (raw && raw !== titleId) prevIdsToPurge.add(raw);
    if (cleaned && cleaned !== titleId) prevIdsToPurge.add(cleaned);
  };
  addOldCandidate(options?.previousId);
  addOldCandidate(options?.previousName);
  addOldCandidate(options?.previousDocId);
  addOldCandidate(agent?._previousId);
  addOldCandidate(agent?._previousName);
  addOldCandidate(agent?._firestoreDocId);
  addOldCandidate(agent?.id);

  // Maintain historical previousNames so Google Drive cleanup always finds folders even after multiple renames
  const prevNamesSet = new Set(Array.isArray(agent?.previousNames) ? agent.previousNames.filter(Boolean) : []);
  if (options?.previousName && getCleanTitleId(options.previousName) !== titleId) {
    prevNamesSet.add(getCleanTitleId(options.previousName));
  }
  if (options?.previousId && getCleanTitleId(options.previousId) !== titleId) {
    prevNamesSet.add(getCleanTitleId(options.previousId));
  }
  if (agent?._previousName && getCleanTitleId(agent._previousName) !== titleId) {
    prevNamesSet.add(getCleanTitleId(agent._previousName));
  }
  prevNamesSet.delete(titleId);

  const sanitizedDbRecords = cleanDatabaseRecords(agent.databaseRecords);
  const sanitizedKb = cleanKnowledgeBase(agent.knowledgeBase);
  const kbCount = sanitizedKb.length;
  const dbCount = sanitizedDbRecords.length;

  // Strip internal transient helper fields before persisting to Firestore
  const { _previousId, _previousName, _firestoreDocId, ...cleanAgentFields } = agent || {};

  const savedAt = new Date().toISOString();
  const rawPayload = {
    ...cleanAgentFields,
    tenantId,
    ownerId: tenantId,
    databaseRecords: sanitizedDbRecords,
    knowledgeBase: sanitizedKb,
    previousNames: Array.from(prevNamesSet),
    id: titleId,
    agentId: titleId,
    name: agent.name || titleId,
    title: agent.title || agent.name || titleId,
    status: agent.status || 'Active',
    totalKnowledgeEntries: kbCount,
    totalDatabaseRecords: dbCount,
    lastActiveAt: savedAt,
    updatedAt: savedAt,
    createdAt: agent.createdAt || savedAt,
  };

  const payload = sanitizeForFirestore(rawPayload);
  const previousId = options?.previousId || options?.previousDocId || Array.from(prevIdsToPurge)[0] || '';
  const saved = await agentApiRequest('POST', '', { agent: payload, previousId });

  // 3. Clean cache and any stale tombstone for the active agent ID
  try {
    localStorage.removeItem(`agent_cache_${titleId}`);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`vhd_deleted_${titleId.toLowerCase().replace(/\s+/g, '_')}`);
    }
  } catch (e) {}

  return { ...(saved.agent || payload), id: titleId, _firestoreDocId: titleId };
}

/**
 * Lightweight merge-patch for uploadedFiles Drive sync metadata (driveFileId, driveWebViewLink, storageStatus)
 * without overwriting newer files or re-uploading the full agent prompt/KB.
 */
export async function patchAgentUploadedFiles(agentNameOrId, updatesMap = {}) {
  try {
    const titleId = getCleanTitleId(agentNameOrId);
    if (!titleId || !updatesMap || Object.keys(updatesMap).length === 0) return false;
    const existingAgent = await getAgentById(titleId);
    const existingFiles = Array.isArray(existingAgent?.uploadedFiles) ? existingAgent.uploadedFiles : [];
    if (existingFiles.length === 0) return false;

    let changed = false;
    const mergedFiles = existingFiles.map((f) => {
      const patch = updatesMap[f.id] || updatesMap[f.name];
      if (!patch) return f;
      changed = true;
      return sanitizeForFirestore({ ...f, ...patch });
    });

    if (!changed) return false;

    await agentApiRequest('PATCH', '', { agentId: titleId, updates: { uploadedFiles: mergedFiles } });

    try {
      localStorage.removeItem(`agent_cache_${titleId}`);
    } catch (_) {}
    return true;
  } catch (err) {
    console.warn('patchAgentUploadedFiles warning:', err);
    return false;
  }
}

/**
 * Fetch the latest uploadedFiles metadata for an agent from Firestore before deletion
 * so recently background-synced Google Drive file IDs are never missed.
 */
export async function getAgentUploadedFilesFromCloud(nameOrId) {
  try {
    const rawId = typeof nameOrId === 'string' ? nameOrId : (nameOrId?.id || nameOrId?.name || '');
    const titleId = getCleanTitleId(rawId);
    const candidates = Array.from(new Set([titleId, rawId, nameOrId?.name ? getCleanTitleId(nameOrId.name) : ''].filter(Boolean)));
    const agent = await getAgentById(candidates[0]);
    return Array.isArray(agent?.uploadedFiles) ? agent.uploadedFiles : [];
  } catch (_) {
    return [];
  }
}

/**
 * Delete an agent and its corresponding conversation.
 * Writes a tombstone record to deleted_agents so live embed widgets immediately deactivate.
 */
export async function deleteAgent(nameOrId) {
  const agentObj = typeof nameOrId === 'object' && nameOrId !== null ? nameOrId : {};
  const rawId = typeof nameOrId === 'string' ? nameOrId : (agentObj.id || agentObj.name || '');
  const titleId = getCleanTitleId(rawId);
  const nameId = agentObj.name ? getCleanTitleId(agentObj.name) : '';
  const allDocIds = new Set([titleId, rawId, nameId, agentObj._firestoreDocId].filter(Boolean));
  if (Array.isArray(agentObj.previousNames)) {
    agentObj.previousNames.forEach(pn => {
      if (pn) {
        allDocIds.add(String(pn).trim());
        allDocIds.add(getCleanTitleId(pn));
      }
    });
  }

  await agentApiRequest('DELETE', `?agentId=${encodeURIComponent(titleId)}`);

  // 3. Delete corresponding conversation
  await deleteDoc(doc(db, CONVERSATIONS_COLLECTION, titleId)).catch(() => {});
  if (rawId && rawId !== titleId) {
    await deleteDoc(doc(db, CONVERSATIONS_COLLECTION, rawId)).catch(() => {});
  }

  // 4. Purge local caches and store deletion marker
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`agent_cache_${titleId}`);
      localStorage.removeItem(`agent_cache_${rawId}`);
      localStorage.removeItem(`echo_logs_${titleId}`);
      localStorage.removeItem(`vhd_agent_${titleId.toLowerCase().replace(/\s+/g, '_')}`);
      localStorage.removeItem(`vhd_agent_${rawId.toLowerCase().replace(/\s+/g, '_')}`);
      localStorage.setItem(`vhd_deleted_${titleId.toLowerCase().replace(/\s+/g, '_')}`, 'true');
      localStorage.setItem(`vhd_deleted_${rawId.toLowerCase().replace(/\s+/g, '_')}`, 'true');
    }
  } catch (e) {}
}

/**
 * Delete all agents, conversations, and cached workspace data
 */
export async function deleteAllAgentsAndData() {
  try {
    const agents = await getAgents();
    for (const agent of agents) await deleteAgent(agent).catch(() => {});

    // 2. Delete all conversation history documents
    const ownerId = auth.currentUser?.uid;
    if (!ownerId) throw new Error('Sign in to delete workspace data');
    const convSnapshot = await getDocs(query(collection(db, CONVERSATIONS_COLLECTION), where('ownerId', '==', ownerId)));
    for (const d of convSnapshot.docs) {
      await deleteDoc(d.ref).catch(() => {});
    }

    // 3. Clear localStorage caches
    if (typeof window !== 'undefined') {
      try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (
            key &&
            (key.startsWith('agent_cache_') ||
              key.startsWith('echo_logs_') ||
              key.startsWith('vhd_agent_') ||
              key === 'echo_workspace_shared_files')
          ) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch (e) {}
    }

    return true;
  } catch (err) {
    console.error("Failed to delete all agents and data:", err);
    throw err;
  }
}

/**
 * Save conversation turns to the single conversation document for 1 agent
 * Stored in Firestore under: doc(db, 'conversations', agentName)
 * In single conversation document, it holds the overall conversation of that 1 agent (zero encrypted IDs).
 */
export async function saveConversationSession(conversation) {
  const agentTitle = getCleanTitleId(conversation.agentName || conversation.agentId || 'Voice Assistant');
  const convDocRef = doc(db, CONVERSATIONS_COLLECTION, agentTitle);

  const newMessages = conversation.messages || (conversation.text ? [{
    role: conversation.role || 'user',
    text: conversation.text,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }] : []);

  // Read existing document to accumulate the single overall conversation for this 1 agent
  let existingMessages = [];
  let existingSessions = [];
  try {
    const snap = await getDoc(convDocRef);
    if (snap.exists()) {
      const data = snap.data();
      existingMessages = Array.isArray(data.messages) ? data.messages : (Array.isArray(data.overallConversation) ? data.overallConversation : []);
      existingSessions = Array.isArray(data.sessions) ? data.sessions : [];
    }
  } catch (e) {
    console.warn("Could not read existing conversation doc from Firestore:", e);
  }

  // Fallback to local cache if empty
  if (existingMessages.length === 0 && typeof localStorage !== 'undefined') {
    try {
      const cached = JSON.parse(localStorage.getItem(`echo_logs_${agentTitle}`) || '[]');
      if (cached && cached[0] && Array.isArray(cached[0].messages)) {
        existingMessages = cached[0].messages;
      }
    } catch (e) {}
  }

  // Merge messages: append new turns into single overall conversation
  const overallConversation = [...existingMessages, ...newMessages];

  const sessionTitle = `${agentTitle} Session #${existingSessions.length + 1}`;
  const newSessionEntry = {
    id: sessionTitle,
    sessionId: sessionTitle,
    agentName: agentTitle,
    agentId: agentTitle,
    caller: conversation.caller || `Website Visitor #${Math.floor(1000 + Math.random() * 9000)}`,
    duration: conversation.duration || `${Math.max(15, newMessages.length * 10)}s`,
    status: conversation.status || 'Resolved',
    summary: conversation.summary || newMessages[0]?.text?.substring(0, 85) || `${agentTitle} voice dialogue`,
    timestamp: conversation.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    createdAt: new Date().toISOString(),
    turnCount: newMessages.length,
    messages: newMessages
  };

  const updatedSessions = [newSessionEntry, ...existingSessions.filter(s => s.id !== sessionTitle)].slice(0, 50);

  const updatedPayload = {
    id: agentTitle,
    ownerId: auth.currentUser?.uid || '',
    agentName: agentTitle,
    agentTitle: agentTitle,
    title: `${agentTitle} - Overall Conversation`,
    status: 'Active',
    summary: conversation.summary || newMessages[newMessages.length - 1]?.text || `${agentTitle} active conversation`,
    lastMessage: newMessages[newMessages.length - 1]?.text || 'Conversational dialogue',
    lastTimestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    totalMessages: overallConversation.length,
    totalSessions: updatedSessions.length,
    caller: conversation.caller || 'Website Visitor',
    duration: conversation.duration || `${Math.max(30, overallConversation.length * 12)}s`,
    messages: overallConversation,
    overallConversation: overallConversation,
    sessions: updatedSessions,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  };

  // 1. LocalStorage folder caching under the clean agent title
  try {
    if (typeof localStorage !== 'undefined') {
      const storeKey = `echo_logs_${agentTitle}`;
      localStorage.setItem(storeKey, JSON.stringify([updatedPayload, ...updatedSessions]));

      const allKey = 'echo_logs_all';
      const existingAll = JSON.parse(localStorage.getItem(allKey) || '[]');
      const updatedAll = [updatedPayload, ...existingAll.filter(i => i.id !== agentTitle)].slice(0, 100);
      localStorage.setItem(allKey, JSON.stringify(updatedAll));
    }
  } catch (e) {}

  // 2. Persist directly to single agent document in Firestore (NO encrypted ID!)
  try {
    await setDoc(convDocRef, updatedPayload, { merge: true });

    // 3. Update agent_info collection stats
    const agentInfoRef = doc(db, AGENT_INFO_COLLECTION, agentTitle);
    setDoc(agentInfoRef, {
      id: agentTitle,
      agentId: agentTitle,
      totalConversations: updatedSessions.length,
      totalMessagesHandled: overallConversation.length,
      lastActiveAt: serverTimestamp(),
      status: 'Active'
    }, { merge: true }).catch(() => {});

    // 4. Update user_info collection for this visitor
    const rawCaller = conversation.caller || 'Visitor #3072';
    const cleanVisitorId = rawCaller.replace(/[^a-zA-Z0-9_-]/g, '_');
    const userDocRef = doc(db, USER_INFO_COLLECTION, `${agentTitle}_${cleanVisitorId}`);
    setDoc(userDocRef, {
      id: `${agentTitle}_${cleanVisitorId}`,
      ownerId: auth.currentUser?.uid || '',
      visitorId: rawCaller,
      caller: rawCaller,
      name: conversation.userName || rawCaller,
      agentId: agentTitle,
      agentName: agentTitle,
      userType: 'website_visitor',
      lastActiveAt: serverTimestamp(),
      sessionDuration: conversation.duration || `${Math.max(15, newMessages.length * 10)}s`,
      totalMessagesSent: overallConversation.filter(m => m.role === 'user').length,
      lastInquiryTopic: conversation.summary || newMessages[newMessages.length - 1]?.text?.substring(0, 85) || 'General Inquiry',
      lastUserMessage: (newMessages.filter(m => m.role === 'user').pop()?.text || '').substring(0, 150),
      lastAgentReply: (newMessages.filter(m => m.role === 'agent' || m.role === 'assistant').pop()?.text || '').substring(0, 150),
      leadStatus: 'Active Inquiry',
      conversationRef: `conversations/${agentTitle}`
    }, { merge: true }).catch(() => {});

    return agentTitle;
  } catch (error) {
    console.warn("Firestore save to agent conversation document failed, cached locally:", error);
    return agentTitle;
  }
}

/**
 * Save / Update visitor profile in user_info collection
 */
export async function saveVisitorUserInfo(visitorData) {
  if (!visitorData) return;
  const caller = visitorData.caller || visitorData.visitorId || 'Website Visitor';
  const cleanId = (visitorData.id || caller).replace(/[^a-zA-Z0-9_-]/g, '_');
  const userRef = doc(db, USER_INFO_COLLECTION, cleanId);
  const payload = sanitizeForFirestore({
    ...visitorData,
    id: cleanId,
    ownerId: auth.currentUser?.uid || '',
    lastActiveAt: serverTimestamp()
  });
  await setDoc(userRef, payload, { merge: true }).catch(() => {});
}

/**
 * Fetch all documents in user_info collection
 */
export async function getUserInfoList() {
  try {
    const ownerId = auth.currentUser?.uid;
    if (!ownerId) return [];
    const snap = await getDocs(query(collection(db, USER_INFO_COLLECTION), where('ownerId', '==', ownerId)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn("Could not fetch user_info list from Firestore:", err);
    return [];
  }
}

/**
 * Fetch agent profile from agent_info collection
 */
export async function getAgentInfo(agentId) {
  try {
    return await getAgentById(agentId);
  } catch (err) {
    console.warn("Could not fetch agent_info from Firestore:", err);
  }
  return null;
}

/**
 * Get conversations for an agent: returns the single overall conversation document for that 1 agent
 */
export async function getConversations(agentNameOrId, maxLimit = 50) {
  const agentTitle = agentNameOrId && agentNameOrId !== 'all' ? getCleanTitleId(agentNameOrId) : null;
  
  const localLogs = [];
  try {
    if (typeof localStorage !== 'undefined') {
      const storageKey = (!agentTitle || agentTitle === 'all') ? 'echo_logs_all' : `echo_logs_${agentTitle}`;
      const raw = localStorage.getItem(storageKey);
      if (raw) localLogs.push(...JSON.parse(raw));
    }
  } catch (e) {}

  try {
    if (agentTitle && agentTitle !== 'all') {
      // Single conversation document for this 1 agent
      const convDocRef = doc(db, CONVERSATIONS_COLLECTION, agentTitle);
      const snap = await getDoc(convDocRef);
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        const sessions = Array.isArray(data.sessions) ? data.sessions.map(s => ({ ...s, agentName: agentTitle })) : [];
        return [data, ...sessions];
      }
    } else {
      // All Agents: returns each agent's single overall conversation document
      const ownerId = auth.currentUser?.uid;
      if (!ownerId) return localLogs;
      const snap = await getDocs(query(collection(db, CONVERSATIONS_COLLECTION), where('ownerId', '==', ownerId), limit(maxLimit)));
      const firestoreDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (firestoreDocs.length > 0) {
        return firestoreDocs;
      }
    }
  } catch (err) {
    console.warn("Could not fetch conversations from Firestore:", err);
  }

  return localLogs.slice(0, maxLimit);
}

/**
 * Clear conversation logs for a specific agent
 */
export async function clearAgentConversations(agentId) {
  const agentTitle = getCleanTitleId(agentId);
  try {
    if (agentTitle && agentTitle !== 'all') {
      localStorage.removeItem(`echo_logs_${agentTitle}`);
      await deleteDoc(doc(db, CONVERSATIONS_COLLECTION, agentTitle)).catch(() => {});
    } else {
      localStorage.removeItem('echo_logs_all');
    }
  } catch (e) {}
}

/**
 * 15-Day Storage Lifecycle Management
 * Once the AI model/agent is downloaded, temporary cloud storage is preserved
 * for 15 days, after which it is automatically purged to optimize resources and privacy.
 */
const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

export async function recordAgentDownload(agentId, currentAgent) {
  const now = Date.now();
  const expiresAt = now + FIFTEEN_DAYS_MS;
  const updateData = {
    downloadedAt: now,
    storageExpiresAt: expiresAt,
    storageStatus: 'active',
    downloadCount: (currentAgent?.downloadCount || 0) + 1,
    lastDownloadedDate: new Date(now).toISOString()
  };

  try {
    const docRef = doc(db, AGENTS_COLLECTION, agentId);
    await updateDoc(docRef, updateData);
  } catch (err) {
    console.warn("Could not record download to Firestore, saving locally:", err);
  }

  // Save to local storage registry as well
  try {
    const key = `storage_lifecycle_${agentId}`;
    localStorage.setItem(key, JSON.stringify({ ...updateData, agentId }));
  } catch (e) {}

  return updateData;
}

/**
 * Check and purge any model storage records older than 15 days
 */
export async function checkAndPurgeExpiredAgentStorage() {
  const now = Date.now();
  let purgedCount = 0;
  try {
    const agents = await getAgents();
    for (const agent of agents) {
      if (agent.storageStatus === 'active' && Number(agent.storageExpiresAt) < now) {
        await agentApiRequest('PATCH', '', { agentId: agent.id, updates: { storageStatus: 'purged', purgedAt: now, cloudSnapshotUrl: null } });
        purgedCount++;
        try { localStorage.removeItem(`storage_lifecycle_${agent.id}`); } catch (e) {}
      }
    }
  } catch (err) {
    console.warn("Auto-purge check error:", err);
  }

  return purgedCount;
}

/**
 * Helper to compute storage lifecycle information for an agent
 */
export function getAgentStorageInfo(agent) {
  if (!agent?.downloadedAt || !agent?.storageExpiresAt) {
    return {
      hasDownloaded: false,
      status: 'ready',
      daysRemaining: 15,
      label: '15-Day Storage Retention (Active after download)'
    };
  }

  const now = Date.now();
  const diffMs = agent.storageExpiresAt - now;
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));

  if (diffMs <= 0 || agent.storageStatus === 'purged') {
    return {
      hasDownloaded: true,
      status: 'purged',
      daysRemaining: 0,
      label: 'Cloud Storage Purged (Expired after 15 days)'
    };
  }

  return {
    hasDownloaded: true,
    status: 'active',
    daysRemaining,
    label: `Cloud Storage Active (${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining until auto-purge)`
  };
}

// =====================================================================
// CENTRAL DEVELOPER GOOGLE DRIVE CONFIGURATION (SHARED ACROSS ALL USERS)
// =====================================================================
const SETTINGS_COLLECTION = 'settings';
const DEVELOPER_DRIVE_DOC = 'developer_drive';

/**
 * Save Central Developer Google Drive credentials/configuration to Firestore
 * so that any user uploading files in the workspace stores them in the developer's Drive.
 */
export async function saveDeveloperDriveConfig(config) {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, DEVELOPER_DRIVE_DOC);
    const payload = sanitizeForFirestore({
      ...config,
      updatedAt: serverTimestamp()
    });
    await setDoc(docRef, payload, { merge: true });
    return true;
  } catch (err) {
    console.warn("Could not save developer drive config to Firestore:", err);
    return false;
  }
}

/**
 * Fetch Central Developer Google Drive credentials/configuration from Firestore
 */
export async function getDeveloperDriveConfig() {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, DEVELOPER_DRIVE_DOC);
    const snap = await getDoc(docRef);
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.warn("Could not fetch developer drive config from Firestore:", err);
    return null;
  }
}

/**
 * Subscribe in real-time to Central Developer Google Drive configuration
 */
export function subscribeToDeveloperDriveConfig(callback) {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, DEVELOPER_DRIVE_DOC);
    return onSnapshot(docRef, (snap) => {
      callback(snap.exists() ? snap.data() : null);
    }, (err) => {
      console.warn("Developer drive subscription error:", err);
    });
  } catch (err) {
    console.warn("Failed to subscribe to developer drive config:", err);
    return () => {};
  }
}

/**
 * Disconnect/clear Central Developer Google Drive configuration from Firestore
 */
export async function clearDeveloperDriveConfig() {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, DEVELOPER_DRIVE_DOC);
    await deleteDoc(docRef).catch(() => {});
    return true;
  } catch (err) {
    return false;
  }
}

export { app, db, auth, firebaseConfig };
