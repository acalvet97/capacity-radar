import { cycleToWeekly } from "@/lib/capacityUnits";
import type { TeamMemberRow } from "@/lib/db/getTeamMembers";

export type MemberRow = {
  id: string;
  name: string | null;
  hoursInput: string;
  isNew?: boolean;
};

export function toMemberRows(rows: TeamMemberRow[]): MemberRow[] {
  return rows.map((m) => ({
    id: m.id,
    name: m.name,
    hoursInput: String(cycleToWeekly(m.hours_per_cycle)),
    isNew: false,
  }));
}
