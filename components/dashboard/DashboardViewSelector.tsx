"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VIEW_LABELS, VIEW_ORDER, type ViewKey } from "@/lib/dashboardConstants";

export function DashboardViewSelector({ view }: { view: ViewKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setViewInUrl(nextView: ViewKey) {
    const params = new URLSearchParams(searchParams?.toString());
    params.set("view", nextView);

    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={view} onValueChange={(v) => setViewInUrl(v as ViewKey)}>
      <SelectTrigger className="rounded-md min-w-[160px]">
        <SelectValue placeholder="Choose a view" />
      </SelectTrigger>
      <SelectContent>
        {VIEW_ORDER.map((key) => (
          <SelectItem key={key} value={key}>
            {VIEW_LABELS[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
