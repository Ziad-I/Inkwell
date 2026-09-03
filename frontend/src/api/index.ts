import { apiClient } from "@/api/client";
import { installAuthInterceptors } from "@/api/interceptors";
import { refreshSession } from "@/api/session";

installAuthInterceptors(apiClient, refreshSession);

export { apiClient, AUTH_ENDPOINTS, parseResponse } from "@/api/client";

export { isCancelledHttpError, mapHttpError } from "@/api/errors";

export { default as authApi } from "@/api/auth";
export { default as boardApi } from "@/api/board";
export { default as inviteApi } from "@/api/invite";

export { refreshSession } from "@/api/session";
