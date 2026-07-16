import React, { useEffect, useRef, useState } from "react";
import { AppState, View, StyleSheet } from "react-native";
import type { AppStateStatus, StyleProp, ViewStyle } from "react-native";
import Video from "react-native-video";
import type { OnProgressData } from "react-native-video";
import {
  AdSessionController,
  ClientSequenceError,
  PlacementClient,
} from "@betterads/sdk-core/headless";
import type {
  EventResponse,
  EventType,
  SessionResponse,
} from "@betterads/sdk-core/headless";

export interface  AdPlayerProps {
  /** Base URL of the BetterAds backend, no trailing slash. */
  baseUrl: string;
  /** Non-secret site key from POST /api/sites. */
  siteKey: string;
  /** Which ad to render. */
  adId: number;
  locale?: string;
  /** App bundle ID, checked against the registered Site's bundleId (e.g. from expo-application or your native module of choice -- not auto-detected here to keep this package dependency-light). */
  bundleId?: string;
  /** Minimum accumulated foreground time (ms) before an impression counts. Default 2000, matching the server's floor. */
  minViewabilityMs?: number;
  style?: StyleProp<ViewStyle>;
  onManifest?: (manifest: SessionResponse) => void;
  onEvent?: (type: EventType, response: EventResponse) => void;
  onError?: (error: unknown) => void;
}

const DEFAULT_MIN_VIEWABILITY_MS = 2000;
const POLL_INTERVAL_MS = 250;

/**
 * React Native counterpart to @betterads/react's <AdPlayer />. Shares all
 * session/event business logic with the web SDK via
 * @betterads/sdk-core/headless -- only the visibility signal (AppState
 * foreground/background here, vs. IntersectionObserver on the web) and the
 * video element (react-native-video here, vs. a native <video> tag) differ,
 * per the migration brief's explicit instruction not to port the DOM
 * approach 1:1.
 */
export function AdPlayer(props: AdPlayerProps): React.JSX.Element {
  const { baseUrl, siteKey, adId, locale, bundleId, minViewabilityMs = DEFAULT_MIN_VIEWABILITY_MS, style, onManifest, onEvent, onError } = props;

  const [manifest, setManifest] = useState<SessionResponse | null>(null);
  const controllerRef = useRef<AdSessionController | null>(null);
  const visibleSinceRef = useRef<number | null>(null);
  const accumulatedVisibleMsRef = useRef(0);

  useEffect(() => {
    const client = new PlacementClient({ baseUrl });
    const controller = new AdSessionController(
      client,
      { baseUrl, siteKey, adId, locale, bundleId },
      {
        onManifest: (m) => {
          setManifest(m);
          onManifest?.(m);
        },
        onEvent,
        onError,
      },
    );
    controllerRef.current = controller;
    controller.start().catch((error) => onError?.(error));

    visibleSinceRef.current = AppState.currentState === "active" ? Date.now() : null;

    function handleAppStateChange(next: AppStateStatus): void {
      if (next === "active") {
        if (visibleSinceRef.current === null) visibleSinceRef.current = Date.now();
      } else if (visibleSinceRef.current !== null) {
        accumulatedVisibleMsRef.current += Date.now() - visibleSinceRef.current;
        visibleSinceRef.current = null;
      }
    }
    const subscription = AppState.addEventListener("change", handleAppStateChange);

    const pollHandle = setInterval(() => {
      const controllerNow = controllerRef.current;
      if (!controllerNow || controllerNow.hasReported("IMPRESSION_START")) {
        clearInterval(pollHandle);
        return;
      }
      const currentVisibleMs = visibleSinceRef.current !== null ? Date.now() - visibleSinceRef.current : 0;
      const totalVisibleMs = accumulatedVisibleMsRef.current + currentVisibleMs;
      if (totalVisibleMs >= minViewabilityMs) {
        reportSafely(controllerNow, "IMPRESSION_START", undefined, onError);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      subscription.remove();
      clearInterval(pollHandle);
      void controller.teardown();
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, siteKey, adId, locale, bundleId, minViewabilityMs]);

  function handleProgress(data: OnProgressData): void {
    const controller = controllerRef.current;
    if (!controller) return;
    const duration = manifest?.durationSeconds ?? data.seekableDuration;
    if (!duration || duration <= 0) return;
    const fraction = data.currentTime / duration;
    if (fraction >= 0.25) reportSafely(controller, "QUARTILE_25", undefined, onError);
    if (fraction >= 0.5) reportSafely(controller, "QUARTILE_50", undefined, onError);
    if (fraction >= 0.75) reportSafely(controller, "QUARTILE_75", undefined, onError);
  }

  function handleEnd(): void {
    const controller = controllerRef.current;
    if (controller) reportSafely(controller, "COMPLETE", undefined, onError);
  }

  function handleVideoError(error: unknown): void {
    const controller = controllerRef.current;
    if (controller) reportSafely(controller, "ERROR", String(error), onError);
    onError?.(error);
  }

  if (!manifest) {
    return <View style={style} />;
  }

  return (
    <View style={style}>
      <Video
        source={{ uri: manifest.videoUrl }}
        style={StyleSheet.absoluteFill}
        muted
        playInBackground={false}
        onProgress={handleProgress}
        onEnd={handleEnd}
        onError={handleVideoError}
      />
    </View>
  );
}

function reportSafely(
  controller: AdSessionController,
  type: EventType,
  errorMessage: string | undefined,
  onError: ((error: unknown) => void) | undefined,
): void {
  if (controller.hasReported(type) || controller.isTerminal()) return;
  controller.reportEvent(type, errorMessage).catch((error) => {
    if (error instanceof ClientSequenceError) return; // benign race
    onError?.(error);
  });
}
