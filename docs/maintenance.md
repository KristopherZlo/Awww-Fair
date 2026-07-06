# Trend Market Maintenance Notes

## Architecture Map

- `src/App.tsx` is the orchestration shell: it owns top-level React state, turn transitions, AI stepping, lobby state application, and screen composition.
- `src/app/types.ts` holds UI-facing app/session types shared across React, persistence, and lobby helpers.
- `src/app/gameConfig.ts` holds runtime knobs and defaults that must stay consistent between new games and restored games.
- `src/app/persistence.ts` owns localStorage loading, validation, and normalization for saved sessions and campaign progress.
- `src/app/lobbyClient.ts` owns browser lobby API constants, bearer-token headers, and response parsing.
- `src/app/presentation.ts` owns shared view formatting helpers for logs, scores, trends, and sale formulas.
- `src/components/` contains reusable JSX that has no authority over game state transitions.
- `src/styles.css` is only the CSS entrypoint. The real styles live in focused files under `src/styles/`.
- `server/lobby-server.ts` is the boot file. `server/lobby-handler.mjs` contains the testable LAN lobby handler.

## Test Profiles

- `npm test` runs the fast local suite and excludes the heavy AI balance check.
- `npm run test:watch` uses the same fast profile in watch mode.
- `npm run test:balance` runs only `src/game/aiSkillCheck.test.ts` with a long timeout.
- `npm run test:all` runs the full Vitest suite, including balance checks.
- Run `npm run build` after dependency, TypeScript, CSS import, or module-boundary changes.
- Run `npm audit --audit-level=moderate` before publishing or handing off security-sensitive work.

## LAN Lobby Security Assumptions

- The lobby server is intended for trusted LAN play, not direct public Internet exposure.
- State-changing lobby routes require a lobby token. Clients should send `Authorization: Bearer <token>`.
- Query/body token fallback exists only for short-term compatibility and should not be used by new clients.
- `ALLOWED_ORIGINS` restricts browser origins when set. Leave it unset only for local development.
- `LOBBY_MAX_BODY_BYTES`, `LOBBY_MAX_ROOMS`, and `LOBBY_ROOM_TTL_MS` bound request size and in-memory room retention.
- Static file serving must stay under the configured web root. Keep path traversal tests when touching server routing.
- Error responses should stay generic; do not leak filesystem paths, stack traces, or token details.

## Commit Policy

- Keep commits thematic: toolchain, tests, server hardening, app extraction, CSS, and docs should remain separate.
- Stage exact files only. Do not include user-owned untracked artifacts such as `README.md` or `docs/screenshots/*`.
- Prefer architecture docs and comments for invariants, browser constraints, security boundaries, and non-obvious migrations.
- Avoid boilerplate comments that restate obvious code.
- Preserve game modes and gameplay behavior unless a future task explicitly changes them.
