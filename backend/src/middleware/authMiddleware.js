const jwt = require("jsonwebtoken");

function extractToken(req) {
  const authorizationHeader = req.headers?.authorization || req.headers?.Authorization;

  if (typeof authorizationHeader === "string" && authorizationHeader.startsWith("Bearer ")) {
    return authorizationHeader.slice(7).trim();
  }

  const rawHeaderToken = req.headers?.["x-auth-token"] || req.headers?.["x-access-token"];
  if (typeof rawHeaderToken === "string" && rawHeaderToken.trim()) {
    return rawHeaderToken.trim();
  }

  return "";
}

function decodeToken(token) {
  const jwtSecret = process.env.JWT_SECRET || "dev-secret-change-me";
  return jwt.verify(token, jwtSecret);
}

function attachUserToRequest(req, decodedPayload) {
  const userId = decodedPayload?.userId || decodedPayload?.id || decodedPayload?._id;
  if (!userId) {
    return;
  }

  req.user = {
    userId: String(userId),
  };
}

exports.requireAuth = (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: "Authentication required. Missing token." });
  }

  try {
    const decodedPayload = decodeToken(token);
    attachUserToRequest(req, decodedPayload);

    if (!req.user?.userId) {
      return res.status(401).json({ error: "Authentication token is invalid." });
    }

    return next();
  } catch (_error) {
    return res.status(401).json({ error: "Authentication token is invalid or expired." });
  }
};

exports.optionalAuth = (req, _res, next) => {
  const token = extractToken(req);
  if (!token) {
    return next();
  }

  try {
    const decodedPayload = decodeToken(token);
    attachUserToRequest(req, decodedPayload);
  } catch (_error) {
    // Invalid optional auth should not block public endpoints.
  }

  return next();
};
