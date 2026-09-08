# PRD: Project Phases

## Background

Klira currently evaluates capacity using a single estimated-hours figure and a single deadline per work item (project). This creates two downstream problems:

1. **Undefined time allocation** — given only a start point and a deadline, there's no principled way to decide where within that span the hours are "consumed" (front-loaded? even spread? something else?). Every allocation choice at the whole-project level is somewhat arbitrary because real project work isn't evenly distributed — a website project doesn't spend hour 1 through hour 50 uniformly; it spends real hours in content gathering, then design, then development, then deploy, often with different owners and different urgency per stage.
2. **Inaccurate capacity output** — because the input (hours) and their timing are structurally wrong, the capacity engine's output can't be trusted regardless of how the math is fixed.

**Project phases** is the foundational fix: splitting a project into named phases (e.g. Content, Design, Development, Deploy), each with its own owner, deadline, and estimated hours, gives the system smaller, more accurate units to allocate and evaluate. Project-level estimated hours become the sum of its phases' hours instead of a single manually-entered number.

This PRD covers **only** the phases data model and UI. Per-phase time allocation logic and the capacity engine fix are separate, follow-on PRDs that depend on this one shipping first.

## Goals

- A project (work item) can be broken into an ordered list of phases.
- Each phase has: name, owner (a team member), deadline, estimated hours.
- A project's total estimated hours is derived (sum of phase hours), not manually entered, once phases exist.
- Projects can still exist **without** phases (backward compatibility — not every project needs this level of detail, especially small ones).
- Phase data is queryable in a way the future allocation/capacity logic can consume cleanly (i.e., don't paint ourselves into a corner on the schema).

## Non-goals (explicitly out of scope for this PRD)

- Deciding *how* hours are distributed within a phase's date range (next PRD).
- Recalculating team capacity based on phases (next PRD).
- Phase templates / reusable phase sets across projects (future consideration, not now).
- Notion or any external import populating phases automatically (separate integration PRD).
- Changes to Ask Klira / AI chat behavior.

## Assumptions to confirm before building

I'm working from what's on file about Klira's schema and stack, but I don't have direct visibility into your current repo. Before dropping this into Cursor, confirm/correct these:

- [ ] The projects table is called `work_items` (referenced in prior index work) — confirm exact name.
- [ ] Team members live in a `team_members` table with a `team_id` FK — confirm exact name and the column used to identify a person (`user_id`? `id`?).
- [ ] `work_items` currently has an `estimated_hours` column that's manually entered — confirm name and type (integer? numeric?).
- [ ] Confirm whether `work_items` has a single `deadline` column, or separate `start_date`/`deadline`.
- [ ] Confirm the ORM/query layer in use (raw Supabase client calls vs. an abstraction) so file-by-file instructions match reality.

If any of these are wrong, the migration and query examples below need to be adjusted accordingly — flag it and we'll revise before generating code.

## Data model

New table: `work_item_phases`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | default `gen_random_uuid()` |
| `work_item_id` | uuid, FK → `work_items.id` | `ON DELETE CASCADE` |
| `name` | text | e.g. "Content gathering" |
| `owner_id` | uuid, FK → `team_members.id` (or equivalent) | nullable — phase can be unassigned |
| `deadline` | date | required |
| `estimated_hours` | numeric | required, > 0 |
| `sort_order` | integer | for displaying phases in sequence; not necessarily chronological by deadline |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()` |

Changes to `work_items`:
- `estimated_hours` becomes **derived** when phases exist: either (a) keep the column and update it via trigger/application logic whenever phases change, or (b) compute it at query time as `SUM(work_item_phases.estimated_hours)` when phases exist, falling back to the existing manual value when they don't.
  - **Recommendation:** option (b), computed at query time. A trigger adds write-path complexity and a second source of truth; a query-time computation with `React.cache`-style memoization (per existing convention) keeps this simpler and avoids drift. Flag if you'd rather go with a trigger for reasons I'm not seeing.
- No column removal — this must stay backward compatible with projects that have no phases.

RLS: `work_item_phases` needs the same team-scoped RLS pattern already in place for `work_items` — a phase is only visible/editable by members of the team that owns the parent work item. Mirror whatever policy pattern exists on `work_items` today.

Indexes: `work_item_id` (for phase lookups per project) and `owner_id` (for "my phases" type queries later).

## User flow

1. User opens a project detail view (existing).
2. A new "Phases" section appears below/alongside the existing single-hours/deadline fields.
   - If no phases exist: show the current single estimated-hours + deadline fields as-is, with an option to "Break this into phases."
   - If phases exist: the single estimated-hours field becomes read-only/derived, displayed as "Total: sum of phases," and the single deadline field's relationship to phase deadlines should be clarified in copy (e.g., project deadline = latest phase deadline, or kept as an independent field — **decide before building UI**, see Open Questions).
3. "Add phase" opens an inline form or row: name, owner (dropdown from team members), deadline (date picker), estimated hours (number input).
4. Phases display as an ordered list (drag-to-reorder using `sort_order`, or simple up/down — match whatever pattern Shadcn components you're already using for similar lists, if any exist).
5. Each phase row is editable inline and deletable (with a confirmation if it has estimated hours > 0, to avoid accidental data loss).
6. Deleting the last phase reverts the project to the "no phases" state (manual hours field becomes editable again).

## File-by-file change instructions

These paths are best-guesses based on a standard Next.js App Router + Supabase structure and what's known about Klira's build. **Confirm actual paths in your repo before handing to Cursor** — treat this as the shape of the change, not literal paths.

1. **Migration** — `supabase/migrations/<timestamp>_add_work_item_phases.sql`
   - Create `work_item_phases` table as specified above.
   - Add RLS policies mirroring `work_items`.
   - Add indexes on `work_item_id`, `owner_id`.

2. **Types** — wherever Supabase types are generated/maintained (e.g. `types/supabase.ts` or similar) — regenerate after migration.

3. **Data layer** — likely a `lib/queries/` or `lib/data/` directory (matching whatever pattern `getDefaultDashboardSnapshot` / `getTeamIdForUser` live in):
   - `getPhasesForWorkItem(workItemId: string)` — fetch phases ordered by `sort_order`.
   - `createPhase(...)`, `updatePhase(...)`, `deletePhase(...)` — standard CRUD, team-scoped.
   - Update whatever function currently returns a work item's `estimated_hours` to compute the derived total when phases exist. Follow the existing `React.cache` + primitive-arguments convention already established in the codebase.

4. **UI — project detail view**: locate the existing component rendering a single project's estimated-hours/deadline fields. Add the phases section as described in the user flow. New components likely needed:
   - `PhaseList.tsx` — renders ordered phases, handles reorder.
   - `PhaseRow.tsx` — single phase, inline edit/delete.
   - `AddPhaseForm.tsx` (or inline row variant).

5. **Onboarding / import flow**: the CSV/Excel and AI-assisted import (mentioned in current onboarding wizard) should **not** be required to support phases in this PRD — new projects can be created without phases, and phases added afterward. Confirm this scope limit is acceptable, or if phases need to be importable at onboarding time too (would expand this PRD).

## What should NOT change

- The capacity engine's actual calculation logic — this PRD only adds the data model and UI for phases. Do not touch capacity calculation code as part of this change; that's the next PRD.
- Existing projects without phases must continue working exactly as they do today — no forced migration of existing data into phases.
- Ask Klira / AI chat — no changes.
- The onboarding wizard's existing import flow — out of scope (see above), unless you decide otherwise.

## Edge cases

- **Project has zero phases**: default/legacy behavior, single hours field stays editable.
- **All phases deleted**: revert to legacy single-field state; don't leave the project in a broken derived-but-empty state.
- **Phase deadline later than project deadline**: should this be blocked, warned, or allowed silently? (See Open Questions.)
- **Phase owner removed from team**: phase's `owner_id` should probably nullify rather than cascade-delete the phase (use `ON DELETE SET NULL`, not `CASCADE`, on the owner FK).
- **Estimated hours = 0**: decide if this is valid (a phase that's a milestone/checkpoint with no work) or should be blocked with a minimum.
- **Reordering**: `sort_order` collisions if two phases get the same value — ensure update logic re-sequences cleanly.

## Build order

1. Migration + RLS policies + indexes.
2. Regenerate types, confirm RLS works via a quick manual test (query as a non-team user should return nothing).
3. Data layer functions (CRUD + derived-hours computation).
4. UI: read-only phase list rendering first (confirm data flows correctly end-to-end).
5. UI: add/edit/delete interactions.
6. UI: reordering.
7. Manual QA pass against the edge cases above.

## Open questions (resolve before or during build)

1. When phases exist, is the project's top-level `deadline` field: (a) still manually set and independent of phase deadlines, or (b) auto-derived as the latest phase deadline? This affects both schema handling and UI copy.
2. Should a phase's deadline be validated against the project deadline (blocking vs. warning vs. unrestricted)?
3. Do phases need to support import (CSV/AI-assisted) at project-creation time, or is "create project, then add phases" an acceptable first version?
4. Is a phase owner required, or can phases stay unassigned indefinitely?
