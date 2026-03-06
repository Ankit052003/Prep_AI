import { Suspense, lazy, useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import Home from "./pages/Home";

const ResumePage = lazy(() => import("./pages/ResumePage"));
const InterviewPage = lazy(() => import("./pages/Interview"));
const ReportPage = lazy(() => import("./pages/ReportPage"));
const SignupPage = lazy(() => import("./pages/Signup"));

function RouteLoadingFallback() {
  return (
    <div className="route-skeleton-shell" role="status" aria-live="polite">
      <div className="route-skeleton-header" aria-hidden="true">
        <span />
        <span />
      </div>
      <div className="route-skeleton-grid" aria-hidden="true">
        <span />
        <span />
      </div>
      <p>Loading page...</p>
    </div>
  );
}

function App() {
  useEffect(() => {
    const warmRoutes = () => {
      void import("./pages/ResumePage");
      void import("./pages/Interview");
      void import("./pages/ReportPage");
      void import("./pages/Signup");
    };

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(warmRoutes, { timeout: 1200 });
      return () => {
        window.cancelIdleCallback(idleId);
      };
    }

    const timeoutId = window.setTimeout(warmRoutes, 450);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/resume" element={<ResumePage />} />
        <Route path="/interview" element={<InterviewPage />} />
        <Route path="/report" element={<ReportPage />} />
      </Routes>
    </Suspense>
  );
}

export default App;
