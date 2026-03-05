import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import API from "../services/api";
import ThemeToggleButton from "../components/ThemeToggleButton";

const DEFAULT_QUESTION_COUNT = 5;
const MIN_QUESTION_COUNT = 1;
const MAX_QUESTION_COUNT = 20;
const DOMAIN_STORAGE_KEY = "selectedInterviewDomain";
const QUESTION_COUNT_STORAGE_KEY = "selectedInterviewQuestionCount";
const INTERVIEW_HISTORY_KEY = "interviewHistory";
const INTERVIEW_DOMAINS = [
  "Frontend Developer",
  "Backend Developer",
  "Data Structures",
  "HR Interview",
  "System Design",
  "Employee Introduction",
];
const FILLER_WORD_PATTERN = /\b(um+|umm+|uh+|uhh+)\b/gi;
const MAX_INTERVIEW_HISTORY_ITEMS = 30;
const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0 },
};
const pageStagger = {
  hidden: {},
  show: {
    transition: {
      delayChildren: 0.04,
      staggerChildren: 0.08,
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

  const [parsedResume] = useState(() => parseStoredData(localStorage.getItem("parsedResume")));
  const [interviewId, setInterviewId] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [questionNumber, setQuestionNumber] = useState(0);
  const [answerText, setAnswerText] = useState("");
  const [answerMode, setAnswerMode] = useState("text");
  const [history, setHistory] = useState([]);
  const [lastResult, setLastResult] = useState(null);
  const [recording, setRecording] = useState(false);
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

  const answeredCount = history.length;
  const progressPercent =
    totalQuestions > 0 ? Math.min((answeredCount / totalQuestions) * 100, 100) : 0;
  const hasActiveQuestion = Boolean(interviewId && currentQuestion);
  const canSubmit = Boolean(answerText.trim()) && hasActiveQuestion && !isSubmitting;
  const interviewCompleted = Boolean(interviewId && !currentQuestion && answeredCount > 0);

  const releaseMicResources = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
  };

  const speakQuestion = (text = currentQuestion) => {
    if (!text) return;

    if (!("speechSynthesis" in window)) {
      setStatusMessage("Speech playback is not supported in this browser.");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (autoReadQuestion && currentQuestion) {
      speakQuestion(currentQuestion);
    }
  }, [autoReadQuestion, currentQuestion]);

  useEffect(() => {
    localStorage.setItem(DOMAIN_STORAGE_KEY, selectedDomain);
  }, [selectedDomain]);

  useEffect(() => {
    localStorage.setItem(QUESTION_COUNT_STORAGE_KEY, String(selectedQuestionCount));
  }, [selectedQuestionCount]);

  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }

      const activeRecorder = recorderRef.current;
      if (activeRecorder && activeRecorder.state !== "inactive") {
        activeRecorder.stop();
      }
      releaseMicResources();
    };
  }, []);

  const startInterview = async () => {
    if (!parsedResume) {
      setError("Upload and parse your resume before starting an interview.");
      return;
    }

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

      setInterviewId(response.data?.interviewId || "");
      setActiveInterviewDomain(activeDomain);
      setTotalQuestions(generatedCount);
      setCurrentQuestion(response.data?.question || "");
      setQuestionNumber(response.data?.question ? 1 : 0);
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

      if (response.data?.nextQuestion) {
        const nextQuestionNumber = Math.min(questionNumber + 1, totalQuestions);
        setCurrentQuestion(response.data.nextQuestion);
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

          const message = backendMessage || voiceError.message || "Voice processing failed.";
          setError(`Voice processing failed at ${endpoint}${status ? ` (${status})` : ""}: ${message}`);
        } finally {
          releaseMicResources();
        }
      };

      mediaRecorder.start();
      setRecording(true);
      setStatusMessage("Recording started. Click stop when you are done.");
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
                  onChange={(event) => setSelectedDomain(event.target.value)}
                  disabled={isStarting || isSubmitting || recording}
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
                  disabled={isStarting || isSubmitting || recording}
                />
                <p className="muted-copy domain-helper">
                  Choose between {MIN_QUESTION_COUNT} and {MAX_QUESTION_COUNT} questions.
                </p>
              </div>

              <div className="app-button-row">
                <button type="button" className="app-btn" onClick={startInterview} disabled={isStarting || isSubmitting || recording}>
                  {isStarting ? "Starting..." : interviewId ? "Restart Interview" : "Start Interview"}
                </button>

                <button
                  type="button"
                  className="app-btn secondary"
                  onClick={finishInterview}
                  disabled={!interviewId || !answeredCount || isFinishing || isSubmitting}
                >
                  {isFinishing ? "Finishing..." : "Finish Interview"}
                </button>
              </div>

              <AnimatePresence initial={false}>
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
                    <button type="button" className="app-btn ghost" onClick={() => speakQuestion()}>
                      Read Question
                    </button>
                    <label className="inline-toggle">
                      <input
                        type="checkbox"
                        checked={autoReadQuestion}
                        onChange={(event) => setAutoReadQuestion(event.target.checked)}
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
                      />
                      Text
                    </label>
                    <label>
                      <input
                        type="radio"
                        value="voice"
                        checked={answerMode === "voice"}
                        onChange={(event) => setAnswerMode(event.target.value)}
                      />
                      Voice
                    </label>
                  </div>

                  {answerMode === "voice" && (
                    <div className="app-button-row">
                      {!recording ? (
                        <button
                          type="button"
                          className="app-btn secondary"
                          onClick={startRecording}
                          disabled={isSubmitting}
                        >
                          Start Recording
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
                        />
                        Auto Submit Transcript
                      </label>
                    </div>
                  )}

                  <textarea
                    value={answerText}
                    onChange={(event) => setAnswerText(event.target.value)}
                    className="app-textarea"
                    rows={5}
                    placeholder="Type your answer here or record in voice mode."
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
                      disabled={!answerText}
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
