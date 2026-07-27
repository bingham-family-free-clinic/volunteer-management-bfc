'use client'
import { useState, useEffect, useMemo, Fragment } from 'react'
import { SHIFTS } from '../lib/constants'

// ─── Constants ────────────────────────────────────────────────────────────────
const BUSINESS_DAYS_PER_PAGE = 10   // 2 calendar weeks of Mon–Fri per "Show more"
const MAX_PER_SLOT           = 3    // mirrors the DB capacity trigger (migration 001)

function toDateKey(d) {
  // Local calendar date as YYYY-MM-DD — `role_training_shifts.shift_date` is a
  // plain `date` column with no time component, so no timezone conversion is
  // needed here (a calendar date is a calendar date). Flagging as an open
  // assumption only in that "today" itself is computed from the browser's
  // local clock rather than `lib/timeUtils`'s Mountain-time helpers (that
  // file wasn't among the files provided for this project — see Step 2's
  // note on `lib/constants.js` for the same caveat). Worth reconciling if
  // Mountain time and the browser's local time can ever disagree for a user.
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function weekdayLabel(dateKey) {
  const d = new Date(dateKey + 'T12:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' })
}

// Generates the next `count` Mon–Fri calendar dates on or after `from`,
// skipping weekends. Mon–Fri-only is enforced here in the UI, same as the
// SlotPicker/booking form elsewhere in the app — there's no DB check
// constraint on `shift_date`'s day-of-week (flagged back in Step 1).
function nextBusinessDays(from, count) {
  const days = []
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)
  while (days.length < count) {
    const dow = cursor.getDay() // 0 = Sun, 6 = Sat
    if (dow >= 1 && dow <= 5) days.push(toDateKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

// Friendly mapping for the two ways an insert can fail here: the capacity
// trigger (raise exception, `enforce_training_shift_capacity()`) and the
// `unique (shift_date, shift_time, role)` constraint (a same-role double
// booking of one slot). Anything else falls back to the raw message, same
// as every other error toast in this codebase.
function friendlyBookingError(error) {
  const message = error?.message || ''
  if (message.toLowerCase().includes('shift slot is full')) {
    return 'That slot just filled up (max 3 trainees). Please pick another.'
  }
  if (error?.code === '23505' || message.toLowerCase().includes('duplicate key')) {
    return 'Another trainee for this role is already booked in that slot. Please pick another.'
  }
  return `Failed to book shift: ${message || 'unknown error'}`
}

// ─── Component ────────────────────────────────────────────────────────────────
// Step 7 — shared shift slot picker for `role_training_shifts`. Not wired into
// admin_page.js or volunteer_page.js yet — Step 9 does that, from both the
// admin side (booking/adjusting on a trainee's behalf) and the volunteer side
// (self-booking). Built here as a standalone, self-contained component so
// Step 9 just needs to drop it in with a `trainingTrack` + `shiftNumber`.
//
// Props:
//   supabase        — Supabase client
//   trainingTrack    — the `training_tracks` row this booking is for (needs
//                      at minimum `id` and `role`)
//   shiftNumber      — 1 or 2, which shadow shift this picker books
//   onBooked         — optional callback(newShiftRow), fired after a
//                      successful insert, so the parent can refresh/advance
export default function RoleTrainingShiftPicker({ supabase, trainingTrack, shiftNumber, onBooked }) {
  const [existingBooking, setExistingBooking] = useState(undefined) // undefined = not loaded yet, null = none
  const [loadError, setLoadError]             = useState(null)

  const [pageCount, setPageCount] = useState(BUSINESS_DAYS_PER_PAGE)
  const [occupancy, setOccupancy] = useState({})   // `${date}|${time}` -> { count, roles: Set }
  const [occLoading, setOccLoading] = useState(true)
  const [occError, setOccError]     = useState(null)

  const [selected, setSelected] = useState(null)   // { date, time }
  const [booking, setBooking]   = useState(false)
  const [toast, setToast]       = useState(null)

  const dateKeys = useMemo(() => nextBusinessDays(new Date(), pageCount), [pageCount])

  function msg(text, type = 'success') { setToast({ text, type }); setTimeout(() => setToast(null), 3500) }

  useEffect(() => { loadExistingBooking() }, [trainingTrack?.id, shiftNumber])
  useEffect(() => { if (existingBooking === null) loadOccupancy() }, [existingBooking, pageCount])

  async function loadExistingBooking() {
    if (!trainingTrack?.id) return
    setLoadError(null)
    const { data, error } = await supabase
      .from('role_training_shifts')
      .select('*')
      .eq('training_track_id', trainingTrack.id)
      .eq('shift_number', shiftNumber)
      .maybeSingle()
    if (error) { setLoadError(error.message); return }
    setExistingBooking(data || null)
  }

  async function loadOccupancy() {
    setOccLoading(true)
    setOccError(null)
    const from = dateKeys[0]
    const to   = dateKeys[dateKeys.length - 1]
    const { data, error } = await supabase
      .from('role_training_shifts')
      .select('shift_date, shift_time, role')
      .gte('shift_date', from)
      .lte('shift_date', to)
    if (error) { setOccError(error.message); setOccLoading(false); return }

    const map = {}
    ;(data || []).forEach(row => {
      const key = `${row.shift_date}|${row.shift_time}`
      if (!map[key]) map[key] = { count: 0, roles: new Set() }
      map[key].count += 1
      map[key].roles.add(row.role)
    })
    setOccupancy(map)
    setOccLoading(false)
  }

  function slotState(dateKey, time) {
    const key = `${dateKey}|${time}`
    const entry = occupancy[key]
    const count = entry?.count || 0
    const roleTaken = !!entry?.roles.has(trainingTrack.role)
    const full = count >= MAX_PER_SLOT
    return { count, full, roleTaken, disabled: full || roleTaken }
  }

  async function handleBook() {
    if (!selected || !trainingTrack?.id) return
    setBooking(true)
    const { data, error } = await supabase
      .from('role_training_shifts')
      .insert({
        training_track_id: trainingTrack.id,
        shift_number:       shiftNumber,
        shift_date:          selected.date,
        shift_time:          selected.time,
        role:                trainingTrack.role,
      })
      .select()
      .single()

    if (error) {
      msg(friendlyBookingError(error), 'error')
      setBooking(false)
      loadOccupancy() // someone else may have just filled/taken this slot — refresh counts
      return
    }

    setExistingBooking(data)
    setSelected(null)
    msg(`Shift ${shiftNumber} booked — ${weekdayLabel(selected.date)}, ${selected.time}`)
    setBooking(false)
    onBooked?.(data)
  }

  // ── Stable style objects ──────────────────────────────────────────────────
  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }
  const cellBase = { padding: '0.5rem 0.4rem', borderRadius: '8px', fontSize: '0.78rem', fontFamily: 'DM Sans, sans-serif', border: '1px solid var(--border)', cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.15rem' }

  if (loadError) {
    return (
      <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)' }}>
        <p style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: 500 }}>Failed to load: {loadError}</p>
      </div>
    )
  }

  if (existingBooking === undefined) {
    return <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Loading…</p>
  }

  // Already booked — read-only summary, no rebook/cancel UI yet (flagged as
  // an open question: rescheduling isn't in the Step 7 spec, and it's not
  // clear whether that should be a delete-and-rebook here or a dedicated
  // admin action; left out for now rather than guessing).
  if (existingBooking) {
    return (
      <div style={card}>
        <p style={{ fontWeight: 600, fontFamily: 'DM Sans, sans-serif', margin: 0 }}>Shift {shiftNumber} Booked</p>
        <p style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
          {weekdayLabel(existingBooking.shift_date)} · {existingBooking.shift_time}
        </p>
        {existingBooking.completed_at && (
          <span style={{ alignSelf: 'flex-start', fontSize: '0.72rem', padding: '0.15rem 0.6rem', borderRadius: '100px', fontWeight: 600, background: '#22c55e18', color: '#22c55e', border: '1px solid #22c55e44' }}>
            Completed
          </span>
        )}
      </div>
    )
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <p style={{ fontWeight: 600, fontFamily: 'DM Sans, sans-serif', margin: 0 }}>Book Shift {shiftNumber} — {trainingTrack?.role}</p>
        {toast && (
          <span style={{ fontSize: '0.78rem', fontWeight: 500, color: toast.type === 'error' ? '#ef4444' : '#22c55e' }}>{toast.text}</span>
        )}
      </div>

      {occError && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <p style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: 500 }}>Failed to load availability: {occError}</p>
        </div>
      )}

      {occLoading ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Loading availability…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `100px repeat(${SHIFTS.length}, 1fr)`, gap: '0.4rem', alignItems: 'center' }}>
          <div />
          {SHIFTS.map(time => (
            <div key={time} style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>{time}</div>
          ))}
          {dateKeys.map(dateKey => (
            <Fragment key={dateKey}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text)', fontFamily: 'DM Sans, sans-serif', paddingRight: '0.4rem' }}>{weekdayLabel(dateKey)}</div>
              {SHIFTS.map(time => {
                const { count, disabled, roleTaken, full } = slotState(dateKey, time)
                const active = selected?.date === dateKey && selected?.time === time
                return (
                  <button
                    key={`${dateKey}-${time}`}
                    disabled={disabled}
                    onClick={() => setSelected({ date: dateKey, time })}
                    title={roleTaken ? `${trainingTrack?.role} already has a trainee in this slot` : full ? 'Slot full' : ''}
                    style={{
                      ...cellBase,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      background: active ? 'var(--accent)18' : disabled ? 'var(--bg)' : 'var(--surface)',
                      color: active ? 'var(--accent)' : disabled ? 'var(--muted)' : 'var(--text)',
                      border: active ? '1px solid var(--accent)55' : '1px solid var(--border)',
                      opacity: disabled ? 0.55 : 1,
                    }}
                  >
                    <span style={{ fontFamily: 'DM Mono, monospace' }}>{count}/{MAX_PER_SLOT}</span>
                    {roleTaken && !full && <span style={{ fontSize: '0.68rem' }}>role taken</span>}
                  </button>
                )
              })}
            </Fragment>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <button
          onClick={() => setPageCount(c => c + BUSINESS_DAYS_PER_PAGE)}
          style={{ padding: '0.45rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
        >
          Show more dates
        </button>

        <button
          onClick={handleBook}
          disabled={!selected || booking}
          style={{
            padding: '0.6rem 1.1rem', borderRadius: '8px', border: 'none', fontWeight: 600, fontFamily: 'DM Sans, sans-serif', fontSize: '0.85rem',
            cursor: (!selected || booking) ? 'not-allowed' : 'pointer',
            background: (!selected || booking) ? 'var(--border)' : 'var(--accent)',
            color: (!selected || booking) ? 'var(--muted)' : '#fff',
          }}
        >
          {booking ? 'Booking…' : 'Book This Shift'}
        </button>
      </div>
    </div>
  )
}