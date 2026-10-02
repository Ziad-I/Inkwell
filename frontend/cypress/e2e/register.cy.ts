describe("Register Page", () => {
  beforeEach(() => {
    cy.visit("/register");
  });

  const fillForm = (fields: {
    username?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }) => {
    if (fields.username !== undefined) {
      cy.get("#username").type(fields.username);
    }
    if (fields.email !== undefined) {
      cy.get("#email").type(fields.email);
    }
    if (fields.password !== undefined) {
      cy.get("#password").type(fields.password);
    }
    if (fields.confirmPassword !== undefined) {
      cy.get("#confirmPassword").type(fields.confirmPassword);
    }
  };

  it("renders the registration form", () => {
    cy.contains("Create your account").should("be.visible");
    cy.get("#username").should("be.visible");
    cy.get("#email").should("be.visible");
    cy.get("#password").should("be.visible");
    cy.get("#confirmPassword").should("be.visible");
    cy.contains("button", "Create account").should("be.visible");
  });

  it("requires a username", () => {
    fillForm({
      email: "alice@example.com",
      password: "password123",
      confirmPassword: "password123",
    });
    cy.contains("button", "Create account").click();
    cy.contains("Please enter a username.").should("be.visible");
  });

  it("requires a valid email", () => {
    fillForm({
      username: "alice",
      email: "not-an-email",
      password: "password123",
      confirmPassword: "password123",
    });
    cy.contains("button", "Create account").click();
    cy.contains("Please enter a valid email address.").should("be.visible");
  });

  it("requires a password of at least 8 characters", () => {
    fillForm({
      username: "alice",
      email: "alice@example.com",
      password: "short",
      confirmPassword: "short",
    });
    cy.contains("button", "Create account").click();
    cy.contains("Password must be at least 8 characters.").should("be.visible");
  });

  it("requires matching passwords", () => {
    fillForm({
      username: "alice",
      email: "alice@example.com",
      password: "password123",
      confirmPassword: "password456",
    });
    cy.contains("button", "Create account").click();
    cy.contains("Passwords do not match.").should("be.visible");
  });

  it("shows an error toast when registration fails", () => {
    cy.intercept("POST", "**/api/auth/register", {
      statusCode: 409,
      body: { message: "Email already registered" },
    }).as("register");

    fillForm({
      username: "alice",
      email: "alice@example.com",
      password: "password123",
      confirmPassword: "password123",
    });
    cy.contains("button", "Create account").click();

    cy.wait("@register");
    cy.contains("Email already registered").should("be.visible");
    cy.url().should("include", "/register");
  });

  it("registers successfully and redirects home", () => {
    cy.intercept("POST", "**/api/auth/register", {
      statusCode: 201,
      body: {
        user: { id: "user-1", username: "alice", email: "alice@example.com" },
        accessToken: "fake-token",
      },
    }).as("register");

    fillForm({
      username: "alice",
      email: "alice@example.com",
      password: "password123",
      confirmPassword: "password123",
    });
    cy.contains("button", "Create account").click();

    cy.wait("@register");
    cy.url().should("eq", `${Cypress.config("baseUrl")}/`);
    cy.get('[aria-label="User menu for alice"]').should("be.visible");
  });

  it("navigates to the login page", () => {
    cy.contains("a", "Sign in").click();
    cy.url().should("include", "/login");
    cy.contains("Welcome back").should("be.visible");
  });
});
