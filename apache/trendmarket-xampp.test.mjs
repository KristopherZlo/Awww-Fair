import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("XAMPP Apache config", () => {
  it("proxies API requests from both root and the public app path", async () => {
    const config = await readFile("apache/trendmarket-xampp.conf", "utf8");

    expect(config).toContain('ProxyPass "/api" "http://127.0.0.1:5176/api"');
    expect(config).toContain('ProxyPass "/trendmarket/api" "http://127.0.0.1:5176/api"');
    expect(config.indexOf('ProxyPass "/trendmarket/api"')).toBeLessThan(config.indexOf('Alias "/trendmarket/"'));
  });

  it("sets anti-indexing and browser hardening headers at Apache", async () => {
    const config = await readFile("apache/trendmarket-xampp.conf", "utf8");

    expect(config).toContain("mod_headers");
    expect(config).toContain('Header always set X-Robots-Tag "noindex, nofollow, noarchive"');
    expect(config).toContain('Header always set X-Content-Type-Options "nosniff"');
    expect(config).toContain('Header always set X-Frame-Options "DENY"');
    expect(config).toContain("Content-Security-Policy");
    expect(config).toContain("img-src 'self' data: https: blob:");
  });
});
