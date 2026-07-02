# lightsoff_prototype_cursor

A small **Lights Off** (a.k.a. Lights Out) puzzle prototype built with React, TypeScript and Vite.

Press a tile to toggle it and its orthogonal neighbours. Clear the whole board to win.

## Getting started

```bash
pnpm install
pnpm dev
```

The dev server runs at http://localhost:5173/.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Vite dev server (hot reload). |
| `pnpm build` | Type-check (`tsc -b`) and build the production bundle. |
| `pnpm preview` | Serve the production build locally. |
| `pnpm lint` | Run ESLint over the project. |
| `pnpm test` | Run the Vitest unit/component test suite once. |
| `pnpm test:watch` | Run Vitest in watch mode. |

## Project layout

- `src/game/lightsOff.ts` — pure game logic (board creation, toggling, win detection, puzzle generation).
- `src/App.tsx` — the interactive game UI.
- `src/*.test.ts(x)` — Vitest tests for the logic and the component.
