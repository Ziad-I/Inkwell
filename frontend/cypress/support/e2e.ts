/// <reference types="cypress" />

beforeEach(() => {
  cy.intercept("GET", "**/api/boards/*", {
    statusCode: 200,
    body: { id: "test-room", name: "Test Board" },
  }).as("boardValidate");

  cy.intercept("POST", "**/api/boards", {
    statusCode: 201,
    body: { id: "board-123", name: "New Board" },
  }).as("boardCreate");
});
