import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore, type AuthUser } from "@/stores/authStore";

export const baseURL = `${import.meta.env.VITE_BACKEND_API_URL}/api`;
const REFRESH_PATH = "/auth/refresh";
const LOGIN_PATH = "/auth/login";
const REGISTER_PATH = "/auth/register";

type RetryableConfig = InternalAxiosRequestConfig & { _retried?: boolean };
type RefreshResult = { user: AuthUser; accessToken: string };
let refreshPromise: Promise<RefreshResult | null> | null = null;

const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof AxiosError) {
    const message = (err.response?.data as { message?: string } | undefined)
      ?.message;
    if (message) return message;
  }
  return fallback;
}

function performRefresh(): Promise<RefreshResult | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const { data } = await axios.post<RefreshResult>(
        `${baseURL}${REFRESH_PATH}`,
        null,
        { withCredentials: true },
      );
      useAuthStore.getState().setSession(data.user, data.accessToken);
      return data;
    } catch {
      useAuthStore.getState().clearSession();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

function shouldAttemptRefresh(error: AxiosError, config?: RetryableConfig) {
  if (error.response?.status !== 401) return false;
  if (!config || config._retried) return false;
  if (
    config.url?.includes(REFRESH_PATH) ||
    config.url?.includes(LOGIN_PATH) ||
    config.url?.includes(REGISTER_PATH)
  )
    return false;
  return true;
}

export function restoreSession(): Promise<RefreshResult | null> {
  useAuthStore.getState().setStatus("loading");
  return performRefresh();
}

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryableConfig | undefined;
    if (!shouldAttemptRefresh(error, config) || !config) {
      return Promise.reject(error);
    }
    config._retried = true;

    const result = await performRefresh();
    if (!result) {
      return Promise.reject(error);
    }
    config.headers.Authorization = `Bearer ${result.accessToken}`;
    return api(config);
  },
);

export default api;
