import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { render as renderAd } from "@betterads/sdk-core";
import type { AdPlayerHandle, EventResponse, EventType, SessionResponse } from "@betterads/sdk-core";

export interface AdPlayerProps {
  /** Base URL of the BetterAds backend, no trailing slash. */
  baseUrl: string;
  /** Non-secret site key from POST /api/sites. */
  siteKey: string;
  /** Which ad to render. */
  adId: number;
  locale?: string;
  bundleId?: string;
  className?: string;
  style?: CSSProperties;
  /** Minimum accumulated visible time (ms) before an impression counts. Default 2000, matching the server's floor. */
  minViewabilityMs?: number;
  onManifest?: (manifest: SessionResponse) => void;
  onEvent?: (type: EventType, response: EventResponse) => void;
  onError?: (error: unknown) => void;
}

/**
 * Thin wrapper around @betterads/sdk-core: mount -> render() into a ref'd
 * container div, unmount -> destroy() (which itself best-effort reports
 * session abandonment if playback started but never finished). No playback
 * logic lives here -- it's all in sdk-core, shared with @betterads/react-native.
 */
export function AdPlayer(props: AdPlayerProps): React.JSX.Element {
  const { baseUrl, siteKey, adId, locale, bundleId, className, style, minViewabilityMs, onManifest, onEvent, onError } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<AdPlayerHandle | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handle = renderAd(
      container,
      { baseUrl, siteKey, adId, locale, bundleId },
      { minViewabilityMs, onManifest, onEvent, onError },
    );
    handleRef.current = handle;

    return () => {
      handle.destroy();
      handleRef.current = null;
    };
    // Re-render (teardown + recreate) whenever the identity of what to play changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, siteKey, adId, locale, bundleId, minViewabilityMs]);

  return <div ref={containerRef} className={className} style={style} />;
}
