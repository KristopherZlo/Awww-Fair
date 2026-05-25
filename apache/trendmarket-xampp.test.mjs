import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("XAMPP Apache config", () => {
  it("proxies API requests from both root and the public app path", async () => {
    const config = await readFile("apache/trendmarket-xampp.conf", "utf8");

    expect(config).toContain('ProxyPass "/api" "http://127.0.0.1:5176/api"');
    expect(config).toContain('ProxyPass "/trendmarket/api" "http://127.0.0.1:5176/api"');
    expect(config.indexOf('ProxyPass "/trendmarket/api"')).toBeLessThan(config.indexOf('Alias "/trendmarket/"'));
  });
});
