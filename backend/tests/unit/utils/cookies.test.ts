import { describe, it, expect } from "vitest";

describe("getBoardAccessCookieName", () => {
  it("prefixes the board id", async () => {
    const { getBoardAccessCookieName } = await import("@/utils/cookies.js");
    expect(getBoardAccessCookieName("abc123")).toBe("board_access_abc123");
  });
});

describe("parseCookiesHeader", () => {
  it("parses a single cookie", async () => {
    const { parseCookiesHeader } = await import("@/utils/cookies.js");
    expect(parseCookiesHeader("board_access_abc=token-1")).toEqual({
      board_access_abc: "token-1",
    });
  });

  it("parses multiple cookies", async () => {
    const { parseCookiesHeader } = await import("@/utils/cookies.js");
    expect(parseCookiesHeader("a=1; b=2")).toEqual({ a: "1", b: "2" });
  });

  it("returns an empty object for no header", async () => {
    const { parseCookiesHeader } = await import("@/utils/cookies.js");
    expect(parseCookiesHeader(undefined)).toEqual({});
  });
});