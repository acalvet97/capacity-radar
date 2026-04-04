"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, ArrowRight, Check, X } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WeekUtilizationBar } from "@/components/dashboard/WeekUtilizationBar";

import type { DashboardSnapshot } from "@/lib/dashboardEngine";
import { isValidYmd } from "@/lib/dates";
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
import type {
  EvaluateChatMessage,
  EvaluateChatApiResponse,
  ResultCardData,
  CommitCardData,
  ChatIntent,
} from "@/lib/evaluateChatTypes";
import { STREAM_DELIMITER } from "@/lib/evaluateChatTypes";

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
        <span className="text-sm font-medium">Committed</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-background p-4 space-y-3">
      <div className="flex gap-2">
        <Input
          value={data.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="flex-1 h-8 text-sm"
          placeholder="Work name"
        />
        <Input
          type="number"
          value={data.totalHours}
          onChange={(e) => onChange({ totalHours: Number(e.target.value) })}
          className="w-20 h-8 text-sm text-right"
        />
        <span className="text-sm text-muted-foreground self-center">h</span>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <DatePicker
          value={data.startYmd}
          onChange={(v) => onChange({ startYmd: v })}
          placeholder="Start date"
          className="h-8 text-xs flex-1"
        />
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        <DatePicker
          value={data.deadlineYmd ?? ""}
          onChange={(v) => onChange({ deadlineYmd: v || undefined })}
          placeholder="No deadline"
          clearable
          className="h-8 text-xs flex-1"
        />
      </div>

      <div className="flex gap-3 text-xs">
        {(["fill_capacity", "even"] as AllocationMode[]).map((mode) => (
          <label key={mode} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="commitAlloc"
              value={mode}
              checked={data.allocationMode === mode}
              onChange={() => onChange({ allocationMode: mode })}
            />
            <span>{mode === "fill_capacity" ? "Fill capacity" : "Even spread"}</span>
          </label>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={onCommit} disabled={isCommitting || !canCommit} className="flex-1">
          {isCommitting ? "Committing…" : "Commit work"}
        </Button>
        <Button size="sm" variant="outline" onClick={onDiscard} disabled={isCommitting}>
          Discard
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
  const [isPending, startTransition] = useTransition();
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isStreamingActive, setIsStreamingActive] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const defaultStart = snapshot.horizonWeeks[0]?.weekStartYmd ?? todayYmd;

  const [messages, setMessages] = useState<EvaluateChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");

  const [name, setName] = useState("New work item");
  const [hours, setHours] = useState<string>("40");
  const [startYmd, setStartYmd] = useState<string>(defaultStart);
  const [deadlineYmd, setDeadlineYmd] = useState<string>("");
  const [allocationMode, setAllocationMode] = useState<AllocationMode>("fill_capacity");

  // Derived: has the conversation started (at least one user message)?
  const hasStarted = messages.some((m) => m.role === "user");

  const [resultFlashKey, setResultFlashKey] = useState(0);
  const [commitSuccess, setCommitSuccess] = useState(false);
  const hoursDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
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
        allocationMode: nw.allocationMode ?? "fill_capacity",
      };

      setResultFlashKey((k) => k + 1);
      setMessages((m) => {
        const idx = findLastEvaluationAssistantIndex(m);
        if (idx === -1) return m;
        return m.map((msg, i) =>
          i === idx
            ? {
                ...msg,
                resultCard,
                scenarioCards,
                commitCard,
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
    setAllocationMode("fill_capacity");
  }, [defaultStart]);

  const runChatRequest = useCallback(
    async (nextThread: EvaluateChatMessage[]) => {
      setChatError(null);
      isChatLoadingRef.current = true;
      setIsChatLoading(true);
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
            snapshot,
            todayYmd,
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
              structuredData = JSON.parse(jsonStr) as EvaluateChatApiResponse;
            } catch {
              // JSON may be split across chunks; complete on next read or when done
            }

            // Correct the render queue to the exact remaining prose. This handles
            // the edge case where STREAM_DELIMITER arrived split across chunks and
            // partial delimiter bytes were pushed to the queue before detection.
            renderQueueRef.current = messageText.slice(streamingBufferRef.current.length);
          }
        }

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

        // Commit final content and remove the streaming cursor in one update.
        // Use messageText if the delimiter was found; fall back to the full buffer
        // (delimiter-less response) so graceful-degradation prose still renders.
        const finalText = messageText || buffer;
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.isStreaming) {
            updated[updated.length - 1] = { ...last, content: finalText, isStreaming: false };
          }
          return updated;
        });

        // Stream ended — process structured data
        if (structuredData) {
          const f = formFieldsRef.current;
          let merged = {
            name: f.name,
            hours: f.hours,
            startYmd: f.startYmd,
            deadlineYmd: f.deadlineYmd,
            allocationMode: f.allocationMode,
          };

          if (structuredData.extractedParams) {
            merged = mergeExtractedIntoForm(merged, structuredData.extractedParams);
            setName(merged.name);
            setHours(merged.hours);
            setStartYmd(merged.startYmd);
            setDeadlineYmd(merged.deadlineYmd);
            setAllocationMode(merged.allocationMode);
          }

          const intent: ChatIntent = structuredData.intent ?? "ambiguous";

          if (intent === "query" || intent === "ambiguous") {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                intent,
                isStreaming: false,
              };
              return updated;
            });
            return;
          }

          const safe = sanitizeHoursInput(merged.hours);
          const newWorkInput = buildNewWorkInputFromMerged(merged, safe);

          if (structuredData.readyToEvaluate && newWorkInput) {
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
              allocationMode: newWorkInput.allocationMode ?? "fill_capacity",
            };

            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                intent: "evaluate",
                resultCard,
                scenarioCards,
                commitCard,
                isStreaming: false,
              };
              return updated;
            });
          } else {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                intent,
                isStreaming: false,
              };
              return updated;
            });
          }
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
        setIsStreamingActive(false);
        requestAnimationFrame(() => {
          chatInputRef.current?.focus();
        });
      }
    },
    [snapshot, todayYmd, startRenderInterval]
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
    overrideHistory?: EvaluateChatMessage[]
  ) {
    e?.preventDefault();
    const text = (overrideMessage ?? chatInput).trim();
    if (!text || isChatLoading) return;
    const historyToSend = overrideHistory ?? messages;
    const userMsg: EvaluateChatMessage = { role: "user", content: text };
    const nextThread = [...historyToSend, userMsg];
    setChatError(null);
    setChatInput("");
    void runChatRequest(nextThread);
  }

  function resetThreadAndForm() {
    setMessages([INITIAL_GREETING]);
    setName("New work item");
    setHours("40");
    setStartYmd(defaultStart);
    setDeadlineYmd("");
    setAllocationMode("fill_capacity");
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
    setAllocationMode("fill_capacity");
    sendChat(undefined, "Show me the team status", [INITIAL_GREETING]);
  }

  function resetFormOnly() {
    setName("New work item");
    setHours("40");
    setStartYmd(defaultStart);
    setDeadlineYmd("");
    setAllocationMode("fill_capacity");
  }

  function handleCommit() {
    startTransition(async () => {
      try {
        await commitWork({
          name: name.trim(),
          totalHours: safeHours,
          startYmd: startYmd.trim(),
          deadlineYmd: deadlineYmd.trim() ? deadlineYmd.trim() : undefined,
          allocationMode,
        });
        router.refresh();
        const committedName = name.trim();
        setCommitSuccess(true);
        window.setTimeout(() => {
          setCommitSuccess(false);
          setMessages((m) => {
            const idx = findLastEvaluationAssistantIndex(m);
            if (idx === -1) return m;
            return m.map((msg, i) =>
              i === idx
                ? {
                    role: "assistant",
                    content: "",
                    isPostCommit: true,
                    postCommitWorkName: committedName,
                  }
                : msg
            );
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
          "absolute inset-0 z-10 flex flex-col items-center justify-center px-4 pb-8 gap-6",
          "transition-opacity duration-150",
          hasStarted ? "opacity-0 pointer-events-none" : "opacity-100"
        )}
      >
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight">
            Hello, {displayName}
          </h2>
          <p className="text-muted-foreground text-base">
            How can I help your team today?
          </p>
        </div>

        <form onSubmit={sendChat} className="w-full max-w-3xl">
          <div className="relative">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="New project? Team question? Just ask..."
              rows={3}
              disabled={isChatLoading}
              className="w-full resize-none rounded-xl border border-input bg-muted px-4 py-3 pr-16 text-sm leading-normal shadow-sm outline-none focus-visible:border-ring focus-visible:bg-background focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50"
            />
            <Button
              type="submit"
              size="icon-lg"
              disabled={isChatLoading || !chatInput.trim()}
              className="absolute bottom-3 right-2 h-10 w-10 rounded-lg"
              aria-label="Send message"
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </form>
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
              klira is thinking...
            </div>
          </div>
        )}

        {/* Input bar */}
        <div className="shrink-0 w-full py-4">
          <div className="mx-auto max-w-3xl px-4">
            <form onSubmit={sendChat} className="flex gap-2 items-end">
              <textarea
                ref={chatInputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="New project? Team question? Just ask..."
                disabled={isChatLoading}
                rows={1}
                className="flex-1 resize-none rounded-xl border border-input bg-muted px-4 py-3 text-sm leading-normal max-h-40 shadow-sm outline-none focus-visible:border-ring focus-visible:bg-background focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50 overflow-y-auto"
              />
              <Button
                type="submit"
                size="icon-lg"
                className="h-12 w-12 shrink-0 rounded-xl"
                disabled={isChatLoading || !chatInput.trim()}
                aria-label="Send message"
              >
                <ArrowUp className="size-5" />
              </Button>
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
