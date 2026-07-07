'use client'

import { useState, useEffect, useCallback, useMemo, Component } from 'react'
import { supabase } from '../../lib/supabase'
import { getMountainNow, formatMountain, formatDate, formatTime, asUTC } from '../../lib/timeUtils'

export const dynamic = 'force-dynamic'

// ── Shared style objects ─────────────────────────────────────────────────────
const S = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '1.5rem',
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

const SHIFT_TIMES = ['10-2', '2-6']

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const STATUS_STYLE = {
  clocked_in:     { label: 'Clocked In',     color: 'var(--accent)', bg: 'rgba(2,65,107,0.06)',  border: 'rgba(2,65,107,0.3)' },
  not_clocked_in: { label: 'Not Clocked In', color: '#ef4444',       bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.3)' },
  called_out:     { label: 'Called Out',     color: '#ef4444',       bg: 'rgba(239,68,68,0.04)', border: 'rgba(239,68,68,0.2)' },
  covered:        { label: 'Covered',        color: '#60a5fa',       bg: 'rgba(96,165,250,0.06)',border: 'rgba(96,165,250,0.3)' },
}

const ATTENDANCE_STATUS_STYLE = {
  present: { label: 'Present', color: 'var(--accent)' },
  late:    { label: 'Late',    color: '#f59e0b' },
  absent:  { label: 'Absent',  color: '#ef4444' },
  excused: { label: 'Excused', color: '#60a5fa' },
}

// ── Pure helpers (ported from Live.js so this page has no cross-file deps) ──

// Returns which occurrence (1–5) of a given weekday this date is within its month.
function weekOfMonthOccurrence(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const target = d.getDay()
  let count = 0
  const check = new Date(d.getFullYear(), d.getMonth(), 1)
  while (check <= d) {
    if (check.getDay() === target) count++
    check.setDate(check.getDate() + 1)
  }
  return count
}

function isActiveThisWeek(dateStr, week_pattern) {
  if (!week_pattern || week_pattern === 'every') return true
  const occurrence = weekOfMonthOccurrence(dateStr)
  if (week_pattern === 'odd')  return occurrence % 2 === 1
  if (week_pattern === 'even') return occurrence % 2 === 0
  return true
}

function getCurrentShiftInfo() {
  const todayMtnStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
  const mtnNow      = getMountainNow()
  const dayIndex    = mtnNow.getDay()
  const isWeekday   = dayIndex >= 1 && dayIndex <= 5
  const h           = mtnNow.getHours() + mtnNow.getMinutes() / 60
  const currentShift = h >= 10 && h < 14 ? '10-2' : h >= 14 && h < 18 ? '2-6' : null
  const currentDay   = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dayIndex]
  return { todayMtnStr, mtnNow, dayIndex, isWeekday, currentShift, currentDay }
}

// Builds one row per missionary scheduled today, across both shifts, with
// their current status (clocked in / not / called out / covered).
function buildTodaysScheduleRows({ schedule, callouts, activeShifts, missionaries, todayMtnStr, currentDay }) {
  const clockedInIds = new Set(activeShifts.map(s => s.volunteer_id).filter(Boolean))
  const todaysCallouts = callouts.filter(c => c.callout_date === todayMtnStr && c.status !== 'denied')

  const rows = []
  SHIFT_TIMES.forEach(shiftTime => {
    const scheduled = schedule.filter(s =>
      s.day_of_week === currentDay &&
      s.shift_time  === shiftTime &&
      (!s.start_date || s.start_date <= todayMtnStr) &&
      (!s.end_date   || s.end_date   >= todayMtnStr) &&
      isActiveThisWeek(todayMtnStr, s.week_pattern)
    )
    scheduled.forEach(s => {
      const vol = missionaries.find(m => m.id === s.volunteer_id)
      if (!vol) return
      const calloutMatch = todaysCallouts.find(c => c.volunteer_id === s.volunteer_id && c.shift_time === shiftTime && c.status === 'approved')
      let status
      if (calloutMatch) status = calloutMatch.covered_by ? 'covered' : 'called_out'
      else status = clockedInIds.has(s.volunteer_id) ? 'clocked_in' : 'not_clocked_in'
      rows.push({
        key: `${s.volunteer_id}-${shiftTime}`,
        id: s.volunteer_id,
        full_name: vol.full_name,
        shift_time: shiftTime,
        role: s.role || '—',
        notes: s.notes || null,
        status,
      })
    })
  })
  return rows
}

// Generic paginated fetch (handles tables larger than one page).
async function fetchAllRows(table, buildQuery, pageSize = 1000) {
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

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusPill({ status }) {
  const st = STATUS_STYLE[status] || STATUS_STYLE.not_clocked_in
  return (
    <span style={{
      fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.55rem', borderRadius: '100px',
      color: st.color, background: st.bg, border: `1px solid ${st.border}`, whiteSpace: 'nowrap',
    }}>
      {st.label}
    </span>
  )
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p style={S.label}>{label}</p>
      <p style={{ fontSize: '0.95rem', color: value ? 'var(--text)' : 'var(--muted)', fontStyle: value ? 'normal' : 'italic' }}>
        {value || 'Not set'}
      </p>
    </div>
  )
}

function AttendanceSummary({ records, loading }) {
  const counts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0, excused: 0, other: 0 }
    records.forEach(r => {
      if (c[r.status] !== undefined) c[r.status]++
      else c.other++
    })
    return c
  }, [records])

  const total = records.length
  const rate = total > 0 ? Math.round(((total - counts.absent) / total) * 100) : null

  const [showAll, setShowAll] = useState(false)
  const visibleRecords = showAll ? records : records.slice(0, 8)

  if (loading) {
    return <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading attendance…</p>
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.6rem', marginBottom: '1.25rem' }}>
        <StatBox label="Total Shifts" value={total} color="var(--text)" />
        <StatBox label="Present" value={counts.present} color={ATTENDANCE_STATUS_STYLE.present.color} />
        <StatBox label="Late" value={counts.late} color={ATTENDANCE_STATUS_STYLE.late.color} />
        <StatBox label="Absent" value={counts.absent} color={ATTENDANCE_STATUS_STYLE.absent.color} />
        <StatBox label="Excused" value={counts.excused} color={ATTENDANCE_STATUS_STYLE.excused.color} />
        <StatBox label="Attendance Rate" value={rate === null ? '—' : `${rate}%`} color="var(--text)" />
      </div>

      {total === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No attendance records found.</p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {visibleRecords.map((r, i) => {
              const st = ATTENDANCE_STATUS_STYLE[r.status] || { label: r.status || 'Unknown', color: 'var(--muted)' }
              return (
                <div key={`${r.shift_date}-${r.shift_time}-${i}`} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.55rem 0.85rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)',
                }}>
                  <div>
                    <p style={{ fontWeight: 500, fontSize: '0.88rem' }}>{formatDate ? formatDate(r.shift_date) : r.shift_date}</p>
                    <p style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                      {r.shift_time || '—'}{r.role ? ` · ${r.role}` : ''}
                      {r.status === 'late' && r.late_minutes ? ` · ${r.late_minutes}m late` : ''}
                    </p>
                  </div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: st.color }}>{st.label}</span>
                </div>
              )
            })}
          </div>
          {records.length > 8 && (
            <button
              onClick={() => setShowAll(a => !a)}
              style={{
                marginTop: '0.85rem', width: '100%', padding: '0.6rem', background: 'none',
                border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)',
                fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              }}
            >
              {showAll ? 'Show less' : `Show all ${records.length} records`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function StatBox({ label, value, color }) {
  return (
    <div style={{ padding: '0.65rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)' }}>
      <p style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>{label}</p>
      <p style={{ fontFamily: 'DM Mono, monospace', fontSize: '1.1rem', fontWeight: 700, color }}>{value}</p>
    </div>
  )
}

// ── Live tab ─────────────────────────────────────────────────────────────────

function LiveTab({ schedule, callouts, activeShifts, missionaries, onOpenMissionary }) {
  const { todayMtnStr, isWeekday, currentShift, currentDay } = useMemo(() => getCurrentShiftInfo(), [])

  const rows = useMemo(
    () => buildTodaysScheduleRows({ schedule, callouts, activeShifts, missionaries, todayMtnStr, currentDay }),
    [schedule, callouts, activeShifts, missionaries, todayMtnStr, currentDay]
  )

  const notClockedInNow = rows.filter(r => r.shift_time === currentShift && r.status === 'not_clocked_in')
  const todaysCallouts = callouts.filter(c => c.callout_date === todayMtnStr && c.status !== 'denied')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Not clocked in banner */}
      {isWeekday && currentShift && (
        <div style={{
          ...S.card,
          borderColor: notClockedInNow.length > 0 ? '#ef4444' : 'rgba(2,65,107,0.4)',
          background:  notClockedInNow.length > 0 ? 'rgba(239,68,68,0.03)' : 'rgba(2,65,107,0.03)',
        }}>
          <h2 style={{ fontWeight: 600, marginBottom: notClockedInNow.length > 0 ? '1rem' : 0, fontSize: '1rem' }}>
            {notClockedInNow.length > 0
              ? `${notClockedInNow.length} missionar${notClockedInNow.length !== 1 ? 'ies' : 'y'} not yet clocked in — ${currentDay} ${currentShift}`
              : `All expected missionaries clocked in — ${currentDay} ${currentShift}`}
          </h2>
          {notClockedInNow.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {notClockedInNow.map(r => (
                <div
                  key={r.key}
                  onClick={() => onOpenMissionary(r.id)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.06)', borderRadius: '8px',
                    border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer',
                  }}
                >
                  <span style={{ fontWeight: 500, fontSize: '0.9rem', color: '#ef4444' }}>{r.full_name}</span>
                  {r.notes && <span style={{ fontSize: '0.78rem', color: '#60a5fa', fontStyle: 'italic' }}>({r.notes})</span>}
                  <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{r.role}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Today's full schedule */}
      <div style={S.card}>
        <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Today's Schedule</h2>
        {rows.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No missionaries scheduled today.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {SHIFT_TIMES.map(shiftTime => {
              const shiftRows = rows.filter(r => r.shift_time === shiftTime)
              if (shiftRows.length === 0) return null
              return (
                <div key={shiftTime}>
                  <p style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0.5rem 0 0.4rem' }}>
                    {shiftTime} Shift
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {shiftRows.map(r => (
                      <div
                        key={r.key}
                        onClick={() => onOpenMissionary(r.id)}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem',
                          padding: '0.65rem 0.9rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{r.full_name}</span>
                          <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{r.role}</span>
                          {r.notes && <span style={{ fontSize: '0.78rem', color: '#60a5fa', fontStyle: 'italic' }}>({r.notes})</span>}
                        </div>
                        <StatusPill status={r.status} />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Currently clocked in */}
      <div style={S.card}>
        <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Currently Clocked In</h2>
        {activeShifts.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No one is currently clocked in.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {activeShifts.map(s => (
              <div
                key={s.id}
                onClick={() => onOpenMissionary(s.volunteer_id)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.75rem 1rem', background: 'rgba(2,65,107,0.05)', borderRadius: '8px',
                  border: '1px solid var(--accent)', cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />
                  <span style={{ fontWeight: 500 }}>{s.profiles?.full_name}</span>
                </div>
                <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Since {formatMountain(s.clock_in)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Today's call-outs */}
      {todaysCallouts.length > 0 && (
        <div style={S.card}>
          <h2 style={{ fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>Today's Call-Outs</span>
            <span style={{ padding: '0.15rem 0.55rem', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 600, border: '1px solid rgba(96,165,250,0.3)' }}>
              {todaysCallouts.length}
            </span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {todaysCallouts.map(c => {
              const isCovered = c.status === 'approved' && c.covered_by
              const isOpen    = c.status === 'approved' && !c.covered_by
              return (
                <div
                  key={c.id}
                  onClick={() => onOpenMissionary(c.volunteer_id)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem',
                    padding: '0.6rem 0.9rem', cursor: 'pointer',
                    background: isCovered ? 'rgba(2,65,107,0.04)' : isOpen ? 'rgba(239,68,68,0.04)' : 'rgba(96,165,250,0.05)',
                    borderRadius: '8px',
                    border: `1px solid ${isCovered ? 'rgba(2,65,107,0.25)' : isOpen ? 'rgba(239,68,68,0.25)' : 'rgba(96,165,250,0.3)'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.profiles?.full_name}</span>
                    {c.shift_time && (
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', padding: '0.15rem 0.5rem', borderRadius: '6px', border: '1px solid rgba(96,165,250,0.3)' }}>
                        {c.shift_time}
                      </span>
                    )}
                    {c.reason && <span style={{ fontSize: '0.82rem', color: 'var(--muted)', fontStyle: 'italic' }}>{c.reason}</span>}
                  </div>
                  <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '100px', fontWeight: 600, background: isCovered ? 'rgba(2,65,107,0.1)' : isOpen ? 'rgba(239,68,68,0.08)' : 'rgba(96,165,250,0.1)', color: isCovered ? 'var(--accent)' : isOpen ? '#ef4444' : '#60a5fa', border: `1px solid ${isCovered ? 'rgba(2,65,107,0.3)' : isOpen ? 'rgba(239,68,68,0.25)' : 'rgba(96,165,250,0.3)'}` }}>
                    {isCovered ? 'covered' : isOpen ? 'open' : 'pending'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Missionaries tab ─────────────────────────────────────────────────────────

function MissionariesListView({ missionaries, search, setSearch, onSelect }) {
  const filtered = missionaries.filter(m =>
    (m.full_name || '').toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div style={S.card}>
      <h2 style={{ fontWeight: 600, marginBottom: '1rem' }}>Active Missionaries</h2>
      <input
        type="text"
        placeholder="Search by name…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', padding: '0.7rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: '8px', color: 'var(--text)', fontSize: '0.9rem', outline: 'none',
          fontFamily: 'DM Sans, sans-serif', marginBottom: '1.1rem',
        }}
      />
      {filtered.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No missionaries found.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(m => (
            <div
              key={m.id}
              onClick={() => onSelect(m.id)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px',
                border: '1px solid var(--border)', cursor: 'pointer',
              }}
            >
              <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{m.full_name}</span>
              {m.sma_name && <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>SMA: {m.sma_name}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Collapsible card — closed by default, calls onFirstOpen exactly once the
// first time it's expanded so callers can lazy-load their data.
// Closed by default. Children are only mounted once opened, so any data
// fetching a child does in its own effect is naturally lazy-loaded.
function CollapsibleCard({ title, children }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)' }}>{title}</span>
        <span style={{ color: 'var(--muted)', fontSize: '1.1rem', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: '0 1.25rem 1.25rem' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function MonthlyHoursBreakdown({ volunteerId }) {
  const [loading, setLoading] = useState(false)
  const [months, setMonths] = useState(null)

  async function load() {
    setLoading(true)
    const rows = await fetchAllRows('shifts', (q) =>
      q.select('clock_in, clock_out')
        .eq('volunteer_id', volunteerId)
        .not('clock_out', 'is', null)
    )
    const byMonth = {}
    ;(rows || []).forEach(r => {
      const start = asUTC(r.clock_in)
      const end   = asUTC(r.clock_out)
      if (!start || !end) return
      const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
      if (!byMonth[key]) byMonth[key] = { hours: 0, count: 0, year: start.getFullYear(), month: start.getMonth() }
      byMonth[key].hours += (end - start) / 3600000
      byMonth[key].count += 1
    })
    const list = Object.entries(byMonth)
      .map(([key, v]) => ({ key, hours: +v.hours.toFixed(1), count: v.count, year: v.year, month: v.month }))
      .sort((a, b) => b.key.localeCompare(a.key))
    setMonths(list)
    setLoading(false)
  }

  useEffect(() => { load() }, [volunteerId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || months === null) {
    return <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading hours…</p>
  }
  if (months.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No completed shifts on record.</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {months.map(m => (
        <div key={m.key} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.6rem 0.9rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)',
        }}>
          <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{MONTH_NAMES[m.month]} {m.year}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{m.count} shift{m.count !== 1 ? 's' : ''}</span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent)' }}>{m.hours}h</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function Last30DaysShifts({ volunteerId }) {
  const [loading, setLoading] = useState(false)
  const [shifts, setShifts] = useState(null)

  async function load() {
    setLoading(true)
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const rows = await fetchAllRows('shifts', (q) =>
      q.select('id, clock_in, clock_out, role')
        .eq('volunteer_id', volunteerId)
        .gte('clock_in', cutoff)
        .order('clock_in', { ascending: false })
    )
    setShifts(rows || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [volunteerId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || shifts === null) {
    return <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading shifts…</p>
  }
  if (shifts.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No shifts in the last 30 days.</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {shifts.map(s => {
        const start = asUTC(s.clock_in)
        const end   = asUTC(s.clock_out)
        const hours = start && end ? ((end - start) / 3600000).toFixed(1) + 'h' : 'In progress'
        return (
          <div key={s.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '0.6rem 0.9rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)',
          }}>
            <div>
              <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>{formatDate(s.clock_in)}</p>
              <p style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                {formatTime(s.clock_in)} → {s.clock_out ? formatTime(s.clock_out) : '—'}{s.role ? ` · ${s.role}` : ''}
              </p>
            </div>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.9rem', color: end ? 'var(--accent)' : 'var(--warn)' }}>{hours}</span>
          </div>
        )
      })}
    </div>
  )
}

function MissionaryDetailView({ missionary, attendanceRecords, attendanceLoading, onBack }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <button
        onClick={onBack}
        style={{
          alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--muted)',
          fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', padding: 0,
          display: 'flex', alignItems: 'center', gap: '0.35rem',
        }}
      >
        ← Back to Missionaries
      </button>

      <div style={S.card}>
        <h2 style={{ fontWeight: 600, marginBottom: '1.25rem', fontSize: '1.1rem' }}>{missionary.full_name}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
          <InfoRow label="Email" value={missionary.email} />
          <InfoRow label="Phone Number" value={missionary.phone} />
          <InfoRow label="SMA" value={missionary.sma_name} />
          <InfoRow label="SMA Contact Information" value={missionary.sma_contact} />
        </div>
      </div>

      <div style={S.card}>
        <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Volunteer Attendance Summary</h2>
        <AttendanceSummary records={attendanceRecords} loading={attendanceLoading} />
      </div>

      <CollapsibleCard title="Hours by Month">
        <MonthlyHoursBreakdown volunteerId={missionary.id} />
      </CollapsibleCard>

      <CollapsibleCard title="Shifts in the Last 30 Days">
        <Last30DaysShifts volunteerId={missionary.id} />
      </CollapsibleCard>
    </div>
  )
}

// ── Debug error boundary ─────────────────────────────────────────────────────
class DebugErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('[OSSMPage] Render error caught by boundary:', error, info)
    this.setState({ info })
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', background: '#1a0000', color: '#ff8080', padding: '2rem', fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'pre-wrap', overflow: 'auto' }}>
          <h2 style={{ color: '#ff4d4d', marginBottom: '1rem' }}>Render error caught</h2>
          <p style={{ marginBottom: '1rem' }}>{String(this.state.error?.message || this.state.error)}</p>
          <p style={{ color: '#ffb3b3', fontSize: '0.75rem' }}>{this.state.error?.stack}</p>
          {this.state.info?.componentStack && (
            <>
              <h3 style={{ marginTop: '1.5rem', color: '#ff4d4d' }}>Component stack</h3>
              <p style={{ fontSize: '0.75rem', color: '#ffb3b3' }}>{this.state.info.componentStack}</p>
            </>
          )}
        </div>
      )
    }
    return this.props.children
  }
}

// ── Header / sidebar chrome ──────────────────────────────────────────────────

const TABS = [
  { key: 'live',         label: 'Live' },
  { key: 'missionaries', label: 'Missionaries' },
]

function DesktopHeader({ activeTab, onSelectTab, onSwitchView, onSignOut }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', padding: '0.5rem 0' }}>
      <img src="/logo2.png" alt="Logo" style={{ width: '42px', height: '42px', objectFit: 'contain' }} />
      <nav style={{ display: 'flex', alignItems: 'center', gap: '2.25rem' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => onSelectTab(t.key)}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif', fontSize: '0.95rem',
              fontWeight: activeTab === t.key ? 600 : 500,
              color: activeTab === t.key ? 'var(--text)' : 'var(--muted)',
            }}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={onSwitchView}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontFamily: 'DM Sans, sans-serif', fontSize: '0.95rem', fontWeight: 500, color: 'var(--muted)',
          }}
        >
          Switch View
        </button>
        <button
          onClick={onSignOut}
          style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: '8px',
            padding: '0.4rem 0.9rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            fontSize: '0.85rem', color: 'var(--muted)',
          }}
        >
          Sign out
        </button>
      </nav>
    </div>
  )
}

function MobileTopBar({ onOpenSidebar }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
      <img src="/logo2.png" alt="Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
      <button
        onClick={onOpenSidebar}
        aria-label="Open menu"
        style={{ background: 'none', border: 'none', padding: '0.4rem', cursor: 'pointer' }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    </div>
  )
}

function MobileSidebar({ open, onClose, activeTab, onSelectTab, onSwitchView, onSignOut }) {
  function handleItemClick(action) {
    action()
    onClose()
  }
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s ease', zIndex: 1000,
        }}
      />
      <div
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, width: '78%', maxWidth: '300px',
          background: 'var(--surface)', borderRight: '1px solid var(--border)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease', zIndex: 1001,
          display: 'flex', flexDirection: 'column', padding: '1.25rem 1rem', overflowY: 'auto',
        }}
      >
        <button
          onClick={onClose}
          style={{ alignSelf: 'flex-end', background: 'none', border: 'none', color: 'var(--muted)', fontSize: '1.3rem', cursor: 'pointer', padding: '0.25rem 0.5rem', marginBottom: '0.5rem' }}
        >
          ✕
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button
            onClick={() => handleItemClick(onSwitchView)}
            style={{
              width: '100%', textAlign: 'left', padding: '0.9rem 1rem', borderRadius: '10px',
              border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
              fontSize: '0.95rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            }}
          >
            Switch View
          </button>

          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleItemClick(() => onSelectTab(key))}
              style={{
                width: '100%', textAlign: 'left', padding: '0.9rem 1rem', borderRadius: '10px',
                border: activeTab === key ? 'none' : '1px solid var(--border)',
                background: activeTab === key ? 'var(--accent)' : 'var(--bg)',
                color: activeTab === key ? '#fff' : 'var(--text)',
                fontSize: '0.95rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              }}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => handleItemClick(onSignOut)}
            style={{
              width: '100%', textAlign: 'left', padding: '0.9rem 1rem', borderRadius: '10px',
              border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--muted)',
              fontSize: '0.95rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', marginTop: '0.5rem',
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

function OSSMPageInner() {
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('live')
  const [isMobile, setIsMobile] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Missionaries directory (shared by both tabs)
  const [missionaries, setMissionaries] = useState([])

  // Live tab data
  const [schedule, setSchedule] = useState([])
  const [callouts, setCallouts] = useState([])
  const [activeShifts, setActiveShifts] = useState([])
  const [liveLoaded, setLiveLoaded] = useState(false)

  // Missionaries tab data
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [attendanceLoading, setAttendanceLoading] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent || navigator.vendor || ''
    const isMobileUA = /android|iphone|ipad|ipod|iemobile|blackberry|opera mini|mobile/i.test(ua)
    const check = () => setIsMobile(isMobileUA || window.innerWidth < 428)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    init()
  }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) { window.location.href = '/'; return }

    const { data: mData } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, sma_name, sma_contact, affiliation, status, default_role')
      .eq('affiliation', 'missionary')
      .eq('status', 'active')
      .order('full_name')

    // OSSM staff should never show up in their own Missionaries tab, even if
    // their affiliation happens to also be 'missionary'.
    const filtered = (mData || []).filter(m => (m.default_role || '').toLowerCase() !== 'ossm')
    setMissionaries(filtered)

    setLoading(false)
  }

  const fetchLiveTab = useCallback(async () => {
    if (liveLoaded || missionaries.length === 0) return
    setLiveLoaded(true)

    const ids = missionaries.map(m => m.id)
    const todayMtnStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })

    const [{ data: sched }, { data: cos }, { data: shifts }] = await Promise.all([
      supabase
        .from('schedule')
        .select('id, day_of_week, shift_time, role, start_date, end_date, week_pattern, notes, volunteer_id')
        .in('volunteer_id', ids),
      supabase
        .from('callouts')
        .select('id, volunteer_id, callout_date, day_of_week, shift_time, role, reason, status, covered_by, profiles(full_name)')
        .eq('callout_date', todayMtnStr),
      supabase
        .from('shifts')
        .select('id, volunteer_id, clock_in, clock_out, profiles(full_name)')
        .in('volunteer_id', ids)
        .is('clock_out', null),
    ])

    setSchedule(sched || [])
    setCallouts(cos || [])
    setActiveShifts(shifts || [])
  }, [missionaries, liveLoaded])

  useEffect(() => {
    if (tab === 'live' && missionaries.length > 0) fetchLiveTab()
  }, [tab, missionaries, fetchLiveTab])

  const fetchAttendance = useCallback(async (volunteerId) => {
    setAttendanceLoading(true)
    const rows = await fetchAllRows('attendance_records', (q) =>
      q.select('volunteer_id, shift_date, shift_time, role, status, late_minutes')
        .eq('volunteer_id', volunteerId)
        .order('shift_date', { ascending: false })
    )
    setAttendanceRecords(rows || [])
    setAttendanceLoading(false)
  }, [])

  function openMissionary(id) {
    setTab('missionaries')
    setSelectedId(id)
    setAttendanceRecords([])
    fetchAttendance(id)
  }

  function selectMissionary(id) {
    setSelectedId(id)
    setAttendanceRecords([])
    fetchAttendance(id)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  function handleSwitchView() {
    window.location.href = '/volunteer'
  }

  const selectedMissionary = missionaries.find(m => m.id === selectedId) || null

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '6px' }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--muted)', animation: `bounce 1s infinite ${i * 0.15}s` }} />
        ))}
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading…</p>
      <style>{`@keyframes bounce { 0%, 100% { transform: translateY(0); opacity: 0.4; } 50% { transform: translateY(-6px); opacity: 1; } }`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: isMobile ? '2rem' : '1.5rem' }}>
      <div style={{ maxWidth: isMobile ? '600px' : '760px', margin: '0 auto' }}>

        {isMobile ? (
          <MobileTopBar onOpenSidebar={() => setSidebarOpen(true)} />
        ) : (
          <DesktopHeader activeTab={tab} onSelectTab={setTab} onSwitchView={handleSwitchView} onSignOut={handleSignOut} />
        )}

        {tab === 'live' && (
          <LiveTab
            schedule={schedule}
            callouts={callouts}
            activeShifts={activeShifts}
            missionaries={missionaries}
            onOpenMissionary={openMissionary}
          />
        )}

        {tab === 'missionaries' && (
          selectedMissionary ? (
            <MissionaryDetailView
              key={selectedMissionary.id}
              missionary={selectedMissionary}
              attendanceRecords={attendanceRecords}
              attendanceLoading={attendanceLoading}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <MissionariesListView
              missionaries={missionaries}
              search={search}
              setSearch={setSearch}
              onSelect={selectMissionary}
            />
          )
        )}

        <MobileSidebar
          open={isMobile && sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeTab={tab}
          onSelectTab={(k) => { setTab(k); setSelectedId(null) }}
          onSwitchView={handleSwitchView}
          onSignOut={handleSignOut}
        />
      </div>
    </div>
  )
}

export default function OSSMPage() {
  return (
    <DebugErrorBoundary>
      <OSSMPageInner />
    </DebugErrorBoundary>
  )
}