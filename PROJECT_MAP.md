# Project Map — Yurt Camp

Generated: May 13, 2026

Summary
- Purpose: A concise map of the site's routes and primary UI responsibilities, plus the global Visual Identity Rules to apply to future UI refactors and component cleanups.

Global Identity Rules
- Visual Identity: High-Contrast theme. Backgrounds must be pure White (#FFFFFF). Accent palette: Forest Green and Sky Blue (use them sparingly for primary action and highlights). All borders and fine separators should be Solid Black 1px.
- Typography: Primary text and numbers must be Solid Black. Technical numbers and IDs (booking IDs, invoice numbers, timestamps) should use a Monospaced font to stand out and aid scanning.
- Structure: Preserve the existing website map and navigation — do not rewire routes or rename endpoints.
- Layout Goal: Use a Bento Grid layout for messy compound components: grid cards with 1px Black borders, ample white space between cards, clear header rows, and consistent padding.

How to use this map
- Use this file as the canonical reference for route purpose and identity constraints when making UI changes, refactors, or new components. When in doubt about styling choices, follow the Global Identity Rules above.

Routes and Purpose (derived from `app/` folder)

- `/` — Root / Home
  - Files: `app/page.tsx`, `app/layout.tsx`, `app/globals.css`
  - Purpose: Public landing / redirect logic. Entry point that applies global layout and styles.

- `/api/*` — Server endpoints
  - Files: `app/api/_supabase.ts`, `app/api/bookings/`, `calendar/`, `fix-payment-status/`, `meal-requests/`, `meals/`, `payments/`, `pricing/`, `users/`
  - Purpose: Backend API routes for Supabase proxy, booking CRUD, calendar data, payment fixes, meal requests and pricing; not rendered pages but used by the frontend.

- `/auth/callback`
  - Files: `app/auth/callback/`
  - Purpose: Authentication callback handler (OAuth / Supabase auth flow). Non-visual redirect/handling endpoint.

- `/bookings`
  - Files: `app/bookings/page.tsx`
  - Purpose: Booking list / management for staff or managers. Likely shows booking cards, statuses, and actions (check-in, modify, cancel).

- `/ceo`
  - Files: `app/ceo/layout.tsx`, `app/ceo/page.tsx`
  - Purpose: CEO dashboard — high-level metrics and controls for operations, financial overviews, and executive views.

- `/ceo-financials` and nested routes
  - Files: `app/ceo-financials/page.tsx`, `app/ceo-financials/booking/`, `deleted-records/`, `detail/`, `pricing/`
  - Purpose: Detailed financial dashboards and booking financial detail views for executive accounting and auditing. Includes tools for deleted records and pricing adjustments.

- `/checkin`
  - Files: `app/checkin/page.tsx`
  - Purpose: Check-in flow for guests/staff to mark arrivals, assign beds, or confirm payments.

- `/cook` and cook utilities
  - Files: `app/cook/page.tsx`, `app/cook/run_migration_refactor.js`
  - Purpose: Cook interface — kitchen operations, meal preparation scheduler, procurement signals. The presence of migration/refactor scripts indicates backend/DB tasks related to cook workflows.

- `/financials` and nested
  - Files: `app/financials/page.tsx`, `app/financials/detail/`
  - Purpose: Finance dashboard for managers (income, expenses, transaction detail, receipts).

- `/login`
  - Files: `app/login/page.tsx`
  - Purpose: Login page for staff and admins (authentication entry).

- `/manager` (multiple manager views)
  - Files: `app/manager/...` (truncated in listing)
  - Purpose: Manager dashboards and tools (shift management, occupancy, staff controls). Expect multiple nested routes for manager-specific tasks.

- `/messages`
  - Files: `app/messages/`
  - Purpose: Messaging center for staff/guests — internal communications, notifications, and threaded messages.

- `/observer`
  - Files: `app/observer/`
  - Purpose: Read-only views for observers or auditors; summary dashboards and monitoring pages.

- `/unauthorized`
  - Files: `app/unauthorized/`
  - Purpose: Access denied / permission error page.

Components and Key UI Pieces (from `src/components`)
- `BookingModal.tsx` — Modal for booking details and edits. Candidate for Bento Card display.
- `google-guest-agenda.tsx` — Guest agenda integration; likely a compact calendar view for guests.
- `language-switcher.tsx` — UI for switching language/localization.
- `manager-income-form.tsx` — Form for manager-entered income records.
- `occupancy-calendar.tsx`, `private-calendar-view.tsx` — Calendar visualizations; should be high-contrast and use monospaced numbers for dates/IDs where shown.
- `signature-pad.tsx` — Digital signature capture. Keep background white and border 1px black.

Notable libraries / helpers
- `src/lib/supabase.ts` and `app/api/_supabase.ts` — Supabase client and proxy logic.
- `utils/calendar-logic.ts` — Calendar calculations used across calendar components.

UI Cleanup Guidance (actionable)
- Use the Bento Grid as the default layout for compound views (dashboards, manager lists, financial rows):
  - Card style: white background, 1px solid Black border, 16px inner padding, consistent header row with bold Solid Black text.
  - Spacing: at least 16px gutter between cards; ensure airy whitespace.
  - Typography: Primary headings and body text in Solid Black; numeric fields and IDs in Monospaced font.
- Accessibility: Ensure high-contrast ratios for all text and interactive controls given the chosen palette.
- Small components (modals, microcards): preserve existing structure but restyle to match border/palette rules.

Saved As
- This file: `PROJECT_MAP.md`

Next steps (recommended)
- Use this map to guide a UI pass: refactor `occupancy-calendar.tsx`, `BookingModal.tsx`, and manager pages into Bento Grid cards.
- Run automated accessibility and contrast checks after applying styles.

"Do not change navigation or route names" — keep routes stable; apply only visual and layout updates.

File Links (workspace-relative)
- [src/app/page.tsx](src/app/page.tsx#L1)
- [src/app/layout.tsx](src/app/layout.tsx#L1)
- [src/app/globals.css](src/app/globals.css#L1)
- [src/app/bookings/page.tsx](src/app/bookings/page.tsx#L1)
- [src/app/unauthorized/page.tsx](src/app/unauthorized/page.tsx#L1)
- [src/app/auth/callback/route.ts](src/app/auth/callback/route.ts#L1)
- [src/app/api/_supabase.ts](src/app/api/_supabase.ts#L1)
- [src/app/api/bookings/route.ts](src/app/api/bookings/route.ts#L1)
- [src/app/api/bookings/[id]/route.ts](src/app/api/bookings/[id]/route.ts#L1)
- [src/app/api/bookings/finalize/route.ts](src/app/api/bookings/finalize/route.ts#L1)
- [src/app/api/bookings/calculate/route.ts](src/app/api/bookings/calculate/route.ts#L1)
- [src/app/api/meal-requests/route.ts](src/app/api/meal-requests/route.ts#L1)
- [src/app/api/meal-requests/[id]/route.ts](src/app/api/meal-requests/[id]/route.ts#L1)
- [src/app/api/calendar/events/route.ts](src/app/api/calendar/events/route.ts#L1)
- [src/app/api/calendar/update-event/route.ts](src/app/api/calendar/update-event/route.ts#L1)
- [src/app/api/pricing/route.ts](src/app/api/pricing/route.ts#L1)
- [src/app/api/users/route.ts](src/app/api/users/route.ts#L1)
- [src/app/login/page.tsx](src/app/login/page.tsx#L1)
- [src/app/manager/page.tsx](src/app/manager/page.tsx#L1)
- [src/app/financials/page.tsx](src/app/financials/page.tsx#L1)
- [src/app/financials/detail/[id]/page.tsx](src/app/financials/detail/[id]/page.tsx#L1)
- [src/app/ceo/layout.tsx](src/app/ceo/layout.tsx#L1)
- [src/app/ceo/page.tsx](src/app/ceo/page.tsx#L1)
- [src/app/cook/page.tsx](src/app/cook/page.tsx#L1)
- [src/app/cook/run_migration_refactor.js](src/app/cook/run_migration_refactor.js#L1)
- [src/app/checkin/page.tsx](src/app/checkin/page.tsx#L1)
- [src/app/ceo-financials/page.tsx](src/app/ceo-financials/page.tsx#L1)
- [src/app/ceo-financials/pricing/page.tsx](src/app/ceo-financials/pricing/page.tsx#L1)
- [src/app/ceo-financials/deleted-records/page.tsx](src/app/ceo-financials/deleted-records/page.tsx#L1)
- [src/app/ceo-financials/detail/[id]/page.tsx](src/app/ceo-financials/detail/[id]/page.tsx#L1)
- [src/app/ceo-financials/booking/[id]/page.tsx](src/app/ceo-financials/booking/[id]/page.tsx#L1)

Component Usage (selected)
- `/bookings` — components imported/used:
  - LanguageSwitcher: [src/app/bookings/page.tsx](src/app/bookings/page.tsx#L8)
  - OccupancyCalendar: [src/app/bookings/page.tsx](src/app/bookings/page.tsx#L9)
  - ManagerIncomeForm: [src/app/bookings/page.tsx](src/app/bookings/page.tsx#L10)

- `/ceo` — components imported/used:
  - LanguageSwitcher: [src/app/ceo/page.tsx](src/app/ceo/page.tsx#L8)
  - GoogleGuestAgenda: [src/app/ceo/page.tsx](src/app/ceo/page.tsx#L9)
  - ManagerIncomeForm: [src/app/ceo/page.tsx](src/app/ceo/page.tsx#L10)
  - Add-booking modal controls: [src/app/ceo/page.tsx](src/app/ceo/page.tsx#L43), [src/app/ceo/page.tsx](src/app/ceo/page.tsx#L817)

- `/ceo-financials` — components imported/used:
  - LanguageSwitcher: [src/app/ceo-financials/page.tsx](src/app/ceo-financials/page.tsx#L10)

- `/cook` — components imported/used:
  - LanguageSwitcher: [src/app/cook/page.tsx](src/app/cook/page.tsx#L8)
  - PrivateCalendarView: [src/app/cook/page.tsx](src/app/cook/page.tsx#L9)

- `/checkin` — components imported/used:
  - LanguageSwitcher: [src/app/checkin/page.tsx](src/app/checkin/page.tsx#L8)
  - OccupancyCalendar: [src/app/checkin/page.tsx](src/app/checkin/page.tsx#L9)

- `app/layout` (global) — components imported/used:
  - LanguageSwitcher: [src/app/layout.tsx](src/app/layout.tsx#L8)

- `/login` — components imported/used:
  - LanguageSwitcher: [src/app/login/page.tsx](src/app/login/page.tsx#L11)

- `/manager` — components imported/used:
  - LanguageSwitcher: [src/app/manager/page.tsx](src/app/manager/page.tsx#L8)
  - GoogleGuestAgenda: [src/app/manager/page.tsx](src/app/manager/page.tsx#L9)

Notes
- This is a focused mapping for the key UI components identified earlier. I can continue a deeper scan (e.g., find `BookingModal`, `signature-pad`, or any other component usages) and expand the map to cover all components and exact render locations.

Full Component Usage (expanded)
- `LanguageSwitcher`
  - Component: [src/components/language-switcher.tsx](src/components/language-switcher.tsx#L1)
  - Used in: [src/app/layout.tsx](src/app/layout.tsx#L8), [src/app/bookings/page.tsx](src/app/bookings/page.tsx#L8), [src/app/ceo/page.tsx](src/app/ceo/page.tsx#L8), [src/app/ceo-financials/page.tsx](src/app/ceo-financials/page.tsx#L10), [src/app/cook/page.tsx](src/app/cook/page.tsx#L8), [src/app/checkin/page.tsx](src/app/checkin/page.tsx#L8), [src/app/login/page.tsx](src/app/login/page.tsx#L11), [src/app/manager/page.tsx](src/app/manager/page.tsx#L8)

- `GoogleGuestAgenda`
  - Component: [src/components/google-guest-agenda.tsx](src/components/google-guest-agenda.tsx#L1)
  - Uses: `PrivateCalendarView` and `BookingModal` internally ([src/components/google-guest-agenda.tsx](src/components/google-guest-agenda.tsx#L6), [src/components/google-guest-agenda.tsx](src/components/google-guest-agenda.tsx#L7))
  - Rendered in routes: [src/app/ceo/page.tsx](src/app/ceo/page.tsx#L9), [src/app/manager/page.tsx](src/app/manager/page.tsx#L9)

- `BookingModal`
  - Component: [src/components/BookingModal.tsx](src/components/BookingModal.tsx#L125)
  - Used by: [src/components/google-guest-agenda.tsx](src/components/google-guest-agenda.tsx#L1345)
  - Modal controls/state referenced in: [src/app/ceo/page.tsx](src/app/ceo/page.tsx#L43), [src/app/ceo/page.tsx](src/app/ceo/page.tsx#L550), [src/app/ceo/page.tsx](src/app/ceo/page.tsx#L817)

- `OccupancyCalendar`
  - Component: [src/components/occupancy-calendar.tsx](src/components/occupancy-calendar.tsx#L1)
  - Uses `SignaturePad`: [src/components/occupancy-calendar.tsx](src/components/occupancy-calendar.tsx#L6)
  - Used in routes: [src/app/bookings/page.tsx](src/app/bookings/page.tsx#L9), [src/app/checkin/page.tsx](src/app/checkin/page.tsx#L9)

- `PrivateCalendarView`
  - Component: [src/components/private-calendar-view.tsx](src/components/private-calendar-view.tsx#L1)
  - Used in: [src/app/cook/page.tsx](src/app/cook/page.tsx#L9), and imported by [src/components/google-guest-agenda.tsx](src/components/google-guest-agenda.tsx#L6)

- `SignaturePad`
  - Component: [src/components/signature-pad.tsx](src/components/signature-pad.tsx#L1)
  - Imported in: [src/components/occupancy-calendar.tsx](src/components/occupancy-calendar.tsx#L6)

- `ManagerIncomeForm`
  - Component: [src/components/manager-income-form.tsx](src/components/manager-income-form.tsx#L1)
  - Used in: [src/app/bookings/page.tsx](src/app/bookings/page.tsx#L10), [src/app/ceo/page.tsx](src/app/ceo/page.tsx#L10), [src/app/manager/page.tsx](src/app/manager/page.tsx#L10)

- `ProtectedRoute`
  - Component: [src/components/protected-route.tsx](src/components/protected-route.tsx#L1)
  - Used in: [src/app/ceo/page.tsx](src/app/ceo/page.tsx#L4), [src/app/manager/page.tsx](src/app/manager/page.tsx#L4)

- Procurement components (selected)
  - `ProcurementForm`: [src/components/procurement/ProcurementForm.tsx](src/components/procurement/ProcurementForm.tsx#L1)
  - `ManagerProcurement`: [src/components/procurement/manager-procurement.tsx](src/components/procurement/manager-procurement.tsx#L1) — imported in [src/app/manager/page.tsx](src/app/manager/page.tsx#L12)
  - Other procurement helpers: `product-search`, `procurement-status`, `inventory-dashboard`, `cook-usage`, `cook-procurement` (see [src/components/procurement/](src/components/procurement/))

- Manager area microcomponents
  - `ManagerNotifications`: [src/components/manager/manager-notifications.tsx](src/components/manager/manager-notifications.tsx#L1) — imported in [src/app/manager/page.tsx](src/app/manager/page.tsx#L11)
  - `ManagerMealRequests`: [src/components/manager/manager-meal-requests.tsx](src/components/manager/manager-meal-requests.tsx#L1) — imported in [src/app/ceo/page.tsx](src/app/ceo/page.tsx#L11)
  - `ManagerGrocery`: [src/components/manager/manager-grocery.tsx](src/components/manager/manager-grocery.tsx#L1)

If you want, I can now:
- Expand this section to include every component import location across the repo (full coverage), or
- Generate a CSV/JSON manifest of components → usage locations for tooling and automated refactors.
