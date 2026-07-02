# AGENTS.md

## Cursor Cloud specific instructions

This repo is a single **Lights Off** puzzle web app (React + TypeScript + Vite). There is one service to run: the Vite dev server.

- Package manager is **pnpm** (see `pnpm-lock.yaml`). The startup update script runs `pnpm install`.
- Standard commands live in `package.json` scripts (`dev`, `build`, `lint`, `test`, `preview`) and are documented in `README.md`.
- The dev server binds to `0.0.0.0:5173` (`server.host: true` in `vite.config.ts`); open http://localhost:5173/.
- Tests use Vitest with the `jsdom` environment (config is inline in `vite.config.ts`, setup in `src/test/setup.ts`). Run them with `pnpm test` (single run) — do not rely on the default watch mode in automation.
- `esbuild` (a Vite dependency) needs its install script to run. It is pre-approved via `pnpm.onlyBuiltDependencies` in `package.json`, so `pnpm install` sets it up without the interactive `pnpm approve-builds` prompt. Do not run `pnpm approve-builds` (it blocks on TTY input).
