import { describe, expect, it, vi } from "vitest";
import { AdSessionController, ClientSequenceError } from "./controller.js";
import type { PlacementClient } from "./client.js";
import type { EventResponse, SessionResponse } from "./types.js";

function fakeManifest(overrides: Partial<SessionResponse> = {}): SessionResponse {
  return {
    sessionToken: "tok_abc",
    adId: 1,
    adVersionId: 2,
    videoUrl: "https://cdn.example.com/video.mp4",
    locale: "en",
    durationSeconds: 30,
    ...overrides,
  };
}

function fakeClient(overrides: Partial<PlacementClient> = {}): PlacementClient {
  return {
    createSession: vi.fn().mockResolvedValue(fakeManifest()),
    sendEvent: vi.fn().mockResolvedValue({ accepted: true, billed: true } satisfies EventResponse),
    ...overrides,
  } as unknown as PlacementClient;
}

describe("AdSessionController", () => {
  it("start() creates a session and stores the manifest", async () => {
    const client = fakeClient();
    const onManifest = vi.fn();
    const controller = new AdSessionController(client, { baseUrl: "https://api", siteKey: "site_1", adId: 1 }, { onManifest });

    const manifest = await controller.start();

    expect(client.createSession).toHaveBeenCalledWith("site_1", { adId: 1, locale: undefined, bundleId: undefined });
    expect(manifest.sessionToken).toBe("tok_abc");
    expect(controller.getManifest()).toEqual(manifest);
    expect(onManifest).toHaveBeenCalledWith(manifest);
  });

  it("rejects reportEvent before start() has resolved", async () => {
    const client = fakeClient();
    const controller = new AdSessionController(client, { baseUrl: "https://api", siteKey: "site_1", adId: 1 });

    await expect(controller.reportEvent("IMPRESSION_START")).rejects.toBeInstanceOf(ClientSequenceError);
    expect(client.sendEvent).not.toHaveBeenCalled();
  });

  it("rejects an out-of-order event without calling the network", async () => {
    const client = fakeClient();
    const controller = new AdSessionController(client, { baseUrl: "https://api", siteKey: "site_1", adId: 1 });
    await controller.start();

    await expect(controller.reportEvent("QUARTILE_25")).rejects.toBeInstanceOf(ClientSequenceError);
    expect(client.sendEvent).not.toHaveBeenCalled();
  });

  it("rejects a duplicate event without calling the network", async () => {
    const client = fakeClient();
    const controller = new AdSessionController(client, { baseUrl: "https://api", siteKey: "site_1", adId: 1 });
    await controller.start();

    await controller.reportEvent("IMPRESSION_START");
    (client.sendEvent as ReturnType<typeof vi.fn>).mockClear();

    await expect(controller.reportEvent("IMPRESSION_START")).rejects.toBeInstanceOf(ClientSequenceError);
    expect(client.sendEvent).not.toHaveBeenCalled();
  });

  it("accepts events in order and reports them to the server", async () => {
    const client = fakeClient();
    const onEvent = vi.fn();
    const controller = new AdSessionController(client, { baseUrl: "https://api", siteKey: "site_1", adId: 1 }, { onEvent });
    await controller.start();

    await controller.reportEvent("IMPRESSION_START");
    await controller.reportEvent("QUARTILE_25");
    await controller.reportEvent("QUARTILE_50");
    await controller.reportEvent("QUARTILE_75");
    await controller.reportEvent("COMPLETE");

    expect(client.sendEvent).toHaveBeenCalledTimes(5);
    expect(client.sendEvent).toHaveBeenNthCalledWith(1, "tok_abc", { eventType: "IMPRESSION_START", errorMessage: undefined });
    expect(onEvent).toHaveBeenCalledTimes(5);
    expect(controller.isTerminal()).toBe(true);
  });

  it("marks the session terminal after COMPLETE and rejects further events", async () => {
    const client = fakeClient();
    const controller = new AdSessionController(client, { baseUrl: "https://api", siteKey: "site_1", adId: 1 });
    await controller.start();
    await controller.reportEvent("IMPRESSION_START");
    await controller.reportEvent("QUARTILE_25");
    await controller.reportEvent("QUARTILE_50");
    await controller.reportEvent("QUARTILE_75");
    await controller.reportEvent("COMPLETE");

    await expect(controller.reportEvent("ERROR")).rejects.toBeInstanceOf(ClientSequenceError);
  });

  it("allows ERROR from any non-terminal state", async () => {
    const client = fakeClient();
    const controller = new AdSessionController(client, { baseUrl: "https://api", siteKey: "site_1", adId: 1 });
    await controller.start();

    await controller.reportEvent("ERROR", "playback failure");

    expect(client.sendEvent).toHaveBeenCalledWith("tok_abc", { eventType: "ERROR", errorMessage: "playback failure" });
    expect(controller.isTerminal()).toBe(true);
  });

  it("teardown() reports an abandonment ERROR if impression started but never finished", async () => {
    const client = fakeClient();
    const controller = new AdSessionController(client, { baseUrl: "https://api", siteKey: "site_1", adId: 1 });
    await controller.start();
    await controller.reportEvent("IMPRESSION_START");

    await controller.teardown();

    expect(client.sendEvent).toHaveBeenLastCalledWith("tok_abc", { eventType: "ERROR", errorMessage: "abandoned" });
  });

  it("teardown() is a no-op if no impression was ever started", async () => {
    const client = fakeClient();
    const controller = new AdSessionController(client, { baseUrl: "https://api", siteKey: "site_1", adId: 1 });
    await controller.start();

    await controller.teardown();

    expect(client.sendEvent).not.toHaveBeenCalled();
  });

  it("teardown() is a no-op if already terminal", async () => {
    const client = fakeClient();
    const controller = new AdSessionController(client, { baseUrl: "https://api", siteKey: "site_1", adId: 1 });
    await controller.start();
    await controller.reportEvent("IMPRESSION_START");
    await controller.reportEvent("ERROR", "oops");
    (client.sendEvent as ReturnType<typeof vi.fn>).mockClear();

    await controller.teardown();

    expect(client.sendEvent).not.toHaveBeenCalled();
  });
});
