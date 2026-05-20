import { describe, expect, it } from "vitest";
import { appAssetUrl } from "./assetUrl";

describe("appAssetUrl", () => {
  it("uses root-relative asset URLs when Vite builds with relative base", () => {
    expect(appAssetUrl("product-atlas.png", "./")).toBe("/assets/product-atlas.png");
  });

  it("keeps configured absolute base paths for subdirectory deployments", () => {
    expect(appAssetUrl("music/main-menu.mp3", "/games/trendmarket/")).toBe("/games/trendmarket/assets/music/main-menu.mp3");
  });

  it("normalizes leading slashes in asset names", () => {
    expect(appAssetUrl("/customer-atlas-128.png", "/")).toBe("/assets/customer-atlas-128.png");
  });
});
