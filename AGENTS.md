<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

## Project Identity

**Isky Camp Flow** is a staff-only internal ERP for a yurt camp (glamping business) in Uzbekistan. Guests never interact with it. It manages the full guest lifecycle: booking → check-in → check-out → financial recording.

- **Stack:** Next.js 16 App Router, React 19, TypeScript, TailwindCSS, Supabase (PostgreSQL + Auth)
- **Deployment:** Vercel (web) and Electron (desktop — static export)
- **Roles:** CEO, Manager, Reserver, Cook
- **No component library** — all UI is hand-written TailwindCSS. No icon library — inline SVG only.

---

## Dev Setup

```bash
# 1. Copy env template and fill in Supabase credentials
cp .env.example .env.local

# 2. Install dependencies
npm install

# 3. Start dev server
npm run dev
```

Required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.  
`SUPABASE_SERVICE_ROLE_KEY` is only needed for the `/api/users` route (user management). The app runs without it for all other features.

**There are no automated tests.** Manual verification: load `/login`, sign in with a valid Supabase account, confirm the role-based redirect works (CEO → `/ceo`, Manager → `/manager`, etc.).

---

## Coding Rules

These patterns are enforced throughout the codebase. Follow them on every change.

### 1. Supabase client
Always use the client from `useAuth()` context or `createClient()` from `src/utils/supabase/`. Never call `createClient()` from `@supabase/supabase-js` directly inside a component or page.

```ts
// ✅ correct
const { supabase } = useAuth()

// ❌ wrong — creates a second client, breaks session handling
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(url, key)
```

### 2. Date formatting — UTC timezone bug
The camp is in UTC+5 (Uzbekistan). `new Date().toISOString().split('T')[0]` returns the **previous day** at midnight local time. This bug already exists in several files. Do not copy it.

```ts
// ✅ correct — use the localDateStr helper
const today = localDateStr(new Date())

// ❌ wrong — off by one day in UTC+5
const today = new Date().toISOString().split('T')[0]
```

`localDateStr` is defined inline in several components. If it is not available in the file you are editing, copy the implementation:
```ts
const localDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
```

### 3. Auth access
Always use `useAuth()` to read the current user and session. Never call `supabase.auth.getUser()` directly in a component.

### 4. Role checks
All pages must be wrapped in `<ProtectedRoute allowedRoles={[...]}>`. Valid role strings: `'CEO' | 'Manager' | 'Reserver' | 'Cook'`.

### 5. Data polling
Pages fetch data with `setInterval(fetchData, 5000)`. Follow this pattern when adding new data-fetching pages. Do not introduce Supabase Realtime subscriptions without a migration plan — see `docs/F-tech-debt-summary.md` Step 3.

### 6. Large files — do not grow
`src/components/occupancy-calendar.tsx` (~73KB) and `src/components/reserver-income-form.tsx` (~39KB) are flagged for refactoring. Do not add logic to these files. Extract new logic into separate component files.

### 7. Electron compatibility — do not change
`next.config.ts` has `reactStrictMode: false` and `images.unoptimized: true`. Both are intentional requirements for the Electron desktop build. Do not change them.

---

## Known Issues — Do Not Reintroduce

See `SYSTEM_DESCRIPTION.md` section 9 for the full bug list (15 items). The three most likely to be accidentally reintroduced:

**UTC date bug** — `toISOString().split('T')[0]` gives the wrong date in UTC+5. Already present in `cook/page.tsx`, `manager/page.tsx`, `checkin/page.tsx`. Use `localDateStr()` on any new code.

**Double checkout insert** — There is no idempotency guard on the checkout action. Clicking "Check Out" twice inserts two rows into `camp_finances`. The planned fix is a DB-level unique constraint on `camp_finances(booking_id, type, category)` — see `docs/B-database-schema.md`. Do not add a second checkout trigger without this guard in place.

**Single-manager assumption** — Several places query `profiles` with `.eq('role', 'Manager').single()`. If there are 2+ managers this throws a runtime error. Do not copy this pattern. Use `.eq('role', 'Manager').limit(1).maybeSingle()` or fetch all and pick the first.

---

## Key File Map

| Path | Purpose |
|---|---|
| `src/app/layout.tsx` | Root layout; `export const dynamic = 'force-dynamic'` lives here |
| `src/proxy.ts` | Auth middleware — redirects unauthenticated requests to `/login` |
| `src/lib/auth-context.tsx` | Global auth state; exports `useAuth()` |
| `src/lib/language-context.tsx` | i18n; exports `t()` translation function |
| `src/utils/supabase/server.ts` | Server-side Supabase client (uses `cookies()`) |
| `src/utils/supabase/client.ts` | Browser-side Supabase client |
| `src/components/occupancy-calendar.tsx` | Main calendar UI — 73KB, do not grow |
| `src/components/reserver-income-form.tsx` | Booking creation modal — 39KB, do not grow |
| `src/app/api/users/` | Privileged user management API; requires `SUPABASE_SERVICE_ROLE_KEY` |
| `SYSTEM_DESCRIPTION.md` | Authoritative feature/bug reference — read this first |
| `docs/` | Architecture docs, schema, tech debt, test plan |

---

## Stub Features — Do Not Build Into Without a Spec

Two route directories exist but contain no working code:

- `src/app/messages/` — Messages feature. Not started.
- `src/app/observer/` — Observer role portal. Not started.

The **Cook grocery list** (`/cook` → Grocery tab) renders a UI but `handleSendToManager()` only calls `console.log()`. It does not save to the database and shows a fake success message. The backend spec is in `docs/G-cook-grocery-backend.md`.

---

## Docs Index

| File | Contents |
|---|---|
| `SYSTEM_DESCRIPTION.md` | Full feature map, data model, known bugs, working/broken matrix |
| `PROJECT_ARCHITECTURE.md` | Auth flow, SSR cookie engine, proxy/middleware, financial logic, kitchen logic |
| `docs/A-feature-brief.md` | Feature overview |
| `docs/B-database-schema.md` | Normalized schema proposal + migration SQL + rollback plan |
| `docs/C-risk-register.md` | Operational risks |
| `docs/D-test-plan.md` | Manual and automated test plan |
| `docs/E-migration-plan.md` | Data migration plan |
| `docs/F-tech-debt-summary.md` | Prioritized debt list with effort estimates and business impact |
| `docs/G-cook-grocery-backend.md` | Grocery feature backend spec |
| `docs/H-calendar-ux-spec.md` | Calendar UX spec |
| `docs/I-compliance-audit.md` | Compliance notes |
| `docs/J-prd-scalable.md` | Scalability PRD |
