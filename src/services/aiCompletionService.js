export const STORAGE_KEYS = {
  GROQ: 'echo_user_groq_key',
  GEMINI: 'echo_user_gemini_key',
  PROVIDER: 'echo_preferred_provider',
  STORAGE_MODE: 'echo_key_storage_mode',
  LEGACY_GROQ: 'user_groq_api_key',
  LEGACY_GEMINI: 'user_gemini_api_key'
};

/**
 * Retrieve user's configured API keys from localStorage
 * NEVER returns hardcoded developer keys.
 */
export function getUserApiKeys() {
  if (typeof window === 'undefined') {
    return {
      groqKey: '',
      geminiKey: '',
      preferredProvider: 'groq',
      hasGroq: false,
      hasGemini: false,
      hasKey: false,
      activeKey: '',
      activeProvider: 'none',
      storageMode: 'local'
    };
  }

  try {
    // Auto-migrate: Purge any unverified legacy test keys from earlier alpha development
    if (localStorage.getItem('echo_byok_version') !== '2.0') {
      localStorage.removeItem(STORAGE_KEYS.LEGACY_GROQ);
      localStorage.removeItem(STORAGE_KEYS.LEGACY_GEMINI);
      localStorage.setItem('echo_byok_version', '2.0');
    }

    const rawGroq = localStorage.getItem(STORAGE_KEYS.GROQ) || localStorage.getItem(STORAGE_KEYS.LEGACY_GROQ) || '';
    const rawGemini = localStorage.getItem(STORAGE_KEYS.GEMINI) || localStorage.getItem(STORAGE_KEYS.LEGACY_GEMINI) || '';
    
    const groqKey = rawGroq.trim();
    const geminiKey = rawGemini.trim();

    const preferredProvider = localStorage.getItem(STORAGE_KEYS.PROVIDER) || (groqKey ? 'groq' : geminiKey ? 'gemini' : 'groq');
    const storageMode = localStorage.getItem(STORAGE_KEYS.STORAGE_MODE) || 'local';

    const hasGroq = Boolean(groqKey && groqKey.startsWith('gsk_'));
    const hasGemini = Boolean(geminiKey && geminiKey.length > 15);
    const hasKey = hasGroq || hasGemini;

    let activeKey = '';
    let activeProvider = 'none';

    if (preferredProvider === 'gemini' && hasGemini) {
      activeKey = geminiKey;
      activeProvider = 'gemini';
    } else if (hasGroq) {
      activeKey = groqKey;
      activeProvider = 'groq';
    } else if (hasGemini) {
      activeKey = geminiKey;
      activeProvider = 'gemini';
    }

    return {
      groqKey,
      geminiKey,
      preferredProvider,
      storageMode,
      hasGroq,
      hasGemini,
      hasKey,
      activeKey,
      activeProvider
    };
  } catch (e) {
    return {
      groqKey: '',
      geminiKey: '',
      preferredProvider: 'groq',
      hasGroq: false,
      hasGemini: false,
      hasKey: false,
      activeKey: '',
      activeProvider: 'none',
      storageMode: 'local'
    };
  }
}

/**
 * Check if the user has provided at least one validly formatted API key
 */
export function hasValidUserApiKey() {
  const { hasKey } = getUserApiKeys();
  return hasKey;
}

/**
 * Save user API keys into localStorage
 */
export function saveUserApiKeys({ groqKey, geminiKey, preferredProvider, storageMode }) {
  if (typeof window === 'undefined') return;
  try {
    if (groqKey !== undefined) {
      const cleanGroq = (groqKey || '').trim();
      if (cleanGroq) {
        localStorage.setItem(STORAGE_KEYS.GROQ, cleanGroq);
        localStorage.setItem(STORAGE_KEYS.LEGACY_GROQ, cleanGroq);
      } else {
        localStorage.removeItem(STORAGE_KEYS.GROQ);
        localStorage.removeItem(STORAGE_KEYS.LEGACY_GROQ);
      }
    }

    if (geminiKey !== undefined) {
      const cleanGemini = (geminiKey || '').trim();
      if (cleanGemini) {
        localStorage.setItem(STORAGE_KEYS.GEMINI, cleanGemini);
        localStorage.setItem(STORAGE_KEYS.LEGACY_GEMINI, cleanGemini);
      } else {
        localStorage.removeItem(STORAGE_KEYS.GEMINI);
        localStorage.removeItem(STORAGE_KEYS.LEGACY_GEMINI);
      }
    }

    if (preferredProvider) {
      localStorage.setItem(STORAGE_KEYS.PROVIDER, preferredProvider);
    }

    if (storageMode) {
      localStorage.setItem(STORAGE_KEYS.STORAGE_MODE, storageMode);
    }
  } catch (e) {
    console.warn('Failed to save API keys to localStorage:', e);
  }
}

/**
 * Clear all user keys from localStorage
 */
export function clearUserApiKeys() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEYS.GROQ);
    localStorage.removeItem(STORAGE_KEYS.LEGACY_GROQ);
    localStorage.removeItem(STORAGE_KEYS.GEMINI);
    localStorage.removeItem(STORAGE_KEYS.LEGACY_GEMINI);
    localStorage.removeItem(STORAGE_KEYS.PROVIDER);
  } catch (e) {}
}

/**
 * Live test validation of user's personal API key against upstream API
 * @param {'groq' | 'gemini'} provider
 * @param {string} apiKey
 * @returns {Promise<{ valid: boolean, error?: string, models?: string[] }>}
 */
export async function validateUserApiKey(provider, apiKey) {
  const cleanKey = (apiKey || '').trim();

  if (!cleanKey) {
    return { valid: false, error: 'API key cannot be empty.' };
  }

  if (provider === 'groq') {
    if (!cleanKey.startsWith('gsk_')) {
      return {
        valid: false,
        error: 'Invalid Groq API key format. Groq Cloud keys always begin with "gsk_"'
      };
    }

    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cleanKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(8000)
      });

      if (res.ok) {
        const data = await res.json();
        const models = (data.data || []).map(m => m.id).slice(0, 10);
        return { valid: true, models };
      }

      const errData = await res.json().catch(() => ({}));
      const msg = errData?.error?.message || `Groq validation failed (HTTP ${res.status})`;
      return { valid: false, error: msg };
    } catch (err) {
      return {
        valid: false,
        error: err.name === 'TimeoutError'
          ? 'Validation timed out. Please check your internet connection.'
          : (err.message || 'Network error verifying Groq key.')
      };
    }
  }

  if (provider === 'gemini') {
    if (!cleanKey.startsWith('AIza') && cleanKey.length < 20) {
      return {
        valid: false,
        error: 'Invalid Gemini API key format. Google AI Studio keys typically begin with "AIza"'
      };
    }

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(8000)
      });

      if (res.ok) {
        const data = await res.json();
        const models = (data.models || []).map(m => m.name).slice(0, 10);
        return { valid: true, models };
      }

      const errData = await res.json().catch(() => ({}));
      const msg = errData?.error?.message || `Gemini validation failed (HTTP ${res.status})`;
      return { valid: false, error: msg };
    } catch (err) {
      return {
        valid: false,
        error: err.name === 'TimeoutError'
          ? 'Validation timed out. Please check your internet connection.'
          : (err.message || 'Network error verifying Gemini key.')
      };
    }
  }

  return { valid: false, error: `Unknown provider: ${provider}` };
}

// Backward compatibility accessor (strictly returns user key, never developer key)
export const AI_KEYS = {
  get GROQ_API_KEY() {
    return getUserApiKeys().groqKey || '';
  },
  set GROQ_API_KEY(val) {
    saveUserApiKeys({ groqKey: val });
  },
  get GEMINI_API_KEY() {
    return getUserApiKeys().geminiKey || '';
  },
  set GEMINI_API_KEY(val) {
    saveUserApiKeys({ geminiKey: val });
  }
};

/**
 * Transcribes audio blob using Groq Whisper API (whisper-large-v3-turbo)
 * Supports acoustic automatic language identification (LID) for Marathi, Hindi, English, etc.
 * @param {Blob} audioBlob - Audio recording blob (webm or mp4 or wav)
 * @param {string} customApiKey - Optional custom Groq API key
 * @param {Object} options - { language: 'auto'|'hi'|'mr'|'en', verbose: boolean }
 * @returns {Promise<string|Object>} Transcribed text or { text, language }
 */
export async function transcribeAudioWithGroqWhisper(audioBlob, customApiKey = '', options = {}) {
  if (!audioBlob || !(audioBlob instanceof Blob)) return options?.verbose ? { text: '', language: '' } : '';
  const userKeys = getUserApiKeys();
  const groqKey = (customApiKey && customApiKey.startsWith('gsk_')) ? customApiKey : userKeys.groqKey;
  if (!groqKey || !groqKey.startsWith('gsk_')) {
    return options?.verbose ? { text: '', language: '' } : '';
  }

  try {
    const formData = new FormData();
    const ext = audioBlob.type.includes('mp4') ? 'mp4' : audioBlob.type.includes('wav') ? 'wav' : 'webm';
    formData.append('file', audioBlob, `audio_input.${ext}`);
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('temperature', '0.0');
    formData.append('response_format', 'verbose_json');

    // Only set explicit language if specified and not 'auto'
    if (options?.language && options.language !== 'auto') {
      const langCode = options.language.startsWith('hi') ? 'hi' :
                       options.language.startsWith('mr') ? 'mr' :
                       options.language.startsWith('en') ? 'en' : options.language;
      formData.append('language', langCode);
    }
    // If language is omitted or 'auto', Whisper auto-detects language acoustically!

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`
      },
      body: formData
    });

    if (res.ok) {
      const data = await res.json();
      const rawText = (data.text || '').trim();
      const detectedLang = (data.language || '').toLowerCase().trim();

      // Whisper Hallucination & 3-Language (English, Hindi, Marathi) Guard
      const isAllowedLanguage = !detectedLang || ['en', 'english', 'hi', 'hindi', 'mr', 'marathi'].includes(detectedLang);
      const isHallucination = /^(thank you|thanks for watching|thank you for watching|bye|subtitles by|you|amara\.org)[\.!]?$/i.test(rawText);
      const cleanText = (isHallucination || !isAllowedLanguage) ? '' : rawText;

      if (options?.verbose) {
        return {
          text: cleanText,
          language: detectedLang,
          duration: data.duration || 0
        };
      }
      return cleanText;
    }
  } catch (err) {
    console.warn('[Whisper API] Audio transcription error:', err);
  }
  return options?.verbose ? { text: '', language: '' } : '';
}
