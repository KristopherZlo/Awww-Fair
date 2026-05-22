/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export function apiProxyTarget(env: Partial<Record<string, string | undefined>> = process.env) {
  return `http://127.0.0.1:${Number(env.LOBBY_PORT ?? 5176)}`;
}

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    proxy: {
      "/api": apiProxyTarget()
    }
  },
  test: {
    environment: "jsdom",
    globals: true
  }
});
