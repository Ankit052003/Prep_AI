import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";

function parseStoredResult() {
  const saved = localStorage.getItem("finalResult");
  if (!saved) return null;

  try {
    return JSON.parse(saved);
  } catch (_error) {
    return null;
  }
}

function normalizeResult(rawResult) {
  if (!rawResult) return null;

  if (
    Object.prototype.hasOwnProperty.call(rawResult, "finalScore") ||
    Object.prototype.hasOwnProperty.call(rawResult, "feedback") ||
    Array.isArray(rawResult.detailedResponses)
  ) {
    return {
      finalScore: Number(rawResult.finalScore ?? 0),
      feedback: rawResult.feedback || rawResult.finalFeedback || "No final feedback returned.",
      detailedResponses: Array.isArray(rawResult.detailedResponses)
        ? rawResult.detailedResponses
        : [],
      answeredQuestions: rawResult.answeredQuestions,
      completedAt: rawResult.completedAt,
    };
  }

  if (rawResult.evaluation) {
    const evaluation = rawResult.evaluation;
    const feedbackParts = [
      evaluation.strengths ? `Strengths: ${evaluation.strengths}` : "",
      evaluation.weaknesses ? `Weaknesses: ${evaluation.weaknesses}` : "",
      evaluation.improvementSuggestions
        ? `Improvements: ${evaluation.improvementSuggestions}`
        : "",
    ].filter(Boolean);

    return {
      finalScore: Number(evaluation.overallScore ?? 0),
      feedback: feedbackParts.join(" | ") || "Evaluation summary available.",
      detailedResponses: Array.isArray(rawResult.detailedResponses)
        ? rawResult.detailedResponses
        : [],
      answeredQuestions: rawResult.answeredQuestions,
      completedAt: rawResult.completedAt,
    };
  }

  return null;
}

function scoreBand(score) {
  if (score >= 7) return "good";
  if (score >= 5) return "mid";
  return "low";
}

function ReportPage() {
  const navigate = useNavigate();
  const report = useMemo(() => normalizeResult(parseStoredResult()), []);

  const score = Number.isFinite(report?.finalScore) ? report.finalScore : 0;
  const responses = report?.detailedResponses || [];
  const answeredCount = report?.answeredQuestions || responses.length;
  const scorePercent = Math.max(0, Math.min(score * 10, 100));

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

        <button type="button" className="home-signin" onClick={() => navigate("/interview")}>
          Retake
        </button>
      </nav>

      <main className="app-page">
        <section className="app-page-header home-fade-up">
          <p className="app-kicker">Step 3</p>
          <h1>Interview Report</h1>
          <p>Review your final score, AI feedback, and answer-by-answer evaluation details.</p>
        </section>

        {!report && (
          <section className="single-card-wrap home-fade-up">
            <article className="glass-card">
              <h2>No Report Found</h2>
              <p className="muted-copy">
                Complete an interview session first to generate report analytics.
              </p>
              <div className="app-button-row">
                <button type="button" className="app-btn" onClick={() => navigate("/resume")}>
                  Upload Resume
                </button>
                <button
                  type="button"
                  className="app-btn secondary"
                  onClick={() => navigate("/interview")}
                >
                  Go To Interview
                </button>
              </div>
            </article>
          </section>
        )}

        {!!report && (
          <section className="app-grid report-layout home-fade-up">
            <article className="glass-card">
              <div className="title-row">
                <h2>Overall Score</h2>
                <span className={`score-chip ${scoreBand(score)}`}>{score.toFixed(1)} / 10</span>
              </div>

              <div className="progress-track report-progress">
                <div style={{ width: `${scorePercent}%` }} />
              </div>

              <p className="muted-copy">
                Answered {answeredCount} {answeredCount === 1 ? "question" : "questions"}.
              </p>

              {report.completedAt && (
                <p className="muted-copy">
                  Completed: {new Date(report.completedAt).toLocaleString()}
                </p>
              )}

              <div className="app-feedback-box">
                <h3>Final Feedback</h3>
                <p>{report.feedback || "No final feedback returned from backend."}</p>
              </div>

              <div className="app-button-row">
                <button type="button" className="app-btn" onClick={() => navigate("/interview")}>
                  Retake Interview
                </button>
                <button type="button" className="app-btn secondary" onClick={() => navigate("/resume")}>
                  Upload New Resume
                </button>
              </div>
            </article>

            <article className="glass-card">
              <h2>Detailed Responses</h2>
              {!responses.length && (
                <p className="muted-copy">
                  No per-question breakdown was returned for this report.
                </p>
              )}

              {!!responses.length && (
                <div className="history-list">
                  {responses.map((response, index) => (
                    <div key={`${response.question}-${index}`} className="history-item">
                      <div className="title-row">
                        <p className="history-question">
                          <strong>Q{index + 1}:</strong> {response.question}
                        </p>
                        <span className={`score-chip ${scoreBand(Number(response.score || 0))}`}>
                          {Number(response.score || 0)}/10
                        </span>
                      </div>
                      <p className="history-answer">
                        <strong>Answer:</strong> {response.answer}
                      </p>
                      <p className="evaluation-text">
                        {response.evaluation || "No evaluation text returned for this answer."}
                      </p>
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

export default ReportPage;
