# FXPulse

FXPulse is a Discord bot built on **discord.js v14** (Node 18+) that surfaces FX and commodity prices from `https://finance.khorami.dev/api`. It delivers compact, indicator-rich embeds plus interactive controls (buttons, select menus, voice ticker) focused on trading UX.

## Features
- Slash-first workflow: `/fx`, `/settings`, `/voice-ticker`, `/demo`, `/help`, and a message context action.
- Finance API integration only—live price, trend badge, RSI/MACD/SMA/Bollinger/ATR data, and market-status handling.
- Interactive components: Refresh & interval buttons, watch/unwatch toggles, “Details” deep dive, and a “Pick Pair” select menu.
- MongoDB persistence for guild settings (allowed roles, locale, default interval, watchlist, voice ticker config).
- Voice ticker job that renames a voice channel with quotes, respects rate limits, backs off on closed markets, and restores the original name on disable.

## Quick Start
1. **Prerequisites**: Node 18+, npm, MongoDB URI, Discord application (bot token + client ID).
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Create `.env` (project root)**:
   ```bash
   DISCORD_TOKEN=your-bot-token
   DISCORD_CLIENT_ID=your-client-id
   MONGODB_URI=mongodb+srv://...
   # Optional overrides
   # FINANCE_API_BASE=https://finance.khorami.dev/api
   # UPDATE_INTERVAL_MS=30000
   # QUOTE_CACHE_TTL_MS=15000
   ```
4. **Run FXPulse**:
   ```bash
   npm start
   ```
   Startup validates env vars, connects to Mongo, registers slash/context commands, and begins serving interactions.

## Commands Overview
- `/help [command]` — Lists all commands or shows usage/options/permissions for one entry.
- `/fx price pair:<symbol> [interval] [ephemeral]` — Compact price card with refresh + interval buttons, watch toggles, and a pair select menu.
- `/fx analyze pair:<symbol> [interval]` — Adds RSI/MACD/SMA/Bollinger/Stochastic/ATR details plus a human-readable summary.
- `/fx watch add|remove pair:<symbol>` / `/fx watch list` — Manage the guild watchlist stored in Mongo.
- `/voice-ticker enable|disable|set-pairs|set-format|set-precision|show` — Configure the live voice-channel ticker (Admins/Manage Guild only).
- `/settings show|set-locale|allow-role|deny-role|list-roles|set-interval` — Guild-level defaults and role whitelisting for non-admin access.
- `/demo select-pair` — UX demo that exposes the quick-select menu.
- Message context `Summarize Market Info` — Detects a symbol in the selected message and replies with the compact price embed.

Autocomplete for `pair` searches popular instruments, the guild watchlist, and vendor-prefixed symbols (e.g., `ODANA:XAUUSD`).

## Project Layout
- `src/index.js` bootstraps env validation, Mongo, Discord client, and graceful shutdown.
- `src/client` contains listeners/handlers; `src/commands` houses slash/context logic grouped by feature.
- `src/services` wraps API and Mongo operations; `src/utils` supplies embed/component factories.
- `src/jobs/voiceTickerJob.js` schedules channel rename cycles with caching/backoff.

## Development Notes
- Use Node 18+ features and keep formatting consistent (4 spaces, semicolons).
- No automated tests yet—perform manual QA before deploying (slash command registration, permission gates, voice ticker behavior).
- The finance API is the single source of prices; do not mix other providers.

## Author
**Sadra Khorami**  
LinkedIn: [https://www.linkedin.com/in/khoramii/](https://www.linkedin.com/in/khoramii/)  
Discord: `wise.fox`

---
FXPulse • data via finance.khorami.dev
