import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import type { DashboardSnapshot } from "@/lib/dashboardEngine";
import type {
  EvaluateChatMessage,
  EvaluateChatApiResponse,
  ExtractedWorkParams,
} from "@/lib/evaluateChatTypes";
import {
  buildNewWorkInputFromExtracted,
  summarizeEngineForClient,
} from "@/lib/evaluateChatServer";

export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

const EXTRACTION_SYSTEM = `You are Klyra, an assistant for engineering managers planning team capacity.
Your job in this step is to read the conversation and return a single JSON object ONLY (no markdown fences, no other text) with this exact shape:
{
  "message": string,
  "extractedParams": { "name"?: string, "totalHours"?: number, "startYmd"?: string, "deadlineYmd"?: string, "allocationMode"?: "even" | "fill_capacity" } | null,
  "readyToEvaluate": boolean
}

Rules:
- "message" is a short, helpful reply. If information is missing for a sound evaluation, ask ONE focused follow-up question only.
- Required before readyToEvaluate=true: estimated hours (totalHours > 0) and a valid startYmd (YYYY-MM-DD). If the user did not give a start date, use the provided todayYmd as startYmd.
- Optional: name, deadlineYmd, allocationMode (default fill_capacity).
- readyToEvaluate is true only when totalHours and startYmd are present and sufficient to run the capacity model.
- Never invent capacity, utilization, or calendar facts. You only extract work parameters and converse.
- If the user is refining previous numbers, merge context from the thread.

The server's system prompt includes today's date as todayYmd for defaulting start date when missing.`;

const NARRATION_SYSTEM = `You are Klyra. You will receive JSON with deterministic engine output from the team's capacity simulator.
Write a concise, professional paragraph for the manager. You MUST use only the numbers and facts in the JSON. Do not invent or estimate anything.
If scenarios are listed, briefly mention them as options without adding new numbers.`;

function parseJsonResponse(text: string): {
  message: string;
  extractedParams: ExtractedWorkParams | null;
  readyToEvaluate: boolean;
} {
  const trimmed = text.trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(unfenced) as {
    message?: string;
    extractedParams?: ExtractedWorkParams | null;
    readyToEvaluate?: boolean;
  };
  return {
    message: typeof parsed.message === "string" ? parsed.message : "",
    extractedParams: parsed.extractedParams ?? null,
    readyToEvaluate: Boolean(parsed.readyToEvaluate),
  };
}

function toAnthropicMessages(messages: EvaluateChatMessage[]): {
  role: "user" | "assistant";
  content: string;
}[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 503 }
    );
  }

  let body: {
    messages: EvaluateChatMessage[];
    snapshot: DashboardSnapshot;
    todayYmd: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { messages, snapshot, todayYmd } = body;
  if (!Array.isArray(messages) || !snapshot?.horizonWeeks || typeof todayYmd !== "string") {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey });

  let extraction: ReturnType<typeof parseJsonResponse>;
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: `${EXTRACTION_SYSTEM}\n\ntodayYmd (default start date if user omits it): ${todayYmd}`,
      messages: toAnthropicMessages(messages),
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => ("text" in b ? b.text : ""))
      .join("\n");
    extraction = parseJsonResponse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Extraction failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const merged: ExtractedWorkParams = {
    allocationMode: "fill_capacity",
    ...(extraction.extractedParams ?? {}),
    startYmd: extraction.extractedParams?.startYmd ?? todayYmd,
  };

  const input = buildNewWorkInputFromExtracted(merged, { todayYmd });
  const canRun = extraction.readyToEvaluate && input !== null;

  if (!canRun || !input) {
    const out: EvaluateChatApiResponse = {
      message: extraction.message,
      extractedParams: extraction.extractedParams,
      readyToEvaluate: extraction.readyToEvaluate,
    };
    return NextResponse.json(out);
  }

  const { evaluation, digest, scenarios } = summarizeEngineForClient(snapshot, input);

  let finalMessage = extraction.message;
  try {
    const narr = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 700,
      system: NARRATION_SYSTEM,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            engine: {
              peakUtilizationPct: evaluation.after.maxUtilizationPct,
              overallUtilizationPct: evaluation.after.overallUtilizationPct,
              fitsWithinCapacity: digest.fitsWithinCapacity,
              weeksInSpan: evaluation.applied.weeksCount,
              totalCommittedAfter: evaluation.after.totalCommittedHours,
              totalCapacityInHorizon: evaluation.after.totalCapacityHours,
            },
            scenarios: scenarios.map((s) => ({
              id: s.id,
              title: s.title,
              description: s.description,
              peakAfter: s.evaluation.after.maxUtilizationPct,
              fits: s.evaluation.after.maxUtilizationPct <= 100,
            })),
          }),
        },
      ],
    });
    const narrText = narr.content
      .filter((b) => b.type === "text")
      .map((b) => ("text" in b ? b.text : ""))
      .join("\n")
      .trim();
    if (narrText) finalMessage = narrText;
  } catch {
    finalMessage = digest.fitsWithinCapacity
      ? `This plan peaks at ${digest.peakUtilizationPct}% utilization across the horizon.`
      : `This plan peaks at ${digest.peakUtilizationPct}% utilization (over capacity). Consider adjusting deadline, scope, or allocation.`;
  }

  const out: EvaluateChatApiResponse = {
    message: finalMessage,
    extractedParams: extraction.extractedParams,
    readyToEvaluate: true,
    engineDigest: {
      peakUtilizationPct: digest.peakUtilizationPct,
      overallUtilizationPct: digest.overallUtilizationPct,
      fitsWithinCapacity: digest.fitsWithinCapacity,
      weeksInSpan: digest.weeksInSpan,
      scenarioTitles: digest.scenarioTitles,
    },
  };

  return NextResponse.json(out);
}
