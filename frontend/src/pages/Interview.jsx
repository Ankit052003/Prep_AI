import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import API from "../services/api";
import ThemeToggleButton from "../components/ThemeToggleButton";
import AuthProfileMenu from "../components/AuthProfileMenu";
import { isAuthenticated } from "../services/auth";

const DEFAULT_QUESTION_COUNT = 1;
const MIN_QUESTION_COUNT = 1;
const MAX_QUESTION_COUNT = 20;
const EMPLOYEE_INTRODUCTION_DOMAIN = "Employee Introduction";
const DOMAIN_STORAGE_KEY = "selectedInterviewDomain";
const QUESTION_COUNT_STORAGE_KEY = "selectedInterviewQuestionCount";
const INTERVIEW_HISTORY_KEY = "interviewHistory";
const INTERVIEW_DOMAINS = [
  "Frontend Developer",
  "Backend Developer",
  "Data Structures",
  "HR Interview",
  "System Design",
  EMPLOYEE_INTRODUCTION_DOMAIN,
];
const FILLER_WORD_PATTERN = /\b(um+|umm+|uh+|uhh+)\b/gi;
const MAX_INTERVIEW_HISTORY_ITEMS = 30;
const LIVE_WAVEFORM_BAR_COUNT = 14;
const MAX_TTS_CACHE_ITEMS = 24;
const TTS_REQUEST_TIMEOUT_MS = 7000;
const TTS_SOFT_WAIT_MS = 1600;
const PREFERRED_TTS_VOICE_NAMES = [
  "Google US English",
  "Microsoft Aria",
  "Microsoft Jenny",
  "Samantha",
  "Alex",
];
const IDLE_WAVEFORM_BARS = Array.from({ length: LIVE_WAVEFORM_BAR_COUNT }, (_, index) => {
  const midpoint = (LIVE_WAVEFORM_BAR_COUNT - 1) / 2;
  const distanceFromCenter = Math.abs(index - midpoint);
  return Math.round(8 + Math.max(0, 12 - distanceFromCenter * 2.8));
});
const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};
const pageStagger = {
  hidden: {},
  show: {
    transition: {
      delayChildren: 0.02,
      staggerChildren: 0.05,
    },
  },
};

function parseStoredData(rawValue) {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue);
    if (typeof parsed === "string") {
      try {
        return JSON.parse(parsed);
      } catch (_error) {
        return parsed;
      }
    }
    return parsed;
  } catch (_error) {
    return rawValue;
  }
}

function parseStoredHistory() {
  const storedHistory = localStorage.getItem(INTERVIEW_HISTORY_KEY);
  if (!storedHistory) {
    return [];
  }

  try {
    const parsed = JSON.parse(storedHistory);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function saveInterviewToHistory(entry) {
  if (!entry || typeof entry !== "object") {
    return;
  }

  const history = parseStoredHistory();
  const dedupedHistory = history.filter((item) => item?.interviewId !== entry.interviewId);
  const nextHistory = [entry, ...dedupedHistory].slice(0, MAX_INTERVIEW_HISTORY_ITEMS);
  localStorage.setItem(INTERVIEW_HISTORY_KEY, JSON.stringify(nextHistory));
}

function getInitialDomain() {
  const savedDomain = localStorage.getItem(DOMAIN_STORAGE_KEY);
  if (savedDomain && INTERVIEW_DOMAINS.includes(savedDomain)) {
    return savedDomain;
  }

  return INTERVIEW_DOMAINS[0];
}

function getInitialQuestionCount() {
  const rawCount = localStorage.getItem(QUESTION_COUNT_STORAGE_KEY);
  const parsedCount = Number.parseInt(String(rawCount || ""), 10);

  if (!Number.isFinite(parsedCount)) {
    return DEFAULT_QUESTION_COUNT;
  }

  return clamp(parsedCount, MIN_QUESTION_COUNT, MAX_QUESTION_COUNT);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createIdleWaveformBars() {
  return [...IDLE_WAVEFORM_BARS];
}

function getVoiceIntensityLabel(level) {
  if (level >= 65) {
    return "Strong";
  }
  if (level >= 35) {
    return "Active";
  }
  if (level >= 12) {
    return "Light";
  }
  return "Quiet";
}

function pickPreferredSpeechVoice(voices) {
  const englishVoices = voices.filter((voice) => /^en(-|_)/i.test(String(voice?.lang || "")));
  const candidates = englishVoices.length ? englishVoices : voices;

  for (const preferredName of PREFERRED_TTS_VOICE_NAMES) {
    const matchedVoice = candidates.find((voice) =>
      String(voice?.name || "").toLowerCase().includes(preferredName.toLowerCase())
    );
    if (matchedVoice) {
      return matchedVoice;
    }
  }

  return candidates[0] || null;
}

function decodeBase64ToArrayBuffer(base64Value) {
  const normalizedBase64 = String(base64Value || "").replace(/\s+/g, "");
  const binaryString = window.atob(normalizedBase64);
  const bytes = new Uint8Array(binaryString.length);

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  return bytes.buffer;
}

function countWords(text) {
  return String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function countFillerWords(text) {
  const matches = String(text).match(FILLER_WORD_PATTERN);
  return matches ? matches.length : 0;
}

function estimatePausesFromTranscript(text) {
  const punctuationPauses = (String(text).match(/[,:;!?]/g) || []).length;
  const ellipsisPauses = (String(text).match(/\.{2,}/g) || []).length;
  return punctuationPauses + ellipsisPauses;
}

async function analyzeAudioSignal(audioBlob) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return { durationSeconds: 0, pauseCount: null };
  }

  let audioContext;
  try {
    audioContext = new AudioContextClass();
    const audioBufferData = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(audioBufferData);
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const frameDurationSeconds = 0.05;
    const frameSize = Math.max(1, Math.floor(sampleRate * frameDurationSeconds));
    const silenceThreshold = 0.014;
    const minSilentFrames = Math.max(1, Math.round(0.35 / frameDurationSeconds));

    let silentFrameCount = 0;
    let pauseCount = 0;

    for (let offset = 0; offset < channelData.length; offset += frameSize) {
      const frameEnd = Math.min(offset + frameSize, channelData.length);
      let energy = 0;

      for (let index = offset; index < frameEnd; index += 1) {
        const sample = channelData[index];
        energy += sample * sample;
      }

      const rms = Math.sqrt(energy / Math.max(1, frameEnd - offset));

      if (rms < silenceThreshold) {
        silentFrameCount += 1;
      } else {
        if (silentFrameCount >= minSilentFrames) {
          pauseCount += 1;
        }
        silentFrameCount = 0;
      }
    }

    if (silentFrameCount >= minSilentFrames) {
      pauseCount += 1;
    }

    return {
      durationSeconds: audioBuffer.duration || 0,
      pauseCount,
    };
  } catch (_error) {
    return { durationSeconds: 0, pauseCount: null };
  } finally {
    if (audioContext && typeof audioContext.close === "function") {
      try {
        await audioContext.close();
      } catch (_error) {
        // No-op
      }
    }
  }
}

async function analyzeConfidenceMetrics(audioBlob, transcript) {
  const text = String(transcript || "").trim();
  const wordCount = countWords(text);
  const fillerWordsUsed = countFillerWords(text);
  const audioStats = await analyzeAudioSignal(audioBlob);
  const pauseCount =
    audioStats.pauseCount === null
      ? estimatePausesFromTranscript(text)
      : audioStats.pauseCount;

  const speakingSpeedWpm =
    audioStats.durationSeconds > 0
      ? Math.round((wordCount / audioStats.durationSeconds) * 60)
      : 0;

  let confidence = 100;
  confidence -= fillerWordsUsed * 4;
  confidence -= Math.max(0, pauseCount - 1) * 4;

  if (speakingSpeedWpm > 0 && speakingSpeedWpm < 100) {
    confidence -= Math.min(24, Math.round((100 - speakingSpeedWpm) * 0.4));
  } else if (speakingSpeedWpm > 170) {
    confidence -= Math.min(24, Math.round((speakingSpeedWpm - 170) * 0.35));
  } else if (speakingSpeedWpm === 0) {
    confidence -= 8;
  }

  return {
    confidenceLevel: clamp(Math.round(confidence), 0, 100),
    fillerWordsUsed,
    speakingSpeedWpm,
    pauseCount,
    durationSeconds: Number(audioStats.durationSeconds || 0),
  };
}

function summarizeConfidenceMetrics(responses) {
  const analyzedResponses = responses
    .map((response) => response?.confidenceAnalytics)
    .filter(Boolean);

  if (!analyzedResponses.length) {
    return null;
  }

  const totalConfidence = analyzedResponses.reduce(
    (sum, item) => sum + Number(item.confidenceLevel || 0),
    0
  );
  const totalFillerWords = analyzedResponses.reduce(
    (sum, item) => sum + Number(item.fillerWordsUsed || 0),
    0
  );
  const totalWpm = analyzedResponses.reduce(
    (sum, item) => sum + Number(item.speakingSpeedWpm || 0),
    0
  );
  const totalPauses = analyzedResponses.reduce(
    (sum, item) => sum + Number(item.pauseCount || 0),
    0
  );

  return {
    confidenceLevel: Math.round(totalConfidence / analyzedResponses.length),
    fillerWordsUsed: totalFillerWords,
    speakingSpeedWpm: Math.round(totalWpm / analyzedResponses.length),
    pauseCount: totalPauses,
    analyzedResponses: analyzedResponses.length,
  };
}

function InterviewPage() {
  const navigate = useNavigate();
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const frequencyDataRef = useRef(null);
  const animationFrameRef = useRef(null);
  const speechRetryTimerRef = useRef(null);
  const speechVoiceRef = useRef(null);
  const ttsAudioRef = useRef(null);
  const speechRequestIdRef = useRef(0);
  const questionAudioContextRef = useRef(null);
  const questionAudioSourceRef = useRef(null);
  const ttsCacheRef = useRef(new Map());
  const ttsInFlightRef = useRef(new Map());

  const [parsedResume] = useState(() => parseStoredData(localStorage.getItem("parsedResume")));
  const [interviewId, setInterviewId] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [questionNumber, setQuestionNumber] = useState(0);
  const [answerText, setAnswerText] = useState("");
  const [answerMode, setAnswerMode] = useState("text");
  const [history, setHistory] = useState([]);
  const [lastResult, setLastResult] = useState(null);
  const [recording, setRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [autoReadQuestion, setAutoReadQuestion] = useState(true);
  const [autoSubmitVoice, setAutoSubmitVoice] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState(getInitialDomain);
  const [selectedQuestionCount, setSelectedQuestionCount] = useState(getInitialQuestionCount);
  const [totalQuestions, setTotalQuestions] = useState(DEFAULT_QUESTION_COUNT);
  const [activeInterviewDomain, setActiveInterviewDomain] = useState("");
  const [pendingVoiceMetrics, setPendingVoiceMetrics] = useState(null);
  const [liveWaveformBars, setLiveWaveformBars] = useState(() => createIdleWaveformBars());
  const [voiceIntensityLevel, setVoiceIntensityLevel] = useState(0);

  const answeredCount = history.length;
  const progressPercent =
    totalQuestions > 0 ? Math.min((answeredCount / totalQuestions) * 100, 100) : 0;
  const hasActiveQuestion = Boolean(interviewId && currentQuestion);
  const interviewCompleted = Boolean(interviewId && !currentQuestion && answeredCount > 0);
  const voiceUiBusy = recording || isProcessingVoice;
  const canSubmit =
    Boolean(answerText.trim()) && hasActiveQuestion && !isSubmitting && !voiceUiBusy;
  const showQuestionSkeleton = Boolean(
    parsedResume &&
      ((isStarting && !hasActiveQuestion) ||
        (interviewId && !currentQuestion && !interviewCompleted))
  );

  const clearSpeechRetryTimer = () => {
    if (speechRetryTimerRef.current) {
      window.clearTimeout(speechRetryTimerRef.current);
      speechRetryTimerRef.current = null;
    }
  };

  const cacheQuestionTts = (text, entry) => {
    const normalizedText = String(text || "").trim();
    if (!normalizedText || !entry?.audioBase64) {
      return;
    }

    const cache = ttsCacheRef.current;
    cache.set(normalizedText, entry);

    while (cache.size > MAX_TTS_CACHE_ITEMS) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      cache.delete(oldestKey);
    }
  };

  const fetchQuestionTtsData = async (text) => {
    const normalizedText = String(text || "").trim();
    if (!normalizedText) {
      throw new Error("Missing question text for TTS.");
    }

    const cachedEntry = ttsCacheRef.current.get(normalizedText);
    if (cachedEntry?.audioBase64) {
      return cachedEntry;
    }

    const inFlight = ttsInFlightRef.current.get(normalizedText);
    if (inFlight) {
      return inFlight;
    }

    const requestPromise = API.post(
      "/test/tts",
      { text: normalizedText },
      { timeout: TTS_REQUEST_TIMEOUT_MS }
    )
      .then((response) => {
        const audioBase64 = String(response.data?.audioBase64 || "").trim();
        const mimeType = String(response.data?.mimeType || "audio/wav").trim() || "audio/wav";

        if (!audioBase64) {
          throw new Error("AI TTS returned empty audio.");
        }

        const entry = {
          audioBase64,
          mimeType,
          audioBuffer: null,
          audioDataUrl: null,
        };
        cacheQuestionTts(normalizedText, entry);
        return entry;
      })
      .finally(() => {
        const activePromise = ttsInFlightRef.current.get(normalizedText);
        if (activePromise === requestPromise) {
          ttsInFlightRef.current.delete(normalizedText);
        }
      });

    ttsInFlightRef.current.set(normalizedText, requestPromise);
    return requestPromise;
  };

  const ensureTtsDataUrl = (entry) => {
    if (!entry?.audioBase64) {
      return "";
    }

    if (entry.audioDataUrl) {
      return entry.audioDataUrl;
    }

    const mimeType = String(entry.mimeType || "audio/wav").trim() || "audio/wav";
    entry.audioDataUrl = `data:${mimeType};base64,${entry.audioBase64}`;
    return entry.audioDataUrl;
  };

  const ensureDecodedTtsBuffer = async (entry, playbackContext) => {
    if (!entry?.audioBase64 || !playbackContext) {
      return null;
    }

    if (entry.audioBuffer) {
      return entry.audioBuffer;
    }

    const audioBufferData = decodeBase64ToArrayBuffer(entry.audioBase64);
    const decodedAudioBuffer = await playbackContext.decodeAudioData(audioBufferData.slice(0));
    entry.audioBuffer = decodedAudioBuffer;
    return decodedAudioBuffer;
  };

  const prefetchQuestionTts = (text) => {
    const normalizedText = String(text || "").trim();
    if (!normalizedText) {
      return;
    }

    void fetchQuestionTtsData(normalizedText)
      .then(async (entry) => {
        const playbackContext = await ensureQuestionPlaybackContext();
        if (!playbackContext) {
          return;
        }

        await ensureDecodedTtsBuffer(entry, playbackContext);
      })
      .catch(() => {});
  };

  const ensureQuestionPlaybackContext = async () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }

    if (!questionAudioContextRef.current) {
      questionAudioContextRef.current = new AudioContextClass();
    }

    const playbackContext = questionAudioContextRef.current;
    if (playbackContext.state === "suspended") {
      await playbackContext.resume();
    }

    return playbackContext;
  };

  const stopQuestionPlayback = () => {
    clearSpeechRetryTimer();

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    const activeSource = questionAudioSourceRef.current;
    if (activeSource) {
      try {
        activeSource.stop(0);
      } catch (_error) {
        // No-op
      }
      if (typeof activeSource.disconnect === "function") {
        activeSource.disconnect();
      }
      questionAudioSourceRef.current = null;
    }

    const currentAudio = ttsAudioRef.current;
    if (currentAudio) {
      try {
        currentAudio.pause();
        currentAudio.src = "";
      } catch (_error) {
        // No-op
      }
      ttsAudioRef.current = null;
    }
  };

  const resolveSpeechVoice = () => {
    if (!("speechSynthesis" in window)) {
      return null;
    }

    const availableVoices = window.speechSynthesis.getVoices();
    if (!availableVoices.length) {
      return speechVoiceRef.current;
    }

    const selectedVoice = pickPreferredSpeechVoice(availableVoices);
    speechVoiceRef.current = selectedVoice;
    return selectedVoice;
  };

  const warmUpSpeechSynthesis = () => {
    if (!("speechSynthesis" in window)) {
      return;
    }

    try {
      const synth = window.speechSynthesis;
      const warmupUtterance = new SpeechSynthesisUtterance(" ");
      warmupUtterance.volume = 0;
      synth.speak(warmupUtterance);
      synth.cancel();
      synth.resume();
    } catch (_error) {
      // Ignore warm-up failures; normal speak flow still runs.
    }
  };

  const warmUpQuestionPlayback = () => {
    ensureQuestionPlaybackContext().catch(() => {});
  };

  const stopAudioMonitoring = () => {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    analyserRef.current = null;
    frequencyDataRef.current = null;

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    setLiveWaveformBars(createIdleWaveformBars());
    setVoiceIntensityLevel(0);
  };

  const startAudioMonitoring = (stream) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      setLiveWaveformBars(createIdleWaveformBars());
      setVoiceIntensityLevel(0);
      return;
    }

    try {
      stopAudioMonitoring();

      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 128;
      analyser.minDecibels = -92;
      analyser.maxDecibels = -12;
      analyser.smoothingTimeConstant = 0.78;
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      frequencyDataRef.current = frequencyData;

      if (audioContext.state === "suspended") {
        audioContext.resume().catch(() => {});
      }

      let lastPaintTime = 0;
      const paintWaveform = (timestamp) => {
        const activeAnalyser = analyserRef.current;
        const activeFrequencyData = frequencyDataRef.current;
        if (!activeAnalyser || !activeFrequencyData) {
          return;
        }

        animationFrameRef.current = window.requestAnimationFrame(paintWaveform);
        if (timestamp - lastPaintTime < 60) {
          return;
        }
        lastPaintTime = timestamp;

        activeAnalyser.getByteFrequencyData(activeFrequencyData);
        const binsPerBar = Math.max(
          1,
          Math.floor(activeFrequencyData.length / LIVE_WAVEFORM_BAR_COUNT)
        );
        const nextBars = Array.from({ length: LIVE_WAVEFORM_BAR_COUNT }, (_, index) => {
          const startIndex = index * binsPerBar;
          const endIndex =
            index === LIVE_WAVEFORM_BAR_COUNT - 1
              ? activeFrequencyData.length
              : Math.min(activeFrequencyData.length, startIndex + binsPerBar);

          let total = 0;
          for (let dataIndex = startIndex; dataIndex < endIndex; dataIndex += 1) {
            total += activeFrequencyData[dataIndex];
          }

          const averageValue = total / Math.max(1, endIndex - startIndex);
          const normalizedValue = averageValue / 255;
          return clamp(Math.round(8 + normalizedValue * 36), 8, 44);
        });

        const averageBarHeight =
          nextBars.reduce((sum, barHeight) => sum + barHeight, 0) / nextBars.length;
        const normalizedLevel = (averageBarHeight - 8) / 36;

        setLiveWaveformBars(nextBars);
        setVoiceIntensityLevel(clamp(Math.round(normalizedLevel * 100), 0, 100));
      };

      animationFrameRef.current = window.requestAnimationFrame(paintWaveform);
    } catch (_error) {
      stopAudioMonitoring();
    }
  };

  useEffect(() => {
    if (isAuthenticated()) {
      return;
    }

    navigate("/signup?mode=login&redirect=/interview", { replace: true });
  }, [navigate]);

  const releaseMicResources = () => {
    stopAudioMonitoring();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setIsProcessingVoice(false);
  };

  const speakQuestionWithBrowserTTS = (normalizedText, requestId) => {
    if (!("speechSynthesis" in window)) {
      setStatusMessage("Speech playback is not supported in this browser.");
      return;
    }

    const synth = window.speechSynthesis;
    const voice = resolveSpeechVoice();
    const utterance = new SpeechSynthesisUtterance(normalizedText);
    utterance.lang = voice?.lang || "en-US";

    if (voice) {
      utterance.voice = voice;
    }

    utterance.onerror = () => {
      if (speechRequestIdRef.current !== requestId) {
        return;
      }

      clearSpeechRetryTimer();
      speechRetryTimerRef.current = window.setTimeout(() => {
        if (speechRequestIdRef.current !== requestId) {
          return;
        }

        const retryUtterance = new SpeechSynthesisUtterance(normalizedText);
        const retryVoice = resolveSpeechVoice();
        retryUtterance.lang = retryVoice?.lang || "en-US";
        if (retryVoice) {
          retryUtterance.voice = retryVoice;
        }

        synth.cancel();
        synth.resume();
        synth.speak(retryUtterance);
      }, 220);
    };

    clearSpeechRetryTimer();
    synth.cancel();
    synth.resume();
    synth.speak(utterance);

    speechRetryTimerRef.current = window.setTimeout(() => {
      if (speechRequestIdRef.current !== requestId) {
        return;
      }

      if (!synth.speaking && !synth.pending) {
        const fallbackUtterance = new SpeechSynthesisUtterance(normalizedText);
        const fallbackVoice = resolveSpeechVoice();
        fallbackUtterance.lang = fallbackVoice?.lang || "en-US";
        if (fallbackVoice) {
          fallbackUtterance.voice = fallbackVoice;
        }

        synth.cancel();
        synth.resume();
        synth.speak(fallbackUtterance);
      }
    }, 280);
  };

  const getQuestionTtsWithSoftWait = async (normalizedText, timeoutMs) => {
    const ttsPromise = fetchQuestionTtsData(normalizedText);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      const entry = await ttsPromise;
      return { timedOut: false, entry };
    }

    let timeoutId = null;
    const timeoutPromise = new Promise((resolve) => {
      timeoutId = window.setTimeout(() => {
        resolve({ timedOut: true, ttsPromise });
      }, timeoutMs);
    });

    const ttsResult = await Promise.race([
      ttsPromise.then((entry) => ({ timedOut: false, entry })),
      timeoutPromise,
    ]);

    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }

    return ttsResult;
  };

  const speakQuestion = async (text = currentQuestion, options = {}) => {
    const { allowSoftFallback = false } = options;
    const normalizedText = String(text || "").trim();
    if (!normalizedText) return;

    const requestId = speechRequestIdRef.current + 1;
    speechRequestIdRef.current = requestId;
    stopQuestionPlayback();

    try {
      let ttsEntry;
      if (allowSoftFallback) {
        const ttsResult = await getQuestionTtsWithSoftWait(normalizedText, TTS_SOFT_WAIT_MS);
        if (speechRequestIdRef.current !== requestId) {
          return;
        }

        if (ttsResult?.timedOut) {
          const delayedPromise = ttsResult.ttsPromise;
          if (delayedPromise && typeof delayedPromise.then === "function") {
            void delayedPromise
              .then((entry) => {
                void ensureQuestionPlaybackContext()
                  .then((playbackContext) => {
                    if (!playbackContext) {
                      return;
                    }
                    return ensureDecodedTtsBuffer(entry, playbackContext);
                  })
                  .catch(() => {});
              })
              .catch(() => {});
          }

          speakQuestionWithBrowserTTS(normalizedText, requestId);
          return;
        }

        ttsEntry = ttsResult.entry;
      } else {
        ttsEntry = await fetchQuestionTtsData(normalizedText);
      }

      if (speechRequestIdRef.current !== requestId) {
        return;
      }

      const dataUrl = ensureTtsDataUrl(ttsEntry);
      if (!dataUrl) {
        throw new Error("AI TTS did not return playable audio.");
      }

      const audio = new Audio(dataUrl);
      audio.preload = "auto";
      ttsAudioRef.current = audio;
      await audio.play();

      void ensureQuestionPlaybackContext()
        .then((playbackContext) => {
          if (!playbackContext) {
            return;
          }
          return ensureDecodedTtsBuffer(ttsEntry, playbackContext);
        })
        .catch(() => {});
    } catch (_ttsError) {
      if (speechRequestIdRef.current !== requestId) {
        return;
      }

      speakQuestionWithBrowserTTS(normalizedText, requestId);
    }
  };

  useEffect(() => {
    if (!autoReadQuestion || !currentQuestion) {
      return;
    }

    void speakQuestion(currentQuestion, { allowSoftFallback: true });
  }, [autoReadQuestion, currentQuestion, questionNumber]);

  useEffect(() => {
    if (!currentQuestion) {
      return;
    }

    prefetchQuestionTts(currentQuestion);
  }, [currentQuestion]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) {
      return undefined;
    }

    const synth = window.speechSynthesis;
    const hydrateVoices = () => {
      resolveSpeechVoice();
    };

    hydrateVoices();

    if (typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", hydrateVoices);
      return () => {
        synth.removeEventListener("voiceschanged", hydrateVoices);
      };
    }

    const previousHandler = synth.onvoiceschanged;
    synth.onvoiceschanged = hydrateVoices;

    return () => {
      synth.onvoiceschanged = previousHandler || null;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(DOMAIN_STORAGE_KEY, selectedDomain);
  }, [selectedDomain]);

  useEffect(() => {
    localStorage.setItem(QUESTION_COUNT_STORAGE_KEY, String(selectedQuestionCount));
  }, [selectedQuestionCount]);

  useEffect(() => {
    if (selectedDomain === EMPLOYEE_INTRODUCTION_DOMAIN) {
      setSelectedQuestionCount(1);
    }
  }, [selectedDomain]);

  useEffect(() => {
    return () => {
      clearSpeechRetryTimer();
      stopQuestionPlayback();
      ttsInFlightRef.current.clear();
      ttsCacheRef.current.clear();

      if (questionAudioContextRef.current) {
        questionAudioContextRef.current.close().catch(() => {});
        questionAudioContextRef.current = null;
      }

      const activeRecorder = recorderRef.current;
      if (activeRecorder && activeRecorder.state !== "inactive") {
        activeRecorder.stop();
      }
      releaseMicResources();
    };
  }, []);

  const handleDomainChange = (event) => {
    const nextDomain = event.target.value;
    setSelectedDomain(nextDomain);
  };

  const startInterview = async () => {
    if (!parsedResume) {
      setError("Upload and parse your resume before starting an interview.");
      return;
    }

    stopQuestionPlayback();
    ttsInFlightRef.current.clear();
    ttsCacheRef.current.clear();
    warmUpSpeechSynthesis();
    warmUpQuestionPlayback();
    setIsStarting(true);
    setError("");
    setStatusMessage("");
    setAnswerText("");
    setHistory([]);
    setLastResult(null);
    setPendingVoiceMetrics(null);
    setActiveInterviewDomain("");
    setInterviewId("");
    setCurrentQuestion("");
    setTotalQuestions(selectedQuestionCount);
    setQuestionNumber(0);
    localStorage.removeItem("finalResult");

    try {
      const response = await API.post("/interview/start", {
        parsedResume,
        domain: selectedDomain,
        questionCount: selectedQuestionCount,
      });
      const activeDomain = response.data?.domain || selectedDomain;
      const generatedCount = clamp(
        Number(response.data?.totalQuestions || selectedQuestionCount),
        MIN_QUESTION_COUNT,
        MAX_QUESTION_COUNT
      );
      const firstQuestion = String(response.data?.question || "").trim();

      setInterviewId(response.data?.interviewId || "");
      setActiveInterviewDomain(activeDomain);
      setTotalQuestions(generatedCount);
      if (firstQuestion) {
        prefetchQuestionTts(firstQuestion);
      }
      setCurrentQuestion(firstQuestion);
      setQuestionNumber(firstQuestion ? 1 : 0);
      setStatusMessage(
        `Interview started for ${activeDomain} with ${generatedCount} questions. Submit your answer to move to the next question.`
      );
    } catch (startError) {
      const message =
        startError.response?.data?.error ||
        startError.message ||
        "Unable to start interview.";
      setError(message);
    } finally {
      setIsStarting(false);
    }
  };

  const submitAnswer = async (overrideAnswer, overrideMetrics) => {
    if (!interviewId || !currentQuestion) {
      setError("Start the interview to receive a question first.");
      return;
    }

    const finalAnswer = String(overrideAnswer ?? answerText).trim();
    if (!finalAnswer) {
      setError("Please provide an answer before submitting.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await API.post("/interview/answer", {
        interviewId,
        answer: finalAnswer,
      });
      const confidenceAnalytics = overrideMetrics || pendingVoiceMetrics || null;

      const result = {
        question: response.data?.question || currentQuestion,
        answer: response.data?.answer || finalAnswer,
        score: Number(response.data?.score ?? 0),
        evaluation: response.data?.evaluation || "",
        confidenceAnalytics,
      };

      setHistory((prev) => [...prev, result]);
      setLastResult(result);
      setAnswerText("");
      setPendingVoiceMetrics(null);

      const nextQuestionText = String(response.data?.nextQuestion || "").trim();
      if (nextQuestionText) {
        const nextQuestionNumber = Math.min(questionNumber + 1, totalQuestions);
        prefetchQuestionTts(nextQuestionText);
        setCurrentQuestion(nextQuestionText);
        setQuestionNumber(nextQuestionNumber);
        setStatusMessage(`Answer saved. Continue with question ${nextQuestionNumber}.`);
      } else {
        setCurrentQuestion("");
        setQuestionNumber(totalQuestions);
        setStatusMessage(response.data?.message || "All questions answered. Finish interview for report.");
      }
    } catch (submitError) {
      const message =
        submitError.response?.data?.error ||
        submitError.message ||
        "Answer submission failed.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const finishInterview = async () => {
    if (!interviewId) {
      setError("No interview session found. Start interview first.");
      return;
    }

    setIsFinishing(true);
    setError("");

    try {
      const response = await API.post("/interview/finish", { interviewId });
      const detailedResponses =
        history.length > 0
          ? history
          : Array.isArray(response.data?.detailedResponses)
          ? response.data.detailedResponses
          : [];
      const confidenceAnalyticsSummary = summarizeConfidenceMetrics(detailedResponses);

      const finalResult = {
        ...response.data,
        detailedResponses,
        confidenceAnalyticsSummary,
        interviewId,
        domain: activeInterviewDomain || selectedDomain,
        answeredQuestions: detailedResponses.length,
        totalQuestions,
        completedAt: new Date().toISOString(),
      };

      localStorage.setItem("finalResult", JSON.stringify(finalResult));
      saveInterviewToHistory(finalResult);
      navigate("/report");
    } catch (finishError) {
      const message =
        finishError.response?.data?.error ||
        finishError.message ||
        "Failed to finish interview.";
      setError(message);
    } finally {
      setIsFinishing(false);
    }
  };

  const startRecording = async () => {
    if (!hasActiveQuestion) {
      setError("No active question found. Start interview first.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone recording is not supported in this browser.");
      return;
    }

    setError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);

      streamRef.current = stream;
      recorderRef.current = mediaRecorder;
      chunksRef.current = [];
      setPendingVoiceMetrics(null);
      setIsProcessingVoice(false);
      startAudioMonitoring(stream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data?.size) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = () => {
        setError("Recording failed. Please retry.");
        releaseMicResources();
      };

      mediaRecorder.onstop = async () => {
        try {
          setRecording(false);
          setIsProcessingVoice(true);
          stopAudioMonitoring();

          const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
          if (!audioBlob.size) {
            setError("No audio captured. Please record again.");
            return;
          }

          setStatusMessage("Transcribing your voice answer...");
          const formData = new FormData();
          formData.append("audio", audioBlob, "answer.webm");

          let sttResponse;
          try {
            sttResponse = await API.post("/test/stt", formData, {
              headers: { "Content-Type": "multipart/form-data" },
            });
          } catch (sttError) {
            if (sttError.response?.status !== 404) {
              throw sttError;
            }

            sttResponse = await API.post("/interview/voice-answer", formData, {
              headers: { "Content-Type": "multipart/form-data" },
            });
          }

          const transcript = String(
            sttResponse.data?.transcript || sttResponse.data?.text || ""
          ).trim();
          if (!transcript) {
            setError("Transcription returned empty text. Please retry.");
            return;
          }
          const confidenceMetrics = await analyzeConfidenceMetrics(audioBlob, transcript);

          setAnswerText(transcript);
          setPendingVoiceMetrics(confidenceMetrics);
          setStatusMessage(
            `Voice answer converted to text. Confidence level: ${confidenceMetrics.confidenceLevel}%.`
          );

          if (autoSubmitVoice) {
            await submitAnswer(transcript, confidenceMetrics);
          }
        } catch (voiceError) {
          const status = voiceError.response?.status;
          const endpoint = voiceError.config?.url || "unknown-endpoint";
          const backendMessage = voiceError.response?.data?.error;

          if (status === 404) {
            setError(
              `Voice endpoint not found (404) at ${endpoint}. Tried /test/stt and /interview/voice-answer.`
            );
            return;
          }

          if (status === 501) {
            setError(
              backendMessage ||
                "Voice transcription is not available for the current AI provider. Switch to text mode for now."
            );
            return;
          }

          const message = backendMessage || voiceError.message || "Voice processing failed.";
          setError(`Voice processing failed at ${endpoint}${status ? ` (${status})` : ""}: ${message}`);
        } finally {
          releaseMicResources();
        }
      };

      mediaRecorder.start();
      setRecording(true);
      setStatusMessage("Recording started. Speak now and watch the waveform for mic activity.");
    } catch (recordingError) {
      const message =
        recordingError.response?.data?.error ||
        recordingError.message ||
        "Microphone access denied.";
      setError(message);
      releaseMicResources();
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    if (recorder.state !== "inactive") {
      setStatusMessage("Recording stopped. Processing answer...");
      setRecording(false);
      setIsProcessingVoice(true);
      stopAudioMonitoring();
      recorder.stop();
    }
  };

  return (
    <div className="home-shell app-shell">
      <nav className="home-navbar">
        <a href="/" className="home-brand" aria-label="PrepAI Home">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span className="brand-text">PrepAI</span>
        </a>

        <div className="home-menu">
          <Link to="/">Home</Link>
          <Link to="/resume">Resume</Link>
          <Link to="/interview">Interview</Link>
          <Link to="/report">Report</Link>
        </div>

        <div className="nav-actions">
          <button type="button" className="home-signin" onClick={() => navigate("/report")}>
            Open Report
          </button>
          <AuthProfileMenu />
          <ThemeToggleButton />
        </div>
      </nav>

      <main className="app-page">
        <motion.section
          className="app-page-header home-fade-up"
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        >
          <p className="app-kicker">Step 2</p>
          <h1>Interview Practice</h1>
          <p>
            Answer AI-generated interview questions. Use text mode or voice mode with
            speech-to-text transcription.
          </p>
        </motion.section>

        {!parsedResume && (
          <motion.section
            className="single-card-wrap home-fade-up"
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.08 }}
          >
            <motion.article
              className="glass-card"
              whileHover={{ y: -2 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <h2>Resume Not Found</h2>
              <p className="muted-copy">
                Upload and parse a resume first, then start your interview session.
              </p>
              <div className="app-button-row">
                <button type="button" className="app-btn" onClick={() => navigate("/resume")}>
                  Go To Resume Upload
                </button>
              </div>
            </motion.article>
          </motion.section>
        )}

        {!!parsedResume && (
          <motion.section
            className="app-grid interview-layout home-fade-up"
            variants={pageStagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.15 }}
          >
            <motion.article
              className="glass-card"
              variants={fadeUp}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <div className="title-row">
                <h2>Session Controls</h2>
                <span className="status-pill">
                  {interviewId
                    ? `Q${Math.max(questionNumber, 1)} / ${totalQuestions}`
                    : "Not Started"}
                </span>
              </div>

              <div className="progress-track">
                <div style={{ width: `${progressPercent}%` }} />
              </div>

              <p className="muted-copy">
                Answered {answeredCount} of {totalQuestions} questions.
              </p>

              <div className="domain-selector">
                <label htmlFor="interview-domain">Domain</label>
                <select
                  id="interview-domain"
                  value={selectedDomain}
                  onChange={handleDomainChange}
                  disabled={isStarting || isSubmitting || voiceUiBusy}
                >
                  {INTERVIEW_DOMAINS.map((domain) => (
                    <option key={domain} value={domain}>
                      {domain}
                    </option>
                  ))}
                </select>
                <p className="muted-copy domain-helper">
                  Questions will be tailored to <strong>{selectedDomain}</strong>.
                </p>

                <label htmlFor="interview-question-count">Number of Questions</label>
                <input
                  id="interview-question-count"
                  type="number"
                  min={MIN_QUESTION_COUNT}
                  max={MAX_QUESTION_COUNT}
                  value={selectedQuestionCount}
                  onChange={(event) => {
                    const rawValue = Number.parseInt(event.target.value, 10);
                    const nextValue = Number.isFinite(rawValue)
                      ? clamp(rawValue, MIN_QUESTION_COUNT, MAX_QUESTION_COUNT)
                      : DEFAULT_QUESTION_COUNT;
                    setSelectedQuestionCount(nextValue);
                  }}
                  disabled={isStarting || isSubmitting || voiceUiBusy}
                />
                <p className="muted-copy domain-helper">
                  Choose between {MIN_QUESTION_COUNT} and {MAX_QUESTION_COUNT} questions.
                </p>
              </div>

              <div className="app-button-row">
                <button type="button" className="app-btn" onClick={startInterview} disabled={isStarting || isSubmitting || voiceUiBusy}>
                  {isStarting ? "Starting..." : interviewId ? "Restart Interview" : "Start Interview"}
                </button>

                <button
                  type="button"
                  className="app-btn secondary"
                  onClick={finishInterview}
                  disabled={!interviewId || !answeredCount || isFinishing || isSubmitting || voiceUiBusy}
                >
                  {isFinishing ? "Finishing..." : "Finish Interview"}
                </button>
              </div>

              <AnimatePresence initial={false}>
                {showQuestionSkeleton && (
                  <motion.div
                    className="question-shell question-skeleton-shell"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    <p className="question-label">Loading question...</p>
                    <SkeletonTheme
                      baseColor="rgba(170, 190, 230, 0.28)"
                      highlightColor="rgba(255, 255, 255, 0.56)"
                    >
                      <div className="question-skeleton-lines" aria-hidden="true">
                        <Skeleton height={22} width="92%" borderRadius={8} />
                        <Skeleton height={22} width="84%" borderRadius={8} />
                        <Skeleton height={22} width="74%" borderRadius={8} />
                      </div>
                      <Skeleton height={46} width="100%" borderRadius={10} />
                      <Skeleton height={122} width="100%" borderRadius={12} />
                    </SkeletonTheme>
                  </motion.div>
                )}

                {hasActiveQuestion && (
                  <motion.div
                    className="question-shell"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                  >
                  <p className="question-label">Current Question</p>
                  <h3>{currentQuestion}</h3>

                  <div className="app-inline-controls">
                    <button
                      type="button"
                      className="app-btn ghost"
                      onClick={() => speakQuestion()}
                      disabled={voiceUiBusy}
                    >
                      Read Question
                    </button>
                    <label className="inline-toggle">
                      <input
                        type="checkbox"
                        checked={autoReadQuestion}
                        onChange={(event) => setAutoReadQuestion(event.target.checked)}
                        disabled={voiceUiBusy}
                      />
                      Auto Read
                    </label>
                  </div>

                  <div className="answer-modes">
                    <label>
                      <input
                        type="radio"
                        value="text"
                        checked={answerMode === "text"}
                        onChange={(event) => setAnswerMode(event.target.value)}
                        disabled={voiceUiBusy}
                      />
                      Text
                    </label>
                    <label>
                      <input
                        type="radio"
                        value="voice"
                        checked={answerMode === "voice"}
                        onChange={(event) => setAnswerMode(event.target.value)}
                        disabled={voiceUiBusy}
                      />
                      Voice
                    </label>
                  </div>

                  {answerMode === "voice" && (
                    <>
                      <div className="app-button-row">
                        {!recording ? (
                          <button
                            type="button"
                            className="app-btn secondary"
                            onClick={startRecording}
                            disabled={isSubmitting || isProcessingVoice}
                          >
                            {isProcessingVoice ? "Processing..." : "Start Recording"}
                          </button>
                        ) : (
                          <button type="button" className="app-btn danger" onClick={stopRecording}>
                            Stop Recording
                          </button>
                        )}

                        <label className="inline-toggle">
                          <input
                            type="checkbox"
                            checked={autoSubmitVoice}
                            onChange={(event) => setAutoSubmitVoice(event.target.checked)}
                            disabled={voiceUiBusy}
                          />
                          Auto Submit Transcript
                        </label>
                      </div>

                      <AnimatePresence initial={false}>
                        {recording && (
                          <motion.div
                            className="recording-wave-shell"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                          >
                            <div className="recording-wave-meta">
                              <span className="recording-wave-title">
                                <span className="recording-wave-dot" aria-hidden="true" />
                                Recording
                              </span>
                              <span className="recording-wave-status">
                                {getVoiceIntensityLabel(voiceIntensityLevel)} {voiceIntensityLevel}%
                              </span>
                            </div>

                            <div className="recording-wave-track">
                              <div
                                className="recording-wave"
                                role="img"
                                aria-label={`Microphone is recording. Current voice intensity is ${voiceIntensityLevel} percent.`}
                              >
                                {liveWaveformBars.map((barHeight, index) => (
                                  <span
                                    key={`recording-wave-${index}`}
                                    style={{
                                      "--bar-size": `${barHeight}px`,
                                      opacity: clamp(0.25 + barHeight / 55, 0.3, 1),
                                    }}
                                  />
                                ))}
                              </div>
                            </div>

                            <p className="recording-wave-caption">
                              Live mic waveform reacts to your voice.
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {isProcessingVoice && !recording && (
                        <p className="recording-processing-note">
                          Voice captured. Converting your answer to text now.
                        </p>
                      )}
                    </>
                  )}

                  <textarea
                    value={answerText}
                    onChange={(event) => setAnswerText(event.target.value)}
                    className="app-textarea"
                    rows={5}
                    placeholder="Type your answer here or record in voice mode."
                    disabled={voiceUiBusy}
                  />

                  <AnimatePresence initial={false}>
                    {pendingVoiceMetrics && (
                      <motion.div
                        className="confidence-metrics-box"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                      >
                      <p className="question-label">Confidence Detection</p>
                      <p className="confidence-metric-line">
                        Confidence Level: <strong>{pendingVoiceMetrics.confidenceLevel}%</strong>
                      </p>
                      <p className="confidence-metric-line">
                        Filler Words Used: <strong>{pendingVoiceMetrics.fillerWordsUsed}</strong>
                      </p>
                      <p className="confidence-metric-line">
                        Speaking Speed: <strong>{pendingVoiceMetrics.speakingSpeedWpm} WPM</strong>
                      </p>
                      <p className="confidence-metric-line">
                        Pause Detection: <strong>{pendingVoiceMetrics.pauseCount}</strong>
                      </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="app-button-row">
                    <button type="button" className="app-btn" onClick={() => submitAnswer()} disabled={!canSubmit}>
                      {isSubmitting ? "Submitting..." : "Submit Answer"}
                    </button>
                    <button
                      type="button"
                      className="app-btn ghost"
                      onClick={() => setAnswerText("")}
                      disabled={!answerText || voiceUiBusy}
                    >
                      Clear
                    </button>
                  </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {interviewCompleted && (
                <p className="app-alert success">
                  All questions were answered. Click "Finish Interview" to generate your report.
                </p>
              )}

              {statusMessage && <p className="app-alert info">{statusMessage}</p>}
              {error && <p className="app-alert error">{error}</p>}

              <AnimatePresence initial={false}>
                {lastResult && (
                  <motion.div
                    className="inline-eval-card"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                  <div className="title-row">
                    <h3>Latest Feedback</h3>
                    <span
                      className={`score-chip ${
                        lastResult.score >= 7 ? "good" : lastResult.score >= 5 ? "mid" : "low"
                      }`}
                    >
                      {lastResult.score}/10
                    </span>
                  </div>
                  <p className="evaluation-text">{lastResult.evaluation || "No feedback text returned."}</p>
                  {lastResult.confidenceAnalytics && (
                    <div className="confidence-inline-summary">
                      <p>
                        Confidence Level:{" "}
                        <strong>{lastResult.confidenceAnalytics.confidenceLevel}%</strong>
                      </p>
                      <p>
                        Filler Words Used:{" "}
                        <strong>{lastResult.confidenceAnalytics.fillerWordsUsed}</strong>
                      </p>
                      <p>
                        Speaking Speed:{" "}
                        <strong>{lastResult.confidenceAnalytics.speakingSpeedWpm} WPM</strong>
                      </p>
                    </div>
                  )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.article>

            <motion.article
              className="glass-card"
              variants={fadeUp}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <h2>Answer History</h2>
              {!history.length && (
                <p className="muted-copy">Submitted answers and scores will appear here.</p>
              )}

              {!!history.length && (
                <div className="history-list">
                  {history.map((item, index) => (
                    <motion.div
                      key={`${item.question}-${index}`}
                      className="history-item"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.24, ease: "easeOut", delay: index * 0.03 }}
                    >
                      <p className="history-question">
                        <strong>Q{index + 1}:</strong> {item.question}
                      </p>
                      <p className="history-answer">
                        <strong>Answer:</strong> {item.answer}
                      </p>
                      <div className="history-meta">
                        <span
                          className={`score-chip ${
                            item.score >= 7 ? "good" : item.score >= 5 ? "mid" : "low"
                          }`}
                        >
                          Score {item.score}/10
                        </span>
                      </div>
                      <p className="evaluation-text">{item.evaluation || "No evaluation provided."}</p>
                      {item.confidenceAnalytics && (
                        <div className="confidence-inline-summary">
                          <p>
                            Confidence Level: <strong>{item.confidenceAnalytics.confidenceLevel}%</strong>
                          </p>
                          <p>
                            Filler Words Used: <strong>{item.confidenceAnalytics.fillerWordsUsed}</strong>
                          </p>
                          <p>
                            Speaking Speed: <strong>{item.confidenceAnalytics.speakingSpeedWpm} WPM</strong>
                          </p>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.article>
          </motion.section>
        )}

      </main>
    </div>
  );
}

export default InterviewPage;
