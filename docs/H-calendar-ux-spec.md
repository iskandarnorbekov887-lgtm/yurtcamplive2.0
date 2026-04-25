# H — OccupancyCalendar UI/UX Specification
**Author role:** Product Designer  
**Date:** April 25, 2026  
**Component:** `OccupancyCalendar` in `src/components/occupancy-calendar.tsx`

---

## Style Guide

### Color Tokens — Booking Status

| Status | Background | Text | Usage |
|---|---|---|---|
| `upcoming` | `#F59E0B` amber-400 | `#78350F` amber-900 | Confirmed, check-in in future |
| `checked-in` | `#10B981` emerald-500 | `#064E3B` emerald-900 | Guest currently on-site |
| `checked-out` | `#3B82F6` blue-500 | `#1E3A5F` blue-900 | Completed stay |
| `neglected-checkin` | `#EF4444` red-500 | `#7F1D1D` red-900 | Check-in day passed, guest not checked in |
| `overdue-checkin` | `#F59E0B` amber-400 | `#78350F` amber-900 | Same as upcoming (past check-in date) |
| `cancelled` | `#EF4444` red-500 | `#7F1D1D` red-900 | Cancelled |
| `no-arrival` | `#9CA3AF` gray-400 | `#374151` gray-700 | No-show confirmed |

### Color Tokens — Calendar Grid

| Element | Color |
|---|---|
| Current day cell | `bg-indigo-50` border `border-indigo-200` |
| Other month days | `text-slate-300` |
| Weekday headers | `text-slate-500 font-semibold` |
| Selected day highlight | `bg-indigo-100` ring `ring-indigo-300` |
| Occupancy count badge | `bg-slate-100 text-slate-600` |

### Typography

| Element | Style |
|---|---|
| Month/Year header | `text-xl font-bold text-slate-800` |
| Weekday header | `text-xs font-semibold text-slate-500 uppercase tracking-wider` |
| Day number | `text-sm font-bold` (current day: `text-indigo-600`) |
| Booking bar label | `text-xs font-semibold` truncated with ellipsis |
| Booking detail guest name | `text-2xl font-black text-slate-900` |
| Section labels | `text-[9px] font-black uppercase tracking-widest text-slate-400` |

### Spacing

| Element | Value |
|---|---|
| Calendar outer padding | `px-6 py-4` |
| Day cell height | `min-h-[80px]` |
| Booking bar height | `22px` |
| Gap between booking lanes | `2px` |
| Detail panel padding | `p-6` |
| Detail panel max-width | `480px` |

---

## State Flows

### Calendar Grid States

```
INITIAL
  └─ Loading spinner (data fetch in progress)
  └─ Calendar rendered with current month

IDLE (default)
  ├─ Hover day cell → show "+" icon (Reserver/Manager/CEO only)
  ├─ Click day with bookings → day summary popup (list of guests)
  ├─ Click empty day → open booking form (if onAddNewBooking provided)
  └─ Click booking bar → open booking detail panel

BOOKING BAR STATES
  ├─ Default → colored bar with truncated guest name
  ├─ Hover → slight opacity increase, cursor: pointer
  ├─ Cancelled booking → strikethrough text, reduced opacity (0.6)
  └─ Neglected check-in → animated pulse ring around bar

BOOKING DETAIL PANEL
  ├─ View mode (default)
  │   ├─ Header: guest name, dates, people/nights summary
  │   ├─ Itinerary: day-by-day services
  │   ├─ Actions: Check In / Check Out / Cancel / No Arrival (role-dependent)
  │   └─ Close: × button or click outside panel
  ├─ Edit mode (Manager/CEO/Reserver)
  │   ├─ Editable fields: check-in, check-out, guest count, yurt requests
  │   ├─ Save / Cancel buttons
  │   └─ Saving state: spinner on Save button, fields disabled
  └─ Loading action state
      ├─ Check-in loading: spinner on button, other buttons disabled
      └─ Check-out loading: spinner on button, other buttons disabled
```

### Mini Check-out Calendar States (in ReserverIncomeForm)

```
EMPTY (no check-in set, manual mode)
  └─ Label: "Check-in & Check-out · tap a date to start"
  └─ All dates clickable (no grey-out before check-in)

CHECK-IN SET (manual mode)
  └─ Check-in date: bg-emerald-500 (green)
  └─ Dates before check-in: still clickable (resets to new check-in)
  └─ Dates after check-in: set as check-out on click

CHECK-IN SET (from calendar click — locked)
  └─ Check-in date: bg-emerald-500 (locked, cursor-default)
  └─ Dates before check-in: text-slate-200 cursor-not-allowed
  └─ Dates after check-in: set as check-out on click

RANGE SELECTED
  └─ Check-in: bg-emerald-500
  └─ Check-out: bg-emerald-600
  └─ Between: bg-emerald-100 text-emerald-700
  └─ Nights badge: "Xn" pill in emerald

RESET (double-click on check-in or check-out)
  └─ Returns to EMPTY state (manual) or CHECK-IN SET locked (calendar mode)
```

---

## Error States

| Scenario | Display |
|---|---|
| Data fetch fails on load | Full-page error: "Failed to load bookings. Try refreshing." with Retry button |
| Check-in fails | Red toast: "Failed to check in. Please try again." Status unchanged. |
| Check-out fails | Red toast: "Failed to check out. Please try again." Status unchanged. Finance record NOT created. |
| Save/update fails | Red toast: "Failed to save changes." Edit mode remains open. |
| Cancel fails | Red toast: "Failed to cancel booking." Status unchanged. |
| Booking form submit fails | Inline error message below submit button. Form data preserved. |
| Duplicate booking | Yellow warning banner above submit button with guest name + overlapping date. "Proceed anyway" button available. |
| iCal fetch fails | Blue info banner: "Could not load iCal events. Internal bookings shown." |

---

## Keyboard Interactions

| Key | Context | Action |
|---|---|---|
| `Escape` | Booking detail panel open | Close panel |
| `Escape` | Booking form modal open | Close modal (with unsaved data warning) |
| `Tab` | Booking form | Move focus between inputs in order |
| `Enter` | Booking bar focused | Open detail panel |
| `ArrowLeft` / `ArrowRight` | Calendar header | Previous / next month |
| `ArrowLeft` / `ArrowRight` | Mini calendar in form | Previous / next day in calendar (planned) |
| `Space` | Check-in / Check-out / Cancel button focused | Trigger action |

---

## Accessibility Notes

### Current Issues
- Booking bars are `div` elements styled as buttons but lack `role="button"` and `tabIndex`.
- Calendar day cells have no `aria-label` (e.g., "April 24, 2026 — 2 bookings").
- Color is the only indicator for booking status — fails WCAG 1.4.1 (use of color).
- Modal (booking form) does not trap focus.
- Confirmation dialogs use `window.confirm()` — not accessible to screen readers.

### Required Fixes
1. Add `role="button" tabIndex={0}` to all clickable booking bars.
2. Add `aria-label` to each day cell: `aria-label="April 24 — 2 bookings"`.
3. Add status text alongside colored bar (e.g., "✓ Checked In" text inside bar for screen readers with `sr-only` class for visual users).
4. Replace `window.confirm()` with a custom modal dialog with `role="dialog"` and focus trapping.
5. Add `aria-live="polite"` region for action results (check-in/out success or error messages).

### WCAG 2.1 AA Targets
- Contrast ratio: all status colors must achieve 4.5:1 against their backgrounds. Current amber (#F59E0B on white) is borderline — verify.
- Focus indicators: visible on all interactive elements. Add `focus:ring-2 focus:ring-indigo-500` to all buttons.
- Touch targets: all interactive elements minimum 44×44px on mobile.

---

## Booking Status Tooltip Spec

Each booking bar should show a tooltip on hover with:

```
[Guest Name]
Check-in: April 24  |  Check-out: April 26
Status: Checked In
People: 4  |  Nights: 2
[Yurt name or "No yurt assigned"]
```

**Implementation:**
```tsx
<div
  title={`${b.guest_name}\nCheck-in: ${b.check_in} → Check-out: ${b.check_out}\nStatus: ${b.status}\nPeople: ${b.guest_count}`}
  role="button"
  tabIndex={0}
  aria-label={`Booking for ${b.guest_name}, ${b.check_in} to ${b.check_out}`}
>
  {/* bar content */}
</div>
```

For a richer tooltip: use a `Tooltip` component (e.g., Radix UI `@radix-ui/react-tooltip`) triggered on focus and hover.

---

## Responsive Behavior

| Breakpoint | Calendar Behavior |
|---|---|
| `< 640px` (mobile) | Single column day list instead of month grid. Booking bars become full-width rows. |
| `640px–1024px` (tablet) | Month grid with reduced lane height. Booking bars show first name only. |
| `> 1024px` (desktop) | Full month grid. Booking bars show full guest name + status icon. |

**Current state:** The calendar is desktop-only. It does not respond to small screens. This is acceptable for an internal staff tool used primarily on desktops at camp, but should be noted if Cook or Manager access from a phone.

---

## Status-to-Icon Mapping

| Status | Icon (SVG inline) | Position |
|---|---|---|
| `checked-in` | Checkmark ✓ | Left of name on bar |
| `checked-out` | Double check ✓✓ | Left of name on bar |
| `neglected-checkin` | Warning triangle ⚠ | Left of name, animated pulse |
| `no-arrival` | X mark ✗ | Left of name, grey |
| `cancelled` | X mark ✗ | Left of name |
| `upcoming` | No icon | Name only |
