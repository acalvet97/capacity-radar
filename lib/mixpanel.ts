import mixpanel from "mixpanel-browser";

let initialized = false;

/**
 * Call once in the browser (e.g. from `MixpanelProvider`). Set
 * `NEXT_PUBLIC_MIXPANEL_TOKEN` in `.env.local` (and optionally
 * `NEXT_PUBLIC_MIXPANEL_API_HOST` if not using the EU data residency host).
 */
export function initMixpanel(): void {
  if (typeof window === "undefined") return;
  const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
  if (!token) return;
  if (initialized) return;
  mixpanel.init(token, {
    // Matches Mixpanel “JavaScript SDK (npm)” setup: Autocapture + Session Replay, EU
    api_host:
      process.env.NEXT_PUBLIC_MIXPANEL_API_HOST ?? "https://api-eu.mixpanel.com",
    autocapture: true,
    record_sessions_percent: 100,
    persistence: "localStorage",
  });
  initialized = true;
}

export { mixpanel };
