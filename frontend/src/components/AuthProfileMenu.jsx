import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import signupUserPlusIcon from "../assets/signup-user-plus.svg";
import { clearAuthSession, getStoredUser, subscribeAuthChanges } from "../services/auth";

function getUserDisplayName(user) {
  if (!user || typeof user !== "object") {
    return "";
  }

  const name = String(user.name || "").trim();
  if (name) return name;

  const username = String(user.username || "").trim();
  if (username) return username;

  const email = String(user.email || "").trim();
  if (email) {
    return email.split("@")[0];
  }

  return "User";
}

function getUserInitials(label) {
  const words = String(label || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return "U";
  }

  if (words.length === 1) {
    return words[0].slice(0, 1).toUpperCase();
  }

  return (words[0][0] + words[1][0]).toUpperCase();
}

function AuthProfileMenu() {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState(() => getStoredUser());

  const displayName = useMemo(() => getUserDisplayName(user), [user]);
  const initials = useMemo(() => getUserInitials(displayName), [displayName]);
  const userEmail = String(user?.email || "").trim();

  useEffect(() => subscribeAuthChanges(() => setUser(getStoredUser())), []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => navigate("/signup?mode=login")}
        className="home-signup-btn"
        aria-label="Login or create account"
        title="Login or create account"
      >
        <img src={signupUserPlusIcon} alt="" aria-hidden="true" className="home-signup-icon" />
      </button>
    );
  }

  return (
    <div className="profile-menu-shell" ref={rootRef}>
      <button
        type="button"
        className="profile-menu-trigger"
        onClick={() => setIsOpen((currentState) => !currentState)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <span className="profile-menu-avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="profile-menu-name">{displayName}</span>
      </button>

      {isOpen ? (
        <div className="profile-menu-dropdown" role="menu">
          <p className="profile-menu-label">Logged in as</p>
          <p className="profile-menu-user">{displayName}</p>
          {userEmail ? <p className="profile-menu-email">{userEmail}</p> : null}

          <div className="profile-menu-actions">
            <button
              type="button"
              className="profile-menu-item"
              onClick={() => {
                setIsOpen(false);
                navigate("/resume");
              }}
            >
              My Resume
            </button>
            <button
              type="button"
              className="profile-menu-item logout"
              onClick={() => {
                clearAuthSession();
                setIsOpen(false);
                navigate("/");
              }}
            >
              Logout
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default AuthProfileMenu;
