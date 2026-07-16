# @betterads/react-native

A thin `<AdPlayer />` wrapper for React Native, built on `react-native-video`.
Shares all session/event business logic with the web SDK via
[`@betterads/sdk-core/headless`](../sdk-core) — only the visibility signal
(`AppState` foreground/background here, vs. `IntersectionObserver` on the
web) and the video element (`react-native-video`, vs. a native `<video>`
tag) differ, per the migration brief's instruction not to port the DOM
approach 1:1.

> **Unverified on-device.** No React Native project or device/simulator was
> available to test this against. It compiles and typechecks cleanly
> against `react-native-video`'s types, but actual on-device playback
> behavior has not been validated. Treat this as a solid starting point,
> not a battle-tested package, until someone runs it on a real app.

## Install

```bash
npm install @betterads/react-native react-native-video
```

Peer dependencies: `react >=18`, `react-native >=0.71`, `react-native-video >=6`.
`react-native-video` needs its own native linking/setup — see
[its docs](https://github.com/TheWidlarzGroup/react-native-video) (works in
bare React Native and in Expo with a dev client; **not** Expo Go).

## Usage

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

## How viewability works here (vs. the web)

There's no scroll-based partial-visibility signal for a single native video
the way `IntersectionObserver` gives on the web. Instead, this package
treats "app is foregrounded while the component is mounted" as the
visibility signal via `AppState`, accumulating foreground time the same way
the DOM player accumulates intersection time, and only reports
`IMPRESSION_START` once that crosses `minViewabilityMs` (default 2000, same
floor the server enforces). If you need real on-screen visibility within a
scrolling list (e.g. a feed), you'll want to additionally gate rendering of
`<AdPlayer />` itself on your list's own viewability callback (e.g.
`FlatList`'s `onViewableItemsChanged`) — this package doesn't assume a list
context.

## Props

Same as [`@betterads/react`](../react)'s `<AdPlayer />` — `baseUrl`,
`siteKey`, `adId`, `locale`, `bundleId`, `minViewabilityMs`, `style`,
`onManifest`, `onEvent`, `onError`. `bundleId` isn't auto-detected (e.g. via
`expo-application`) to keep this package dependency-light — pass it
yourself if the registered `Site` has one configured.
