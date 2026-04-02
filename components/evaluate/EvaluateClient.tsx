"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp } from "lucide-react";

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
import { commitWork } from "@/app/evaluate/actions";
import { sanitizeHoursInput } from "@/lib/hours";
import type {
  EvaluateChatMessage,
  EvaluateChatApiResponse,
  ResultCardData,
  CommitCardData,
} from "@/lib/evaluateChatTypes";

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
        <span className={fits ? "text-green-600 font-semibold" : "text-rose-600 font-semibold"}>
          {fits ? "✓ Fits within capacity" : "✗ Exceeds capacity"}
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
              <span className="tabular-nums text-muted-foreground">
                {w.beforePct}% → {w.afterPct}%
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
        <span className="text-lg">✓</span>
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
        <Input
          type="date"
          value={data.startYmd}
          onChange={(e) => onChange({ startYmd: e.target.value })}
          className="h-8 text-sm w-36"
        />
        <span className="text-muted-foreground">→</span>
        <Input
          type="date"
          value={data.deadlineYmd ?? ""}
          onChange={(e) => onChange({ deadlineYmd: e.target.value || undefined })}
          className="h-8 text-sm w-36"
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

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function EvaluateClient({
  snapshot,
  todayYmd,
}: {
  snapshot: DashboardSnapshot;
  todayYmd: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const defaultStart = snapshot.horizonWeeks[0]?.weekStartYmd ?? todayYmd;

  const [messages, setMessages] = useState<EvaluateChatMessage[]>([
    {
      role: "assistant",
      content:
        "Describe the work you’re considering — for example hours, deadline, and when it should start. I’ll map it to the plan and show capacity impact.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");

  const [name, setName] = useState("New work item");
  const [hours, setHours] = useState<string>("40");
  const [startYmd, setStartYmd] = useState<string>(defaultStart);
  const [deadlineYmd, setDeadlineYmd] = useState<string>("");
  const [allocationMode, setAllocationMode] = useState<AllocationMode>("fill_capacity");

  const [resultFlashKey, setResultFlashKey] = useState(0);
  const [commitSuccess, setCommitSuccess] = useState(false);
  const hoursDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const formFieldsRef = useRef({
    name,
    hours,
    startYmd,
    deadlineYmd,
    allocationMode,
  });
  formFieldsRef.current = { name, hours, startYmd, deadlineYmd, allocationMode };

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
    const el = threadRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isChatLoading]);

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
      setIsChatLoading(true);

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

        const data = (await res.json()) as EvaluateChatApiResponse & { error?: string };

        if (!res.ok) {
          throw new Error(data.error ?? "Chat request failed");
        }

        let merged = {
          name,
          hours,
          startYmd,
          deadlineYmd,
          allocationMode,
        };

        if (data.extractedParams) {
          merged = mergeExtractedIntoForm(merged, data.extractedParams);
          setName(merged.name);
          setHours(merged.hours);
          setStartYmd(merged.startYmd);
          setDeadlineYmd(merged.deadlineYmd);
          setAllocationMode(merged.allocationMode);
        }

        const safe = sanitizeHoursInput(merged.hours);
        const newWorkInput = buildNewWorkInputFromMerged(merged, safe);

        let resultCard: ResultCardData | undefined;
        let scenarioCards: OverCapacityScenario[] | undefined;
        let commitCard: CommitCardData | undefined;

        if (data.readyToEvaluate && newWorkInput) {
          const evalResult = evaluateNewWork(snapshot, newWorkInput);
          resultCard = buildResultCardData(evalResult);

          if (!fitsWithinCapacity(evalResult)) {
            scenarioCards = buildOverCapacityScenarios(snapshot, newWorkInput);
          }

          commitCard = {
            name: newWorkInput.name,
            totalHours: newWorkInput.totalHours,
            startYmd: newWorkInput.startYmd,
            deadlineYmd: newWorkInput.deadlineYmd,
            allocationMode: newWorkInput.allocationMode ?? "fill_capacity",
          };
        }

        setMessages([
          ...nextThread,
          {
            role: "assistant",
            content: data.message,
            resultCard,
            scenarioCards,
            commitCard,
          },
        ]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Something went wrong";
        setChatError(msg);
        toast.error(msg);
      } finally {
        setIsChatLoading(false);
      }
    },
    [allocationMode, deadlineYmd, hours, name, snapshot, startYmd, todayYmd]
  );

  function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || isChatLoading) return;
    const userMsg: EvaluateChatMessage = { role: "user", content: text };
    const nextThread = [...messages, userMsg];
    setMessages(nextThread);
    setChatInput("");
    void runChatRequest(nextThread);
  }

  function resetThreadAndForm() {
    setMessages([
      {
        role: "assistant",
        content:
          "Describe the work you’re considering — for example hours, deadline, and when it should start. I’ll map it to the plan and show capacity impact.",
      },
    ]);
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
    const userMsg: EvaluateChatMessage = { role: "user", content: "Show me the team status" };
    setMessages((prev) => {
      const nextThread = [...prev, userMsg];
      Promise.resolve().then(() => runChatRequest(nextThread));
      return nextThread;
    });
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
    <div className="flex flex-col h-[calc(100vh-64px)] max-w-3xl mx-auto">
      <header className="py-6 px-4 border-b shrink-0">
        <h1 className="text-xl font-semibold">Klyra</h1>
      </header>

      <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-6 min-h-0">
        {messages.map((msg, i) => {
          if (msg.role === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[75%] text-sm">
                  {msg.content}
                </div>
              </div>
            );
          }

          if (msg.isPostCommit && msg.postCommitWorkName) {
            const workName = msg.postCommitWorkName;
            return (
              <div key={i} className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 max-w-[90%] space-y-4 text-sm">
                  <p>
                    {workName} has been added to your team&apos;s committed work.
                  </p>
                  <p>What would you like to do next?</p>
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
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
            <div key={i} className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 max-w-[90%] space-y-4 text-sm">
                {msg.content ? <p className="whitespace-pre-wrap">{msg.content}</p> : null}
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
        {isChatLoading && <TypingIndicator />}
      </div>

      <div className="border-t px-4 py-4 shrink-0">
        <form onSubmit={sendChat} className="flex gap-2">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Describe new work, or ask about the team..."
            disabled={isChatLoading}
            className="flex-1 h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50"
          />
          <Button
            type="submit"
            size="icon-lg"
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
  );
}
