describe("Invite Page", () => {
  it("shows the invite details for a valid invite", () => {
    cy.intercept("GET", "**/api/invites/valid-token", {
      statusCode: 200,
      body: {
        boardId: "board-1",
        boardName: "Team Whiteboard",
        role: "editor",
        expiresAt: null,
        valid: true,
      },
    }).as("getInvite");

    cy.visit("/invite/valid-token");
    cy.wait("@getInvite");

    cy.contains("You've been invited to collaborate").should("be.visible");
    cy.contains("Team Whiteboard").should("be.visible");
    cy.contains("Editor").should("be.visible");
    cy.contains("This invite never expires").should("be.visible");
    cy.contains("button", "Join board").should("be.visible");
  });

  it("shows a formatted expiry date for an invite that expires in the future", () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    cy.intercept("GET", "**/api/invites/valid-token", {
      statusCode: 200,
      body: {
        boardId: "board-1",
        boardName: "Team Whiteboard",
        role: "viewer",
        expiresAt: future.toISOString(),
        valid: true,
      },
    }).as("getInvite");

    cy.visit("/invite/valid-token");
    cy.wait("@getInvite");

    cy.contains("Viewer").should("be.visible");
    cy.contains("Expires").should("be.visible");
  });

  it("joins the board and navigates to it on success", () => {
    cy.intercept("GET", "**/api/invites/valid-token", {
      statusCode: 200,
      body: {
        boardId: "board-1",
        boardName: "Team Whiteboard",
        role: "viewer",
        expiresAt: null,
        valid: true,
      },
    }).as("getInvite");
    cy.intercept("POST", "**/api/invites/redeem", {
      statusCode: 200,
      body: { boardId: "board-1" },
    }).as("redeem");

    cy.visit("/invite/valid-token");
    cy.wait("@getInvite");
    cy.contains("button", "Join board").click();
    cy.wait("@redeem");
    cy.url().should("match", /\/board\/board-1$/);
  });

  it("shows an error toast when joining fails", () => {
    cy.intercept("GET", "**/api/invites/valid-token", {
      statusCode: 200,
      body: {
        boardId: "board-1",
        boardName: "Team Whiteboard",
        role: "editor",
        expiresAt: null,
        valid: true,
      },
    }).as("getInvite");
    cy.intercept("POST", "**/api/invites/redeem", {
      statusCode: 400,
      body: { message: "This invitation has already been used" },
    }).as("redeem");

    cy.visit("/invite/valid-token");
    cy.wait("@getInvite");
    cy.contains("button", "Join board").click();
    cy.wait("@redeem");

    cy.contains("This invitation has already been used").should("be.visible");
    cy.url().should("include", "/invite/valid-token");
  });

  it("shows an expired message for an expired invite", () => {
    cy.intercept("GET", "**/api/invites/expired-token", {
      statusCode: 200,
      body: {
        boardId: "board-1",
        boardName: "Team Whiteboard",
        role: "editor",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        valid: false,
      },
    }).as("getInvite");

    cy.visit("/invite/expired-token");
    cy.wait("@getInvite");

    cy.contains("Invite no longer valid").should("be.visible");
    cy.contains("This invitation has expired").should("be.visible");
    cy.contains("button", "Join board").should("not.exist");
  });

  it("shows a revoked message for an invalid, non-expired invite", () => {
    cy.intercept("GET", "**/api/invites/revoked-token", {
      statusCode: 200,
      body: {
        boardId: "board-1",
        boardName: "Team Whiteboard",
        role: "editor",
        expiresAt: null,
        valid: false,
      },
    }).as("getInvite");

    cy.visit("/invite/revoked-token");
    cy.wait("@getInvite");

    cy.contains("Invite no longer valid").should("be.visible");
    cy.contains(/revoked or has reached its use limit/i).should("be.visible");
  });

  it("shows a not-found message for a nonexistent invite", () => {
    cy.intercept("GET", "**/api/invites/missing-token", {
      statusCode: 404,
      body: { message: "Invite not found" },
    }).as("getInvite");

    cy.visit("/invite/missing-token");
    cy.wait("@getInvite");

    cy.contains("Invite not found").should("be.visible");
  });

  it("navigates home via the maybe later link", () => {
    cy.intercept("GET", "**/api/invites/valid-token", {
      statusCode: 200,
      body: {
        boardId: "board-1",
        boardName: "Team Whiteboard",
        role: "editor",
        expiresAt: null,
        valid: true,
      },
    }).as("getInvite");

    cy.visit("/invite/valid-token");
    cy.wait("@getInvite");
    cy.contains("Maybe later").click();
    cy.url().should("eq", `${Cypress.config("baseUrl")}/`);
  });
});
