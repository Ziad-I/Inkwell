import { BrowserRouter, Routes, Route } from "react-router";
import HomePage from "@/pages/home";
import ErrorPage from "@/pages/error";
import BoardPage from "@/pages/board";

import { ThemeProvider } from "@/providers/themeProvider";

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/board/:roomId" element={<BoardPage />} />
          <Route path="*" element={<ErrorPage />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
