type Mixpanel = typeof import("mixpanel-browser").default;

let initialized = false;
let mixpanelPromise: Promise<Mixpanel> | null = null;

/**
 * Loaded on demand rather than imported at module scope: MixpanelProvider is
 * mounted in the root layout, so a static import puts the whole library in
 * every route's first-load JS to run one call in a mount effect.
 *
 * Callers share this promise, so tracking that fires before init resolves still
 * runs after it -- the init callback is registered first.
 */
function loadMixpanel(): Promise<Mixpanel> {
  if (!mixpanelPromise) {
    mixpanelPromise = import("mixpanel-browser").then((m) => m.default);
  }
  return mixpanelPromise;
}

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
  // Set before awaiting so a second call during the import can't double-init.
  initialized = true;

  const apiHost = process.env.NEXT_PUBLIC_MIXPANEL_API_HOST;

  void loadMixpanel()
    .then((mixpanel) => {
      mixpanel.init(token, {
        // Omit api_host to use the default US API (matches most projects).
        // EU-only projects: set NEXT_PUBLIC_MIXPANEL_API_HOST=https://api-eu.mixpanel.com
        ...(apiHost ? { api_host: apiHost } : {}),
        autocapture: true,
        record_sessions_percent: 100,
        persistence: "localStorage",
        debug: process.env.NODE_ENV === "development",
      });

      // Verifies the pipeline without relying only on autocapture / Live view delay
      mixpanel.track("App initialized", {
        path: window.location.pathname,
        $current_url: window.location.href,
      });
    })
    .catch(() => {
      // Analytics must never break the app; allow a later retry.
      initialized = false;
    });
}

export type TrackWorkItemAddedPayload =
  | {
      source: "evaluate" | "committed_work";
      estimated_hours: number;
      has_deadline: boolean;
      allocation_mode: "even" | "fill_capacity";
    }
  | {
      source: "onboarding_bulk";
      item_count: number;
      import_source: "ai" | "csv";
    };

/**
 * Client-only. Call after a work item (or batch) is successfully persisted.
 * No-ops when Mixpanel is not configured. Assumes `initMixpanel()` already ran
 * from `MixpanelProvider` at app start.
 */
export function trackWorkItemAdded(payload: TrackWorkItemAddedPayload): void {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_MIXPANEL_TOKEN) return;

  void loadMixpanel()
    .then((mixpanel) => mixpanel.track("Work Item Added", payload))
    .catch(() => {
      // Analytics must never break a save that already succeeded.
    });
}
