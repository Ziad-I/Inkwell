// Board page tests need a real board to exist (Socket.IO room:join rejects
// unknown rooms) and a real backend/Redis connection to reach the "ready"
// session state, so these tests create a board directly against the backend
// via cy.request and run against the live dev stack rather than stubbing
// the socket layer.
describe("Board Page", () => {
  beforeEach(() => {
    cy.request("POST", `${Cypress.env("apiUrl")}/boards`, {
      name: "e2e-test-board",
    }).then((res) => {
      cy.visit(`/board/${res.body.id}`);
      // The app only renders after restoreSession() resolves (src/main.tsx),
      // so gate on the toolbar existing first — otherwise the "Loading..."
      // check passes instantly against the blank bootstrap page.
      cy.get('[title="Brush"]', { timeout: 15000 }).should("be.visible");
      cy.contains("Loading...", { timeout: 15000 }).should("not.exist");
    });
  });

  it("loads the canvas and toolbar once the session is ready", () => {
    cy.get('[title="Brush"]').should("be.visible");
    cy.get('[title="Eraser"]').should("be.visible");
    cy.get('[title="Shapes"]').should("be.visible");
    cy.get('[title="Selection"]').should("be.visible");
    // Brush is activated automatically once the tool manager initializes.
    cy.contains("brush").should("be.visible");
  });

  it("switches the active tool when a toolbar button is clicked", () => {
    cy.get('[title="Eraser"]').click();
    cy.contains("eraser").should("be.visible");

    cy.get('[title="Selection"]').click();
    cy.contains("selection").should("be.visible");

    cy.get('[title="Shapes"]').click();
    cy.contains("shapes").should("be.visible");
  });

  it("switches to the eraser tool with the 'e' keyboard shortcut", () => {
    cy.get("body").type("e");
    cy.contains("eraser").should("be.visible");
  });

  it("selects a preset color from the color settings panel", () => {
    cy.contains("Color").click();
    cy.get('button[title="#ff0000"]').click();
    cy.get('input[type="color"]').should("have.value", "#ff0000");
  });

  it("shows local presence info in the presence panel", () => {
    cy.contains("Presence").click();
    cy.get('[aria-label="User color"]').should("be.visible");
    cy.get('[aria-label="User ID"]').should("be.visible");
  });

  it("shows the share dialog for the board owner", () => {
    // Anonymous guests always get the "editor" role, so create a real
    // account, own the board with it, and restore that session in the app.
    const username = `owner_${Date.now()}`;
    cy.request("POST", `${Cypress.env("apiUrl")}/auth/register`, {
      username,
      email: `${username}@e2e.test`,
      password: "password123",
    }).then((res) => {
      const { user, accessToken } = res.body;

      // Registered later than the global 401 stub, so this wins on boot.
      cy.intercept("POST", "**/api/auth/refresh", {
        statusCode: 200,
        body: { user, accessToken },
      });

      cy.request({
        method: "POST",
        url: `${Cypress.env("apiUrl")}/boards`,
        body: { name: "owner-board" },
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((boardRes) => {
        cy.visit(`/board/${boardRes.body.id}`);
        cy.get('[title="Brush"]', { timeout: 15000 }).should("be.visible");
        cy.contains("Loading...", { timeout: 15000 }).should("not.exist");
        cy.contains("button", "Share").click();
        cy.contains("Share board").should("be.visible");
        cy.contains("Create an invite link for this board").should(
          "be.visible",
        );
        cy.contains("button", "Create link").should("be.visible");
      });
    });
  });

  it("draws a stroke on the canvas with the brush tool", () => {
    cy.get(".konvajs-content canvas")
      .last()
      .then(($canvas) => {
        const canvas = $canvas[0] as HTMLCanvasElement;
        const ctx = canvas.getContext("2d")!;
        const before = ctx.getImageData(600, 400, 100, 20).data;

        cy.wrap($canvas)
          .trigger("pointerdown", {
            clientX: 600,
            clientY: 400,
            button: 0,
            force: true,
          })
          .trigger("pointermove", { clientX: 650, clientY: 400, force: true })
          .trigger("pointermove", { clientX: 700, clientY: 400, force: true })
          .trigger("pointerup", { clientX: 700, clientY: 400, force: true });

        cy.wrap(null).should(() => {
          const after = ctx.getImageData(600, 400, 100, 20).data;
          const changed = before.some((value, index) => value !== after[index]);
          expect(changed, "canvas pixels changed after drawing").to.equal(true);
        });
      });
  });
});
