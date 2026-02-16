# NEXT_STEPS.md  
Capacity Radar — Execution Plan (MVP Phase)

This document defines exactly what should be built next.

Cursor must follow this document strictly.
No additional features should be introduced unless explicitly approved.

---

# Current Product State

The product is operational:

- Dashboard is DB-backed
- Evaluate screen simulates new work
- Work items can be created
- Work items can be deleted
- Deterministic engine in /lib/dashboardEngine.ts
- Fixed 4-week rolling horizon
- No AI
- No configurable horizon

We are in MVP hardening phase.

---

# Core Principle Reminder

Every change must increase clarity.

If a feature adds complexity without improving decision clarity,
it must not be implemented.

---

# Priority 1 — Edit Work Items (Critical)

## Why

Real-world usage requires updating:

- Deadlines change
- Scope changes
- Estimates change
- Naming changes

Without edit capability, the product cannot be trusted.

---

## Scope

Allow editing of:

- name
- estimated_hours
- start_date
- deadline (nullable)

No other fields.

---

## Implementation Requirements

### 1. UI

- Add an "Edit" action next to each work item in Dashboard
- Editing can be:
  - Inline form
  OR
  - Modal
  (Keep minimal. No design system expansion.)

### 2. Server Action

Create:

updateWorkItemAction()

Must:

- Validate inputs
- Update Supabase
- Call revalidatePath("/dashboard")
- Return updated item

---

### 3. Validation Rules

Must enforce:

- estimated_hours > 0
- start_date <= deadline (if deadline exists)
- start_date within current horizon
- deadline within current horizon

Fail safely with clear error message.

No silent failures.

---

### 4. Engine Integrity

After update:

- Snapshot recalculation must reflect new values
- No duplicated business logic
- No client-side recalculation divergence

All capacity recalculation remains inside dashboardEngine.

---

# Priority 2 — Weekly Clarity Improvements

## Why

The product must clearly show:

- Capacity per week
- Committed per week
- Utilization % per week

Currently only exposure summary is strongly visible.

We need clearer weekly breakdown.

---

## Scope

On Dashboard:

For each week in horizon:

Display:

- Capacity hours
- Committed hours
- Utilization percentage

This data already exists in horizonWeeks[].

No new engine logic required.

---

## UI Rules

- Minimal
- Numeric clarity first
- No charts library
- No complex visualization
- Keep consistent with current card structure

---

# Priority 3 — Strengthen Validation on Evaluate Screen

The Evaluate screen must prevent invalid scenarios.

---

## Add Validation For:

- estimated_hours must be > 0
- start_date cannot be before cycle_start_date
- deadline must not exceed horizon
- start_date <= deadline

Display validation messages clearly in UI.

---

# Strictly Out of Scope

Do NOT implement:

- Configurable horizon selector
- Multi-team switching
- AI forecasting
- Revenue modeling
- Optimization logic
- Drag and drop UI
- Timeline redesign
- Performance improvements
- Authentication refactor

---

# Architectural Guardrails

1. No business logic inside UI components.
2. All distribution logic must remain in /lib/dashboardEngine.ts.
3. Evaluate must reuse engine logic.
4. No duplicated math.
5. No derived logic inside client components.

---

# After Completing Priority 1–3

Stop.

Do not invent next features.

Wait for new product direction.

---

# Execution Strategy

Work in this order:

1. Implement updateWorkItemAction
2. Build Edit UI
3. Add validation
4. Test recalculation consistency
5. Improve weekly clarity UI
6. Add Evaluate validation improvements

Commit changes incrementally.

---

# Definition of Done (MVP Hardening Phase)

- Work items can be created
- Work items can be edited
- Work items can be deleted
- Dashboard reflects deterministic recalculation
- Weekly clarity visible
- Validation prevents invalid states
- No hydration errors
- No business logic duplication

---

# Reminder

Capacity Radar is:

A system of operational clarity.

Not:

- A PM tool
- A planning suite
- A feature playground

If something does not increase clarity,
do not build it.

---

End of Document
