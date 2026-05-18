const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true });

function splitClientIds(rawValue) {
  return String(rawValue || "")
    .split(",")
    .map((clientId) => clientId.trim())
    .filter(Boolean);
}

function redactClientId(clientId) {
  const normalizedClientId = String(clientId || "").trim();
  if (!normalizedClientId) {
    return "<empty>";
  }

  const [prefix, ...rest] = normalizedClientId.split(".");
  const suffix = rest.join(".");
  const visiblePrefix = prefix.length <= 10 ? prefix : `${prefix.slice(0, 6)}...${prefix.slice(-4)}`;

  return suffix ? `${visiblePrefix}.${suffix}` : visiblePrefix;
}

const clientIds = Array.from(
  new Set([
    ...splitClientIds(process.env.GOOGLE_CLIENT_ID),
    ...splitClientIds(process.env.google_client_id),
    ...splitClientIds(process.env.GOOGLE_CLIENT_IDS),
    ...splitClientIds(process.env.google_client_ids),
  ])
);

if (!clientIds.length) {
  console.error("Google sign-in is not configured.");
  console.error("Add GOOGLE_CLIENT_ID to backend/.env using a Google OAuth 2.0 Web client ID.");
  console.error("Authorized JavaScript origins should include your frontend origin, for example:");
  console.error("- http://localhost:5173");
  console.error("- http://127.0.0.1:5173");
  process.exit(1);
}

console.log("Google sign-in config found.");
for (const clientId of clientIds) {
  console.log(`- ${redactClientId(clientId)}`);
}
