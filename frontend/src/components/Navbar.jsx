import { Link } from "react-router-dom";
import ThemeToggleButton from "./ThemeToggleButton";

function Navbar() {
  return (
    <nav className="flex justify-between items-center px-10 py-6 bg-white">
      <h1 className="text-2xl font-bold tracking-tight">AI Interview</h1>

      <div className="flex items-center gap-6 text-gray-700">
        <div className="flex gap-8">
          <Link to="/">Home</Link>
          <Link to="/resume">Start</Link>
          <Link to="/report">Report</Link>
        </div>
        <ThemeToggleButton />
      </div>
    </nav>
  );
}

export default Navbar;
