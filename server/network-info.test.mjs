import { describe, expect, it } from "vitest";
import { lanAddresses, lanUrls } from "./network-info.mjs";

const interfaces = {
  Loopback: [{ family: "IPv4", address: "127.0.0.1", internal: true }],
  Ethernet: [
    { family: "IPv4", address: "192.168.1.24", internal: false },
    { family: "IPv6", address: "fe80::1", internal: false }
  ],
  WiFi: [
    { family: 4, address: "10.0.0.8", internal: false },
    { family: "IPv4", address: "169.254.12.4", internal: false }
  ]
};

describe("network info", () => {
  it("collects external IPv4 LAN addresses and skips loopback, IPv6, and link-local addresses", () => {
    expect(lanAddresses(interfaces)).toEqual(["10.0.0.8", "192.168.1.24"]);
  });

  it("formats LAN URLs for the public app port", () => {
    expect(lanUrls(5175, { networkInterfaces: interfaces })).toEqual([
      "http://10.0.0.8:5175",
      "http://192.168.1.24:5175"
    ]);
  });
});
