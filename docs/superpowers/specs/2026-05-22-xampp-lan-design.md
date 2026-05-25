# XAMPP LAN Deployment Design

## Goal

Run Trend Market from XAMPP so other devices on the local network can open the full game, including API-backed lobbies, auth, ranked data, and MariaDB persistence.

## Approach

Apache is the LAN-facing server on port 80. It serves the built Vite app from `dist` at `/trendmarket/` and reverse-proxies `/trendmarket/api` and `/api` to the local Node server on `127.0.0.1:5176`.

The Node server stays bound to localhost because Apache is the public LAN entry point. It uses XAMPP MariaDB defaults unless `.env.xampp` overrides them.

## Components

- `apache/trendmarket-xampp.conf` contains the Apache include snippet.
- `server/xampp-env.mjs` loads optional `.env.xampp` values and applies safe XAMPP defaults.
- `server/xampp-api.mjs` starts the app/API server with those defaults.
- `server/xampp-migrate.mjs` runs MariaDB migrations with those defaults.
- `server/listen-config.mjs` formats LAN URLs with an optional public subpath.

## Data Flow

1. Browser opens `http://<LAN-IP>/trendmarket/`.
2. Apache serves files from `E:/xampp/htdocs/trendmarket/dist`.
3. Browser calls `/trendmarket/api/...` on the same host when opened from `/trendmarket/`.
4. Apache proxies `/trendmarket/api/...` to `http://127.0.0.1:5176/api/...`.
5. Node reads and writes MariaDB through `127.0.0.1:3306`.

## Error Handling

Apache returns the SPA `index.html` for unknown frontend routes under `/trendmarket/`. API errors remain owned by the Node handlers. MariaDB connection failures surface in the Node process and migration command output.

## Testing

Unit tests cover `.env.xampp` parsing/defaults and LAN URL formatting with `PUBLIC_PATH`. Build verification checks the production frontend can still be generated for Apache.
