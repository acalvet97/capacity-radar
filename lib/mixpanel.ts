import mixpanel from "mixpanel-browser";

let initialized = false;

/**
 * Call once in the browser (e.g. from `MixpanelProvider`).
 *
 * - `NEXT_PUBLIC_MIXPANEL_TOKEN` — project token (required)
 * - `NEXT_PUBLIC_MIXPANEL_API_HOST` — **must** match the project’s data region in Mixpanel
 *   (Project → Settings). Default US: omit (SDK uses `https://api-js.mixpanel.com`). EU: set
 *   to `https://api-eu.mixpanel.com`. Wrong host = events never show.
 */
export function initMixpanel(): void {
  if (typeof window === "undefined") return;
  const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
  if (!token) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[Mixpanel] NEXT_PUBLIC_MIXPANEL_TOKEN is missing — no events will be sent.",
      );
    }
    return;
  }
  if (initialized) return;

  const apiHost = process.env.NEXT_PUBLIC_MIXPANEL_API_HOST;

  mixpanel.init(token, {
    // Omit api_host to use the default US API (matches most projects).
    // EU-only projects: set NEXT_PUBLIC_MIXPANEL_API_HOST=https://api-eu.mixpanel.com
    ...(apiHost ? { api_host: apiHost } : {}),
    autocapture: true,
    record_sessions_percent: 100,
    persistence: "localStorage",
    debug: process.env.NODE_ENV === "development",
  });
  initialized = true;

  // Verifies the pipeline without relying only on autocapture / Live view delay
  mixpanel.track("App initialized", {
    path: window.location.pathname,
    $current_url: window.location.href,
  });
}

export { mixpanel };
