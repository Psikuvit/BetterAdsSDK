import { PlacementClient } from "./client.js";
import { DomAdPlayer } from "./dom-player.js";
import type { DomAdPlayerOptions, AdPlayerHandle } from "./dom-player.js";
import type { AdSessionConfig } from "./types.js";

export type { AdSessionConfig, EventType, SessionResponse, EventResponse } from "./types.js";
export { PlacementApiError } from "./types.js";
export type { AdPlayerHandle, DomAdPlayerOptions } from "./dom-player.js";

/**
 * Renders a BetterAds video ad into `container` -- no iframe. Creates a
 * session against the placements API, tracks real viewability, and reports
 * the playback-event lifecycle automatically.
 *
 * @example
 * const handle = BetterAds.render(document.getElementById("ad-slot")!, {
 *   baseUrl: "https://api.betterads.example.com",
 *   siteKey: "site_xxx",
 *   adId: 123,
 * });
 * // later, e.g. on route change / component unmount:
 * handle.destroy();
 */
export function render(
  container: HTMLElement,
  config: AdSessionConfig,
  options?: DomAdPlayerOptions,
): AdPlayerHandle {
  const client = new PlacementClient({ baseUrl: config.baseUrl });
  return new DomAdPlayer(client, container, config, options);
}

export const BetterAds = { render };
export default BetterAds;
