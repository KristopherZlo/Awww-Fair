import { describe, expect, it } from "vitest";
import { advertisedUrls, listenHost } from "./listen-config.mjs";

describe("listenHost", () => {
  it("defaults to listening on all interfaces for local LAN mode", () => {
    expect(listenHost({})).toBe("0.0.0.0");
  });

  it("uses HOST from the environment for production reverse proxy deployments", () => {
    expect(listenHost({ HOST: "127.0.0.1" })).toBe("127.0.0.1");
  });

  it("uses PUBLIC_URL as the advertised address when deployed behind a domain", () => {
    expect(advertisedUrls({ PUBLIC_URL: "https://awwwfair.zloyxp.cc/" }, ["http://145.223.90.151:443"])).toEqual([
      "https://awwwfair.zloyxp.cc"
    ]);
  });

  it("falls back to LAN URLs when PUBLIC_URL is not configured", () => {
    expect(advertisedUrls({}, ["http://10.0.0.8:5175"])).toEqual(["http://10.0.0.8:5175"]);
  });
});
