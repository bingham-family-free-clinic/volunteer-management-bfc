'use client'
import { useState, useEffect, useCallback } from 'react'
import { getEffectiveProviders, getEffectiveProviderIds, recurringAppliesToDate } from '../lib/scheduleUtils'

// ── Constants ─────────────────────────────────────────────────────────────────
const SHIFTS     = ['10-2', '2-6']
const DAYS       = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
const DAY_LABEL  = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri' }
const DAY_FULL   = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday' }
const WEEK_PATTERNS = [
  { value: 'every', label: 'Every week' },
  { value: 'odd',   label: '1st & 3rd'  },
  { value: 'even',  label: '2nd & 4th'  },
]

const CRED_FIELDS = [
  { key: 'license_exp', label: 'License'   },
  { key: 'bls_exp',     label: 'BLS'       },
  { key: 'dea_exp',     label: 'DEA'       },
  { key: 'ftca_exp',    label: 'FTCA'      },
  { key: 'tb_exp',      label: 'TB'        },
]

// ── Style tokens ──────────────────────────────────────────────────────────────
const card       = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
const inputStyle = { width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box' }
const labelStyle = { display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }
const pillBtn    = (active) => ({ padding: '0.4rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: active ? 'var(--accent)' : 'var(--surface)', color: active ? '#fff' : 'var(--muted)', border: active ? 'none' : '1px solid var(--border)' })

// ── Helpers ───────────────────────────────────────────────────────────────────
function credStatus(dateStr) {
  if (!dateStr) return 'missing'
  if (dateStr === 'N/A') return 'na'
  if (dateStr === 'expired') return 'expired'
  const exp = new Date(dateStr + 'T12:00:00')
  const now  = new Date()
  const soon = new Date(); soon.setMonth(soon.getMonth() + 1)
  if (exp < now)  return 'expired'
  if (exp <= soon) return 'expiring'
  return 'ok'
}

function formatExp(dateStr) {
  if (!dateStr)              return null
  if (dateStr === 'N/A')    return 'N/A'
  if (dateStr === 'expired') return 'Expired'
  const [y, m, d] = dateStr.split('-')
  return `${m}/${d}/${y}`
}

function getMtnDateStr(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
}

function getWeekDates(weekOffset = 0) {
  const today = new Date(getMtnDateStr() + 'T12:00:00')
  const dow = today.getDay()
  const diffToMonday = dow === 0 ? -6 : 1 - dow
  const monday = new Date(today)
  monday.setDate(today.getDate() + diffToMonday + weekOffset * 7)
  return DAYS.map((day, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return {
      day,
      date:    d.toLocaleDateString('en-CA'),
      display: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dayNum:  d.getDate(),
    }
  })
}

function generateWeekdays(numWeeks = 10) {
  const days = []; const today = getMtnDateStr()
  const d = new Date(today + 'T12:00:00')
  for (let i = 0; i < numWeeks * 7; i++) {
    const idx = d.getDay()
    if (idx >= 1 && idx <= 5) {
      const names = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
      days.push({ date: d.toLocaleDateString('en-CA'), day: names[idx] })
    }
    d.setDate(d.getDate() + 1)
  }
  return days
}

function groupIntoWeeks(weekdays) {
  const weeks = []; let cur = []; let lastMon = null
  weekdays.forEach(d => {
    const dt  = new Date(d.date + 'T12:00:00')
    const mon = new Date(dt); mon.setDate(dt.getDate() - (dt.getDay() - 1))
    const monStr = mon.toLocaleDateString('en-CA')
    if (monStr !== lastMon) { if (cur.length) weeks.push(cur); cur = []; lastMon = monStr }
    cur.push(d)
  })
  if (cur.length) weeks.push(cur)
  return weeks
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CredDot({ status }) {
  const color = status === 'ok' ? '#22c55e' : status === 'expiring' ? '#f97316' : status === 'na' ? '#9ca3af' : '#ef4444'
  return (
    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} title={status} />
  )
}

function SlotPip({ count, max = 3 }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i < count ? 'var(--accent)' : 'var(--border)' }} />
      ))}
    </div>
  )
}

function CredChip({ field, value }) {
  const st = credStatus(value)
  const colors = {
    ok:       { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.35)',  text: '#22c55e' },
    expiring: { bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.4)', text: '#f97316' },
    expired:  { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.4)',  text: '#ef4444' },
    missing:  { bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.35)', text: '#ef4444' },
    na:       { bg: 'rgba(156,163,175,0.08)', border: 'rgba(156,163,175,0.35)', text: '#9ca3af' },
  }
  const c = colors[st]
  const icon = st === 'ok' ? '✓' : st === 'na' ? '—' : '!'
  return (
    <div style={{ padding: '0.55rem 0.75rem', borderRadius: '8px', border: `1px solid ${c.border}`, background: c.bg, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
      <p style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{field.label}</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem' }}>
        <p style={{ fontFamily: (st === 'missing' || st === 'na') ? 'DM Sans, sans-serif' : 'DM Mono, monospace', fontSize: '0.8rem', fontWeight: (st === 'missing' || st === 'na') ? 400 : 600, color: c.text, fontStyle: (st === 'missing' || st === 'na') ? 'italic' : 'normal' }}>
          {st === 'missing' ? 'Not set' : formatExp(value)}
        </p>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: c.text }}>{icon}</span>
      </div>
      {(st === 'expired' || st === 'expiring') && (
        <p style={{ fontSize: '0.62rem', fontWeight: 700, color: c.text, textTransform: 'uppercase' }}>
          {st === 'expired' ? 'EXPIRED' : 'EXP. SOON'}
        </p>
      )}
    </div>
  )
}

// ── Provider Schedule View — uses scheduleUtils for combined one-time + recurring ──
function ProviderScheduleView({ supabase }) {
  const [weekOffset,    setWeekOffset]    = useState(0)
  const [monthOffset,   setMonthOffset]   = useState(0)
  const [viewMode,      setViewMode]      = useState('week') // 'week' | 'month'
  const [slotData,      setSlotData]      = useState({})     // "date|shift" → Array<{id,full_name,source}>
  const [monthData,     setMonthData]     = useState({})
  const [loading,       setLoading]       = useState(false)
  const [hovered,       setHovered]       = useState(null)
  const [recurringRows, setRecurringRows] = useState(null)   // null = not yet loaded
  const [calloutsRows,  setCalloutsRows]  = useState([])     // callouts for visible range

  const today     = getMtnDateStr()
  const weekDates = getWeekDates(weekOffset)

  // Load all recurring rows once
  useEffect(() => {
    async function loadRecurring() {
      const { data } = await supabase
        .from('provider_recurring_schedule')
        .select('provider_id, day_of_week, shift_time, week_pattern, start_date, end_date, profiles!provider_recurring_schedule_provider_id_fkey(id, full_name)')
      setRecurringRows(data || [])
    }
    loadRecurring()
  }, [supabase])

  // Fetch week data whenever offset or recurring cache changes
  useEffect(() => {
    if (viewMode === 'week' && recurringRows !== null) fetchWeekData()
  }, [weekOffset, viewMode, recurringRows]) // eslint-disable-line

  // Fetch month data similarly
  useEffect(() => {
    if (viewMode === 'month' && recurringRows !== null) fetchMonthData()
  }, [monthOffset, viewMode, recurringRows]) // eslint-disable-line

  async function fetchWeekData() {
    setLoading(true)
    const from = weekDates[0].date
    const to   = weekDates[weekDates.length - 1].date

    const [{ data: oneTime }, { data: callouts }] = await Promise.all([
      supabase
        .from('provider_shifts')
        .select('shift_date, shift_time, provider_id, profiles(id, full_name)')
        .gte('shift_date', from)
        .lte('shift_date', to),
      supabase
        .from('provider_callouts')
        .select('provider_id, shift_date, shift_time')
        .gte('shift_date', from)
        .lte('shift_date', to),
    ])

    const co = callouts || []
    setCalloutsRows(co)

    const map = {}
    for (const { date } of weekDates) {
      for (const shift of SHIFTS) {
        const providers = getEffectiveProviders(date, shift, oneTime || [], recurringRows || [], co)
        if (providers.length > 0) map[`${date}|${shift}`] = providers
      }
    }
    setSlotData(map)
    setLoading(false)
  }

  async function fetchMonthData() {
    setLoading(true)
    const now    = new Date()
    const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
    const from   = target.toLocaleDateString('en-CA')
    const to     = new Date(target.getFullYear(), target.getMonth() + 1, 0).toLocaleDateString('en-CA')

    const [{ data: oneTime }, { data: callouts }] = await Promise.all([
      supabase
        .from('provider_shifts')
        .select('shift_date, shift_time, provider_id, profiles(id, full_name)')
        .gte('shift_date', from)
        .lte('shift_date', to),
      supabase
        .from('provider_callouts')
        .select('provider_id, shift_date, shift_time')
        .gte('shift_date', from)
        .lte('shift_date', to),
    ])

    const co = callouts || []
    setCalloutsRows(co)

    const map = {}
    const d   = new Date(from + 'T12:00:00')
    const end = new Date(to   + 'T12:00:00')
    while (d <= end) {
      const dow = d.getDay()
      if (dow >= 1 && dow <= 5) {
        const dateStr = d.toLocaleDateString('en-CA')
        for (const shift of SHIFTS) {
          const providers = getEffectiveProviders(dateStr, shift, oneTime || [], recurringRows || [], co)
          if (providers.length > 0) map[`${dateStr}|${shift}`] = providers
        }
      }
      d.setDate(d.getDate() + 1)
    }
    setMonthData(map)
    setLoading(false)
  }

  function getMonthCalendarDays() {
    const now    = new Date()
    const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
    const year   = target.getFullYear()
    const month  = target.getMonth()
    const firstDow    = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const startPad    = firstDow === 0 ? 6 : firstDow - 1
    const cells = []
    for (let i = 0; i < startPad; i++) cells.push(null)
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day)
      const dow  = date.getDay()
      cells.push({
        date: date.toLocaleDateString('en-CA'),
        day:  ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dow],
        num:  day,
        isWeekend: dow === 0 || dow === 6,
      })
    }
    return { cells, label: target.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }
  }

  // Coverage cell shared between week and month views
  function CoverageCell({ cellKey, slim = false }) {
    const data      = (viewMode === 'week' ? slotData : monthData)[cellKey] || []
    const count     = data.length
    const isHovered = hovered === cellKey
    const isEmpty   = count === 0
    const isFull    = count >= 3

    return (
      <div
        onMouseEnter={() => setHovered(cellKey)}
        onMouseLeave={() => setHovered(null)}
        style={{
          position: 'relative',
          padding: slim ? '0.3rem 0.25rem' : '0.5rem 0.35rem',
          borderRadius: '8px',
          border: `1px solid ${isFull ? 'rgba(2,65,107,0.4)' : isEmpty ? 'var(--border)' : 'rgba(2,65,107,0.25)'}`,
          background: isFull ? 'rgba(2,65,107,0.1)' : isEmpty ? 'transparent' : 'rgba(2,65,107,0.05)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
          minHeight: slim ? '36px' : '52px',
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        <div style={{ display: 'flex', gap: '3px' }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ width: slim ? '5px' : '6px', height: slim ? '5px' : '6px', borderRadius: '50%', background: i < count ? 'var(--accent)' : 'var(--border)' }} />
          ))}
        </div>
        {!slim && (
          <span style={{ fontSize: '0.62rem', fontFamily: 'DM Mono, monospace', color: isEmpty ? 'var(--border)' : 'var(--accent)', fontWeight: isEmpty ? 400 : 600 }}>
            {count}/3
          </span>
        )}

        {/* Tooltip — shows name + recurring badge */}
        {isHovered && count > 0 && (
          <div style={{
            position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: '8px',
            padding: '0.5rem 0.75rem', zIndex: 50, minWidth: '160px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)', pointerEvents: 'none',
          }}>
            {data.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.2rem' }}>
                <p style={{ fontSize: '0.78rem', color: 'var(--text)', fontWeight: 500, whiteSpace: 'nowrap' }}>{p.full_name}</p>
                {p.source === 'recurring' && (
                  <span style={{ fontSize: '0.62rem', padding: '0.05rem 0.3rem', borderRadius: '4px', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)', whiteSpace: 'nowrap' }}>↻</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* View mode + navigation controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setViewMode('week')}  style={pillBtn(viewMode === 'week')}>Week</button>
          <button onClick={() => setViewMode('month')} style={pillBtn(viewMode === 'month')}>Month</button>
        </div>

        {viewMode === 'week' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button onClick={() => setWeekOffset(o => o - 1)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.3rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>←</button>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', minWidth: '160px', textAlign: 'center' }}>
              {weekDates[0]?.display} – {weekDates[4]?.display}
              {weekOffset === 0 && <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 500 }}>This week</span>}
            </span>
            <button onClick={() => setWeekOffset(o => o + 1)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.3rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>→</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button onClick={() => setMonthOffset(o => o - 1)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.3rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>←</button>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', minWidth: '140px', textAlign: 'center' }}>{getMonthCalendarDays().label}</span>
            <button onClick={() => setMonthOffset(o => o + 1)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.3rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>→</button>
          </div>
        )}
      </div>

      {/* Week grid */}
      {viewMode === 'week' && (
        <div>
          {loading ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>Loading schedule…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '70px repeat(5, 1fr)', gap: '0.4rem', marginBottom: '0.25rem' }}>
                <div />
                {weekDates.map(d => (
                  <div key={d.date} style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{DAY_LABEL[d.day]}</p>
                    <p style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.9rem', fontWeight: 700, color: d.date === today ? 'var(--accent)' : 'var(--text)' }}>{d.dayNum}</p>
                  </div>
                ))}
              </div>

              {/* Shift rows */}
              {SHIFTS.map(shift => (
                <div key={shift} style={{ display: 'grid', gridTemplateColumns: '70px repeat(5, 1fr)', gap: '0.4rem', alignItems: 'center' }}>
                  <p style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600 }}>{shift}</p>
                  {weekDates.map(d => <CoverageCell key={d.date} cellKey={`${d.date}|${shift}`} />)}
                </div>
              ))}

              {/* Legend */}
              <div style={{ display: 'flex', gap: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                {[{ label: 'No coverage', dots: 0 }, { label: 'Partial', dots: 1 }, { label: 'Full (3/3)', dots: 3 }].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', gap: '2px' }}>
                      {[0,1,2].map(i => <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: i < item.dots ? 'var(--accent)' : 'var(--border)' }} />)}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{item.label}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.72rem', padding: '0.05rem 0.3rem', borderRadius: '4px', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>↻</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Recurring provider (hover to see names)</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Month grid */}
      {viewMode === 'month' && (() => {
        const { cells } = getMonthCalendarDays()
        return (
          <div>
            {loading ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>Loading schedule…</p>
            ) : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.35rem', marginBottom: '0.5rem' }}>
                  {['Mon','Tue','Wed','Thu','Fri'].map(d => (
                    <p key={d} style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{d}</p>
                  ))}
                </div>
                {(() => {
                  const weekdayCells = cells.filter(c => !c?.isWeekend)
                  const byWeek = {}
                  weekdayCells.forEach(c => {
                    if (!c) return
                    const d   = new Date(c.date + 'T12:00:00')
                    const mon = new Date(d); mon.setDate(d.getDate() - (d.getDay() - 1))
                    const key = mon.toLocaleDateString('en-CA')
                    if (!byWeek[key]) byWeek[key] = []
                    byWeek[key].push(c)
                  })
                  return Object.entries(byWeek).map(([weekKey, dayCells]) => (
                    <div key={weekKey} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.35rem', marginBottom: '0.35rem' }}>
                      {DAYS.map(day => {
                        const cell = dayCells.find(c => c.day === day)
                        if (!cell) return <div key={day} />
                        const isToday = cell.date === today
                        return (
                          <div key={day} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <p style={{ fontSize: '0.72rem', fontFamily: 'DM Mono, monospace', fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--accent)' : 'var(--muted)', textAlign: 'center' }}>{cell.num}</p>
                            {SHIFTS.map(shift => <CoverageCell key={shift} cellKey={`${cell.date}|${shift}`} slim />)}
                          </div>
                        )
                      })}
                    </div>
                  ))
                })()}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

// ── Credential Banner ─────────────────────────────────────────────────────────
function CredentialBanner({ providers, onSelect }) {
  const [open, setOpen] = useState(false)

  const flagged  = providers.flatMap(v => CRED_FIELDS.map(f => ({ ...f, vol: v, status: credStatus(v[f.key]) })).filter(f => f.status === 'expired' || f.status === 'missing'))
  const expiring = providers.flatMap(v => CRED_FIELDS.map(f => ({ ...f, vol: v, status: credStatus(v[f.key]) })).filter(f => f.status === 'expiring'))
  const allOk    = flagged.length === 0 && expiring.length === 0

  const borderColor = flagged.length  > 0 ? 'rgba(239,68,68,0.4)' : expiring.length > 0 ? 'rgba(249,115,22,0.4)' : 'rgba(2,65,107,0.35)'
  const bgColor     = flagged.length  > 0 ? 'rgba(239,68,68,0.04)' : expiring.length > 0 ? 'rgba(249,115,22,0.04)' : 'rgba(2,65,107,0.03)'
  const hColor      = flagged.length  > 0 ? '#ef4444' : expiring.length > 0 ? '#f97316' : 'var(--accent)'

  const issues = [...flagged, ...expiring]

  return (
    <div style={{ borderRadius: '12px', border: `1px solid ${borderColor}`, background: bgColor, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.9rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.2rem 0.6rem', borderRadius: '100px', background: `${hColor}18`, color: hColor, border: `1px solid ${hColor}44` }}>
            Credentials
          </span>
          <span style={{ fontSize: '0.85rem', color: hColor, fontWeight: 500 }}>
            {allOk
              ? `All ${providers.length} provider${providers.length !== 1 ? 's' : ''} up to date`
              : flagged.length > 0
                ? `${flagged.length} credential${flagged.length !== 1 ? 's' : ''} expired or missing`
                : `${expiring.length} credential${expiring.length !== 1 ? 's' : ''} expiring soon`}
          </span>
        </div>
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▾</span>
      </button>

      {open && (
        <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '1px solid var(--border)' }}>
          {allOk ? (
            <p style={{ paddingTop: '0.75rem', fontSize: '0.85rem', color: 'var(--muted)' }}>All credentials are current.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingTop: '0.75rem' }}>
              {issues.map((item, i) => {
                const isExp = item.status === 'expiring'
                const rc = isExp ? '#f97316' : '#ef4444'
                const rb = isExp ? 'rgba(249,115,22,0.07)' : 'rgba(239,68,68,0.07)'
                const rbr = isExp ? 'rgba(249,115,22,0.35)' : 'rgba(239,68,68,0.3)'
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.45rem 0.75rem', borderRadius: '8px', background: rb, border: `1px solid ${rbr}`, flexWrap: 'wrap', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <button
                        onClick={() => onSelect(item.vol)}
                        style={{ background: 'none', border: 'none', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', color: 'var(--text)', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '2px', fontFamily: 'DM Sans, sans-serif', padding: 0 }}
                      >
                        {item.vol.full_name}
                      </button>
                      <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.45rem', borderRadius: '6px', background: `${rc}18`, color: rc, border: `1px solid ${rc}44`, fontWeight: 600 }}>{item.label}</span>
                    </div>
                    <span style={{ fontSize: '0.78rem', fontFamily: 'DM Mono, monospace', color: rc, fontWeight: 600 }}>
                      {item.status === 'missing' ? 'Not on file' : item.status === 'expired' ? `Expired ${formatExp(item.vol[item.key])}` : `Exp. ${formatExp(item.vol[item.key])}`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Recurring slot management ─────────────────────────────────────────────────
function RecurringSlotManager({ supabase, providers, onToast }) {
  const [recurringRows, setRecurringRows] = useState([])
  const [loading, setLoading]             = useState(true)
  const [addingFor, setAddingFor]         = useState(null)
  const [form, setForm]                   = useState({ day_of_week: 'monday', shift_time: '10-2', week_pattern: 'every', start_date: '', end_date: '' })
  const [saving, setSaving]               = useState(false)
  const [removing, setRemoving]           = useState(null)
  const [filterDay, setFilterDay]         = useState('all')
  const [filterShift, setFilterShift]     = useState('all')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('provider_recurring_schedule')
      .select('id, provider_id, day_of_week, shift_time, week_pattern, start_date, end_date, assigned_by, profiles!provider_recurring_schedule_provider_id_fkey(full_name)')
      .order('day_of_week')
    setRecurringRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  async function handleAssign(e) {
    e.preventDefault()
    if (!addingFor) return
    setSaving(true)
    const { error } = await supabase.from('provider_recurring_schedule').insert({
      provider_id:  addingFor,
      day_of_week:  form.day_of_week,
      shift_time:   form.shift_time,
      week_pattern: form.week_pattern,
      start_date:   form.start_date || null,
      end_date:     form.end_date   || null,
    })
    if (error) {
      onToast(error.message.includes('unique') ? 'Provider already has that recurring slot.' : error.message, 'error')
    } else {
      onToast('Recurring slot assigned!', 'success')
      setAddingFor(null)
      setForm({ day_of_week: 'monday', shift_time: '10-2', week_pattern: 'every', start_date: '', end_date: '' })
      await load()
    }
    setSaving(false)
  }

  async function handleRemove(id) {
    setRemoving(id)
    const { error } = await supabase.from('provider_recurring_schedule').delete().eq('id', id)
    if (error) onToast(error.message, 'error')
    else { onToast('Slot removed.', 'success'); await load() }
    setRemoving(null)
  }

  const filtered = recurringRows.filter(r => {
    if (filterDay   !== 'all' && r.day_of_week !== filterDay)   return false
    if (filterShift !== 'all' && r.shift_time  !== filterShift) return false
    return true
  })

  const grouped = {}
  filtered.forEach(r => {
    const k = `${r.day_of_week}|${r.shift_time}`
    if (!grouped[k]) grouped[k] = []
    grouped[k].push(r)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Assign panel */}
      <div style={{ padding: '1rem 1.25rem', borderRadius: '10px', border: '1px solid rgba(2,65,107,0.3)', background: 'rgba(2,65,107,0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: addingFor ? '1rem' : 0 }}>
          <div>
            <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>Assign Recurring Slot</h3>
            {!addingFor && <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.15rem' }}>Select a provider below to assign a standing weekly slot.</p>}
          </div>
          {addingFor && (
            <button onClick={() => setAddingFor(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'DM Sans, sans-serif' }}>Cancel</button>
          )}
        </div>

        {!addingFor ? (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            {providers.filter(p => p.default_role === 'Provider').map(p => (
              <button
                key={p.id}
                onClick={() => setAddingFor(p.id)}
                style={{ padding: '0.35rem 0.85rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', transition: 'border-color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                {p.full_name}
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={handleAssign} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ padding: '0.5rem 0.85rem', borderRadius: '8px', background: 'rgba(2,65,107,0.1)', border: '1px solid rgba(2,65,107,0.3)', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', alignSelf: 'flex-start' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assigning</span>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--accent)' }}>
                {providers.find(p => p.id === addingFor)?.full_name}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={labelStyle}>Day</label>
                <select value={form.day_of_week} onChange={e => setForm(f => ({ ...f, day_of_week: e.target.value }))} style={inputStyle}>
                  {DAYS.map(d => <option key={d} value={d}>{DAY_FULL[d]}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Shift</label>
                <select value={form.shift_time} onChange={e => setForm(f => ({ ...f, shift_time: e.target.value }))} style={inputStyle}>
                  {SHIFTS.map(s => <option key={s} value={s}>{s === '10-2' ? '10:00 AM – 2:00 PM' : '2:00 PM – 6:00 PM'}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Frequency</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {WEEK_PATTERNS.map(wp => (
                  <button
                    key={wp.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, week_pattern: wp.value }))}
                    style={pillBtn(form.week_pattern === wp.value)}
                  >
                    {wp.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={labelStyle}>Start date <span style={{ textTransform: 'none', fontSize: '0.7rem' }}>(optional)</span></label>
                <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>End date <span style={{ textTransform: 'none', fontSize: '0.7rem' }}>(optional)</span></label>
                <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={inputStyle} />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              style={{ padding: '0.75rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}
            >
              {saving ? 'Saving…' : 'Assign Slot'}
            </button>
          </form>
        )}
      </div>

      {/* Existing slots */}
      <div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)', marginRight: '0.25rem' }}>Filter:</span>
          <select value={filterDay} onChange={e => setFilterDay(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.82rem' }}>
            <option value="all">All days</option>
            {DAYS.map(d => <option key={d} value={d}>{DAY_FULL[d]}</option>)}
          </select>
          <select value={filterShift} onChange={e => setFilterShift(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.82rem' }}>
            <option value="all">Both shifts</option>
            {SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {loading ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', fontStyle: 'italic' }}>No recurring slots match these filters.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {Object.entries(grouped)
              .sort(([a], [b]) => {
                const [da, sa] = a.split('|'); const [db, sb] = b.split('|')
                const dOrder = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4 }
                return (dOrder[da] - dOrder[db]) || sa.localeCompare(sb)
              })
              .map(([key, rows]) => {
                const [day, shift] = key.split('|')
                return (
                  <div key={key} style={{ borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.9rem', background: 'rgba(2,65,107,0.05)', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem', textTransform: 'capitalize' }}>{day}</span>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', background: 'rgba(2,65,107,0.12)', color: 'var(--accent)', padding: '0.1rem 0.45rem', borderRadius: '6px', border: '1px solid rgba(2,65,107,0.3)' }}>{shift}</span>
                      <SlotPip count={rows.length} max={3} />
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>{rows.length}/3</span>
                    </div>
                    {rows.map(r => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.9rem', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>{r.profiles?.full_name}</span>
                          {r.week_pattern !== 'every' && (
                            <span style={{ fontSize: '0.7rem', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', borderRadius: '4px', padding: '0.1rem 0.35rem', border: '1px solid rgba(96,165,250,0.3)' }}>
                              {r.week_pattern === 'odd' ? '1st & 3rd' : '2nd & 4th'}
                            </span>
                          )}
                          {(r.start_date || r.end_date) && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                              {r.start_date ?? '…'} → {r.end_date ?? '…'}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemove(r.id)}
                          disabled={removing === r.id}
                          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.82rem', padding: '0.25rem 0.4rem', fontFamily: 'DM Sans, sans-serif' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
                        >
                          {removing === r.id ? '…' : '✕'}
                        </button>
                      </div>
                    ))}
                  </div>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Provider detail card ──────────────────────────────────────────────────────
function ProviderCard({ provider, onClose }) {
  return (
    <div style={{ borderRadius: '12px', border: '1px solid rgba(125,211,252,0.4)', background: 'rgba(125,211,252,0.03)', padding: '1.25rem', position: 'relative' }}>
      <button
        onClick={onClose}
        style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
      >✕</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(2,65,107,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.3)', flexShrink: 0 }}>
          {provider.full_name?.charAt(0)}
        </div>
        <div>
          <p style={{ fontWeight: 600, fontSize: '1rem' }}>{provider.full_name}</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{provider.email}</p>
          {provider.phone && <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{provider.phone}</p>}
        </div>
      </div>

      <p style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>Credentials</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.5rem' }}>
        {CRED_FIELDS.map(f => <CredChip key={f.key} field={f} value={provider[f.key]} />)}
      </div>

      {(provider.credentials || provider.languages || provider.default_role) && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border)' }}>
          {provider.credentials && (
            <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem', borderRadius: '100px', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>{provider.credentials}</span>
          )}
          {provider.languages && (
            <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem', borderRadius: '100px', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>{provider.languages}</span>
          )}
          {provider.default_role && (
            <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem', borderRadius: '100px', background: 'rgba(2,65,107,0.1)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.3)' }}>{provider.default_role}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, subtitle, defaultOpen = true, badge, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)' }}>{title}</span>
            {badge !== undefined && badge !== null && (
              <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', fontFamily: 'DM Mono, monospace' }}>{badge}</span>
            )}
          </div>
          {subtitle && <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.1rem', textAlign: 'left' }}>{subtitle}</p>}
        </div>
        <span style={{ color: 'var(--muted)', fontSize: '1rem', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: '0 1.5rem 1.5rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ paddingTop: '1.25rem' }}>{children}</div>
        </div>
      )}
    </div>
  )
}

// ── Main Providers component ──────────────────────────────────────────────────
export default function Providers({ supabase }) {
  const [providers, setProviders]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [selectedId, setSelectedId]   = useState(null)
  const [toast, setToast]             = useState(null)
  const [scheduleTab, setScheduleTab] = useState('grid') // 'grid' | 'recurring'

  function showToast(text, type = 'success') {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, affiliation, credentials, languages, default_role, license_exp, bls_exp, dea_exp, ftca_exp, tb_exp, status')
      .eq('default_role', 'Provider')
      .order('full_name')
    setProviders((data || []).filter(v => (v.status ?? 'active') === 'active'))
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  const selectedProvider = providers.find(p => p.id === selectedId) || null

  if (loading) return <p style={{ color: 'var(--muted)', padding: '1rem' }}>Loading providers…</p>

  if (providers.length === 0) return (
    <div style={{ ...card, textAlign: 'center', color: 'var(--muted)' }}>
      <p>No active clinical care volunteers on file.</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Testing Banner */}
      <div
        style={{
          background: '#fef3c7',
          border: '1px solid #f59e0b',
          color: '#92400e',
          padding: '0.75rem 1rem',
          borderRadius: '10px',
          fontWeight: 700,
          textAlign: 'center',
          fontSize: '0.9rem',
        }}
      >
      Please Ignore — In Testing
    </div>
      
      {/* ── 1. Credential Status Banner ──────────────────────────────────── */}
      <CredentialBanner
        providers={providers}
        onSelect={p => setSelectedId(id => id === p.id ? null : p.id)}
      />

      {selectedProvider && (
        <ProviderCard
          provider={selectedProvider}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* ── 2. Schedule ──────────────────────────────────────────────────── */}
      <Section title="Provider Schedule" subtitle="Who's covering which shifts, including recurring assignments">
        {/* Sub-tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <button onClick={() => setScheduleTab('grid')}      style={pillBtn(scheduleTab === 'grid')}>Weekly Grid</button>
          <button onClick={() => setScheduleTab('recurring')} style={pillBtn(scheduleTab === 'recurring')}>Recurring Slots</button>
        </div>

        {scheduleTab === 'grid' && (
          <ProviderScheduleView supabase={supabase} />
        )}

        {scheduleTab === 'recurring' && (
          <RecurringSlotManager
            supabase={supabase}
            providers={providers}
            onToast={showToast}
          />
        )}
      </Section>

      {/* ── 3. Provider List ─────────────────────────────────────────────── */}
      <Section
        title="All Clinical Care Volunteers"
        subtitle="Active providers — click any row to expand credentials"
        badge={providers.length}
        defaultOpen={false}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {providers.map(p => {
            const credIssues = CRED_FIELDS.filter(f => { const s = credStatus(p[f.key]); return s !== 'ok' && s !== 'na' })
            const worstStatus = credIssues.some(f => { const s = credStatus(p[f.key]); return s === 'expired' || s === 'missing' })
              ? 'bad' : credIssues.length > 0 ? 'warn' : 'ok'
            const rowBorder = worstStatus === 'bad' ? 'rgba(239,68,68,0.3)' : worstStatus === 'warn' ? 'rgba(249,115,22,0.3)' : 'var(--border)'
            const isSelected = selectedId === p.id
            return (
              <div key={p.id}>
                <div
                  onClick={() => setSelectedId(id => id === p.id ? null : p.id)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.7rem 1rem', borderRadius: '10px', border: `1px solid ${isSelected ? 'var(--accent)' : rowBorder}`, background: isSelected ? 'rgba(2,65,107,0.06)' : 'var(--bg)', cursor: 'pointer', transition: 'border-color 0.15s', gap: '0.75rem' }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--accent)' }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = rowBorder }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(2,65,107,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent)', flexShrink: 0 }}>
                      {p.full_name?.charAt(0)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 500, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.full_name}</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.email}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {CRED_FIELDS.map(f => <CredDot key={f.key} status={credStatus(p[f.key])} />)}
                    </div>
                    {p.default_role && (
                      <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '100px', background: 'rgba(2,65,107,0.1)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.25)', whiteSpace: 'nowrap' }}>
                        {p.default_role}
                      </span>
                    )}
                    <span style={{ color: 'var(--muted)', fontSize: '0.85rem', transform: isSelected ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
                  </div>
                </div>

                {isSelected && (
                  <div style={{ marginTop: '0.4rem' }}>
                    <ProviderCard provider={p} onClose={() => setSelectedId(null)} />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Dot legend */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border)' }}>
          {[
            { color: '#22c55e', label: 'OK' },
            { color: '#f97316', label: 'Expiring soon' },
            { color: '#ef4444', label: 'Expired / missing' },
            { color: '#9ca3af', label: 'N/A' },
          ].map(d => (
            <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
              <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{d.label}</span>
            </div>
          ))}
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontStyle: 'italic' }}>Dots = License · BLS · DEA · FTCA · TB</span>
        </div>
      </Section>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'success' ? 'var(--accent)' : 'var(--danger)', color: toast.type === 'success' ? '#0a0f0a' : '#fff', padding: '0.75rem 1.5rem', borderRadius: '100px', fontWeight: 500, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 100, whiteSpace: 'nowrap' }}>
          {toast.text}
        </div>
      )}
    </div>
  )
}
