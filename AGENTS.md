# AGENTS.md

`svelte-crop` is a Svelte 5 (runes) component library that crops images and videos with drag, pinch-zoom/rotate, wheel-zoom, keyboard, and object-fit interactions. It is a rewrite of `react-easy-crop`. Drivers: `src/lib/Cropper.svelte` wires interaction; `src/lib/helpers.ts` holds the geometry (crop math, position restriction, object-fit sizing); `src/lib/types.ts` declares the public API.

## Commands

Use **bun** for anything dependency-related; `bun.lock` is the lockfile.

- `bun run check` — svelte-check + TS diagnostics
- `bun run lint` — eslint + dprint
- `bun run unit` — vitest over the geometry helpers
- `bun run e2e` — Playwright against the `/e2e` harness route
- `bun run build` — vite build, then `svelte-package` + publint

## Conventions

- Write in Svelte 5 runes: `$props`, `$state`, `$derived`, `$effect`, `$bindable`. Consumers drive the cropper through `bind:crop`, `bind:zoom`, `bind:rotation`, not callback props.
- KEEP geometry helpers positionally-parameterized: they run inside `requestAnimationFrame` drag/zoom handlers, where the "object args" TypeScript rule is intentionally skipped (see the code comment on `helpers.ts`).
- Extend the `/e2e` harness route (`src/routes/e2e/+page.svelte`) when a new prop needs browser coverage — it drives every scenario from URL query parameters that the Playwright suite feeds in.
- Naming: public function/event names keep the `react-easy-crop` spelling (`oncropcomplete`, `oncropareachange`, `onMediaLoaded`) except where Svelte idioms replace callbacks with `bind:`.

## Publishing

- Version with semver: while pre-1.0, features bump minor (`0.0.x` → `0.1.x`).
- Tag `vX.Y.Z`, push, then run `npm publish` — the npm registry requires an OTP the human must enter.
- `CHANGELOG.md` is auto-generated from GitHub releases; do not edit it by hand.