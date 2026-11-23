import JSZip from 'jszip';

/**
 * Agent Packager Utility
 * Compiles a standalone widget client that calls the secure agent API.
 * Can export as:
 * 1. Single standalone .js client
 * 2. Full .zip bundle (standalone .js + index.html demo + public config + README.md)
 */

function sanitizeSlug(name) {
  return (name || 'agent')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'ai-agent';
}

/**
 * Builds the standalone self-contained JavaScript script
 * Contains public presentation settings only; all answers come from the central API.
 */
export function generateStandaloneScriptContent(agent) {
  const agentData = {
    id: agent.widgetId || agent.id || agent.agentId || agent.name || `agent_${Date.now()}`,
    name: agent.name || 'Help Desk AI',
    role: agent.role || 'Customer Support Assistant',
    voice: agent.voice || 'Adam',
    model: agent.model || 'Central Agent API',
    greeting: agent.firstMessage || agent.greeting || `Hi there! I am your AI assistant. How can I help you today?`,
    themeColor: agent.themeColor || '#6366f1',
    accentColor: agent.accentColor || '#06b6d4',
    position: agent.position || 'bottom-right',
    avatar: agent.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces',
    apiEndpoint: `${typeof window !== 'undefined' ? window.location.origin : ''}/api/agent/query`,
    compiledAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
  };

  const serializedConfig = JSON.stringify(agentData, null, 2);

  return `/**
 * Standalone AI Voice Agent Bundle: ${agentData.name}
 * Generated: ${agentData.compiledAt}
 * Architecture: Secure central API & Web Speech
 * Embed anywhere: <script src="./${sanitizeSlug(agentData.name)}.standalone.js"></script>
 */
(function () {
  'use strict';

  // Public UI configuration only. Knowledge and credentials stay on the server.
  const agentConfig = ${serializedConfig};

  // Deterministic Persona Voice Profiles
  const VOICE_SPECS = {
    adam: {
      name: 'Adam',
      gender: 'male',
      primaryVoices: [
        'Microsoft AndrewMultilingual Online (Natural) - English (United States)',
        'Microsoft BrianMultilingual Online (Natural) - English (United States)',
        'Microsoft AndrewMultilingual',
        'Microsoft BrianMultilingual',
        'Microsoft Guy Online (Natural) - English (United States)',
        'Microsoft Christopher Online (Natural) - English (United States)',
        'Microsoft Guy',
        'Microsoft Christopher',
        'Google US English Male',
        'Microsoft David',
        'Daniel',
        'Alex'
      ],
      keywords: ['andrewmultilingual', 'brianmultilingual', 'guy', 'christopher', 'david', 'mark', 'daniel', 'alex', 'male', 'natural'],
      pitch: 0.90,
      rate: 0.97
    },
    rachel: {
      name: 'Rachel',
      gender: 'female',
      primaryVoices: [
        'Microsoft AvaMultilingual Online (Natural) - English (United States)',
        'Microsoft EmmaMultilingual Online (Natural) - English (United States)',
        'Microsoft AvaMultilingual',
        'Microsoft EmmaMultilingual',
        'Microsoft Jenny Online (Natural) - English (United States)',
        'Microsoft Aria Online (Natural) - English (United States)',
        'Microsoft Jenny',
        'Microsoft Aria',
        'Google US English Female',
        'Google US English',
        'Microsoft Zira',
        'Samantha',
        'Victoria'
      ],
      keywords: ['avamultilingual', 'emmamultilingual', 'jenny', 'aria', 'zira', 'samantha', 'karen', 'victoria', 'female', 'natural'],
      pitch: 1.02,
      rate: 0.98
    },
    clara: {
      name: 'Clara',
      gender: 'female',
      primaryVoices: [
        'Microsoft EmmaMultilingual Online (Natural) - English (United States)',
        'Microsoft AvaMultilingual Online (Natural) - English (United States)',
        'Microsoft Jenny Online (Natural) - English (United States)',
        'Microsoft Jenny',
        'Microsoft Aria Online (Natural) - English (United States)',
        'Google US English',
        'Microsoft Zira',
        'Samantha',
        'Victoria'
      ],
      keywords: ['emmamultilingual', 'avamultilingual', 'jenny', 'aria', 'zira', 'samantha', 'karen', 'victoria', 'female'],
      pitch: 1.05,
      rate: 1.0
    },
    elliot: {
      name: 'Elliot',
      gender: 'male',
      primaryVoices: [
        'Microsoft BrianMultilingual Online (Natural) - English (United States)',
        'Microsoft AndrewMultilingual Online (Natural) - English (United States)',
        'Microsoft Guy Online (Natural) - English (United States)',
        'Microsoft Guy',
        'Microsoft David',
        'Microsoft Mark',
        'Daniel',
        'Alex'
      ],
      keywords: ['brianmultilingual', 'andrewmultilingual', 'guy', 'david', 'mark', 'daniel', 'alex', 'male'],
      pitch: 0.95,
      rate: 1.0
    },
    godfrey: {
      name: 'Godfrey',
      gender: 'male',
      primaryVoices: ['Microsoft George', 'Microsoft David', 'Google UK English Male', 'Daniel'],
      keywords: ['george', 'david', 'daniel', 'male', 'uk'],
      pitch: 0.84,
      rate: 0.96
    },
    layla: {
      name: 'Layla',
      gender: 'female',
      primaryVoices: ['Microsoft Sonia Online (Natural)', 'Microsoft Sonia', 'Microsoft Jenny', 'Google US English', 'Microsoft Zira', 'Samantha'],
      keywords: ['sonia', 'jenny', 'zira', 'samantha', 'female'],
      pitch: 1.14,
      rate: 1.02
    },
    emma: {
      name: 'Emma',
      gender: 'female',
      primaryVoices: ['Microsoft Libby Online (Natural) - English (United Kingdom)', 'Microsoft Libby', 'Google UK English Female', 'Microsoft Hazel', 'Fiona'],
      keywords: ['libby', 'hazel', 'stephanie', 'female', 'uk', 'gb'],
      pitch: 1.08,
      rate: 1.0
    },
    sid: {
      name: 'Sid',
      gender: 'male',
      primaryVoices: ['Microsoft Guy Online (Natural)', 'Microsoft David', 'Google US English Male', 'Alex'],
      keywords: ['guy', 'david', 'male'],
      pitch: 1.0,
      rate: 1.04
    },
    savannah: {
      name: 'Savannah',
      gender: 'female',
      primaryVoices: ['Microsoft Aria Online (Natural)', 'Microsoft Aria', 'Google US English', 'Samantha'],
      keywords: ['aria', 'natural', 'female'],
      pitch: 1.15,
      rate: 0.98
    },
    kai: {
      name: 'Kai',
      gender: 'male',
      primaryVoices: ['Microsoft Guy', 'Microsoft David', 'Google US English'],
      keywords: ['guy', 'david', 'natural', 'male'],
      pitch: 0.98,
      rate: 1.02
    },
    nico: {
      name: 'Nico',
      gender: 'male',
      primaryVoices: ['Microsoft Ryan Online (Natural)', 'Microsoft David', 'Alex'],
      keywords: ['ryan', 'david', 'male'],
      pitch: 0.92,
      rate: 1.0
    },
    sagar: {
      name: 'Sagar',
      gender: 'male',
      primaryVoices: ['Microsoft Ravi', 'Microsoft Heera', 'Google UK English Male', 'Microsoft David'],
      keywords: ['ravi', 'heera', 'indian', 'male'],
      pitch: 0.95,
      rate: 1.0
    }
  };

  let cachedVoices = [];
  let lockedVoice = null;
  let lockedPitch = 1.0;
  let lockedRate = 1.0;

  let currentLockedPersona = null;

  function refreshVoices() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      cachedVoices = window.speechSynthesis.getVoices() || [];
      if (cachedVoices.length > 0) {
        resolveAndLockVoice(agentConfig.voice, true);
      }
    }
  }

  if (typeof window !== 'undefined' && window.speechSynthesis) {
    refreshVoices();
    window.speechSynthesis.onvoiceschanged = refreshVoices;
  }

  function resolveAndLockVoice(preferredName, forceUpdate = false) {
    const personaKey = String(preferredName || agentConfig.voice || 'Adam').toLowerCase().trim();
    if (!forceUpdate && lockedVoice && currentLockedPersona === personaKey) {
      return { voice: lockedVoice, pitch: lockedPitch, rate: lockedRate };
    }

    currentLockedPersona = personaKey;
    if (!window.speechSynthesis) return { voice: null, pitch: 1.0, rate: 1.0 };

    const voices = (cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices()) || [];
    if (!voices.length) return { voice: null, pitch: 1.0, rate: 1.0 };

    const spec = VOICE_SPECS[personaKey] || VOICE_SPECS.adam || VOICE_SPECS.rachel || VOICE_SPECS.clara;
    lockedPitch = spec.pitch;
    lockedRate = spec.rate;

    try {
      const savedURI = sessionStorage.getItem('vhd_locked_' + personaKey);
      if (savedURI) {
        const match = voices.find(v => v.voiceURI === savedURI);
        if (match) {
          lockedVoice = match;
          return { voice: lockedVoice, pitch: lockedPitch, rate: lockedRate };
        }
      }
    } catch (e) {}

    for (const name of spec.primaryVoices) {
      const match = voices.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
      if (match) {
        lockedVoice = match;
        try {
          sessionStorage.setItem('vhd_locked_' + personaKey, match.voiceURI);
        } catch (e) {}
        return { voice: lockedVoice, pitch: lockedPitch, rate: lockedRate };
      }
    }

    const isFemale = spec.gender === 'female';
    const candidate = voices.find(v => {
      const n = v.name.toLowerCase();
      if (!v.lang.startsWith('en')) return false;
      const matchesKeyword = spec.keywords.some(k => n.includes(k));
      const hasFemaleTag = n.includes('female') || n.includes('zira') || n.includes('jenny') || n.includes('aria') || n.includes('samantha');
      const hasMaleTag = n.includes('male') || n.includes('david') || n.includes('guy') || n.includes('mark') || n.includes('george');
      return matchesKeyword || (isFemale ? hasFemaleTag : hasMaleTag);
    });

    if (candidate) {
      lockedVoice = candidate;
      try {
        sessionStorage.setItem('vhd_locked_' + personaKey, candidate.voiceURI);
      } catch (e) {}
      return { voice: candidate, pitch: spec.pitch, rate: spec.rate };
    }

    const fallback = voices.find(v => v.lang.startsWith('en') && v.name.includes('Natural')) ||
                     voices.find(v => v.lang.startsWith('en')) ||
                     voices[0];

    if (fallback) {
      lockedVoice = fallback;
      try {
        sessionStorage.setItem('vhd_locked_' + personaKey, fallback.voiceURI);
      } catch (e) {}
      return { voice: fallback, pitch: spec.pitch, rate: spec.rate };
    }

    return { voice: null, pitch: spec.pitch, rate: spec.rate };
  }

  const MULTILINGUAL_MALE_VOICES = [
    'microsoft andrewmultilingual online (natural)', 'microsoft brianmultilingual online (natural)',
    'microsoft andrewmultilingual', 'microsoft brianmultilingual', 'microsoft remymultilingual'
  ];
  const MULTILINGUAL_FEMALE_VOICES = [
    'microsoft avamultilingual online (natural)', 'microsoft emmamultilingual online (natural)',
    'microsoft avamultilingual', 'microsoft emmamultilingual'
  ];
  const KNOWN_FEMALE_INDIC_TOKENS = [
    'aarohi', 'swara', 'kalpana', 'heera', 'neerja', 'ananya', 'kavya', 'priya',
    'female', 'woman', 'google हिन्दी', 'mr-in-x-mra', 'hi-in-x-hia'
  ];
  const KNOWN_MALE_MARATHI_PRIORITY = ['microsoft manohar online (natural)', 'microsoft manohar', 'manohar', 'mr-in-x-mrb'];
  const KNOWN_MALE_HINDI_PRIORITY = ['microsoft madhur online (natural)', 'microsoft madhur', 'madhur', 'microsoft hemant online (natural)', 'microsoft hemant', 'hemant', 'hi-in-x-hie'];
  const KNOWN_FEMALE_MARATHI_PRIORITY = ['microsoft aarohi online (natural)', 'microsoft aarohi', 'aarohi', 'mr-in-x-mra'];
  const KNOWN_FEMALE_HINDI_PRIORITY = ['microsoft swara online (natural)', 'microsoft swara', 'swara', 'microsoft kalpana online (natural)', 'microsoft kalpana', 'kalpana', 'google हिन्दी'];
  const lockedLangVoices = {};

  const MR_DEVANAGARI_SET = new Set(['आहे','आहेत','नाही','नाहीत','काय','कसे','कसा','कशी','करा','करावे','होय','मला','तुम्ही','आपण','आपले','आपली','नमस्कार','सांगा','सांगू','पाहिजे','झाले','झाली','झाला','करतो','करते','आहात','माझे','माझं','कुठे','कधी','कोण','कोणते','कोणता','कोणती','कसं','आमचे','तुमचे','नक्की','छान','शकता','द्या','येथे','बद्दल','माहिती','प्रवेश','किती','दाखवा','भरायचा','भरायचे','भरायची','करायचा','करायचे','करायची','कृपया','धन्यवाद']);
  const HI_DEVANAGARI_SET = new Set(['है','हैं','हो','हूँ','हूं','था','थी','थे','क्या','कैसे','कैसा','कैसी','कहाँ','कहा','कब','कौन','कितना','कितनी','कितने','बताओ','बताइए','चाहिए','आपकी','आपका','आपके','मेरा','मेरी','मेरे','मुझे','हमे','हमें','नहीं','शुक्रिया','नमस्ते','करना','करते','करता','करती','सकते','सकता','सकती','होगा','होगी','होंगे','की','के','का','को','में','से','पर','बारे','लिए','भरना']);
  const MR_ROMAN_SET = new Set(['kasa','kase','kashi','ahes','aahes','ahe','aahe','ahet','aahet','nahit','kaay','kay','tumhi','tumi','mala','amhi','aamhi','sanga','sangu','sang','pahije','zhala','jhala','zhali','zhal','kuthe','kuth','aapan','aple','apli','apla','aapla','aapli','shakto','shakte','shakta','vichara','baddal','sathi','madhye','madhe','udya','kiti','tumche','tumcha','tumchi','aamche','amche','tula','majha','maza','mazi','bharaycha','bharayche','bharaychi','karaycha','karayche','karaychi','karave','karto','karte','konte','konta','konti','mahiti','dakhva','milte','miltat','asel','hava','havi','namaskar','dhanyavad','aabhar','krupaya','kadhi','kon','hoy','cha','chi','che','chya']);
  const HI_ROMAN_SET = new Set(['kya','kaise','kaisa','kaisi','hai','hain','hoon','hun','nahin','namaste','shukriya','kripya','mujhe','aap','aapka','aapki','aapke','mera','meri','mere','humara','hamara','hume','humein','batao','bataiye','bataye','bata','chahiye','chaiye','hoga','hogi','honge','hota','hoti','theek','accha','achha','kahan','kidhar','kitna','kitni','kitne','konsa','konsi','kaunsa','kyu','kyun','kab','kaun','milega','milegi','karna','karne','karo','kijiye','bharna','bhare','dijiye','sakta','sakti','sakte','baare','wala','wali','wale','mein','ki','ke','ko']);

  function detectTextLanguage(text, previousLang) {
    if (!text || typeof text !== 'string') return 'en-US';
    const clean = text.trim();
    if (!clean) return 'en-US';
    const lower = clean.toLowerCase();

    if (/\\b(?:speak|talk|reply|switch)\\s+(?:to\\s+|in\\s+)?marathi\\b/i.test(lower) || /मराठी(?:त|मध्ये)/.test(clean)) return 'mr-IN';
    if (/\\b(?:speak|talk|reply|switch)\\s+(?:to\\s+|in\\s+)?hindi\\b/i.test(lower) || /(?:हिंदी|हिन्दी)\\s*में/.test(clean)) return 'hi-IN';
    if (/\\b(?:speak|talk|reply|switch)\\s+(?:to\\s+|in\\s+)?english\\b/i.test(lower)) return 'en-US';

    const devanagariCount = (clean.match(/[\\u0900-\\u097F]/g) || []).length;
    if (devanagariCount > 0) {
      let mrScore = clean.includes('ळ') ? 4 : 0;
      let hiScore = 0;
      const tokens = clean.split(/[\\s,?.!।;:'"()\\-/]+/).filter(Boolean);
      for (const tok of tokens) {
        if (MR_DEVANAGARI_SET.has(tok)) mrScore += 3;
        if (HI_DEVANAGARI_SET.has(tok)) hiScore += 3;
        if (/(ंच्या|च्या|तील|वरून|साठी|बद्दल|कडून|नुसार|मध्ये|तून|पर्यंत|पासून)$/.test(tok)) mrScore += 3;
        if (/(यचा|यचे|यची|तोय|तेय|ताहेत|तात|णार|लेलं|लेला|लेली|लेले)$/.test(tok)) mrScore += 3;
      }
      if (mrScore > hiScore) return 'mr-IN';
      if (hiScore > mrScore) return 'hi-IN';
      if (previousLang === 'mr-IN' || previousLang === 'hi-IN') return previousLang;
      if (/(आहे|च्या|सांगा|काय|कसा|कसे|कशी|माहिती)/.test(clean)) return 'mr-IN';
      return 'hi-IN';
    }

    let mrScore = 0;
    let hiScore = 0;
    const romanTokens = lower.replace(/[^a-z'\\s]/g, ' ').split(/\\s+/).filter(Boolean);
    for (const tok of romanTokens) {
      if (MR_ROMAN_SET.has(tok)) mrScore += 3;
      if (HI_ROMAN_SET.has(tok)) hiScore += 3;
    }
    if (/\\b(ahe\\s+ka|aahe\\s+ka|kasa\\s+bharaycha|chi\\s+fee|chi\\s+fees|cha\\s+timing|baddal\\s+sanga)\\b/.test(lower)) mrScore += 3;
    if (/\\b(ke\\s+bare|ke\\s+baare|bare\\s+me|baare\\s+me|ki\\s+fee|ki\\s+fees|me\\s+bata|kab\\s+hai|kya\\s+hai|kitni\\s+hai)\\b/.test(lower)) hiScore += 3;

    if (mrScore > hiScore && mrScore >= 2) return 'mr-IN';
    if (hiScore > mrScore && hiScore >= 2) return 'hi-IN';

    const hasEnglishGrammar = /\\b(what|where|when|who|how|why|which|is|are|was|were|do|does|can|tell|show|give|please|thank|thanks|hello|hi|hey)\\b/i.test(lower);
    if ((previousLang === 'mr-IN' || previousLang === 'hi-IN') && romanTokens.length > 0 && romanTokens.length <= 4 && !hasEnglishGrammar) {
      return previousLang;
    }
    return 'en-US';
  }

  function findVoiceByList(voices, list) {
    for (const item of list) {
      const m = voices.find(v => (v.name || '').toLowerCase().includes(item));
      if (m) return m;
    }
    return null;
  }

  function isFemaleIndic(voice) {
    const n = (voice?.name || '').toLowerCase();
    const u = (voice?.voiceURI || '').toLowerCase();
    return KNOWN_FEMALE_INDIC_TOKENS.some(t => n.includes(t) || u.includes(t));
  }

  function resolveVoiceForText(preferredName, text) {
    const detectedLang = detectTextLanguage(text);
    const personaKey = String(preferredName || agentConfig.voice || 'Adam').toLowerCase().trim();
    const spec = VOICE_SPECS[personaKey] || VOICE_SPECS.adam || VOICE_SPECS.rachel || VOICE_SPECS.clara;
    const isFemale = spec?.gender === 'female';
    const basePitch = spec?.pitch ?? (isFemale ? 1.04 : 0.90);
    const baseRate = spec?.rate ?? 0.97;

    if (!window.speechSynthesis) return { voice: null, pitch: basePitch, rate: baseRate, lang: detectedLang };
    const voices = (cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices()) || [];
    if (!voices.length) return { voice: null, pitch: basePitch, rate: baseRate, lang: detectedLang };

    // TIER 1: True Single-Voice Multilingual Neural Voice (same voice across EN/HI/MR)
    const multiVoice = findVoiceByList(voices, isFemale ? MULTILINGUAL_FEMALE_VOICES : MULTILINGUAL_MALE_VOICES);
    if (multiVoice) {
      return { voice: multiVoice, pitch: basePitch, rate: baseRate, lang: detectedLang };
    }

    if (detectedLang === 'en-US') {
      const resolved = resolveAndLockVoice(preferredName);
      return { ...resolved, lang: resolved?.voice?.lang || 'en-US' };
    }

    const cacheKey = personaKey + '__' + detectedLang;
    if (lockedLangVoices[cacheKey]) return lockedLangVoices[cacheKey];
    const cacheSet = (r) => { if (r?.voice) lockedLangVoices[cacheKey] = r; return r; };

    // TIER 2 & 3: Strict gender matching + baritone calibration fallback
    if (detectedLang === 'mr-IN' || detectedLang === 'hi-IN') {
      const primaryPri = detectedLang === 'mr-IN'
        ? (isFemale ? KNOWN_FEMALE_MARATHI_PRIORITY : KNOWN_MALE_MARATHI_PRIORITY)
        : (isFemale ? KNOWN_FEMALE_HINDI_PRIORITY : KNOWN_MALE_HINDI_PRIORITY);
      const secondaryPri = detectedLang === 'mr-IN'
        ? (isFemale ? KNOWN_FEMALE_HINDI_PRIORITY : KNOWN_MALE_HINDI_PRIORITY)
        : (isFemale ? KNOWN_FEMALE_MARATHI_PRIORITY : KNOWN_MALE_MARATHI_PRIORITY);

      const primaryMatch = findVoiceByList(voices, primaryPri) ||
        voices.find(v => (v.lang || '').toLowerCase().startsWith(detectedLang.slice(0, 2)) && (isFemale ? isFemaleIndic(v) : !isFemaleIndic(v)));
      if (primaryMatch) {
        return cacheSet({ voice: primaryMatch, pitch: basePitch, rate: baseRate, lang: detectedLang });
      }

      const secondaryMatch = findVoiceByList(voices, secondaryPri) ||
        voices.find(v => ((v.lang || '').toLowerCase().startsWith('hi') || (v.lang || '').toLowerCase().startsWith('mr')) && (isFemale ? isFemaleIndic(v) : !isFemaleIndic(v)));
      if (secondaryMatch) {
        const sLang = (secondaryMatch.lang || '').toLowerCase().startsWith('mr') ? 'mr-IN' : 'hi-IN';
        return cacheSet({ voice: secondaryMatch, pitch: basePitch, rate: baseRate, lang: sLang });
      }

      const anyIndic = voices.find(v => (v.lang || '').toLowerCase().startsWith('mr')) ||
        voices.find(v => (v.lang || '').toLowerCase().startsWith('hi') || (v.name || '').toLowerCase().includes('हिन्दी'));
      if (anyIndic) {
        const calibratedPitch = isFemale ? basePitch : Math.max(0.72, Math.min(0.80, basePitch - 0.12));
        const aLang = (anyIndic.lang || '').toLowerCase().startsWith('mr') ? 'mr-IN' : 'hi-IN';
        return cacheSet({ voice: anyIndic, pitch: calibratedPitch, rate: baseRate, lang: aLang });
      }
    }

    const resolved = resolveAndLockVoice(preferredName);
    return { ...resolved, lang: resolved?.voice?.lang || 'en-US' };
  }

  async function requestCentralResponse(userText) {
    const key = 'echo_agent_session_' + encodeURIComponent(agentConfig.id);
    const conversationId = localStorage.getItem(key) || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    localStorage.setItem(key, conversationId);
    const response = await fetch(agentConfig.apiEndpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ agentId: agentConfig.id, conversationId, message: userText }),
      signal: AbortSignal.timeout(25000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.reply) throw new Error(payload.error || 'Secure agent service is unavailable');
    return payload.reply;
  }
  function initWidget() {
    if (document.getElementById('voice-helpdesk-root')) return;

    const hostEl = document.createElement('div');
    hostEl.id = 'voice-helpdesk-root';
    document.body.appendChild(hostEl);

    const shadow = hostEl.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = \`
      :host {
        --primary: \${agentConfig.themeColor || '#6366f1'};
        --accent: \${agentConfig.accentColor || '#06b6d4'};
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 14px;
        color: #f8fafc;
        z-index: 999999;
      }
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      .vhd-launcher {
        position: fixed;
        \${agentConfig.position === 'bottom-left' ? 'left: 24px;' : 'right: 24px;'}
        bottom: 24px;
        width: 60px;
        height: 60px;
        border-radius: 30px;
        background: linear-gradient(135deg, var(--primary), var(--accent));
        box-shadow: 0 10px 25px -5px rgba(99, 102, 241, 0.45), 0 0 15px rgba(6, 182, 212, 0.35);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease;
        border: 2px solid rgba(255, 255, 255, 0.2);
        z-index: 999999;
      }
      .vhd-launcher:hover {
        transform: scale(1.08);
        box-shadow: 0 15px 30px -5px rgba(99, 102, 241, 0.6);
      }
      .vhd-launcher svg {
        width: 28px;
        height: 28px;
        fill: white;
      }
      .vhd-panel {
        position: fixed;
        \${agentConfig.position === 'bottom-left' ? 'left: 24px;' : 'right: 24px;'}
        bottom: 96px;
        width: 380px;
        max-width: calc(100vw - 48px);
        height: 540px;
        max-height: calc(100vh - 120px);
        background: #090d1a;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 20px;
        display: none;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 25px rgba(99, 102, 241, 0.2);
        z-index: 999999;
        animation: vhdFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .vhd-panel.open {
        display: flex;
      }
      @keyframes vhdFadeIn {
        from { opacity: 0; transform: translateY(12px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .vhd-header {
        padding: 16px;
        background: #0f172a;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .vhd-profile {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .vhd-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--primary), var(--accent));
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        border: 2px solid rgba(255, 255, 255, 0.15);
      }
      .vhd-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .vhd-info h3 {
        font-size: 14px;
        font-weight: 600;
        color: #fff;
      }
      .vhd-badge {
        font-size: 10px;
        color: #38bdf8;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .vhd-badge::before {
        content: '';
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #38bdf8;
      }
      .vhd-close-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        padding: 6px;
        border-radius: 8px;
        display: flex;
      }
      .vhd-close-btn:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.08);
      }
      .vhd-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: #090d1a;
      }
      .vhd-msg {
        max-width: 85%;
        padding: 10px 14px;
        border-radius: 14px;
        line-height: 1.45;
        font-size: 13px;
        word-break: break-word;
      }
      .vhd-msg.agent {
        align-self: flex-start;
        background: #1e293b;
        color: #f1f5f9;
        border-bottom-left-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.06);
      }
      .vhd-msg.user {
        align-self: flex-end;
        background: linear-gradient(135deg, var(--primary), var(--accent));
        color: #fff;
        border-bottom-right-radius: 4px;
      }
      .vhd-footer {
        padding: 14px 16px;
        background: #0f172a;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        flex-direction: column;
        gap: 10px;
        align-items: center;
      }
      .vhd-orb-btn {
        width: 62px;
        height: 62px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--primary), var(--accent));
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 20px rgba(99, 102, 241, 0.4);
        position: relative;
        transition: transform 0.2s;
      }
      .vhd-orb-btn:hover {
        transform: scale(1.05);
      }
      .vhd-orb-btn.listening {
        background: #ef4444;
        box-shadow: 0 0 25px rgba(239, 68, 68, 0.6);
        animation: vhdPulse 1.2s infinite;
      }
      .vhd-orb-btn.speaking {
        background: #10b981;
        box-shadow: 0 0 25px rgba(16, 185, 129, 0.6);
      }
      @keyframes vhdPulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.08); }
        100% { transform: scale(1); }
      }
      .vhd-orb-btn svg {
        width: 26px;
        height: 26px;
        fill: #fff;
      }
      .vhd-label {
        font-size: 11px;
        color: #94a3b8;
        letter-spacing: 0.3px;
      }
      .vhd-text-row {
        width: 100%;
        display: flex;
        gap: 8px;
      }
      .vhd-input {
        flex: 1;
        background: #1e293b;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        padding: 8px 12px;
        color: #fff;
        font-size: 13px;
        outline: none;
      }
      .vhd-input:focus {
        border-color: var(--primary);
      }
      .vhd-send-btn {
        background: var(--primary);
        border: none;
        border-radius: 10px;
        padding: 0 14px;
        color: #fff;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
      }
      .vhd-brand {
        font-size: 10px;
        color: #64748b;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .vhd-brand-dot {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: #10b981;
      }
    \`;

    shadow.appendChild(style);

    const launcher = document.createElement('div');
    launcher.className = 'vhd-launcher';
    launcher.innerHTML = \`<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.07L2 22l5.07-1.38C8.54 21.5 10.21 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm1 14.5h-2v-2h2v2zm0-4h-2V7h2v5.5z"/></svg>\`;

    const panel = document.createElement('div');
    panel.className = 'vhd-panel';
    panel.innerHTML = \`
      <div class="vhd-header">
        <div class="vhd-profile">
          <div class="vhd-avatar">
            \${agentConfig.avatar ? \`<img src="\${agentConfig.avatar}" alt="Avatar"/>\` : '<span>AI</span>'}
          </div>
          <div class="vhd-info">
            <h3>\${agentConfig.name}</h3>
            <div class="vhd-badge">Autonomous Keyless Agent</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <button class="vhd-close-btn vhd-reset-btn" title="Start New Conversation">↺</button>
          <button class="vhd-close-btn" title="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div class="vhd-messages" id="vhd-msg-list"></div>
      <div class="vhd-footer">
        <button class="vhd-orb-btn" id="vhd-orb" title="Tap to Speak">
          <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
        </button>
        <div class="vhd-label" id="vhd-voice-label">Tap Mic to Speak (Voice Locked)</div>
        <form class="vhd-text-row" id="vhd-form">
          <input type="text" class="vhd-input" id="vhd-text-input" placeholder="Type a question..." />
          <button type="submit" class="vhd-send-btn">Send</button>
        </form>
        <div class="vhd-brand">
          <span class="vhd-brand-dot"></span>
          <span>Secure Central Agent</span>
        </div>
      </div>
    \`;

    shadow.appendChild(launcher);
    shadow.appendChild(panel);

    const resetBtn = panel.querySelector('.vhd-reset-btn');
    const closeBtn = panel.querySelector('.vhd-close-btn:not(.vhd-reset-btn)');
    const msgList = panel.querySelector('#vhd-msg-list');
    const orb = panel.querySelector('#vhd-orb');
    const voiceLabel = panel.querySelector('#vhd-voice-label');
    const form = panel.querySelector('#vhd-form');
    const textInput = panel.querySelector('#vhd-text-input');

    // Device-scoped persistent conversation across ALL pages of the integrated website (localStorage + window.name fallback for file://)
    const deviceAgentSlug = String(agentConfig.name || 'assistant').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || 'assistant';
    const DEVICE_CONV_KEY = 'vhd_device_conv_' + deviceAgentSlug;
    const WINDOW_NAME_PREFIX = '__VHD_DEVICE_STATE__:';
    let persistedMessages = [];

    function readDeviceConv() {
      let best = null;
      try {
        const raw = localStorage.getItem(DEVICE_CONV_KEY);
        if (raw) best = JSON.parse(raw);
      } catch (_) {}
      try {
        if (typeof window.name === 'string' && window.name.startsWith(WINDOW_NAME_PREFIX)) {
          const store = JSON.parse(window.name.slice(WINDOW_NAME_PREFIX.length));
          const cand = store && store[DEVICE_CONV_KEY];
          if (cand && (!best || Number(cand.updatedAt || 0) > Number(best.updatedAt || 0))) best = cand;
        }
      } catch (_) {}
      return best;
    }

    function saveDeviceConv(isOpenOverride) {
      const snap = {
        isOpen: isOpenOverride !== undefined ? Boolean(isOpenOverride) : panel.classList.contains('open'),
        activeLang: activeConversationLang || '',
        messages: persistedMessages.slice(-60),
        updatedAt: Date.now()
      };
      try { localStorage.setItem(DEVICE_CONV_KEY, JSON.stringify(snap)); } catch (_) {}
      try {
        if (!window.name || window.name.startsWith(WINDOW_NAME_PREFIX)) {
          const store = window.name.startsWith(WINDOW_NAME_PREFIX) ? (JSON.parse(window.name.slice(WINDOW_NAME_PREFIX.length)) || {}) : {};
          store[DEVICE_CONV_KEY] = snap;
          window.name = WINDOW_NAME_PREFIX + JSON.stringify(store);
        }
      } catch (_) {}
    }

    launcher.addEventListener('click', () => {
      panel.classList.toggle('open');
      if (panel.classList.contains('open') && msgList.children.length === 0) {
        appendMsg(agentConfig.greeting, 'agent', { skipPersist: true });
        speakReply(agentConfig.greeting);
      }
      saveDeviceConv(panel.classList.contains('open'));
    });

    let lastInputWasVoice = false;
    let userManuallyStoppedMic = false;
    let isAutoResumedListening = false;
    let activeConversationLang = '';
    let autoResumeTimer = null;

    function cancelAutoResume() {
      if (autoResumeTimer) {
        clearTimeout(autoResumeTimer);
        autoResumeTimer = null;
      }
    }

    function isFarewellText(txt) {
      const c = String(txt || '').trim();
      return /\\b(bye+|goodbye|see\\s+you|take\\s+care|alvida|stop\\s+listening)\\b/i.test(c) || /(अलविदा|बाय|बंद\\s*करा)/.test(c);
    }

    closeBtn.addEventListener('click', () => {
      panel.classList.remove('open');
      cancelAutoResume();
      userManuallyStoppedMic = true;
      lastInputWasVoice = false;
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (recognition && isListening) {
        try { recognition.stop(); } catch (_) {}
      }
      saveDeviceConv(false);
    });

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        cancelAutoResume();
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        persistedMessages = [];
        activeConversationLang = '';
        msgList.innerHTML = '';
        appendMsg(agentConfig.greeting, 'agent', { skipPersist: true });
        try { localStorage.removeItem(DEVICE_CONV_KEY); } catch (_) {}
        saveDeviceConv(panel.classList.contains('open'));
      });
    }

    function appendMsg(text, sender, opts = {}) {
      const msg = document.createElement('div');
      msg.className = 'vhd-msg ' + sender;
      msg.textContent = text;
      msgList.appendChild(msg);
      msgList.scrollTop = msgList.scrollHeight;
      if (!opts.skipPersist) {
        persistedMessages.push({ role: sender, text: text });
        saveDeviceConv();
      }
    }

    // Hydrate saved conversation on load so navigating between pages never resets the assistant!
    const initialDeviceConv = readDeviceConv();
    if (initialDeviceConv) {
      if (initialDeviceConv.activeLang) activeConversationLang = initialDeviceConv.activeLang;
      if (Array.isArray(initialDeviceConv.messages) && initialDeviceConv.messages.length > 0) {
        appendMsg(agentConfig.greeting, 'agent', { skipPersist: true });
        initialDeviceConv.messages.forEach(m => {
          if (m && m.text) {
            persistedMessages.push({ role: m.role === 'user' ? 'user' : 'agent', text: m.text });
            appendMsg(m.text, m.role === 'user' ? 'user' : 'agent', { skipPersist: true });
          }
        });
      }
      if (initialDeviceConv.isOpen) panel.classList.add('open');
    }
    window.addEventListener('pagehide', () => saveDeviceConv());
    window.addEventListener('beforeunload', () => saveDeviceConv());

    // Process Message through Autonomous Keyless Engine
    async function handleUserMessage(userText, opts = {}) {
      const isVoiceTurn = opts?.source === 'voice';
      cancelAutoResume();
      lastInputWasVoice = isVoiceTurn;
      if (isVoiceTurn) userManuallyStoppedMic = false;

      activeConversationLang = detectTextLanguage(userText, activeConversationLang);
      if (recognition) {
        recognition.lang = activeConversationLang === 'en-US' ? 'en-IN' : activeConversationLang;
      }

      appendMsg(userText, 'user');
      orb.className = 'vhd-orb-btn';
      voiceLabel.textContent = 'Thinking...';

      const shouldAutoListen = isVoiceTurn && !isFarewellText(userText);

      try {
        const reply = await requestCentralResponse(userText);
        appendMsg(reply, 'agent');
        speakReply(reply, { shouldAutoListen });
      } catch (error) {
        const message = 'The secure agent service could not answer right now. Please try again.';
        appendMsg(message, 'agent');
        speakReply(message, { shouldAutoListen: false });
      }
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = textInput.value.trim();
      if (!val) return;
      textInput.value = '';
      handleUserMessage(val, { source: 'text' });
    });

    // Web Speech API Voice Recognition (STT)
    let recognition = null;
    let isListening = false;
    let finalRecordedTranscript = '';
    let lastCapturedSpokenText = '';
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

    async function startPackagedListening({ isAutoResume = false } = {}) {
      if (!recognition) {
        if (!isAutoResume) alert('Web Speech API is not supported in this browser. Please use Chrome, Edge, or Safari.');
        return;
      }
      if (isListening) return;
      if (isAutoResume && (!panel.classList.contains('open') || userManuallyStoppedMic)) return;

      cancelAutoResume();
      userManuallyStoppedMic = false;
      isAutoResumedListening = Boolean(isAutoResume);
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (activeConversationLang) {
        recognition.lang = activeConversationLang === 'en-US' ? 'en-IN' : activeConversationLang;
      }

      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const s = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          });
          s.getTracks().forEach(t => t.stop());
        }
      } catch (permErr) {
        lastInputWasVoice = false;
        userManuallyStoppedMic = true;
        voiceLabel.textContent = 'Mic blocked! Allow in URL bar';
        return;
      }

      try {
        recognition.start();
      } catch (e) {
        try {
          recognition.abort();
          setTimeout(() => {
            if (!userManuallyStoppedMic && !isListening) {
              try { recognition.start(); } catch (_) {}
            }
          }, 150);
        } catch (e2) {}
      }
    }

    if (SpeechRec) {
      recognition = new SpeechRec();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = agentConfig.lang || 'en-IN';

      recognition.onstart = () => {
        isListening = true;
        finalRecordedTranscript = '';
        lastCapturedSpokenText = '';
        orb.className = 'vhd-orb-btn listening';
        voiceLabel.textContent = 'Listening to your voice...';
      };

      recognition.onresult = (evt) => {
        let interimText = '';
        for (let i = evt.resultIndex; i < evt.results.length; ++i) {
          if (evt.results[i].isFinal) {
            finalRecordedTranscript += ' ' + evt.results[i][0].transcript;
          } else {
            interimText += ' ' + evt.results[i][0].transcript;
          }
        }
        const spoken = (finalRecordedTranscript + ' ' + interimText).trim();
        if (spoken) {
          lastCapturedSpokenText = spoken;
          voiceLabel.textContent = '"' + spoken + '"';
        }
      };

      recognition.onerror = (evt) => {
        console.warn('[Voice Help Desk] Speech error:', evt?.error);
        isListening = false;
        orb.className = 'vhd-orb-btn';
        if (evt?.error === 'not-allowed' || evt?.error === 'permission-denied') {
          lastInputWasVoice = false;
          userManuallyStoppedMic = true;
          voiceLabel.textContent = 'Mic blocked! Allow in URL bar';
        } else if (evt?.error === 'no-speech') {
          if (isAutoResumedListening) {
            lastInputWasVoice = false;
            isAutoResumedListening = false;
            voiceLabel.textContent = 'Tap Mic to Speak';
          } else {
            voiceLabel.textContent = 'No voice heard. Tap to retry';
          }
        } else {
          voiceLabel.textContent = 'Tap Mic to Speak';
        }
      };

      recognition.onend = () => {
        isListening = false;
        orb.className = 'vhd-orb-btn';
        const toSend = (finalRecordedTranscript || lastCapturedSpokenText).trim();
        if (toSend) {
          finalRecordedTranscript = '';
          lastCapturedSpokenText = '';
          isAutoResumedListening = false;
          handleUserMessage(toSend, { source: 'voice' });
        } else {
          if (isAutoResumedListening) {
            lastInputWasVoice = false;
            isAutoResumedListening = false;
          }
          voiceLabel.textContent = 'Tap Mic to Speak';
        }
      };
    }

    orb.addEventListener('click', async () => {
      if (!recognition) {
        alert('Web Speech API is not supported in this browser. Please use Chrome, Edge, or Safari.');
        return;
      }
      cancelAutoResume();
      if (isListening) {
        userManuallyStoppedMic = true;
        lastInputWasVoice = false;
        isAutoResumedListening = false;
        recognition.stop();
      } else {
        await startPackagedListening({ isAutoResume: false });
      }
    });

    function scheduleAutoResumeIfVoice(shouldAutoListen) {
      if (shouldAutoListen && lastInputWasVoice && !userManuallyStoppedMic && panel.classList.contains('open') && !isListening) {
        voiceLabel.textContent = 'Listening next...';
        autoResumeTimer = setTimeout(() => {
          autoResumeTimer = null;
          startPackagedListening({ isAutoResume: true });
        }, 350);
      }
    }

    // Speak Reply via Pre-Baked Audio or Browser Web Speech Synthesis
    function speakReply(text, opts = {}) {
      const shouldAutoListen = Boolean(opts?.shouldAutoListen);
      cancelAutoResume();
      // 1. Check if there is pre-baked studio audio for this exact reply or greeting
      const kb = agentConfig.knowledgeBase || [];
      const cleanTarget = (text || '').toLowerCase().trim();
      const matchedAudio = (agentConfig.prebakedAudio && agentConfig.prebakedAudio[cleanTarget]) ||
        kb.find(k => {
          const ans = (k.answer || k.a || k.response || '').toLowerCase().trim();
          return ans && (ans === cleanTarget || cleanTarget.includes(ans) || ans.includes(cleanTarget));
        })?.audioUrl;

      if (matchedAudio) {
        try {
          if (window.speechSynthesis) window.speechSynthesis.cancel();
          const sound = new Audio(matchedAudio);
          orb.className = 'vhd-orb-btn speaking';
          voiceLabel.textContent = 'Speaking (' + (agentConfig.voice || 'Adam') + ' - Studio Audio)...';
          sound.onended = () => {
            orb.className = 'vhd-orb-btn';
            voiceLabel.textContent = 'Tap Mic to Speak';
            scheduleAutoResumeIfVoice(shouldAutoListen);
          };
          sound.onerror = () => {
            speakWithSynthesis(text, { shouldAutoListen });
          };
          sound.play().catch(() => speakWithSynthesis(text, { shouldAutoListen }));
          return;
        } catch (e) {
          // fallback to speech synthesis
        }
      }

      speakWithSynthesis(text, { shouldAutoListen });
    }

    function speakWithSynthesis(text, opts = {}) {
      const shouldAutoListen = Boolean(opts?.shouldAutoListen);
      if (!window.speechSynthesis) {
        voiceLabel.textContent = 'Tap Mic to Speak';
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);

      const resolved = resolveVoiceForText(agentConfig.voice, text);
      if (resolved.voice) utterance.voice = resolved.voice;
      utterance.pitch = resolved.pitch;
      utterance.rate = resolved.rate;
      utterance.lang = resolved.lang || 'en-US';

      orb.className = 'vhd-orb-btn speaking';
      voiceLabel.textContent = resolved.lang.startsWith('hi') ? 'बोल रहे हैं...' :
                               resolved.lang.startsWith('mr') ? 'बोलत आहे...' :
                               'Speaking (' + (agentConfig.voice || 'Adam') + ')...';

      utterance.onend = () => {
        orb.className = 'vhd-orb-btn';
        voiceLabel.textContent = 'Tap Mic to Speak';
        scheduleAutoResumeIfVoice(shouldAutoListen);
      };
      utterance.onerror = () => {
        orb.className = 'vhd-orb-btn';
        voiceLabel.textContent = 'Tap Mic to Speak';
      };

      window.speechSynthesis.speak(utterance);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }
})();
`;
}

/**
 * Generate Demo HTML file showcasing the standalone agent
 */
export function generateDemoHtml(agent, scriptName) {
  const name = agent.name || 'AI Voice Agent';
  const role = agent.role || 'Customer Support Assistant';
  const voice = agent.voice || 'Clara';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} · Standalone Voice AI Demo</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: radial-gradient(circle at 50% 20%, #0d1527 0%, #060913 100%);
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      max-width: 680px;
      width: 100%;
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 24px;
      padding: 40px;
      box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 30px rgba(56, 189, 248, 0.15);
      backdrop-filter: blur(16px);
      text-align: center;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 9999px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #34d399;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 32px;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 16px;
      color: #94a3b8;
      margin-bottom: 24px;
    }
    .features {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin: 28px 0;
      text-align: left;
    }
    .feat {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 14px 16px;
    }
    .feat h4 {
      font-size: 13px;
      color: #38bdf8;
      margin-bottom: 4px;
    }
    .feat p {
      font-size: 12px;
      color: #cbd5e1;
    }
    .callout {
      margin-top: 24px;
      padding: 16px;
      border-radius: 16px;
      background: rgba(56, 189, 248, 0.08);
      border: 1px solid rgba(56, 189, 248, 0.25);
      font-size: 13px;
      color: #7dd3fc;
      line-height: 1.5;
    }
    .pointer-arrow {
      margin-top: 16px;
      font-size: 13px;
      color: #94a3b8;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">
      <span>●</span> 100% Autonomous & Keyless AI Agent
    </div>
    <h1>${name}</h1>
    <div class="subtitle">${role} · Locked Voice: <strong>${voice}</strong></div>

    <div class="features">
      <div class="feat">
        <h4>0 External API Keys</h4>
        <p>Runs directly in the browser with zero OpenAI, Groq, or Gemini keys required.</p>
      </div>
      <div class="feat">
        <h4>Native Web Speech</h4>
        <p>Instant voice recognition & deterministic locked persona speech synthesis.</p>
      </div>
      <div class="feat">
        <h4>Pre-Compiled Intelligence</h4>
        <p>Trained directly from your database, backend APIs, and frontend pages.</p>
      </div>
      <div class="feat">
        <h4>100% Free & Private</h4>
        <p>$0 server fees, zero telemetry leaks, and complete client data privacy.</p>
      </div>
    </div>

    <div class="callout">
      <strong>Your Voice Assistant is Active!</strong><br />
      Look at the <strong>bottom-right corner</strong> of your screen. Click the floating orb to start talking or type your questions!
    </div>

    <div class="pointer-arrow">
      <span>↘ Floating voice widget ready at the bottom corner</span>
    </div>
  </div>

  <!-- Standalone agent client; answers are served by the secure central API. -->
  <script src="./${scriptName}"></script>
</body>
</html>`;
}

/**
 * Generate README markdown
 */
export function generateReadme(agent, scriptName) {
  const name = agent.name || 'AI Voice Agent';
  const role = agent.role || 'Customer Support Assistant';
  const voice = agent.voice || 'Clara';
  const expiryDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString();

  return `# ${name} - Standalone Autonomous AI Voice Agent

**Role:** ${role}  
**Locked Voice:** ${voice}  
**Architecture:** Secure central agent API with browser-native voice playback
**Storage Policy:** The client contains public presentation settings only. Knowledge and credentials remain server-side.

---

## 🚀 Quick Start (Instant 1-Minute Setup)

1. Double click \`index.html\` in this folder to test your AI Voice Agent immediately in your browser.
2. Click the floating microphone button at the bottom-right corner and start speaking!

---

## 🌐 Embed On Any Website

Copy \`${scriptName}\` to your website's root or public assets folder, then paste this tag before \`</body>\`:

\`\`\`html
<!-- Add to any HTML page before </body> -->
<script src="/${scriptName}"></script>
\`\`\`

### React / Next.js
\`\`\`jsx
import Script from 'next/script';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Script src="/${scriptName}" strategy="lazyOnload" />
      </body>
    </html>
  );
}
\`\`\`

### WordPress / Shopify / Webflow
- **WordPress**: Paste \`<script src="https://yourdomain.com/${scriptName}"></script>\` in **Appearance > Theme File Editor > footer.php** (or via WPCode plugin).
- **Shopify**: Paste in **Online Store > Themes > Edit Code > theme.liquid** before \`</body>\`.
- **Webflow**: Paste in **Project Settings > Custom Code > Footer Code**.

---

## 🔒 Secure API
- The generated client contains no provider keys, database records, schemas, or private knowledge.
- All answers are routed through the configured secure agent API.
- The browser's native speech API is used for voice playback.
`;
}

/**
 * Trigger Instant Download of the Standalone Agent Bundle (.zip)
 */
export async function downloadAgentBundleZip(rawAgent) {
  const agent = rawAgent || { name: 'Echo Voice Agent', id: `agent_${Date.now()}` };
  const zip = new JSZip();
  const slug = sanitizeSlug(agent.name);
  const scriptName = `${slug}.standalone.js`;

  const scriptContent = generateStandaloneScriptContent(agent);
  const htmlContent = generateDemoHtml(agent, scriptName);
  const readmeContent = generateReadme(agent, scriptName);
  const modelJson = JSON.stringify({
    id: agent.widgetId || agent.id || agent.agentId || agent.name,
    name: agent.name || 'AI Voice Agent',
    role: agent.role || 'Customer Support Assistant',
    voice: agent.voice || 'Adam',
    greeting: agent.firstMessage || agent.greeting || 'Welcome!',
    themeColor: agent.themeColor || '#6366f1',
    accentColor: agent.accentColor || '#06b6d4',
    position: agent.position || 'bottom-right',
    voiceArchitecture: 'Secure central API with browser speech playback',
    exportedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    runtime: 'secure-central-api'
  }, null, 2);

  // Pre-baked voice studio configuration
  const audioManifest = {
    agentName: agent.name || 'AI Voice Agent',
    voice: agent.voice || 'Adam',
    voiceEngine: 'Browser speech playback',
    greeting: agent.firstMessage || agent.greeting || 'Welcome!',
    knowledgeAudioTrackCount: 0,
    tracks: []
  };

  zip.file(scriptName, scriptContent);
  zip.file('index.html', htmlContent);
  zip.file('README.md', readmeContent);
  zip.file('agent-model.json', modelJson);
  zip.file('audio/manifest.json', JSON.stringify(audioManifest, null, 2));

  const blob = await zip.generateAsync({ type: 'blob' });
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `${slug}-agent-bundle.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);

  return {
    filename: `${slug}-agent-bundle.zip`,
    downloadedAt: Date.now(),
    expiresAt: Date.now() + 15 * 24 * 60 * 60 * 1000
  };
}

/**
 * Trigger Single Standalone JS File Download
 */
export function downloadStandaloneScriptFile(rawAgent) {
  const agent = rawAgent || { name: 'Echo Voice Agent', id: `agent_${Date.now()}` };
  const slug = sanitizeSlug(agent.name);
  const filename = `${slug}.standalone.js`;
  const content = generateStandaloneScriptContent(agent);
  const blob = new Blob([content], { type: 'application/javascript;charset=utf-8' });
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);

  return {
    filename,
    downloadedAt: Date.now(),
    expiresAt: Date.now() + 15 * 24 * 60 * 60 * 1000
  };
}
