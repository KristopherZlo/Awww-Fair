import { useEffect, useState } from "react";
import { shouldExposeLocalHintMarkers } from "./localHints";

export function useLocalHintMarkers() {
  const [enabled, setEnabled] = useState(() => shouldExposeLocalHintMarkers());

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined" || typeof MutationObserver === "undefined") {
      return;
    }

    const sync = () => setEnabled(shouldExposeLocalHintMarkers());

    sync();
    window.addEventListener("local-hint-markers-change", sync);

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-local-hint-markers"] });

    return () => {
      window.removeEventListener("local-hint-markers-change", sync);
      observer.disconnect();
    };
  }, []);

  return enabled;
}
