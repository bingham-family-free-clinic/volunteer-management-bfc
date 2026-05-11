'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { SHIFTS } from '../../lib/constants'


export const dynamic = 'force-dynamic'

const DAYS        = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
const DAY_LABEL   = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri' }
const DAY_FULL    = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday' }
const WEEK_PATTERNS = [
  { value: 'every', label: 'Every week' },
  { value: 'odd',   label: '1st & 3rd' },
  { value: 'even',  label: '2nd & 4th' },
]

// ── Shared style tokens (match existing app) ──────────────────────────────────
const S = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '1.5rem',
  },
  input: {
    width: '100%',
    padding: '0.75rem 1rem',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text)',
    fontSize: '0.95rem',
    outline: 'none',
    fontFamily: 'DM Sans, sans-serif',
  },
  label: {
    display: 'block',
    fontSize: '0.8rem',
    color: 'var(--muted)',
    marginBottom: '0.4rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getMountainDateStr(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
}

function formatShiftDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit' })
}

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', year: 'numeric' })
}

function calcHours(clock_in, clock_out) {
  if (!clock_out) return null
  return ((new Date(clock_out) - new Date(clock_in)) / 3600000).toFixed(1)
}

// Generate all weekdays (Mon–Fri) from today out to ~10 weeks
function generateUpcomingWeekdays(weeks = 10) {
  const days = []
  const today = getMountainDateStr()
  const d = new Date(today + 'T12:00:00')
  for (let i = 0; i < weeks * 7; i++) {
    const dayIndex = d.getDay()
    if (dayIndex >= 1 && dayIndex <= 5) {
      const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
      days.push({
        date: d.toLocaleDateString('en-CA'),
        day:  dayNames[dayIndex],
      })
    }
    d.setDate(d.getDate() + 1)
  }
  return days
}

// ── Sub-components ────────────────────────────────────────────────────────────
function TabButton({ id, label, active, onClick }) {
  return (
    <button
      onClick={() => onClick(id)}
      style={{
        padding: '0.5rem 1rem',
        borderRadius: '8px',
        fontSize: '0.875rem',
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'DM Sans, sans-serif',
        background: active ? 'var(--accent)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--muted)',
        border: active ? 'none' : '1px solid var(--border)',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )
}

function SlotPip({ count, max = 3 }) {
  return (
    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: i < count ? 'var(--accent)' : 'var(--border)',
            transition: 'background 0.2s',
          }}
        />
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProviderPage() {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState('home')
  const [toast, setToast]     = useState(null)

  // ── Home tab ──────────────────────────────────────────────────────────────
  // My signed-up shifts in the next ~2 months
  const [myUpcomingShifts, setMyUpcomingShifts]     = useState([])
  const [callingOutId, setCallingOutId]             = useState(null)
  const [calloutReasonMap, setCalloutReasonMap]     = useState({}) // shiftId → reason string
  const [confirmCalloutId, setConfirmCalloutId]     = useState(null) // which shift is showing callout confirm

  // ── Schedule tab ─────────────────────────────────────────────────────────
  const [slotCounts, setSlotCounts]                 = useState({}) // "date|shift" → count
  const [mySlots, setMySlots]                       = useState(new Set()) // "date|shift"
  const [signingUp, setSigningUp]                   = useState(null) // "date|shift" key
  const [removingSlot, setRemovingSlot]             = useState(null)
  const [scheduleWeekOffset, setScheduleWeekOffset] = useState(0) // which week to show

  // Recurring schedule
  const [myRecurring, setMyRecurring]               = useState([])
  const [addingRecurring, setAddingRecurring]       = useState(false)
  const [recurringForm, setRecurringForm]           = useState({
    day_of_week: 'monday',
    shift_time: '10-2',
    week_pattern: 'every',
    start_date: '',
    end_date: '',
  })
  const [savingRecurring, setSavingRecurring]       = useState(false)
  const [removingRecurringId, setRemovingRecurringId] = useState(null)

  // ── Account tab ───────────────────────────────────────────────────────────
  const [newPassword, setNewPassword]               = useState('')
  const [confirmPassword, setConfirmPassword]       = useState('')
  const [changingPassword, setChangingPassword]     = useState(false)
  const [showShowNew, setShowShowNew]               = useState(false)
  const [showShowConfirm, setShowShowConfirm]       = useState(false)
  const [pastShifts, setPastShifts]                 = useState([])
  const [pastShiftsOpen, setPastShiftsOpen]         = useState(false)
  const [loadingPastShifts, setLoadingPastShifts]   = useState(false)
  const [totalHours, setTotalHours]                 = useState(null)

  const fetchedTabs = useRef(new Set())

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      const u = session?.user
      if (!u) { window.location.href = '/'; return }
      setUser(u)

      const { data: p } = await supabase
        .from('profiles')
        .select('id, full_name, email, affiliation, default_role, license_exp, bls_exp, dea_exp, tb_exp')
        .eq('id', u.id)
        .single()

      if (!p || p.default_role !== 'Provider') {
        window.location.href = '/volunteer'
        return
      }
      setProfile(p)

      await Promise.all([
        fetchUpcomingShifts(u.id),
        fetchSlotData(u.id),
        fetchRecurring(u.id),
      ])
      setLoading(false)
    }
    init()
  }, [])

  // ── Data fetchers ─────────────────────────────────────────────────────────
  async function fetchUpcomingShifts(uid) {
    const today = getMountainDateStr()
    const twoMonths = getMountainDateStr(62)
    const { data } = await supabase
      .from('provider_shifts')
      .select('id, shift_date, shift_time, day_of_week')
      .eq('provider_id', uid)
      .gte('shift_date', today)
      .lte('shift_date', twoMonths)
      .order('shift_date', { ascending: true })
      .order('shift_time', { ascending: true })
    setMyUpcomingShifts(data || [])
  }

  async function fetchSlotData(uid) {
    const today = getMountainDateStr()
    const twoMonths = getMountainDateStr(62)

    // All bookings in range (to know slot counts)
    const { data: allSlots } = await supabase
      .from('provider_shifts')
      .select('shift_date, shift_time, provider_id')
      .gte('shift_date', today)
      .lte('shift_date', twoMonths)

    // Build count map
    const counts = {}
    const mine   = new Set()
    ;(allSlots || []).forEach(row => {
      const key = `${row.shift_date}|${row.shift_time}`
      counts[key] = (counts[key] || 0) + 1
      if (row.provider_id === uid) mine.add(key)
    })
    setSlotCounts(counts)
    setMySlots(mine)
  }

  async function fetchRecurring(uid) {
    const { data } = await supabase
      .from('provider_recurring_schedule')
      .select('id, day_of_week, shift_time, week_pattern, start_date, end_date')
      .eq('provider_id', uid)
      .order('day_of_week')
    setMyRecurring(data || [])
  }

  async function fetchPastShifts(uid) {
    setLoadingPastShifts(true)
    const { data } = await supabase
      .from('shifts')
      .select('id, clock_in, clock_out, role')
      .eq('volunteer_id', uid)
      .not('clock_out', 'is', null)
      .order('clock_in', { ascending: false })
      .limit(30)
    setPastShifts(data || [])

    // Total hours
    const { data: all } = await supabase
      .from('shifts')
      .select('clock_in, clock_out')
      .eq('volunteer_id', uid)
      .not('clock_out', 'is', null)
    const total = (all || []).reduce((acc, s) =>
      acc + (new Date(s.clock_out) - new Date(s.clock_in)) / 3600000, 0).toFixed(1)
    setTotalHours(total)
    setLoadingPastShifts(false)
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  function showToast(text, type = 'success') {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleSignUpShift(date, shift, day) {
    const key = `${date}|${shift}`
    if (mySlots.has(key)) return
    if ((slotCounts[key] || 0) >= 3) { showToast('This shift is full (3/3 providers)', 'error'); return }
    setSigningUp(key)
    const { error } = await supabase.from('provider_shifts').insert({
      provider_id: user.id,
      shift_date:  date,
      shift_time:  shift,
      day_of_week: day,
    })
    if (error) {
      showToast(error.message, 'error')
    } else {
      showToast('Shift added!', 'success')
      await Promise.all([fetchUpcomingShifts(user.id), fetchSlotData(user.id)])
    }
    setSigningUp(null)
  }

  async function handleRemoveShift(date, shift) {
    const key = `${date}|${shift}`
    setRemovingSlot(key)
    const { error } = await supabase
      .from('provider_shifts')
      .delete()
      .eq('provider_id', user.id)
      .eq('shift_date', date)
      .eq('shift_time', shift)
    if (error) {
      showToast(error.message, 'error')
    } else {
      showToast('Removed from shift.', 'success')
      await Promise.all([fetchUpcomingShifts(user.id), fetchSlotData(user.id)])
    }
    setRemovingSlot(null)
  }

  async function handleCallOut(shift) {
    setCallingOutId(shift.id)
    const reason = calloutReasonMap[shift.id] || ''
    // Log callout
    const { error: coErr } = await supabase.from('provider_callouts').insert({
      provider_id: user.id,
      shift_date:  shift.shift_date,
      shift_time:  shift.shift_time,
      day_of_week: shift.day_of_week,
      reason:      reason || null,
    })
    if (coErr && !coErr.message.includes('unique')) {
      showToast(coErr.message, 'error')
      setCallingOutId(null)
      return
    }
    // Remove from provider_shifts
    await supabase
      .from('provider_shifts')
      .delete()
      .eq('provider_id', user.id)
      .eq('shift_date', shift.shift_date)
      .eq('shift_time', shift.shift_time)

    showToast('Called out successfully.', 'success')
    setConfirmCalloutId(null)
    setCalloutReasonMap(prev => { const n = { ...prev }; delete n[shift.id]; return n })
    await Promise.all([fetchUpcomingShifts(user.id), fetchSlotData(user.id)])
    setCallingOutId(null)
  }

  async function handleAddRecurring(e) {
    e.preventDefault()
    setSavingRecurring(true)
    const { error } = await supabase.from('provider_recurring_schedule').insert({
      provider_id:  user.id,
      day_of_week:  recurringForm.day_of_week,
      shift_time:   recurringForm.shift_time,
      week_pattern: recurringForm.week_pattern,
      start_date:   recurringForm.start_date || null,
      end_date:     recurringForm.end_date   || null,
    })
    if (error) {
      showToast(error.message.includes('unique') ? 'You already have that recurring slot.' : error.message, 'error')
    } else {
      showToast('Recurring slot added!', 'success')
      setAddingRecurring(false)
      setRecurringForm({ day_of_week: 'monday', shift_time: '10-2', week_pattern: 'every', start_date: '', end_date: '' })
      await fetchRecurring(user.id)
    }
    setSavingRecurring(false)
  }

  async function handleRemoveRecurring(id) {
    setRemovingRecurringId(id)
    const { error } = await supabase
      .from('provider_recurring_schedule')
      .delete()
      .eq('id', id)
    if (error) showToast(error.message, 'error')
    else { showToast('Recurring slot removed.', 'success'); await fetchRecurring(user.id) }
    setRemovingRecurringId(null)
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    if (newPassword !== confirmPassword) { showToast('Passwords do not match', 'error'); return }
    if (newPassword.length < 6) { showToast('Password must be at least 6 characters', 'error'); return }
    setChangingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) showToast(error.message, 'error')
    else { showToast('Password updated!', 'success'); setNewPassword(''); setConfirmPassword('') }
    setChangingPassword(false)
  }

  // ── Schedule tab — compute visible week ──────────────────────────────────
  const allWeekdays = generateUpcomingWeekdays(10)

  // Group into weeks (Mon–Fri blocks)
  const weeks = []
  let currentWeek = []
  let lastMonday = null
  allWeekdays.forEach(d => {
    const date = new Date(d.date + 'T12:00:00')
    const monday = new Date(date)
    monday.setDate(date.getDate() - (date.getDay() - 1))
    const mondayStr = monday.toLocaleDateString('en-CA')
    if (mondayStr !== lastMonday) {
      if (currentWeek.length) weeks.push(currentWeek)
      currentWeek = []
      lastMonday = mondayStr
    }
    currentWeek.push(d)
  })
  if (currentWeek.length) weeks.push(currentWeek)

  const visibleWeek = weeks[scheduleWeekOffset] || []

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <p style={{ color: 'var(--muted)' }}>Loading...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 600, letterSpacing: '-0.02em' }}>
              Hey, {profile?.full_name?.split(' ')[0]}
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              {new Date().toLocaleDateString('en-US', { timeZone: 'America/Denver', weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); window.location.href = '/' }}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            Sign out
          </button>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          {[['home', 'My Shifts'], ['schedule', 'Schedule'], ['account', 'Account']].map(([key, label]) => (
            <TabButton key={key} id={key} label={label} active={tab === key} onClick={async (t) => {
              setTab(t)
              if (t === 'account' && !fetchedTabs.current.has('account')) {
                fetchedTabs.current.add('account')
                // total hours fetched lazily when they open past shifts
              }
            }} />
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            HOME TAB — upcoming signed-up shifts
        ══════════════════════════════════════════════════════════════════ */}
        {tab === 'home' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Summary card */}
            <div style={{ ...S.card, borderColor: 'rgba(2,65,107,0.4)', background: 'rgba(2,65,107,0.04)' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.3rem' }}>Upcoming Shifts</p>
              <p style={{ fontSize: '2.2rem', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--accent)', lineHeight: 1 }}>
                {myUpcomingShifts.length}
                <span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--muted)', marginLeft: '0.4rem' }}>next 2 months</span>
              </p>
            </div>

            {/* Shift list */}
            <div style={S.card}>
              <h2 style={{ fontWeight: 600, marginBottom: myUpcomingShifts.length > 0 ? '1.25rem' : 0 }}>Your Upcoming Shifts</h2>

              {myUpcomingShifts.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                  No shifts signed up yet. Head to <strong>Schedule</strong> to pick up shifts.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {myUpcomingShifts.map(s => {
                    const isConfirming  = confirmCalloutId === s.id
                    const isCallingOut  = callingOutId     === s.id
                    return (
                      <div
                        key={s.id}
                        style={{
                          borderRadius: '10px',
                          border: `1px solid ${isConfirming ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
                          background: isConfirming ? 'rgba(239,68,68,0.04)' : 'var(--bg)',
                          overflow: 'hidden',
                          transition: 'border-color 0.15s',
                        }}
                      >
                        {/* Main row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', gap: '0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {/* Date block */}
                            <div style={{ textAlign: 'center', minWidth: '42px' }}>
                              <p style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1 }}>
                                {new Date(s.shift_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}
                              </p>
                              <p style={{ fontFamily: 'DM Mono, monospace', fontSize: '1.3rem', fontWeight: 700, color: 'var(--accent)', lineHeight: 1.1 }}>
                                {new Date(s.shift_date + 'T12:00:00').getDate()}
                              </p>
                              <p style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {DAY_LABEL[s.day_of_week]}
                              </p>
                            </div>

                            {/* Divider */}
                            <div style={{ width: '1px', height: '36px', background: 'var(--border)' }} />

                            <div>
                              <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                                {s.shift_time === '10-2' ? '10:00 AM – 2:00 PM' : '2:00 PM – 6:00 PM'}
                              </p>
                              <p style={{ color: 'var(--muted)', fontSize: '0.8rem', textTransform: 'capitalize' }}>
                                {DAY_FULL[s.day_of_week]}
                              </p>
                            </div>
                          </div>

                          {/* Call-out toggle */}
                          {!isConfirming ? (
                            <button
                              onClick={() => setConfirmCalloutId(s.id)}
                              title="Call out of this shift"
                              style={{
                                width: '28px', height: '28px',
                                borderRadius: '50%',
                                background: 'transparent',
                                border: '1px solid var(--border)',
                                color: 'var(--muted)',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                                transition: 'border-color 0.15s, color 0.15s',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
                            >
                              ✕
                            </button>
                          ) : (
                            <button
                              onClick={() => setConfirmCalloutId(null)}
                              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'DM Sans, sans-serif', padding: '0.3rem 0.5rem' }}
                            >
                              Keep
                            </button>
                          )}
                        </div>

                        {/* Callout confirmation panel */}
                        {isConfirming && (
                          <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)' }}>
                            <p style={{ fontSize: '0.82rem', color: '#ef4444', fontWeight: 600, marginBottom: '0.5rem' }}>
                              Call out of {formatShiftDate(s.shift_date)} {s.shift_time}?
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                  onClick={() => handleCallOut(s)}
                                  disabled={isCallingOut}
                                  style={{ flex: 1, padding: '0.55rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 600, cursor: isCallingOut ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.85rem' }}
                                >
                                  {isCallingOut ? 'Submitting…' : 'Yes, call out'}
                                </button>
                                <button
                                  onClick={() => { setConfirmCalloutId(null); setCalloutReasonMap(prev => { const n = { ...prev }; delete n[s.id]; return n }) }}
                                  style={{ padding: '0.55rem 1rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '7px', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.85rem' }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            SCHEDULE TAB — pick up / drop shifts + recurring
        ══════════════════════════════════════════════════════════════════ */}
        {tab === 'schedule' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Week nav */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...S.card, padding: '0.85rem 1.25rem' }}>
              <button
                onClick={() => setScheduleWeekOffset(o => Math.max(0, o - 1))}
                disabled={scheduleWeekOffset === 0}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: scheduleWeekOffset === 0 ? 'var(--border)' : 'var(--muted)', padding: '0.35rem 0.85rem', cursor: scheduleWeekOffset === 0 ? 'default' : 'pointer', fontSize: '0.9rem', fontFamily: 'DM Sans, sans-serif' }}
              >
                ← Prev
              </button>

              <div style={{ textAlign: 'center' }}>
                {visibleWeek.length > 0 && (
                  <>
                    <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                      Week of {new Date(visibleWeek[0].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                      {scheduleWeekOffset === 0 ? 'This week' : `+${scheduleWeekOffset} week${scheduleWeekOffset > 1 ? 's' : ''}`}
                    </p>
                  </>
                )}
              </div>

              <button
                onClick={() => setScheduleWeekOffset(o => Math.min(weeks.length - 1, o + 1))}
                disabled={scheduleWeekOffset >= weeks.length - 1}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: scheduleWeekOffset >= weeks.length - 1 ? 'var(--border)' : 'var(--muted)', padding: '0.35rem 0.85rem', cursor: scheduleWeekOffset >= weeks.length - 1 ? 'default' : 'pointer', fontSize: '0.9rem', fontFamily: 'DM Sans, sans-serif' }}
              >
                Next →
              </button>
            </div>

            {/* Shift grid */}
            <div style={S.card}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {/* Header row */}
                <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(5, 1fr)', gap: '0.4rem', marginBottom: '0.25rem' }}>
                  <div />
                  {DAYS.map(day => {
                    const cell = visibleWeek.find(d => d.day === day)
                    return (
                      <div key={day} style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{DAY_LABEL[day]}</p>
                        {cell && (
                          <p style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
                            {new Date(cell.date + 'T12:00:00').getDate()}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Shift rows */}
                {SHIFTS.map(shift => (
                  <div key={shift} style={{ display: 'grid', gridTemplateColumns: '80px repeat(5, 1fr)', gap: '0.4rem', alignItems: 'center' }}>
                    <div style={{ paddingRight: '0.5rem' }}>
                      <p style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600 }}>{shift}</p>
                    </div>
                    {DAYS.map(day => {
                      const cell = visibleWeek.find(d => d.day === day)
                      if (!cell) return <div key={day} />
                      const key   = `${cell.date}|${shift}`
                      const count = slotCounts[key] || 0
                      const isMine = mySlots.has(key)
                      const isFull = count >= 3 && !isMine
                      const isLoadingThis = signingUp === key || removingSlot === key
                      return (
                        <button
                          key={day}
                          disabled={isFull || isLoadingThis}
                          onClick={() => isMine
                            ? handleRemoveShift(cell.date, shift)
                            : handleSignUpShift(cell.date, shift, day)
                          }
                          style={{
                            padding: '0.5rem 0.25rem',
                            borderRadius: '8px',
                            border: isMine
                              ? '1px solid var(--accent)'
                              : isFull
                                ? '1px solid var(--border)'
                                : '1px dashed var(--border)',
                            background: isMine
                              ? 'rgba(2,65,107,0.12)'
                              : isFull
                                ? 'rgba(156,163,175,0.06)'
                                : 'transparent',
                            cursor: isFull ? 'default' : isLoadingThis ? 'wait' : 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '0.3rem',
                            transition: 'background 0.15s, border-color 0.15s',
                            opacity: isLoadingThis ? 0.5 : 1,
                          }}
                          onMouseEnter={e => {
                            if (!isFull && !isLoadingThis) e.currentTarget.style.borderColor = isMine ? '#ef4444' : 'var(--accent)'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = isMine ? 'var(--accent)' : isFull ? 'var(--border)' : 'var(--border)'
                          }}
                        >
                          <SlotPip count={count} />
                          <span style={{
                            fontSize: '0.68rem',
                            color: isMine ? 'var(--accent)' : isFull ? 'var(--muted)' : 'var(--muted)',
                            fontWeight: isMine ? 600 : 400,
                            fontFamily: 'DM Mono, monospace',
                          }}>
                            {isLoadingThis ? '…' : isMine ? 'joined' : isFull ? 'full' : `${3 - count} left`}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ))}

                {/* Legend */}
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  {[
                    { label: 'Your shift', color: 'var(--accent)', border: 'var(--accent)', bg: 'rgba(2,65,107,0.12)' },
                    { label: 'Available', border: 'var(--border)', bg: 'transparent', dashed: true },
                    { label: 'Full (3/3)', border: 'var(--border)', bg: 'rgba(156,163,175,0.06)' },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: `1px ${item.dashed ? 'dashed' : 'solid'} ${item.border}`, background: item.bg }} />
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{item.label}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <SlotPip count={2} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Provider count</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Recurring Schedule ── 
            <div style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: myRecurring.length > 0 || addingRecurring ? '1.25rem' : 0 }}>
                <div>
                  <h2 style={{ fontWeight: 600 }}>Recurring Schedule</h2>
                  <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: '0.15rem' }}>Standing weekly slots — for reference only.</p>
                </div>
                <button
                  onClick={() => setAddingRecurring(o => !o)}
                  style={{
                    padding: '0.4rem 0.9rem',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'DM Sans, sans-serif',
                    background: addingRecurring ? 'var(--surface)' : 'rgba(2,65,107,0.12)',
                    color: addingRecurring ? 'var(--muted)' : 'var(--accent)',
                    border: addingRecurring ? '1px solid var(--border)' : '1px solid rgba(2,65,107,0.35)',
                  }}
                >
                  {addingRecurring ? 'Cancel' : '+ Add slot'}
                </button>
              </div>*/}

              {/* Existing recurring 
              {myRecurring.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: addingRecurring ? '1rem' : 0 }}>
                  {myRecurring.map(r => (
                    <div
                      key={r.id}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.9rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', textTransform: 'capitalize' }}>{r.day_of_week}</span>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', background: 'rgba(2,65,107,0.1)', color: 'var(--accent)', padding: '0.15rem 0.5rem', borderRadius: '6px', border: '1px solid rgba(2,65,107,0.3)' }}>{r.shift_time}</span>
                        {r.week_pattern !== 'every' && (
                          <span style={{ fontSize: '0.72rem', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', borderRadius: '4px', padding: '0.1rem 0.35rem', border: '1px solid rgba(96,165,250,0.3)' }}>
                            {r.week_pattern === 'odd' ? '1st & 3rd' : '2nd & 4th'}
                          </span>
                        )}
                        {(r.start_date || r.end_date) && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                            {r.start_date ?? '…'} → {r.end_date ?? '…'}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemoveRecurring(r.id)}
                        disabled={removingRecurringId === r.id}
                        style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.85rem', padding: '0.25rem 0.4rem' }}
                      >
                        {removingRecurringId === r.id ? '…' : '✕'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {myRecurring.length === 0 && !addingRecurring && (
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No recurring slots set.</p>
              )}

              Add recurring form 
              {addingRecurring && (
                <form onSubmit={handleAddRecurring} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(2,65,107,0.3)', background: 'rgba(2,65,107,0.03)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={S.label}>Day</label>
                      <select value={recurringForm.day_of_week} onChange={e => setRecurringForm(f => ({ ...f, day_of_week: e.target.value }))} style={S.input}>
                        {DAYS.map(d => <option key={d} value={d}>{DAY_FULL[d]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={S.label}>Shift</label>
                      <select value={recurringForm.shift_time} onChange={e => setRecurringForm(f => ({ ...f, shift_time: e.target.value }))} style={S.input}>
                        {SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={S.label}>Frequency</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {WEEK_PATTERNS.map(wp => (
                        <button
                          key={wp.value}
                          type="button"
                          onClick={() => setRecurringForm(f => ({ ...f, week_pattern: wp.value }))}
                          style={{
                            padding: '0.4rem 0.85rem',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                            fontFamily: 'DM Sans, sans-serif',
                            background: recurringForm.week_pattern === wp.value ? 'var(--accent)' : 'var(--surface)',
                            color: recurringForm.week_pattern === wp.value ? '#0a0f0a' : 'var(--muted)',
                            border: recurringForm.week_pattern === wp.value ? 'none' : '1px solid var(--border)',
                          }}
                        >
                          {wp.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={S.label}>Start date <span style={{ textTransform: 'none', fontSize: '0.72rem', color: 'var(--muted)' }}>(optional)</span></label>
                      <input type="date" value={recurringForm.start_date} onChange={e => setRecurringForm(f => ({ ...f, start_date: e.target.value }))} style={S.input} />
                    </div>
                    <div>
                      <label style={S.label}>End date <span style={{ textTransform: 'none', fontSize: '0.72rem', color: 'var(--muted)' }}>(optional)</span></label>
                      <input type="date" value={recurringForm.end_date} onChange={e => setRecurringForm(f => ({ ...f, end_date: e.target.value }))} style={S.input} />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={savingRecurring}
                    style={{ padding: '0.75rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: savingRecurring ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}
                  >
                    {savingRecurring ? 'Saving…' : 'Add Recurring Slot'}
                  </button>
                </form>  */}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            ACCOUNT TAB
        ══════════════════════════════════════════════════════════════════ */}
        {tab === 'account' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Profile info (read-only) */}
            <div style={{ ...S.card, borderColor: 'rgba(125,211,252,0.35)', background: 'rgba(125,211,252,0.03)' }}>
              <h2 style={{ fontWeight: 600, marginBottom: '1rem' }}>Profile</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {[
                  { label: 'Name',  value: profile?.full_name },
                  { label: 'Email', value: profile?.email },
                  { label: 'Default Position', value: profile?.default_role },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: '0.65rem 0.9rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <p style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>{label}</p>
                    <p style={{ fontWeight: 500, fontSize: '0.9rem', color: value ? 'var(--text)' : 'var(--muted)', fontStyle: value ? 'normal' : 'italic' }}>{value || 'Not set'}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Past shifts (collapsible) */}
            <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
              <button
                onClick={async () => {
                  const next = !pastShiftsOpen
                  setPastShiftsOpen(next)
                  if (next && pastShifts.length === 0 && !loadingPastShifts) {
                    await fetchPastShifts(user.id)
                  }
                }}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
              >
                <div>
                  <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)' }}>Shifts Worked</span>
                  {totalHours !== null && (
                    <span style={{ marginLeft: '0.6rem', fontFamily: 'DM Mono, monospace', fontSize: '0.85rem', color: 'var(--accent)' }}>{totalHours}h total</span>
                  )}
                </div>
                <span style={{ color: 'var(--muted)', fontSize: '1.1rem', transform: pastShiftsOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▾</span>
              </button>

              {pastShiftsOpen && (
                <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {loadingPastShifts ? (
                    <p style={{ color: 'var(--muted)', fontSize: '0.9rem', paddingTop: '0.75rem' }}>Loading…</p>
                  ) : pastShifts.length === 0 ? (
                    <p style={{ color: 'var(--muted)', fontSize: '0.9rem', paddingTop: '0.75rem' }}>No completed shifts on record.</p>
                  ) : (
                    pastShifts.map(s => {
                      const hours = calcHours(s.clock_in, s.clock_out)
                      return (
                        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.7rem 0.9rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', marginTop: '0.25rem' }}>
                          <div>
                            <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>{formatDateTime(s.clock_in)}</p>
                            <p style={{ color: 'var(--muted)', fontSize: '0.78rem', fontFamily: 'DM Mono, monospace' }}>
                              {formatTime(s.clock_in)} → {formatTime(s.clock_out)}
                            </p>
                            {s.role && <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.1rem' }}>{s.role}</p>}
                          </div>
                          {hours && (
                            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '1rem', fontWeight: 700, color: 'var(--accent)' }}>{hours}h</span>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>

            {/* Change password */}
            <div style={S.card}>
              <h2 style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Change Password</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>Must be at least 6 characters.</p>
              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={S.label}>New Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showShowNew ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      required
                      placeholder="New password"
                      style={{ ...S.input, paddingRight: '3rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowShowNew(p => !p)}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.85rem' }}
                    >
                      {showShowNew ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <div>
                  <label style={S.label}>Confirm New Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showShowConfirm ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      required
                      placeholder="Repeat new password"
                      style={{ ...S.input, paddingRight: '3rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowShowConfirm(p => !p)}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.85rem' }}
                    >
                      {showShowConfirm ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={changingPassword || !newPassword || !confirmPassword}
                  style={{ padding: '0.85rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: changingPassword ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', opacity: (!newPassword || !confirmPassword) ? 0.5 : 1 }}
                >
                  {changingPassword ? 'Updating…' : 'Update Password'}
                </button>
              </form>
            </div>

          </div>
        )}

        {/* ── Toast ── */}
        {toast && (
          <div style={{
            position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
            background: toast.type === 'success' ? 'var(--accent)' : 'var(--danger)',
            color: toast.type === 'success' ? '#0a0f0a' : '#fff',
            padding: '0.75rem 1.5rem', borderRadius: '100px',
            fontWeight: 500, fontSize: '0.9rem',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 100,
            whiteSpace: 'nowrap',
          }}>
            {toast.text}
          </div>
        )}

      </div>
    </div>
  )
}