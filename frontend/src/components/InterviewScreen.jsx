import { useState, useEffect } from "react";
import API from "../services/api";

function InterviewScreen({ parsedResume }) {
  const [question, setQuestion] = useState("");
  const [interviewId, setInterviewId] = useState("");
  const [recording, setRecording] = useState(false);

  let mediaRecorder;
  let audioChunks = [];

  // 🎯 Start Interview
  const startInterview = async () => {
    const res = await API.post("/interview/start", {
      parsedResume,
    });

    setInterviewId(res.data.interviewId);
    setQuestion(res.data.question);
  };

  // 🔊 Speak Question (FREE TTS)
  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (question) {
      speak(question);
    }
  }, [question]);

  // 🎤 Start Recording
  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    mediaRecorder.start();
    setRecording(true);
  };

  // 🎤 Stop Recording
  const stopRecording = () => {
    mediaRecorder.stop();

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });

      const formData = new FormData();
      formData.append("audio", audioBlob);
      formData.append("interviewId", interviewId);

      const res = await API.post(
        "/interview/voice-answer",
        formData
      );

      alert("Score: " + res.data.evaluation.overallScore);
      setRecording(false);
      audioChunks = [];
    };
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