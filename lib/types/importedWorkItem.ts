/**
 * A work item parsed from a CSV or AI import, before it is persisted.
 * Hours and dates are nullable because an import may omit them; the review
 * step is where the user fills the gaps.
 */
export type ImportedWorkItem = {
  name: string;
  estimated_hours: number | null;
  start_date: string | null;
  deadline: string | null;
};

/** An imported item in the review table, keyed for client-side editing. */
export type ImportedWorkItemDraft = ImportedWorkItem & { id: string };
