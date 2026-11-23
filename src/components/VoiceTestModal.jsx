import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Bot,
  User,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Send,
  CheckCircle2,
  AudioWaveform,
  Activity,
  Languages,
  Loader2
} from 'lucide-react';
import {
  resolveLockedVoice,
  resolveVoiceForText,
  speakTextWithWatchdog,
  stopCurrentSpeech,
  detectTextLanguage,
  isFarewellMessage
} from '../utils/voiceConsistency';
import { getUserApiKeys, transcribeAudioWithGroqWhisper } from '../services/aiCompletionService';
import { queryAgent } from '../services/agentQueryClient';
import RichMessageContent from './RichMessageContent';
import { stripLinksForSpeech } from '../utils/richMessageParser';

export default function VoiceTestModal({ isOpen, onClose, assistant }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isStartingMic, setIsStartingMic] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingStage, setThinkingStage] = useState(0); // 0: Thinking, 1: Checking details (2.2s), 2: Taking a moment (5.5s)
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0); // 0 to 100
  const [micPermission, setMicPermission] = useState('prompt'); // 'prompt' | 'granted' | 'denied'
  const [errorMessage, setErrorMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [textInput, setTextInput] = useState('');
  const [selectedLang, setSelectedLang] = useState('auto'); // 'auto' | 'en-IN' | 'hi-IN' | 'mr-IN'
  const [detectedLangBadge, setDetectedLangBadge] = useState('');

  // Audio / Speech Refs
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const recognitionRef = useRef(null);
  const recordedTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const lastDetectedLangRef = useRef('en-IN');
  const speechHandledRef = useRef(false);
  const messagesRef = useRef([]);
  const conversationIdRef = useRef(`voice-preview-${assistant?.id || assistant?.name || 'agent'}-${Date.now()}`);
  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const chatBottomRef = useRef(null);
  const lastInputWasVoiceRef = useRef(false);
  const manualStopRef = useRef(false);
  const isAutoResumedRef = useRef(false);
  const autoResumeTimerRef = useRef(null);
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const assistantName = assistant?.name || 'Voice Assistant';
  const assistantVoice = assistant?.voice || 'Adam';
  const assistantRole = assistant?.role || 'Customer Assistant';

  // Initialize and clean up on modal open / close
  useEffect(() => {
    if (!isOpen) {
      stopRecordingSession();
      if (synthRef.current) synthRef.current.cancel();
      return;
    }

    // Set initial greeting
    const greeting = assistant?.greeting || `Hello! I'm ${assistantName}, your ${assistantRole}. How can I assist you today?`;
    setMessages([
      {
        id: 'greet-1',
        sender: 'assistant',
        text: greeting,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    speakText(greeting);

    return () => {
      stopRecordingSession();
      if (synthRef.current) synthRef.current.cancel();
    };
  }, [isOpen, assistant?.id]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimTranscript, isThinking, thinkingStage]);

  useEffect(() => {
    if (!isThinking) {
      setThinkingStage(0);
      return;
    }
    setThinkingStage(0);
    const t1 = setTimeout(() => setThinkingStage(1), 2200);
    const t2 = setTimeout(() => setThinkingStage(2), 5500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isThinking]);

  // Cleanly stops all active recording, audio analysis, and speech recognition
  const stopRecordingSession = () => {
    if (autoResumeTimerRef.current) {
      clearTimeout(autoResumeTimerRef.current);
      autoResumeTimerRef.current = null;
    }
    manualStopRef.current = true;
    lastInputWasVoiceRef.current = false;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) {}
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { audioContextRef.current.close(); } catch (e) {}
      audioContextRef.current = null;
    }
    stopCurrentSpeech();
    setIsStartingMic(false);
    setIsTranscribing(false);
    setIsRecording(false);
    setAudioLevel(0);
  };

  // Speak text using the assistant's locked persona voice with GC pinning, heartbeat & watchdog
  const speakText = (text, { shouldAutoListen = false } = {}) => {
    if (!text) return;
    if (autoResumeTimerRef.current) {
      clearTimeout(autoResumeTimerRef.current);
      autoResumeTimerRef.current = null;
    }
    speakTextWithWatchdog(text, assistantVoice, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => {
        setIsSpeaking(false);
        if (shouldAutoListen && lastInputWasVoiceRef.current && !manualStopRef.current && isOpenRef.current) {
          autoResumeTimerRef.current = setTimeout(() => {
            if (isOpenRef.current && !manualStopRef.current && lastInputWasVoiceRef.current) {
              startRecordingSession({ isAutoResume: true });
            }
          }, 350);
        }
      },
      onError: () => setIsSpeaking(false)
    });
  };

  // Start recording audio + Speech Recognition
  const startRecordingSession = async ({ isAutoResume = false } = {}) => {
    if (autoResumeTimerRef.current) {
      clearTimeout(autoResumeTimerRef.current);
      autoResumeTimerRef.current = null;
    }
    stopCurrentSpeech();
    setIsSpeaking(false);
    setIsTranscribing(false);
    setIsStartingMic(true);
    setErrorMessage('');
    setInterimTranscript('');
    speechHandledRef.current = false;
    manualStopRef.current = false;
    isAutoResumedRef.current = Boolean(isAutoResume);
    recordedTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    audioChunksRef.current = [];

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      mediaStreamRef.current = stream;
      setMicPermission('granted');
    } catch (permErr) {
      console.warn('Microphone permission error:', permErr);
      setMicPermission('denied');
      setIsStartingMic(false);
      setErrorMessage('Microphone access was denied. Please allow microphone access in your browser URL bar.');
      return;
    }

    // 1. Setup AudioContext & Analyser to measure real-time mic volume
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          const sum = dataArray.reduce((acc, val) => acc + val, 0);
          const avg = sum / dataArray.length;
          // Scale avg (0-255) to 0-100
          const level = Math.min(100, Math.round((avg / 128) * 100));
          setAudioLevel(level);
          animFrameRef.current = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      }
    } catch (audioErr) {
      console.warn('AudioContext visualization setup note:', audioErr);
    }

    // 2. Setup MediaRecorder for high-reliability audio blob backup (Whisper transcription)
    try {
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else mimeType = '';
      }
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        if (speechHandledRef.current) return;
        const finalChunkBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const activeKey = assistant?.apiKey || getUserApiKeys().groqKey || getUserApiKeys().activeKey || '';

        // 1. Acoustic Auto-Detection with Groq Whisper (Language Identification LID)
        if (finalChunkBlob.size > 1500 && activeKey && activeKey.startsWith('gsk_')) {
          setIsTranscribing(true);
          setInterimTranscript('🌐 Auto-detecting voice language with Whisper...');
          try {
            const whisperPromise = transcribeAudioWithGroqWhisper(finalChunkBlob, activeKey, {
              language: selectedLang === 'auto' ? undefined : selectedLang,
              verbose: true
            });
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Whisper timeout')), 5000));
            const whisperRes = await Promise.race([whisperPromise, timeoutPromise]);
            const cleanWhisper = (whisperRes?.text || '').trim();
            const detectedLID = (whisperRes?.language || '').toLowerCase().trim();
            const isSupportedLID = !detectedLID || ['en', 'english', 'hi', 'hindi', 'mr', 'marathi'].includes(detectedLID);

            if (cleanWhisper && !speechHandledRef.current) {
              if (!isSupportedLID) {
                setErrorMessage('Voice input is restricted strictly to English, Hindi (हिंदी), and Marathi (मराठी).');
                setInterimTranscript('');
                return;
              }
              if (detectedLID) {
                const badge = detectedLID.includes('marathi') ? '🚩 मराठी' :
                              detectedLID.includes('hindi') ? '🇮🇳 हिंदी' :
                              detectedLID.includes('english') ? '🇬🇧 English' :
                              '🇮🇳 Indian English';
                setDetectedLangBadge(badge);
              }
              handleUserSpeech(cleanWhisper, { source: 'voice', whisperLang: detectedLID });
              return;
            }
          } catch (wErr) {
            console.warn('[Whisper LID Error / Timeout]', wErr);
          }
        }

        // 2. Fallback to Browser Speech Recognition
        const capturedSpeech = (recordedTranscriptRef.current || interimTranscriptRef.current || '').trim();
        if (capturedSpeech && !speechHandledRef.current) {
          handleUserSpeech(capturedSpeech, { source: 'voice' });
          return;
        }

        if (!speechHandledRef.current) {
          setIsTranscribing(false);
          setInterimTranscript('');
          if (!isAutoResumedRef.current && !manualStopRef.current) {
            setErrorMessage('No voice detected. Tap the mic and speak clearly.');
          }
          lastInputWasVoiceRef.current = false;
        }
      };

      recorder.start(250);
    } catch (recErr) {
      console.warn('MediaRecorder setup note:', recErr);
    }

    // 3. Setup Browser Speech Recognition (Instant local STT with auto-turn end for hands-free voice)
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        if (recognitionRef.current) {
          try { recognitionRef.current.abort(); } catch (_) {}
          recognitionRef.current = null;
        }
        const rec = new SpeechRec();
        rec.continuous = false;
        rec.interimResults = true;
        const defaultBrowserLang = 'en-IN';
        rec.lang = (selectedLang && selectedLang !== 'auto')
          ? selectedLang
          : (lastDetectedLangRef.current || defaultBrowserLang);

        rec.onstart = () => {
          setIsStartingMic(false);
          setIsRecording(true);
        };

        rec.onresult = (event) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const piece = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              recordedTranscriptRef.current += ' ' + piece;
            } else {
              interim += piece;
            }
          }
          const combined = (recordedTranscriptRef.current + ' ' + interim).trim();
          interimTranscriptRef.current = combined;
          setInterimTranscript(combined);
        };

        rec.onerror = (event) => {
          console.warn('[SpeechRec] Error:', event.error);
          if (event.error === 'not-allowed' || event.error === 'permission-denied') {
            lastInputWasVoiceRef.current = false;
            manualStopRef.current = true;
            setErrorMessage('Microphone permission blocked. Please allow mic in your URL bar.');
          } else if (event.error === 'no-speech' && isAutoResumedRef.current) {
            // Silent timeout during auto-resume: cleanly exit hands-free loop
            lastInputWasVoiceRef.current = false;
            manualStopRef.current = true;
          }
        };

        rec.onend = () => {
          if (recognitionRef.current === rec) {
            recognitionRef.current = null;
            stopAndSubmitRecording({ isManualStop: false });
          }
        };

        recognitionRef.current = rec;
        rec.start();
      } catch (e) {
        console.warn('SpeechRecognition start failed, will rely on MediaRecorder:', e);
      }
    }

    setIsStartingMic(false);
    setIsRecording(true);
  };

  // Stop recording and process user speech
  const stopAndSubmitRecording = ({ isManualStop = false } = {}) => {
    setIsRecording(false);
    const capturedText = (recordedTranscriptRef.current || interimTranscriptRef.current || interimTranscript || '').trim();

    if (isManualStop && !capturedText) {
      manualStopRef.current = true;
      lastInputWasVoiceRef.current = false;
    }

    // Stop tracks & audio
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (recognitionRef.current) {
      const activeRec = recognitionRef.current;
      recognitionRef.current = null;
      try { activeRec.stop(); } catch (e) {}
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) {}
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (manualStopRef.current && !capturedText) {
      setInterimTranscript('');
      return;
    }

    const activeKey = assistant?.apiKey || getUserApiKeys().groqKey || getUserApiKeys().activeKey || '';

    // If Groq key is present and audio chunks were recorded, let recorder.onstop process with Whisper LID
    if (activeKey && activeKey.startsWith('gsk_') && audioChunksRef.current.length > 0 && capturedText) {
      setIsTranscribing(true);
      setInterimTranscript('🌐 Auto-detecting voice language & transcribing...');
      return;
    }

    if (capturedText && !speechHandledRef.current) {
      handleUserSpeech(capturedText, { source: 'voice' });
    } else if (!isAutoResumedRef.current && !manualStopRef.current) {
      setTimeout(() => {
        if (!recordedTranscriptRef.current.trim() && !speechHandledRef.current) {
          setErrorMessage('No voice detected. Tap the mic and speak clearly.');
        }
      }, 1000);
    }
  };

  // Toggle listening state (Supports instant barge-in if assistant is speaking)
  const handleToggleListen = () => {
    if (isSpeaking) {
      // Instant barge-in: cancel speech and immediately start recording user's new question
      stopCurrentSpeech();
      setIsSpeaking(false);
      startRecordingSession({ isAutoResume: false });
      return;
    }
    if (isRecording) {
      stopAndSubmitRecording({ isManualStop: true });
    } else {
      startRecordingSession({ isAutoResume: false });
    }
  };

  // Process user speech through AI completion & speak aloud
  const handleUserSpeech = async (spokenText, { source = 'text', whisperLang = '' } = {}) => {
    if (!spokenText || !spokenText.trim() || speechHandledRef.current) return;
    speechHandledRef.current = true;
    const isVoiceTurn = source === 'voice';
    lastInputWasVoiceRef.current = isVoiceTurn;
    if (!isVoiceTurn) {
      if (autoResumeTimerRef.current) {
        clearTimeout(autoResumeTimerRef.current);
        autoResumeTimerRef.current = null;
      }
    }

    const cleanText = spokenText.trim();
    setIsStartingMic(false);
    setIsTranscribing(false);
    setInterimTranscript('');
    recordedTranscriptRef.current = '';
    interimTranscriptRef.current = '';

    // Turn-level dynamic language detection with code-mixing & sticky context
    const prevLang = lastDetectedLangRef.current;
    const detectedCode = detectTextLanguage(cleanText, {
      whisperLang,
      previousLang: prevLang
    });
    if (selectedLang === 'auto') {
      if (detectedCode === 'mr-IN') {
        setDetectedLangBadge('🚩 मराठी');
        lastDetectedLangRef.current = 'mr-IN';
      } else if (detectedCode === 'hi-IN') {
        setDetectedLangBadge('🇮🇳 हिंदी');
        lastDetectedLangRef.current = 'hi-IN';
      } else {
        setDetectedLangBadge('🇬🇧 English');
        lastDetectedLangRef.current = 'en-IN';
      }
    }

    const userMsg = {
      id: 'usr-' + Date.now(),
      sender: 'user',
      text: cleanText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsThinking(true);

    const shouldAutoListen = isVoiceTurn && !isFarewellMessage(cleanText);

    try {
      const result = await queryAgent(assistant?.id || assistant?.agentId || assistant?.name, cleanText, conversationIdRef.current);
      const replyText = result.reply;

      const botMsg = {
        id: 'bot-' + Date.now(),
        sender: 'assistant',
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, botMsg]);
      speakText(stripLinksForSpeech(replyText) || replyText, { shouldAutoListen });
    } catch (err) {
      console.error('Error getting response:', err);
      const fallback = `I encountered an issue: ${err.message || 'Please check your API key'}.`;
      setMessages((prev) => [
        ...prev,
        {
          id: 'bot-err-' + Date.now(),
          sender: 'assistant',
          text: fallback,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      speakText(fallback, { shouldAutoListen: false });
    } finally {
      setIsThinking(false);
      speechHandledRef.current = false;
    }
  };

  const handleSendText = () => {
    const trimmed = textInput.trim();
    if (!trimmed) return;
    setTextInput('');
    speechHandledRef.current = false;
    handleUserSpeech(trimmed, { source: 'text' });
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-900"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <AudioWaveform size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">{assistantName}</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Voice: {assistantVoice}
                </span>
                {assistant?.databaseConfig && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    🔥 Live DB: {assistant.databaseConfig.type === 'firebase' ? 'Firebase' : 'Supabase'} ({assistant.databaseConfig.projectId || 'Connected'})
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Live Microphone Tester &amp; Voice Interaction Sandbox
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Central Voice Orb & Soundwave Area */}
        <div className="p-6 bg-gradient-to-b from-indigo-50/40 via-white to-white flex flex-col items-center justify-center border-b border-slate-100">
          <div className="relative flex items-center justify-center my-2">
            {/* Animated Pulsing Waves */}
            {(isRecording || isSpeaking || isStartingMic || isTranscribing) && (
              <div className={`absolute w-28 h-28 rounded-full animate-ping duration-1000 ${
                isStartingMic || isTranscribing ? 'bg-cyan-400/25' : 'bg-indigo-400/20'
              }`} />
            )}
            {(isStartingMic || isTranscribing) && (
              <div className="absolute w-24 h-24 rounded-full border-2 border-dashed border-cyan-500/70 animate-spin" />
            )}
            {isSpeaking && (
              <div className="absolute w-36 h-36 rounded-full bg-emerald-400/20 animate-pulse duration-700" />
            )}

            {/* Main Interactive Mic Orb */}
            <button
              type="button"
              onClick={handleToggleListen}
              className={`relative z-10 w-20 h-20 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-xl cursor-pointer ${
                isStartingMic || isTranscribing
                  ? 'bg-gradient-to-tr from-indigo-500 to-cyan-500 text-white shadow-cyan-500/30 scale-105 ring-4 ring-cyan-300/50 animate-pulse'
                  : isRecording
                  ? 'bg-rose-500 text-white shadow-rose-500/30 scale-105 ring-4 ring-rose-300/50'
                  : isSpeaking
                  ? 'bg-emerald-600 text-white shadow-emerald-500/30 scale-105 ring-4 ring-emerald-300/50'
                  : isThinking
                  ? 'bg-amber-500 text-white shadow-amber-500/30 animate-pulse'
                  : 'bg-gradient-to-tr from-indigo-600 to-violet-600 text-white hover:scale-105 hover:shadow-indigo-500/40'
              }`}
              title={isRecording ? 'Click to stop and send voice' : 'Click to start speaking'}
            >
              {isStartingMic || isTranscribing ? (
                <Loader2 size={28} className="animate-spin" />
              ) : isRecording ? (
                <Mic size={28} className="animate-pulse" />
              ) : isSpeaking ? (
                <Volume2 size={28} className="animate-bounce" />
              ) : isThinking ? (
                <Sparkles size={28} className="animate-spin" />
              ) : (
                <Mic size={28} />
              )}
            </button>
          </div>

          {/* Real-Time Microphone Volume Level Bars */}
          {isRecording && (
            <div className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider mr-1">Mic Level</span>
              {[15, 30, 45, 60, 75, 90].map((threshold, idx) => (
                <div
                  key={idx}
                  style={{
                    height: audioLevel >= threshold ? `${8 + idx * 2.5}px` : '4px',
                    transition: 'height 0.08s ease'
                  }}
                  className={`w-1.5 rounded-full ${audioLevel >= threshold ? 'bg-emerald-600' : 'bg-slate-200'}`}
                />
              ))}
            </div>
          )}

          {/* Dynamic Voice Status Label */}
          <div className="mt-3 text-center">
            <div className="text-xs font-bold text-slate-800">
              {isStartingMic
                ? 'Starting microphone…'
                : isTranscribing
                ? 'Processing your voice…'
                : isRecording
                ? 'Listening… Speak naturally'
                : isSpeaking
                ? `Speaking (${assistantVoice})...`
                : isThinking
                ? 'Thinking...'
                : 'Tap Microphone to Speak'}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {isRecording
                ? 'Dual-Engine Voice (Web Speech API + Groq Whisper Backup)'
                : 'Zero-latency browser speech recognition & native synthesis'}
            </p>
          </div>

          {/* Live Interim Speech Transcript Display */}
          {interimTranscript && (
            <div className="mt-3 w-full max-w-sm px-3.5 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-medium text-center animate-in fade-in">
              <span className="opacity-75">Hearing: </span>
              <span className="font-semibold italic">"{interimTranscript}"</span>
            </div>
          )}

          {/* Error / Permission Warning */}
          {errorMessage && (
            <div className="mt-3 w-full max-w-sm px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0 text-rose-600" />
              <span className="text-[11.5px] leading-snug">{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Conversation Transcript Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[160px] max-h-[220px] bg-slate-50/50 text-xs">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.sender === 'assistant' && (
                <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={13} />
                </div>
              )}
              <div
                className={`px-3.5 py-2 rounded-2xl max-w-[80%] text-xs leading-relaxed shadow-2xs ${
                  m.sender === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                }`}
              >
                <RichMessageContent
                  text={m.text}
                  isUser={m.sender === 'user'}
                  siteBaseUrl={assistant?.websiteUrl || assistant?.siteBlueprint?.baseUrl || ''}
                  compact
                />
                <div
                  className={`text-[9.5px] mt-1 text-right ${
                    m.sender === 'user' ? 'text-indigo-200' : 'text-slate-400'
                  }`}
                >
                  {m.timestamp}
                </div>
              </div>
              {m.sender === 'user' && (
                <div className="w-6 h-6 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                  <User size={13} />
                </div>
              )}
            </div>
          ))}
          {isThinking && (
            <div className="flex gap-2.5 justify-start animate-fadeIn" role="status" aria-live="polite">
              <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={13} />
              </div>
              <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-none bg-white border border-indigo-200/80 text-slate-600 shadow-2xs flex items-center gap-2.5 max-w-[82%]">
                <span className="inline-flex items-center gap-1 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 dot-1" />
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 dot-2" />
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500 dot-3" />
                </span>
                <span className="text-[11.5px] font-medium text-slate-600">
                  {thinkingStage === 0
                    ? 'Thinking…'
                    : thinkingStage === 1
                      ? 'Checking website details, please wait a moment…'
                      : 'Taking a little longer than usual — almost ready…'}
                </span>
              </div>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Text Input Bar with Voice Button on Left of Enter */}
        <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isThinking && handleSendText()}
            placeholder="Type a test question or tap mic to speak..."
            className="flex-1 h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white"
          />
          {/* Voice Button on Left of Enter Button */}
          <button
            type="button"
            onClick={handleToggleListen}
            className={`h-9 w-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
              isRecording
                ? 'bg-rose-50 border-rose-300 text-rose-600 animate-pulse ring-2 ring-rose-400/20'
                : isSpeaking
                ? 'bg-emerald-50 border-emerald-300 text-emerald-600'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
            }`}
            title={isRecording ? 'Click to stop speaking' : 'Click to speak (English | हिंदी | मराठी)'}
          >
            <Mic size={15} className={isRecording ? 'animate-pulse text-rose-600' : ''} />
          </button>
          {/* Enter / Send Button */}
          <button
            type="button"
            onClick={handleSendText}
            disabled={isThinking || !textInput.trim()}
            className="h-9 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-2xs shrink-0"
            title="Send message"
          >
            <span>{isThinking ? 'Sending…' : 'Send'}</span>
            <Send size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
