"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

  return (
    <div className="flex items-center gap-3">
      <Select value={view} onValueChange={(v) => setViewInUrl(v as ViewKey)}>
        <SelectTrigger className="rounded-md min-w-[160px]">
          <SelectValue placeholder="Choose a view" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="month">Current month</SelectItem>
          <SelectItem value="4w">Next 4 weeks</SelectItem>
          <SelectItem value="12w">Next 12 weeks</SelectItem>
          <SelectItem value="quarter">Current Quarter</SelectItem>
          <SelectItem value="6m">6 months</SelectItem>
        </SelectContent>
      </Select>
      {horizonHint && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {horizonHint}
        </span>
      )}
    </div>
  );
}



