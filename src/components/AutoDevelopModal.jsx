import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Bot,
  CheckCircle2,
  Wand2,
  Zap,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { autoDevelopAgentFromBrief } from '../utils/autoAgentDeveloper';

export default function AutoDevelopModal({
  isOpen,
  onClose,
  currentAssistant,
  onApplyDevelopedAgent
}) {
  const [briefInput, setBriefInput] = useState('');
  const [isDeveloping, setIsDeveloping] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const quickSamples = [
    { label: '🎓 Academic & Admissions', prompt: 'Academic admissions counselor helping students with course eligibility, fee structure, and document submission' },
    { label: '🛍️ E-Commerce & Retail', prompt: 'Online store customer support handling order tracking, shipping, and 30-day refunds' },
    { label: '🏥 Healthcare Clinic', prompt: 'Medical clinic patient coordinator scheduling doctor visits, consultations, and office hours' },
    { label: '📈 Financial Advisory', prompt: 'Financial consultancy services for tax filing, GST compliance, loans, and wealth advisory' },
    { label: '💼 Tech / SaaS Platform', prompt: 'Technical support specialist troubleshooting API integration, subscriptions, and billing' }
  ];

  const handleDevelop = async () => {
    if (!briefInput.trim()) {
      alert("Please enter a short description or click one of the quick suggestions.");
      return;
    }
    setIsDeveloping(true);
    setSuccessMsg('');
    try {
      const developed = await autoDevelopAgentFromBrief(briefInput, currentAssistant);
      const applied = await onApplyDevelopedAgent(developed);
      if (applied === false) {
        setSuccessMsg('Upload verified source files before creating a new agent. No facts were generated from this description.');
        return;
      }
      setSuccessMsg(`✓ Successfully auto-developed "${developed.name}"! System prompt, voice, greeting, and FAQs are updated and ready for embed.`);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error("Auto development error:", err);
      alert("Failed to auto-develop agent. Please try again.");
    } finally {
      setIsDeveloping(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-2xs">
              <Wand2 size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Auto-Develop Full Agent from 1-Line Description
              </h3>
              <p className="text-xs text-slate-500">
                You don't need long prompts. Just describe what you want in a few words!
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {successMsg ? (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs flex items-center gap-2.5 animate-fadeIn font-semibold">
              <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          ) : (
            <>
              {/* Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>Describe what your assistant does:</span>
                  <span className="text-[11px] text-indigo-600 font-medium">Simple keywords are enough</span>
                </label>
                <textarea
                  rows={3}
                  value={briefInput}
                  onChange={(e) => setBriefInput(e.target.value)}
                  placeholder="e.g. Academic admissions advisor for science and commerce, or Online store with 30-day returns"
                  className="w-full p-3.5 bg-white border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition-colors shadow-2xs"
                />
              </div>

              {/* Quick Sample Suggestions */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
                  Or click a quick 1-click industry template:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {quickSamples.map((sample) => (
                    <button
                      key={sample.label}
                      type="button"
                      onClick={() => setBriefInput(sample.prompt)}
                      className="p-2.5 rounded-xl bg-white hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-300 text-left text-xs transition-all cursor-pointer flex items-center justify-between group shadow-2xs"
                    >
                      <span className="font-semibold text-slate-800 group-hover:text-indigo-700">{sample.label}</span>
                      <ArrowRight size={13} className="text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  ))}
                </div>
              </div>

              {/* What will be auto-generated */}
              <div className="p-3.5 rounded-xl bg-indigo-50/40 border border-indigo-100 text-xs text-slate-700 space-y-1.5">
                <div className="font-bold text-indigo-900 flex items-center gap-1.5 text-[11px]">
                  <Sparkles size={13} className="text-indigo-600" />
                  <span>What the AI will automatically build for you:</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1 font-medium">
                  <div>✓ Authoritative Persona &amp; System Prompt</div>
                  <div>✓ Natural Spoken Voice First Greeting</div>
                  <div>✓ Best matching Voice &amp; Latency Model</div>
                  <div>✓ Pre-compiled Q&amp;A FAQs for Knowledge Base</div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>Updates local editor, Firestore, and live agent instantly</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDevelop}
              disabled={isDeveloping}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer"
            >
              <Zap size={13} />
              <span>{isDeveloping ? 'Auto-Developing...' : '⚡ Auto-Develop Agent'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
