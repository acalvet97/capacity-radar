import type { DashboardSnapshot } from "@/lib/dashboardEngine";
import {
  type NewWorkInput,
  evaluateNewWork,
  buildOverCapacityScenarios,
  fitsWithinCapacity,
} from "@/lib/evaluateEngine";
import type { ChatIntent, ExtractedWorkParams } from "@/lib/evaluateChatTypes";
import { isValidYmd } from "@/lib/dates";
import { sanitizeHoursInput } from "@/lib/hours";

export function buildSnapshotDigest(snapshot: DashboardSnapshot, todayYmd: string): string {
  const weeks = snapshot.horizonWeeks;
  if (!weeks.length) {
    return [`Today: ${todayYmd}`, "No horizon weeks in snapshot."].join("\n");
  }

  const overCapacityWeeks = weeks.filter((w) => w.committedHours > w.capacityHours);
  const freeWeeks = weeks
    .map((w) => ({
      label: w.weekLabel,
      freeHours: Math.max(0, w.capacityHours - w.committedHours),
      utilizationPct:
        w.capacityHours > 0
          ? Math.round((w.committedHours / w.capacityHours) * 100)
          : 0,
    }))
    .sort((a, b) => b.freeHours - a.freeHours);

  const lines = [
    `Today: ${todayYmd}`,
    `Team weekly capacity: ${weeks[0]?.capacityHours ?? 0}h`,
    `Planning horizon: ${weeks[0]?.weekStartYmd} to ${weeks[weeks.length - 1]?.weekEndYmd} (${weeks.length} weeks)`,
    `Overall utilization: ${snapshot.overallUtilizationPct}%`,
    `Peak week: ${snapshot.maxUtilizationPct}% utilization`,
    `Total committed: ${snapshot.totalCommittedHours}h of ${snapshot.totalCapacityHours}h`,
    "",
    "Weekly breakdown (label | committed | capacity | free | utilization%):",
    ...weeks.map((w) => {
      const free = Math.max(0, w.capacityHours - w.committedHours);
      const pct =
        w.capacityHours > 0 ? Math.round((w.committedHours / w.capacityHours) * 100) : 0;
      return `  ${w.weekLabel} | ${w.committedHours}h | ${w.capacityHours}h | ${free}h free | ${pct}%`;
    }),
    "",
    overCapacityWeeks.length > 0
      ? `Over-capacity weeks: ${overCapacityWeeks.map((w) => w.weekLabel).join(", ")}`
      : "No weeks currently over capacity.",
    "",
    "Most available weeks (top 3):",
    ...freeWeeks.slice(0, 3).map(
      (w) => `  ${w.label}: ${w.freeHours}h free (${w.utilizationPct}% used)`
    ),
  ];
  return lines.join("\n");
}

export function buildSystemPrompt(snapshotDigest: string, todayYmd: string): string {
  return `Role and context
You are Klyra, a capacity planning assistant for a tech/digital team manager.
You help the manager do two things:
  1. Evaluate whether the team can take on new work
  2. Answer questions about the team's current capacity and workload

Today's date: ${todayYmd}

TEAM CAPACITY SNAPSHOT
----------------------
${snapshotDigest}

Intent classification instruction
On every message, first classify the intent as one of:
  - evaluate: the manager is describing new work to assess
  - query: the manager is asking about the team's current state
  - ambiguous: unclear which — ask one clarifying question

Do not mix intents in a single response. If the message clearly
describes new work, treat it as evaluate. If it asks about the
current team state with no new work described, treat it as query.

Evaluate intent instructions
When intent is evaluate:
  - Extract: name, totalHours, startYmd, deadlineYmd, allocationMode
  - Required: totalHours (ask if missing)
  - startYmd default: today (${todayYmd}) — confirm with user if not stated
  - allocationMode default: fill_capacity — do not ask unless relevant
  - Ask for ONE missing field at a time, not multiple
  - When all required fields are present, set readyToEvaluate: true
  - Reason about feasibility from the capacity snapshot above
  - Keep evaluation responses concise: 2-4 sentences maximum

Query intent instructions
When intent is query:
  - Answer using ONLY data from the snapshot above
  - Never fabricate numbers — if you cannot find the answer in
    the snapshot, say so
  - Use natural, conversational language — no bullet lists unless
    the answer is genuinely list-like (e.g. top 3 free weeks)
  - Be specific: include actual hours and percentages, not vague
    descriptions like 'quite busy'
  - For questions about a specific month, sum the free hours across
    all weeks whose weekStartYmd falls in that month
  - Keep query responses concise: 3-5 sentences or a short list
  - Do not attach extractedParams or set readyToEvaluate for queries
  - Do not offer to evaluate work unless the manager asks

RESPONSE FORMAT
---------------
Every response must have exactly two parts, in this order:

PART 1 — Conversational response
Write your response in plain prose. No markdown, no bullet points,
no headers. Plain sentences only. This text will be streamed
directly to the user as you write it.

PART 2 — Structured data
After your prose response, output this exact delimiter on its own line:
__KLYRA_JSON__
Then immediately output a single JSON object with these fields:
{
  "intent": "evaluate" | "query" | "ambiguous",
  "extractedParams": {
    "name": string | undefined,
    "totalHours": number | undefined,
    "startYmd": string | undefined,
    "deadlineYmd": string | undefined,
    "allocationMode": "even" | "fill_capacity" | undefined
  } | null,
  "readyToEvaluate": true | false
}

Rules:
- Never include a 'message' field in the JSON — the message is Part 1
- Never output anything after the JSON object
- Never output the delimiter more than once
- Never output the delimiter before the prose response
- extractedParams is null for query and ambiguous intents
- readyToEvaluate is true only when totalHours and startYmd
  are both confirmed

Tone
Be direct and clear. You are a planning tool, not a chatbot.
Do not use filler phrases like 'Great question!' or 'Of course!'.
Do not use markdown formatting in message text.
Use plain numbers and plain sentences.`;
}

export type ParsedModelJson = {
  message: string;
  intent: ChatIntent;
  extractedParams: ExtractedWorkParams | null;
  readyToEvaluate: boolean;
};

export function parseModelJsonResponse(raw: string): ParsedModelJson {
  try {
    const clean = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new Error("No JSON object in response");
    }
    const jsonSlice = clean.slice(start, end + 1);
    const parsed = JSON.parse(jsonSlice) as {
      message?: unknown;
      intent?: unknown;
      extractedParams?: unknown;
      readyToEvaluate?: unknown;
    };

    const message = typeof parsed.message === "string" ? parsed.message : "";
    let intent: ChatIntent = "evaluate";
    if (parsed.intent === "query" || parsed.intent === "ambiguous") {
      intent = parsed.intent;
    } else if (parsed.intent === "evaluate") {
      intent = "evaluate";
    }

    const extractedParams =
      parsed.extractedParams !== null &&
      parsed.extractedParams !== undefined &&
      typeof parsed.extractedParams === "object"
        ? (parsed.extractedParams as ExtractedWorkParams)
        : null;

    return {
      message,
      intent,
      extractedParams,
      readyToEvaluate: Boolean(parsed.readyToEvaluate),
    };
  } catch {
    return {
      message: "I'm having trouble processing that. Could you try again?",
      intent: "ambiguous",
      extractedParams: null,
      readyToEvaluate: false,
    };
  }
}

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
