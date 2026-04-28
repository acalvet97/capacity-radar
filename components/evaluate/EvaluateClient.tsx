"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, ArrowRight, Check, X } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";

import { CommitmentAllocationFieldset } from "@/components/committed-work/CommitmentAllocationFieldset";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputGroup,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { WeekUtilizationBar } from "@/components/dashboard/WeekUtilizationBar";

import type { DashboardSnapshot } from "@/lib/dashboardEngine";
import { isValidYmd } from "@/lib/dates";
import { SuggestedPrompts, PROMPT_ICON_MAP } from "@/components/evaluate/SuggestedPrompts";
import { useAskKlira } from "@/context/AskKliraContext";
import {
  evaluateNewWork,
  buildOverCapacityScenarios,
  fitsWithinCapacity,
  type NewWorkInput,
  type AllocationMode,
  type EvaluateResult,
  type OverCapacityScenario,
} from "@/lib/evaluateEngine";
import { commitWork } from "@/app/(app)/evaluate/actions";
import { sanitizeHoursInput } from "@/lib/hours";
import { trackWorkItemAdded } from "@/lib/mixpanel";
import type {
  EvaluateChatMessage,
  EvaluateChatApiResponse,
  ResultCardData,
  CommitCardData,
  ChatIntent,
  ExtractedWorkParams,
} from "@/lib/evaluateChatTypes";
import { STREAM_DELIMITER } from "@/lib/evaluateChatTypes";

const VALID_CHAT_INTENTS = new Set<ChatIntent>(["evaluate", "query", "ambiguous"]);

function normalizeOpenCommitAction(raw: unknown): "open_commit_modal" | null {
  if (raw == null) return null;
  const n = String(raw)
    .trim()
    .toLowerCase()
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, "_");
  return n === "open_commit_modal" ? "open_commit_modal" : null;
}

/** Parse structured JSON from the full stream buffer (runs after all chunks — fixes partial JSON mid-stream). */
function parseStructuredPayloadFromBuffer(buffer: string): EvaluateChatApiResponse | null {
  const delimIdx = buffer.indexOf(STREAM_DELIMITER);
  if (delimIdx === -1) return null;
  const jsonStr = buffer.slice(delimIdx + STREAM_DELIMITER.length).trim();
  if (!jsonStr) return null;
  try {
    const clean = jsonStr.replace(/```json|```/gi, "").trim();
    const raw = JSON.parse(clean) as Partial<EvaluateChatApiResponse>;
    const intent: ChatIntent =
      typeof raw.intent === "string" && VALID_CHAT_INTENTS.has(raw.intent as ChatIntent)
        ? (raw.intent as ChatIntent)
        : "ambiguous";
    return {
      message: raw.message ?? "",
      intent,
      extractedParams:
        raw.extractedParams !== null &&
        raw.extractedParams !== undefined &&
        typeof raw.extractedParams === "object"
          ? (raw.extractedParams as EvaluateChatApiResponse["extractedParams"])
          : null,
      readyToEvaluate: Boolean(raw.readyToEvaluate),
      action: normalizeOpenCommitAction(raw.action),
      engineDigest: raw.engineDigest,
    };
  } catch {
    return null;
  }
}

function toApiMessages(messages: EvaluateChatMessage[]) {
  return messages.map(({ role, content }) => ({ role, content }));
}

function mergeExtractedIntoForm(
  prev: {
    name: string;
    hours: string;
    startYmd: string;
    deadlineYmd: string;
    allocationMode: AllocationMode;
  },
  extracted: NonNullable<EvaluateChatApiResponse["extractedParams"]> | null
) {
  if (!extracted) return prev;
  return {
    name: extracted.name ?? prev.name,
    hours:
      typeof extracted.totalHours === "number" && Number.isFinite(extracted.totalHours)
        ? String(extracted.totalHours)
        : prev.hours,
    startYmd: extracted.startYmd ?? prev.startYmd,
    deadlineYmd:
      extracted.deadlineYmd !== undefined && extracted.deadlineYmd !== null
        ? extracted.deadlineYmd
        : prev.deadlineYmd,
    allocationMode: extracted.allocationMode ?? prev.allocationMode,
  };
}

function buildNewWorkInputFromMerged(
  merged: {
    name: string;
    hours: string;
    startYmd: string;
    deadlineYmd: string;
    allocationMode: AllocationMode;
  },
  safeHours: number
): NewWorkInput | null {
  if (!merged.name.trim()) return null;
  if (!merged.startYmd.trim() || !isValidYmd(merged.startYmd.trim())) return null;
  if (merged.deadlineYmd.trim() && !isValidYmd(merged.deadlineYmd.trim())) return null;
  if (merged.deadlineYmd.trim() && merged.deadlineYmd.trim() < merged.startYmd.trim()) {
    return null;
  }
  if (safeHours <= 0) return null;
  return {
    name: merged.name.trim(),
    totalHours: safeHours,
    startYmd: merged.startYmd.trim(),
    deadlineYmd: merged.deadlineYmd.trim() ? merged.deadlineYmd.trim() : undefined,
    allocationMode: merged.allocationMode,
  };
}

function buildResultCardData(result: EvaluateResult): ResultCardData {
  const { startIdx, endIdx } = result.applied;
  const weeklyBreakdown = Array.from({ length: endIdx - startIdx + 1 }, (_, i) => {
    const idx = startIdx + i;
    const after = result.after.horizonWeeks[idx];
    const before = result.before.horizonWeeks[idx];
    return {
      weekLabel: after.weekLabel,
      beforePct: Math.round((before.committedHours / before.capacityHours) * 100),
      afterPct: Math.round((after.committedHours / after.capacityHours) * 100),
      capacityHours: after.capacityHours,
      committedHours: after.committedHours,
      bufferHoursPerWeek: result.after.bufferHoursPerWeek,
    };
  });
  return {
    peakUtilizationPct: result.after.maxUtilizationPct,
    overallUtilizationPct: result.after.overallUtilizationPct,
    fitsWithinCapacity: fitsWithinCapacity(result),
    totalCommittedHours: result.after.totalCommittedHours,
    totalCapacityHours: result.after.totalCapacityHours,
    weeklyBreakdown,
  };
}

function findLastEvaluationAssistantIndex(messages: EvaluateChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.resultCard && !m.isPostCommit) return i;
  }
  return -1;
}

function findLastCommitAssistantIndex(messages: EvaluateChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.commitCard && !m.isPostCommit) return i;
  }
  return -1;
}

/** Params to pre-fill the commit-from-chat modal; prefers stored extraction, else commit card. */
function resolveCommitParamsFromThread(thread: EvaluateChatMessage[]): ExtractedWorkParams | null {
  const withExtracted = [...thread]
    .reverse()
    .find(
      (m) =>
        m.role === "assistant" &&
        m.extractedParams &&
        typeof m.extractedParams.totalHours === "number" &&
        Number.isFinite(m.extractedParams.totalHours) &&
        Boolean(m.extractedParams.name?.trim())
    );
  if (withExtracted?.extractedParams) return withExtracted.extractedParams;

  const withCard = [...thread]
    .reverse()
    .find(
      (m) =>
        m.role === "assistant" &&
        m.resultCard &&
        m.commitCard &&
        !m.isPostCommit &&
        Boolean(m.commitCard.name.trim()) &&
        typeof m.commitCard.totalHours === "number"
    );
  if (withCard?.commitCard) {
    const c = withCard.commitCard;
    return {
      name: c.name,
      totalHours: c.totalHours,
      startYmd: c.startYmd,
      deadlineYmd: c.deadlineYmd,
      allocationMode: c.allocationMode,
    };
  }
  return null;
}

/** Last-resort params from the sidebar form (kept in sync during chat). */
function tryResolveCommitParamsFromForm(form: {
  name: string;
  hours: string;
  startYmd: string;
  deadlineYmd: string;
  allocationMode: AllocationMode;
}): ExtractedWorkParams | null {
  const safe = sanitizeHoursInput(form.hours);
  const nw = buildNewWorkInputFromMerged(
    {
      name: form.name,
      hours: form.hours,
      startYmd: form.startYmd,
      deadlineYmd: form.deadlineYmd,
      allocationMode: form.allocationMode,
    },
    safe
  );
  if (!nw) return null;
  return {
    name: nw.name,
    totalHours: nw.totalHours,
    startYmd: nw.startYmd,
    deadlineYmd: nw.deadlineYmd,
    allocationMode: nw.allocationMode ?? "even",
  };
}

/**
 * The assistant turn before the user’s “yes” should look like a capacity evaluation.
 * We cannot require `resultCard` — the model may only output numbers in prose, so structured
 * cards were never attached even though the user saw a full evaluation.
 */
function evalAssistantBeforeUserLooksLikeCapacityTurn(prev: EvaluateChatMessage[]): boolean {
  if (prev.length < 3) return false;
  const userIdx = prev.length - 2;
  if (prev[userIdx]?.role !== "user" || prev[prev.length - 1]?.role !== "assistant") {
    return false;
  }
  const a = prev[userIdx - 1];
  if (a?.role !== "assistant") return false;
  const content = typeof a.content === "string" ? a.content : "";
  return Boolean(
    a.resultCard ||
      a.readyToEvaluate ||
      (a.extractedParams &&
        typeof a.extractedParams.totalHours === "number" &&
        Number.isFinite(a.extractedParams.totalHours)) ||
      /want me to add/i.test(content) ||
      /add (this|it) to your work items/i.test(content) ||
      /\d+\s*h(?:ours)?\b.*\bfree\b/i.test(content) ||
      /\b(fits|capacity|utilization)\b/i.test(content)
  );
}

/** System prompt tells the model to say this when opening the commit UI. */
function proseOpensCommitForm(finalText: string): boolean {
  return /opening the form now/i.test(finalText);
}

function userAffirmsCommitIntent(content: string): boolean {
  const t = content.trim();
  if (!t.length || t.length > 72) return false;
  if (/^n(o|ope)?\.?$/i.test(t)) return false;
  return (
    /^(yes|yep|yeah|sure|ok|okay|please|absolutely|definitely)\.?$/i.test(t) ||
    /^y\.?$/i.test(t) ||
    /^(sounds?\s*good|add(\s+it)?|do\s*it|go\s*ahead|that\s*works)\b/i.test(t)
  );
}

/** User said yes after an evaluation; wording of the AI invite can vary. */
function shouldOfferInlineCommitAfterAffirmative(
  prev: EvaluateChatMessage[],
  form: { name: string; hours: string; startYmd: string; deadlineYmd: string; allocationMode: AllocationMode }
): boolean {
  if (!evalAssistantBeforeUserLooksLikeCapacityTurn(prev)) return false;
  const userTurn = prev[prev.length - 2];
  if (!userAffirmsCommitIntent(userTurn.content)) return false;
  return (
    resolveCommitParamsFromThread(prev) != null ||
    tryResolveCommitParamsFromForm(form) != null
  );
}

function stripCommitCardsExceptIndex(
  messages: EvaluateChatMessage[],
  keepIdx: number
): EvaluateChatMessage[] {
  return messages.map((m, i) => {
    if (i === keepIdx || m.role !== "assistant" || !m.commitCard) return m;
    return { ...m, commitCard: undefined };
  });
}

function buildCommitCardDataFromResolvedParams(
  p: ExtractedWorkParams,
  snapshot: DashboardSnapshot,
  todayYmd: string
): CommitCardData {
  const startYmdResolved =
    p.startYmd && isValidYmd(p.startYmd)
      ? p.startYmd
      : (snapshot.horizonWeeks[0]?.weekStartYmd ?? todayYmd);
  return {
    name: p.name!.trim(),
    totalHours: p.totalHours!,
    startYmd: startYmdResolved,
    deadlineYmd: p.deadlineYmd,
    allocationMode: p.allocationMode ?? "even",
  };
}

function ResultCard({
  data,
  flashKey,
}: {
  data: ResultCardData;
  flashKey: number;
}) {
  const fits = data.fitsWithinCapacity;
  const [opacity, setOpacity] = React.useState(1);

  React.useEffect(() => {
    if (flashKey === 0) return;
    setOpacity(0);
    const id = requestAnimationFrame(() => setOpacity(1));
    return () => cancelAnimationFrame(id);
  }, [flashKey]);

  return (
    <div
      className="rounded-lg border bg-background p-4 space-y-4 transition-opacity duration-150"
      style={{ opacity }}
    >
      <div className="flex items-center justify-between">
        <span className={`flex items-center gap-1.5 font-semibold ${fits ? "text-green-600" : "text-rose-600"}`}>
          {fits ? <Check className="size-4 shrink-0" /> : <X className="size-4 shrink-0" />}
          {fits ? "Fits within capacity" : "Exceeds capacity"}
        </span>
        <span className="text-2xl font-bold tabular-nums">{data.peakUtilizationPct}%</span>
      </div>

      <div className="flex gap-4 text-xs text-muted-foreground tabular-nums">
        <span>
          {data.totalCommittedHours}h / {data.totalCapacityHours}h
        </span>
        <span>{data.overallUtilizationPct}% overall</span>
      </div>

      <div className="space-y-3">
        {data.weeklyBreakdown.map((w) => (
          <div key={w.weekLabel} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>{w.weekLabel}</span>
              <span className="tabular-nums text-muted-foreground flex items-center gap-1">
                {w.beforePct}% <ArrowRight className="size-3 shrink-0" /> {w.afterPct}%
                {w.afterPct > 100 && (
                  <span className="text-rose-600"> +{w.afterPct - 100}%</span>
                )}
              </span>
            </div>
            <WeekUtilizationBar
              capacityHours={w.capacityHours}
              committedHours={w.committedHours}
              bufferHoursPerWeek={w.bufferHoursPerWeek}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ScenarioCards({
  scenarios,
  onApply,
}: {
  scenarios: OverCapacityScenario[];
  onApply: (s: OverCapacityScenario) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground font-medium">Alternatives</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onApply(s)}
            className="rounded-lg border bg-background p-3 text-left hover:bg-muted/50 transition-colors space-y-1"
          >
            <p className="text-sm font-medium">{s.title}</p>
            <p className="text-xs text-muted-foreground">{s.description}</p>
            <p className="text-xs tabular-nums text-muted-foreground">
              Peak: {s.evaluation.after.maxUtilizationPct}%
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

type CommitCardProps = {
  data: CommitCardData;
  onChange: (patch: Partial<CommitCardData>) => void;
  onCommit: () => void;
  onDiscard: () => void;
  isCommitting: boolean;
  canCommit: boolean;
  showCommittedSuccess: boolean;
};

function CommitCard({
  data,
  onChange,
  onCommit,
  onDiscard,
  isCommitting,
  canCommit,
  showCommittedSuccess,
}: CommitCardProps) {
  if (showCommittedSuccess) {
    return (
      <div className="rounded-lg border bg-background p-4 flex items-center gap-2 text-green-600">
        <Check className="size-5 shrink-0" />
        <span className="text-sm font-medium">Added</span>
      </div>
    );
  }

  const hoursStr =
    typeof data.totalHours === "number" && Number.isFinite(data.totalHours)
      ? String(data.totalHours)
      : "";

  return (
    <div className="rounded-lg border bg-background p-4 space-y-4">
      <div>
        <h3 className="text-base font-medium text-foreground">Add existing commitment</h3>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          Log work your team is already committed to. No capacity analysis — just a straight addition
          to the pipeline.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="Klira-commit-title">Commitment title</Label>
        <Input
          id="Klira-commit-title"
          value={data.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Add a title"
          autoComplete="off"
          className="h-9 text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="Klira-commit-hours">Expected total hours</Label>
        <Input
          id="Klira-commit-hours"
          type="number"
          min={0.5}
          step={0.5}
          inputMode="decimal"
          value={hoursStr}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") {
              onChange({ totalHours: 0 });
              return;
            }
            const n = Number(v);
            if (!Number.isNaN(n)) onChange({ totalHours: n });
          }}
          onBlur={() => {
            const sanitized = sanitizeHoursInput(hoursStr || String(data.totalHours));
            if (data.totalHours !== sanitized) onChange({ totalHours: sanitized });
          }}
          placeholder="E.g.: 40"
          className="h-9 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Start date</Label>
          <DatePicker
            value={data.startYmd}
            onChange={(v) => onChange({ startYmd: v })}
            placeholder="dd/mm/yyyy"
            className="h-9 text-xs"
          />
        </div>
        <div className="space-y-2">
          <Label>Deadline</Label>
          <DatePicker
            value={data.deadlineYmd ?? ""}
            onChange={(v) => onChange({ deadlineYmd: v || undefined })}
            placeholder="dd/mm/yyyy"
            clearable
            className="h-9 text-xs"
          />
        </div>
      </div>

      <CommitmentAllocationFieldset
        idPrefix="Klira-commit"
        value={data.allocationMode === "fill_capacity" ? "even" : data.allocationMode}
        onChange={(mode) => onChange({ allocationMode: mode })}
      />

      <div className="flex flex-row gap-2 pt-1">
        <Button
          size="default"
          onClick={onCommit}
          disabled={isCommitting || !canCommit}
          className="min-w-0 flex-1"
        >
          {isCommitting ? "Adding…" : "Commit work"}
        </Button>
        <Button size="default" variant="outline" onClick={onDiscard} disabled={isCommitting} className="shrink-0">
          Cancel
        </Button>
      </div>
    </div>
  );
}

const INITIAL_GREETING: EvaluateChatMessage = {
  role: "assistant",
  content: "Hi! I can help you evaluate new work or check your team's capacity. What would you like to do?",
};

export function EvaluateClient({
  snapshot,
  todayYmd,
  displayName,
}: {
  snapshot: DashboardSnapshot;
  todayYmd: string;
  displayName: string;
}) {
  const router = useRouter();
  const { messages, setMessages, setIsResponding } = useAskKlira();
  const [isPending, startTransition] = useTransition();
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isStreamingActive, setIsStreamingActive] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const defaultStart = snapshot.horizonWeeks[0]?.weekStartYmd ?? todayYmd;
  const [chatInput, setChatInput] = useState("");

  const [name, setName] = useState("New work item");
  const [hours, setHours] = useState<string>("40");
  const [startYmd, setStartYmd] = useState<string>(defaultStart);
  const [deadlineYmd, setDeadlineYmd] = useState<string>("");
  const [allocationMode, setAllocationMode] = useState<AllocationMode>("even");

  // Derived: has the conversation started (at least one user message)?
  const hasStarted = messages.some((m) => m.role === "user");

  const [resultFlashKey, setResultFlashKey] = useState(0);
  const [commitSuccess, setCommitSuccess] = useState(false);
  const hoursDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const emptyInputRef = useRef<HTMLTextAreaElement>(null);
  // Streaming text is written to the DOM via a render queue rather than directly
  // on each chunk. This produces a smooth typewriter effect even when chunks
  // arrive in bursts. streamingBufferRef tracks what has actually been rendered.
  const streamingBufferRef = useRef("");
  const streamingElRef = useRef<HTMLSpanElement>(null);
  // renderQueueRef: text waiting to be rendered by the interval
  // renderIntervalRef: the setInterval handle for the typewriter ticker
  // isChatLoadingRef: mirrors isChatLoading so the interval closure sees it without staleness
  const renderQueueRef = useRef<string>("");
  const renderIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isChatLoadingRef = useRef(false);
  const formFieldsRef = useRef({
    name,
    hours,
    startYmd,
    deadlineYmd,
    allocationMode,
  });
  formFieldsRef.current = { name, hours, startYmd, deadlineYmd, allocationMode };

  // Pulls 3 characters per tick (30 ms) from the render queue and writes them
  // to the DOM. 3 chars @ 30 ms ≈ 100 chars/sec — fast typing pace.
  // Self-terminates when the queue is empty and the stream is done.
  const startRenderInterval = useCallback(() => {
    if (renderIntervalRef.current) return; // already running
    renderIntervalRef.current = setInterval(() => {
      if (!renderQueueRef.current || !streamingElRef.current) return;
      const batch = renderQueueRef.current.slice(0, 3);
      renderQueueRef.current = renderQueueRef.current.slice(3);
      streamingBufferRef.current += batch;
      streamingElRef.current.textContent = streamingBufferRef.current;
      if (!renderQueueRef.current && !isChatLoadingRef.current) {
        clearInterval(renderIntervalRef.current!);
        renderIntervalRef.current = null;
      }
    }, 30);
  }, []);

  const safeHours = sanitizeHoursInput(hours);

  const canCommit =
    safeHours > 0 &&
    Boolean(name.trim()) &&
    Boolean(startYmd.trim()) &&
    isValidYmd(startYmd.trim()) &&
    (!deadlineYmd.trim() || isValidYmd(deadlineYmd.trim())) &&
    (!deadlineYmd.trim() || deadlineYmd.trim() >= startYmd);

  const commitDataFromForm: CommitCardData = {
    name,
    totalHours: safeHours,
    startYmd,
    deadlineYmd: deadlineYmd.trim() ? deadlineYmd.trim() : undefined,
    allocationMode,
  };

  useEffect(() => {
    if (!hasStarted) return;
    const el = threadRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isChatLoading, hasStarted]);

  const runSilentEvaluationAndUpdateMessage = useCallback(
    (merged: {
      name: string;
      hours: string;
      startYmd: string;
      deadlineYmd: string;
      allocationMode: AllocationMode;
    }) => {
      const sh = sanitizeHoursInput(merged.hours);
      const nw = buildNewWorkInputFromMerged(merged, sh);
      if (!nw) return;

      const evalResult = evaluateNewWork(snapshot, nw);
      const resultCard = buildResultCardData(evalResult);
      const scenarioCards = !fitsWithinCapacity(evalResult)
        ? buildOverCapacityScenarios(snapshot, nw)
        : undefined;
      const commitCard: CommitCardData = {
        name: nw.name,
        totalHours: nw.totalHours,
        startYmd: nw.startYmd,
        deadlineYmd: nw.deadlineYmd,
        allocationMode: nw.allocationMode ?? "even",
      };

      setResultFlashKey((k) => k + 1);
      setMessages((m) => {
        const idx = findLastEvaluationAssistantIndex(m);
        if (idx === -1) return m;
        const extractedParams: ExtractedWorkParams = {
          name: nw.name,
          totalHours: nw.totalHours,
          startYmd: nw.startYmd,
          deadlineYmd: nw.deadlineYmd,
          allocationMode: nw.allocationMode ?? "even",
        };
        return m.map((msg, i) =>
          i === idx
            ? {
                ...msg,
                resultCard,
                scenarioCards,
                commitCard,
                readyToEvaluate: true,
                extractedParams,
              }
            : msg
        );
      });
    },
    [snapshot]
  );

  const scheduleHoursDebouncedEval = useCallback(() => {
    if (hoursDebounceRef.current) clearTimeout(hoursDebounceRef.current);
    hoursDebounceRef.current = setTimeout(() => {
      hoursDebounceRef.current = null;
      const f = formFieldsRef.current;
      runSilentEvaluationAndUpdateMessage({
        name: f.name,
        hours: f.hours,
        startYmd: f.startYmd,
        deadlineYmd: f.deadlineYmd,
        allocationMode: f.allocationMode,
      });
    }, 300);
  }, [runSilentEvaluationAndUpdateMessage]);

  useEffect(() => {
    return () => {
      if (hoursDebounceRef.current) clearTimeout(hoursDebounceRef.current);
    };
  }, []);

  const handleCommitCardChange = useCallback(
    (patch: Partial<CommitCardData>) => {
      if (patch.name !== undefined) setName(patch.name);
      if (patch.totalHours !== undefined) setHours(String(patch.totalHours));
      if (patch.startYmd !== undefined) setStartYmd(patch.startYmd);
      if (patch.deadlineYmd !== undefined) setDeadlineYmd(patch.deadlineYmd ?? "");
      if (patch.allocationMode !== undefined) setAllocationMode(patch.allocationMode);

      const nextName = patch.name ?? name;
      const nextHours =
        patch.totalHours !== undefined ? String(patch.totalHours) : hours;
      const nextStart = patch.startYmd ?? startYmd;
      const nextDeadline =
        patch.deadlineYmd !== undefined
          ? patch.deadlineYmd ?? ""
          : deadlineYmd;
      const nextAlloc = patch.allocationMode ?? allocationMode;

      if (patch.totalHours !== undefined) {
        scheduleHoursDebouncedEval();
        return;
      }

      runSilentEvaluationAndUpdateMessage({
        name: nextName,
        hours: nextHours,
        startYmd: nextStart,
        deadlineYmd: nextDeadline,
        allocationMode: nextAlloc,
      });
    },
    [
      allocationMode,
      deadlineYmd,
      hours,
      name,
      runSilentEvaluationAndUpdateMessage,
      scheduleHoursDebouncedEval,
      startYmd,
    ]
  );

  const applyScenario = useCallback(
    (s: OverCapacityScenario) => {
      const nextDeadline =
        s.apply.deadlineYmd !== undefined ? s.apply.deadlineYmd : deadlineYmd;
      const nextHours =
        s.apply.totalHours !== undefined
          ? String(sanitizeHoursInput(s.apply.totalHours))
          : hours;
      const nextAlloc = s.apply.allocationMode ?? allocationMode;

      setDeadlineYmd(nextDeadline);
      setHours(nextHours);
      setAllocationMode(nextAlloc);

      const merged = {
        name,
        hours: nextHours,
        startYmd,
        deadlineYmd: nextDeadline,
        allocationMode: nextAlloc,
      };
      runSilentEvaluationAndUpdateMessage(merged);
    },
    [allocationMode, deadlineYmd, hours, name, runSilentEvaluationAndUpdateMessage, startYmd]
  );

  const discardCommit = useCallback(() => {
    setMessages((m) => {
      const idx = findLastCommitAssistantIndex(m);
      if (idx === -1) return m;
      return m.map((msg, i) =>
        i === idx ? { ...msg, commitCard: undefined } : msg
      );
    });
    setName("New work item");
    setHours("40");
    setStartYmd(defaultStart);
    setDeadlineYmd("");
    setAllocationMode("even");
  }, [defaultStart]);

  const runChatRequest = useCallback(
    async (nextThread: EvaluateChatMessage[]) => {
      setChatError(null);
      isChatLoadingRef.current = true;
      setIsChatLoading(true);
      setIsResponding(true);
      setIsStreamingActive(false);

      // Reset streaming state and add placeholder to thread
      streamingBufferRef.current = "";
      renderQueueRef.current = "";
      const streamingMsg: EvaluateChatMessage = {
        role: "assistant",
        content: "",
        isStreaming: true,
      };
      setMessages([...nextThread, streamingMsg]);

      try {
        const res = await fetch("/api/evaluate/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: toApiMessages(nextThread),
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error("Stream request failed");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let messageText = ""; // prose text before STREAM_DELIMITER (set when delimiter arrives)
        let structuredData: EvaluateChatApiResponse | null = null;
        let streamingStarted = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const newText = decoder.decode(value, { stream: true });
          buffer += newText;

          const delimIdx = buffer.indexOf(STREAM_DELIMITER);

          if (delimIdx === -1) {
            // No delimiter yet — push new text into the render queue.
            // The interval (startRenderInterval) pulls characters and writes
            // them to the DOM, producing the typewriter effect.
            renderQueueRef.current += newText;
            startRenderInterval();
            if (newText.length > 0 && !streamingStarted) {
              streamingStarted = true;
              setIsStreamingActive(true); // triggers exactly one re-render
            }
          } else {
            // STREAM_DELIMITER found — extract prose and structured JSON.
            messageText = buffer.slice(0, delimIdx);
            const jsonStr = buffer.slice(delimIdx + STREAM_DELIMITER.length);

            try {
              const raw = JSON.parse(jsonStr) as Partial<EvaluateChatApiResponse>;
              const intent: ChatIntent =
                typeof raw.intent === "string" && VALID_CHAT_INTENTS.has(raw.intent as ChatIntent)
                  ? (raw.intent as ChatIntent)
                  : "ambiguous";
              structuredData = {
                message: raw.message ?? "",
                intent,
                extractedParams:
                  raw.extractedParams !== null &&
                  raw.extractedParams !== undefined &&
                  typeof raw.extractedParams === "object"
                    ? (raw.extractedParams as EvaluateChatApiResponse["extractedParams"])
                    : null,
                readyToEvaluate: Boolean(raw.readyToEvaluate),
                action: normalizeOpenCommitAction(raw.action),
                engineDigest: raw.engineDigest,
              };
            } catch {
              // JSON may be split across chunks; complete on next read or when done
            }

            // Correct the render queue to the exact remaining prose. This handles
            // the edge case where STREAM_DELIMITER arrived split across chunks and
            // partial delimiter bytes were pushed to the queue before detection.
            renderQueueRef.current = messageText.slice(streamingBufferRef.current.length);
          }
        }

        const reparsed = parseStructuredPayloadFromBuffer(buffer);
        const finalStructured = reparsed ?? structuredData;

        // Stream is done — let the interval self-terminate once the queue drains.
        isChatLoadingRef.current = false;

        // Wait for the render queue to empty before committing the final React state.
        // This ensures the typewriter animation completes before the streaming cursor
        // is removed and the message content is locked in.
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (!renderQueueRef.current) {
              clearInterval(check);
              resolve();
            }
          }, 50);
        });

        // Final assistant message + structured metadata in a single update (avoids
        // batching races with the commit modal). Use messageText if the delimiter
        // was found; fall back to the full buffer for delimiter-less responses.
        const finalText = messageText || buffer;

        if (finalStructured) {
          const f = formFieldsRef.current;
          let merged = {
            name: f.name,
            hours: f.hours,
            startYmd: f.startYmd,
            deadlineYmd: f.deadlineYmd,
            allocationMode: f.allocationMode,
          };

          if (finalStructured.extractedParams) {
            merged = mergeExtractedIntoForm(merged, finalStructured.extractedParams);
            setName(merged.name);
            setHours(merged.hours);
            setStartYmd(merged.startYmd);
            setDeadlineYmd(merged.deadlineYmd);
            setAllocationMode(merged.allocationMode);
          }

          const intent: ChatIntent = finalStructured.intent ?? "ambiguous";

          setMessages((prev) => {
            let updated = [...prev];
            const lastIdx = updated.length - 1;
            const last = updated[lastIdx];
            if (!last || last.role !== "assistant") return updated;

            let nextLast: EvaluateChatMessage = {
              ...last,
              content: finalText,
              isStreaming: false,
            };

            if (intent === "query" || intent === "ambiguous") {
              nextLast = { ...nextLast, intent, isStreaming: false };
            } else {
              const safe = sanitizeHoursInput(merged.hours);
              const newWorkInput = buildNewWorkInputFromMerged(merged, safe);

              if (finalStructured.readyToEvaluate && newWorkInput) {
                const evalResult = evaluateNewWork(snapshot, newWorkInput);
                const resultCard = buildResultCardData(evalResult);
                const scenarioCards = !fitsWithinCapacity(evalResult)
                  ? buildOverCapacityScenarios(snapshot, newWorkInput)
                  : undefined;
                const commitCard: CommitCardData = {
                  name: newWorkInput.name,
                  totalHours: newWorkInput.totalHours,
                  startYmd: newWorkInput.startYmd,
                  deadlineYmd: newWorkInput.deadlineYmd,
                  allocationMode: newWorkInput.allocationMode ?? "even",
                };
                const extractedParams: ExtractedWorkParams = {
                  name: newWorkInput.name,
                  totalHours: newWorkInput.totalHours,
                  startYmd: newWorkInput.startYmd,
                  deadlineYmd: newWorkInput.deadlineYmd,
                  allocationMode: newWorkInput.allocationMode ?? "even",
                };

                nextLast = {
                  ...nextLast,
                  intent: "evaluate",
                  resultCard,
                  scenarioCards,
                  commitCard,
                  isStreaming: false,
                  readyToEvaluate: true,
                  extractedParams,
                };
              } else {
                nextLast = { ...nextLast, intent, isStreaming: false };
              }
            }

            const paramsFromMerged = (): ExtractedWorkParams | null => {
              const safe = sanitizeHoursInput(merged.hours);
              const nw = buildNewWorkInputFromMerged(merged, safe);
              if (!nw) return null;
              return {
                name: nw.name,
                totalHours: nw.totalHours,
                startYmd: nw.startYmd,
                deadlineYmd: nw.deadlineYmd,
                allocationMode: nw.allocationMode ?? "even",
              };
            };

            const wantsInlineCommit =
              finalStructured.action === "open_commit_modal" ||
              shouldOfferInlineCommitAfterAffirmative(prev, formFieldsRef.current) ||
              proseOpensCommitForm(finalText);

            if (wantsInlineCommit) {
              const p =
                resolveCommitParamsFromThread(prev) ??
                paramsFromMerged() ??
                tryResolveCommitParamsFromForm(formFieldsRef.current);
              if (
                p &&
                typeof p.totalHours === "number" &&
                Number.isFinite(p.totalHours) &&
                p.name?.trim()
              ) {
                updated = stripCommitCardsExceptIndex(updated, lastIdx);
                const commitCardFromChat = buildCommitCardDataFromResolvedParams(
                  p,
                  snapshot,
                  todayYmd
                );
                nextLast = { ...nextLast, commitCard: commitCardFromChat };
                queueMicrotask(() => {
                  setName(commitCardFromChat.name);
                  setHours(String(commitCardFromChat.totalHours));
                  setStartYmd(commitCardFromChat.startYmd);
                  setDeadlineYmd(commitCardFromChat.deadlineYmd ?? "");
                  setAllocationMode(commitCardFromChat.allocationMode);
                });
              } else {
                queueMicrotask(() => {
                  toast.info("Couldn’t load project details from the chat.", {
                    description: "Opening Committed Work — add or edit your item there.",
                  });
                  router.push("/committed-work");
                });
              }
            }

            updated[lastIdx] = nextLast;

            return updated;
          });
        } else {
          setMessages((prev) => {
            let updated = [...prev];
            const lastIdx = updated.length - 1;
            const last = updated[lastIdx];
            if (!last?.isStreaming) return updated;

            let nextLast: EvaluateChatMessage = {
              ...last,
              content: finalText,
              isStreaming: false,
            };

            if (
              shouldOfferInlineCommitAfterAffirmative(prev, formFieldsRef.current) ||
              proseOpensCommitForm(finalText)
            ) {
              const p =
                resolveCommitParamsFromThread(prev) ??
                tryResolveCommitParamsFromForm(formFieldsRef.current);
              if (
                p &&
                typeof p.totalHours === "number" &&
                Number.isFinite(p.totalHours) &&
                p.name?.trim()
              ) {
                updated = stripCommitCardsExceptIndex(updated, lastIdx);
                const commitCardFromChat = buildCommitCardDataFromResolvedParams(
                  p,
                  snapshot,
                  todayYmd
                );
                nextLast = { ...nextLast, commitCard: commitCardFromChat };
                queueMicrotask(() => {
                  setName(commitCardFromChat.name);
                  setHours(String(commitCardFromChat.totalHours));
                  setStartYmd(commitCardFromChat.startYmd);
                  setDeadlineYmd(commitCardFromChat.deadlineYmd ?? "");
                  setAllocationMode(commitCardFromChat.allocationMode);
                });
              }
            }

            updated[lastIdx] = nextLast;
            return updated;
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Something went wrong";
        setChatError(msg);
        toast.error(msg);
        streamingBufferRef.current = "";
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.isStreaming) {
            updated[updated.length - 1] = {
              ...last,
              content: "I'm having trouble with that. Could you try again?",
              isStreaming: false,
            };
          }
          return updated;
        });
      } finally {
        // Stop the typewriter interval and clear any residual queue.
        clearInterval(renderIntervalRef.current ?? undefined);
        renderIntervalRef.current = null;
        renderQueueRef.current = "";
        isChatLoadingRef.current = false;
        setIsChatLoading(false);
        setIsResponding(false);
        setIsStreamingActive(false);
        requestAnimationFrame(() => {
          chatInputRef.current?.focus();
        });
      }
    },
    [router, snapshot, startRenderInterval, todayYmd]
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isChatLoading && chatInput.trim()) {
        sendChat();
      }
    }
  }

  function sendChat(
    e?: React.FormEvent,
    overrideMessage?: string,
    overrideHistory?: EvaluateChatMessage[],
    promptIconName?: string
  ) {
    e?.preventDefault();
    const text = (overrideMessage ?? chatInput).trim();
    if (!text || isChatLoading) return;
    const historyToSend = overrideHistory ?? messages;
    const userMsg: EvaluateChatMessage = {
      role: "user",
      content: text,
      ...(promptIconName && { promptIconName }),
    };
    const nextThread = [...historyToSend, userMsg];
    setChatError(null);
    setChatInput("");
    void runChatRequest(nextThread);
  }

  function resetThreadAndForm() {
    setMessages([]);
    setName("New work item");
    setHours("40");
    setStartYmd(defaultStart);
    setDeadlineYmd("");
    setAllocationMode("even");
    setChatInput("");
  }

  function handlePostCommitEvaluateNew() {
    resetThreadAndForm();
  }

  function handlePostCommitTeamStatus() {
    setName("New work item");
    setHours("40");
    setStartYmd(defaultStart);
    setDeadlineYmd("");
    setAllocationMode("even");
    sendChat(undefined, "Show me the team status", [INITIAL_GREETING]);
  }

  function resetFormOnly() {
    setName("New work item");
    setHours("40");
    setStartYmd(defaultStart);
    setDeadlineYmd("");
    setAllocationMode("even");
  }

  function handleCommit() {
    startTransition(async () => {
      try {
        await commitWork({
          name: name.trim(),
          totalHours: safeHours,
          startYmd: startYmd.trim(),
          deadlineYmd: deadlineYmd.trim() ? deadlineYmd.trim() : undefined,
          allocationMode: "even",
        });
        trackWorkItemAdded({
          source: "evaluate",
          estimated_hours: safeHours,
          has_deadline: Boolean(deadlineYmd.trim()),
          allocation_mode: "even",
        });
        router.refresh();
        const committedName = name.trim();
        setCommitSuccess(true);
        window.setTimeout(() => {
          setCommitSuccess(false);
          setMessages((m) => {
            const commitIdx = findLastCommitAssistantIndex(m);
            const evalIdx = findLastEvaluationAssistantIndex(m);
            if (commitIdx === -1) return m;
            if (commitIdx === evalIdx) {
              return m.map((msg, i) =>
                i === evalIdx
                  ? {
                      role: "assistant",
                      content: "",
                      isPostCommit: true,
                      postCommitWorkName: committedName,
                    }
                  : msg
              );
            }
            const cleared = m.map((msg, i) =>
              i === commitIdx ? { ...msg, commitCard: undefined } : msg
            );
            return [
              ...cleared,
              {
                role: "assistant",
                content: `Done. "${committedName}" has been added to your work items.`,
              },
            ];
          });
          resetFormOnly();
        }, 1500);
      } catch (e: unknown) {
        toast.error("Could not commit work", {
          description: e instanceof Error ? e.message : "Unknown error",
        });
      }
    });
  }

  const lastCommitIdx = findLastCommitAssistantIndex(messages);

  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
      {/* Empty state — centred greeting + prominent input */}
      <div
        className={cn(
          "absolute inset-0 z-10 flex flex-col items-center justify-center px-4 pb-8",
          "transition-opacity duration-150",
          hasStarted ? "opacity-0 pointer-events-none" : "opacity-100"
        )}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col items-stretch">
          <div className="flex flex-col gap-8">
            <div className="text-center space-y-3">
              <h2 className="text-[2.5rem]! font-normal tracking-tight text-zinc-900">
                Hello, {displayName}
              </h2>
              <p className="text-[1.25rem] text-zinc-500">
                How can I help your team today?
              </p>
            </div>

            <form onSubmit={sendChat} className="w-full">
              <InputGroup className="flex flex-col items-stretch overflow-hidden rounded-xl bg-white dark:bg-white border-zinc-100 has-[[data-slot=input-group-control]:focus-visible]:ring-0 has-[[data-slot=input-group-control]:focus-visible]:border-zinc-200">
                <InputGroupTextarea
                  ref={emptyInputRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="New project? Team question? Just ask..."
                  rows={3}
                  disabled={isChatLoading}
                  className="w-full min-w-0 flex-none p-5 text-base md:text-base disabled:opacity-50"
                />
                <div className="flex w-full shrink-0 justify-end pr-3 pb-3">
                  <InputGroupButton
                    type="submit"
                    size="icon-sm"
                    variant={chatInput.trim() ? "default" : "ghost"}
                    disabled={isChatLoading || !chatInput.trim()}
                    aria-label="Send message"
                  >
                    <ArrowUp className="size-4" />
                  </InputGroupButton>
                </div>
              </InputGroup>
            </form>
          </div>

          <div className="mt-12 w-full">
            <SuggestedPrompts
              onSelect={(prompt, iconName) => {
                sendChat(undefined, prompt, undefined, iconName);
              }}
            />
          </div>
        </div>
      </div>

      {/* Active state — thread + thinking indicator + input bar */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col transition-opacity duration-150",
          !hasStarted ? "opacity-0 pointer-events-none" : "opacity-100"
        )}
      >
        {/* Thread */}
        <div ref={threadRef} className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
            {messages.map((msg, i) => {
              if (msg.role === "user") {
                if (msg.promptIconName) {
                  const Icon = PROMPT_ICON_MAP[msg.promptIconName];
                  return (
                    <div key={i} className="flex justify-end">
                      <div className="bg-muted rounded-2xl rounded-tr-sm px-3 py-2.5 max-w-[75%] text-sm">
                        <div className="flex items-center gap-2 border border-border/60 rounded-lg px-3 py-1.5 bg-background/60">
                          {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
                          <span className="text-foreground">{msg.content}</span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={i} className="flex justify-end">
                    <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[75%] text-sm whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              if (msg.isPostCommit && msg.postCommitWorkName) {
                const workName = msg.postCommitWorkName;
                return (
                  <div key={i} className="space-y-4 text-sm">
                    <div className="space-y-4">
                      <p className="text-foreground leading-relaxed">
                        {workName} has been added to your team&apos;s committed work.
                      </p>
                      <p className="text-foreground leading-relaxed">What would you like to do next?</p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button size="sm" variant="secondary" onClick={handlePostCommitEvaluateNew}>
                          Evaluate new work
                        </Button>
                        <Button size="sm" variant="secondary" onClick={handlePostCommitTeamStatus}>
                          See team status
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => router.push("/committed-work")}>
                          View committed work
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={i} className="space-y-4 text-sm">
                  <div className="space-y-4">
                    {(msg.content || msg.isStreaming) ? (
                      <p className="whitespace-pre-wrap text-foreground leading-relaxed">
                        {msg.isStreaming ? (
                          // Live stream: render from the buffer ref so React re-renders
                          // mid-stream always show the correct accumulated text.
                          // The actual character-by-character updates happen via direct
                          // DOM writes to streamingElRef — no setMessages per chunk.
                          <>
                            <span ref={streamingElRef}>{streamingBufferRef.current}</span>
                            <span className="inline-block w-0.5 h-4 bg-foreground animate-pulse ml-0.5 align-middle" />
                          </>
                        ) : (
                          msg.content
                        )}
                      </p>
                    ) : null}
                    {msg.resultCard && (
                      <ResultCard data={msg.resultCard} flashKey={resultFlashKey} />
                    )}
                    {msg.scenarioCards && msg.scenarioCards.length > 0 && (
                      <ScenarioCards scenarios={msg.scenarioCards} onApply={applyScenario} />
                    )}
                    {msg.commitCard && i === lastCommitIdx && (
                      <CommitCard
                        data={commitDataFromForm}
                        onChange={handleCommitCardChange}
                        onCommit={handleCommit}
                        onDiscard={discardCommit}
                        isCommitting={isPending}
                        canCommit={canCommit}
                        showCommittedSuccess={commitSuccess}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Thinking indicator — shown while loading but before streaming starts */}
        {isChatLoading && !isStreamingActive && (
          <div className="w-full">
            <div className="mx-auto max-w-3xl px-4 py-2 text-xs text-muted-foreground animate-pulse">
              Klira is thinking...
            </div>
          </div>
        )}

        {/* Input bar */}
        <div className="shrink-0 w-full py-4">
          <div className="mx-auto max-w-3xl px-4">
            <form onSubmit={sendChat}>
              <InputGroup className="flex flex-col items-stretch overflow-hidden rounded-xl bg-white dark:bg-white border-zinc-100 has-[[data-slot=input-group-control]:focus-visible]:ring-0 has-[[data-slot=input-group-control]:focus-visible]:border-zinc-200">
                <InputGroupTextarea
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Reply..."
                  disabled={isChatLoading}
                  rows={1}
                  className="max-h-40 w-full min-w-0 flex-none overflow-y-auto p-5 text-base md:text-base disabled:opacity-50"
                />
                <div className="flex w-full shrink-0 justify-end pr-3 pb-3">
                  <InputGroupButton
                    type="submit"
                    size="icon-sm"
                    variant={chatInput.trim() ? "default" : "ghost"}
                    disabled={isChatLoading || !chatInput.trim()}
                    aria-label="Send message"
                  >
                    <ArrowUp className="size-4" />
                  </InputGroupButton>
                </div>
              </InputGroup>
            </form>
            {chatError && (
              <p className="mt-2 text-xs text-rose-600">{chatError}</p>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
