/**
 * Wire types for the BetterAds placements API (Phase 1 of the iframe -> SDK
 * migration). These mirror the backend's Java DTOs exactly:
 * - SessionRequest/SessionResponse (PlacementController.createSession)
 * - EventRequest/EventResponse (PlacementController.recordEvent)
 *
 * EventType values are the *exact* wire strings Jackson serializes a Java
 * enum to by default (the constant name) -- uppercase with underscores, not
 * the migration brief's lowercase prose ("impression_start").
 */

export type EventType =
  | "IMPRESSION_START"
  | "QUARTILE_25"
  | "QUARTILE_50"
  | "QUARTILE_75"
  | "COMPLETE"
  | "ERROR";

/** The order non-ERROR events must be reported in. */
export const EVENT_ORDER: readonly EventType[] = [
  "IMPRESSION_START",
  "QUARTILE_25",
  "QUARTILE_50",
  "QUARTILE_75",
  "COMPLETE",
];

export interface SessionRequest {
  adId: number;
  locale?: string;
  bundleId?: string;
}

export interface SessionResponse {
  sessionToken: string;
  adId: number;
  adVersionId: number;
  videoUrl: string;
  locale: string | null;
  durationSeconds: number | null;
}

export interface EventRequest {
  eventType: EventType;
  errorMessage?: string;
}

export interface EventResponse {
  accepted: boolean;
  billed: boolean;
}

/** The backend's GlobalExceptionHandler error envelope, returned on any non-2xx response. */
export interface ApiErrorBody {
  error: string;
  status: number;
  path: string;
  timestamp: string;
}

export class PlacementApiError extends Error {
  readonly status: number;
  readonly path?: string;

  constructor(message: string, status: number, path?: string) {
    super(message);
    this.name = "PlacementApiError";
    this.status = status;
    this.path = path;
  }
}

export interface AdSessionConfig {
  /** Base URL of the BetterAds backend, e.g. "https://api.example.com". No trailing slash. */
  baseUrl: string;
  /** Non-secret site key from POST /api/sites (safe to ship in client code). */
  siteKey: string;
  /**
   * Which ad to request a session for. Named `adId` (not `placementId`) to
   * match the actual Phase 1 backend contract -- there's no server-side
   * placement-resolution concept yet.
   */
  adId: number;
  /** BCP-47 locale hint, e.g. "en", "fr". Server falls back to its own default if omitted/unmatched. */
  locale?: string;
  /** Mobile bundle ID claim, checked against a Site's registered bundleId. Irrelevant for web. */
  bundleId?: string;
}
