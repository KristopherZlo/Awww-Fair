const preloadedImageSources = new Set<string>();

function imageConstructor(): typeof Image | null {
  if (typeof window !== "undefined" && typeof window.Image === "function") {
    return window.Image;
  }

  if (typeof Image === "function") {
    return Image;
  }

  return null;
}

export function preloadImage(source: string | null | undefined) {
  if (!source || preloadedImageSources.has(source)) {
    return;
  }

  const ImageCtor = imageConstructor();
  if (!ImageCtor) {
    return;
  }

  preloadedImageSources.add(source);
  const image = new ImageCtor();
  image.decoding = "async";
  image.src = source;
}

export function preloadImages(sources: readonly string[]) {
  sources.forEach(preloadImage);
}

export function clearImagePreloadCacheForTest() {
  preloadedImageSources.clear();
}
