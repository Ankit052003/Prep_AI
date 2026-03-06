const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const MIN_PASSWORD_LENGTH = 8;
const GOOGLE_TOKEN_INFO_URL = "https://www.googleapis.com/oauth2/v3/tokeninfo";
const GOOGLE_USER_INFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

function sanitizeIdentifier(rawIdentifier) {
  if (typeof rawIdentifier !== "string") {
    return "";
  }

  return rawIdentifier.trim().toLowerCase();
}

function parseIdentifier(identifier) {
  if (!identifier) {
    return {};
  }

  if (identifier.includes("@")) {
    return { email: identifier };
  }

  return { username: identifier };
}

function toSafeUser(userDoc) {
  return {
    id: userDoc._id,
    name: userDoc.name,
    username: userDoc.username || null,
    email: userDoc.email || null,
  };
}

function signAuthToken(userId) {
  const jwtSecret = process.env.JWT_SECRET || "dev-secret-change-me";

  return jwt.sign({ userId }, jwtSecret, { expiresIn: "7d" });
}

function getGoogleClientId() {
  return String(process.env.GOOGLE_CLIENT_ID || "").trim();
}

function sanitizeName(rawName, fallbackValue = "Google User") {
  const normalizedName = typeof rawName === "string" ? rawName.trim() : "";
  return normalizedName || fallbackValue;
}

function buildHttpError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function fetchGoogleTokenInfo(accessToken) {
  const endpoint = `${GOOGLE_TOKEN_INFO_URL}?access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(endpoint, { method: "GET" });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const reason = payload?.error_description || payload?.error || "Unable to verify Google token.";
    throw buildHttpError(reason, 401);
  }

  return payload || {};
}

async function fetchGoogleUserInfo(accessToken) {
  const response = await fetch(GOOGLE_USER_INFO_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const reason = payload?.error_description || payload?.error || "Unable to fetch Google profile.";
    throw buildHttpError(reason, 401);
  }

  return payload || {};
}

exports.registerUser = async (req, res) => {
  try {
    const { name, usernameOrEmail, password, confirmPassword } = req.body || {};

    const normalizedName = typeof name === "string" ? name.trim() : "";
    const normalizedIdentifier = sanitizeIdentifier(usernameOrEmail);

    if (!normalizedName || !normalizedIdentifier || !password || !confirmPassword) {
      return res.status(400).json({
        error:
          "Missing required fields. Please provide name, usernameOrEmail, password, and confirmPassword.",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Password and confirm password do not match." });
    }

    if (String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
      });
    }

    const identitySelector = parseIdentifier(normalizedIdentifier);
    const identityKey = Object.keys(identitySelector)[0];

    if (!identityKey) {
      return res.status(400).json({
        error: "Please provide a valid username or email address.",
      });
    }

    const existingUser = await User.findOne(identitySelector).lean();
    if (existingUser) {
      return res.status(409).json({
        error:
          identityKey === "email"
            ? "An account already exists with this email."
            : "An account already exists with this username.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name: normalizedName,
      ...identitySelector,
      password: hashedPassword,
    });

    const token = signAuthToken(user._id);

    return res.status(201).json({
      message: "Account created successfully.",
      token,
      user: toSafeUser(user),
    });
  } catch (error) {
    if (error?.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || "identifier";
      const duplicateMessage =
        duplicateField === "email"
          ? "An account already exists with this email."
          : duplicateField === "username"
            ? "An account already exists with this username."
            : "An account already exists with this identifier.";

      return res.status(409).json({ error: duplicateMessage });
    }

    return res.status(500).json({ error: error.message });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { usernameOrEmail, password } = req.body || {};
    const normalizedIdentifier = sanitizeIdentifier(usernameOrEmail);

    if (!normalizedIdentifier || !password) {
      return res.status(400).json({
        error: "Missing required fields. Please provide usernameOrEmail and password.",
      });
    }

    const identitySelector = parseIdentifier(normalizedIdentifier);
    const user = await User.findOne(identitySelector);
    if (!user) {
      return res.status(401).json({ error: "Invalid username/email or password." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid username/email or password." });
    }

    const token = signAuthToken(user._id);

    return res.json({
      message: "Login successful.",
      token,
      user: toSafeUser(user),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.json({ user: toSafeUser(user) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getGoogleAuthConfig = (_req, res) => {
  const googleClientId = getGoogleClientId();

  return res.json({
    enabled: Boolean(googleClientId),
    clientId: googleClientId || "",
  });
};

exports.googleAuthUser = async (req, res) => {
  try {
    const rawAccessToken = req.body?.accessToken;
    const accessToken = typeof rawAccessToken === "string" ? rawAccessToken.trim() : "";
    const configuredClientId = getGoogleClientId();

    if (!accessToken) {
      return res.status(400).json({ error: "Missing required field: `accessToken`." });
    }

    if (!configuredClientId) {
      return res.status(500).json({
        error: "Google sign-in is not configured on server. Missing GOOGLE_CLIENT_ID.",
      });
    }

    const tokenInfo = await fetchGoogleTokenInfo(accessToken);
    const tokenAudience = String(tokenInfo?.aud || "");
    if (tokenAudience !== configuredClientId) {
      return res.status(401).json({ error: "Google token audience mismatch." });
    }

    const googleProfile = await fetchGoogleUserInfo(accessToken);
    const normalizedEmail = sanitizeIdentifier(googleProfile?.email);

    if (!normalizedEmail) {
      return res.status(400).json({
        error: "Google account does not expose a valid email. Please use another account.",
      });
    }

    const isEmailVerified = String(googleProfile?.email_verified || "").toLowerCase() === "true";
    if (!isEmailVerified) {
      return res.status(401).json({
        error: "Google email is not verified. Please verify email on Google first.",
      });
    }

    let user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      const randomSecret = crypto.randomBytes(24).toString("hex");
      const hashedPassword = await bcrypt.hash(randomSecret, 10);

      try {
        user = await User.create({
          name: sanitizeName(googleProfile?.name, normalizedEmail.split("@")[0]),
          email: normalizedEmail,
          password: hashedPassword,
        });
      } catch (createError) {
        if (createError?.code !== 11000) {
          throw createError;
        }

        user = await User.findOne({ email: normalizedEmail });
      }
    } else if (!user.name && googleProfile?.name) {
      user.name = sanitizeName(googleProfile.name, normalizedEmail.split("@")[0]);
      await user.save();
    }

    if (!user) {
      throw buildHttpError("Unable to create or load user for Google account.", 500);
    }

    const token = signAuthToken(user._id);

    return res.json({
      message: "Google authentication successful.",
      token,
      user: toSafeUser(user),
    });
  } catch (error) {
    const statusCode = Number(error?.status);
    const safeStatusCode =
      Number.isFinite(statusCode) && statusCode >= 400 && statusCode < 600 ? statusCode : 500;

    return res.status(safeStatusCode).json({
      error: error?.message || "Google authentication failed.",
    });
  }
};
