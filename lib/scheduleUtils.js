/**
 * lib/scheduleUtils.js
 *
 * Single source of truth for "how many providers cover a given slot."
 *
 * Coverage = UNION of:
 *   1. provider_shifts              — one-time sign-ups
 *   2. provider_recurring_schedule  — standing recurring slots
 *
 * A provider in both for the same date+shift counts as ONE (Set dedup).
 */

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

/**
 * Returns true if a recurring schedule row applies to a specific date string (YYYY-MM-DD).
 * Checks: day_of_week, week_pattern (every / odd 1st&3rd / even 2nd&4th), start_date, end_date.
 */
export function recurringAppliesToDate(recurring, dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  if (DAY_NAMES[d.getDay()] !== recurring.day_of_week) return false
  if (recurring.start_date && dateStr < recurring.start_date) return false
  if (recurring.end_date   && dateStr > recurring.end_date)   return false
  if (!recurring.week_pattern || recurring.week_pattern === 'every') return true
  const weekOfMonth = Math.ceil(d.getDate() / 7)
  if (recurring.week_pattern === 'odd')  return weekOfMonth === 1 || weekOfMonth === 3
  if (recurring.week_pattern === 'even') return weekOfMonth === 2 || weekOfMonth === 4
  return false
}

/**
 * Returns a Set<provider_id> of everyone covering dateStr + shiftTime,
 * combining one-time shifts and recurring schedules, minus any callouts.
 *
 * @param {string} dateStr       'YYYY-MM-DD'
 * @param {string} shiftTime     '10-2' | '2-6'
 * @param {Array}  oneTimeShifts rows from provider_shifts         { provider_id, shift_date, shift_time }
 * @param {Array}  recurringRows rows from provider_recurring_schedule { provider_id, day_of_week, shift_time, week_pattern, start_date, end_date }
 * @param {Array}  calloutsRows  rows from provider_callouts        { provider_id, shift_date, shift_time }  (default [])
 * @returns {Set<string>}
 */
export function getEffectiveProviderIds(dateStr, shiftTime, oneTimeShifts, recurringRows, calloutsRows = []) {
  const calledOut = new Set(
    calloutsRows
      .filter(c => c.shift_date === dateStr && c.shift_time === shiftTime)
      .map(c => c.provider_id)
  )
  const ids = new Set()
  for (const s of oneTimeShifts) {
    if (s.shift_date === dateStr && s.shift_time === shiftTime && !calledOut.has(s.provider_id)) ids.add(s.provider_id)
  }
  for (const r of recurringRows) {
    if (r.shift_time === shiftTime && recurringAppliesToDate(r, dateStr) && !calledOut.has(r.provider_id)) ids.add(r.provider_id)
  }
  return ids
}

/**
 * Like getEffectiveProviderIds but returns rich objects for display (tooltips, etc).
 * Expects rows with a nested `profiles` join: { profiles: { full_name } }.
 * Provider in both sources → onetime takes precedence for source label.
 * Called-out providers are excluded entirely.
 *
 * @param {Array}  calloutsRows  rows from provider_callouts { provider_id, shift_date, shift_time } (default [])
 * @returns {Array<{ id: string, full_name: string, source: 'onetime'|'recurring' }>}
 */
export function getEffectiveProviders(dateStr, shiftTime, oneTimeShifts, recurringRows, calloutsRows = []) {
  const calledOut = new Set(
    calloutsRows
      .filter(c => c.shift_date === dateStr && c.shift_time === shiftTime)
      .map(c => c.provider_id)
  )
  const map = new Map()
  for (const s of oneTimeShifts) {
    if (s.shift_date === dateStr && s.shift_time === shiftTime && !calledOut.has(s.provider_id)) {
      map.set(s.provider_id, { id: s.provider_id, full_name: s.profiles?.full_name || '?', source: 'onetime' })
    }
  }
  for (const r of recurringRows) {
    if (r.shift_time === shiftTime && recurringAppliesToDate(r, dateStr) && !calledOut.has(r.provider_id) && !map.has(r.provider_id)) {
      map.set(r.provider_id, { id: r.provider_id, full_name: r.profiles?.full_name || '?', source: 'recurring' })
    }
  }
  return Array.from(map.values())
}

/**
 * Returns the provider_shifts row id for a specific provider on a specific date+shift,
 * or null if they have no one-time shift entry.
 * Used by the admin UI to know which row to delete when removing a one-time assignment.
 */
export function getOneTimeShiftId(dateStr, shiftTime, oneTimeShifts, providerId) {
  const row = oneTimeShifts.find(
    s => s.shift_date === dateStr && s.shift_time === shiftTime && s.provider_id === providerId
  )
  return row?.id ?? null
}