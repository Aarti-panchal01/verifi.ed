/**
 * API URL Resolution
 * ------------------
 * Production (Vercel): always https://verifi-ed-production.up.railway.app
 * Local dev:           http://localhost:8000
 *
 * DO NOT add VITE_API_URL to Vercel environment variables.
 * Vite bakes env vars at build time - setting VITE_API_URL=http://localhost:8000
 * on Vercel would override this logic and break production.
 */

const PRODUCTION_API = "https://verifi-ed-production.up.railway.app";
const LOCAL_API = "http://localhost:8000";

// window.location.hostname is evaluated at RUNTIME in the browser,
// so this correctly detects Vercel vs local without any env vars.
const _isLocal =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

export const API_URL = _isLocal ? LOCAL_API : PRODUCTION_API;

console.log("[Verifi-ed] API_URL:", API_URL);

const TIMEOUT = 30000;
const MAX_RETRIES = 3;

export class APIError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "APIError";
    this.status = status;
    this.data = data;
  }
}

async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new APIError(
        errorData.detail || `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        errorData
      );
    }
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") throw new APIError("Request timeout", 408, {});
    if (retries > 0 && (error.status === 429 || error.status >= 500)) {
      await new Promise((r) => setTimeout(r, Math.pow(2, MAX_RETRIES - retries) * 1000));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  }
}

export const api = {
  async analyzeRepo(repoUrl, mode = "DEVELOPER") {
    return fetchWithRetry(`${API_URL}/analyze/repo`, { method: "POST", body: JSON.stringify({ repo_url: repoUrl, mode }) });
  },
  async verifyRepo(repoUrl, wallet = null) {
    return fetchWithRetry(`${API_URL}/verify-evidence/repo`, { method: "POST", body: JSON.stringify({ repo_url: repoUrl, wallet }) });
  },
  async verifyCertificate(filePath) {
    return fetchWithRetry(`${API_URL}/verify-evidence/certificate`, { method: "POST", body: JSON.stringify({ file_path: filePath }) });
  },
  async verifyProject(projectPath) {
    return fetchWithRetry(`${API_URL}/verify-evidence/project`, { method: "POST", body: JSON.stringify({ project_path: projectPath }) });
  },
  async submitRecord(data) {
    return fetchWithRetry(`${API_URL}/submit`, { method: "POST", body: JSON.stringify(data) });
  },
  async getWalletRecords(wallet) { return fetchWithRetry(`${API_URL}/wallet/${wallet}`); },
  async getTimeline(wallet) { return fetchWithRetry(`${API_URL}/timeline/${wallet}`); },
  async getReputation(wallet) { return fetchWithRetry(`${API_URL}/reputation/${wallet}`); },
  async verifyWallet(wallet) { return fetchWithRetry(`${API_URL}/verify/${wallet}`); },
  async health() { return fetchWithRetry(`${API_URL}/health`); },
};
