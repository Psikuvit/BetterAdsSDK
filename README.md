# betterads-sdk

Client SDKs for BetterAds' iframe-free ad placement API (Phase 1 of the
[iframe → SDK migration](../../IdeaProjects/BetterAds) — see that repo's
`docs/phase1-fraud-comparison.md` and `ARCHITECTURE.md` for the backend
side of this). Three packages, one shared core:

| Package | What it is |
|---|---|
| [`@betterads/sdk-core`](./packages/sdk-core) | Framework-agnostic core: session creation, viewability tracking, playback-event reporting, a `<video>`-based DOM player. Zero runtime dependencies. |
| [`@betterads/react`](./packages/react) | A thin `<AdPlayer />` wrapper around `sdk-core` for web React apps. |
| [`@betterads/react-native`](./packages/react-native) | A thin `<AdPlayer />` wrapper for React Native, built on `react-native-video`, sharing all session/event logic with `sdk-core` via its `/headless` entry point. |

## Status

This is a new, unpublished project. Everything here builds, typechecks, and
has unit test coverage (`pnpm test`), but:
- **Not published to npm yet.** Consume it locally via the pnpm workspace,
  or `npm pack`/`npm link` a package's `dist/` output, until it's published.
- **`@betterads/react-native` is untested on an actual device/simulator** —
  no RN project or device was available to validate against. It compiles
  and typechecks against `react-native-video`'s types; on-device playback
  behavior is unverified.
- **No live integration test against a running BetterAds backend** in this
  pass — the client is written to match the documented Phase 1 API contract
  exactly (see "Backend contract" in each package's README), but hasn't been
  exercised against a live server end-to-end.

## Why `adId`, not `placementId`

The original migration brief describes the SDK's public surface as
`render(container, { siteKey, placementId })`. The actual Phase 1 backend
only understands `{ adId, locale, bundleId }` — there's no server-side
placement-resolution concept yet (that's a later phase, not built). Rather
than invent a `placementId` abstraction that doesn't exist server-side,
every package here names the field `adId`, matching the real API. If a real
placement concept ships later, expect an additive change here, not a silent
remapping.

## Development

```bash
pnpm install
pnpm build       # builds all three packages (tsup: ESM + CJS + .d.ts)
pnpm typecheck
pnpm test        # vitest, run once across the whole workspace
```

Packages depend on each other via `workspace:*` — no publishing needed to
develop against the latest local code.
