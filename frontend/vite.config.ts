import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("konva") || id.includes("react-konva"))
            return "vendor-konva";

          // Everything below has a real runtime coupling to react-dom
          // (router renders via react-dom, base-ui uses react-dom portals) —
          // keeping them in separate forced chunks is what's causing the cycles
          if (
            id.includes("react-dom") ||
            id.includes("react-router") ||
            id.includes("scheduler") ||
            id.includes("@base-ui") ||
            id.includes("react-remove-scroll") ||
            id.includes("use-sidecar") ||
            id.includes("use-callback-ref") ||
            id.includes("get-nonce")
          ) {
            return "vendor-react-core";
          }

          if (id.includes("zod")) return "vendor-zod";
          if (id.includes("axios")) return "vendor-axios";
          if (
            id.includes("tailwind-merge") ||
            id.includes("class-variance-authority") ||
            id.includes("zustand") ||
            id.includes("sonner") ||
            id.includes("lucide-react")
          )
            return "vendor-misc";

          return undefined;
        },
      },
    },
  },
});
