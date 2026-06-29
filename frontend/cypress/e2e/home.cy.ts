describe("Home Page", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("loads the landing page with all major sections", () => {
    cy.contains("Inkwell").should("be.visible");
    cy.contains(/create.*collaborate/i).should("be.visible");
    cy.contains("Start Fresh").should("be.visible");
    cy.contains("Join Session").should("be.visible");
    cy.contains(/everything you need/i).should("be.visible");
    cy.contains(/built for creative collaboration/i).should("be.visible");
  });

  it("has a create board card with form fields", () => {
    cy.contains("Start Fresh").should("be.visible");
    cy.get('input[placeholder*="Your name"]').should("have.length", 2);
    cy.contains("Create Board").should("be.visible");
    cy.contains("Who can draw?").should("be.visible");
  });

  it("has a join board card with form fields", () => {
    cy.contains("Join Session").should("be.visible");
    cy.get('input[placeholder*="Room code"]').should("be.visible");
    cy.contains("Join Board").should("be.visible");
  });

  it("disables join button when room code is empty", () => {
    cy.contains("Join Board").should("be.disabled");
  });

  it("enables join button when room code is entered", () => {
    cy.get('input[placeholder*="Room code"]').type("test-room");
    cy.contains("Join Board").should("not.be.disabled");
  });

  it("navigates to board page on create with name", () => {
    cy.get('input[placeholder*="Your name"]').first().type("Alice");
    cy.contains("Create Board").click();
    cy.wait("@boardCreate");
    cy.url().should("match", /\/board\/board-123/);
  });

  it("navigates to board page on join", () => {
    cy.get('input[placeholder*="Room code"]').type("my-room");
    cy.contains("Join Board").click();
    cy.wait("@boardValidate");
    cy.url().should("match", /\/board\/my-room/);
  });
});
