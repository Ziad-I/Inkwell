import { describe, it, expect } from "vitest";

describe("frontend test setup", () => {
  it("runs a basic test", () => {
    expect(1 + 1).toBe(2);
  });

  it("has jest-dom matchers", () => {
    expect(document.body).toBeInTheDocument();
  });

  it("handles async operations", async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });
});
