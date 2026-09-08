import {
  type DailyHoursInput,
  DEFAULT_DAILY_HOURS,
  dailyHoursToInputs,
} from "@/lib/dailyHours";
import type { TeamMemberRow } from "@/lib/db/getTeamMembers";

export type MemberRow = {
  id: string;
  name: string | null;
  dailyHours: DailyHoursInput;
  isDailyHoursConfirmed: boolean;
  isNew?: boolean;
};

export function toMemberRows(rows: TeamMemberRow[]): MemberRow[] {
  return rows.map((m) => ({
    id: m.id,
    name: m.name,
    dailyHours: dailyHoursToInputs(m.daily_hours),
    isDailyHoursConfirmed: m.is_daily_hours_confirmed,
    isNew: false,
  }));
}

export function newMemberRow(id: string): MemberRow {
  return {
    id,
    name: null,
    dailyHours: dailyHoursToInputs(DEFAULT_DAILY_HOURS),
    isDailyHoursConfirmed: true,
    isNew: true,
  };
}
