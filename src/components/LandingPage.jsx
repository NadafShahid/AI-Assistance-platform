import React, { useState } from 'react';
import {
  Sparkles,
  Bot,
  AudioWaveform,
  Code2,
  HardDrive,
  Download,
  FolderArchive,
  ArrowRight,
  ShieldCheck,
  Zap,
  Globe,
  Server,
  Database,
  CheckCircle2,
  Play,
  Pause,
  Layers,
  Wrench,
  Clock,
  ExternalLink,
  ChevronRight,
  Volume2
} from 'lucide-react';
import { resolveLockedVoice } from '../utils/voiceConsistency';

export default function LandingPage({ onOpenAuth, onOpenDashboard }) {
  const [playingVoiceId, setPlayingVoiceId] = useState(null);

  const sampleVoices = [
    { id: 'adam', name: 'Adam', gender: 'Male', tone: 'Deep & Natural Baritone', sample: "Hello! I'm Adam. I guide your visitors through services, pricing, and bookings with an authoritative, natural human voice." },
    { id: 'rachel', name: 'Rachel', gender: 'Female', tone: 'Ultra-Natural & Conversational', sample: "Hi there! I'm Rachel. I answer visitor questions with genuine warmth, clarity, and zero robotic monotone." },
    { id: 'clara', name: 'Clara', gender: 'Female', tone: 'Warm & Professional', sample: "Hello! I'm Clara. I guide your visitors through services, pricing, and bookings with zero latency." },
    { id: 'elliot', name: 'Elliot', gender: 'Male', tone: 'Authoritative & Clear', sample: "Greetings. I'm Elliot. I assist your customers with technical documentation and live order status." }
  ];

  const handlePlayVoice = (v) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    if (playingVoiceId === v.id) {
      window.speechSynthesis.cancel();
      setPlayingVoiceId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(v.sample);
    const resolved = resolveLockedVoice(v.name);
    if (resolved.voice) {
      utterance.voice = resolved.voice;
    }
    utterance.pitch = resolved.pitch;
    utterance.rate = resolved.rate;

    setPlayingVoiceId(v.id);
    utterance.onend = () => setPlayingVoiceId(null);
    utterance.onerror = () => setPlayingVoiceId(null);

    window.speechSynthesis.speak(utterance);
  };

  const launchTestWidget = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const sampleText = "Welcome to Echo AI! In your dashboard, you can build, customize, and export autonomous AI voice agents with zero external API keys.";
      const utterance = new SpeechSynthesisUtterance(sampleText);
      const resolved = resolveLockedVoice('Adam');
      if (resolved.voice) utterance.voice = resolved.voice;
      utterance.pitch = resolved.pitch;
      utterance.rate = resolved.rate;
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/20 selection:text-indigo-800 overflow-x-hidden">
      
      {/* Background Radial Glow Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[450px] bg-gradient-to-b from-indigo-100/60 via-slate-100/40 to-transparent rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* 1. Header Navigation */}
      <header className="relative z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-sm">
              <AudioWaveform size={20} />
            </div>
            <div>
              <span className="text-base font-extrabold tracking-tight text-slate-900">Echo AI</span>
              <span className="ml-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold">
                Voice Help Desk
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600">
            <a href="#how-it-works" className="hover:text-indigo-600 transition-colors">How it Works</a>
            <a href="#voice-engine" className="hover:text-indigo-600 transition-colors">Voice Engine</a>
            <a href="#storage-policy" className="hover:text-indigo-600 transition-colors">15-Day Storage Policy</a>
            <a href="#pricing" className="hover:text-indigo-600 transition-colors">Pricing ($0 Free)</a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenAuth}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 transition-colors cursor-pointer"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={onOpenDashboard}
              className="h-9 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer"
            >
              <Sparkles size={14} />
              <span>Launch Dashboard</span>
            </button>
          </div>

        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="relative z-10 pt-20 pb-24 px-6 text-center">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span>Autonomous Voice AI · Direct AI Key &amp; Database Engine · $0 Free Tier</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.15] text-slate-900">
            Build Autonomous AI Voice Agents From Your <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 bg-clip-text text-transparent">Full-Stack Codebase</span>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Upload your Frontend, Backend, and Database files. The AI Composer synthesizes a production-ready voice assistant with locked deterministic voices, shadow DOM isolation, and <strong className="text-slate-900 font-semibold">1-line script embed</strong>.
          </p>

          {/* Hero CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
            <button
              type="button"
              onClick={onOpenDashboard}
              className="w-full sm:w-auto h-12 px-8 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer"
            >
              <span>Start Building Free in Dashboard</span>
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              onClick={launchTestWidget}
              className="w-full sm:w-auto h-12 px-6 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
            >
              <Volume2 size={16} className="text-indigo-600" />
              <span>Test Live Voice Help Desk</span>
            </button>
          </div>

          {/* Keyless Guarantee Pill */}
          <div className="flex flex-wrap items-center justify-center gap-6 pt-6 text-xs text-slate-600 font-semibold">
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-2xs">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span>Direct AI Key &amp; Live Database Access</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-2xs">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span>15-Day Auto-Purge Cloud Storage</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-2xs">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span>Clean Website Integration</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-2xs">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span>Natural Voice &amp; Accents</span>
            </div>
          </div>

        </div>

        {/* 3. Hero Visual Preview Card */}
        <div className="max-w-5xl mx-auto mt-14 relative">
          <div className="p-3 sm:p-4 rounded-3xl bg-gradient-to-b from-indigo-100/80 via-slate-100/50 to-transparent border border-slate-200 shadow-xl">
            <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden text-left shadow-sm">
              
              {/* Window Bar */}
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rose-400 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />
                  <span className="text-xs text-slate-500 font-mono font-medium ml-2">Echo AI Dashboard · Voice Agent Preview</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono font-bold">
                    $0.00 / Free Tier
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-mono font-bold">
                    &lt; 200ms Latency
                  </span>
                </div>
              </div>

              {/* Window Content */}
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50/50">
                
                {/* Left: Codebase Analysis breakdown */}
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Multi-Tier Ingestion</div>
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1.5 shadow-2xs">
                    <div className="flex items-center gap-2 text-xs font-bold text-indigo-700">
                      <Globe size={14} className="text-indigo-600" />
                      <span>Frontend (UI &amp; Routes)</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">Pages, navigation tabs, and contact forms indexed into interactive Q&A.</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1.5 shadow-2xs">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
                      <Server size={14} className="text-emerald-600" />
                      <span>Backend (APIs &amp; Tools)</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">REST & Webhook endpoints automatically converted to executable assistant tools.</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1.5 shadow-2xs">
                    <div className="flex items-center gap-2 text-xs font-bold text-sky-700">
                      <Database size={14} className="text-sky-600" />
                      <span>Database (Schemas &amp; Facts)</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">Products, FAQs, and services loaded into high-precision knowledge graph.</p>
                  </div>
                </div>

                {/* Center: Live Voice Orb & Dialogue */}
                <div className="md:col-span-2 flex flex-col justify-between p-6 rounded-2xl bg-white border border-slate-200 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-white font-bold shadow-2xs">
                        AI
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          Autonomous Voice Assistant
                          <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono font-bold">Clara (Locked)</span>
                        </div>
                        <div className="text-[11px] text-slate-500">AI Help Desk & Consultation</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-mono font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Ready to Speak</span>
                    </div>
                  </div>

                  {/* Conversation bubbles */}
                  <div className="space-y-3 font-sans text-xs">
                    <div className="p-3.5 rounded-2xl bg-slate-100 text-slate-800 max-w-[85%]">
                      <span className="font-bold text-slate-900 block mb-0.5">Visitor:</span>
                      "Can you guide me through your services and how your platform operates?"
                    </div>
                    <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-950 max-w-[90%] ml-auto shadow-2xs">
                      <span className="font-bold text-indigo-700 block mb-0.5">AI Voice Assistant:</span>
                      "I am an autonomous voice assistant synthesized from your codebase. I answer visitor inquiries in real time with zero external API keys and zero server fees!"
                    </div>
                  </div>

                  {/* Bottom Action bar */}
                  <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
                      <Clock size={13} className="text-amber-500" />
                      <span>15-Day Auto-Purge Policy Active · Zero Keys Needed</span>
                    </div>
                    <button
                      type="button"
                      onClick={onOpenDashboard}
                      className="px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                    >
                      <Sparkles size={12} className="text-indigo-600" />
                      <span>Open in Dashboard</span>
                    </button>
                  </div>
                </div>

              </div>

            </div>
          </div>
        </div>

      </section>

      {/* 4. Statistics Ribbon */}
      <section className="relative z-10 border-y border-slate-200 bg-white py-12 px-6 shadow-2xs">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div>
            <div className="text-3xl font-black text-indigo-600">&lt; 200 ms</div>
            <div className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-bold">Inference Latency</div>
          </div>
          <div>
            <div className="text-3xl font-black text-emerald-600">0 API Keys</div>
            <div className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-bold">For Exported Widgets</div>
          </div>
          <div>
            <div className="text-3xl font-black text-violet-600">$0.00 / Mo</div>
            <div className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-bold">100% Free Architecture</div>
          </div>
          <div>
            <div className="text-3xl font-black text-amber-600">15 Days</div>
            <div className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-bold">Auto-Purge Lifecycle</div>
          </div>
        </div>
      </section>

      {/* 5. How It Works (3 Steps) */}
      <section id="how-it-works" className="relative z-10 py-24 px-6 max-w-6xl mx-auto space-y-16">
        <div className="text-center space-y-3">
          <div className="text-xs font-bold text-indigo-600 uppercase tracking-widest font-mono">WORKFLOW</div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">How to Build Your AI Agent in 3 Steps</h2>
          <p className="text-sm text-slate-600 max-w-xl mx-auto">
            From your website and database files to a fully functional, live AI voice help desk.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Step 1 */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all space-y-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold text-base shadow-2xs">
              1
            </div>
            <h3 className="text-base font-bold text-slate-900">Upload Files &amp; Prompt</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Drag-and-drop your Frontend (<code className="text-indigo-600 font-mono font-semibold bg-indigo-50 px-1 py-0.5 rounded">.jsx, .html</code>), Backend (<code className="text-violet-600 font-mono font-semibold bg-violet-50 px-1 py-0.5 rounded">.js, .py</code>), and Database (<code className="text-emerald-600 font-mono font-semibold bg-emerald-50 px-1 py-0.5 rounded">.json, .sql</code>) files into the Composer. Tell the AI what kind of agent you need.
            </p>
          </div>

          {/* Step 2 */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all space-y-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 text-violet-700 flex items-center justify-center font-bold text-base shadow-2xs">
              2
            </div>
            <h3 className="text-base font-bold text-slate-900">AI Composer Synthesis</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Groq LPU and Gemini 3.8 Flash automatically extract UI pages, bind backend routes into executable action tools, and compile a semantic knowledge graph with locked persona voices.
            </p>
          </div>

          {/* Step 3 */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all space-y-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center font-bold text-base shadow-2xs">
              3
            </div>
            <h3 className="text-base font-bold text-slate-900">1-Click Embed &amp; API Key Integration</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Embed your live assistant anywhere with a 1-line script tag and user-provided API key. Runs at &lt;200ms latency on Groq LPU with zero server management.
            </p>
          </div>

        </div>
      </section>

      {/* 6. Voice Engine & Deterministic Consistency */}
      <section id="voice-engine" className="relative z-10 py-20 px-6 bg-slate-50 border-y border-slate-200">
        <div className="max-w-6xl mx-auto space-y-12">
          
          <div className="text-center space-y-3">
            <div className="text-xs font-bold text-indigo-600 uppercase tracking-widest font-mono">VOICE CONSISTENCY ENGINE</div>
            <h2 className="text-3xl font-extrabold text-slate-900">Deterministic Locked Voice Personas</h2>
            <p className="text-sm text-slate-600 max-w-xl mx-auto">
              Our voice engine locks the exact voice URI, pitch, and speech rate to eliminate voice fluctuating across turns. Click to audition each voice:
            </p>
          </div>

          {/* Voice Soundboard Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {sampleVoices.map((v) => (
              <div
                key={v.id}
                className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col justify-between space-y-4 shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-slate-900">{v.name}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold">
                      {v.gender}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 font-medium mt-1">{v.tone}</div>
                  <p className="text-[11px] text-slate-600 italic mt-3 line-clamp-3 leading-relaxed">
                    "{v.sample}"
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handlePlayVoice(v)}
                  className={`w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                    playingVoiceId === v.id
                      ? 'bg-rose-50 text-rose-700 border border-rose-300'
                      : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                  }`}
                >
                  {playingVoiceId === v.id ? <Pause size={13} /> : <Play size={13} fill="currentColor" />}
                  <span>{playingVoiceId === v.id ? 'Pause Voice' : 'Audition Voice'}</span>
                </button>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* 7. Privacy & Storage Policy */}
      <section id="storage-policy" className="relative z-10 py-24 px-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          
          <div className="space-y-6">
            <div className="text-xs font-bold text-amber-600 uppercase tracking-widest font-mono">PRIVACY &amp; LIFECYCLE</div>
            <h2 className="text-3xl font-extrabold text-slate-900 leading-tight">
              15-Day Auto-Purge Storage &amp; Secure Cloud Integration
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              When an agent is created, your AI API keys and database credentials stay secure. The assistant connects directly to your live database records to provide accurate answers to your visitors.
            </p>
            <div className="space-y-3 text-xs text-slate-600">
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900 block font-bold">15-Day Cloud Deletion:</strong>
                  Temporary cloud storage snapshots are automatically deleted 15 days following download for GDPR hygiene and resource optimization.
                </div>
              </div>
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900 block font-bold">Permanent Local Runtime:</strong>
                  Your downloaded bundle (<code className="text-emerald-700 font-mono font-semibold bg-emerald-50 px-1 py-0.5 rounded">.js</code> + <code className="text-emerald-700 font-mono font-semibold bg-emerald-50 px-1 py-0.5 rounded">index.html</code>) is 100% yours forever and runs indefinitely without any expiration.
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-amber-200 space-y-4 shadow-md">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <HardDrive size={16} className="text-amber-600" />
                <span>Cloud Model Storage Inspector</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-50 text-amber-700 border border-amber-200 font-mono font-bold">
                Auto-Purge Active
              </span>
            </div>
            <div className="space-y-2 text-xs font-mono text-slate-600">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span>Storage Retention:</span>
                <span className="text-slate-900 font-semibold">15 Days From Download</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span>Client External Keys:</span>
                <span className="text-emerald-700 font-bold">0 Required</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span>Speech Synthesis:</span>
                <span className="text-indigo-700 font-bold">Browser Native Web Speech</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span>CSS Encapsulation:</span>
                <span className="text-violet-700 font-bold">Isolated Shadow DOM</span>
              </div>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={onOpenDashboard}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm shadow-amber-500/20"
              >
                <span>Explore in Dashboard</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* 8. Pricing Section ($0 Free Tier) */}
      <section id="pricing" className="relative z-10 py-20 px-6 bg-slate-50 border-t border-slate-200 text-center">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="text-xs font-bold text-emerald-600 uppercase tracking-widest font-mono">PRICING</div>
          <h2 className="text-3xl font-extrabold text-slate-900">100% Free Tier Architecture</h2>
          <p className="text-sm text-slate-600">
            No credit card, no hidden fees. Built with zero-cost browser primitives and free tier cloud limits.
          </p>

          <div className="mt-8 p-8 rounded-3xl bg-white border border-slate-200 text-left relative overflow-hidden shadow-lg">
            <div className="absolute top-0 right-0 px-4 py-1.5 rounded-bl-2xl bg-indigo-50 text-indigo-700 border-l border-b border-indigo-200 text-xs font-bold font-mono">
              COMMUNITY &amp; CREATOR
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-slate-900">$0</span>
              <span className="text-xs text-slate-500 font-medium">/ month forever</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">Everything you need to build, test, and deploy AI voice agents.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 my-6 text-xs text-slate-700 font-medium">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                <span>Unlimited Codebase File Ingestion</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                <span>AI Composer with Groq &amp; Gemini</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                <span>Instant 1-Line Embed Tag &amp; API Key Integration</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                <span>Deterministic Locked Voice Consistency</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                <span>Isolated Shadow DOM Widget</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                <span>15-Day Automated Storage Lifecycle</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenDashboard}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm shadow-indigo-500/20 active:scale-[0.99]"
            >
              <span>Get Started Now (Instant Access)</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* 9. Footer */}
      <footer className="relative z-10 border-t border-slate-200 bg-white py-10 px-6 text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-600 font-medium">
            <AudioWaveform size={16} className="text-indigo-600" />
            <span className="font-bold text-slate-900">Echo AI Agent Platform</span>
            <span>· Built on Firebase Spark $0 &amp; Web Speech API</span>
          </div>
          <div className="flex items-center gap-6 font-medium">
            <button type="button" onClick={onOpenAuth} className="hover:text-indigo-600 transition-colors cursor-pointer">
              Login to Workspace
            </button>
            <a href="#how-it-works" className="hover:text-indigo-600 transition-colors">Documentation</a>
            <span>© 2026 Echo AI. All rights reserved.</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
