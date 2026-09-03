import { activeBoardSessionSlot } from "@/collaboration/sessionSlot";
import { AUTH_ENDPOINTS, apiClient, parseResponse } from "@/api/client";
import { refreshSession } from "@/api/session";
import { authSessionResponseSchema } from "@/api/schemas";
import { useAuthStore } from "@/stores/authStore";

/**
 * Outcome of an explicit sign-in: "authenticated" when the session was
 * committed, "stale" when the epoch moved on mid-flight (e.g. a
 * logout won the race) and nothing was written.
 */
export type SignInOutcome = "authenticated" | "stale";

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
}

export interface SignInOptions {
  signal?: AbortSignal;
}

/**
 * Runs an explicit sign-in (login or register). A fresh epoch is
 * claimed BEFORE the request so every capture made before the sign-in —
 * most importantly an in-flight pre-login refresh — is stranded and can
 * never clobber the session this call commits. The commit itself is
 * epoch-checked: a logout that lands mid-flight yields "stale" and
 * writes nothing.
 */
async function signIn(
  path: typeof AUTH_ENDPOINTS.LOGIN | typeof AUTH_ENDPOINTS.REGISTER,
  input: LoginInput | RegisterInput,
  options?: SignInOptions,
): Promise<SignInOutcome> {
  const epoch = useAuthStore.getState().beginSession();
  const session = await parseResponse(
    apiClient.post(path, input, {
      metadata: { allowAuthRefresh: false },
      signal: options?.signal,
    }),
    authSessionResponseSchema,
  );
  return useAuthStore.getState().commitSession(epoch, session)
    ? "authenticated"
    : "stale";
}

async function login(
  input: LoginInput,
  options?: SignInOptions,
): Promise<SignInOutcome> {
  return await signIn(AUTH_ENDPOINTS.LOGIN, input, options);
}

async function register(
  input: RegisterInput,
  options?: SignInOptions,
): Promise<SignInOutcome> {
  return await signIn(AUTH_ENDPOINTS.REGISTER, input, options);
}

/**
 * Synchronous local logout: clears the auth store, disposes the active
 * board session, then fires a best-effort server revocation that is
 * never awaited — callers navigate immediately.
 */
async function logout(): Promise<void> {
  useAuthStore.getState().logoutLocally();
  activeBoardSessionSlot.disposeActive();
  await revokeServerSession();
}

export type RestoreSessionResult =
  | "authenticated"
  | "unauthenticated"
  | "stale";

/**
 * Restores the session at startup: captures the epoch, marks the store
 * restoring, and resolves with what actually happened. "stale" means the
 * epoch was lost (e.g. logout won the race) and nothing was written.
 */
export async function restoreSession(options?: {
  signal?: AbortSignal;
}): Promise<RestoreSessionResult> {
  const epoch = useAuthStore.getState().captureEpoch();
  useAuthStore.getState().beginRestore(epoch);
  const outcome = await refreshSession({ signal: options?.signal });
  return outcome.status;
}

/**
 * Best-effort server-side session revocation: goes through apiClient but,
 * as an AUTH_ENDPOINTS path, is excluded from the bearer header and from
 * refresh-and-replay — never rejects, since logout proceeds locally
 * regardless of the server outcome.
 */
export async function revokeServerSession(): Promise<void> {
  try {
    await apiClient.post(AUTH_ENDPOINTS.LOGOUT, null, {
      metadata: { allowAuthRefresh: false },
    });
  } catch {
    // Ignore errors
  }
}

const authApi = {
  login,
  register,
  logout,
};

export default authApi;
