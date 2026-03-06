import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import ThemeToggleButton from "../components/ThemeToggleButton";
import AuthProfileMenu from "../components/AuthProfileMenu";

const timelineSteps = [
  {
    icon: "PDF",
    title: "Upload Resume",
    description:
      "Upload your PDF resume and let PrepAI extract your core skills and experience context.",
  },
  {
    icon: "AI",
    title: "AI Generates",
    description:
      "Our AI instantly builds relevant technical questions tailored to your background.",
  },
  {
    icon: "MIC",
    title: "Voice Interview",
    description:
      "Answer naturally in voice mode while the system captures fluency, clarity, and confidence.",
  },
  {
    icon: "SCORE",
    title: "Get Score",
    description:
      "Receive final scoring with actionable feedback and a complete question-by-question report.",
  },
];

const useCaseCards = [
  {
    badge: "FR",
    title: "For Freshers",
    description:
      "Practice common entry-level interview rounds and build confidence before your first placement interviews.",
  },
  {
    badge: "DEV",
    title: "For Developers",
    description:
      "Train for role-specific technical discussions, system design prompts, and coding explanation questions.",
  },
  {
    badge: "MBA",
    title: "For MBA Students",
    description:
      "Prepare for case-style, leadership, and business communication interviews with structured feedback.",
  },
  {
    badge: "ENG",
    title: "For English Improvement",
    description:
      "Improve fluency, pacing, and spoken clarity while practicing real interview answers in English.",
  },
];

const demoQuestions = [
  "Tell me about a recent backend project where you improved API response time.",
  "How would you design a scalable interview evaluation pipeline for 10,000 users?",
  "Explain a bug you debugged in production and how you prevented it from recurring.",
];

const liveScoreSnapshots = [
  {
    score: 78,
    note: "Clarity improving +4",
    feedback: "Good structure. Add a stronger closing summary to your answer.",
  },
  {
    score: 84,
    note: "Technical depth +6",
    feedback: "Great technical detail. Slow down slightly to improve delivery pace.",
  },
  {
    score: 91,
    note: "Confidence peak +7",
    feedback: "Excellent confidence and precision. Keep this cadence for final rounds.",
  },
];

const waveformBars = [18, 26, 34, 22, 30, 38, 20, 32, 24, 36, 28, 18];

const TYPE_SPEED_MS = 48;
const ERASE_SPEED_MS = 28;
const QUESTION_HOLD_MS = 1350;
const SCORE_SWAP_MS = 2400;
const HERO_VIDEO_SOURCE = "/homepage.mp4";
const revealUp = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0 },
};
const revealStagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.08,
    },
  },
};
const revealViewport = { once: true, amount: 0.2 };

function Home() {
  const navigate = useNavigate();
  const heroVideoRef = useRef(null);
  const [typedQuestion, setTypedQuestion] = useState("");
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [isErasing, setIsErasing] = useState(false);
  const [activeScoreIndex, setActiveScoreIndex] = useState(0);
  const [heroVideoUnavailable, setHeroVideoUnavailable] = useState(false);

  useEffect(() => {
    const scoreTimerId = window.setInterval(() => {
      setActiveScoreIndex((currentIndex) => (currentIndex + 1) % liveScoreSnapshots.length);
    }, SCORE_SWAP_MS);

    return () => window.clearInterval(scoreTimerId);
  }, []);

  useEffect(() => {
    const targetQuestion = demoQuestions[activeQuestionIndex];
    const hasCompletedTyping = typedQuestion === targetQuestion;
    const hasClearedText = typedQuestion.length === 0;

    let typingDelay = TYPE_SPEED_MS;
    if (!isErasing && hasCompletedTyping) {
      typingDelay = QUESTION_HOLD_MS;
    } else if (isErasing) {
      typingDelay = ERASE_SPEED_MS;
    }

    const typingTimerId = window.setTimeout(() => {
      if (!isErasing) {
        if (hasCompletedTyping) {
          setIsErasing(true);
          return;
        }

        setTypedQuestion(targetQuestion.slice(0, typedQuestion.length + 1));
        return;
      }

      if (hasClearedText) {
        setIsErasing(false);
        setActiveQuestionIndex((currentIndex) => (currentIndex + 1) % demoQuestions.length);
        return;
      }

      setTypedQuestion((currentQuestion) => currentQuestion.slice(0, -1));
    }, typingDelay);

    return () => window.clearTimeout(typingTimerId);
  }, [activeQuestionIndex, isErasing, typedQuestion]);

  useEffect(() => {
    const videoElement = heroVideoRef.current;

    if (!videoElement || heroVideoUnavailable) {
      return undefined;
    }

    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return undefined;
    }

    const canvasElement = document.createElement("canvas");
    const FRAME_WIDTH = 72;
    const FRAME_HEIGHT = 40;
    canvasElement.width = FRAME_WIDTH;
    canvasElement.height = FRAME_HEIGHT;

    const frameContext = canvasElement.getContext("2d", { willReadFrequently: true });
    if (!frameContext) {
      return undefined;
    }

    const MOTION_PIXEL_THRESHOLD = 18;
    const MOTION_SUM_THRESHOLD = 5000;
    const SAMPLE_INTERVAL_MS = 85;
    const MIN_FOCUS_X = 22;
    const MAX_FOCUS_X = 78;
    const MIN_FOCUS_Y = 20;
    const MAX_FOCUS_Y = 80;

    let previousFrame = null;
    let animationFrameId = 0;
    let lastSampleTimestamp = 0;
    let smoothedFocusX = 50;
    let smoothedFocusY = 50;
    let analysisDisabled = false;

    const applyFocus = () => {
      videoElement.style.setProperty("--hero-video-focus-x", `${smoothedFocusX.toFixed(1)}%`);
      videoElement.style.setProperty("--hero-video-focus-y", `${smoothedFocusY.toFixed(1)}%`);
    };

    const resetFocus = () => {
      smoothedFocusX = 50;
      smoothedFocusY = 50;
      applyFocus();
    };

    const animate = (timestamp) => {
      animationFrameId = window.requestAnimationFrame(animate);

      if (
        analysisDisabled ||
        videoElement.readyState < 2 ||
        videoElement.paused ||
        videoElement.ended ||
        timestamp - lastSampleTimestamp < SAMPLE_INTERVAL_MS
      ) {
        return;
      }

      lastSampleTimestamp = timestamp;

      try {
        frameContext.drawImage(videoElement, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
        const currentFrameData = frameContext.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT).data;

        if (!previousFrame) {
          previousFrame = new Uint8ClampedArray(currentFrameData);
          return;
        }

        let motionWeightSum = 0;
        let weightedXSum = 0;
        let weightedYSum = 0;

        for (let pixelOffset = 0; pixelOffset < currentFrameData.length; pixelOffset += 4) {
          const redDiff = Math.abs(currentFrameData[pixelOffset] - previousFrame[pixelOffset]);
          const greenDiff = Math.abs(
            currentFrameData[pixelOffset + 1] - previousFrame[pixelOffset + 1]
          );
          const blueDiff = Math.abs(
            currentFrameData[pixelOffset + 2] - previousFrame[pixelOffset + 2]
          );
          const diffStrength = (redDiff + greenDiff + blueDiff) / 3;

          if (diffStrength < MOTION_PIXEL_THRESHOLD) {
            continue;
          }

          const pixelIndex = pixelOffset / 4;
          const pixelX = pixelIndex % FRAME_WIDTH;
          const pixelY = Math.floor(pixelIndex / FRAME_WIDTH);

          motionWeightSum += diffStrength;
          weightedXSum += pixelX * diffStrength;
          weightedYSum += pixelY * diffStrength;
        }

        previousFrame.set(currentFrameData);

        if (motionWeightSum < MOTION_SUM_THRESHOLD) {
          smoothedFocusX = smoothedFocusX * 0.9 + 50 * 0.1;
          smoothedFocusY = smoothedFocusY * 0.9 + 50 * 0.1;
          applyFocus();
          return;
        }

        const motionCenterX = weightedXSum / motionWeightSum;
        const motionCenterY = weightedYSum / motionWeightSum;

        const normalizedX = ((motionCenterX / (FRAME_WIDTH - 1)) - 0.5) * 2;
        const normalizedY = ((motionCenterY / (FRAME_HEIGHT - 1)) - 0.5) * 2;

        const targetFocusX = Math.max(
          MIN_FOCUS_X,
          Math.min(MAX_FOCUS_X, 50 + normalizedX * 28)
        );
        const targetFocusY = Math.max(
          MIN_FOCUS_Y,
          Math.min(MAX_FOCUS_Y, 50 + normalizedY * 28)
        );

        smoothedFocusX = smoothedFocusX * 0.76 + targetFocusX * 0.24;
        smoothedFocusY = smoothedFocusY * 0.76 + targetFocusY * 0.24;

        applyFocus();
      } catch (_error) {
        analysisDisabled = true;
        resetFocus();
      }
    };

    const startAnimation = () => {
      if (animationFrameId) {
        return;
      }

      animationFrameId = window.requestAnimationFrame(animate);
    };

    const stopAnimation = () => {
      if (!animationFrameId) {
        return;
      }

      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
    };

    const handlePlay = () => startAnimation();
    const handlePause = () => stopAnimation();

    videoElement.addEventListener("play", handlePlay);
    videoElement.addEventListener("pause", handlePause);
    videoElement.addEventListener("ended", handlePause);

    if (!videoElement.paused && !videoElement.ended) {
      startAnimation();
    }

    return () => {
      stopAnimation();
      videoElement.removeEventListener("play", handlePlay);
      videoElement.removeEventListener("pause", handlePause);
      videoElement.removeEventListener("ended", handlePause);
      resetFocus();
    };
  }, [heroVideoUnavailable]);

  const activeScore = liveScoreSnapshots[activeScoreIndex];

  return (
    <div className="home-shell">
      <div className="home-orb-layer" aria-hidden="true">
        <div className="absolute w-96 h-96 bg-indigo-300 opacity-30 rounded-full blur-3xl"></div>
        <span className="home-orb orb-a" />
        <span className="home-orb orb-b" />
        <span className="home-orb orb-c" />
      </div>

      <nav className="home-navbar">
        <a href="/" className="home-brand" aria-label="PrepAI Home">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span className="brand-text">PrepAI</span>
        </a>

        <div className="home-menu">
          <a href="#hero">Home</a>
          <a href="#features">Features</a>
          <Link to="/report">Reports</Link>
          <Link to="/resume">Practice</Link>
        </div>

        <div className="nav-actions">
          <AuthProfileMenu />
          <ThemeToggleButton />
        </div>
      </nav>

      <main>
        <motion.section
          id="hero"
          className="hero-wrap"
          variants={revealStagger}
          initial="hidden"
          whileInView="show"
          viewport={revealViewport}
        >
          <motion.div className="hero-copy home-fade-up" variants={revealUp}>
            <h1 className="hero-title">
              AI Mock <strong>Job Interview</strong> <strong>Practice</strong> in English
            </h1>

            <p className="hero-lead">
              Get ready for your next interview with an AI coach that gives real-time
              feedback on answers, grammar, fluency, and confidence.
            </p>

            <div className="hero-actions">
              <button
                type="button"
                onClick={() => navigate("/resume")}
                className="hero-cta"
              >
                Start a Free Mock Interview <span aria-hidden="true">-&gt;</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  window.scrollTo({ top: window.innerHeight, behavior: "smooth" })
                }
                className="hero-secondary"
              >
                See how it works
              </button>
            </div>
          </motion.div>

          <motion.div className="hero-visual home-fade-in-right" variants={revealUp}>
            <div className="hero-glow" aria-hidden="true" />
            <div className="hero-ring ring-outer" aria-hidden="true" />
            <div className="hero-ring ring-middle" aria-hidden="true" />
            <div className="hero-ring ring-inner" aria-hidden="true" />

            <div className="hero-photo-shell">
              {!heroVideoUnavailable ? (
                <video
                  ref={heroVideoRef}
                  className="hero-photo hero-photo-video"
                  autoPlay
                  muted
                  loop
                  playsInline
                  onError={() => setHeroVideoUnavailable(true)}
                >
                  <source src={HERO_VIDEO_SOURCE} type="video/mp4" />
                </video>
              ) : (
                <img
                  src="https://images.unsplash.com/photo-1603415526960-f7e0328c63b1?auto=format&fit=crop&w=900&q=80"
                  alt="Candidate practicing an interview"
                  className="hero-photo"
                />
              )}
            </div>

            <article className="hero-card hero-metric">
              <p className="card-label">Live interview score</p>
              <p key={`score-${activeScore.score}`} className="card-value card-value-animated">
                {activeScore.score} <span>/100</span>
              </p>
              <p key={`trend-${activeScore.note}`} className="card-trend card-trend-animated">
                {activeScore.note}
              </p>
            </article>

            <article className="hero-card hero-demo">
              <p className="card-label">Live question typing</p>
              <p className="typed-question">
                {typedQuestion}
                <span className="typing-caret" aria-hidden="true" />
              </p>

              <div className="voice-wave-meta">
                <span className="wave-title">Voice waveform</span>
                <span className="wave-status">Listening</span>
              </div>

              <div className="voice-wave" aria-hidden="true">
                {waveformBars.map((barHeight, index) => (
                  <span
                    key={`wave-${index}`}
                    style={{
                      "--bar-size": `${barHeight}px`,
                      animationDelay: `${index * 85}ms`,
                    }}
                  />
                ))}
              </div>
            </article>

            <article className="hero-card hero-feedback">
              <p className="card-title">AI hiring feedback</p>
              <p key={`feedback-${activeScore.feedback}`} className="card-message card-message-animated">
                {activeScore.feedback}
              </p>
            </article>
          </motion.div>
        </motion.section>

        <motion.section
          className="home-social-proof"
          aria-label="Social proof"
          variants={revealUp}
          initial="hidden"
          whileInView="show"
          viewport={revealViewport}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="social-proof-shell home-fade-up">
            <p className="social-proof-kicker">Social Proof</p>
            <p className="social-proof-line">Trusted by 2,000+ students</p>
            <p className="social-proof-line social-proof-rating">
              <span className="rating-stars" aria-hidden="true">★★★★★</span>
              <span>4.8/5 rating</span>
            </p>
          </div>
        </motion.section>

        <motion.section
          id="features"
          className="home-features"
          variants={revealStagger}
          initial="hidden"
          whileInView="show"
          viewport={revealViewport}
        >
          <motion.h2 variants={revealUp}>How It Works</motion.h2>
          <div className="timeline-track">
            {timelineSteps.map((step, index) => (
              <motion.article key={step.title} className="timeline-step" variants={revealUp}>
                <div className="timeline-icon-wrap" aria-hidden="true">
                  <span className="timeline-node" />
                  <span className="timeline-icon">
                    {step.icon}
                  </span>
                </div>
                <span className="timeline-index">{`0${index + 1}`}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </motion.article>
            ))}
          </div>
        </motion.section>

        <motion.section
          className="home-use-cases"
          variants={revealStagger}
          initial="hidden"
          whileInView="show"
          viewport={revealViewport}
        >
          <motion.h2 variants={revealUp}>Real Use Cases</motion.h2>
          <div className="use-case-grid">
            {useCaseCards.map((useCase) => (
              <motion.article key={useCase.title} className="use-case-card" variants={revealUp}>
                <span className="use-case-badge">{useCase.badge}</span>
                <h3>{useCase.title}</h3>
                <p>{useCase.description}</p>
              </motion.article>
            ))}
          </div>
        </motion.section>
      </main>

      <footer className="home-footer">2026 PrepAI | AI Interview Practice Platform</footer>
    </div>
  );
}

export default Home;
