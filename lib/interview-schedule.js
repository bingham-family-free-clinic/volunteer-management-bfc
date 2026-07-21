// lib/interview-schedule.js
//
// Shared, front-end-only constants + formatting helpers for the interview
// self-scheduling feature.
//
// KEEP THESE CONSTANTS IN SYNC with supabase/functions/schedule-interview/index.ts
// — that edge function is the source of truth for what's actually bookable
// (it re-validates everything server-side). The values here are only used to
// render nice labels and group slots on the client; they never gate a
// booking decision by themselves.

export const ORG_TIMEZONE        = 'America/Denver' // ← must match index.ts
export const SLOT_MINUTES        = 30
export const DAY_START_HOUR      = 10               // 10:00 local
export const DAY_END_HOUR        = 18                // last slot must still END by 18:00
export const BOOKING_WINDOW_DAYS = 14                // applicants may only book within 2 weeks
export const MIN_LEAD_MINUTES    = 120               // no booking within 2 hours of "now"
export const BUSINESS_WEEKDAYS   = [1, 2, 3, 4, 5]    // Mon=1 ... Fri=5 (JS getDay()-style below is 0=Sun, we convert)

// ── formatting ──────────────────────────────────────────────────────────────

// "Mon, Jul 21"
export function formatSlotDayLabel(iso) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ORG_TIMEZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso))
}

// "10:30 AM"
export function formatSlotTime(iso) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ORG_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso))
}

// "Mon, Jul 21 at 10:30 AM"
export function formatSlotFull(iso) {
  if (!iso) return null
  return `${formatSlotDayLabel(iso)} at ${formatSlotTime(iso)}`
}

// Stable sortable key for grouping ISO slots by local calendar day, e.g. "2026-07-21"
export function slotDayKey(iso) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ORG_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

// Groups an array of ISO slot strings into [{ dayKey, dayLabel, slots: [iso, ...] }, ...]
// sorted chronologically, day-by-day and slot-by-slot within each day.
export function groupSlotsByDay(isoSlots) {
  const byDay = new Map()
  for (const iso of [...isoSlots].sort((a, b) => new Date(a) - new Date(b))) {
    const key = slotDayKey(iso)
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key).push(iso)
  }
  return Array.from(byDay.entries()).map(([dayKey, slots]) => ({
    dayKey,
    dayLabel: formatSlotDayLabel(slots[0]),
    slots,
  }))
}

export const TIMEZONE_LABEL = 'Mountain Time' // human-readable label for ORG_TIMEZONE, shown to applicants