# CyberGym V2

CyberGym V2 is a modern, mobile-first fitness and nutrition tracking application featuring a cyberpunk aesthetic, multi-tier coach/athlete roles, intelligent ghost-set tracking, AI-powered nutritional analysis, and Android Health Connect integration.

---

## Architecture Overview

CyberGym V2 is architected for high performance, modularity, and operational resilience:

- **Frontend & UI**:
  - **Framework**: React 19 + TypeScript + Vite 8
  - **Styling**: Tailwind CSS v4 with dark neon cyberpunk theme
  - **Icons**: Lucide React
  - **Server State Management**: `@tanstack/react-query` v5
  - **Route Code Splitting**: Dynamic route chunking using `React.lazy()` and `<Suspense>` on high-complexity modules (`CoachCockpit` and `HistoryView`) to minimize initial bundle overhead.

- **Backend & Data Persistence**:
  - **Database & Auth**: Supabase (PostgreSQL 15+) with Row Level Security (RLS).
  - **RLS Recursion Protection**: Utilizes `SECURITY DEFINER` helper functions (e.g., `public.is_coach()`) to inspect user roles without triggering recursive RLS evaluation loops.
  - **Data Integrity**: Enforces foreign keys, cascade deletes, and check constraints across users, workouts, sets, nutrition logs, hydration, and routine templates.

- **Serverless Edge AI (Deno)**:
  - **Nutrition Parsing (`supabase/functions/parse-nutrition`)**: Deno Edge Function with fallback chain across Gemini models (`gemini-3.6-flash` → `gemini-3.5-flash` → `gemini-3.1-flash-lite`) and regex-based structured text extraction. Supports multi-dish conversational meal decomposition and micro/macro portion scaling.
  - **Athlete Provisioning (`supabase/functions/create-athlete`)**: Secure coach-only edge function creating athlete authentication identities and profile records via Supabase Auth Admin.

- **Mobile & Hardware Sync**:
  - **Engine**: Capacitor 7 (`@capacitor/core`, `@capacitor/android`).
  - **Health Connect**: Integrated with `@kiwi-health/capacitor-health-connect` supporting complete nutritional sync (energy, protein, carbohydrate, fat, dietary fiber), hydration, and workout sessions.

- **Intelligent Tracking Algorithms**:
  - **Ghost Sets**: `computeGhostSets` dynamically calculates target weights and reps based on chronological user history, automatically rendering ghost target inputs.
  - **Local Meal Parser**: Offline fallback parser supporting structured and conversational dietary logs.

---

## Project Structure

```
├── android/                 # Capacitor Android native project & manifest
├── public/                  # Static assets
├── scripts/                 # Maintenance and native verification scripts
├── src/
│   ├── components/          # Modular React components
│   │   ├── auth/            # Login and authentication views
│   │   ├── coach/           # Coach Cockpit (lazy-loaded)
│   │   ├── common/          # Header, BottomNav, shared UI
│   │   ├── exercises/       # Exercise library and management
│   │   ├── history/         # Workout and nutrition history (lazy-loaded)
│   │   ├── nutrition/       # Nutrition Engine and custom dish creation
│   │   ├── settings/        # Athlete settings and macro targets
│   │   └── workout/         # Workout Engine and Ghost Set tracker
│   ├── context/             # AuthContext and CoachContext
│   ├── hooks/               # useAuth and useCoach hooks
│   ├── lib/                 # Supabase client with fail-fast production checks
│   ├── types/               # TypeScript database and domain definitions
│   ├── utils/               # Ghost sets, date utilities, dish icons
│   ├── App.tsx              # Application shell, router, and lazy Suspense boundaries
│   └── main.tsx             # Application entry point
├── supabase/
│   ├── functions/           # Deno Edge Functions (parse-nutrition, create-athlete)
│   ├── migrations/          # Version-controlled SQL migrations and RLS policies
│   └── tests/               # pgTAP database tests
├── ARCHITECTURAL_AUDIT_RECOMMENDATIONS.md # Audit log of critical architectural fixes
└── package.json
```

---

## Environment Setup & Configuration

### 1. Client Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Populate the environment variables:
```env
VITE_SUPABASE_URL=http://127.0.0.1:58821
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```
*Note: In production (`import.meta.env.PROD`), `src/lib/supabase.ts` enforces fail-fast validation and will throw if `VITE_SUPABASE_URL` is omitted.*

### 2. Edge Functions Environment Variables
Copy `supabase/.env.example` to `supabase/.env`:
```bash
cp supabase/.env.example supabase/.env
```
Populate the Gemini API credentials:
```env
GEMINI_API_KEY=<your-gemini-api-key>
GEMINI_MODEL_ID=gemini-3.6-flash
```

---

## Local Development

### Prerequisites
- Node.js (v20+ recommended)
- Deno (v2+ for edge function testing)
- Docker & Supabase CLI (for local emulation and database testing)

### Installation & Running
```bash
# Install dependencies
npm install

# Start Supabase local emulator (if running local database)
npx supabase start

# Start the Vite development server
npm run dev

# Compile TypeScript and build production bundle
npm run build
```

---

## Test Suite Commands

The CyberGym test suite verifies code quality, unit logic, component interactions, database constraints/RLS, edge functions, and end-to-end user flows.

| Command | Tool | Scope |
|---|---|---|
| `npm run lint` | Oxlint | Fast static analysis and lint checks across TypeScript/TSX files |
| `npm test` or `npm test -- --run` | Vitest | Component, algorithm, hook, and client unit tests |
| `npm run test:db` | Supabase / pgTAP | Database schema, foreign key cascades, RLS security policies, role checks |
| `npm run test:deno` | Deno Test | Edge Functions: Gemini fallback, payload normalization, auth validation |
| `npm run test:e2e` | Playwright | Full end-to-end browser integration flows |
| `npm run test:all` | Orchestration | Sequentially executes unit, database, deno, and e2e test suites |

---

## Historical Context & Architecture Decisions

Refer to [`ARCHITECTURAL_AUDIT_RECOMMENDATIONS.md`](./ARCHITECTURAL_AUDIT_RECOMMENDATIONS.md) for detailed audit findings and root-cause analyses on:
- PostgreSQL RLS infinite recursion prevention (`is_coach()` security definer pattern).
- Health Connect plugin evaluation and migration to `@kiwi-health/capacitor-health-connect`.
- Strict Capacitor 7 dependency alignment.
