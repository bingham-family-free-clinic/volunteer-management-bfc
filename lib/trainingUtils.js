// ── Weekly Training: shared date helpers ─────────────────────────────────────
// Used by both the admin editor (WeeklyTraining) and the volunteer-facing
// viewer (WeeklyTrainingBanner) so they always agree on how a "week" is keyed.
//
// A training week is always identified by the ISO date (YYYY-MM-DD) of its
// Monday. Unlike the biannual survey, this recurs every single week — there's
// no month gating.

function pad(n) {
  return String(n).padStart(2, '0')
}

export function getMonday(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0 = Sun, 1 = Mon …
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

export function toWeekKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function currentTrainingWeekStart() {
  return toWeekKey(getMonday(new Date()))
}

export function nextTrainingWeekStart() {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return toWeekKey(getMonday(d))
}

// "Monday, June 22 – Friday, June 26" style label for a given week key
export function formatWeekRange(weekKey) {
  const [y, m, d] = weekKey.split('-').map(Number)
  const monday = new Date(y, m - 1, d)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)
  const fmt = (dt, withWeekday) =>
    dt.toLocaleDateString('en-US', withWeekday
      ? { weekday: 'long', month: 'long', day: 'numeric' }
      : { month: 'long', day: 'numeric' })
  return `${fmt(monday, true)} – ${fmt(friday, false)}`
}

// Short "Jun 22 – Jun 26" label, used in compact admin UI
export function formatWeekRangeShort(weekKey) {
  const [y, m, d] = weekKey.split('-').map(Number)
  const monday = new Date(y, m - 1, d)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)
  const fmt = (dt) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(monday)} – ${fmt(friday)}`
}

// ── Role-specific training categories ─────────────────────────────────────
// Matches the "Specific Role Trainings" table from the training template.
export const TRAINING_ROLES = [
  'Administrative Assistant',
  'Clinical Staff',
  'Clinical Supervisor',
  'Communications',
  'Credentialing',
  'Float',
  'Human Resources',
  'Information Systems',
  'Lab',
  'Mental Health',
  'Office Assistant',
  'Office Manager',
  'OSSM',
  'Patient Nav.',
  'Pharmacy',
  'Physical Wellness',
  'Receptionist',
  'Scribe',
  'Support Center',
]

export const NO_ROLE_TRAINING_TEXT = 'No specific weekly training for this role.'