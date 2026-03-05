import { useEffect, useRef, useState } from "react";
import API from "../services/api";

function InterviewScreen({ parsedResume }) {
  const [question, setQuestion] = useState("");
  const [interviewId, setInterviewId] = useState("");
  const [recording, setRecording] = useState(false);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  const releaseMicResources = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
  };

  const startInterview = async () => {
    try {
      const res = await API.post("/interview/start", {
        parsedResume,
      });

      setInterviewId(res.data.interviewId);
      setQuestion(res.data.question);
    } catch (error) {
      alert(error.response?.data?.error || error.message || "Failed to start interview.");
    }
  };

  const speak = (text) => {
    if (!text || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (question) {
      speak(question);
    }
  }, [question]);

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      releaseMicResources();
    };
  }, []);

  const startRecording = async () => {
    if (!question || !interviewId) {
      alert("Start the interview first.");
      return;
    }

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
        alert("Recording failed. Please retry.");
        releaseMicResources();
      };

      mediaRecorder.onstop = async () => {
        try {
          const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
          if (!audioBlob.size) {
            alert("No audio captured. Please record again.");
            return;
          }

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
            alert("Transcription returned empty text. Please retry.");
            return;
          }

          const answerResponse = await API.post("/interview/answer", {
            interviewId,
            answer: transcript,
          });

          alert(`Score: ${answerResponse.data?.score ?? "N/A"}`);
          setQuestion(answerResponse.data?.nextQuestion || "");

          if (!answerResponse.data?.nextQuestion) {
            alert(answerResponse.data?.message || "Interview completed.");
          }
        } catch (error) {
          const status = error.response?.status;
          const endpoint = error.config?.url || "unknown-endpoint";
          const backendMessage = error.response?.data?.error;

          if (status === 404) {
            alert(
              `Voice endpoint not found (404) at ${endpoint}. Tried /test/stt and /interview/voice-answer.`
            );
            return;
          }

          const message = backendMessage || error.message || "Voice processing failed.";
          alert(`Voice processing failed at ${endpoint}${status ? ` (${status})` : ""}: ${message}`);
        } finally {
          releaseMicResources();
        }
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (error) {
      alert(error.response?.data?.error || error.message || "Microphone access denied.");
      releaseMicResources();
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  };

  return (
    <div>
      <h2>AI Interview</h2>

      {!question && (
        <button onClick={startInterview}>
          Start Interview
        </button>
      )}

      {question && (
        <>
          <h3>Question:</h3>
          <p>{question}</p>

          {!recording ? (
            <button onClick={startRecording}>
              Start Answering
            </button>
          ) : (
            <button onClick={stopRecording}>
              Stop Answering
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default InterviewScreen;
