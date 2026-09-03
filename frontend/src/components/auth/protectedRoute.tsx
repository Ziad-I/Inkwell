import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuthStore } from "@/stores/authStore";
import { LoadingSpinner } from "@/components/home/LoadingSpinner";

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    // "restore-error" is treated like "unauthenticated": the auth state
    // could not be determined, and /login always lets the user sign in
    // again. The pathname guard prevents a redirect loop when the
    // sign-in page itself is already active.
    if (
      (status === "unauthenticated" || status === "error") &&
      location.pathname !== "/login"
    ) {
      navigate("/login", { replace: true });
    }
  }, [status, navigate, location]);

  // "restoring" keeps the spinner: the auth bootstrap resolves it. This
  // is a safety net for routes rendered outside the bootstrap's gate.
  if (status !== "authenticated") {
    return <LoadingSpinner />;
  }

  return children;
}
