// Shared UI constants and helpers for dashboard and evaluate screens.
// Single source of truth for exposure bucket display (DRY).

import type { Bucket } from "@/lib/dashboardEngine";

/** View key to human-readable label. */
export type ViewKey = "month" | "4w" | "12w" | "quarter" | "6m";

export const VIEW_LABELS: Record<ViewKey, string> = {
  month: "Current month",
  "4w": "Next 4 weeks",
  "12w": "Next 12 weeks",
  quarter: "Current Quarter",
  "6m": "6 months",
};

export function getViewLabel(view: ViewKey): string {
  return VIEW_LABELS[view];
}

/** Tailwind classes for exposure bar fill by bucket. */
export const EXPOSURE_BAR_FILL: Record<Bucket, string> = {
  low: "bg-emerald-600",
  medium: "bg-amber-600",
  high: "bg-rose-600",
};

/** Badge style classes for exposure (e.g. LOW / MEDIUM / HIGH). */
export const EXPOSURE_BADGE_STYLES: Record<Bucket, string> = {
  low: "bg-emerald-600/10 text-emerald-700 border-emerald-600/20",
  medium: "bg-amber-600/10 text-amber-700 border-amber-600/20",
  high: "bg-rose-600/10 text-rose-700 border-rose-600/20",
};

export function exposureBucketLabel(bucket: Bucket): string {
  return bucket === "low" ? "LOW" : bucket === "medium" ? "MEDIUM" : "HIGH";
}
