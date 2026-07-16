import type {
  ApiErrorBody,
  EventRequest,
  EventResponse,
  SessionRequest,
  SessionResponse,
} from "./types.js";
import { PlacementApiError } from "./types.js";

export interface PlacementClientOptions {
  baseUrl: string;
  /** Injectable for tests / non-browser runtimes (React Native has a global fetch too, but this keeps the door open). */
  fetchImpl?: typeof fetch;
}

/**
 * Thin fetch wrapper around the placements session + event API. Framework
 * and DOM agnostic -- safe to use from the web player and the React Native
 * wrapper alike.
 */
export class PlacementClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PlacementClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async createSession(siteKey: string, body: SessionRequest): Promise<SessionResponse> {
    return this.postJson<SessionResponse>(
      `/api/v1/placements/${encodeURIComponent(siteKey)}/session`,
      body,
    );
  }

  async sendEvent(sessionToken: string, body: EventRequest): Promise<EventResponse> {
    return this.postJson<EventResponse>(
      `/api/v1/placements/session/${encodeURIComponent(sessionToken)}/events`,
      body,
      { retryOnceOnNetworkFailure: true },
    );
  }

  private async postJson<T>(
    path: string,
    body: unknown,
    opts: { retryOnceOnNetworkFailure?: boolean } = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (networkError) {
      if (opts.retryOnceOnNetworkFailure) {
        try {
          response = await this.fetchImpl(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        } catch {
          throw new PlacementApiError(
            (networkError as Error).message || "Network request failed",
            0,
          );
        }
      } else {
        throw new PlacementApiError((networkError as Error).message || "Network request failed", 0);
      }
    }

    if (!response.ok) {
      let parsed: Partial<ApiErrorBody> | undefined;
      try {
        parsed = (await response.json()) as ApiErrorBody;
      } catch {
        // body wasn't JSON (or was empty) -- fall through to a generic message
      }
      throw new PlacementApiError(
        parsed?.error ?? `Request failed with status ${response.status}`,
        response.status,
        parsed?.path,
      );
    }

    return (await response.json()) as T;
  }
}
