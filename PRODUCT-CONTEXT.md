# Capacity Radar  
**Internal Codename: City Signals (transitioning to Capacity Radar)**

---

# 1. Product Overview

## Core Promise

> **Operational clarity to commit work without putting your team or your business at risk.**

Capacity Radar is not a project management tool.  
It is not a task manager.  
It is not a time tracking system.

It is a **clarity engine**.

It helps small teams justify and evaluate workload decisions using objective capacity data.

---

# 2. Long-Term Vision

Capacity Radar becomes:

- The decision layer above execution tools
- A workload exposure radar
- A justification engine for operational decisions
- A clarity system for service businesses

Future direction (NOT MVP):

- Scenario comparison
- Capacity forecasting
- Historical snapshots
- Risk scoring evolution
- Revenue-aware workload tradeoffs
- Hiring signal detection
- Multi-team modeling
- AI-based pattern insights (long-term only)

For now:

We are building a **deterministic clarity engine with a minimal UI.**

---

# 3. Target User

Small service teams:

- Digital agencies
- Studios
- Consulting teams
- Early-stage product teams
- Founders managing 2–10 people

They:

- Sell work with deadlines
- Have fixed team capacity
- Frequently say yes to work
- Realize overload too late
- Need defensible decisions

---

# 4. Established JTBD

## Core JTBD

> **When I need to justify or evaluate future workload,  
> I want to clearly see how much capacity is already committed versus available,  
> so I can make decisions based on data instead of intuition or pressure.**

---

## Why This Matters

This product helps justify:

- Saying yes to new work
- Saying no to new work
- Renegotiating deadlines
- Hiring decisions
- Delaying internal initiatives

It provides:

- Objective capacity visibility
- Quantified exposure
- Defensible decision support

---

## Functional Outcome

- Clear committed vs available view
- Weekly exposure visibility
- Deterministic workload modeling
- Quantified peak utilization

---

## Emotional Outcome

The user feels:

- In control
- Calm under pressure
- Defensible in front of clients or partners
- Like a responsible operator

---

# 5. Product Principles (Non-Negotiable)

### 1. Clarity over features  
No complexity unless it increases decision clarity.

### 2. Deterministic > Smart  
No AI. No predictive modeling. No guessing.

### 3. Consequences, not instructions  
The system shows exposure levels.  
It never says: “Do not accept this project.”

### 4. Conservative Exposure Thresholds

Utilization thresholds:

- `< 80%` → LOW
- `80–90%` → MEDIUM
- `> 90%` → HIGH

These are intentionally conservative.

---

# 6. MVP Scope (Locked)

## Horizon

- Fixed rolling 4-week horizon
- Based on `team.cycle_start_date`
- Weekly buckets (Monday–Sunday)

No configurable horizon for MVP.

---

## Team Capacity

Static capacity model:

- Each `team_member` has `hours_per_cycle`
- Total capacity = sum of team_members.hours_per_cycle
- Capacity distributed evenly across 4 weeks

No dynamic recalculation logic.

---

## Work Distribution Rules

### If work has a deadline:

Distribute `estimated_hours` uniformly between:

- `start_date`
- `deadline`

### If no deadline:

Distribute hours across remaining horizon weeks.

No optimization.  
No intelligent reshuffling.  
No priority logic.

---

## Core Snapshot Metrics

DashboardSnapshot:

- `horizonWeeks[]`
- `totalCommittedHours`
- `totalCapacityHours`
- `overallUtilizationPct`
- `maxUtilizationPct`
- `exposureBucket`
- `weeksEquivalent`

All calculations must be deterministic and reproducible from DB state.

---

# 7. Technical Stack

- Next.js (App Router)
- TypeScript
- Server Components + Client Components
- Supabase (Postgres)
- Deterministic calculation engine in `/lib/dashboardEngine.ts`

No external APIs.  
No AI services.

---

# 8. Database Schema (Supabase)

## teams

- id (uuid)
- name
- cycle_start_date
- cycle_end_date
- owner_user_id

---

## team_members

- id
- team_id
- name
- hours_per_cycle

---

## work_items

- id
- team_id
- name
- estimated_hours
- start_date
- deadline (nullable)
- created_at

---

# 9. Current Product State (Feb 2026)

The MVP is DB-backed and operational.

## Dashboard

- Pulls real data from Supabase
- Uses `getDashboardSnapshotFromDb(teamId)`
- Builds 4-week horizon
- Distributes work deterministically
- Calculates exposure bucket
- Shows committed work list
- Allows deleting work items

---

## Evaluate Screen

- Loads baseline snapshot from DB
- Client-side simulation via `evaluateNewWork()`
- Live deterministic recalculation
- "Commit work" inserts into `work_items`
- `router.refresh()` updates baseline

---

## Engine

- Fully deterministic
- Shared logic between Dashboard and Evaluate
- No duplicated business logic
- No historical storage
- No optimization logic

---

# 10. Explicitly Out of Scope (Do NOT Build)

❌ No AI  
❌ No predictive modeling  
❌ No auto-rescheduling  
❌ No drag-and-drop timeline  
❌ No revenue modeling  
❌ No multi-team switching  
❌ No auth refactor  
❌ No configurable horizon selector  
❌ No advanced filters  
❌ No performance optimizations yet  

If a feature does not increase clarity, it must not be built.

---

# 11. Architectural Constraints

1. All calculations must remain deterministic.
2. Distribution logic must live in `/lib/dashboardEngine.ts`.
3. Evaluate must use same engine logic as Dashboard.
4. No duplicated business logic.
5. Snapshot must be reproducible from DB state.
6. UI should remain minimal and clarity-focused.

---

# 12. Current Known Paused Feature

A configurable horizon selector (4w, 12w, etc.) was attempted but caused hydration issues.

This is paused.

MVP remains fixed 4-week horizon.

Do not attempt to reintroduce configurable horizons.

---

# 13. Development Priorities (Next)

## Priority 1 — Edit Work Items

Currently:

- Can create work items
- Can delete work items

Missing:

- Edit name
- Edit estimated_hours
- Edit start_date
- Edit deadline

This is critical for real-world usability.

---

## Priority 2 — Weekly Clarity Improvements

Improve Dashboard clarity without adding complexity:

- Show weekly capacity
- Show weekly committed
- Show weekly utilization %

Maintain minimal UI.

---

## Priority 3 — Validation Rules

Add safe validation:

- estimated_hours > 0
- start_date <= deadline
- start_date within horizon

Fail safely and predictably.

---

# 14. Tone and System Behavior

Tone must be:

- Clear
- Objective
- Consequential
- Never paternalistic

Bad:
"You should not accept this project."

Good:
"This commitment increases peak utilization to 104%."

---

# 15. Product Identity

Capacity Radar is:

> A system of operational clarity.

It is not:

- A project management tool
- A planner
- A CRM
- A kanban board
- A time tracking system

---

# End of Document
