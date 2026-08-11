'use client'
import { useState, useEffect } from 'react'
import { ROLES, SHIFTS, ROLE_SUGGESTIONS } from '../lib/constants'

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']

export const ALL_SLOTS = DAYS.flatMap(day =>
  SHIFTS.map(shift => ({
    key: `${day}-${shift}`,
    day,
    shift,
    label: `${day.slice(0,3).charAt(0).toUpperCase()}${day.slice(1,3)} ${shift}`
  }))
)

export function parseSlotKey(key) {
  const idx   = key.indexOf('-')
  const day   = key.slice(0, idx)
  const shift = key.slice(idx + 1)
  return { day, shift }
}

const C = { blue: '#3b82f6', yellow: '#f59e0b', red: '#ef4444', green: '#22c55e', purple: '#a78bfa' }

// ─── Compute available slots ──────────────────────────────────────────────────
// A slot is truly open when its effective fill (counting active entries,
// where every-week = 1 and bi-weekly = 0.5, so two bi-weeklies = one full slot)
// is below the role limit. "Active" means end_date is null or in the future —
// future start_dates still count since that's a committed slot.
export function computeAvailableSlots(entry, currentSchedule) {
  const today = new Date().toISOString().split('T')[0]

  const slotKeys = (entry.preferred_slots?.length > 0)
    ? entry.preferred_slots
    : ALL_SLOTS.map(s => s.key)
  const roles = (entry.preferred_roles?.length > 0)
    ? entry.preferred_roles
    : ROLES

  const result = []

  for (const key of slotKeys) {
    const { day, shift } = parseSlotKey(key)
    for (const role of roles) {
      const limit = ROLE_SUGGESTIONS[role]
      if (limit === 0) continue

      if (limit !== undefined && limit !== null && limit > 0) {
        const activeEntries = (currentSchedule || []).filter(s =>
          s.day_of_week === day && s.shift_time === shift && s.role === role &&
          (s.end_date == null || s.end_date > today)
        )

        const filled = activeEntries.reduce((sum, s) =>
          sum + (s.week_pattern === 'every' ? 1 : 0.5), 0
        )

        if (filled >= limit) continue

        result.push({ key, day, shift, role, filled })
      } else {
        // Unlimited role — always available
        result.push({ key, day, shift, role, filled: 0 })
      }
    }
  }

  return result
}

// ─── Shared style helpers ─────────────────────────────────────────────────────

const card       = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
const inputStyle = { width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box', colorScheme: 'dark' }
const labelStyle = { display: 'block', fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }
const secLabel   = { fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.85rem' }

const solidBtn = (color, disabled) => ({
  padding: '0.65rem 1.35rem', borderRadius: '8px', border: 'none',
  background: disabled ? 'var(--surface)' : color,
  color: disabled ? 'var(--muted)' : (color === C.yellow ? '#1a1a00' : '#fff'),
  fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem',
  opacity: disabled ? 0.5 : 1, transition: 'opacity 0.15s',
})
const ghostBtn = () => ({
  padding: '0.65rem 1.25rem', borderRadius: '8px', border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--muted)', fontWeight: 500,
  cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem',
})
const pillBtn = (active, color = C.blue) => ({
  padding: '0.35rem 0.8rem', borderRadius: '100px', fontSize: '0.78rem',
  fontWeight: active ? 600 : 400, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
  border: `1px solid ${active ? color + '66' : 'var(--border)'}`,
  background: active ? color + '18' : 'var(--bg)',
  color: active ? color : 'var(--muted)', transition: 'all 0.12s',
})

// ─── SlotPicker ───────────────────────────────────────────────────────────────
export function SlotPicker({ selected, onChange }) {
  const toggle = (key) =>
    onChange(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `120px repeat(${SHIFTS.length}, 1fr)`, gap: '0.35rem', alignItems: 'center' }}>
        <div />
        {SHIFTS.map(s => (
          <div key={s} style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', fontFamily: 'DM Mono, monospace', letterSpacing: '0.04em' }}>{s}</div>
        ))}
      </div>
      {DAYS.map(day => (
        <div key={day} style={{ display: 'grid', gridTemplateColumns: `120px repeat(${SHIFTS.length}, 1fr)`, gap: '0.35rem', alignItems: 'center' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text)', textTransform: 'capitalize', paddingRight: '0.5rem' }}>{day}</div>
          {SHIFTS.map(shift => {
            const key    = `${day}-${shift}`
            const active = selected.includes(key)
            return (
              <button key={key} type="button" onClick={() => toggle(key)} style={{ padding: '0.5rem 0.25rem', borderRadius: '8px', border: `1px solid ${active ? C.blue + '88' : 'var(--border)'}`, background: active ? C.blue + '1a' : 'var(--bg)', color: active ? C.blue : 'var(--muted)', fontWeight: active ? 700 : 400, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'DM Mono, monospace', transition: 'all 0.12s', textAlign: 'center' }}>
                {active ? '✓' : '○'}
              </button>
            )
          })}
        </div>
      ))}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', paddingTop: '0.25rem' }}>
        <button type="button" onClick={() => onChange(ALL_SLOTS.map(s => s.key))} style={{ padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>All</button>
        <button type="button" onClick={() => onChange([])} style={{ padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>None</button>
        {SHIFTS.map(shift => (
          <button key={shift} type="button"
            onClick={() => {
              const shiftKeys = DAYS.map(d => `${d}-${shift}`)
              const allOn     = shiftKeys.every(k => selected.includes(k))
              onChange(allOn ? selected.filter(k => !shiftKeys.includes(k)) : [...new Set([...selected, ...shiftKeys])])
            }}
            style={{ padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Mono, monospace', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
          >All {shift}</button>
        ))}
      </div>
    </div>
  )
}

// ─── RolePicker ───────────────────────────────────────────────────────────────
export function RolePicker({ selected, onChange }) {
  const toggle = (r) => onChange(selected.includes(r) ? selected.filter(x => x !== r) : [...selected, r])
  return (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
      {ROLES.map(r => {
        const active = selected.includes(r)
        return (
          <button key={r} type="button" onClick={() => toggle(r)} style={{ padding: '0.35rem 0.8rem', borderRadius: '100px', fontSize: '0.78rem', fontWeight: active ? 600 : 400, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', border: `1px solid ${active ? C.blue + '66' : 'var(--border)'}`, background: active ? C.blue + '18' : 'var(--bg)', color: active ? C.blue : 'var(--muted)', transition: 'all 0.12s' }}>{r}</button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Waitlist component
// Props: supabase, profile, onAssigned (optional callback after slot assigned)
// ─────────────────────────────────────────────────────────────────────────────
export default function Waitlist({ supabase, profile, onAssigned }) {

  const [waitlist,          setWaitlist]          = useState([])
  const [waitlistLoading,   setWaitlistLoading]   = useState(false)
  const [waitlistError,     setWaitlistError]     = useState(null)
  const [schedule,          setSchedule]          = useState([])
  const [allVolunteers,     setAllVolunteers]     = useState([])
  const [availableSlotsMap, setAvailableSlotsMap] = useState({})

  // Filters
  const [wlSlot, setWlSlot] = useState('all')
  const [wlRole, setWlRole] = useState('all')

  // Assign modal
  const [assignModal,   setAssignModal]   = useState(null)
  const [assignSlotKey, setAssignSlotKey] = useState('')
  const [assignRole,    setAssignRole]    = useState('')
  const [assigningSlot, setAssigningSlot] = useState(false)

  // Manual add
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [manualVolId,   setManualVolId]   = useState('')
  const [manualSlots,   setManualSlots]   = useState([])
  const [manualRoles,   setManualRoles]   = useState([])
  const [manualNotes,   setManualNotes]   = useState('')
  const [savingManual,  setSavingManual]  = useState(false)

  const [toast, setToast] = useState(null)

  // ─── Boot ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadWaitlist()
    loadSchedule()
    loadAllVolunteers()
  }, [])

  // Re-compute available slots whenever waitlist or schedule changes
  useEffect(() => {
    if (schedule.length >= 0) {
      const map = {}
      for (const entry of waitlist) {
        map[entry.id] = computeAvailableSlots(entry, schedule)
      }
      setAvailableSlotsMap(map)
    }
  }, [waitlist, schedule])

  // ─── Loaders ───────────────────────────────────────────────────────────────
  
  async function loadWaitlist() {
    setWaitlistLoading(true)
    setWaitlistError(null)
    const { data, error } = await supabase
      .from('waitlist')
      .select('*, profiles!waitlist_volunteer_id_fkey(id, full_name, email, phone, affiliation, default_role, status)')
      .order('added_at', { ascending: true })
    if (error) {
      console.error('Waitlist load error:', error)
      setWaitlistError(`Failed to load waitlist: ${error.message} (code: ${error.code})`)
      setWaitlist([])
    } else {
      const withAttendance = await Promise.all(
        (data || []).map(async row => ({
          ...row,
          attendancePercent: await getAttendancePercent(row.profiles?.id)

        }))
      )
      withAttendance.sort((a, b) => {
        const aQualified = a.attendancePercent >= 75
        const bQualified = b.attendancePercent >= 75
        if (aQualified !== bQualified) {
          return bQualified - aQualified
        }
        return 0
      })
      console.log('Waitlist attendance:', withAttendance.map(entry => ({
        name: entry.profiles?.full_name,
        attendancePercent: entry.attendancePercent,
      })))
      setWaitlist(withAttendance)
    }
    setWaitlistLoading(false)
  }

  async function getAttendancePercent(volunteerId) {
    const { data: records, error } = await supabase
      .from('attendance_records')
      .select('status')
      .eq('volunteer_id', volunteerId)

    if (error) {
      console.error('Error loading attendance:', error)
      return 0
    }

    if (!records?.length) return 0

    const attended = records.filter(r => r.status !== 'absent').length

    return Math.round((attended / records.length) * 100)
  }

  async function loadSchedule() {
    const { data, error } = await supabase.from('schedule').select('*').order('role')
    if (!error) setSchedule(data || [])
  }

  async function loadAllVolunteers() {
    const { data } = await supabase
      .from('profiles').select('id, full_name, email, status').eq('role', 'volunteer').order('full_name')
    setAllVolunteers(data || [])
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function msg(text, type = 'success') { setToast({ text, type }); setTimeout(() => setToast(null), 3500) }

  async function audit(action, target_type, target_id, target_name, details) {
    try {
      await supabase.from('audit_logs').insert({
        admin_id:    profile.id,
        action,
        target_type,
        target_id:   target_id   ? String(target_id) : null,
        target_name: target_name || null,
        details:     details     || null,
      })
    } catch (e) { console.error('audit failed:', e) }
  }

  // ─── Assign actions ────────────────────────────────────────────────────────

  function openAssign(entry) {
    const slots     = availableSlotsMap[entry.id] || []
    const firstKey  = slots[0]?.key  || ALL_SLOTS[0]?.key || ''
    const firstRole = slots[0]?.role || ROLES[0] || ''
    setAssignModal(entry)
    setAssignSlotKey(firstKey)
    setAssignRole(firstRole)
  }

  async function handleAssignSlot() {
    if (!assignModal || !assignSlotKey || !assignRole) return
    setAssigningSlot(true)
    const today = new Date().toISOString().split('T')[0]
    const { day, shift } = parseSlotKey(assignSlotKey)
    const volId = assignModal.volunteer_id

    // Fresh query at assignment time to prevent races
    const { data: freshSchedule } = await supabase.from('schedule').select('*')
    const limit = ROLE_SUGGESTIONS[assignRole]

    if (limit !== undefined && limit !== null && limit > 0) {
      const activeEntries = (freshSchedule || []).filter(s =>
        s.day_of_week === day && s.shift_time === shift && s.role === assignRole &&
        (s.end_date == null || s.end_date > today)
      )
      const filled = activeEntries.reduce((sum, s) =>
        sum + (s.week_pattern === 'every' ? 1 : 0.5), 0
      )
      if (filled >= limit) {
        msg(`${assignRole} is full for ${day} ${shift} (${filled}/${limit})`, 'error')
        setAssigningSlot(false)
        return
      }
    }

    const dup = (freshSchedule || []).find(s =>
      s.volunteer_id === volId && s.day_of_week === day && s.shift_time === shift && s.role === assignRole
    )
    if (dup) { msg('Already scheduled in this slot', 'error'); setAssigningSlot(false); return }

    const { error } = await supabase.from('schedule').insert({
      volunteer_id: volId, day_of_week: day, shift_time: shift, role: assignRole,
    })
    if (error) { msg(error.message, 'error'); setAssigningSlot(false); return }

    await supabase.from('waitlist').delete().eq('id', assignModal.id)
    await audit('assigned_from_waitlist', 'waitlist', assignModal.id, assignModal.profiles?.full_name, `${day} ${shift} — ${assignRole}`)

    msg(`${assignModal.profiles?.full_name} assigned to ${day} ${shift} — ${assignRole}`)
    setAssignModal(null)
    await loadWaitlist()
    await loadSchedule()
    if (onAssigned) onAssigned()
    setAssigningSlot(false)
  }

  async function removeFromWaitlist(entry) {
    if (!confirm(`Remove ${entry.profiles?.full_name} from the waitlist?`)) return
    await supabase.from('waitlist').delete().eq('id', entry.id)
    await audit('removed_waitlist', 'waitlist', entry.id, entry.profiles?.full_name)
    msg(`${entry.profiles?.full_name} removed from waitlist`)
    await loadWaitlist()
  }

  async function handleManualAdd(e) {
    e.preventDefault()
    if (!manualVolId) return
    setSavingManual(true)
    const already = waitlist.find(w => w.volunteer_id === manualVolId)
    if (already) { msg('This volunteer is already on the waitlist', 'error'); setSavingManual(false); return }

    const { error } = await supabase.from('waitlist').insert({
      volunteer_id:    manualVolId,
      preferred_slots: manualSlots,
      preferred_roles: manualRoles,
      notes:           manualNotes || null,
      source:          'manual',
      added_by:        profile.id,
    })
    if (error) { msg(error.message, 'error'); setSavingManual(false); return }

    const vol = allVolunteers.find(v => v.id === manualVolId)
    await audit('added_waitlist', 'waitlist', null, vol?.full_name, 'manual add')
    msg(`${vol?.full_name} added to waitlist`)
    setManualVolId(''); setManualSlots([]); setManualRoles([]); setManualNotes('')
    setShowManualAdd(false)
    await loadWaitlist()
    setSavingManual(false)
  }

  // ─── Derived ───────────────────────────────────────────────────────────────

  const waitlistVolIds = new Set(waitlist.map(w => w.volunteer_id))
  const notOnWaitlist  = allVolunteers.filter(v => !waitlistVolIds.has(v.id) && (v.status ?? 'active') === 'active')

  const filteredWaitlist = waitlist.filter(entry => {
    if (wlSlot !== 'all' && entry.preferred_slots.length > 0 && !entry.preferred_slots.includes(wlSlot)) return false
    if (wlRole !== 'all' && entry.preferred_roles.length > 0 && !entry.preferred_roles.includes(wlRole)) return false
    return true
  })

  const hasFilters = wlSlot !== 'all' || wlRole !== 'all'

  // ─── Assign Modal ──────────────────────────────────────────────────────────

  function AssignModal() {
    if (!assignModal) return null

    const slots         = availableSlotsMap[assignModal.id] || []
    const uniqueKeys    = [...new Set(slots.map(s => s.key))]
    const rolesForSlot  = slots.filter(s => s.key === assignSlotKey)
    const availableRoles = rolesForSlot.length > 0 ? rolesForSlot.map(s => s.role) : ROLES

    return (
      <div onClick={() => setAssignModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1.5rem' }}>
        <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.75rem', maxWidth: '520px', width: '100%', boxShadow: '0 24px 60px rgba(0,0,0,0.4)', maxHeight: '85vh', overflowY: 'auto' }}>

          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.25rem' }}>Assign Slot</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Assigning <strong style={{ color: 'var(--text)' }}>{assignModal.profiles?.full_name}</strong> to a recurring shift. They'll be removed from the waitlist.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.25rem' }}>

            {/* Shift picker — matched slots */}
            <div>
              <label style={labelStyle}>Shift</label>
              {uniqueKeys.length > 0 ? (
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {uniqueKeys.map(k => {
                    const s = ALL_SLOTS.find(x => x.key === k)
                    return (
                      <button key={k} type="button"
                        onClick={() => {
                          setAssignSlotKey(k)
                          const first = slots.find(s => s.key === k)
                          if (first) setAssignRole(first.role)
                        }}
                        style={{ ...pillBtn(assignSlotKey === k), fontFamily: 'DM Mono, monospace', fontSize: '0.75rem' }}
                      >{s?.label || k}</button>
                    )
                  })}
                </div>
              ) : (
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', fontStyle: 'italic', marginBottom: '0.5rem' }}>
                  No pre-matched open slots — pick any shift below.
                </p>
              )}
            </div>

            {/* Full slot grid when no prefs or no matched slots */}
            {(uniqueKeys.length === 0 || !assignModal.preferred_slots || assignModal.preferred_slots.length === 0) && (
              <div style={{ padding: '1rem', borderRadius: '10px', background: 'var(--bg)', border: `1px solid ${C.blue}22`, overflowX: 'auto' }}>
                <p style={{ ...secLabel, marginBottom: '0.75rem' }}>Pick any shift</p>
                <SlotPicker
                  selected={assignSlotKey ? [assignSlotKey] : []}
                  onChange={keys => {
                    if (keys.length > 0) { setAssignSlotKey(keys[keys.length - 1]); setAssignRole(ROLES[0]) }
                    else setAssignSlotKey('')
                  }}
                />
              </div>
            )}

            {/* Role picker */}
            <div>
              <label style={labelStyle}>Role</label>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {ROLES.map(r => {
                  const inAvailable = availableRoles.includes(r)
                  const slotData    = rolesForSlot.find(s => s.role === r)
                  const limit       = ROLE_SUGGESTIONS[r]
                  const isUnlimited = limit === undefined || limit === null
                  const dimmed      = !inAvailable && rolesForSlot.length > 0 && !isUnlimited
                  return (
                    <button key={r} type="button" onClick={() => setAssignRole(r)}
                      style={{ ...pillBtn(assignRole === r, C.green), opacity: dimmed ? 0.45 : 1 }}
                      title={isUnlimited ? 'Unlimited role' : slotData ? `${slotData.filled} filled` : ''}
                    >
                      {r}
                      {isUnlimited && <span style={{ marginLeft: '0.3rem', fontSize: '0.62rem', opacity: 0.6 }}>∞</span>}
                      {!isUnlimited && slotData?.filled > 0 && <span style={{ marginLeft: '0.3rem', opacity: 0.55, fontSize: '0.68rem' }}>({slotData.filled})</span>}
                    </button>
                  )
                })}
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
                Roles marked ∞ have no capacity limit and can always be assigned.
              </p>
            </div>

            {assignSlotKey && assignRole && (
              <div style={{ padding: '0.7rem 0.95rem', borderRadius: '8px', background: C.green + '08', border: `1px solid ${C.green}44` }}>
                <p style={{ fontSize: '0.82rem', color: C.green, fontWeight: 600 }}>
                  ✓ {ALL_SLOTS.find(s => s.key === assignSlotKey)?.label || assignSlotKey} — {assignRole}
                  {(ROLE_SUGGESTIONS[assignRole] === undefined || ROLE_SUGGESTIONS[assignRole] === null) && (
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', opacity: 0.7 }}>(unlimited role)</span>
                  )}
                </p>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button onClick={() => setAssignModal(null)} style={ghostBtn()}>Cancel</button>
            <button onClick={handleAssignSlot} disabled={assigningSlot || !assignSlotKey || !assignRole} style={solidBtn(C.green, assigningSlot || !assignSlotKey || !assignRole)}>
              {assigningSlot ? 'Assigning...' : 'Confirm & Assign'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.2rem' }}>Slot Waitlist</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
            {waitlist.length} volunteer{waitlist.length !== 1 ? 's' : ''} waiting · ordered by wait time, volunteers with 75%+ attendance are prioritized
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => { loadWaitlist(); loadSchedule() }} style={{ padding: '0.45rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>↻ Refresh</button>
          <button onClick={() => setShowManualAdd(v => !v)} style={{ padding: '0.45rem 0.85rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: showManualAdd ? 'var(--surface)' : C.blue + '14', color: showManualAdd ? 'var(--muted)' : C.blue, border: showManualAdd ? '1px solid var(--border)' : `1px solid ${C.blue}55` }}>
            {showManualAdd ? 'Cancel' : '+ Add Volunteer'}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {waitlistError && (
        <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', background: C.red + '08', border: `1px solid ${C.red}33` }}>
          <p style={{ fontSize: '0.85rem', color: C.red, fontWeight: 500, marginBottom: '0.35rem' }}>{waitlistError}</p>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Make sure you've run the migrations.sql file and that RLS policies are applied.</p>
        </div>
      )}

      {/* Manual add form */}
      {showManualAdd && (
        <div style={{ ...card, borderColor: C.blue + '55', background: C.blue + '04' }}>
          <p style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.4rem' }}>Add Volunteer to Waitlist</p>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '1rem' }}>Only active volunteers with existing profiles can be added here.</p>
          <form onSubmit={handleManualAdd} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>Volunteer <span style={{ color: C.red }}>*</span></label>
              <select value={manualVolId} onChange={e => setManualVolId(e.target.value)} required style={inputStyle}>
                <option value="">— Select a volunteer —</option>
                {notOnWaitlist.map(v => <option key={v.id} value={v.id}>{v.full_name}{v.email ? ` — ${v.email}` : ''}</option>)}
              </select>
              {notOnWaitlist.length === 0 && <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.4rem', fontStyle: 'italic' }}>All active volunteers are already on the waitlist.</p>}
            </div>

            <div style={{ padding: '1rem 1.25rem', borderRadius: '10px', background: 'var(--bg)', border: `1px solid ${C.blue}22`, overflowX: 'auto' }}>
              <p style={{ ...labelStyle, marginBottom: '0.85rem' }}>Preferred Shifts <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--muted)' }}>(optional — leave blank for flexible)</span></p>
              <SlotPicker selected={manualSlots} onChange={setManualSlots} />
            </div>

            <div style={{ padding: '1rem 1.25rem', borderRadius: '10px', background: 'var(--bg)', border: `1px solid ${C.blue}22` }}>
              <p style={{ ...labelStyle, marginBottom: '0.75rem' }}>Preferred Roles <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></p>
              <RolePicker selected={manualRoles} onChange={setManualRoles} />
            </div>

            <div>
              <label style={labelStyle}>Notes <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
              <input value={manualNotes} onChange={e => setManualNotes(e.target.value)} placeholder="Any context..." style={inputStyle} />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowManualAdd(false)} style={ghostBtn()}>Cancel</button>
              <button type="submit" disabled={savingManual || !manualVolId} style={solidBtn(C.blue, savingManual || !manualVolId)}>{savingManual ? 'Adding...' : 'Add to Waitlist'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div style={{ ...card, padding: '0.85rem 1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>Filter by</span>
          <select value={wlSlot} onChange={e => setWlSlot(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.82rem' }}>
            <option value="all">All slots</option>
            {ALL_SLOTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select value={wlRole} onChange={e => setWlRole(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.82rem' }}>
            <option value="all">All roles</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {hasFilters && (
            <button onClick={() => { setWlSlot('all'); setWlRole('all') }} style={{ fontSize: '0.78rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '2px' }}>Clear</button>
          )}
        </div>
      </div>

      {/* List */}
      {waitlistLoading ? (
        <p style={{ color: 'var(--muted)', padding: '0.5rem' }}>Loading...</p>
      ) : filteredWaitlist.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '2.5rem' }}>
          <p style={{ color: 'var(--muted)', fontStyle: 'italic' }}>No one on the waitlist{hasFilters ? ' matching these filters' : ''}.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {filteredWaitlist.map((entry, idx) => {
            const vol      = entry.profiles
            const slots    = availableSlotsMap[entry.id] || []
            const hasSlots = slots.length > 0
            const waitDays = Math.floor((Date.now() - new Date(entry.added_at).getTime()) / 86400000)
            const flexible = !entry.preferred_slots || entry.preferred_slots.length === 0

            return (
              <div key={entry.id} style={{ padding: '1rem 1.25rem', borderRadius: '12px', border: `1px solid ${hasSlots ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`, background: hasSlots ? 'rgba(34,197,94,0.025)' : 'var(--surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>

                  {/* Left — volunteer info */}
                  <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>{idx + 1}</div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{vol?.full_name}</span>
                        {entry.source === 'manual' && <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: C.purple + '12', color: C.purple, border: `1px solid ${C.purple}33`, fontWeight: 600 }}>manual</span>}
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>{waitDays === 0 ? 'today' : `${waitDays}d`}</span>
                      </div>
                      {vol?.email && <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>{vol.email}</p>}

                      {/* Slot chips */}
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        {flexible
                          ? <span style={{ padding: '0.15rem 0.55rem', borderRadius: '100px', fontSize: '0.7rem', background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)', fontStyle: 'italic' }}>flexible — any slot</span>
                          : entry.preferred_slots.map(k => {
                              const s = ALL_SLOTS.find(x => x.key === k)
                              return <span key={k} style={{ padding: '0.15rem 0.5rem', borderRadius: '100px', fontSize: '0.7rem', background: C.blue + '12', color: C.blue, border: `1px solid ${C.blue}30`, fontFamily: 'DM Mono, monospace' }}>{s?.label || k}</span>
                            })
                        }
                      </div>

                      {/* Role chips */}
                      {entry.preferred_roles && entry.preferred_roles.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
                          {entry.preferred_roles.map(r => <span key={r} style={{ padding: '0.15rem 0.5rem', borderRadius: '100px', fontSize: '0.7rem', background: C.green + '12', color: C.green, border: `1px solid ${C.green}30` }}>{r}</span>)}
                        </div>
                      )}

                      {entry.notes && <p style={{ fontSize: '0.78rem', color: 'var(--muted)', fontStyle: 'italic', marginTop: '0.4rem' }}>{entry.notes}</p>}
                    </div>
                  </div>

                  {/* Right — actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
                    {hasSlots
                      ? <span style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: '100px', background: C.green + '12', color: C.green, border: `1px solid ${C.green}44`, fontWeight: 600 }}>{slots.length} slot{slots.length !== 1 ? 's' : ''} open</span>
                      : <span style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: '100px', background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)', fontStyle: 'italic' }}>no open slots</span>
                    }
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button onClick={() => openAssign(entry)} style={{ padding: '0.35rem 0.85rem', borderRadius: '7px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: C.green + '14', color: C.green, border: `1px solid ${C.green}55` }}>
                        Assign Slot →
                      </button>
                      <button onClick={() => removeFromWaitlist(entry)} style={{ padding: '0.35rem 0.7rem', borderRadius: '7px', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)' }}>Remove</button>
                    </div>
                  </div>
                </div>

                {/* Available slots preview */}
                {hasSlots && (
                  <div style={{ marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border)' }}>
                    <p style={{ ...secLabel, marginBottom: '0.5rem' }}>Available matching slots</p>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {slots.slice(0, 10).map((s, i) => (
                        <span key={i} style={{ padding: '0.22rem 0.6rem', borderRadius: '7px', fontSize: '0.7rem', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'DM Mono, monospace', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          {ALL_SLOTS.find(x => x.key === s.key)?.label || s.key}
                          <span style={{ color: 'var(--muted)' }}>·</span>
                          <span style={{ color: 'var(--accent)', fontSize: '0.65rem' }}>{s.role}</span>
                          {s.filled > 0 && <span style={{ color: 'var(--muted)', fontSize: '0.62rem' }}>({s.filled})</span>}
                        </span>
                      ))}
                      {slots.length > 10 && <span style={{ padding: '0.22rem 0.6rem', borderRadius: '7px', fontSize: '0.7rem', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)', fontStyle: 'italic' }}>+{slots.length - 10} more</span>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <AssignModal />

      {toast && (
        <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'error' ? '#ef4444' : '#3b82f6', color: '#fff', padding: '0.75rem 1.5rem', borderRadius: '100px', fontWeight: 500, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 100, fontFamily: 'DM Sans, sans-serif' }}>
          {toast.text}
        </div>
      )}
    </div>
  )
}
