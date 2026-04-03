import Anthropic from "@anthropic-ai/sdk";
import { supabaseServer } from "@/lib/supabaseServer";
import { NextResponse } from "next/server";

import type { DashboardSnapshot } from "@/lib/dashboardEngine";
import type {
  EvaluateChatMessage,
  EvaluateChatApiResponse,
  ExtractedWorkParams,
} from "@/lib/evaluateChatTypes";
import { STREAM_DELIMITER } from "@/lib/evaluateChatTypes";
import {
  buildNewWorkInputFromExtracted,
  buildSnapshotDigest,
  buildSystemPrompt,
  parseModelJsonResponse,
  summarizeEngineForClient,
} from "@/lib/evaluateChatServer";

export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

const NARRATION_SYSTEM = `You are Klyra. You will receive JSON with deterministic engine output from the team's capacity simulator.
Write a concise, professional paragraph for the manager. You MUST use only the numbers and facts in the JSON. Do not invent or estimate anything.
If scenarios are listed, briefly mention them as options without adding new numbers.`;

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
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const snapshotDigestText = buildSnapshotDigest(snapshot, todayYmd);
  const systemPrompt = buildSystemPrompt(snapshotDigestText, todayYmd);

  const anthropic = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // First call (non-streaming): extract intent, params, readyToEvaluate
        const firstRes = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 2048,
          system: systemPrompt,
          messages: toAnthropicMessages(messages),
        });
        const rawText = firstRes.content
          .filter((b) => b.type === "text")
          .map((b) => ("text" in b ? b.text : ""))
          .join("\n");

        const parsed = parseModelJsonResponse(rawText);

        // Query / ambiguous: send message text as single chunk, then structured data
        if (parsed.intent === "query" || parsed.intent === "ambiguous") {
          controller.enqueue(encoder.encode(parsed.message));
          const out: EvaluateChatApiResponse = {
            message: parsed.message,
            intent: parsed.intent,
            extractedParams: null,
            readyToEvaluate: false,
          };
          controller.enqueue(encoder.encode(STREAM_DELIMITER + JSON.stringify(out)));
          return;
        }

        // Evaluate intent: check if we can run the engine
        const merged: ExtractedWorkParams = {
          allocationMode: "fill_capacity",
          ...(parsed.extractedParams ?? {}),
          startYmd: parsed.extractedParams?.startYmd ?? todayYmd,
        };
        const input = buildNewWorkInputFromExtracted(merged, { todayYmd });
        const canRun = parsed.readyToEvaluate && input !== null;

        if (!canRun || !input) {
          controller.enqueue(encoder.encode(parsed.message));
          const out: EvaluateChatApiResponse = {
            message: parsed.message,
            intent: "evaluate",
            extractedParams: parsed.extractedParams,
            readyToEvaluate: parsed.readyToEvaluate,
          };
          controller.enqueue(encoder.encode(STREAM_DELIMITER + JSON.stringify(out)));
          return;
        }

        // Run engine, then stream narration
        const { evaluation, digest: engineDigest, scenarios } = summarizeEngineForClient(
          snapshot,
          input
        );

        let finalMessage = parsed.message;
        try {
          const narrStream = await anthropic.messages.stream({
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
                    fitsWithinCapacity: engineDigest.fitsWithinCapacity,
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

          let narrText = "";
          for await (const chunk of narrStream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              const text = chunk.delta.text;
              narrText += text;
              controller.enqueue(encoder.encode(text));
            }
          }
          if (narrText) finalMessage = narrText;
        } catch {
          finalMessage = engineDigest.fitsWithinCapacity
            ? `This plan peaks at ${engineDigest.peakUtilizationPct}% utilization across the horizon.`
            : `This plan peaks at ${engineDigest.peakUtilizationPct}% utilization (over capacity). Consider adjusting deadline, scope, or allocation.`;
          controller.enqueue(encoder.encode(finalMessage));
        }

        const out: EvaluateChatApiResponse = {
          message: finalMessage,
          intent: "evaluate",
          extractedParams: parsed.extractedParams,
          readyToEvaluate: true,
          engineDigest: {
            peakUtilizationPct: engineDigest.peakUtilizationPct,
            overallUtilizationPct: engineDigest.overallUtilizationPct,
            fitsWithinCapacity: engineDigest.fitsWithinCapacity,
            weeksInSpan: engineDigest.weeksInSpan,
            scenarioTitles: engineDigest.scenarioTitles,
          },
        };
        controller.enqueue(encoder.encode(STREAM_DELIMITER + JSON.stringify(out)));
      } catch (err) {
        const errorPayload: EvaluateChatApiResponse = {
          message: "I'm having trouble with that. Could you try again?",
          intent: "ambiguous",
          extractedParams: null,
          readyToEvaluate: false,
        };
        try {
          controller.enqueue(
            encoder.encode(STREAM_DELIMITER + JSON.stringify(errorPayload))
          );
        } catch {
          // controller may already be closed
        }
        if (err instanceof Error) {
          console.error("[evaluate/chat] stream error:", err.message);
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
