import { Link } from "react-router-dom";

function Navbar() {
  return (
    <nav className="flex justify-between items-center px-10 py-6 bg-white">
      <h1 className="text-2xl font-bold tracking-tight">AI Interview</h1>

      <div className="flex gap-8 text-gray-700">
        <Link to="/">Home</Link>
        <Link to="/resume">Start</Link>
        <Link to="/report">Report</Link>
      </div>
    </nav>
  );
}

export default Navbar;