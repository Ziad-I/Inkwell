import { AxiosError, CanceledError } from "axios";
import type {
  AxiosAdapter,
  AxiosInstance,
  AxiosResponse,
  GenericAbortSignal,
  InternalAxiosRequestConfig,
} from "axios";

import { useAuthStore } from "@/stores/authStore";
import type { HttpOperation } from "@/types/http";

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  signal?: GenericAbortSignal;
  metadata?: {
    operation?: HttpOperation;
    allowAuthRefresh?: boolean;
    authRetry?: boolean;
  };
}

export interface StubbedResponse {
  status?: number;
  data?: unknown;
}

export type StubHandler = (
  request: RecordedRequest,
) => StubbedResponse | Promise<StubbedResponse>;

export interface HttpAdapterHarness {
  requests: RecordedRequest[];
  stub: (handler: StubHandler) => void;
}

/**
 * Installs a recording adapter on the single API client.
 *
 * Tests therefore exercise:
 *
 *   real Axios instance
 *   real request interceptor
 *   real response interceptor
 *   real refresh/session flow
 *   real retry dispatch
 *
 * without making network requests.
 */
export function installHttpAdapter(client: AxiosInstance): HttpAdapterHarness {
  const requests: RecordedRequest[] = [];
  let handler: StubHandler | undefined;

  const adapter: AxiosAdapter = async (
    config: InternalAxiosRequestConfig,
  ): Promise<AxiosResponse> => {
    const request = recordRequest(config);
    requests.push(request);

    if (config.signal?.aborted) {
      throw new CanceledError("canceled");
    }

    if (!handler) {
      throw new Error(
        `no response stub installed for ${request.method} ${request.url}`,
      );
    }

    try {
      const outcome = await handler(request);

      return {
        data: outcome.data ?? null,
        status: outcome.status ?? 200,
        statusText: "",
        headers: {},
        config,
      };
    } catch (error) {
      /*
       * A manually-created AxiosError does not necessarily have the
       * originating config attached. Axios response interceptors need
       * error.config in order to retry the failed request.
       */
      if (error instanceof AxiosError) {
        if (!error.config) {
          error.config = config;
        }

        if (error.response && !error.response.config) {
          error.response.config = config;
        }
      }

      throw error;
    }
  };

  client.defaults.adapter = adapter;

  return {
    requests,
    stub: (nextHandler) => {
      handler = nextHandler;
    },
  };
}

function recordRequest(config: InternalAxiosRequestConfig): RecordedRequest {
  return {
    url: config.url ?? "",
    method: (config.method ?? "get").toLowerCase(),
    headers: config.headers.toJSON() as Record<string, string>,
    signal: config.signal,
    metadata: config.metadata,
  };
}

export function httpError(status: number, data: unknown = {}): AxiosError {
  return new AxiosError(
    `Request failed with status code ${status}`,
    "ERR_BAD_REQUEST",
    undefined,
    {},
    {
      status,
      data,
      headers: {},
      statusText: "",
    } as never,
  );
}

export function sessionWith(accessToken: string) {
  return {
    user: {
      id: "user-1",
      username: "alice",
      email: "alice@example.com",
    },
    accessToken,
  };
}

export function resetAuthStore(): void {
  useAuthStore.setState({
    epoch: 0,
    user: null,
    accessToken: null,
    status: "idle",
  });
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

/**
 * Yields to the macrotask queue once, allowing the Axios dispatch,
 * interceptor continuations, and refresh dispatch to progress.
 */
export function flushAsync(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
