import type {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from "axios";

import { useAuthStore } from "@/stores/authStore";
import { AUTH_ENDPOINTS } from "@/api/client";
import type { RefreshOutcome } from "@/api/session";

interface RequestMetadata {
  /**
   * Whether a 401 may trigger session refresh + request replay.
   * Opt-in rather than opt-out.
   */
  allowAuthRefresh?: boolean;
  /**
   * Prevents an already-replayed request from being replayed again.
   */
  authRetry?: boolean;
}

declare module "axios" {
  interface AxiosRequestConfig {
    metadata?: RequestMetadata;
  }
}

const AUTH_ENDPOINT_PATHS = new Set<string>(Object.values(AUTH_ENDPOINTS));

type RefreshSession = () => Promise<RefreshOutcome>;

export function installAuthInterceptors(
  apiClient: AxiosInstance,
  refreshSession: RefreshSession,
): void {
  apiClient.interceptors.request.use((config) => {
    if (isAuthEndpoint(config.url, apiClient.defaults.baseURL)) {
      return config;
    }

    const accessToken = useAuthStore.getState().accessToken;

    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  });

  apiClient.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as InternalAxiosRequestConfig | undefined;

      if (
        !config ||
        !isRefreshEligible(error, config, apiClient.defaults.baseURL)
      ) {
        return Promise.reject(error);
      }

      config.metadata = {
        ...config.metadata,
        authRetry: true,
      };

      const outcome = await refreshSession();

      if (outcome.status !== "authenticated") {
        return Promise.reject(error);
      }

      config.headers.Authorization = `Bearer ${outcome.session.accessToken}`;

      return apiClient(config);
    },
  );
}

function isRefreshEligible(
  error: AxiosError,
  config: InternalAxiosRequestConfig,
  baseURL: string | undefined,
): boolean {
  if (error.response?.status !== 401) {
    return false;
  }

  if (config.metadata?.authRetry === true) {
    return false;
  }

  if (config.metadata?.allowAuthRefresh !== true) {
    return false;
  }

  return !isAuthEndpoint(config.url, baseURL);
}

function isAuthEndpoint(
  url: string | undefined,
  baseURL: string | undefined,
): boolean {
  if (!url) {
    return false;
  }

  try {
    const { pathname } = new URL(url, baseURL ?? window.location.origin);

    return AUTH_ENDPOINT_PATHS.has(pathname);
  } catch {
    return AUTH_ENDPOINT_PATHS.has(url);
  }
}
