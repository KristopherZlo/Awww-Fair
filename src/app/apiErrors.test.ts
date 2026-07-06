import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "./apiErrors";

describe("API error messages", () => {
  it("points XAMPP users to the Node API process when Apache returns 503", () => {
    const response = new Response("Service Unavailable", { status: 503 });

    expect(apiErrorMessage(response, "fallback", "API server", { pathname: "/trendmarket/" })).toMatch(/npm run xampp:api/);
  });

  it("keeps the LAN command outside the XAMPP public path", () => {
    const response = new Response("Service Unavailable", { status: 503 });

    expect(apiErrorMessage(response, "fallback", "API server", { pathname: "/" })).toMatch(/npm run lan/);
  });
});
