# @betterads/sdk-core

Framework-agnostic core SDK for rendering a BetterAds video ad without an
iframe. Zero runtime dependencies, built with `tsup` (ESM + CJS + types).

## Install

```bash
npm install @betterads/sdk-core
```

## Usage (DOM)

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

`render()` creates a session against the placements API, injects a native
`<video>` (muted-autoplay first, falling back to a tap-to-play overlay if
even muted autoplay is blocked), tracks *real accumulated visible time* via
`IntersectionObserver` (not merely elapsed wall-clock time), and reports the
full playback-event lifecycle (`IMPRESSION_START` once 2s+ of visible time
has accumulated, `QUARTILE_25/50/75`, `COMPLETE`, `ERROR`) automatically.
`destroy()` tears down all listeners/timers and, if playback started but
never reached a terminal state, best-effort reports an abandonment `ERROR`.

## Non-DOM usage (`/headless`)

```ts
import { AdSessionController, PlacementClient } from "@betterads/sdk-core/headless";
```

The `/headless` subpath exports the session client and event state machine
with no DOM dependency — this is what `@betterads/react-native` builds on.
Use it directly if you need custom playback/viewability logic on a platform
that isn't the DOM or React Native (e.g. a custom video player).

## Backend contract

Talks to the BetterAds placements API exactly as built in Phase 1:

- `POST {baseUrl}/api/v1/placements/{siteKey}/session`
  Body: `{ adId, locale?, bundleId? }` →
  `{ sessionToken, adId, adVersionId, videoUrl, locale, durationSeconds }`
- `POST {baseUrl}/api/v1/placements/session/{sessionToken}/events`
  Body: `{ eventType, errorMessage? }` → `{ accepted, billed }`
  — `eventType` is one of the *exact* wire strings
  `"IMPRESSION_START" | "QUARTILE_25" | "QUARTILE_50" | "QUARTILE_75" | "COMPLETE" | "ERROR"`
  (uppercase-with-underscores; this is Jackson's default Java-enum
  serialization on the backend, not the migration brief's lowercase prose).

The server independently enforces event ordering, single-use-per-event-type,
and a minimum-elapsed-since-issuance floor before accepting
`IMPRESSION_START` (default 2000ms, `app.placements.min-viewability-ms`).
This SDK's client-side checks (`ClientSequenceError`) are a courtesy that
fails fast before a round-trip — the server remains authoritative.

## Bundle size

No runtime dependencies; built with `tsup`, minified, tree-shakeable
(`sideEffects: false`). Check `dist/index.js` after `pnpm build` for the
current size.
