// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DomAdPlayer } from "./dom-player.js";
import type { PlacementClient } from "./client.js";
import type { EventResponse, SessionResponse } from "./types.js";

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);
  root = null;
  rootMargin = "";
  thresholds: number[] = [];

  triggerIntersecting(isIntersecting: boolean): void {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

function fakeManifest(overrides: Partial<SessionResponse> = {}): SessionResponse {
  return {
    sessionToken: "tok_abc",
    adId: 1,
    adVersionId: 2,
    videoUrl: "https://cdn.example.com/video.mp4",
    locale: "en",
    durationSeconds: 20,
    ...overrides,
  };
}

function fakeClient(manifest: SessionResponse = fakeManifest()): PlacementClient {
  return {
    createSession: vi.fn().mockResolvedValue(manifest),
    sendEvent: vi.fn().mockResolvedValue({ accepted: true, billed: true } satisfies EventResponse),
  } as unknown as PlacementClient;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("DomAdPlayer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeIntersectionObserver.instances = [];
    globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;
    // jsdom's <video>.play() throws "not implemented" by default -- stub it.
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not report IMPRESSION_START before 2s of accumulated visible time", async () => {
    const client = fakeClient();
    const container = document.createElement("div");
    const player = new DomAdPlayer(client, container, { baseUrl: "https://api", siteKey: "site_1", adId: 1 });

    await flushMicrotasks(); // let start() resolve and the <video> get created

    const observer = FakeIntersectionObserver.instances[0]!;
    observer.triggerIntersecting(true);

    await vi.advanceTimersByTimeAsync(1000);
    expect(client.sendEvent).not.toHaveBeenCalled();

    player.destroy();
  });

  it("reports IMPRESSION_START once accumulated visible time crosses the 2s floor", async () => {
    const client = fakeClient();
    const container = document.createElement("div");
    const player = new DomAdPlayer(client, container, { baseUrl: "https://api", siteKey: "site_1", adId: 1 });

    await flushMicrotasks();
    const observer = FakeIntersectionObserver.instances[0]!;
    observer.triggerIntersecting(true);

    await vi.advanceTimersByTimeAsync(2100);
    await flushMicrotasks();

    expect(client.sendEvent).toHaveBeenCalledWith("tok_abc", { eventType: "IMPRESSION_START", errorMessage: undefined });

    player.destroy();
  });

  it("pauses the visibility clock while not intersecting", async () => {
    const client = fakeClient();
    const container = document.createElement("div");
    const player = new DomAdPlayer(client, container, { baseUrl: "https://api", siteKey: "site_1", adId: 1 });

    await flushMicrotasks();
    const observer = FakeIntersectionObserver.instances[0]!;

    observer.triggerIntersecting(true);
    await vi.advanceTimersByTimeAsync(1000); // 1s visible
    observer.triggerIntersecting(false);
    await vi.advanceTimersByTimeAsync(5000); // hidden for 5s -- clock should not be running
    expect(client.sendEvent).not.toHaveBeenCalled();

    observer.triggerIntersecting(true);
    await vi.advanceTimersByTimeAsync(1100); // another ~1.1s visible -> crosses 2s total
    await flushMicrotasks();

    expect(client.sendEvent).toHaveBeenCalledWith("tok_abc", { eventType: "IMPRESSION_START", errorMessage: undefined });

    player.destroy();
  });

  it("destroy() removes the video element and stops the visibility poll", async () => {
    const client = fakeClient();
    const container = document.createElement("div");
    const player = new DomAdPlayer(client, container, { baseUrl: "https://api", siteKey: "site_1", adId: 1 });

    await flushMicrotasks();
    expect(container.querySelector("video")).not.toBeNull();

    player.destroy();

    expect(container.querySelector("video")).toBeNull();

    const observer = FakeIntersectionObserver.instances[0]!;
    observer.triggerIntersecting(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(client.sendEvent).not.toHaveBeenCalled(); // destroyed before impression could fire
  });

  it("destroy() best-effort reports abandonment if IMPRESSION_START already fired", async () => {
    const client = fakeClient();
    const container = document.createElement("div");
    const player = new DomAdPlayer(client, container, { baseUrl: "https://api", siteKey: "site_1", adId: 1 });

    await flushMicrotasks();
    const observer = FakeIntersectionObserver.instances[0]!;
    observer.triggerIntersecting(true);
    await vi.advanceTimersByTimeAsync(2100);
    await flushMicrotasks();
    expect(client.sendEvent).toHaveBeenCalledWith("tok_abc", { eventType: "IMPRESSION_START", errorMessage: undefined });

    player.destroy();
    await flushMicrotasks();

    expect(client.sendEvent).toHaveBeenLastCalledWith("tok_abc", { eventType: "ERROR", errorMessage: "abandoned" });
  });
});
