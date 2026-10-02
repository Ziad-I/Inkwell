import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router";
import HomePage from "@/pages/home";
import ErrorPage from "@/pages/error";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import InvitePage from "@/pages/invite";
import DashboardPage from "@/pages/dashboard";
import { ThemeProvider } from "@/providers/themeProvider";
import { Toaster } from "@/components/ui/sonner";
import AppLayout from "./layout";
import { ProtectedRoute } from "@/components/auth/protectedRoute";
import { LoadingSpinner } from "./components/home/LoadingSpinner";

const BoardPage = lazy(() => import("@/pages/board"));

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Suspense
          fallback={
            <div className="absolute inset-0 z-50 flex items-center justify-center">
              <LoadingSpinner />
            </div>
          }
        >
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/invite/:token" element={<InvitePage />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<ErrorPage />} />
            </Route>

            <Route path="/board/:roomId" element={<BoardPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster richColors closeButton />
    </ThemeProvider>
  );
}
