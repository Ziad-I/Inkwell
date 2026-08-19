/// <reference types="cypress" />

// Cypress dispatches synthetic pointer events, so there is no real active
// pointer for the app's setPointerCapture()/releasePointerCapture() calls
// (e.g. @use-gesture, Konva). Stub them out to avoid NotFoundError crashes.
Cypress.on("window:before:load", (win) => {
  win.Element.prototype.setPointerCapture = () => {};
  win.Element.prototype.releasePointerCapture = () => {};
});

beforeEach(() => {
  // The app calls POST /auth/refresh on every load (see src/main.tsx) before
  // it even renders. Stub it so tests don't depend on a live backend/cookie.
  cy.intercept("POST", "**/api/auth/refresh", {
    statusCode: 401,
    body: { message: "No refresh token" },
  }).as("authRefresh");

  cy.intercept("GET", "**/api/boards/*", {
    statusCode: 200,
    body: { id: "test-room", name: "Test Board" },
  }).as("boardValidate");

  cy.intercept("POST", "**/api/boards", {
    statusCode: 201,
    body: { id: "board-123", name: "New Board" },
  }).as("boardCreate");
});
