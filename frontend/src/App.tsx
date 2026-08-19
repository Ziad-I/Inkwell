import { BrowserRouter, Routes, Route } from "react-router";
import HomePage from "@/pages/home";
import ErrorPage from "@/pages/error";
import BoardPage from "@/pages/board";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import InvitePage from "@/pages/invite";
import { ThemeProvider } from "@/providers/themeProvider";
import { Toaster } from "@/components/ui/sonner";
import AppLayout from "./layout";

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route path="*" element={<ErrorPage />} />
          </Route>

          <Route path="/board/:roomId" element={<BoardPage />} />
        </Routes>
      </BrowserRouter>
      <Toaster richColors closeButton />
    </ThemeProvider>
  );
}
