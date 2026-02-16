# Capacity Radar — MVP Status

## Product Overview

**Capacity Radar** is a deterministic clarity engine for small service teams (agencies, studios, consulting teams, founders managing 2–10 people) to visualize committed workload vs team capacity across a rolling time horizon.

**Core Promise**: Operational clarity to commit work without putting your team or your business at risk.

**Product Identity**: A system of operational clarity. It is NOT a project management tool, task manager, time tracking system, planner, CRM, kanban board, or feature playground.

**Key Principle**: Every change must increase clarity. If a feature adds complexity without improving decision clarity, it must not be implemented.

---

## Current MVP State (February 2026)

### ✅ Completed Features

#### 1. Dashboard (`/dashboard`)
- **DB-backed snapshot** showing committed workload vs team capacity
- **Configurable view windows**: Current month, Next 4 weeks, 12 weeks, Current Quarter, 6 months
- **KPI Cards**:
  - Exposure (LOW/MEDIUM/HIGH based on max utilization: <80%, 80–90%, >90%)
  - Max Utilization %
  - Total Committed Hours
  - Weeks Equivalent
- **Weekly Capacity Horizon**:
  - Shows each week with: `Xh / Yh committed` and `Z% utilization`
  - Visual progress bars with color coding (green <80%, amber 80–90%, red >90%)
  - Clear indication when over capacity (+X% over capacity)
- **At Risk Weeks**: List of weeks above 90% utilization
- **Committed Workload List**:
  - Shows work item name (or ID fallback)
  - Hours and date range (start → deadline)
  - Edit and Delete actions
  - Clean, minimal card design

#### 2. Evaluate Screen (`/evaluate`)
- **Live simulation** of new work impact before committing
- **Input Form**:
  - Work name
  - Total hours
  - Start date
  - Deadline (optional)
  - View window selector
- **Real-time Impact Preview**:
  - Before → After deltas for committed hours, overall utilization, max utilization
  - Exposure bucket change
  - Week-by-week impact visualization (matches Dashboard style)
  - Shows how work is distributed across weeks
- **Validation**: Prevents invalid inputs (hours > 0, start ≤ deadline, valid dates)
- **Commit Action**: Saves work item to database and refreshes Dashboard

#### 3. Work Item Management
- **Create**: Via Evaluate screen → Commit work
- **Edit**: Inline editing on Dashboard for name, hours, start date, deadline
- **Delete**: With confirmation
- **Validation**: Server-side validation with clear error messages
- **No horizon constraints**: Deadlines can be set freely (only constraint: deadline ≥ start date)

#### 4. Deterministic Engine (`lib/dashboardEngine.ts`)
- **ISO week buckets** (Monday–Sunday)
- **Capacity model**: Sum of `team_members.hours_per_cycle` / 4 = weekly capacity
- **Work distribution**: Uniform distribution of `estimated_hours` across date range (start_date → deadline, or through horizon end if no deadline)
- **All calculations reproducible** from database state
- **No AI, no predictive modeling, no guessing**

---

## Technical Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui
- **Font**: Instrument Sans (Google Fonts)
- **Design Style**: Flat design, border-based delimitations, minimal shadows, `rounded-md` border-radius

---

## Database Schema

### `teams`
- `id` (uuid)
- `name`
- `cycle_start_date`
- `cycle_end_date`
- `owner_user_id`
- `buffer_hours_per_week` (INTEGER NOT NULL DEFAULT 0) — weekly structural buffer; counts as committed

### `team_members`
- `id`
- `team_id`
- `name`
- `hours_per_cycle` (capacity per 4-week cycle)

### `work_items`
- `id`
- `team_id`
- `name`
- `estimated_hours`
- `start_date`
- `deadline` (nullable)
- `created_at`

---

## Design Decisions

### UI/UX
- **Flat design**: No shadows, borders for item delimitation
- **Consistent border-radius**: `rounded-md` throughout (reduced from `rounded-xl`/`rounded-2xl`)
- **Sticky navigation**: Header always visible for easy navigation
- **Clean hierarchy**: Name → hours/date range → actions
- **Consequence-focused copy**: Shows exposure levels, never tells user what to do
- **Minimal UI**: Only what increases clarity

### Validation Rules
- `estimated_hours` must be > 0
- `start_date` ≤ `deadline` (if deadline exists)
- Dates must be valid `YYYY-MM-DD` format
- **No horizon-bound constraints**: Teams can set deadlines as far out as needed

### Exposure Thresholds (Conservative)
- `< 80%` → LOW (green)
- `80–90%` → MEDIUM (amber)
- `> 90%` → HIGH (red)

---

## Architectural Principles

1. **All calculations deterministic** — reproducible from DB state
2. **Distribution logic** lives in `/lib/dashboardEngine.ts` only
3. **Evaluate reuses Dashboard engine logic** — no duplication
4. **No business logic in UI components**
5. **Server actions** for all mutations (create, update, delete)
6. **Revalidation** after mutations (`revalidatePath`)

---

## Key Files

- `/app/dashboard/page.tsx` — Dashboard server component
- `/app/evaluate/page.tsx` — Evaluate server component
- `/components/evaluate/EvaluateClient.tsx` — Evaluate client UI
- `/app/dashboard/workItemsList.tsx` — Work items list with edit/delete
- `/lib/dashboardEngine.ts` — Core capacity calculation engine
- `/lib/evaluateEngine.ts` — Work simulation logic
- `/app/actions/workItems.ts` — Server actions (create, update, delete)
- `/lib/db/getWorkItemsForTeam.ts` — Database queries

---

## What's NOT Included (Out of Scope)

- ❌ AI or predictive modeling
- ❌ Auto-rescheduling
- ❌ Drag-and-drop timeline
- ❌ Revenue modeling
- ❌ Multi-team switching
- ❌ Configurable horizon selector (fixed views only)
- ❌ Advanced filters
- ❌ Performance optimizations
- ❌ Authentication refactor
- ❌ Historical snapshots
- ❌ Scenario comparison

---

## MVP Completion Status

**Status**: ✅ MVP Hardening Phase Complete

All priorities from `NEXT_STEPS.md` completed:
- ✅ Priority 1: Edit Work Items
- ✅ Priority 2: Weekly Clarity Improvements
- ✅ Priority 3: Strengthen Validation

**Definition of Done** (all met):
- ✅ Work items can be created
- ✅ Work items can be edited
- ✅ Work items can be deleted
- ✅ Dashboard reflects deterministic recalculation
- ✅ Weekly clarity visible
- ✅ Validation prevents invalid states
- ✅ No hydration errors
- ✅ No business logic duplication

---

## Environment Variables Required

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

## Development Commands

- `npm run dev` — Start development server
- `npm run build` — Build for production
- `npm run start` — Start production server
- `npm run lint` — Run ESLint

---

## Product Tone

**Tone**: Clear, objective, consequential, never paternalistic

**Bad**: "You should not accept this project."
**Good**: "This commitment increases peak utilization to 104%."

The system shows exposure levels. It never tells users what to do—it provides data for defensible decisions.

---

## Current Team Context

- **MVP Team ID**: Hardcoded `5fcd452c-5ac8-4afe-be36-dc6145246735`
- **Single team** in MVP (no multi-team switching)
- **Timezone**: Europe/Madrid (for "today" calculations)
- **Locale**: en-GB (for date formatting)

---

*Last Updated: February 2026*
