import { describe, expect, it } from "vitest";
import { appAssetUrl } from "./assetUrl";

describe("appAssetUrl", () => {
  it("uses document-relative asset URLs when Vite builds with relative base", () => {
    expect(appAssetUrl("market-bg.webp", "./")).toBe("assets/market-bg.webp");
    expect(appAssetUrl("sounds/money.wav", ".")).toBe("assets/sounds/money.wav");
  });

  it("keeps configured absolute base paths for subdirectory deployments", () => {
    expect(appAssetUrl("music/main-menu.mp3", "/games/trendmarket/")).toBe("/games/trendmarket/assets/music/main-menu.mp3");
  });

  it("normalizes leading slashes in asset names", () => {
    expect(appAssetUrl("/cutscene/aaakh-01.webp", "/")).toBe("/assets/cutscene/aaakh-01.webp");
  });
});
