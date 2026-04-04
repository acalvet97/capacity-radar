import Anthropic from "@anthropic-ai/sdk";
import { supabaseServer } from "@/lib/supabaseServer";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

export type ParsedWorkItem = {
  name: string;
  estimated_hours: number | null;
  start_date: string | null;
  deadline: string | null;
};

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let text: string;
  try {
    const body = await request.json();
    text = body?.text;
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];

  const systemPrompt = `You are a work item parser for a project management tool. 
Extract all projects or tasks from the user's text and return 
ONLY a valid JSON array with no explanation, no preamble, 
and no markdown formatting.

Each item must have exactly these fields:
- name: string (required)
- estimated_hours: number or null (if not mentioned)
- start_date: ISO 8601 date string — if not explicitly mentioned, default to today's date (${today})
- deadline: ISO 8601 date string or null (if not mentioned)

Today's date is ${today}. 
Interpret relative dates like "end of month", "next week", 
"by the 20th" accordingly based on today's date.
Return null only for deadline if not mentioned or not inferable.`;

  const client = new Anthropic();

  let rawContent: string;
  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: text }],
    });

    const block = message.content[0];
    if (block.type !== "text") {
      return NextResponse.json({ error: "Unexpected response from AI" }, { status: 500 });
    }
    rawContent = block.text.trim();
  } catch (err) {
    console.error("Anthropic API error:", err);
    return NextResponse.json({ error: "AI service error" }, { status: 502 });
  }

  // Strip markdown code fences if present
  const cleaned = rawContent
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let parsed: ParsedWorkItem[];
  try {
    const data = JSON.parse(cleaned);
    if (!Array.isArray(data)) {
      return NextResponse.json({ error: "AI returned unexpected format" }, { status: 500 });
    }
    parsed = data.map((item) => ({
      name: String(item.name ?? "Untitled"),
      estimated_hours:
        item.estimated_hours != null && Number.isFinite(Number(item.estimated_hours))
          ? Number(item.estimated_hours)
          : null,
      start_date: item.start_date && typeof item.start_date === "string" ? item.start_date : null,
      deadline: item.deadline && typeof item.deadline === "string" ? item.deadline : null,
    }));
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response as JSON" }, { status: 500 });
  }

  return NextResponse.json(parsed);
}
