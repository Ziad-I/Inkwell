describe("Board Page", () => {
  beforeEach(() => {
    cy.visit("/board/test-room");
    cy.wait("@boardValidate");
    cy.get("canvas", { timeout: 10000 }).should("exist");
  });

  it("renders the toolbar with tool buttons", () => {
    cy.get('button[title="Brush"]').should("be.visible");
    cy.get('button[title="Eraser"]').should("be.visible");
    cy.get('button[title="Shapes"]').should("be.visible");
    cy.get('button[title="Selection"]').should("be.visible");
  });

  it("switches active tool on click", () => {
    cy.contains("brush").should("be.visible");
    cy.get('button[title="Eraser"]').click();
    cy.contains("eraser").should("be.visible");
  });

  it("collapses and expands tool settings", () => {
    cy.get('button[aria-label="Collapse settings"]').click();
    cy.get('button[aria-label="Expand settings"]').should("be.visible");
    cy.get('button[aria-label="Expand settings"]').click();
    cy.get('button[aria-label="Collapse settings"]').should("be.visible");
  });

  it("opens color settings panel", () => {
    cy.contains("Color").click();
    cy.contains("Color Settings").should("be.visible");
    cy.get("body").click(0, 0);
    cy.contains("Color Settings").should("not.exist");
  });

  it("opens size settings panel", () => {
    cy.contains("Size").click();
    cy.contains("Size Settings").should("be.visible");
    cy.get("body").click(0, 0);
    cy.contains("Size Settings").should("not.exist");
  });

  it("opens opacity settings panel", () => {
    cy.contains("Opacity").click();
    cy.contains("Opacity Settings").should("be.visible");
    cy.get("body").click(0, 0);
    cy.contains("Opacity Settings").should("not.exist");
  });

  it("opens line cap settings panel", () => {
    cy.contains("Line Cap").click();
    cy.contains("Line Cap Settings").should("be.visible");
    cy.contains("butt").should("be.visible");
    cy.contains("round").should("be.visible");
    cy.contains("square").should("be.visible");
    cy.get("body").click(0, 0);
    cy.contains("Line Cap Settings").should("not.exist");
  });

  it("opens shape kind settings panel", () => {
    cy.contains("Shape").click();
    cy.contains("Shapes").should("be.visible");
    cy.get("body").click(0, 0);
    cy.contains("Shapes").should("not.exist");
  });

  it("opens general settings panel", () => {
    cy.contains("General").click();
    cy.contains("General Settings").should("be.visible");
    cy.contains("Show Grid").should("be.visible");
    cy.get("body").click(0, 0);
    cy.contains("General Settings").should("not.exist");
  });

  it("opens presence info panel", () => {
    cy.contains("Presence").click();
    cy.contains("Presence Info").should("be.visible");
    cy.get("body").click(0, 0);
    cy.contains("Presence Info").should("not.exist");
  });
});
