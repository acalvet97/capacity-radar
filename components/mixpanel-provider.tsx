"use client";

import { useEffect } from "react";
import { initMixpanel } from "@/lib/mixpanel";

/**
 * Mount-time Mixpanel init for the app shell. Set `NEXT_PUBLIC_MIXPANEL_TOKEN` to enable.
 */
export function MixpanelProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initMixpanel();
  }, []);

  return <>{children}</>;
}
