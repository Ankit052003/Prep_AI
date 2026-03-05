import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ResumePage from "./pages/ResumePage";
import InterviewPage from "./pages/Interview";
import ReportPage from "./pages/ReportPage";
import SignupPage from "./pages/Signup";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/resume" element={<ResumePage />} />
      <Route path="/interview" element={<InterviewPage />} />
      <Route path="/report" element={<ReportPage />} />
    </Routes>
  );
}

export default App;
