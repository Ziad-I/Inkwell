import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/authStore";
import type { AuthUser } from "@/types/auth";
import type { HttpOperation } from "@/types/http";
import { mapHttpError, operationMessage } from "@/api/errors";

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

/**
 * INTERIM wrapper over mapHttpError, kept so existing callers compile while
 * closing the backend-message leak immediately. Remove once callers migrate
 * to mapHttpError directly (then suppress cancellation toasts with
 * isCancelledHttpError).
 *
 * Semantics: infers the failing operation from the request URL, maps the
 * error through mapHttpError, and returns the operation-specific stable
 * message for listed (operation, category) pairs. Service errors,
 * cancellations, and unlisted pairs return the caller-provided fallback so
 * existing toast copy is preserved.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const operation = inferHttpOperation(err);
  if (operation === null) {
    return fallback;
  }
  const mapped = mapHttpError(err, operation);
  if (mapped.category === "service" || mapped.category === "cancelled") {
    return fallback;
  }
  return operationMessage(operation, mapped.category) ?? fallback;
}

/**
 * INTERIM helper for apiErrorMessage: infers the app operation that
 * produced an error by matching the Axios request method and URL path
 * against the endpoint table. The config is read for routing only — the
 * URL is never displayed, serialized, or included in any returned value.
 * /auth/refresh is attributed to refresh-session; restore-session failures
 * are swallowed by performRefresh and never reach apiErrorMessage.
 */
function inferHttpOperation(err: unknown): HttpOperation | null {
  if (!(err instanceof AxiosError)) {
    return null;
  }
  const url = err.config?.url;
  if (typeof url !== "string" || url === "") {
    return null;
  }
  const method = (err.config?.method ?? "get").toLowerCase();
  let pathname: string;
  try {
    pathname = new URL(url, "http://inkwell.invalid").pathname;
  } catch {
    return null;
  }
  const segments = pathname.split("/").filter((segment) => segment !== "");
  if (segments[0] === "api") {
    segments.shift();
  }

  if (segments[0] === "auth" && segments.length === 2 && method === "post") {
    switch (segments[1]) {
      case "login":
        return "login";
      case "register":
        return "register";
      case "refresh":
        return "refresh-session";
      case "logout":
        return "logout";
      default:
        return null;
    }
  }
  if (segments[0] === "invites" && segments.length === 2) {
    if (method === "post" && segments[1] === "redeem") {
      return "redeem-invite";
    }
    if (method === "get") {
      return "lookup-invite";
    }
    return null;
  }
  if (segments[0] === "boards") {
    if (segments.length === 1) {
      if (method === "get") return "list-boards";
      if (method === "post") return "create-board";
      return null;
    }
    if (segments.length === 2) {
      if (method === "get") return "lookup-board";
      if (method === "patch") return "rename-board";
      if (method === "delete") return "delete-board";
      return null;
    }
    if (segments.length === 3) {
      const action = segments[2];
      if (method === "post" && action === "invites") return "create-invite";
      if (method === "post" && action === "duplicate") {
        return "duplicate-board";
      }
      if (method === "patch" && action === "archive") return "archive-board";
      if (method === "patch" && action === "restore") return "restore-board";
    }
  }
  return null;
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
