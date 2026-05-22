import { describe, expect, it } from "vitest";
import { apiProxyTarget } from "./vite.config";

describe("vite config", () => {
  it("uses the selected lobby port for API proxying", () => {
    expect(apiProxyTarget({ LOBBY_PORT: "61999" })).toBe("http://127.0.0.1:61999");
  });
});
