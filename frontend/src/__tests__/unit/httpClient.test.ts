import { describe, expect, it } from "vitest";

import type { AxiosResponse } from "axios";
import { z } from "zod";

import { apiClient, parseResponse } from "@/api/client";
import { boardListResponseSchema } from "@/api/schemas";

import { httpError } from "../helpers/httpClient";

function httpResponse(data: unknown): AxiosResponse {
  return {
    data,
  } as AxiosResponse;
}

describe("API client defaults", () => {
  it("configures the shared client with a 15 second timeout and cookie credentials", () => {
    expect(apiClient.defaults.timeout).toBe(15_000);

    expect(apiClient.defaults.withCredentials).toBe(true);

    expect(apiClient.defaults.baseURL?.endsWith("/api")).toBe(true);

    expect(
      (apiClient.defaults.headers as Record<string, unknown>)["Content-Type"],
    ).toBe("application/json");
  });
});

describe("parseResponse", () => {
  it("returns the schema-parsed payload of a successful request", async () => {
    const payload = {
      boards: [
        {
          id: "b1",
          title: "Alpha",
          ownerId: "u1",
          defaultRole: "editor",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
          archivedAt: null,
        },
      ],
    };

    await expect(
      parseResponse(
        Promise.resolve(httpResponse(payload)),
        boardListResponseSchema,
      ),
    ).resolves.toEqual(payload);
  });

  it("propagates the original rejection untouched", async () => {
    const failure = httpError(503);

    await expect(
      parseResponse(Promise.reject(failure), boardListResponseSchema),
    ).rejects.toBe(failure);
  });

  it("throws a ZodError when the payload violates the schema", async () => {
    await expect(
      parseResponse(
        Promise.resolve(
          httpResponse({
            boards: "not-a-list",
          }),
        ),
        boardListResponseSchema,
      ),
    ).rejects.toBeInstanceOf(z.ZodError);
  });
});
