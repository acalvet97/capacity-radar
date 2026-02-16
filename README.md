# Capacity Radar

A deterministic clarity engine for small service teams to visualize committed workload vs team capacity.

Capacity Radar helps teams make data-driven decisions about accepting new work by showing exposure levels across a rolling time horizon. It is not a project management tool, task manager, or time tracking system—it's a system of operational clarity.

## Features

- **Dashboard**: View committed workload vs team capacity across configurable time windows
- **Evaluate**: Simulate how new work changes exposure before committing it
- **Work Management**: Create, edit, and delete work items with hours, start dates, and deadlines
- **Deterministic Engine**: All calculations are reproducible from database state—no AI, no guessing

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui

## Getting Started

### Prerequisites

- Node.js 20+ 
- npm, yarn, pnpm, or bun
- A Supabase project with the required schema

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd capacity-radar
```

2. Install dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
```

3. Set up environment variables:
Create a `.env.local` file in the root directory:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

The service role key is required for server-side mutations (e.g. updating team settings). Find it in Supabase Dashboard → Project Settings → API.

4. Set up the database schema:
Ensure your Supabase database has the following tables:
- `teams` (id, name, cycle_start_date, cycle_end_date, owner_user_id)
- `team_members` (id, team_id, name, hours_per_cycle)
- `work_items` (id, team_id, name, estimated_hours, start_date, deadline, created_at)

5. Run the development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

- `/app` - Next.js app router pages and routes
- `/components` - React components
- `/lib` - Core business logic and utilities
  - `dashboardEngine.ts` - Deterministic capacity calculation engine
  - `evaluateEngine.ts` - Work simulation logic
- `/lib/db` - Database query functions

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## License

MIT License - see [LICENSE](LICENSE) file for details.
