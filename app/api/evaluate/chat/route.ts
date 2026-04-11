import Anthropic from "@anthropic-ai/sdk";
import { supabaseServer } from "@/lib/supabaseServer";
import { NextResponse } from "next/server";

import type {
  EvaluateChatMessage,
  EvaluateChatApiResponse,
  ChatIntent,
} from "@/lib/evaluateChatTypes";
import { STREAM_DELIMITER } from "@/lib/evaluateChatTypes";
import {
  buildSnapshotDigest,
  buildSystemPrompt,
} from "@/lib/evaluateChatServer";
import { getDashboardSnapshotFromDb } from "@/lib/dashboardEngine";
import { getTeamIdForUser } from "@/lib/db/getTeamIdForUser";
import { DEFAULT_TZ, todayYmdInTz } from "@/lib/dates";

export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

// What the AI outputs between its prose and the structured JSON.
// This is NOT the same as STREAM_DELIMITER — see section 4.5 of the PRD.
// PROSE_DELIMITER: written by the AI in its response (never reaches the client)
// STREAM_DELIMITER: appended by the route after processing (the only delimiter the client sees)
const PROSE_DELIMITER = "__Klira_JSON__";

const VALID_INTENTS = new Set<ChatIntent>(["evaluate", "query", "ambiguous"]);

function toAnthropicMessages(messages: EvaluateChatMessage[]): {
  role: "user" | "assistant";
  content: string;
}[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

function parseStructuredData(jsonStr: string): {
  intent: ChatIntent;
  extractedParams: EvaluateChatApiResponse["extractedParams"];
  readyToEvaluate: boolean;
  action: EvaluateChatApiResponse["action"];
} {
  try {
    const clean = jsonStr.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as Record<string, unknown>;
    const intent =
      typeof parsed.intent === "string" && VALID_INTENTS.has(parsed.intent as ChatIntent)
        ? (parsed.intent as ChatIntent)
        : "ambiguous";
    return {
      intent,
      extractedParams:
        parsed.extractedParams !== null &&
        parsed.extractedParams !== undefined &&
        typeof parsed.extractedParams === "object"
          ? (parsed.extractedParams as EvaluateChatApiResponse["extractedParams"])
          : null,
      readyToEvaluate: Boolean(parsed.readyToEvaluate),
      action:
        typeof parsed.action === "string" &&
        parsed.action.trim().toLowerCase().replace(/\s+/g, "_") === "open_commit_modal"
          ? "open_commit_modal"
          : null,
    };
  } catch {
    return {
      intent: "ambiguous",
      extractedParams: null,
      readyToEvaluate: false,
      action: null,
    };
  }
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  let body: { messages: EvaluateChatMessage[] };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { messages } = body;
  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  // Fetch fresh team data server-side so AI responses are always grounded in
  // current reality — not stale client-side snapshot state.
  const todayYmd = todayYmdInTz(DEFAULT_TZ);
  let snapshotDigestText: string;
  try {
    const teamId = await getTeamIdForUser();
    const snapshot = await getDashboardSnapshotFromDb(teamId, {
      startYmd: todayYmd,
      weeks: 26,
      maxWeeks: 26,
      locale: "en-GB",
      tz: DEFAULT_TZ,
    });
    snapshotDigestText = buildSnapshotDigest(snapshot, todayYmd);
  } catch {
    snapshotDigestText = `Today: ${todayYmd}\nNo team data available.`;
  }

  const systemPrompt = buildSystemPrompt(snapshotDigestText, todayYmd);
  const claudeMessages = toAnthropicMessages(messages);

  const anthropic = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicStream = await anthropic.messages.stream({
          model: MODEL,
          max_tokens: 1200,
          system: systemPrompt,
          messages: claudeMessages,
        });

        let fullText = "";
        let delimiterFound = false;
        let proseEndIdx = -1;

        for await (const chunk of anthropicStream) {
          if (
            chunk.type !== "content_block_delta" ||
            chunk.delta.type !== "text_delta"
          )
            continue;

          const text = chunk.delta.text;
          fullText += text;

          if (!delimiterFound) {
            const delimIdx = fullText.indexOf(PROSE_DELIMITER);

            if (delimIdx === -1) {
              // Delimiter not yet seen — stream this chunk as prose
              controller.enqueue(encoder.encode(text));
            } else {
              // Delimiter just appeared somewhere in the accumulated text.
              // It may have arrived split across chunks, so we check fullText
              // rather than the individual chunk (handles the mid-chunk edge case).
              delimiterFound = true;
              proseEndIdx = delimIdx;

              // Stream any prose that arrived in this same chunk before the delimiter.
              // alreadyStreamed = everything in fullText except this chunk.
              const alreadyStreamed = fullText.length - text.length;
              const remainingProse = fullText.slice(alreadyStreamed, delimIdx);
              if (remainingProse) {
                controller.enqueue(encoder.encode(remainingProse));
              }
              // Do not stream the delimiter or anything after it
            }
          }
          // If delimiterFound: keep accumulating fullText for JSON parsing,
          // but do not stream anything further
        }

        // Stream has ended — extract and parse the JSON that follows the delimiter
        const jsonStr = delimiterFound
          ? fullText.slice(proseEndIdx + PROSE_DELIMITER.length).trim()
          : "";

        const structured = parseStructuredData(jsonStr);

        // message is empty here because the prose was already streamed above.
        // The client reads text before STREAM_DELIMITER as the message content.
        const out: EvaluateChatApiResponse = {
          message: "",
          intent: structured.intent,
          extractedParams: structured.extractedParams,
          readyToEvaluate: structured.readyToEvaluate,
          action: structured.action,
        };

        controller.enqueue(encoder.encode(STREAM_DELIMITER + JSON.stringify(out)));
      } catch (err) {
        const fallback: EvaluateChatApiResponse = {
          message: "I'm having trouble with that. Could you try again?",
          intent: "ambiguous",
          extractedParams: null,
          readyToEvaluate: false,
          action: null,
        };
        try {
          controller.enqueue(
            encoder.encode(STREAM_DELIMITER + JSON.stringify(fallback))
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
