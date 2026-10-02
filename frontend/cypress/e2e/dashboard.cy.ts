// Dashboard tests run against the live dev stack (real backend + Redis).
// Each test registers a fresh user via cy.request, wins the boot-time
// session-restore race with a refresh intercept, and manages its own boards
// so tests stay isolated from each other's data.
//
// NOTE: the access token MUST flow through the command queue (cy.as alias),
// because Cypress invokes test bodies before beforeEach's async callbacks
// run — a plain module-level variable would be one test behind.
describe("Dashboard Page", () => {
  function registerAndVisitDashboard() {
    const username = `dash_${Date.now()}`;
    cy.request("POST", `${Cypress.env("apiUrl")}/auth/register`, {
      username,
      email: `${username}@e2e.test`,
      password: "password123",
    }).then((res) => {
      // Registered later than the global 401 stub, so this wins on boot.
      cy.intercept("POST", "**/api/auth/refresh", {
        statusCode: 200,
        body: res.body,
      });
      cy.wrap(res.body.accessToken).as("accessToken");

      cy.visit("/dashboard");
      cy.url().should("include", "/dashboard");
      cy.contains("Your boards").should("be.visible");
    });
  }

  // Boards created through the API only appear in the table after a
  // refetch; use the dashboard's refresh button rather than reloading.
  function createBoardViaApi(name: string) {
    cy.get<string>("@accessToken").then((accessToken) =>
      cy.request({
        method: "POST",
        url: `${Cypress.env("apiUrl")}/boards`,
        body: { name },
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );
    cy.get('button[aria-label="Refresh boards"]').click();
    cy.contains(name, { timeout: 15000 }).should("be.visible");
  }

  function openRowActions(boardTitle: string) {
    cy.contains("tr", boardTitle)
      .find('button[aria-label="Board actions"]')
      .click();
  }

  it("redirects unauthenticated visitors to the login page", () => {
    cy.intercept("POST", "**/api/auth/refresh", { statusCode: 401 });
    cy.visit("/dashboard");
    cy.url({ timeout: 15000 }).should("include", "/login");
  });

  it("renders the heading, subtitle, and tabs for an authenticated owner", () => {
    registerAndVisitDashboard();

    cy.contains("Create and manage your collaborative boards.").should(
      "be.visible",
    );
    cy.contains('[role="tab"]', "Active").should("be.visible");
    cy.contains('[role="tab"]', "Archived").should("be.visible");
  });

  it("shows the empty states for a brand-new account", () => {
    registerAndVisitDashboard();

    cy.contains("No active boards yet", { timeout: 15000 }).should(
      "be.visible",
    );
    cy.contains('[role="tab"]', "Archived").click();
    cy.contains("No archived boards").should("be.visible");
  });

  it("creates a board via the New board button and navigates to it", () => {
    registerAndVisitDashboard();

    cy.contains("button", "New board").first().click();
    cy.url({ timeout: 15000 }).should("match", /\/board\/[a-zA-Z0-9-]+$/);
  });

  it("renames a board through the actions menu", () => {
    registerAndVisitDashboard();
    createBoardViaApi("e2e-rename-me");

    openRowActions("e2e-rename-me");
    cy.contains("[role='menuitem']", "Rename").click();
    cy.contains("Rename board").should("be.visible");

    cy.get('input[placeholder="Board name"]')
      .clear()
      .type("e2e-renamed-board");
    cy.contains("button", "Save").click();

    cy.get("[data-sonner-toast]").contains("renamed").should("be.visible");
    cy.contains("e2e-renamed-board").should("be.visible");
    cy.contains('[data-slot="table-body"]', "e2e-rename-me").should("not.exist");
  });

  it("duplicates a board through the actions menu", () => {
    registerAndVisitDashboard();
    createBoardViaApi("e2e-duplicate-me");

    cy.get('[data-slot="table-body"] tr')
      .its("length")
      .then((before) => {
        openRowActions("e2e-duplicate-me");
        cy.contains("[role='menuitem']", "Duplicate").click();
        cy.get("[data-sonner-toast]").contains("duplicated");
        cy.get('[data-slot="table-body"] tr').should(
          "have.length.at.least",
          before + 1,
        );
      });
  });

  it("archives a board through the actions menu and finds it under Archived", () => {
    registerAndVisitDashboard();
    createBoardViaApi("e2e-archive-me");

    openRowActions("e2e-archive-me");
    cy.contains("[role='menuitem']", "Archive").click();

    cy.get("[data-sonner-toast]").contains("archived").should("be.visible");
    cy.contains('[data-slot="table-body"]', "e2e-archive-me").should("not.exist");

    cy.contains('[role="tab"]', "Archived").click();
    cy.contains("e2e-archive-me", { timeout: 15000 }).should("be.visible");
  });

  it("restores an archived board through the actions menu", () => {
    registerAndVisitDashboard();
    createBoardViaApi("e2e-restore-me");

    openRowActions("e2e-restore-me");
    cy.contains("[role='menuitem']", "Archive").click();
    cy.contains('[data-slot="table-body"]', "e2e-restore-me").should("not.exist");

    cy.contains('[role="tab"]', "Archived").click();
    cy.contains("e2e-restore-me", { timeout: 15000 }).should("be.visible");
    openRowActions("e2e-restore-me");
    cy.contains("[role='menuitem']", "Restore").click();

    cy.get("[data-sonner-toast]").contains("restored").should("be.visible");
    cy.contains('[role="tab"]', "Active").click();
    cy.contains("e2e-restore-me", { timeout: 15000 }).should("be.visible");
  });

  it("deletes a board after confirming the alert dialog", () => {
    registerAndVisitDashboard();
    createBoardViaApi("e2e-delete-me");

    openRowActions("e2e-delete-me");
    cy.contains("[role='menuitem']", "Delete").click();

    cy.get("[role='alertdialog']").should("be.visible");
    cy.get("[role='alertdialog']")
      .contains("This will permanently delete")
      .should("be.visible");

    cy.get("[role='alertdialog']").contains("button", "Delete").click();

    cy.get("[role='alertdialog']").should("not.exist");
    cy.contains('[data-slot="table-body"]', "e2e-delete-me").should(
      "not.exist",
    );
  });

  it("keeps the board when the delete dialog is cancelled", () => {
    registerAndVisitDashboard();
    createBoardViaApi("e2e-keep-me");

    openRowActions("e2e-keep-me");
    cy.contains("[role='menuitem']", "Delete").click();
    cy.get("[role='alertdialog']").contains("button", "Cancel").click();

    cy.get("[role='alertdialog']").should("not.exist");
    cy.contains("e2e-keep-me").should("be.visible");
  });
});
