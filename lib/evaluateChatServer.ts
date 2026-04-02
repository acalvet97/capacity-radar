import type { DashboardSnapshot } from "@/lib/dashboardEngine";
import {
  type NewWorkInput,
  evaluateNewWork,
  buildOverCapacityScenarios,
  fitsWithinCapacity,
} from "@/lib/evaluateEngine";
import type { ExtractedWorkParams } from "@/lib/evaluateChatTypes";
import { isValidYmd } from "@/lib/dates";
import { sanitizeHoursInput } from "@/lib/hours";

export function buildNewWorkInputFromExtracted(
  p: ExtractedWorkParams,
  defaults: { todayYmd: string }
): NewWorkInput | null {
  const totalHours =
    typeof p.totalHours === "number" && Number.isFinite(p.totalHours)
      ? sanitizeHoursInput(p.totalHours)
      : 0;
  if (totalHours <= 0) return null;

  const startYmd = (p.startYmd ?? defaults.todayYmd).trim();
  if (!isValidYmd(startYmd)) return null;

  const deadlineYmd = p.deadlineYmd?.trim()
    ? p.deadlineYmd.trim()
    : undefined;
  if (deadlineYmd && !isValidYmd(deadlineYmd)) return null;
  if (deadlineYmd && deadlineYmd < startYmd) return null;

  const name = (p.name ?? "New work item").trim() || "New work item";
  const allocationMode = p.allocationMode ?? "fill_capacity";

  return {
    name,
    totalHours,
    startYmd,
    deadlineYmd,
    allocationMode,
  };
}

export function summarizeEngineForClient(
  snapshot: DashboardSnapshot,
  input: NewWorkInput
) {
  const evaluation = evaluateNewWork(snapshot, input);
  const scenarios = fitsWithinCapacity(evaluation)
    ? []
    : buildOverCapacityScenarios(snapshot, input);

  return {
    evaluation,
    digest: {
      peakUtilizationPct: evaluation.after.maxUtilizationPct,
      overallUtilizationPct: evaluation.after.overallUtilizationPct,
      fitsWithinCapacity: fitsWithinCapacity(evaluation),
      weeksInSpan: evaluation.applied.weeksCount,
      scenarioTitles: scenarios.map((s) => s.title),
    },
    scenarios,
  };
}
