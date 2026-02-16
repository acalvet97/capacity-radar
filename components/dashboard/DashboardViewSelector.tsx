"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ViewKey = "month" | "4w" | "12w" | "quarter" | "6m";

export function DashboardViewSelector({
  view,
  horizonHint,
}: {
  view: ViewKey;
  horizonHint: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setViewInUrl(nextView: ViewKey) {
    const params = new URLSearchParams(searchParams?.toString());
    params.set("view", nextView);

    // ✅ always navigate with pathname + query
    router.push(`${pathname}?${params.toString()}`);
  }

  const viewLabel =
    view === "month"
      ? "Current month"
      : view === "4w"
      ? "Next 4 weeks"
      : view === "12w"
      ? "12 weeks"
      : view === "quarter"
      ? "Quarter"
      : "6 months";

  return (
    <div className="space-y-2">
      <Label>View window</Label>
      <Select value={view} onValueChange={(v) => setViewInUrl(v as ViewKey)}>
        <SelectTrigger className="rounded-xl">
          <SelectValue placeholder="Choose a view" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="month">Current month</SelectItem>
          <SelectItem value="4w">Next 4 weeks</SelectItem>
          <SelectItem value="12w">12 weeks</SelectItem>
          <SelectItem value="quarter">Quarter</SelectItem>
          <SelectItem value="6m">6 months</SelectItem>
        </SelectContent>
      </Select>

      {horizonHint ? (
        <p className="text-xs text-muted-foreground">
          {viewLabel}: {horizonHint}
        </p>
      ) : null}
    </div>
  );
}



