import axios from "axios";
import { getAuthToken } from "./auth";

function normalizeApiBaseUrl(rawBaseUrl) {
  const fallbackBaseUrl = "https://ai-interview-backend-hff4.onrender.com";

  if (!rawBaseUrl || typeof rawBaseUrl !== "string") {
    return fallbackBaseUrl;
  }

  const trimmedBaseUrl = rawBaseUrl.trim();
  if (!trimmedBaseUrl) {
    return fallbackBaseUrl;
  }

  const withoutTrailingSlash = trimmedBaseUrl.replace(/\/+$/, "");
  const hasApiSegment = /\/api(\/|$)/i.test(withoutTrailingSlash);

  return hasApiSegment ? withoutTrailingSlash : `${withoutTrailingSlash}/api`;
}

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL;
const normalizedBaseUrl = normalizeApiBaseUrl(configuredBaseUrl);

const api = axios.create({
  baseURL: normalizedBaseUrl,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (!token) {
    return config;
  }

  const nextConfig = { ...config };
  nextConfig.headers = nextConfig.headers || {};

  if (!nextConfig.headers.Authorization && !nextConfig.headers.authorization) {
    nextConfig.headers.Authorization = `Bearer ${token}`;
  }

  return nextConfig;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const originalConfig = error?.config;

    if (!originalConfig || status !== 404 || originalConfig.__apiPrefixRetried) {
      throw error;
    }

    const requestUrl = String(originalConfig.url || "");
    const requestBase = String(originalConfig.baseURL || "");
    const isRootRelativePath = requestUrl.startsWith("/");
    const alreadyApiPath = requestUrl.startsWith("/api/");
    const baseHasApiSegment = /\/api(\/|$)/i.test(requestBase);

    if (!isRootRelativePath || alreadyApiPath || baseHasApiSegment) {
      throw error;
    }

    originalConfig.__apiPrefixRetried = true;
    originalConfig.url = `/api${requestUrl}`;

    return api.request(originalConfig);
  }
);

export default api;
