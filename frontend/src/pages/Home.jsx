import { Link, useNavigate } from "react-router-dom";

const featureCards = [
  {
    icon: "R",
    title: "Resume Upload + Parsing",
    description:
      "Multer stores the resume, pdf-parse extracts text, then Gemini structures skills, projects, experience, and education.",
  },
  {
    icon: "Q",
    title: "Interview Question Engine",
    description:
      "Generates exactly five technical questions from parsed resume context using the AI service layer.",
  },
  {
    icon: "E",
    title: "Answer Evaluation API",
    description:
      "Evaluates each answer for correctness, clarity, and confidence, then stores score and feedback per response.",
  },
  {
    icon: "F",
    title: "Final Score Aggregation",
    description:
      "Computes average score from saved responses and returns final feedback plus full detailed response history.",
  },
  {
    icon: "S",
    title: "Speech-to-Text Test Route",
    description:
      "Uploads webm audio and transcribes speech through Gemini for voice-mode validation and backend testing.",
  },
];

function Home() {
  const navigate = useNavigate();

  return (
    <div className="home-shell">
      <nav className="home-navbar">
        <div className="home-brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span className="brand-text">PrepAI</span>
        </div>

        <div className="home-menu">
          <a href="#hero">Home</a>
          <a href="#features">Features</a>
          <Link to="/report">Reports</Link>
          <Link to="/resume">Practice</Link>
        </div>

        <button
          type="button"
          onClick={() => navigate("/resume")}
          className="home-signin"
        >
          Sign In
        </button>
      </nav>

      <main>
        <section id="hero" className="hero-wrap">
          <div className="hero-copy home-fade-up">
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
          </div>

          <div className="hero-visual home-fade-in-right">
            <div className="hero-glow" aria-hidden="true" />
            <div className="hero-ring ring-outer" aria-hidden="true" />
            <div className="hero-ring ring-middle" aria-hidden="true" />
            <div className="hero-ring ring-inner" aria-hidden="true" />

            <div className="hero-photo-shell">
              <img
                src="https://images.unsplash.com/photo-1603415526960-f7e0328c63b1?auto=format&fit=crop&w=900&q=80"
                alt="Candidate practicing an interview"
                className="hero-photo"
              />
            </div>

            <article className="hero-card hero-metric">
              <p className="card-label">Speed of speech</p>
              <p className="card-value">
                126 <span>WPM</span>
              </p>
            </article>

            <article className="hero-card hero-feedback">
              <p className="card-title">AI hiring feedback</p>
              <p className="card-message">
                Work on fluency in speech and clarity in your answers.
              </p>
            </article>
          </div>
        </section>

        <section id="features" className="home-features">
          <h2>Why candidates choose PrepAI</h2>
          <div className="feature-grid">
            {featureCards.map((feature) => (
              <article key={feature.title} className="feature-card">
                <div className="feature-icon" aria-hidden="true">
                  {feature.icon}
                </div>
                <h3>{feature.title}</h3>
                <p className="feature-meta">{feature.meta}</p>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="home-footer">2026 PrepAI | AI Interview Practice Platform</footer>
    </div>
  );
}

export default Home;
