import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import API from "../services/api";
import ThemeToggleButton from "../components/ThemeToggleButton";

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

function parseResumePayload(rawValue) {
  if (!rawValue) return null;

  if (typeof rawValue === "object") {
    return rawValue;
  }

  if (typeof rawValue !== "string") {
    return null;
  }

  const cleaned = rawValue.replace(/```json|```/gi, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (_error) {
    return { rawText: cleaned };
  }
}

function getSectionValue(parsedResume, key) {
  if (!parsedResume || typeof parsedResume !== "object") return null;

  const keyVariants = [key, key.toLowerCase(), key.toUpperCase()];
  const titleCase = key.charAt(0).toUpperCase() + key.slice(1);
  keyVariants.push(titleCase);

  for (const name of keyVariants) {
    if (Object.prototype.hasOwnProperty.call(parsedResume, name)) {
      return parsedResume[name];
    }
  }

  return null;
}

function sectionToItems(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n+/)
      .map((item) => item.replace(/^\s*[-*]\s*/, "").replace(/^\s*\d+[.)]\s*/, "").trim())
      .filter(Boolean);
  }

  if (typeof value === "object") {
    return Object.entries(value).map(([label, item]) => {
      if (typeof item === "string") return `${label}: ${item}`;
      return `${label}: ${JSON.stringify(item)}`;
    });
  }

  return [];
}

function ResumePage() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [parsedResume, setParsedResume] = useState(() => {
    const saved = localStorage.getItem("parsedResume");
    if (!saved) return null;

    try {
      return parseResumePayload(JSON.parse(saved));
    } catch (_error) {
      return parseResumePayload(saved);
    }
  });

  const parsedSections = useMemo(() => {
    if (!parsedResume || typeof parsedResume !== "object" || parsedResume.rawText) {
      return [];
    }

    return [
      {
        title: "Skills",
        items: sectionToItems(getSectionValue(parsedResume, "skills")),
      },
      {
        title: "Projects",
        items: sectionToItems(getSectionValue(parsedResume, "projects")),
      },
      {
        title: "Experience",
        items: sectionToItems(getSectionValue(parsedResume, "experience")),
      },
      {
        title: "Education",
        items: sectionToItems(getSectionValue(parsedResume, "education")),
      },
    ].filter((section) => section.items.length);
  }, [parsedResume]);

  const handleFileSelect = (event) => {
    const selectedFile = event.target.files?.[0];
    setError("");
    setSuccess("");

    if (!selectedFile) {
      setFile(null);
      return;
    }

    const isPdf =
      selectedFile.type === "application/pdf" ||
      selectedFile.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      setFile(null);
      setError("Only PDF resumes are supported.");
      return;
    }

    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Select a PDF resume before uploading.");
      return;
    }

    setUploading(true);
    setError("");
    setSuccess("");

    try {
      const formData = new FormData();
      formData.append("resume", file);

      const response = await API.post("/resume/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const normalized = parseResumePayload(response.data?.parsedData);
      if (!normalized) {
        throw new Error("Resume data could not be parsed.");
      }

      localStorage.setItem("parsedResume", JSON.stringify(normalized));
      localStorage.removeItem("finalResult");
      setParsedResume(normalized);
      setSuccess(
        response.data?.warning
          ? `Resume uploaded successfully. ${response.data.warning}`
          : "Resume uploaded and parsed successfully."
      );
    } catch (uploadError) {
      const message =
        uploadError.response?.data?.error ||
        uploadError.message ||
        "Resume upload failed. Please try again.";
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setError("");
    setSuccess("");
    setParsedResume(null);
    localStorage.removeItem("parsedResume");
    localStorage.removeItem("finalResult");
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

        <div className="nav-actions">
          <button type="button" className="home-signin" onClick={() => navigate("/interview")}>
            Go To Interview
          </button>
          <ThemeToggleButton />
        </div>
      </nav>

      <main className="app-page">
        <motion.section
          className="app-page-header home-fade-up"
          variants={revealUp}
          initial="hidden"
          whileInView="show"
          viewport={revealViewport}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <p className="app-kicker">Step 1</p>
          <h1>Upload Your Resume</h1>
          <p>
            Upload a PDF, let PrepAI parse your profile, then continue to your interview flow.
          </p>
        </motion.section>

        <motion.section
          className="app-grid home-fade-up"
          variants={revealStagger}
          initial="hidden"
          whileInView="show"
          viewport={revealViewport}
        >
          <motion.article className="glass-card" variants={revealUp}>
            <h2>Resume File</h2>
            <p className="muted-copy">
              Use a clean PDF format for best extraction quality. A new upload replaces previous data.
            </p>

            <label className="app-file-picker" htmlFor="resume-file">
              <span>{file ? file.name : "Choose a PDF resume"}</span>
              <input id="resume-file" type="file" accept=".pdf,application/pdf" onChange={handleFileSelect} />
            </label>

            <div className="app-button-row">
              <button type="button" className="app-btn" onClick={handleUpload} disabled={uploading}>
                {uploading ? "Uploading..." : "Upload Resume"}
              </button>
              <button type="button" className="app-btn secondary" onClick={() => navigate("/interview")} disabled={!parsedResume}>
                Continue
              </button>
              <button type="button" className="app-btn ghost" onClick={handleReset}>
                Reset
              </button>
            </div>

            {error && <p className="app-alert error">{error}</p>}
            {success && <p className="app-alert success">{success}</p>}
          </motion.article>

          <motion.article className="glass-card" variants={revealUp}>
            <h2>Parsed Resume Preview</h2>
            {!parsedResume && <p className="muted-copy">No parsed resume found yet. Upload a file to see extracted details.</p>}

            {parsedResume?.rawText && (
              <pre className="app-previewer">{parsedResume.rawText}</pre>
            )}

            {!!parsedSections.length && (
              <div className="resume-preview-list">
                {parsedSections.map((section) => (
                  <div key={section.title} className="resume-preview-section">
                    <h3>{section.title}</h3>
                    <ul>
                      {section.items.map((item, index) => (
                        <li key={`${section.title}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </motion.article>
        </motion.section>
      </main>
    </div>
  );
}

export default ResumePage;
