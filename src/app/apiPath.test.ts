import { describe, expect, it } from "vitest";
import { apiPath, normalizeApiAssetUrl } from "./apiPath";

describe("API path helpers", () => {
  it("keeps API requests at the host root when the app runs from the site root", () => {
    expect(apiPath("auth/profile", { baseUrl: "./", pathname: "/" })).toBe("/api/auth/profile");
    expect(apiPath("/ranked/abandon", { baseUrl: "./", pathname: "/index.html" })).toBe("/api/ranked/abandon");
  });

  it("routes API requests through the public app path when XAMPP serves the app from a subdirectory", () => {
    expect(apiPath("auth/profile", { baseUrl: "./", pathname: "/trendmarket/" })).toBe("/trendmarket/api/auth/profile");
    expect(apiPath("/ranked/abandon", { baseUrl: "./", pathname: "/trendmarket/index.html" })).toBe("/trendmarket/api/ranked/abandon");
  });

  it("uses an absolute Vite base path when one is configured", () => {
    expect(apiPath("auth/profile", { baseUrl: "/trendmarket/", pathname: "/" })).toBe("/trendmarket/api/auth/profile");
  });

  it("builds OAuth links and normalizes API asset URLs with the same base", () => {
    expect(apiPath("auth/google/start", { baseUrl: "./", pathname: "/trendmarket/" })).toBe("/trendmarket/api/auth/google/start");
    expect(normalizeApiAssetUrl("/api/auth/avatar/a.png", { baseUrl: "./", pathname: "/trendmarket/" })).toBe("/trendmarket/api/auth/avatar/a.png");
    expect(normalizeApiAssetUrl("https://cdn.example/avatar.png", { baseUrl: "./", pathname: "/trendmarket/" })).toBe("https://cdn.example/avatar.png");
  });
});
