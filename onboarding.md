# PRD — Klira Onboarding & Data Freshness System

## Overview

This document covers two related features:

1. **Onboarding wizard** — guides new users through workspace setup and initial work item import
2. **Staleness notification system** — keeps work item data accurate after onboarding

The goal is to eliminate the cold-start friction of getting a team's current work into Klira, and to build a lightweight habit loop that keeps the data trustworthy over time.

---

## Context & Constraints

- **Stack:** Next.js (App Router) + Supabase
- **Auth:** Supabase Auth (`auth.users`)
- **No assignees:** Work items are team-level, not assigned to individual members
- **Team members** are rows in the DB used solely for capacity calculation (name + weekly hours). They are not Supabase auth users.
- **Capacity model:** `Usable capacity = sum of member weekly hours - buffer hours (fixed, per week)`
- **Settings page** already has the full team member management UI. The onboarding wizard must reuse these components — do not rebuild them.

---

## Feature 1 — Onboarding Wizard

### Routing & Trigger

- Route: `/onboarding`
- After successful registration, redirect to `/onboarding` instead of the dashboard
- On every app load, check `onboarding_completed` on the user's team record. If `false`, redirect to `/onboarding`. If `true`, proceed normally.
- Once the wizard is completed, set `onboarding_completed = true` and redirect to `/dashboard`

### Schema Change

```sql
-- Add to your teams table
ALTER TABLE teams
  ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT false;
```

---

### Step 1 — Workspace Name

**What it does:** Captures the team name.

**UI:**
- Single text input: "What's your team called?"
- CTA: "Continue →"

**Notes:**
- If the team name was already set during registration, pre-fill and let the user confirm or edit.
- On continue, update the `teams` record with the name and proceed to Step 2.

---

### Step 2 — Team Setup

**What it does:** Captures team members and capacity buffer so Klira can calculate weekly usable capacity.

**UI:**
- Reuse the exact same components from the Settings page for:
  - Adding/removing team members (name + weekly hours)
  - Setting the capacity buffer (fixed hours per week)
- Show a live capacity summary below the member list that updates reactively as the user adds members or changes the buffer:

```
Total weekly hours:     120h
Buffer:                - 10h
────────────────────────────
Usable capacity:        110h / week
```

- This number is purely client-side state — no API call needed to display it.
- CTA: "Continue →" (triggers a save of all members and buffer before moving on)

**Notes:**
- The wizard uses the same API calls as Settings — no new backend logic needed here.
- "Continue" without adding any members should be allowed (user can do this later in Settings). Show a soft warning: *"You haven't added any team members yet. Klira needs this to calculate capacity."* but don't block progression.

---

### Step 3 — Load Your Work

**What it does:** Gets the team's current projects into Klira via one of three paths.

**UI — Method picker:**

Present three options clearly:

```
✨  Describe your work   →  AI-assisted import
📄  Upload a file        →  CSV / Excel import
➕  I'll add it manually →  Skip to dashboard
```

"I'll add it manually" skips to the dashboard immediately and marks onboarding as complete.

---

#### Path A — AI Text Import

**UI:**
- Large textarea with placeholder copy:
  > *"Tell us what your team is currently working on. Don't worry about format — just describe it naturally.*
  >
  > *e.g. We're redesigning a client's e-commerce site, around 60 hours of work, started last week and due by end of April. Also have a logo project, roughly 15 hours, needs to be done by the 20th..."*
- Submit button: "Parse my projects →"
- On submit: show a loading state ("Analysing your work...") while the API call runs
- On success: render the **Review Table** (see below)

**API Route:** `POST /api/onboarding/ai-import`

Request body:
```json
{ "text": "user's raw input" }
```

Implementation:
- Call the Anthropic Claude API (use `claude-sonnet-4-20250514`)
- Use this system prompt:

```
You are a work item parser for a project management tool. 
Extract all projects or tasks from the user's text and return 
ONLY a valid JSON array with no explanation, no preamble, 
and no markdown formatting.

Each item must have exactly these fields:
- name: string (required)
- estimated_hours: number or null (if not mentioned)
- start_date: ISO 8601 date string or null (if not mentioned)
- deadline: ISO 8601 date string or null (if not mentioned)

Today's date is {TODAY_DATE}. 
Interpret relative dates like "end of month", "next week", 
"by the 20th" accordingly based on today's date.
Return null for any field not mentioned or not inferable.
```

- Parse the response as JSON
- Return the array to the client

Response body:
```json
[
  {
    "name": "E-commerce redesign",
    "estimated_hours": 60,
    "start_date": "2026-04-01",
    "deadline": "2026-04-30"
  },
  {
    "name": "Logo project",
    "estimated_hours": 15,
    "start_date": null,
    "deadline": "2026-04-20"
  }
]
```

---

#### Path B — CSV / Excel Import

**UI:**
- "Download template" link — serves a pre-built `.xlsx` file with 4 columns and 2 example rows
- File upload input (accepts `.csv`, `.xlsx`, `.xls`)
- On upload: parse client-side or send to API, then render the **Review Table**

**Template file** (`Klira-import-template.xlsx`):

| Project Name | Estimated Hours | Start Date | Deadline |
|---|---|---|---|
| Example: Website redesign | 60 | 2026-04-01 | 2026-04-30 |
| Example: Logo project | 15 | | 2026-04-20 |

Include a note row at the top or a separate sheet with format instructions:
- Dates must be `YYYY-MM-DD` or `DD/MM/YYYY` — both are accepted
- Hours must be a number (e.g. `40`, not `40h`)
- Leave cells blank if unknown

**API Route:** `POST /api/onboarding/csv-import`

- Accept multipart file upload
- Parse CSV with a library like `papaparse` (client-side) or `csv-parse` (server-side)
- For Excel, use `xlsx` (SheetJS)
- Normalise dates — accept both `YYYY-MM-DD` and `DD/MM/YYYY`, output ISO strings
- Return the same JSON array structure as the AI import
- Render the **Review Table**

---

#### Review Table (shared by both import paths)

After either import method returns data, show a review table before committing anything to the database.

**UI:**
- Every cell is inline-editable
- Null / empty fields render as a soft "—" with a pencil icon on hover to indicate editability
- Users can delete individual rows with a trash icon
- Users can add a new empty row manually
- CTA: "Add [N] projects to Klira →"
- Secondary: "← Go back" to re-try the import

**On confirm:**
- `POST /api/work-items/bulk-create`
- Bulk insert all rows into the `work_items` table
- Add `import_source` field to each row (`'ai'` or `'csv'`) — useful for beta analytics
- Mark `onboarding_completed = true` on the team
- Redirect to `/dashboard`

---

### Schema Changes for Work Items

```sql
-- Add import_source to work_items table for beta analytics
ALTER TABLE work_items
  ADD COLUMN import_source text CHECK (import_source IN ('manual', 'ai', 'csv'));
```

---

## Feature 2 — Staleness Notification System

### Goal

Nudge the user when work items with imminent deadlines have never been updated since creation — a signal that the data may be stale.

### Trigger Logic

Run this check on every dashboard load (no cron job needed for beta):

```
Find work items where:
  1. deadline is within the next 7 days (from today)
  2. updated_at = created_at (never been edited since creation)

If any such items exist:
  Check if an unread notification of type 'deadline_this_week' 
  already exists for today (created_at::date = today).
  
  If not → insert a new notification row.
```

### Schema

```sql
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL,         -- 'deadline_this_week'
  payload     jsonb NOT NULL,        -- { work_item_ids: [...], count: 2 }
  read_at     timestamptz,           -- null = unread
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON notifications (user_id, read_at, created_at);
```

### API Routes

`GET /api/notifications`
- Returns all unread notifications for the current user
- Used to populate the bell badge count and dropdown

`PATCH /api/notifications/:id/read`
- Sets `read_at = now()` on a notification
- Called when the user opens the dropdown or clicks a card

### Bell UI Component

- Lives in the top navigation bar
- Shows a badge with the count of unread notifications
- On click: opens a dropdown panel

**Notification card copy:**

> 🔴 **2 projects are due this week**
> Their data hasn't been updated since they were created. Are the hours and deadlines still accurate?
> [Review projects →]

- "Review projects →" navigates to `/work-items` with the relevant item IDs highlighted (pass as query params, e.g. `?highlight=id1,id2`)
- Clicking the card marks the notification as read

### Future Enhancements (post-beta)

- Email version of the same nudge (Monday morning, same logic)
- User preference to disable notifications
- Additional notification types (e.g. capacity exceeded, new week summary)

---

## Build Order

Work through features in this sequence:

1. **DB migrations** — add `onboarding_completed` to teams, `import_source` to work_items, create `notifications` table
2. **Redirect logic** — post-registration redirect to `/onboarding`, guard on app load
3. **Wizard shell** — 3-step layout with progress indicator and navigation
4. **Step 1** — workspace name
5. **Step 2** — reuse Settings components for team members + buffer, add live capacity display
6. **Step 3 — AI import** — textarea UI, `/api/onboarding/ai-import` route, review table
7. **Step 3 — CSV import** — template file, upload UI, `/api/onboarding/csv-import` route, reuse review table
8. **Bulk create API** — `/api/work-items/bulk-create`, mark onboarding complete
9. **Notifications schema + check logic** — trigger on dashboard load
10. **Bell UI** — badge, dropdown, notification cards, mark-as-read

---

## Key Design Principles

- **Reuse before rebuild.** The Settings components for team members and buffer already exist and work. Wrap them — don't duplicate them.
- **Review before commit.** Neither import method writes to the DB until the user confirms the review table. This builds trust.
- **Never block progression.** Every step in the wizard has a skip or "I'll do this later" path. A forced step is a churned user.
- **One import experience.** The AI and CSV paths must render the same review table component. Shared UX, shared confirmation flow, shared bulk-create API call.
- **Capture intent, not noise.** The notification system only fires on items that are both imminent and untouched — not a generic "you haven't logged in" nag.