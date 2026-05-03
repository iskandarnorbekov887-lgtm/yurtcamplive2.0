# AGENTS.md Improvement Spec

**Date:** 2026-05-03  
**Scope:** Audit of `AGENTS.md`, `CLAUDE.md`, and all agent-facing documentation in this repository.

---

## 1. Audit Findings

### What's Good

- **`AGENTS.md` exists** — the file is present and not missing.
- **`PROJECT_ARCHITECTURE.md`** is detailed and accurate: covers auth flow, SSR cookie engine, proxy pattern, multi-currency logic, kitchen time-aware UI, and polling strategy. Useful context for an agent working on backend or auth code.
- **`SYSTEM_DESCRIPTION.md`** is the strongest file in the repo. It documents every route, every component, the full booking data model, known bugs with severity ratings, and a working/broken feature matrix. An agent can orient itself quickly from this file alone.
- **`docs/F-tech-debt-summary.md`** provides a prioritized three-step fix plan with file names, estimated effort, and business impact. Directly actionable.
- **`docs/B-database-schema.md`** contains a complete normalized schema proposal with migration SQL, rollback plan, and RLS policies. An agent asked to do DB work has everything it needs.
- **`.env.example`** documents all required and optional environment variables with comments.

---

### What's Missing

1. **`AGENTS.md` contains only an injected system rule** — the entire file is the `<!-- BEGIN:nextjs-agent-rules -->` block injected by the platform. There is zero project-specific guidance for agents. An agent reading `AGENTS.md` learns nothing about this codebase.

2. **No dev setup instructions for agents** — how to start the dev server, what env vars are required before any code runs, and how to verify the app is working are not in `AGENTS.md`. They exist in `README.md` but are buried under boilerplate.

3. **No coding conventions** — the codebase has clear patterns (always use `useAuth()`, never instantiate Supabase inside a component, use `localDateStr()` not `toISOString()` for dates) but none are written down in `AGENTS.md`. An agent will repeat the existing UTC timezone bug on every new page it touches.

4. **No file-edit boundaries** — `OccupancyCalendar.tsx` (73KB) and `ReserverIncomeForm.tsx` (39KB) are explicitly flagged as oversized in `docs/F-tech-debt-summary.md`, but there is no instruction telling agents not to add more logic to these files.

5. **No known-bugs reference** — `SYSTEM_DESCRIPTION.md` section 9 lists 15 known bugs. Agents are not pointed to this list and may unknowingly work around or re-introduce them.

6. **No test command** — there are no tests (`"test"` script is absent from `package.json`). Agents have no way to verify changes. `AGENTS.md` should acknowledge this and specify what manual verification looks like.

7. **No database access pattern** — the rule "always use the `supabase` client from context, never create a new one" exists in `PROJECT_ARCHITECTURE.md` section 7 but is not surfaced in `AGENTS.md` where an agent will look first.

8. **`CLAUDE.md` is a stub** — it contains only `@AGENTS.md`. This is fine as a redirect, but means any Claude-specific guidance must live in `AGENTS.md`, which is currently empty of project content.

9. **No `messages/` or `observer/` status** — these empty directories exist in `src/app/`. An agent asked to "add messaging" might start building in the wrong place or duplicate work. The stub status should be documented.

10. **No Electron context** — the project builds as both a web app and an Electron desktop app. Agents are not told that `next build` must produce a static export for Electron, or that `reactStrictMode: false` and `images.unoptimized: true` in `next.config.ts` are intentional Electron requirements.

---

### What's Wrong

1. **`AGENTS.md` is effectively empty of project content.** The only content is a platform-injected rule about reading Next.js docs. This is the most critical gap — the file exists but provides no value.

2. **`README.md` SQL schema is outdated.** The `CREATE TABLE bookings` in `README.md` shows a minimal 6-column schema. The actual `bookings` table has 40+ columns. An agent following the README to set up a dev database will create a broken schema.

3. **`README.md` references a non-existent `expenses` table.** The actual financial table is `camp_finances`. The `expenses` table in the README setup SQL does not exist in the running application.

4. **`PROJECT_ARCHITECTURE.md` calls the proxy "Next.js 16 Proxy pattern"** — this is not a real Next.js pattern name. The file is `src/proxy.ts` and it functions as middleware. Calling it a "Proxy pattern" will confuse an agent looking for Next.js documentation on this.

5. **`PROJECT_ARCHITECTURE.md` section 5A says `export const dynamic = 'force-dynamic'` is in the Root Layout** — this should be verified; if it has been removed or moved, agents will add it in the wrong place.

---

## 2. Improvement Spec

The following changes must be made to `AGENTS.md`. The platform-injected block must be preserved at the top.

---

### Spec: Rewrite `AGENTS.md`

**File:** `AGENTS.md`  
**Action:** Append project-specific content after the existing injected block.

The new content must cover the following sections, in this order:

---

#### Section: Project Identity

One paragraph. State:
- What the app is (staff-only yurt camp ERP, not customer-facing)
- Stack: Next.js 16 App Router, React 19, TypeScript, TailwindCSS, Supabase (PostgreSQL + Auth)
- Dual deployment: Vercel (web) and Electron (desktop)
- Four user roles: CEO, Manager, Reserver, Cook

---

#### Section: Dev Setup

Minimum steps to get the app running:

```
1. Copy .env.example → .env.local and fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
2. npm install
3. npm run dev
```

State that `SUPABASE_SERVICE_ROLE_KEY` is required only for the `/api/users` route (user management). The app runs without it for all other features.

State that there are no automated tests. Manual verification: load `/login`, sign in, confirm role-based redirect works.

---

#### Section: Coding Rules

These are non-negotiable patterns derived from the existing codebase:

1. **Supabase client** — Always use the client from `useAuth()` context or `createClient()` from `src/utils/supabase/`. Never instantiate `createClient()` from `@supabase/supabase-js` directly inside a component or page.

2. **Date formatting** — Always use the `localDateStr(date)` helper (defined in `src/utils/` or inline in components) when converting a `Date` to a `YYYY-MM-DD` string. Never use `new Date().toISOString().split('T')[0]` — this produces the wrong date in UTC+5 timezone (Uzbekistan).

3. **Auth access** — Always use `useAuth()` to read the current user and session. Never read from `supabase.auth.getUser()` directly in a component.

4. **Role checks** — All pages are wrapped in `<ProtectedRoute allowedRoles={[...]}>`. When adding a new page, wrap it. Allowed roles: `'CEO' | 'Manager' | 'Reserver' | 'Cook'`.

5. **Polling** — Data fetching uses `setInterval(fetchData, 5000)`. When adding a new data-fetching page, follow this pattern. Do not introduce Supabase Realtime subscriptions without a migration plan (see `docs/F-tech-debt-summary.md` Step 3).

6. **Large files** — Do not add logic to `src/components/occupancy-calendar.tsx` (73KB) or `src/components/reserver-income-form.tsx` (39KB). These are flagged for refactoring. Extract new logic into separate component files.

7. **`next.config.ts`** — `reactStrictMode: false` and `images.unoptimized: true` are intentional. Required for Electron compatibility. Do not change them.

---

#### Section: Known Issues (Do Not Reintroduce)

Point to `SYSTEM_DESCRIPTION.md` section 9 for the full bug list. Call out the three most likely to be accidentally reintroduced:

- **UTC date bug**: `toISOString().split('T')[0]` gives the wrong date. Use `localDateStr()`.
- **Double checkout**: No idempotency guard on checkout. A DB-level unique constraint on `camp_finances(booking_id, type, category)` is the planned fix (see `docs/B-database-schema.md`). Do not add a second checkout button click without this guard.
- **Single-manager assumption**: `profiles` query uses `.eq('role', 'Manager').single()`. If there are 2+ managers this throws. Do not copy this pattern.

---

#### Section: File Map (Key Files)

A short reference table so agents don't have to explore:

| Path | Purpose |
|---|---|
| `src/app/layout.tsx` | Root layout, `force-dynamic` export |
| `src/proxy.ts` | Auth middleware (redirects unauthenticated requests) |
| `src/lib/auth-context.tsx` | Global auth state, `useAuth()` hook |
| `src/lib/language-context.tsx` | i18n, `t()` translation hook |
| `src/utils/supabase/server.ts` | Server-side Supabase client |
| `src/utils/supabase/client.ts` | Browser-side Supabase client |
| `src/components/occupancy-calendar.tsx` | Main calendar UI (73KB — do not grow) |
| `src/components/reserver-income-form.tsx` | Booking creation form (39KB — do not grow) |
| `src/app/api/users/` | Privileged user management API (requires service role key) |
| `docs/` | Architecture docs, schema, tech debt, test plan |
| `SYSTEM_DESCRIPTION.md` | Authoritative feature/bug reference |

---

#### Section: Stub Features (Do Not Build Into)

Two directories exist but contain no working code:

- `src/app/messages/` — Messages feature. Not started. Do not add files here without a spec.
- `src/app/observer/` — Observer role portal. Not started. Do not add files here without a spec.

The Cook grocery list (`/cook` → Grocery tab) shows a UI but `handleSendToManager()` only calls `console.log()`. It does not save to the database. See `docs/G-cook-grocery-backend.md` for the planned implementation.

---

#### Section: Docs Index

| File | Contents |
|---|---|
| `SYSTEM_DESCRIPTION.md` | Full feature map, data model, known bugs, working/broken matrix |
| `PROJECT_ARCHITECTURE.md` | Auth flow, SSR, proxy, financial logic, kitchen logic |
| `docs/A-feature-brief.md` | Feature overview |
| `docs/B-database-schema.md` | Normalized schema proposal + migration SQL |
| `docs/C-risk-register.md` | Operational risks |
| `docs/D-test-plan.md` | Manual and automated test plan |
| `docs/E-migration-plan.md` | Data migration plan |
| `docs/F-tech-debt-summary.md` | Prioritized debt list with effort estimates |
| `docs/G-cook-grocery-backend.md` | Grocery feature backend spec |
| `docs/H-calendar-ux-spec.md` | Calendar UX spec |
| `docs/I-compliance-audit.md` | Compliance notes |
| `docs/J-prd-scalable.md` | Scalability PRD |

---

## 3. Secondary Fixes (Out of Scope for `AGENTS.md` but Noted)

These are documentation bugs that should be fixed separately:

| File | Issue | Fix |
|---|---|---|
| `README.md` | `CREATE TABLE bookings` schema is 6 columns; real table has 40+ | Replace with a note pointing to `docs/B-database-schema.md` |
| `README.md` | References `expenses` table that does not exist | Replace with `camp_finances` |
| `PROJECT_ARCHITECTURE.md` | Calls `src/proxy.ts` a "Next.js 16 Proxy pattern" | Rename to "auth middleware" |

---

## 4. Priority Order

1. **Rewrite `AGENTS.md`** — highest impact, zero risk, unblocks all agent work on this repo.
2. **Fix `README.md` schema** — prevents agents and new developers from creating a broken database.
3. **Fix `PROJECT_ARCHITECTURE.md` terminology** — low priority, cosmetic.
