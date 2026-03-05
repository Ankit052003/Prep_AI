import { useEffect, useState } from "react";

const THEME_STORAGE_KEY = "prepai-theme";
const THEME_ICON_URL =
  "https://img.icons8.com/?size=100&id=45475&format=png&color=000000";

function detectInitialTheme() {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === "dark" || storedTheme === "light") {
    return storedTheme;
  }

  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return "light";
}

function ThemeToggleButton() {
  const [theme, setTheme] = useState(detectInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const isDarkTheme = theme === "dark";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"))}
      aria-pressed={isDarkTheme}
      aria-label={isDarkTheme ? "Switch to light theme" : "Switch to dark theme"}
      title={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"}
    >
      <img src={THEME_ICON_URL} alt="" aria-hidden="true" className="theme-toggle-icon" />
    </button>
  );
}

export default ThemeToggleButton;
