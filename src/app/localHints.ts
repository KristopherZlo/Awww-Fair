export function shouldExposeLocalHintMarkers() {
  return import.meta.env.DEV || (typeof document !== "undefined" && document.documentElement.dataset.localHintMarkers === "true");
}

export function localHintValue<T extends string | number>(value: T) {
  return shouldExposeLocalHintMarkers() ? value : undefined;
}

export function localHintMove(value: boolean) {
  return shouldExposeLocalHintMarkers() && value ? "true" : undefined;
}
