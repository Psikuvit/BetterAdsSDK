import type { PlacementClient } from "./client.js";
import { EVENT_ORDER, PlacementApiError } from "./types.js";
import type { AdSessionConfig, EventResponse, EventType, SessionResponse } from "./types.js";

/** Thrown for a client-side ordering/single-use violation caught before any network call. */
export class ClientSequenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientSequenceError";
  }
}

export interface AdSessionCallbacks {
  onManifest?: (manifest: SessionResponse) => void;
  onEvent?: (type: EventType, response: EventResponse) => void;
  onError?: (error: unknown) => void;
}

/**
 * Framework/DOM-agnostic session + event lifecycle. Shared verbatim between
 * the DOM player (packages/sdk-core/src/dom-player.ts) and the React Native
 * wrapper (packages/react-native) so business logic -- session creation,
 * event ordering, single-use enforcement, retry -- isn't duplicated per
 * platform, per the migration brief's Phase 7 requirement.
 *
 * Mirrors (and fails fast on, client-side, ahead of a round-trip) the same
 * rules the server enforces: strict event ordering and single-use per event
 * type. This is a courtesy to the caller, not a trust boundary -- the server
 * remains authoritative.
 */
export class AdSessionController {
  private readonly client: PlacementClient;
  private readonly config: AdSessionConfig;
  private readonly callbacks: AdSessionCallbacks;

  private manifest: SessionResponse | null = null;
  private reported = new Set<EventType>();
  private terminal = false;

  constructor(client: PlacementClient, config: AdSessionConfig, callbacks: AdSessionCallbacks = {}) {
    this.client = client;
    this.config = config;
    this.callbacks = callbacks;
  }

  getManifest(): SessionResponse | null {
    return this.manifest;
  }

  isTerminal(): boolean {
    return this.terminal;
  }

  hasReported(type: EventType): boolean {
    return this.reported.has(type);
  }

  async start(): Promise<SessionResponse> {
    const manifest = await this.client.createSession(this.config.siteKey, {
      adId: this.config.adId,
      locale: this.config.locale,
      bundleId: this.config.bundleId,
    });
    this.manifest = manifest;
    this.callbacks.onManifest?.(manifest);
    return manifest;
  }

  async reportEvent(type: EventType, errorMessage?: string): Promise<EventResponse> {
    if (!this.manifest) {
      throw new ClientSequenceError("Cannot report an event before start() has resolved");
    }
    this.assertValidTransition(type);

    const response = await this.client.sendEvent(this.manifest.sessionToken, {
      eventType: type,
      errorMessage,
    });
    this.reported.add(type);
    if (type === "COMPLETE" || type === "ERROR") {
      this.terminal = true;
    }
    this.callbacks.onEvent?.(type, response);
    return response;
  }

  /**
   * Call on unmount/teardown. If playback started but never reached a
   * terminal state, best-effort reports an ERROR("abandoned") so the
   * session isn't left dangling with no signal about what happened to it.
   * Failures are swallowed -- this runs during teardown, nothing can react
   * to a rejected promise there anyway.
   */
  async teardown(): Promise<void> {
    if (this.terminal || !this.reported.has("IMPRESSION_START")) {
      return;
    }
    try {
      await this.reportEvent("ERROR", "abandoned");
    } catch (error) {
      this.callbacks.onError?.(error);
    }
  }

  private assertValidTransition(type: EventType): void {
    if (this.terminal) {
      throw new ClientSequenceError(`Session is already terminal, cannot report ${type}`);
    }
    if (type === "ERROR") {
      return;
    }
    if (this.reported.has(type)) {
      throw new ClientSequenceError(`Duplicate event: ${type}`);
    }
    const index = EVENT_ORDER.indexOf(type);
    for (let i = 0; i < index; i++) {
      const prerequisite = EVENT_ORDER[i]!;
      if (!this.reported.has(prerequisite)) {
        throw new ClientSequenceError(`Out-of-order event: ${type} before ${prerequisite}`);
      }
    }
  }
}

export { PlacementApiError };
