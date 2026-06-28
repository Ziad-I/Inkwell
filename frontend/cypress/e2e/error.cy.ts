describe("Error Page", () => {
  it("shows 404 for unknown routes", () => {
    cy.visit("/nonexistent-route");
    cy.contains(/Oops/i).should("be.visible");
    cy.contains(/something went wrong/i).should("be.visible");
    cy.contains(/page doesn't exist/i).should("be.visible");
  });

  it("has a back to home button", () => {
    cy.visit("/nonexistent-route");
    cy.contains("Back to Home").should("be.visible");
  });

  it("navigates to home on button click", () => {
    cy.visit("/nonexistent-route");
    cy.contains("Back to Home").click();
    cy.url().should("eq", Cypress.config("baseUrl") + "/");
  });
});
