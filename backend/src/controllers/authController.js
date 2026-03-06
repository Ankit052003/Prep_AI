const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const MIN_PASSWORD_LENGTH = 8;

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
