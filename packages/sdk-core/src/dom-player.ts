import { AdSessionController, ClientSequenceError } from "./controller.js";
import type { PlacementClient } from "./client.js";
import type { AdSessionConfig, EventResponse, EventType, SessionResponse } from "./types.js";

export interface DomAdPlayerOptions {
  /** Minimum accumulated *visible* time, in ms, before IMPRESSION_START is reported. Matches the server's viewability floor (default 2000ms). */
  minViewabilityMs?: number;
  /** How often (ms) to poll accumulated visible time. */
  pollIntervalMs?: number;
  onManifest?: (manifest: SessionResponse) => void;
  onEvent?: (type: EventType, response: EventResponse) => void;
  onError?: (error: unknown) => void;
}

const DEFAULT_MIN_VIEWABILITY_MS = 2000;
const DEFAULT_POLL_INTERVAL_MS = 250;

export interface AdPlayerHandle {
  destroy(): void;
}

/**
 * The only DOM-touching piece of sdk-core. Renders a native <video> into
 * `container`, tracks real accumulated visible time via IntersectionObserver
 * (not merely "time since session issuance" -- a stronger, IAB-aligned
 * viewability check than the server's floor, which this is always
 * compatible with), and drives the shared AdSessionController through the
 * full playback-event lifecycle.
 */
export class DomAdPlayer implements AdPlayerHandle {
  private readonly controller: AdSessionController;
  private readonly container: HTMLElement;
  private readonly options: Required<Pick<DomAdPlayerOptions, "minViewabilityMs" | "pollIntervalMs">> &
    Pick<DomAdPlayerOptions, "onManifest" | "onEvent" | "onError">;

  private video: HTMLVideoElement | null = null;
  private overlay: HTMLButtonElement | null = null;
  private observer: IntersectionObserver | null = null;
  private pollHandle: ReturnType<typeof setInterval> | null = null;

  private visibleSince: number | null = null;
  private accumulatedVisibleMs = 0;
  private destroyed = false;

  constructor(client: PlacementClient, container: HTMLElement, config: AdSessionConfig, options: DomAdPlayerOptions = {}) {
    this.container = container;
    this.options = {
      minViewabilityMs: options.minViewabilityMs ?? DEFAULT_MIN_VIEWABILITY_MS,
      pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      onManifest: options.onManifest,
      onEvent: options.onEvent,
      onError: options.onError,
    };
    this.controller = new AdSessionController(client, config, {
      onManifest: (manifest) => this.options.onManifest?.(manifest),
      onEvent: (type, response) => this.options.onEvent?.(type, response),
      onError: (error) => this.options.onError?.(error),
    });

    this.init().catch((error) => this.options.onError?.(error));
  }

  private async init(): Promise<void> {
    const manifest = await this.controller.start();
    if (this.destroyed) return;

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.autoplay = true;
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.display = "block";
    video.src = manifest.videoUrl;
    this.video = video;
    this.container.appendChild(video);

    video.addEventListener("loadedmetadata", () => this.checkQuartiles());
    video.addEventListener("timeupdate", () => this.checkQuartiles());
    video.addEventListener("ended", () => this.reportSafely("COMPLETE"));
    video.addEventListener("error", () => {
      const message = video.error?.message ?? "video playback error";
      this.reportSafely("ERROR", message);
    });

    this.attemptAutoplay(video);
    this.setupVisibilityTracking(video);
  }

  private attemptAutoplay(video: HTMLVideoElement): void {
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // Autoplay (even muted) was blocked -- fall back to a tap-to-play overlay.
        this.showTapToPlayOverlay(video);
      });
    }
  }

  private showTapToPlayOverlay(video: HTMLVideoElement): void {
    if (this.overlay || this.destroyed) return;
    const overlay = document.createElement("button");
    overlay.type = "button";
    overlay.textContent = "Tap to play";
    overlay.setAttribute("aria-label", "Play video");
    Object.assign(overlay.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.5)",
      color: "#fff",
      border: "none",
      cursor: "pointer",
      font: "14px sans-serif",
    } satisfies Partial<CSSStyleDeclaration>);
    this.container.style.position = this.container.style.position || "relative";
    overlay.addEventListener("click", () => {
      video.play().catch((error) => this.options.onError?.(error));
      overlay.remove();
      this.overlay = null;
    });
    this.container.appendChild(overlay);
    this.overlay = overlay;
  }

  private setupVisibilityTracking(video: HTMLVideoElement): void {
    if (typeof IntersectionObserver === "undefined") {
      // No IntersectionObserver support -- fail open and treat as immediately
      // visible rather than never reporting an impression at all.
      this.visibleSince = Date.now();
    } else {
      this.observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) return;
          if (entry.isIntersecting) {
            if (this.visibleSince === null) this.visibleSince = Date.now();
          } else if (this.visibleSince !== null) {
            this.accumulatedVisibleMs += Date.now() - this.visibleSince;
            this.visibleSince = null;
          }
        },
        { threshold: 0.5 },
      );
      this.observer.observe(video);
    }

    this.pollHandle = setInterval(() => this.checkViewability(), this.options.pollIntervalMs);
  }

  private checkViewability(): void {
    if (this.controller.hasReported("IMPRESSION_START")) {
      if (this.pollHandle) {
        clearInterval(this.pollHandle);
        this.pollHandle = null;
      }
      return;
    }
    const currentVisibleMs = this.visibleSince !== null ? Date.now() - this.visibleSince : 0;
    const totalVisibleMs = this.accumulatedVisibleMs + currentVisibleMs;
    if (totalVisibleMs >= this.options.minViewabilityMs) {
      this.reportSafely("IMPRESSION_START");
    }
  }

  private checkQuartiles(): void {
    const video = this.video;
    if (!video) return;
    const manifest = this.controller.getManifest();
    const duration = manifest?.durationSeconds ?? (Number.isFinite(video.duration) ? video.duration : null);
    if (!duration || duration <= 0) return;

    const fraction = video.currentTime / duration;
    if (fraction >= 0.25) this.reportSafely("QUARTILE_25");
    if (fraction >= 0.5) this.reportSafely("QUARTILE_50");
    if (fraction >= 0.75) this.reportSafely("QUARTILE_75");
  }

  private reportSafely(type: EventType, errorMessage?: string): void {
    if (this.controller.hasReported(type) || this.controller.isTerminal()) return;
    this.controller.reportEvent(type, errorMessage).catch((error) => {
      if (error instanceof ClientSequenceError) return; // benign race, already reported/ordered elsewhere
      this.options.onError?.(error);
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.pollHandle) clearInterval(this.pollHandle);
    this.observer?.disconnect();
    this.overlay?.remove();
    if (this.video) {
      this.video.pause();
      this.video.remove();
    }

    void this.controller.teardown();
  }
}
