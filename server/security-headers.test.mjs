import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY } from "./security-headers.mjs";

describe("security headers", () => {
  it("allows Blob image previews in the image policy", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("img-src 'self' data: https: blob:");
  });
});
