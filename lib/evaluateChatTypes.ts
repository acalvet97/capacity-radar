import type { AllocationMode, OverCapacityScenario } from "@/lib/evaluateEngine";

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
  resultCard?: ResultCardData;
  scenarioCards?: OverCapacityScenario[];
  commitCard?: CommitCardData;
  isPostCommit?: boolean;
  /** Set with isPostCommit for the confirmation bubble after a successful commit. */
  postCommitWorkName?: string;
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
  /** Present when the server ran the engine (deterministic). */
  engineDigest?: {
    peakUtilizationPct: number;
    overallUtilizationPct: number;
    fitsWithinCapacity: boolean;
    weeksInSpan: number;
    scenarioTitles?: string[];
  };
};
