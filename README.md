# Awww Fair: Hat Hustle

> [!WARNING]
> This game was made as personal entertainment so I could play it with my girlfriend, not as a serious project.
>
> All art, including music, was generated with AI. If any artist wants to draw art or write music for it, I would be glad.

A cozy competitive market game about earning more than your rival by arranging products, reading customer wishes, and reacting to shifting trends.

## Screenshots

![Main menu](docs/screenshots/menu.png)

![Gameplay](docs/screenshots/gameplay.png)

## Game

- Play as rival market stalls across 8-round matches.
- Place products on your shelf and match customer tags to make sales.
- Follow market trends: the main trend is stronger, upcoming trends are previewed.
- Use influence cards to boost your products, weaken rival products, shift tags, or draw better cards.
- Complete party goals for coin bonuses.
- Buy stall upgrades after key rounds.
- Win by money, with sales used as a tiebreaker.

## Modes

- Campaign: 24 levels with gradually unlocked mechanics.
- Local 2-player hotseat.
- Versus AI with selectable difficulty.
- AI training mode.
- LAN lobby play through a local Node server.
- Ranked 1v1 accounts with MMR, leaderboard, and match history.

## Tech

- React 18 + TypeScript.
- Vite for development and production builds.
- Vitest, Testing Library, and jsdom for tests.
- Local game state persistence through `localStorage`.
- Optional TypeScript server for LAN lobbies, auth, MariaDB-backed ranked matches, and replay-checked MMR settlement.
- Generated WebP/PNG atlases for products, customers, cutscenes, music, and sound effects.

## Commands

```bash
npm install
npm run dev
npm test
npm run build
npm run lobby
npm run db:migrate
npm run lan
```

## Ranked Server Env

MariaDB: `MARIADB_HOST`, `MARIADB_PORT`, `MARIADB_USER`, `MARIADB_PASSWORD`, `MARIADB_DATABASE`.

OAuth: `APP_BASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`.

Local test login is disabled unless `AUTH_DEV_LOGIN=true`.
