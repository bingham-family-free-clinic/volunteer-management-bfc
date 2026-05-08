'use client'
// components/DataDashboard.jsx

import { useState, useEffect, useCallback } from 'react'

const AFFILIATIONS = ['All', 'missionary', 'student', 'volunteer', 'provider', 'intern']
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [{ value: 0, label: 'All years' }, ...Array.from({ length: 5 }, (_, i) => ({ value: CURRENT_YEAR - i, label: String(CURRENT_YEAR - i) }))]
const MONTHS = [
  { value: 0,  label: 'All months' },
  { value: 1,  label: 'January' },  { value: 2,  label: 'February' },
  { value: 3,  label: 'March' },    { value: 4,  label: 'April' },
  { value: 5,  label: 'May' },      { value: 6,  label: 'June' },
  { value: 7,  label: 'July' },     { value: 8,  label: 'August' },
  { value: 9,  label: 'September' },{ value: 10, label: 'October' },
  { value: 11, label: 'November' }, { value: 12, label: 'December' },
]
const TOP_COUNT_OPTIONS = [5, 10, 25, 50]

// Records before this date are ignored for no-shows and late arrivals
const ATTENDANCE_CUTOFF = '2026-03-29'

function asUTC(ts) {
  if (!ts) return null
  return /Z|[+-]\d{2}:\d{2}$/.test(ts) ? new Date(ts) : new Date(ts + 'Z')
}

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-')
  return `${m}/${d}/${y}`
}

const pillStyle = (color, bg) => ({
  display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: '100px',
  fontSize: '0.72rem', fontWeight: 600,
  background: bg || (color + '18'), color,
  border: `1px solid ${color}44`,
})

function Chevron({ open }) {
  return (
    <span style={{
      display: 'inline-block',
      transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
      transition: 'transform 0.2s',
      color: 'var(--muted)',
      fontSize: '1.1rem',
      lineHeight: 1,
    }}>›</span>
  )
}

// Paginated fetch — loops with .range() until all rows are retrieved (handles 10k+)
async function fetchAllRows(supabase, table, buildQuery, pageSize = 1000) {
  let allRows = []
  let from = 0
  while (true) {
    const q = buildQuery(supabase.from(table)).range(from, from + pageSize - 1)
    const { data, error } = await q
    if (error) { console.error(`fetchAllRows(${table}) error:`, error); break }
    if (!data || data.length === 0) break
    allRows = allRows.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return allRows
}

// ── Excuse Modal ─────────────────────────────────────────────────────────────
{/* function ExcuseModal({ record, onClose, onExcused, supabase }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

   async function handleExcuse() {
    if (!reason.trim()) { setError('Please enter a reason.'); return }
    setSaving(true)
    setError(null)
    try {
      // Update the existing attendance_records row — status becomes 'excused'
      let query = supabase
        .from('attendance_records')
        .update({
          status:        'excused',
          excuse_reason: reason.trim(),
          excused_at:    new Date().toISOString(),
        })
        .eq('volunteer_id', record.volunteer_id)
        .eq('shift_date',   record.shift_date)

      // shift_time may be null — only filter on it when present
      if (record.shift_time) {
        query = query.eq('shift_time', record.shift_time)
      } else {
        query = query.is('shift_time', null)
      }

      const { error: err } = await query
      if (err) throw err
      onExcused(record)
    } catch (e) {
      setError(e.message || 'Failed to save excuse.')
    } finally {
      setSaving(false)
    }
  } 

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '14px', padding: '1.5rem', width: '100%', maxWidth: '420px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text)', marginBottom: '0.25rem' }}>
            Excuse Absence
          </p>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
            {record.name} · {fmtDate(record.shift_date)}
            {record.shift_time ? ` · ${record.shift_time}` : ''}
          </p>
        </div>

        <textarea
          placeholder="Reason for excuse…"
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '0.65rem 0.85rem',
            background: 'var(--bg)', border: `1px solid ${error ? '#ef4444' : 'var(--border)'}`,
            borderRadius: '8px', color: 'var(--text)', fontSize: '0.88rem',
            fontFamily: 'DM Sans, sans-serif', resize: 'vertical', outline: 'none',
          }}
        />
        {error && <p style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '0.35rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border)',
              background: 'var(--bg)', color: 'var(--muted)', fontSize: '0.85rem',
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleExcuse}
            disabled={saving}
            style={{
              padding: '0.5rem 1.1rem', borderRadius: '8px', border: 'none',
              background: saving ? 'rgba(2,65,107,0.4)' : 'var(--accent)',
              color: '#fff', fontSize: '0.85rem', fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            {saving ? 'Saving…' : 'Excuse'}
          </button>
        </div>
      </div>
    </div>
  )
} */}

// ── Person Detail Drawer ──────────────────────────────────────────────────────
function PersonDrawer({ person, allExcusedRecordKeys, onClose, onExcuseClick }) {
  if (!person) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '16px 16px 0 0', padding: '1.5rem',
          width: '100%', maxWidth: '560px',
          maxHeight: '70vh', overflowY: 'auto',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.2)',
        }}
      >
        {/* Handle bar */}
        <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: 'var(--border)', margin: '0 auto 1.25rem' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)' }}>{person.name}</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.1rem' }}>
              {person.records.length} absence{person.records.length !== 1 ? 's' : ''} since {fmtDate(ATTENDANCE_CUTOFF)}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '0.35rem 0.7rem',
              color: 'var(--muted)', cursor: 'pointer', fontSize: '0.85rem',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {person.records.map((r, idx) => {
            const key = `${r.volunteer_id}|${r.shift_date}|${r.shift_time ?? ''}`
            const isExcused = allExcusedRecordKeys.has(key)
            return (
              <div
                key={idx}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.65rem 1rem', borderRadius: '8px', gap: '0.75rem',
                  background: isExcused ? 'rgba(74,222,128,0.05)' : 'var(--bg)',
                  border: `1px solid ${isExcused ? 'rgba(74,222,128,0.3)' : 'var(--border)'}`,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                  <span style={{ fontWeight: 500, fontSize: '0.88rem', color: 'var(--text)' }}>
                    {fmtDate(r.shift_date)}
                  </span>
                  {r.shift_time && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{r.shift_time}</span>
                  )}
                  {r.role && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontStyle: 'italic' }}>{r.role}</span>
                  )}
                </div>

                {/* {isExcused ? (
                  <span style={{ ...pillStyle('#4ade80'), fontSize: '0.72rem' }}>Excused</span>
                ) : (
                  <button
                    onClick={() => onExcuseClick({ ...r, name: person.name })}
                    style={{
                      padding: '0.35rem 0.85rem', borderRadius: '6px',
                      border: '1px solid rgba(2,65,107,0.35)',
                      background: 'rgba(2,65,107,0.08)',
                      color: 'var(--accent)', fontSize: '0.78rem', fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Excuse
                  </button>
                )} */}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── No-Show Row ───────────────────────────────────────────────────────────────
function NoShowRow({ v, isHigh, onNameClick }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '0.65rem 1rem', borderRadius: '8px', gap: '0.75rem', flexWrap: 'wrap',
      background: isHigh ? 'rgba(239,68,68,0.05)' : 'var(--bg)',
      border: `1px solid ${isHigh ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
      marginBottom: '0.4rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <button
          onClick={() => onNameClick(v)}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontWeight: isHigh ? 700 : 500, fontSize: '0.9rem',
            color: isHigh ? '#ef4444' : 'var(--accent)',
            fontFamily: 'DM Sans, sans-serif',
            textDecoration: 'underline', textDecorationColor: 'transparent',
            transition: 'text-decoration-color 0.15s',
          }}
          onMouseEnter={e => e.target.style.textDecorationColor = 'currentColor'}
          onMouseLeave={e => e.target.style.textDecorationColor = 'transparent'}
        >
          {v.name}
        </button>
      </div>
      <span style={{
        fontFamily: 'DM Mono, monospace', fontSize: '0.85rem', fontWeight: 700,
        color: isHigh ? '#ef4444' : 'var(--muted)',
      }}>
        {v.count} absence{v.count !== 1 ? 's' : ''}
      </span>
    </div>
  )
}

export default function DataDashboard({ supabase }) {
  // ── Filter / collapse state ───────────────────────────────
  const [hoursMonth,  setHoursMonth]  = useState(new Date().getMonth() + 1)
  const [hoursYear,   setHoursYear]   = useState(CURRENT_YEAR)
  const [hoursAff,    setHoursAff]    = useState('All')
  const [hoursOpen,   setHoursOpen]   = useState(false)

  const [topMonth,    setTopMonth]    = useState(0)
  const [topYear,     setTopYear]     = useState(CURRENT_YEAR)
  const [topAff,      setTopAff]      = useState('All')
  const [topCount,    setTopCount]    = useState(10)
  const [topOpen,     setTopOpen]     = useState(false)

  const [noShowOpen,  setNoShowOpen]  = useState(false)
  const [lateOpen,    setLateOpen]    = useState(false)
  const [missingOpen, setMissingOpen] = useState(false)

  // ── Data state ────────────────────────────────────────────
  const [loading,         setLoading]         = useState(true)
  const [totalHoursVal,   setTotalHoursVal]   = useState(0)
  const [shiftCount,      setShiftCount]      = useState(0)
  const [noShowsAll,      setNoShowsAll]      = useState([])   // all-time
  const [noShowsWeek,     setNoShowsWeek]     = useState([])   // past week
  const [latePeople,      setLatePeople]      = useState([])
  const [topHours,        setTopHours]        = useState([])
  const [missingInfo,     setMissingInfo]     = useState([])
  const [profiles,        setProfiles]        = useState([])

  // ── Excuse / drawer state ─────────────────────────────────
  const [drawerPerson,     setDrawerPerson]     = useState(null)   // { id, name, records[] }
  const [excuseTarget,     setExcuseTarget]     = useState(null)   // single attendance_record
  const [excusedRecordKeys, setExcusedRecordKeys] = useState(new Set()) // "vol|date|time"

  // Load ALL profiles (no role filter) so any affiliation resolves names
  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, affiliation, sma_name, school, birthday, role, status')
      .then(({ data }) => setProfiles(data || []))
  }, [supabase])

  // ── Hours query — paginated ────────────────────────────────
  const loadHours = useCallback(async () => {
    let fromDate, toDate
    if (hoursYear === 0) {
      fromDate = `2000-01-01`
      toDate   = `${CURRENT_YEAR}-12-31`
    } else if (hoursMonth === 0) {
      fromDate = `${hoursYear}-01-01`
      toDate   = `${hoursYear}-12-31`
    } else {
      const mm = String(hoursMonth).padStart(2, '0')
      const lastDay = new Date(hoursYear, hoursMonth, 0).getDate()
      fromDate = `${hoursYear}-${mm}-01`
      toDate   = `${hoursYear}-${mm}-${lastDay}`
    }

    const affFilter = hoursAff
    const shiftsData = await fetchAllRows(supabase, 'shifts', (q) => {
      let query = q
        .select('volunteer_id, clock_in, clock_out, profiles!inner(affiliation)')
        .not('clock_out', 'is', null)
        .gte('clock_in', fromDate + 'T00:00:00Z')
        .lte('clock_in', toDate   + 'T23:59:59Z')
      if (affFilter !== 'All') query = query.eq('profiles.affiliation', affFilter)
      return query
    })

    let totalMs = 0
    ;(shiftsData || []).forEach(s => {
      totalMs += asUTC(s.clock_out) - asUTC(s.clock_in)
    })

    setTotalHoursVal((totalMs / 3600000).toFixed(1))
    setShiftCount((shiftsData || []).length)
  }, [supabase, hoursMonth, hoursYear, hoursAff])

  // ── Top hours — paginated, independent filters ─────────────
  const loadTopHours = useCallback(async () => {
    let fromDate, toDate
    if (topYear === 0) {
      fromDate = `2000-01-01`
      toDate   = `${CURRENT_YEAR}-12-31`
    } else if (topMonth === 0) {
      fromDate = `${topYear}-01-01`
      toDate   = `${topYear}-12-31`
    } else {
      const mm = String(topMonth).padStart(2, '0')
      const lastDay = new Date(topYear, topMonth, 0).getDate()
      fromDate = `${topYear}-${mm}-01`
      toDate   = `${topYear}-${mm}-${lastDay}`
    }

    const affFilter = topAff
    const shiftsData = await fetchAllRows(supabase, 'shifts', (q) => {
      const joinType = affFilter !== 'All' ? 'profiles!inner' : 'profiles'
      let query = q
        .select(`volunteer_id, clock_in, clock_out, ${joinType}(full_name, affiliation)`)
        .not('clock_out', 'is', null)
        .gte('clock_in', fromDate + 'T00:00:00Z')
        .lte('clock_in', toDate   + 'T23:59:59Z')
      if (affFilter !== 'All') query = query.eq('profiles.affiliation', affFilter)
      return query
    })

    const byVol = {}
    ;(shiftsData || []).forEach(s => {
      const dur = asUTC(s.clock_out) - asUTC(s.clock_in)
      if (!byVol[s.volunteer_id]) {
        const joinedName = s.profiles?.full_name
        const stateName  = profiles.find(p => p.id === s.volunteer_id)?.full_name
        byVol[s.volunteer_id] = { ms: 0, name: joinedName || stateName || 'Unknown' }
      }
      byVol[s.volunteer_id].ms += dur
    })

    const sorted = Object.entries(byVol)
      .map(([id, { ms, name }]) => ({ id, name, hours: (ms / 3600000).toFixed(1) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, topCount)

    setTopHours(sorted)
  }, [supabase, topMonth, topYear, topAff, topCount, profiles])

  // ── Attendance (no-shows + late) ──────────────────────────
  const loadAttendance = useCallback(async () => {
    // Fetch volunteer IDs who have any non-null/non-empty note in the schedule
    // table — these people are considered excused and are hidden from both lists.
    const { data: scheduledWithNotes } = await supabase
      .from('schedule')
      .select('volunteer_id')
      .not('notes', 'is', null)
      .neq('notes', '')

    const excusedIds = new Set(
      (scheduledWithNotes || []).map(r => r.volunteer_id).filter(Boolean)
    )

    // Also load fine-grained excuse keys from absence_excuses
    const { data: excuseRows } = await supabase
      .from('attendance_records')
      .select('volunteer_id, shift_date, shift_time')
      .eq('status', 'excused')
    const excuseKeySet = new Set(
      (excuseRows || []).map(r => `${r.volunteer_id}|${r.shift_date}|${r.shift_time ?? ''}`)
    )

    const now = new Date()
    const day = now.getDay()

    const thisMonday = new Date(now)
    thisMonday.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
    thisMonday.setHours(0, 0, 0, 0)

    const monday = new Date(thisMonday)
    monday.setDate(thisMonday.getDate() - 7)

    const friday = new Date(monday)
    friday.setDate(monday.getDate() + 4)
    friday.setHours(23, 59, 59, 999)

    const inactiveIds = new Set(
      profiles.filter(p => p.status === 'inactive').map(p => p.id)
    )

    // No-shows — from ATTENDANCE_CUTOFF onward, paginated
    const absentData = await fetchAllRows(supabase, 'attendance_records', (q) =>
      q.select('volunteer_id, shift_date, shift_time, role, profiles(full_name)')
        .eq('status', 'absent')
        .gte('shift_date', ATTENDANCE_CUTOFF)
        .order('shift_date', { ascending: false })
    )

    const absentMap = {}
    ;(absentData || []).forEach(r => {
      if (excusedIds.has(r.volunteer_id)) return
      if (inactiveIds.has(r.volunteer_id)) return
      // Skip individually excused records
      const key = `${r.volunteer_id}|${r.shift_date}|${r.shift_time ?? ''}`
      if (excuseKeySet.has(key)) return
      if (!absentMap[r.volunteer_id]) absentMap[r.volunteer_id] = { records: [], name: null }
      if (!absentMap[r.volunteer_id].name) {
        absentMap[r.volunteer_id].name =
          r.profiles?.full_name ||
          profiles.find(p => p.id === r.volunteer_id)?.full_name ||
          'Unknown'
      }
      absentMap[r.volunteer_id].records.push(r)
    })

    const allTime = []
    const pastWeek = []

    Object.entries(absentMap).forEach(([id, { name, records }]) => {
      const weekRecords = records.filter(r => {
        const date = new Date(r.shift_date + 'T00:00:00')
        return date >= monday && date <= friday
      })

      allTime.push({ id, name, count: records.length, records })

      if (weekRecords.length > 0) {
        pastWeek.push({ id, name, count: weekRecords.length, records: weekRecords })
      }
    })

    allTime.sort((a, b) => b.count - a.count)
    pastWeek.sort((a, b) => b.count - a.count)

    setNoShowsAll(allTime)
    setNoShowsWeek(pastWeek)

    // Late arrivals — from ATTENDANCE_CUTOFF onward, paginated
    const lateData = await fetchAllRows(supabase, 'attendance_records', (q) =>
      q.select('volunteer_id, shift_date, shift_time, late_minutes, profiles(full_name)')
        .eq('status', 'late')
        .gte('shift_date', ATTENDANCE_CUTOFF)
        .order('shift_date', { ascending: false })
    )

    const lateMap = {}
    ;(lateData || []).forEach(r => {
      if (excusedIds.has(r.volunteer_id)) return
      if (inactiveIds.has(r.volunteer_id)) return
      if (!lateMap[r.volunteer_id]) {
        lateMap[r.volunteer_id] = {
          records: [],
          name:
            r.profiles?.full_name ||
            profiles.find(p => p.id === r.volunteer_id)?.full_name ||
            'Unknown',
        }
      }
      lateMap[r.volunteer_id].records.push(r)
    })

    setLatePeople(
      Object.entries(lateMap)
        .filter(([, { records }]) => records.length >= 2)
        .map(([id, { name, records }]) => ({
          id, name,
          count: records.length,
          avgLate: Math.round(
            records.reduce((s, r) => s + (r.late_minutes || 0), 0) / records.length
          ),
          records,
        }))
        .sort((a, b) => b.count - a.count)
    )
  }, [supabase, profiles])

  // ── Missing info — missionaries:sma, students:school, all:birthday ──
  useEffect(() => {
    if (!profiles.length) return
    const missing = profiles
      .filter(p => p.role === 'volunteer' && (p.status ?? 'active') === 'active')
      .filter(p => {
        const needsSma    = p.affiliation === 'missionary' && !p.sma_name
        const needsSchool = p.affiliation === 'student'    && !p.school
        const needsBday   = !p.birthday
        return needsSma || needsSchool || needsBday
      })
      .map(p => ({
        id: p.id,
        name: p.full_name,
        affiliation: p.affiliation,
        missingSma:      p.affiliation === 'missionary' && !p.sma_name,
        missingSchool:   p.affiliation === 'student'    && !p.school,
        missingBirthday: !p.birthday,
        smaNA:    p.affiliation !== 'missionary',
        schoolNA: p.affiliation !== 'student',
      }))
    setMissingInfo(missing)
  }, [profiles])

  // ── Bootstrap on profiles load ────────────────────────────
  useEffect(() => {
    if (!profiles.length) return
    setLoading(true)
    Promise.all([loadHours(), loadTopHours(), loadAttendance()])
      .finally(() => setLoading(false))
  }, [profiles]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (profiles.length) loadHours()    }, [hoursMonth, hoursYear, hoursAff, loadHours])
  useEffect(() => { if (profiles.length) loadTopHours() }, [topMonth, topYear, topAff, topCount, loadTopHours])

  // ── Excuse handlers ───────────────────────────────────────
  function handleExcused(record) {
    const key = `${record.volunteer_id}|${record.shift_date}|${record.shift_time ?? ''}`
    setExcusedRecordKeys(prev => new Set([...prev, key]))
    setExcuseTarget(null)
    // Optimistically remove excused record from both lists
    const filterExcused = (list) =>
      list
        .map(v => ({
          ...v,
          records: v.records.filter(r => `${r.volunteer_id}|${r.shift_date}|${r.shift_time ?? ''}` !== key),
        }))
        .filter(v => v.records.length > 0)
        .map(v => ({ ...v, count: v.records.length }))

    setNoShowsAll(prev => filterExcused(prev))
    setNoShowsWeek(prev => filterExcused(prev))

    // Update drawer person if open
    if (drawerPerson && drawerPerson.id === record.volunteer_id) {
      setDrawerPerson(prev => {
        const updated = {
          ...prev,
          records: prev.records.filter(r => `${r.volunteer_id}|${r.shift_date}|${r.shift_time ?? ''}` !== key),
        }
        if (updated.records.length === 0) return null
        return { ...updated, count: updated.records.length }
      })
    }
  }

  // ── Shared styles ─────────────────────────────────────────
  const card = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '12px', padding: '1.5rem',
  }
  const sel = {
    padding: '0.45rem 0.75rem', background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: '8px', color: 'var(--text)', fontSize: '0.82rem',
    fontFamily: 'DM Sans, sans-serif', outline: 'none', cursor: 'pointer',
  }
  const collapseBtn = {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    background: 'none', border: 'none', cursor: 'pointer',
    padding: 0, fontFamily: 'DM Sans, sans-serif',
  }

  if (loading) return (
    <div style={{ ...card, textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>
      Loading dashboard…
    </div>
  )

  return (
    <>
      {/* ── Modals / Drawers ───────────────────────────────── */}
      {drawerPerson && (
        <PersonDrawer
          person={drawerPerson}
          allExcusedRecordKeys={excusedRecordKeys}
          onClose={() => setDrawerPerson(null)}
          onExcuseClick={setExcuseTarget}
        />
      )}
      {excuseTarget && (
        <ExcuseModal
          record={excuseTarget}
          supabase={supabase}
          onClose={() => setExcuseTarget(null)}
          onExcused={handleExcused}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* ── 1. Hours Served (collapsible) ───────────────────── */}
        <div style={card}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            flexWrap: 'wrap', gap: '0.75rem',
            marginBottom: hoursOpen ? '1.25rem' : 0,
          }}>
            <button onClick={() => setHoursOpen(s => !s)} style={collapseBtn}>
              <Chevron open={hoursOpen} />
              <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)' }}>Hours Served</span>
            </button>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <select value={hoursMonth} onChange={e => setHoursMonth(Number(e.target.value))} disabled={hoursYear === 0} style={{ ...sel, opacity: hoursYear === 0 ? 0.4 : 1 }}>
                {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <select value={hoursYear} onChange={e => setHoursYear(Number(e.target.value))} style={sel}>
                {YEARS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
              </select>
              <select value={hoursAff} onChange={e => setHoursAff(e.target.value)} style={sel}>
                {AFFILIATIONS.map(a => <option key={a} value={a}>{a === 'All' ? 'All affiliations' : a === 'provider' ? 'Clinical Care Volunteer' : a}</option>)}
              </select>
            </div>
          </div>
          {hoursOpen && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <div style={{ padding: '1.25rem', background: 'rgba(2,65,107,0.06)', borderRadius: '10px', border: '1px solid rgba(2,65,107,0.25)' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Total Hours</p>
                <p style={{ fontSize: '2.2rem', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--accent)', lineHeight: 1 }}>
                  {totalHoursVal}<span style={{ fontSize: '1rem', color: 'var(--muted)', fontWeight: 400, marginLeft: '0.25rem' }}>h</span>
                </p>
              </div>
              <div style={{ padding: '1.25rem', background: 'var(--bg)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Shift Records</p>
                <p style={{ fontSize: '2.2rem', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--text)', lineHeight: 1 }}>{shiftCount}</p>
              </div>
            </div>
          )}
        </div>

        {/* ── 2. No-Shows (collapsible, two banners) ──────────── */}
        <div style={card}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: noShowOpen ? '1rem' : 0,
          }}>
            <button onClick={() => setNoShowOpen(s => !s)} style={collapseBtn}>
              <Chevron open={noShowOpen} />
              <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)' }}>No-Shows</span>
              {(noShowsAll.length > 0 || noShowsWeek.length > 0) && (
                <span style={{ ...pillStyle('#02416b') }}>
                  {noShowsAll.length}
                </span>
              )}
            </button>
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
              Click a name to view shifts missed. Since March 29.
            </span>
          </div>

          {noShowOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

              {/* ── All Time banner ── */}
              <div style={{
                borderRadius: '10px', border: '1px solid var(--border)',
                background: 'var(--bg)', padding: '1rem',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem',
                }}>
                  <span style={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>
                    All Time
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                    since {fmtDate(ATTENDANCE_CUTOFF)}
                  </span>
                  {noShowsAll.length > 0 && (
                    <span style={{ ...pillStyle('#9ca3af') }}>{noShowsAll.length}</span>
                  )}
                </div>
                {noShowsAll.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>No absences recorded.</p>
                ) : (
                  noShowsAll.map(v => (
                    <NoShowRow
                      key={v.id}
                      v={v}
                      isHigh={v.count >= 3}
                      onNameClick={setDrawerPerson}
                    />
                  ))
                )}
              </div>

            </div>
          )}
        </div>

        {/* ── 3. Repeat Late (collapsible) ────────────────────── */}
        <div style={card}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: lateOpen && latePeople.length > 0 ? '1rem' : 0,
          }}>
            <button onClick={() => setLateOpen(s => !s)} style={collapseBtn}>
              <Chevron open={lateOpen} />
              <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)' }}>Repeat Late Arrivals</span>
              {latePeople.length > 0 && (
                <span style={{ ...pillStyle('#92a6b9') }}>{latePeople.length}</span>
              )}
            </button>
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>≥2 times · since Mar 29</span>
          </div>
          {lateOpen && (
            latePeople.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: '0.75rem' }}>No repeat late arrivals since Mar 29.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {latePeople.map(v => {
                  const isHigh = v.count >= 4
                  return (
                    <div key={v.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.65rem 1rem', borderRadius: '8px', gap: '0.75rem', flexWrap: 'wrap',
                      background: isHigh ? 'rgba(245,158,11,0.05)' : 'var(--bg)',
                      border: `1px solid ${isHigh ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        {isHigh && (
                          <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.35)', fontWeight: 700 }}>
                            PATTERN
                          </span>
                        )}
                        <span style={{ fontWeight: isHigh ? 700 : 500, fontSize: '0.9rem', color: isHigh ? '#f59e0b' : 'var(--text)' }}>{v.name}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.85rem', fontWeight: 700, color: isHigh ? '#f59e0b' : 'var(--muted)' }}>
                          {v.count}× late
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>avg {v.avgLate}m</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>

        {/* ── 4. Volunteer Hours by Period (data reporting) ───── */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <button onClick={() => setTopOpen(s => !s)} style={collapseBtn}>
                <Chevron open={topOpen} />
                <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)' }}>Volunteer Hours Report</span>
              </button>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginLeft: '1.6rem' }}>
                Hours logged per volunteer for the selected period
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={topCount} onChange={e => setTopCount(Number(e.target.value))} style={sel}>
                {TOP_COUNT_OPTIONS.map(n => <option key={n} value={n}>Show {n}</option>)}
              </select>
              <select value={topMonth} onChange={e => setTopMonth(Number(e.target.value))} disabled={topYear === 0} style={{ ...sel, opacity: topYear === 0 ? 0.4 : 1 }}>
                {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <select value={topYear} onChange={e => setTopYear(Number(e.target.value))} style={sel}>
                {YEARS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
              </select>
              <select value={topAff} onChange={e => setTopAff(e.target.value)} style={sel}>
                {AFFILIATIONS.map(a => <option key={a} value={a}>{a === 'All' ? 'All affiliations' : a === 'provider' ? 'Clinical Care Volunteer' : a}</option>)}
              </select>
            </div>
          </div>
          {topOpen && (
            <div style={{ marginTop: '1.25rem' }}>
              {topHours.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No hours recorded for this period.</p>
              ) : (
                <>
                  {/* Column headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 60px', gap: '0.5rem', padding: '0.25rem 1rem', marginBottom: '0.25rem' }}>
                    {['#', 'Volunteer', 'Hours'].map(h => (
                      <span key={h} style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: h === 'Hours' ? 'right' : 'left' }}>{h}</span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {topHours.map((v, i) => {
                      const maxHrs = parseFloat(topHours[0]?.hours || 1)
                      const pct = Math.round((parseFloat(v.hours) / maxHrs) * 100)
                      return (
                        <div key={v.id} style={{ padding: '0.6rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.75rem', color: 'var(--muted)', width: '20px', textAlign: 'right' }}>{i + 1}</span>
                              <span style={{ fontWeight: 500, fontSize: '0.88rem', color: 'var(--text)' }}>{v.name}</span>
                            </div>
                            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)' }}>
                              {v.hours}h
                            </span>
                          </div>
                          <div style={{ height: '4px', borderRadius: '2px', background: 'var(--border)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: 'rgba(2,65,107,0.45)', borderRadius: '2px', transition: 'width 0.4s ease' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── 5. Missing Profile Info (collapsible) ───────────── */}
        <div style={card}>
          <button
            onClick={() => setMissingOpen(s => !s)}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'DM Sans, sans-serif' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Chevron open={missingOpen} />
              <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)' }}>Missing Profile Information</span>
              {missingInfo.length > 0 && (
                <span style={{ ...pillStyle('#9ca3af'), fontWeight: 600 }}>{missingInfo.length}</span>
              )}
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
              missionaries: sma · students: school · all: birthday
            </span>
          </button>
          {missingOpen && (
            <div style={{ marginTop: '1.25rem' }}>
              {missingInfo.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>All volunteers have complete profile information.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px', gap: '0.5rem', padding: '0.35rem 1rem' }}>
                    {['Name','SMA','School','Birthday'].map(h => (
                      <span key={h} style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
                    ))}
                  </div>
                  {missingInfo.map(v => (
                    <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px', gap: '0.5rem', padding: '0.55rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>{v.name}</span>
                        {v.affiliation && (
                          <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', color: 'var(--muted)', fontStyle: 'italic' }}>{v.affiliation === 'provider' ? 'Clinical Care Volunteer' : v.affiliation}</span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.75rem', ...(v.smaNA ? { color: 'var(--muted)', fontStyle: 'italic' } : v.missingSma ? { color: '#ef4444', fontWeight: 600 } : { color: '#4ade80' }) }}>
                        {v.smaNA ? 'N/A' : v.missingSma ? 'Missing' : '✓'}
                      </span>
                      <span style={{ fontSize: '0.75rem', ...(v.schoolNA ? { color: 'var(--muted)', fontStyle: 'italic' } : v.missingSchool ? { color: '#ef4444', fontWeight: 600 } : { color: '#4ade80' }) }}>
                        {v.schoolNA ? 'N/A' : v.missingSchool ? 'Missing' : '✓'}
                      </span>
                      <span style={{ fontSize: '0.75rem', ...(v.missingBirthday ? { color: '#ef4444', fontWeight: 600 } : { color: '#4ade80' }) }}>
                        {v.missingBirthday ? 'Missing' : '✓'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </>
  )
}