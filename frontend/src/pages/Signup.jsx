import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import ThemeToggleButton from "../components/ThemeToggleButton";
import AuthProfileMenu from "../components/AuthProfileMenu";
import api from "../services/api";
import { getStoredUser, persistAuthSession, subscribeAuthChanges } from "../services/auth";

const SIGNUP_VIDEO_SOURCE = import.meta.env.VITE_SIGNUP_VIDEO_URL || "/signup-loop.mp4";
const MIN_PASSWORD_LENGTH = 8;

function getPasswordStrength(password) {
  let strengthScore = 0;

  if (password.length >= MIN_PASSWORD_LENGTH) strengthScore += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) strengthScore += 1;
  if (/\d/.test(password)) strengthScore += 1;
  if (/[^A-Za-z0-9]/.test(password)) strengthScore += 1;

  if (strengthScore <= 1) {
    return { label: "Weak", tone: "weak" };
  }

  if (strengthScore <= 3) {
    return { label: "Medium", tone: "medium" };
  }

  return { label: "Strong", tone: "strong" };
}

function getSafeRedirectPath(rawRedirect) {
  if (typeof rawRedirect !== "string") {
    return "";
  }

  const trimmedRedirect = rawRedirect.trim();
  if (!trimmedRedirect || !trimmedRedirect.startsWith("/")) {
    return "";
  }

  if (trimmedRedirect.startsWith("//")) {
    return "";
  }

  return trimmedRedirect;
}

function SignupPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const videoRef = useRef(null);
  const videoTrackRef = useRef(null);
  const initialMode = searchParams.get("mode") === "login" ? "login" : "register";
  const redirectPath = getSafeRedirectPath(searchParams.get("redirect"));
  const [authMode, setAuthMode] = useState(initialMode);
  const [formData, setFormData] = useState({
    name: "",
    usernameOrEmail: "",
    password: "",
    confirmPassword: "",
    rememberMe: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState(() => getStoredUser());

  useEffect(() => {
    const videoElement = videoRef.current;
    const videoTrackElement = videoTrackRef.current;

    if (!videoElement || !videoTrackElement || videoUnavailable) {
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
    const FRAME_WIDTH = 64;
    const FRAME_HEIGHT = 36;
    canvasElement.width = FRAME_WIDTH;
    canvasElement.height = FRAME_HEIGHT;

    const frameContext = canvasElement.getContext("2d", { willReadFrequently: true });
    if (!frameContext) {
      return undefined;
    }

    const MOTION_PIXEL_THRESHOLD = 20;
    const MOTION_SUM_THRESHOLD = 5200;
    const SAMPLE_INTERVAL_MS = 90;
    const MAX_ROTATE_X = 6.5;
    const MAX_ROTATE_Y = 8;

    let previousFrame = null;
    let animationFrameId = 0;
    let lastSampleTimestamp = 0;
    let smoothedRotateX = 0;
    let smoothedRotateY = 0;
    let analysisDisabled = false;

    const resetTilt = () => {
      videoTrackElement.style.setProperty("--video-tilt-x", "0deg");
      videoTrackElement.style.setProperty("--video-tilt-y", "0deg");
      videoTrackElement.style.setProperty("--video-tilt-scale", "1.05");
    };

    const applyTilt = () => {
      const dynamicScale =
        1.05 + Math.min(0.04, (Math.abs(smoothedRotateX) + Math.abs(smoothedRotateY)) * 0.0032);

      videoTrackElement.style.setProperty("--video-tilt-x", `${smoothedRotateX.toFixed(2)}deg`);
      videoTrackElement.style.setProperty("--video-tilt-y", `${smoothedRotateY.toFixed(2)}deg`);
      videoTrackElement.style.setProperty("--video-tilt-scale", dynamicScale.toFixed(3));
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
          smoothedRotateX *= 0.9;
          smoothedRotateY *= 0.9;
          applyTilt();
          return;
        }

        const motionCenterX = weightedXSum / motionWeightSum;
        const motionCenterY = weightedYSum / motionWeightSum;

        const normalizedX = ((motionCenterX / (FRAME_WIDTH - 1)) - 0.5) * 2;
        const normalizedY = ((motionCenterY / (FRAME_HEIGHT - 1)) - 0.5) * 2;

        const targetRotateX = -normalizedY * MAX_ROTATE_X;
        const targetRotateY = normalizedX * MAX_ROTATE_Y;

        smoothedRotateX = smoothedRotateX * 0.78 + targetRotateX * 0.22;
        smoothedRotateY = smoothedRotateY * 0.78 + targetRotateY * 0.22;

        applyTilt();
      } catch (_error) {
        analysisDisabled = true;
        resetTilt();
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
      resetTilt();
    };
  }, [videoUnavailable]);

  useEffect(() => {
    const modeFromQuery = searchParams.get("mode") === "login" ? "login" : "register";
    setAuthMode(modeFromQuery);
  }, [searchParams]);

  useEffect(() => {
    const rememberedIdentity = String(localStorage.getItem("prepai-remember-identity") || "");
    if (!rememberedIdentity) {
      return;
    }

    setFormData((currentFormData) => ({
      ...currentFormData,
      usernameOrEmail: currentFormData.usernameOrEmail || rememberedIdentity,
      rememberMe: true,
    }));
  }, []);

  useEffect(() => subscribeAuthChanges(() => setLoggedInUser(getStoredUser())), []);

  const passwordStrength = useMemo(
    () => getPasswordStrength(formData.password),
    [formData.password]
  );

  const updateField = (fieldName) => (event) => {
    const value = fieldName === "rememberMe" ? event.target.checked : event.target.value;
    setFormData((currentFormData) => ({
      ...currentFormData,
      [fieldName]: value,
    }));
  };

  const switchAuthMode = (nextMode) => {
    setAuthMode(nextMode);
    setError("");
    setSuccess("");
    setFormData((currentFormData) => ({
      ...currentFormData,
      password: "",
      confirmPassword: "",
    }));

    const nextParams = new URLSearchParams();
    if (nextMode === "login") {
      nextParams.set("mode", "login");
    }
    if (redirectPath) {
      nextParams.set("redirect", redirectPath);
    }

    setSearchParams(nextParams);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const trimmedName = formData.name.trim();
    const trimmedIdentifier = formData.usernameOrEmail.trim();

    if (!trimmedIdentifier || !formData.password) {
      setError("Please fill in all required fields.");
      return;
    }

    if (authMode === "register" && !trimmedName) {
      setError("Please provide your name to create an account.");
      return;
    }

    try {
      setIsSubmitting(true);

      let response;
      if (authMode === "login") {
        response = await api.post("/auth/login", {
          usernameOrEmail: trimmedIdentifier,
          password: formData.password,
        });
      } else {
        if (formData.password !== formData.confirmPassword) {
          setError("Password and confirm password do not match.");
          return;
        }

        if (formData.password.length < MIN_PASSWORD_LENGTH) {
          setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
          return;
        }

        response = await api.post("/auth/signup", {
          name: trimmedName,
          usernameOrEmail: trimmedIdentifier,
          password: formData.password,
          confirmPassword: formData.confirmPassword,
        });
      }

      const authToken = response?.data?.token;
      const createdUser = response?.data?.user;

      persistAuthSession(authToken, createdUser);
      setLoggedInUser(getStoredUser());

      if (formData.rememberMe) {
        window.localStorage.setItem("prepai-remember-identity", trimmedIdentifier);
      } else {
        window.localStorage.removeItem("prepai-remember-identity");
      }

      setSuccess(
        authMode === "login"
          ? `Login successful. Redirecting to ${redirectPath || "/resume"}...`
          : `Account created successfully. Redirecting to ${redirectPath || "/resume"}...`
      );
      setFormData((currentFormData) => ({
        ...currentFormData,
        password: "",
        confirmPassword: "",
      }));

      window.setTimeout(() => {
        navigate(redirectPath || "/resume");
      }, 900);
    } catch (requestError) {
      const message =
        requestError?.response?.data?.error ||
        requestError?.message ||
        "Unable to create account right now. Please try again.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="signup-shell">
      <div className="signup-orb signup-orb-a" aria-hidden="true" />
      <div className="signup-orb signup-orb-b" aria-hidden="true" />

      <nav className="home-navbar signup-navbar">
        <a href="/" className="home-brand" aria-label="PrepAI Home">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span className="brand-text">PrepAI</span>
        </a>

        <div className="home-menu">
          <Link to="/">Home</Link>
          <Link to="/resume">Practice</Link>
          <Link to="/report">Reports</Link>
        </div>

        <div className="nav-actions">
          <AuthProfileMenu />
          <ThemeToggleButton />
        </div>
      </nav>

      <main className="signup-main">
        <motion.section
          className="signup-layout"
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="signup-form-side">
            <header className="signup-header">
              <span className="signup-kicker">Join PrepAI</span>
              <h1>Create your account</h1>
              <p>
                Build your interview profile, practice smarter, and track progress with AI
                feedback.
              </p>
            </header>

            <div className="signup-mode-toggle" aria-label="Auth mode">
              <button
                type="button"
                className={authMode === "register" ? "active" : ""}
                onClick={() => switchAuthMode("register")}
              >
                Register
              </button>
              <button
                type="button"
                className={authMode === "login" ? "active" : ""}
                onClick={() => switchAuthMode("login")}
              >
                Login
              </button>
            </div>

            {loggedInUser ? (
              <p className="app-alert info">
                You are currently logged in as <strong>{loggedInUser.name || loggedInUser.email}</strong>.
              </p>
            ) : null}

            <div className="signup-socials" aria-hidden="true">
              <span>f</span>
              <span>G</span>
              <span>A</span>
            </div>

            <div className="signup-divider">
              <span />
              <p>or continue with email</p>
              <span />
            </div>

            <form className="signup-form" onSubmit={handleSubmit}>
              {authMode === "register" ? (
                <label className="signup-field">
                  <span>Full Name</span>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={updateField("name")}
                    placeholder="Robert Fox"
                    autoComplete="name"
                    required
                  />
                </label>
              ) : null}

              <label className="signup-field">
                <span>Username or Email</span>
                <input
                  type="text"
                  value={formData.usernameOrEmail}
                  onChange={updateField("usernameOrEmail")}
                  placeholder="robert.fox@gmail.com or robertfox"
                  autoComplete="username"
                  required
                />
              </label>

              <label className="signup-field">
                <div className="signup-label-row">
                  <span>Password</span>
                  {authMode === "register" ? (
                    <span className={`signup-strength ${passwordStrength.tone}`}>
                      {passwordStrength.label}
                    </span>
                  ) : null}
                </div>
                <div className="signup-password-input">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={updateField("password")}
                    placeholder="Enter password"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((currentValue) => !currentValue)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              {authMode === "register" ? (
                <label className="signup-field">
                  <span>Confirm Password</span>
                  <div className="signup-password-input">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={formData.confirmPassword}
                      onChange={updateField("confirmPassword")}
                      placeholder="Re-enter password"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((currentValue) => !currentValue)}
                    >
                      {showConfirmPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </label>
              ) : null}

              <label className="signup-remember">
                <input
                  type="checkbox"
                  checked={formData.rememberMe}
                  onChange={updateField("rememberMe")}
                />
                <span>Remember me</span>
              </label>

              <button type="submit" className="signup-submit" disabled={isSubmitting}>
                {isSubmitting
                  ? authMode === "login"
                    ? "Signing in..."
                    : "Creating account..."
                  : authMode === "login"
                    ? "Login"
                    : "Create Account"}
              </button>

              {error ? <p className="app-alert error">{error}</p> : null}
              {success ? <p className="app-alert success">{success}</p> : null}
            </form>
          </div>

          <div className={`signup-media-side${videoUnavailable ? " fallback" : ""}`}>
            <div className="signup-video-track" ref={videoTrackRef}>
              {!videoUnavailable ? (
                <video
                  ref={videoRef}
                  className="signup-video"
                  autoPlay
                  muted
                  loop
                  playsInline
                  onError={() => setVideoUnavailable(true)}
                >
                  <source src={SIGNUP_VIDEO_SOURCE} type="video/mp4" />
                </video>
              ) : null}

              <div className="signup-video-scrim" aria-hidden="true" />
            </div>

            <div className="signup-media-pill">Interview Ready Journeys</div>

            <div className="signup-media-panel">
              <h2>Your next interview starts here</h2>
              <p>
                Train with role-specific prompts, voice evaluation, and instant feedback
                confidence metrics.
              </p>
            </div>

            {videoUnavailable ? (
              <p className="signup-video-note">
                Add your loop video at <code>frontend/public/signup-loop.mp4</code> or set
                <code> VITE_SIGNUP_VIDEO_URL</code>.
              </p>
            ) : null}
          </div>
        </motion.section>
      </main>
    </div>
  );
}

export default SignupPage;
