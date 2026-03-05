import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import ThemeToggleButton from "../components/ThemeToggleButton";
import api from "../services/api";

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

function SignupPage() {
  const navigate = useNavigate();
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const trimmedName = formData.name.trim();
    const trimmedIdentifier = formData.usernameOrEmail.trim();

    if (!trimmedName || !trimmedIdentifier || !formData.password || !formData.confirmPassword) {
      setError("Please fill in all required fields.");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Password and confirm password do not match.");
      return;
    }

    if (formData.password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await api.post("/auth/signup", {
        name: trimmedName,
        usernameOrEmail: trimmedIdentifier,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
      });

      const authToken = response?.data?.token;
      const createdUser = response?.data?.user;

      if (authToken) {
        window.localStorage.setItem("prepai-auth-token", authToken);
      }

      if (createdUser) {
        window.localStorage.setItem("prepai-user", JSON.stringify(createdUser));
      }

      if (formData.rememberMe) {
        window.localStorage.setItem("prepai-remember-identity", trimmedIdentifier);
      } else {
        window.localStorage.removeItem("prepai-remember-identity");
      }

      setSuccess("Account created successfully. Redirecting to resume upload...");
      setFormData((currentFormData) => ({
        ...currentFormData,
        password: "",
        confirmPassword: "",
      }));

      window.setTimeout(() => {
        navigate("/resume");
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
              <button type="button" className="active">
                Register
              </button>
              <a href="/">Login</a>
            </div>

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
                  <span className={`signup-strength ${passwordStrength.tone}`}>
                    {passwordStrength.label}
                  </span>
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

              <label className="signup-remember">
                <input
                  type="checkbox"
                  checked={formData.rememberMe}
                  onChange={updateField("rememberMe")}
                />
                <span>Remember me</span>
              </label>

              <button type="submit" className="signup-submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating account..." : "Create Account"}
              </button>

              {error ? <p className="app-alert error">{error}</p> : null}
              {success ? <p className="app-alert success">{success}</p> : null}
            </form>
          </div>

          <div className={`signup-media-side${videoUnavailable ? " fallback" : ""}`}>
            {!videoUnavailable ? (
              <video
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
