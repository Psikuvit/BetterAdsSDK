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

## Install

Not published to npm yet — see [Status](#status) below for how to consume it
in the meantime. Once published:

```bash
# Web (framework-agnostic)
npm install @betterads/sdk-core

# React (web)
npm install @betterads/react

# React Native
npm install @betterads/react-native react-native-video
```

## Usage

### Plain web / DOM

```ts
import { BetterAds } from "@betterads/sdk-core";

const handle = BetterAds.render(document.getElementById("ad-slot")!, {
  baseUrl: "https://api.betterads.example.com",
  siteKey: "site_xxx", // from POST /api/sites
  adId: 123,
  locale: "en", // optional
});

// later, e.g. on route change or component teardown:
handle.destroy();
```

`render()` creates a session, injects a native `<video>` (muted-autoplay
first, falling back to a tap-to-play overlay if even muted autoplay is
blocked), tracks real accumulated visible time via `IntersectionObserver`,
and reports the playback-event lifecycle (`IMPRESSION_START`, `QUARTILE_25`,
`QUARTILE_50`, `QUARTILE_75`, `COMPLETE`, `ERROR`) automatically.
`destroy()` tears everything down and, if playback started but never
finished, best-effort reports an abandonment `ERROR`.

### React (web)

```tsx
import { AdPlayer } from "@betterads/react";

function AdSlot() {
  return (
    <AdPlayer
      baseUrl="https://api.betterads.example.com"
      siteKey="site_xxx"
      adId={123}
      locale="en"
      style={{ aspectRatio: "16 / 9", width: "100%" }}
      onEvent={(type, response) => console.log(type, response)}
      onError={(error) => console.error(error)}
    />
  );
}
```

`<AdPlayer />` calls `sdk-core`'s `render()` on mount and `destroy()` on
unmount (or when `adId`/`siteKey`/`baseUrl`/`locale` change) — see the
[full prop table](./packages/react) for every option.

### React Native

```tsx
import { AdPlayer } from "@betterads/react-native";

function AdSlot() {
  return (
    <AdPlayer
      baseUrl="https://api.betterads.example.com"
      siteKey="site_xxx"
      adId={123}
      locale="en"
      style={{ width: "100%", aspectRatio: 16 / 9 }}
      onEvent={(type, response) => console.log(type, response)}
      onError={(error) => console.error(error)}
    />
  );
}
```

Built on `react-native-video` (a peer dependency you must install and link
yourself — works in bare RN and Expo with a dev client, not Expo Go).
Same props as `@betterads/react`; see [its README](./packages/react-native)
for how viewability is determined without `IntersectionObserver`.

### Headless / custom players (`sdk-core/headless`)

```ts
import { AdSessionController, PlacementClient } from "@betterads/sdk-core/headless";
```

No-DOM session client and event state machine — what `@betterads/react-native`
is built on. Use it directly if you're driving a custom video player on a
platform that's neither the DOM nor React Native.

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
