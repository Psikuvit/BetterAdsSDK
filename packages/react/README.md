# @betterads/react

A thin `<AdPlayer />` wrapper around [`@betterads/sdk-core`](../sdk-core)
for React web apps. All session/viewability/event logic lives in
`sdk-core` — this package is only a mount/unmount lifecycle shim.

## Install

```bash
npm install @betterads/react
# peer dependency:
npm install react
```

## Usage

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

On mount, `<AdPlayer />` calls `@betterads/sdk-core`'s `render()` against an
internal container `<div>`. On unmount (or if `adId`/`siteKey`/`baseUrl`/
`locale`/`bundleId`/`minViewabilityMs` change), it calls `destroy()`, which
tears down the video/observers and best-effort reports session abandonment
if playback started but never finished.

## Props

| Prop | Required | Description |
|---|---|---|
| `baseUrl` | yes | BetterAds backend base URL, no trailing slash. |
| `siteKey` | yes | Non-secret site key from `POST /api/sites`. |
| `adId` | yes | Which ad to render (see the root README for why this isn't `placementId`). |
| `locale` | no | BCP-47 locale hint. |
| `bundleId` | no | Irrelevant for web; present for API symmetry with the RN package. |
| `minViewabilityMs` | no | Default 2000ms, matching the server's floor. |
| `className` / `style` | no | Applied to the container `<div>`. |
| `onManifest` | no | Called once the session/manifest is created. |
| `onEvent` | no | Called after each successfully-reported playback event. |
| `onError` | no | Called on any client or network error. |
