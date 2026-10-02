describe("Login Page", () => {
  beforeEach(() => {
    cy.visit("/login");
  });

  it("renders the login form", () => {
    cy.contains("Welcome back").should("be.visible");
    cy.contains("Sign in to access your saved boards").should("be.visible");
    cy.get("#email").should("be.visible");
    cy.get("#password").should("be.visible");
    cy.contains("button", "Sign in").should("be.visible");
  });

  it("shows an error toast when submitting with empty fields", () => {
    cy.contains("button", "Sign in").click();
    cy.contains("Please fill in your email and password.").should("be.visible");
    cy.url().should("include", "/login");
  });

  it("shows an error toast when login fails", () => {
    cy.intercept("POST", "**/api/auth/login", {
      statusCode: 401,
      body: { message: "Invalid email or password" },
    }).as("login");

    cy.get("#email").type("alice@example.com");
    cy.get("#password").type("wrong-password");
    cy.contains("button", "Sign in").click();

    cy.wait("@login");
    cy.contains("Invalid email or password").should("be.visible");
    cy.url().should("include", "/login");
  });

  it("logs in successfully and redirects home", () => {
    cy.intercept("POST", "**/api/auth/login", {
      statusCode: 200,
      body: {
        user: { id: "user-1", username: "alice", email: "alice@example.com" },
        accessToken: "fake-token",
      },
    }).as("login");

    cy.get("#email").type("alice@example.com");
    cy.get("#password").type("correct-password");
    cy.contains("button", "Sign in").click();

    cy.wait("@login");
    cy.url().should("eq", `${Cypress.config("baseUrl")}/`);
    cy.get('[aria-label="User menu for alice"]').should("be.visible");
  });

  it("navigates to the register page", () => {
    cy.contains("Create one").click();
    cy.url().should("include", "/register");
    cy.contains("Create your account").should("be.visible");
  });
});
