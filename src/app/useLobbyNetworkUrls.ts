import { useEffect, useState } from "react";
import type { NetworkResponse } from "./types";

export function useLobbyNetworkUrls() {
  const [networkUrls, setNetworkUrls] = useState<string[]>([]);

  useEffect(() => {
    if (typeof fetch === "undefined") {
      return;
    }

    let disposed = false;

    async function loadNetworkUrls() {
      try {
        const response = await fetch("/api/network");
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as NetworkResponse;
        const urls = Array.isArray(payload.urls) ? payload.urls.filter((url): url is string => typeof url === "string") : [];
        if (!disposed) {
          setNetworkUrls(urls);
        }
      } catch {
        // Local hotseat mode can run without the lobby server.
      }
    }

    void loadNetworkUrls();
    return () => {
      disposed = true;
    };
  }, []);

  return networkUrls;
}
