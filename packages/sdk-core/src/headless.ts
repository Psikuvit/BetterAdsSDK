/**
 * Non-DOM subpath entry (`@betterads/sdk-core/headless`): the session
 * client + event state machine, with no `window`/`document`/`IntersectionObserver`
 * dependency. Consumed directly by @betterads/react-native, which supplies
 * its own visibility signal (AppState) and video element
 * (react-native-video) instead of the DOM player's.
 */
export { PlacementClient } from "./client.js";
export type { PlacementClientOptions } from "./client.js";

export { AdSessionController, ClientSequenceError } from "./controller.js";
export type { AdSessionCallbacks } from "./controller.js";

export {
  EVENT_ORDER,
  PlacementApiError,
} from "./types.js";
export type {
  AdSessionConfig,
  ApiErrorBody,
  EventRequest,
  EventResponse,
  EventType,
  SessionRequest,
  SessionResponse,
} from "./types.js";
