import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:5173",
    supportFile: "cypress/support/e2e.ts",
    specPattern: "cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    screenshotOnRunFailure: true,
    env: {
      // Base URL of the real backend REST API. Board page tests need a
      // real board to exist (Socket.IO room:join rejects unknown rooms),
      // so they create one directly against the backend via cy.request,
      // bypassing the cy.intercept stubs used for the home page flows.
      apiUrl: process.env.CYPRESS_API_URL || "http://localhost:5000/api",
    },
  },
});
