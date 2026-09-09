// app/actions/phases.ts
"use server";

import type { ActionResult } from "@/lib/actionResult";
import { revalidateWorkSurfaces } from "@/lib/revalidate";
import { supabaseServer } from "@/lib/supabaseServer";
import { isValidYmd } from "@/lib/dates";
import { sanitizeHoursInput } from "@/lib/hours";
import type { WorkItemPhaseRow } from "@/lib/db/workItemPhases";

/**
 * Phase mutations go through Postgres functions, never through two sequential
 * writes. Each RPC updates the phase rows and re-derives
 * work_items.estimated_hours in one transaction, so the number the capacity
 * engine reads cannot be left stale by a half-completed mutation.
 *
 * The RPCs are SECURITY INVOKER, so RLS still scopes every call to work items
 * on a team the caller owns -- there is no teamId argument to spoof.
 */

type PhaseFields = {
  name: string;
  deadline: string;
  estimatedHours: number;
  ownerMemberId: string | null;
  startDate?: string | null;
};

type ValidatedPhaseFields = {
  p_name: string;
  p_deadline: string;
  p_estimated_hours: number;
  p_owner_member_id: string;
  p_start_date: string | null;
};

function validatePhaseFields(
  input: PhaseFields
): { ok: true; value: ValidatedPhaseFields } | { ok: false; message: string } {
  const name = input.name?.trim() ?? "";
  if (!name) {
    return { ok: false, message: "Phase name is required." };
  }

  const hours = sanitizeHoursInput(input.estimatedHours);
  if (hours <= 0) {
    return { ok: false, message: "Phase hours must be greater than 0." };
  }

  const deadline = input.deadline?.trim() ?? "";
  if (!isValidYmd(deadline)) {
    return {
      ok: false,
      message: "Phase deadline must be a valid YYYY-MM-DD date.",
    };
  }

  const ownerMemberId = input.ownerMemberId?.trim() || "";
  if (!ownerMemberId) {
    return { ok: false, message: "Phase owner is required." };
  }

  const startDate = input.startDate?.trim() || "";
  if (startDate) {
    if (!isValidYmd(startDate)) {
      return {
        ok: false,
        message: "Phase start date must be a valid YYYY-MM-DD date.",
      };
    }
    if (startDate > deadline) {
      return {
        ok: false,
        message: "Start date must be on or before the deadline.",
      };
    }
  }

  return {
    ok: true,
    value: {
      p_name: name,
      p_deadline: deadline,
      p_estimated_hours: hours,
      p_owner_member_id: ownerMemberId,
      p_start_date: startDate || null,
    },
  };
}

export async function createPhaseAction(
  input: PhaseFields & { workItemId: string }
): Promise<ActionResult<{ phase: WorkItemPhaseRow }>> {
  const fields = validatePhaseFields(input);
  if (!fields.ok) return fields;

  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .rpc("create_work_item_phase", {
      p_work_item_id: input.workItemId,
      ...fields.value,
    })
    .single();

  if (error) {
    return { ok: false, message: `Could not add phase: ${error.message}` };
  }

  revalidateWorkSurfaces();

  return { ok: true, phase: data as WorkItemPhaseRow };
}

export async function updatePhaseAction(
  input: PhaseFields & { phaseId: string }
): Promise<ActionResult<{ phase: WorkItemPhaseRow }>> {
  const fields = validatePhaseFields(input);
  if (!fields.ok) return fields;

  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .rpc("update_work_item_phase", {
      p_phase_id: input.phaseId,
      ...fields.value,
    })
    .single();

  if (error) {
    return { ok: false, message: `Could not save phase: ${error.message}` };
  }

  revalidateWorkSurfaces();

  return { ok: true, phase: data as WorkItemPhaseRow };
}

export async function deletePhaseAction(input: {
  phaseId: string;
}): Promise<ActionResult> {
  const supabase = await supabaseServer();

  const { data: phase, error: phaseError } = await supabase
    .from("work_item_phases")
    .select("id, work_item_id")
    .eq("id", input.phaseId)
    .maybeSingle();

  if (phaseError) {
    return { ok: false, message: `Could not delete phase: ${phaseError.message}` };
  }
  if (!phase) {
    return { ok: false, message: "Phase not found." };
  }

  const { count, error: countError } = await supabase
    .from("work_item_phases")
    .select("id", { count: "exact", head: true })
    .eq("work_item_id", phase.work_item_id);

  if (countError) {
    return { ok: false, message: `Could not delete phase: ${countError.message}` };
  }
  if ((count ?? 0) <= 1) {
    return {
      ok: false,
      message:
        "A work item needs at least one phase. Delete the work item instead.",
    };
  }

  const { error } = await supabase.rpc("delete_work_item_phase", {
    p_phase_id: input.phaseId,
  });

  if (error) {
    return { ok: false, message: `Could not delete phase: ${error.message}` };
  }

  revalidateWorkSurfaces();

  return { ok: true };
}

export async function reorderPhasesAction(input: {
  workItemId: string;
  phaseIds: string[];
}): Promise<ActionResult> {
  if (!input.phaseIds?.length) {
    return { ok: false, message: "Nothing to reorder." };
  }

  const supabase = await supabaseServer();

  const { error } = await supabase.rpc("reorder_work_item_phases", {
    p_work_item_id: input.workItemId,
    p_phase_ids: input.phaseIds,
  });

  if (error) {
    return { ok: false, message: `Could not reorder phases: ${error.message}` };
  }

  revalidateWorkSurfaces();

  return { ok: true };
}
