import React, { useState, useEffect } from 'react';
import {
  Upload,
  Trash2,
  Eye,
  Sparkles,
  Bot,
  Database,
  Globe,
  Server,
  FileCode,
  Search,
  HardDrive,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  CloudUpload,
  Settings,
  AlertCircle,
  FolderOpen,
  Layers,
  ChevronRight,
  Plus
} from 'lucide-react';
import { getAccuracyAuditSummary, clearAccuracyAuditLog } from '../utils/accuracyVerificationEngine';
import {
  saveFileToLocalStore,
  getFileFromLocalStore,
  deleteFileFromLocalStore
} from '../utils/localFileStore';
import {
  getDriveConnectionStatus,
  connectGoogleDrive,
  disconnectDrive,
  uploadFileToDrive,
  syncAgentFilesToDriveInBackground,
  listAssistantDriveFiles,
  fetchDriveFileContent,
  deleteDriveFile,
  isDriveConnected,
  initDeveloperDriveSync,
  checkDriveWebhookCapabilities,
  cleanupOrphanedDriveFolders
} from '../services/googleDriveService';
import GoogleDriveSetupModal from './GoogleDriveSetupModal';
import { uploadIngestionFiles } from '../firebase';

export default function LiveFilesView({
  currentAssistant,
  assistantsList = [],
  onSelectAssistant,
  onUpdateAssistantFiles,
  onTrainAssistantFromFile,
  onSendFilesToComposer,
  onOpenGoogleDriveSetup
}) {

  // View Mode: 'focused' (focus on current selected assistant) vs 'all' (show all assistants stacked)
  const [viewMode, setViewMode] = useState('focused'); // 'focused' | 'all'
  const [selectedAssistantTabId, setSelectedAssistantTabId] = useState(
    currentAssistant?.id || (assistantsList[0]?.id || 'workspace')
  );

  useEffect(() => {
    if (currentAssistant?.id) {
      setSelectedAssistantTabId(currentAssistant.id);
    }
  }, [currentAssistant?.id]);

  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all'); // 'all' | 'frontend' | 'backend' | 'database'
  const [previewFile, setPreviewFile] = useState(null);
  const [previewContent, setPreviewContent] = useState('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [driveStatus, setDriveStatus] = useState(() => getDriveConnectionStatus());
  const [driveNotice, setDriveNotice] = useState(null);
  const [webhookCaps, setWebhookCaps] = useState(null);
  const [isCleaningOrphans, setIsCleaningOrphans] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);
  const [showAccuracyAuditFor, setShowAccuracyAuditFor] = useState(null);
  const [auditRefreshTick, setAuditRefreshTick] = useState(0);

  useEffect(() => {
    const initial = getDriveConnectionStatus();
    setDriveStatus(initial);
    if (initial.connected) {
      checkDriveWebhookCapabilities().then(setWebhookCaps).catch(() => {});
    }
    const unsub = initDeveloperDriveSync((status) => {
      setDriveStatus(status);
      if (status?.connected) {
        checkDriveWebhookCapabilities().then(setWebhookCaps).catch(() => {});
      }
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const showNotice = (type, text) => {
    setDriveNotice({ type, text });
    setTimeout(() => setDriveNotice(null), 5000);
  };

  const handleCleanupOrphanedDriveFiles = async () => {
    if (isCleaningOrphans) return;
    setIsCleaningOrphans(true);
    try {
      const activeNames = (assistantsList || []).flatMap(a => [a?.name, a?.id].filter(Boolean));
      const res = await cleanupOrphanedDriveFolders(activeNames);
      if (res?.webhookNeedsUpdate) {
        setWebhookCaps(prev => ({ ...(prev || {}), needsUpdate: true, supportsDelete: false }));
        showNotice('warning', 'Update your deployed Google Apps Script in Drive Setup first to enable deleting leftover Drive folders.');
        if (onOpenGoogleDriveSetup) onOpenGoogleDriveSetup();
        else setIsSetupModalOpen(true);
      } else if (res?.deletedFolders > 0 || res?.deletedFiles > 0) {
        showNotice('success', `Cleaned up ${res.deletedFolders} deleted assistant folder(s) from Google Drive${res.removedNames?.length ? ` (${res.removedNames.join(', ')})` : ''}.`);
      } else {
        showNotice('success', 'Google Drive is already clean — no leftover folders from deleted assistants found.');
      }
    } catch (err) {
      showNotice('error', `Drive cleanup failed: ${err.message || String(err)}`);
    } finally {
      setIsCleaningOrphans(false);
    }
  };

  const handleReindexAssistant = async (ast, astFiles) => {
    if (!ast || !onUpdateAssistantFiles || isReindexing) return;
    setIsReindexing(true);
    try {
      await onUpdateAssistantFiles(ast.id || ast.name, astFiles);
      showNotice('success', `Deep project index & coverage refreshed for "${ast.name || ast.id}" (${astFiles.length} file(s) verified).`);
    } catch (err) {
      showNotice('error', `Re-indexing failed: ${err.message || String(err)}`);
    } finally {
      setIsReindexing(false);
    }
  };

  const handleConnectDriveClick = async () => {
    try {
      const next = await connectGoogleDrive();
      setDriveStatus(next);
      showNotice('success', `Google Drive connected${next.email ? ` (${next.email})` : ''}!`);
    } catch (err) {
      if (err.code === 'DRIVE_CLIENT_ID_MISSING') {
        if (onOpenGoogleDriveSetup) onOpenGoogleDriveSetup();
        else setIsSetupModalOpen(true);
      } else {
        showNotice('error', err.message || 'Google Drive authorization failed.');
      }
    }
  };

  const handleDisconnectDrive = () => {
    disconnectDrive();
    setDriveStatus(getDriveConnectionStatus());
    showNotice('info', 'Google Drive disconnected. Uploads will remain in local cache.');
  };

  // Helper: Retrieve the list of files uploaded strictly for a given assistant (no shared bleed)
  const getAssistantFiles = (ast) => {
    if (!ast) return [];
    return Array.isArray(ast.uploadedFiles) ? ast.uploadedFiles : [];
  };

  // Upload files specifically targeting an assistant
  const handleFileUploadForAssistant = async (e, targetAssistant) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (!targetAssistant?.id || !onUpdateAssistantFiles) {
      showNotice('error', 'Select an existing assistant before processing knowledge files.');
      e.target.value = '';
      return;
    }

    setIsUploading(true);
    try {
      const uploaded = await uploadIngestionFiles(files);
      const response = await fetch('/api/agent/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${uploaded.idToken}` },
        body: JSON.stringify({ agentId: targetAssistant.id, files: uploaded.files })
      });
      const ingest = await response.json().catch(() => ({}));
      if (!response.ok || !ingest.success || !Array.isArray(ingest.knowledgeBase) || !ingest.knowledgeBase.length) {
        const details = (ingest.files || []).map(file => `${file.file}: ${file.reason || file.status}`).join('; ');
        throw new Error(ingest.error || details || 'No source-backed knowledge was extracted.');
      }

      const existingFiles = getAssistantFiles(targetAssistant);
      const uploadedAt = new Date().toISOString();
      const newFiles = (ingest.files || []).filter(file => file.status === 'extracted').map(file => {
        const original = files.find(item => item.name === file.file);
        return {
          id: `${targetAssistant.id}_${file.file}_${Date.now()}`, name: file.file,
          mimeType: original?.type || 'application/octet-stream', sizeBytes: original?.size || 0,
          type: 'knowledge', uploadedAt, extractedChunks: file.extractedChunks || 0, ingestionStatus: file.status
        };
      });
      const allowlist = { ...(targetAssistant.publicFieldAllowlist || {}) };
      for (const [collection, fields] of Object.entries(ingest.publicFieldAllowlist || {})) {
        allowlist[collection] = [...new Set([...(allowlist[collection] || []), ...fields])];
      }
      const previous = targetAssistant.ingestionSummary || {};
      const summary = {
        extractedFileCount: Number(previous.extractedFileCount || 0) + Number(ingest.extractedFileCount || 0),
        failedFileCount: Number(previous.failedFileCount || 0) + Number(ingest.failedFileCount || 0),
        extractedChunks: Number(previous.extractedChunks || 0) + Number(ingest.extractedChunks || 0)
      };
      await onUpdateAssistantFiles(
        targetAssistant.id,
        [...newFiles, ...existingFiles],
        [...(targetAssistant.knowledgeBase || []), ...ingest.knowledgeBase],
        [...(targetAssistant.databaseRecords || []), ...(ingest.databaseRecords || [])],
        null, allowlist, summary, true
      );
      const failedNames = (ingest.files || []).filter(file => file.status !== 'extracted').map(file => file.file);
      showNotice('success', `Extracted ${ingest.extractedFileCount} file(s), indexed ${ingest.extractedChunks} source chunks, and skipped ${failedNames.length} file(s)${failedNames.length ? `: ${failedNames.join(', ')}` : ''}.`);
    } catch (error) {
      showNotice('error', error.message || 'The secure file ingestion service could not process these files.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };
  // Delete file from a specific assistant
  const handleDeleteFileForAssistant = async (fileObj, targetAssistant) => {
    const currentFiles = getAssistantFiles(targetAssistant);
    const remainingFiles = currentFiles.filter((f) => f.id !== fileObj.id);

    if (targetAssistant && onUpdateAssistantFiles) {
      onUpdateAssistantFiles(targetAssistant.id, remainingFiles);
    }

    if (previewFile && previewFile.id === fileObj.id) setPreviewFile(null);
    await deleteFileFromLocalStore(fileObj.id);
    if ((fileObj.driveFileId || fileObj.name) && isDriveConnected()) {
      await deleteDriveFile(fileObj.driveFileId || `name_${fileObj.name}`, {
        fileName: fileObj.name,
        assistantName: targetAssistant?.name || ''
      });
    }
    showNotice('info', `Removed "${fileObj.name}" from ${targetAssistant?.name || 'workspace'}.`);
  };

  const hydrateFilesWithContent = async (fileList) => {
    const hydrated = [];
    for (const f of fileList) {
      let fullContent = f.content || '';
      if (!fullContent) {
        const localRec = await getFileFromLocalStore(f.id);
        if (localRec?.content) fullContent = localRec.content;
      }
      if (!fullContent && f.driveFileId && isDriveConnected() && !f.isBinary) {
        try {
          fullContent = await fetchDriveFileContent(f.driveFileId);
        } catch (e) {}
      }
      if (!fullContent) fullContent = f.contentPreview || '';
      hydrated.push({ ...f, content: fullContent });
    }
    return hydrated;
  };

  const handleOpenPreview = async (fileObj) => {
    setPreviewFile(fileObj);
    setPreviewContent('');
    setIsLoadingPreview(true);
    try {
      const [hydrated] = await hydrateFilesWithContent([fileObj]);
      setPreviewContent(hydrated.content || '[No preview text available. Open in Google Drive to inspect.]');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSendToComposer = async (selected) => {
    if (!onSendFilesToComposer) return;
    const hydrated = await hydrateFilesWithContent(selected);
    onSendFilesToComposer(hydrated);
  };

  // Determine active assistant in focused mode
  const activeAssistant = assistantsList.find(a => a.id === selectedAssistantTabId || a.name === selectedAssistantTabId)
    || currentAssistant
    || assistantsList[0]
    || null;

  // Render an individual Assistant Card containing its uploaded files
  const renderAssistantFileSection = (ast, isSolo = false) => {
    const astName = ast?.name || ast?.id || 'Shared Workspace';
    const astFiles = getAssistantFiles(ast);

    const counts = {
      all: astFiles.length,
      frontend: astFiles.filter((f) => f.type === 'frontend').length,
      backend: astFiles.filter((f) => f.type === 'backend').length,
      database: astFiles.filter((f) => f.type === 'database').length
    };

    const filteredFiles = astFiles.filter((f) => {
      const matchesTier = tierFilter === 'all' || f.type === tierFilter;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        (f.name || '').toLowerCase().includes(q) ||
        (f.categoryLabel || '').toLowerCase().includes(q) ||
        (f.type || '').toLowerCase().includes(q);
      return matchesTier && matchesSearch;
    });

    const isCurrentActive = currentAssistant && (currentAssistant.id === ast?.id || currentAssistant.name === ast?.name);

    return (
      <div
        key={ast?.id || 'workspace'}
        className={`bg-white border rounded-2xl shadow-sm overflow-hidden transition-all duration-200 ${
          isCurrentActive ? 'border-indigo-300 ring-2 ring-indigo-500/10' : 'border-slate-200'
        } ${isSolo ? '' : 'mb-6'}`}
      >
        {/* Assistant Header Card */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Bot size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900 tracking-tight truncate">
                  {astName}
                </h3>
                {isCurrentActive && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                    Active Assistant
                  </span>
                )}
                <span className="text-[11px] font-semibold text-slate-500">
                  • {ast?.role || 'Voice Help Desk'}
                </span>
              </div>

              {/* Persona Metadata Badges */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium flex items-center gap-1">
                  🎙️ Voice: <strong>{ast?.voice || 'Clara'}</strong>
                </span>
                <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-medium flex items-center gap-1">
                  ⚡ Model: <strong>{ast?.model || 'Groq Llama 3.3 70B Versatile'}</strong>
                </span>
                <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-medium flex items-center gap-1">
                  🧠 <strong>{ast?.knowledgeBase?.length || 0}</strong> Facts Indexed
                </span>
                <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-medium flex items-center gap-1">
                  📁 <strong>{astFiles.length}</strong> Files Stored
                </span>
                {(() => {
                  const deepIdx = ast?.deepProjectIndex || ast?.siteBlueprint?.deepProjectIndex;
                  const cov = deepIdx?.coverage;
                  if (!cov) return null;
                  const hasWarn = (cov.inaccessibleFilesCount || 0) > 0;
                  return (
                    <span
                      className={`px-2 py-0.5 rounded-md border text-[11px] font-medium flex items-center gap-1 ${
                        hasWarn
                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                          : 'bg-violet-50 text-violet-700 border-violet-200'
                      }`}
                      title={deepIdx.summary || 'Deep Project Coverage Index'}
                    >
                      🔍 Index: <strong>{cov.analyzedFilesCount || 0}</strong> ({cov.coveragePercent ?? 100}%)
                      {deepIdx.components?.length ? ` · ${deepIdx.components.length} comp` : ''}
                      {deepIdx.backendRoutes?.length ? ` · ${deepIdx.backendRoutes.length} routes` : ''}
                      {deepIdx.databaseSchemas?.length ? ` · ${deepIdx.databaseSchemas.length} schemas` : ''}
                      {hasWarn ? ` · ⚠️ ${cov.inaccessibleFilesCount} unreadable` : ''}
                    </span>
                  );
                })()}
                {(() => {
                  const auditSummary = getAccuracyAuditSummary(astName);
                  void auditRefreshTick;
                  const hasCaught = auditSummary.repairedCount > 0 || auditSummary.totalConflictsResolved > 0;
                  return (
                    <button
                      type="button"
                      onClick={() => setShowAccuracyAuditFor(prev => (prev === astName ? null : astName))}
                      className={`px-2 py-0.5 rounded-md border text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors ${
                        hasCaught
                          ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      }`}
                      title="Click to inspect continuous accuracy verification telemetry & recurring knowledge gaps"
                    >
                      🛡️ Accuracy: <strong>{auditSummary.passRate}%</strong>
                      {auditSummary.totalChecked > 0 ? ` (${auditSummary.totalChecked} verified` : ' (ready'}
                      {auditSummary.repairedCount > 0 ? ` · ${auditSummary.repairedCount} repaired` : ''}
                      {auditSummary.totalConflictsResolved > 0 ? ` · ${auditSummary.totalConflictsResolved} conflicts resolved` : ''}
                      )
                    </button>
                  );
                })()}
                {ast?.databaseConfig && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-300 text-[11px] font-semibold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    🔥 Live DB: {ast.databaseConfig.type === 'firebase' ? 'Firebase' : 'Supabase'} ({ast.databaseConfig.projectId || 'Connected'})
                  </span>
                )}
              </div>
              {showAccuracyAuditFor === astName && (() => {
                const auditSummary = getAccuracyAuditSummary(astName);
                const catEntries = Object.entries(auditSummary.issuesByCategory || {});
                return (
                  <div className="mt-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-700 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800">
                        Continuous Accuracy Audit — "{astName}" ({auditSummary.verifiedCleanCount}/{auditSummary.totalChecked} clean, {auditSummary.repairedCount} auto-repaired)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          clearAccuracyAuditLog();
                          setAuditRefreshTick(t => t + 1);
                        }}
                        className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                      >
                        Reset Audit Log
                      </button>
                    </div>
                    {catEntries.length > 0 ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-slate-500 font-semibold">Caught &amp; Prevented:</span>
                        {catEntries.map(([k, v]) => (
                          <span key={k} className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold">
                            {k}: {v}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-emerald-700 font-medium">
                        No hallucinations or factual discrepancies caught yet — all verified answers passed cleanly.
                      </div>
                    )}
                    {auditSummary.topRecurringGaps.length > 0 && (
                      <div className="text-slate-600">
                        <span className="font-semibold text-slate-700">Recurring Knowledge Gaps: </span>
                        {auditSummary.topRecurringGaps.map(g => `"${g.query}" (${g.count}x)`).join(' · ')}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Action Buttons for this Specific Assistant */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <label className="h-8 px-3.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm shadow-indigo-500/20 active:scale-95 transition-all">
              {isUploading ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />}
              <span>+ Upload Files to "{astName}"</span>
              <input
                type="file"
                multiple
                accept="*"
                onChange={(e) => handleFileUploadForAssistant(e, ast)}
                disabled={isUploading}
                className="hidden"
              />
            </label>

            {astFiles.length > 0 && onUpdateAssistantFiles && (
              <button
                type="button"
                onClick={() => handleReindexAssistant(ast, astFiles)}
                disabled={isReindexing}
                className="h-8 px-3 rounded-lg bg-white hover:bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
                title={`Verify coverage and incrementally re-index all files for "${astName}"`}
              >
                <RefreshCw size={12} className={isReindexing ? 'animate-spin text-violet-600' : 'text-violet-600'} />
                <span>{isReindexing ? 'Indexing...' : 'Re-Index Project'}</span>
              </button>
            )}

            {astFiles.length > 0 && onSendFilesToComposer && (
              <button
                type="button"
                onClick={() => handleSendToComposer(astFiles)}
                className="h-8 px-3 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                title={`Synthesize or re-compose "${astName}" using these files in Composer`}
              >
                <Sparkles size={13} className="text-indigo-600" />
                <span>Composer</span>
              </button>
            )}
          </div>
        </div>

        {/* Inside the Assistant: "Files Uploaded to Make This Assistant" */}
        <div className="p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <FolderOpen size={15} className="text-indigo-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Files Uploaded to Make "{astName}"
              </span>
              <span className="px-2 py-0.2 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold">
                {astFiles.length}
              </span>
            </div>

            {/* In-Card Tier Filter Pills */}
            <div className="flex items-center gap-1.5 text-xs flex-wrap">
              {[
                { id: 'all', label: `All (${counts.all})` },
                { id: 'database', label: `Database/JSON (${counts.database})` },
                { id: 'frontend', label: `Frontend (${counts.frontend})` },
                { id: 'backend', label: `Backend (${counts.backend})` }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTierFilter(tab.id)}
                  className={`h-6 px-2.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    tierFilter === tab.id
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Files List / Grid for this Assistant */}
          {filteredFiles.length === 0 ? (
            <div className="py-10 px-6 border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-xl text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
                <FileCode size={22} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800">
                  {astFiles.length === 0
                    ? `No Files Uploaded for "${astName}" Yet`
                    : 'No files match your search filter'}
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                  Upload database exports (.json, .sql, .csv), full-stack .zip project archives, frontend HTML/JSX pages, or backend API routes used to create and ground <strong>"{astName}"</strong>.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-center gap-2.5 flex-wrap">
                <label className="h-8 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-all">
                  <Upload size={13} />
                  <span>Upload Files to "{astName}"</span>
                  <input
                    type="file"
                    multiple
                    accept="*"
                    onChange={(e) => handleFileUploadForAssistant(e, ast)}
                    disabled={isUploading}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredFiles.map((f) => {
                const isFrontend = f.type === 'frontend';
                const isBackend = f.type === 'backend';
                const isDatabase = f.type === 'database';
                const isSyncedToDrive = f.storageStatus === 'synced' && Boolean(f.driveFileId);

                const tierStyles = isFrontend
                  ? {
                      iconBg: 'bg-indigo-50 border-indigo-200 text-indigo-600',
                      badge: 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    }
                  : isBackend
                  ? {
                      iconBg: 'bg-emerald-50 border-emerald-200 text-emerald-600',
                      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }
                  : {
                      iconBg: 'bg-sky-50 border-sky-200 text-sky-600',
                      badge: 'bg-sky-50 text-sky-700 border-sky-200'
                    };

                return (
                  <div
                    key={f.id}
                    className="p-3.5 rounded-xl bg-white border border-slate-200/90 hover:border-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all shadow-2xs group"
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${tierStyles.iconBg}`}>
                        {isFrontend ? <Globe size={16} /> : isBackend ? <Server size={16} /> : <Database size={16} />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {f.name}
                          </span>
                          <span className={`text-[10px] px-2 py-0.2 rounded-full border font-mono font-semibold ${tierStyles.badge}`}>
                            {f.categoryLabel || f.type}
                          </span>
                          {f.itemsCount > 0 && (
                            <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold flex items-center gap-1">
                              <CheckCircle2 size={10} />
                              {f.itemsCount} Facts Extracted
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                          <span>{f.size}</span>
                          <span>•</span>
                          <span>Uploaded {f.uploadedAt || 'recently'}</span>
                          {isSyncedToDrive ? (
                            <>
                              <span>•</span>
                              <span className="text-emerald-700 flex items-center gap-1 font-medium">
                                <HardDrive size={10} /> Stored in Drive
                              </span>
                            </>
                          ) : f.storageStatus === 'syncing' ? (
                            <>
                              <span>•</span>
                              <span className="text-indigo-600 flex items-center gap-1 font-medium animate-pulse">
                                <HardDrive size={10} /> Syncing to Drive…
                              </span>
                            </>
                          ) : (
                            <>
                              <span>•</span>
                              <span className="text-amber-700 font-medium">Local Cache</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto flex-wrap">
                      {onTrainAssistantFromFile && (f.name.endsWith('.json') || isDatabase) && (
                        <button
                          type="button"
                          onClick={() => onTrainAssistantFromFile(f, ast)}
                          className="h-7 px-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-xs font-semibold text-emerald-700 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          title={`Index Q&A facts from this file into "${astName}"`}
                        >
                          <Database size={12} className="text-emerald-600" />
                          <span>Index to "{astName}"</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleOpenPreview(f)}
                        className="h-7 px-2.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-xs font-medium text-slate-700 flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                      >
                        <Eye size={12} className="text-slate-500" />
                        <span>Preview</span>
                      </button>

                      {onSendFilesToComposer && (
                        <button
                          type="button"
                          onClick={() => handleSendToComposer([f])}
                          className="h-7 px-2.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                          title="Attach this file to Composer"
                        >
                          <Sparkles size={11} className="text-indigo-600" />
                          <span>Composer</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeleteFileForAssistant(f, ast)}
                        className="h-7 w-7 rounded-lg bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-300 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                        title={`Remove file from "${astName}"`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#F8FAFC]">
      {/* Top Main Navigation Header */}
      <div className="min-h-[58px] px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white shrink-0 shadow-2xs">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <HardDrive size={16} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 leading-tight">
              Knowledge Base &amp; Codebase Files
            </h2>
            <p className="text-[11px] text-slate-500">
              Files uploaded to make and train your AI voice assistants.
            </p>
          </div>
        </div>

        {/* Global Toolbar Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex items-center rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('focused')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                viewMode === 'focused' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Focus Assistant
            </button>
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                viewMode === 'all' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              View All Assistants ({assistantsList.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onOpenGoogleDriveSetup) onOpenGoogleDriveSetup();
              else setIsSetupModalOpen(true);
            }}
            className="h-8 px-2.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Google Drive Storage Settings"
          >
            <Settings size={12} className="text-slate-500" />
            <span>Drive Setup</span>
          </button>
        </div>
      </div>

      {/* Google Drive Status Bar */}
      <div className="px-6 py-2.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 text-xs">
          <span className={`w-2.5 h-2.5 rounded-full ${driveStatus.connected ? 'bg-emerald-500' : 'bg-amber-400'}`} />
          <span className="font-semibold text-slate-800">
            {driveStatus.connected ? `Developer Google Drive Connected (${driveStatus.email || 'Ready'})` : 'Developer Google Drive Disconnected'}
          </span>
          <span className="text-slate-400">•</span>
          <span className="text-[11px] text-slate-500">
            {driveStatus.connected
              ? 'Central storage active — all uploaded files across all users are automatically stored in the developer\'s Google Drive.'
              : 'Files stored locally in browser cache. Developer can connect Google Drive once to back up all user files.'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {driveStatus.connected && (
            <button
              type="button"
              onClick={handleCleanupOrphanedDriveFiles}
              disabled={isCleaningOrphans}
              className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-800 hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
              title="Remove leftover Google Drive folders belonging to previously deleted assistants"
            >
              {isCleaningOrphans ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={11} />}
              <span>{isCleaningOrphans ? 'Cleaning Drive...' : 'Clean Up Deleted Agents in Drive'}</span>
            </button>
          )}
          {driveStatus.connected ? (
            <button
              type="button"
              onClick={handleDisconnectDrive}
              className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
            >
              Disconnect Drive
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConnectDriveClick}
              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer flex items-center gap-1"
            >
              <HardDrive size={11} /> Connect Developer Drive
            </button>
          )}
        </div>
      </div>

      {driveStatus.connected && webhookCaps?.needsUpdate && (
        <div className="px-6 py-2.5 border-b border-amber-200 bg-amber-50 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="text-amber-600 shrink-0" />
            <span>
              <strong>Google Drive Auto-Delete Needs Script Update:</strong> Your deployed Apps Script is an older upload-only version, so deleted assistants&apos; files stay in Drive until you re-deploy the updated script.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (onOpenGoogleDriveSetup) onOpenGoogleDriveSetup();
              else setIsSetupModalOpen(true);
            }}
            className="h-7 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold cursor-pointer shrink-0 transition-colors"
          >
            Update Drive Script
          </button>
        </div>
      )}

      {/* Inline Notice Toast */}
      {driveNotice && (
        <div
          className={`mx-6 mt-3 px-4 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 shrink-0 ${
            driveNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : driveNotice.type === 'error'
              ? 'bg-rose-50 border-rose-300 text-rose-800'
              : 'bg-sky-50 border-sky-300 text-sky-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {driveNotice.type === 'error' ? <AlertCircle size={14} className="text-rose-600" /> : <CheckCircle2 size={14} className="text-emerald-600" />}
            <span className="font-medium">{driveNotice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setDriveNotice(null)}
            className="text-[11px] opacity-70 hover:opacity-100 font-semibold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Assistant Selection Ribbon (in Focused Mode) */}
      {viewMode === 'focused' && assistantsList.length > 0 && (
        <div className="px-6 py-2.5 border-b border-slate-200 bg-white flex items-center justify-between gap-3 shrink-0 overflow-x-auto">
          <div className="flex items-center gap-2 flex-nowrap">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap mr-1">
              Select Assistant:
            </span>
            {assistantsList.map((ast) => {
              const isSelected = (activeAssistant?.id === ast.id || activeAssistant?.name === ast.name);
              const astFiles = getAssistantFiles(ast);
              return (
                <button
                  key={ast.id}
                  type="button"
                  onClick={() => {
                    setSelectedAssistantTabId(ast.id);
                    if (onSelectAssistant) onSelectAssistant(ast.id);
                  }}
                  className={`h-8 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shadow-2xs ${
                    isSelected
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Bot size={13} className={isSelected ? 'text-indigo-600' : 'text-slate-400'} />
                  <span>{ast.name}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    isSelected ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {astFiles.length} files
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick Search */}
          <div className="h-8 px-2.5 rounded-lg bg-slate-50 border border-slate-300 focus-within:border-indigo-500 flex items-center gap-2 text-xs shrink-0 max-w-xs">
            <Search size={12} className="text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files..."
              className="w-36 bg-transparent text-slate-800 placeholder-slate-400 focus:outline-none text-xs"
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {viewMode === 'all' ? (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  All Workspace Assistants &amp; Their Uploaded Files
                </h3>
                <p className="text-xs text-slate-500">
                  Each assistant is grounded with its own dedicated uploaded files and database JSON records.
                </p>
              </div>
            </div>

            {assistantsList.length === 0 ? (
              <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center space-y-3">
                <Bot size={32} className="mx-auto text-indigo-600" />
                <h4 className="text-sm font-bold text-slate-900">No Assistants Created Yet</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Create an assistant in the Voice Assistants builder or synthesize one in Composer.
                </p>
              </div>
            ) : (
              assistantsList.map((ast) => renderAssistantFileSection(ast, false))
            )}
          </div>
        ) : (
          <div>
            {activeAssistant ? (
              renderAssistantFileSection(activeAssistant, true)
            ) : (
              <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center space-y-3">
                <Bot size={32} className="mx-auto text-indigo-600" />
                <h4 className="text-sm font-bold text-slate-900">No Assistant Selected</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Please create or select an assistant from the top bar to inspect its uploaded files.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preview File Modal */}
      {previewFile && (
        <div
          onClick={() => setPreviewFile(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 flex flex-col max-h-[85vh]"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>{previewFile.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono font-semibold">
                    {previewFile.categoryLabel || previewFile.type}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {previewFile.size} • {previewFile.uploadedAt || 'Uploaded file'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewFile(null)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
              {isLoadingPreview ? (
                <div className="h-40 flex items-center justify-center gap-2 text-xs text-slate-500">
                  <RefreshCw size={14} className="animate-spin text-indigo-600" />
                  <span>Loading file content...</span>
                </div>
              ) : (
                <pre className="text-xs text-slate-800 font-mono whitespace-pre-wrap leading-relaxed">
                  {previewContent}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Google Drive Setup Wizard Modal */}
      <GoogleDriveSetupModal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
        onConnected={(status) => {
          setDriveStatus(status);
          showNotice('success', `Google Drive connected${status.email ? ` (${status.email})` : ''}!`);
        }}
      />
    </div>
  );
}
