import type { AllocationMode, OverCapacityScenario } from "@/lib/evaluateEngine";

/** Delimiter used in the two-part stream protocol. */
export const STREAM_DELIMITER = "\n\n__Klyra_STRUCTURED__\n";

/** Intent from the chat model (PRD 2b). */
export type ChatIntent = "evaluate" | "query" | "ambiguous";

/** Client ↔ /api/evaluate/chat message shape */
export type ResultCardData = {
  peakUtilizationPct: number;
  overallUtilizationPct: number;
  fitsWithinCapacity: boolean;
  totalCommittedHours: number;
  totalCapacityHours: number;
  weeklyBreakdown: {
    weekLabel: string;
    beforePct: number;
    afterPct: number;
    capacityHours: number;
    committedHours: number;
    bufferHoursPerWeek: number;
  }[];
};

export type CommitCardData = {
  name: string;
  totalHours: number;
  startYmd: string;
  deadlineYmd?: string;
  allocationMode: AllocationMode;
};

export type EvaluateChatMessage = {
  role: "user" | "assistant";
  content: string;
  /** Set when the message originated from a suggested prompt box. */
  promptIconName?: string;
  /** True while the streaming response is still arriving. */
  isStreaming?: boolean;
  intent?: ChatIntent;
  resultCard?: ResultCardData;
  scenarioCards?: OverCapacityScenario[];
  commitCard?: CommitCardData;
  isPostCommit?: boolean;
  /** Set with isPostCommit for the confirmation bubble after a successful commit. */
  postCommitWorkName?: string;
  /** Last completed evaluation turn — used when opening the commit-from-chat modal. */
  readyToEvaluate?: boolean;
  extractedParams?: ExtractedWorkParams | null;
};

/** AI extraction payload (partial until complete). */
export type ExtractedWorkParams = {
  name?: string;
  totalHours?: number;
  startYmd?: string;
  deadlineYmd?: string;
  allocationMode?: AllocationMode;
};

/** First model response: extraction only (JSON). */
export type EvaluateChatExtractionResponse = {
  message: string;
  extractedParams: ExtractedWorkParams | null;
  readyToEvaluate: boolean;
};

/** API success body returned to the client. */
export type EvaluateChatApiResponse = EvaluateChatExtractionResponse & {
  intent: ChatIntent;
  /** Present when the server ran the engine (deterministic). */
  engineDigest?: {
    peakUtilizationPct: number;
    overallUtilizationPct: number;
    fitsWithinCapacity: boolean;
    weeksInSpan: number;
    scenarioTitles?: string[];
  };
  /** Client opens commit modal when user confirms adding evaluated work. */
  action: "open_commit_modal" | null;
};
