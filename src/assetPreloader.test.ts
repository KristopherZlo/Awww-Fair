import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearImagePreloadCacheForTest, preloadImage, preloadImages } from "./assetPreloader";

let requestedSources: string[] = [];

class MockImage {
  decoding = "";
  private currentSrc = "";

  get src() {
    return this.currentSrc;
  }

  set src(value: string) {
    this.currentSrc = value;
    requestedSources.push(value);
  }
}

describe("assetPreloader", () => {
  beforeEach(() => {
    requestedSources = [];
    clearImagePreloadCacheForTest();
    Object.defineProperty(window, "Image", {
      configurable: true,
      value: MockImage as unknown as typeof Image
    });
  });

  afterEach(() => {
    clearImagePreloadCacheForTest();
  });

  it("starts loading each requested image in the background", () => {
    preloadImages(["/assets/customer-atlas-128.webp", "/assets/product-atlas.webp"]);

    expect(requestedSources).toEqual(["/assets/customer-atlas-128.webp", "/assets/product-atlas.webp"]);
  });

  it("does not request the same image twice", () => {
    preloadImage("/assets/cutscene/aaakh-01.webp");
    preloadImage("/assets/cutscene/aaakh-01.webp");

    expect(requestedSources).toEqual(["/assets/cutscene/aaakh-01.webp"]);
  });
});
