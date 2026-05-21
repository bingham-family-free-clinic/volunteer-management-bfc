'use client'
import { useState, useEffect } from 'react'
import { SHIFTS } from '../lib/constants'
import { getEffectiveProviders } from '../lib/scheduleUtils'

const DAYS      = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
const DAY_LABEL = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri' }

function getMountainDateStr(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
}

function getWeekDates(weekOffset = 0) {
  const today = new Date(getMountainDateStr() + 'T12:00:00')
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

export default function ProviderScheduleView({ supabase }) {
  const [weekOffset,   setWeekOffset]   = useState(0)
  const [monthOffset,  setMonthOffset]  = useState(0)
  const [viewMode,     setViewMode]     = useState('week') // 'week' | 'month'

  // Combined slot map: "date|shift" → Array<{ id, full_name, source }>
  const [slotData,   setSlotData]   = useState({})
  const [monthData,  setMonthData]  = useState({})
  const [loading,    setLoading]    = useState(false)
  const [hovered,    setHovered]    = useState(null)

  // We cache recurring rows so we don't re-fetch on every week navigation.
  const [recurringRows, setRecurringRows] = useState(null) // null = not yet loaded
  // Callouts for the currently visible date range, refreshed with each fetch.
  const [calloutsRows, setCalloutsRows]   = useState([])

  const weekDates = getWeekDates(weekOffset)
  const today     = getMountainDateStr()

  // ── Load all recurring rows once (they don't change per-week) ─────────────
  useEffect(() => {
    async function loadRecurring() {
      const { data } = await supabase
        .from('provider_recurring_schedule')
        .select('provider_id, day_of_week, shift_time, week_pattern, start_date, end_date, profiles!provider_recurring_schedule_provider_id_fkey(id, full_name)')
      setRecurringRows(data || [])
    }
    loadRecurring()
  }, [supabase])

  // ── Fetch week data whenever week offset or recurring cache changes ────────
  useEffect(() => {
    if (viewMode === 'week' && recurringRows !== null) fetchWeekData()
  }, [weekOffset, viewMode, recurringRows]) // eslint-disable-line

  // ── Fetch month data similarly ─────────────────────────────────────────────
  useEffect(() => {
    if (viewMode === 'month' && recurringRows !== null) fetchMonthData()
  }, [monthOffset, viewMode, recurringRows]) // eslint-disable-line

  /**
   * Builds the combined slot map for the visible week.
   * Fetches one-time shifts and callouts for this week's date range, then merges
   * with the cached recurring rows via getEffectiveProviders.
   * Callouts subtract called-out providers so the slot shows as open.
   */
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

    // Enumerate all weekdays in this month to build combined map
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

  // ── Month calendar helpers ────────────────────────────────────────────────
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

  const S = {
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' },
    pill: (active) => ({
      padding: '0.35rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem',
      fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
      background: active ? 'var(--accent)' : 'var(--surface)',
      color: active ? '#fff' : 'var(--muted)',
      border: active ? 'none' : '1px solid var(--border)',
    }),
  }

  // ── Coverage cell (shared between week and month views) ───────────────────
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
          cursor: count > 0 ? 'default' : 'default',
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        {/* Pip dots */}
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

        {/* Hover tooltip — shows names + source badge */}
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setViewMode('week')}  style={S.pill(viewMode === 'week')}>Week</button>
          <button onClick={() => setViewMode('month')} style={S.pill(viewMode === 'month')}>Month</button>
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
        <div style={S.card}>
          {loading ? <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Loading…</p> : (
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
          <div style={S.card}>
            {loading ? <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Loading…</p> : (
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
