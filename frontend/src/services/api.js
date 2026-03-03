import axios from "axios";

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL;
const normalizedBaseUrl = configuredBaseUrl
  ? configuredBaseUrl.replace(/\/+$/, "")
  : "http://localhost:5000/api";

const api = axios.create({
  baseURL: normalizedBaseUrl,
  timeout: 30000,
});

export default api;
