import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../services/api";

const TOTAL_QUESTIONS = 5;

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

  const answeredCount = history.length;
  const progressPercent = Math.min((answeredCount / TOTAL_QUESTIONS) * 100, 100);
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
    setInterviewId("");
    setCurrentQuestion("");
    setQuestionNumber(0);
    localStorage.removeItem("finalResult");

    try {
      const response = await API.post("/interview/start", { parsedResume });

      setInterviewId(response.data?.interviewId || "");
      setCurrentQuestion(response.data?.question || "");
      setQuestionNumber(response.data?.question ? 1 : 0);
      setStatusMessage("Interview started. Submit your answer to move to the next question.");
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

  const submitAnswer = async (overrideAnswer) => {
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

      const result = {
        question: response.data?.question || currentQuestion,
        answer: response.data?.answer || finalAnswer,
        score: Number(response.data?.score ?? 0),
        evaluation: response.data?.evaluation || "",
      };

      setHistory((prev) => [...prev, result]);
      setLastResult(result);
      setAnswerText("");

      if (response.data?.nextQuestion) {
        const nextQuestionNumber = Math.min(questionNumber + 1, TOTAL_QUESTIONS);
        setCurrentQuestion(response.data.nextQuestion);
        setQuestionNumber(nextQuestionNumber);
        setStatusMessage(`Answer saved. Continue with question ${nextQuestionNumber}.`);
      } else {
        setCurrentQuestion("");
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
      const finalResult = {
        ...response.data,
        interviewId,
        answeredQuestions: history.length || response.data?.detailedResponses?.length || 0,
        completedAt: new Date().toISOString(),
      };

      localStorage.setItem("finalResult", JSON.stringify(finalResult));
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

          const sttResponse = await API.post("/test/stt", formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });

          const transcript = String(sttResponse.data?.transcript || "").trim();
          if (!transcript) {
            setError("Transcription returned empty text. Please retry.");
            return;
          }

          setAnswerText(transcript);
          setStatusMessage("Voice answer converted to text.");

          if (autoSubmitVoice) {
            await submitAnswer(transcript);
          }
        } catch (voiceError) {
          const message =
            voiceError.response?.data?.error ||
            voiceError.message ||
            "Voice processing failed.";
          setError(message);
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
        <div className="home-brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span className="brand-text">PrepAI</span>
        </div>

        <div className="home-menu">
          <Link to="/">Home</Link>
          <Link to="/resume">Resume</Link>
          <Link to="/interview">Interview</Link>
          <Link to="/report">Report</Link>
        </div>

        <button type="button" className="home-signin" onClick={() => navigate("/report")}>
          Open Report
        </button>
      </nav>

      <main className="app-page">
        <section className="app-page-header home-fade-up">
          <p className="app-kicker">Step 2</p>
          <h1>Interview Practice</h1>
          <p>
            Answer five AI-generated technical questions. Use text mode or voice mode with
            speech-to-text transcription.
          </p>
        </section>

        {!parsedResume && (
          <section className="single-card-wrap home-fade-up">
            <article className="glass-card">
              <h2>Resume Not Found</h2>
              <p className="muted-copy">
                Upload and parse a resume first, then start your interview session.
              </p>
              <div className="app-button-row">
                <button type="button" className="app-btn" onClick={() => navigate("/resume")}>
                  Go To Resume Upload
                </button>
              </div>
            </article>
          </section>
        )}

        {!!parsedResume && (
          <section className="app-grid interview-layout home-fade-up">
            <article className="glass-card">
              <div className="title-row">
                <h2>Session Controls</h2>
                <span className="status-pill">
                  {interviewId
                    ? `Q${Math.max(questionNumber, 1)} / ${TOTAL_QUESTIONS}`
                    : "Not Started"}
                </span>
              </div>

              <div className="progress-track">
                <div style={{ width: `${progressPercent}%` }} />
              </div>

              <p className="muted-copy">
                Answered {answeredCount} of {TOTAL_QUESTIONS} questions.
              </p>

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

              {hasActiveQuestion && (
                <div className="question-shell">
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
                </div>
              )}

              {interviewCompleted && (
                <p className="app-alert success">
                  All questions were answered. Click "Finish Interview" to generate your report.
                </p>
              )}

              {statusMessage && <p className="app-alert info">{statusMessage}</p>}
              {error && <p className="app-alert error">{error}</p>}

              {lastResult && (
                <div className="inline-eval-card">
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
                </div>
              )}
            </article>

            <article className="glass-card">
              <h2>Answer History</h2>
              {!history.length && (
                <p className="muted-copy">Submitted answers and scores will appear here.</p>
              )}

              {!!history.length && (
                <div className="history-list">
                  {history.map((item, index) => (
                    <div key={`${item.question}-${index}`} className="history-item">
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
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>
        )}
      </main>
    </div>
  );
}

export default InterviewPage;
