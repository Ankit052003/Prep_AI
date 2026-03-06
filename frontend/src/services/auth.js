const AUTH_TOKEN_KEY = "prepai-auth-token";
const AUTH_USER_KEY = "prepai-user";
const AUTH_CHANGE_EVENT = "prepai-auth-changed";

function parseStoredUser(rawValue) {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function emitAuthChange() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export function getAuthToken() {
  if (typeof window === "undefined") {
    return "";
  }

  return String(window.localStorage.getItem(AUTH_TOKEN_KEY) || "");
}

export function getStoredUser() {
  if (typeof window === "undefined") {
    return null;
  }

  return parseStoredUser(window.localStorage.getItem(AUTH_USER_KEY));
}

export function isAuthenticated() {
  return Boolean(getAuthToken());
}

export function persistAuthSession(token, user) {
  if (typeof window === "undefined") {
    return;
  }

  if (typeof token === "string" && token.trim()) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token.trim());
  }

  if (user && typeof user === "object") {
    window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  }

  emitAuthChange();
}

export function clearAuthSession(options = {}) {
  if (typeof window === "undefined") {
    return;
  }

  const { clearPracticeData = true } = options;

  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_USER_KEY);
  window.localStorage.removeItem("prepai-remember-identity");

  if (clearPracticeData) {
    window.localStorage.removeItem("parsedResume");
    window.localStorage.removeItem("finalResult");
    window.localStorage.removeItem("interviewHistory");
  }

  emitAuthChange();
}

export function subscribeAuthChanges(callback) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event) => {
    if (!event || !event.key || [AUTH_TOKEN_KEY, AUTH_USER_KEY].includes(event.key)) {
      callback();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(AUTH_CHANGE_EVENT, callback);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(AUTH_CHANGE_EVENT, callback);
  };
}
