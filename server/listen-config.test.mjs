import { describe, expect, it } from "vitest";
import { advertisedLanUrls, advertisedUrls, listenHost, publicPath } from "./listen-config.mjs";

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

  it("normalizes a public path for Apache subdirectory deployments", () => {
    expect(publicPath({ PUBLIC_PATH: " /trendmarket/ " })).toBe("trendmarket");
  });

  it("adds PUBLIC_PATH to fallback LAN URLs when Apache serves the app from a subdirectory", () => {
    const networkInterfaces = {
      Ethernet: [{ family: "IPv4", address: "192.168.1.24", internal: false }]
    };

    expect(advertisedLanUrls({ PUBLIC_PATH: "trendmarket" }, 80, { networkInterfaces })).toEqual([
      "http://192.168.1.24:80/trendmarket"
    ]);
  });

  it("prefers PUBLIC_URL over generated LAN URLs", () => {
    const networkInterfaces = {
      Ethernet: [{ family: "IPv4", address: "192.168.1.24", internal: false }]
    };

    expect(
      advertisedLanUrls({ PUBLIC_URL: "http://market.local/trendmarket/", PUBLIC_PATH: "ignored" }, 80, {
        networkInterfaces
      })
    ).toEqual(["http://market.local/trendmarket"]);
  });
});
