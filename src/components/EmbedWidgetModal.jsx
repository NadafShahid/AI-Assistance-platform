import React, { useState } from 'react';
import { Code2, Copy, Check, X, ExternalLink, ShieldCheck, Volume2, Lock } from 'lucide-react';

export default function EmbedWidgetModal({ isOpen, onClose, agent }) {
  const [copied, setCopied] = useState(false);
  const [activePlatform, setActivePlatform] = useState('html');
  const [testMode, setTestMode] = useState(false);
  if (!isOpen) return null;

  const agentName = (agent?.name || agent?.title || 'AI Assistant').trim();
  const agentId = String(agent?.widgetId || agent?.id || agent?.agentId || agentName).replace(/\//g, '-');
  const widgetUrl = `${window.location.origin}/widget.js`;
  const scriptSnippet = `<script src="${widgetUrl}" data-agent-id="${agentId}" defer></script>`;
  const platforms = [
    { id: 'html', label: 'HTML / Vanilla JS' },
    { id: 'react', label: 'React / Next.js' },
    { id: 'curl', label: 'cURL / REST API' },
    { id: 'wordpress', label: 'WordPress' },
    { id: 'webflow', label: 'Webflow' }
  ];
  const getPlatformCode = () => {
    if (activePlatform === 'react') return `import Script from 'next/script';\n\n<Script src="${widgetUrl}" data-agent-id="${agentId}" strategy="lazyOnload" />`;
    if (activePlatform === 'curl') return `curl -X POST "${window.location.origin}/api/agent/query" \\\n  -H "Content-Type: application/json" \\\n  -d '{"agentId":"${agentId}","message":"What can you help me with?"}'`;
    if (activePlatform === 'wordpress') return `<!-- Add this in your footer or a site-wide custom HTML block -->\n${scriptSnippet}`;
    if (activePlatform === 'webflow') return `<!-- Add this in Project Settings > Custom Code > Footer Code -->\n${scriptSnippet}`;
    return `<!-- Paste before </body>. Answers use the secure central API. -->\n${scriptSnippet}`;
  };
  const handleCopy = async (text) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const launchTestWidget = () => {
    document.querySelectorAll('script[data-agent-id="' + agentId.replace(/"/g, '') + '"]').forEach(el => el.remove());
    const script = document.createElement('script');
    script.src = '/widget.js';
    script.setAttribute('data-agent-id', agentId);
    script.defer = true;
    document.body.appendChild(script);
    setTestMode(true);
  };
  const openDemoPage = () => {
    const voiceParam = agent?.voice ? `&voice=${encodeURIComponent(agent.voice)}` : '';
    window.open(`/demo-client-site.html?agent=${encodeURIComponent(agentId)}${voiceParam}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-900">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600"><Code2 size={20} /></div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Agent Embed &amp; Deployment</h3>
              <p className="text-xs text-slate-500">Agent: <span className="text-indigo-600 font-bold">{agentName}</span> · Voice: <span className="text-violet-600 font-semibold">{agent?.voice || 'Clara'}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-5">
          <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 flex gap-3 items-start">
            <Lock size={16} className="mt-0.5 text-emerald-700" />
            <p className="text-[11px] text-slate-700 leading-relaxed">This widget uses the secure central agent API. Provider credentials, knowledge files, and database access remain server-side; no API key belongs in your website code.</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold"><Code2 size={15} className="text-indigo-600" /><span>Website Embed Tag</span></div>
              <span className="text-[10px] text-slate-500">No key required in browser</span>
            </div>
            <pre className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 font-mono text-cyan-300 text-xs overflow-x-auto select-all">{scriptSnippet}</pre>
            <div className="flex items-center justify-between pt-1">
              <div className="text-[11px] text-slate-600 flex items-center gap-1.5"><ShieldCheck size={13} className="text-emerald-600" /><span>Paste before <code className="text-indigo-600 font-mono">&lt;/body&gt;</code>.</span></div>
              <div className="flex gap-3">
                <button onClick={() => handleCopy(scriptSnippet)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy tag'}</button>
                <button type="button" onClick={openDemoPage} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"><span>Open Demo</span><ExternalLink size={12} /></button>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2"><span className="text-xs font-bold">Framework &amp; Platform Code:</span><div className="flex gap-1 overflow-x-auto">{platforms.map(platform => <button key={platform.id} onClick={() => setActivePlatform(platform.id)} className={`px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap ${activePlatform === platform.id ? 'bg-indigo-50 text-indigo-700 border border-indigo-300' : 'bg-white text-slate-600 border border-slate-200'}`}>{platform.label}</button>)}</div></div>
            <div className="relative"><pre className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 font-mono text-slate-200 text-xs overflow-x-auto max-h-48 select-all">{getPlatformCode()}</pre><button onClick={() => handleCopy(getPlatformCode())} className="absolute right-2 top-2 p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white" title="Copy code">{copied ? <Check size={13} /> : <Copy size={13} />}</button></div>
          </div>
          <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-center justify-between shadow-sm">
            <div><h4 className="text-xs font-bold flex items-center gap-1.5"><Volume2 size={14} className="text-indigo-600" />Test Voice Widget On This Workspace</h4><p className="text-[11px] text-slate-500 mt-0.5">Test messages go through the same secure API as the published widget.</p></div>
            <button type="button" onClick={launchTestWidget} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold">{testMode ? 'Reload Widget' : 'Launch Test'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
