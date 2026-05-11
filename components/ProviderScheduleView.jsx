'use client'
import { useState, useEffect } from 'react'
import { SHIFTS } from '../../lib/constants'

const DAYS      = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
const DAY_LABEL = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri' }

function getMountainDateStr(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
}

// Generate Mon–Fri dates for a given week offset
function getWeekDates(weekOffset = 0) {
  const today = new Date(getMountainDateStr() + 'T12:00:00')
  // Find this Monday
  const dow = today.getDay() // 0=Sun
  const diffToMonday = dow === 0 ? -6 : 1 - dow
  const monday = new Date(today)
  monday.setDate(today.getDate() + diffToMonday + weekOffset * 7)

  return DAYS.map((day, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return {
      day,
      date: d.toLocaleDateString('en-CA'),
      display: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dayNum: d.getDate(),
    }
  })
}

export default function ProviderScheduleView({ supabase, providers }) {
  const [weekOffset, setWeekOffset]     = useState(0)
  const [slotData, setSlotData]         = useState({}) // "date|shift" → [{ id, full_name }]
  const [loading, setLoading]           = useState(false)
  const [hoveredCell, setHoveredCell]   = useState(null) // "date|shift"
  const [viewMode, setViewMode]         = useState('week') // 'week' | 'month'
  const [monthOffset, setMonthOffset]   = useState(0)
  const [monthData, setMonthData]       = useState({})

  const weekDates = getWeekDates(weekOffset)

  useEffect(() => {
    if (viewMode === 'week') fetchWeekData()
  }, [weekOffset, viewMode])

  useEffect(() => {
    if (viewMode === 'month') fetchMonthData()
  }, [monthOffset, viewMode])

  async function fetchWeekData() {
    setLoading(true)
    const dates = weekDates.map(d => d.date)
    const from  = dates[0]
    const to    = dates[dates.length - 1]

    const { data } = await supabase
      .from('provider_shifts')
      .select('shift_date, shift_time, provider_id, profiles(id, full_name)')
      .gte('shift_date', from)
      .lte('shift_date', to)

    const map = {}
    ;(data || []).forEach(row => {
      const key = `${row.shift_date}|${row.shift_time}`
      if (!map[key]) map[key] = []
      map[key].push({ id: row.provider_id, full_name: row.profiles?.full_name || '?' })
    })
    setSlotData(map)
    setLoading(false)
  }

  async function fetchMonthData() {
    setLoading(true)
    const now = new Date()
    const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
    const from = target.toLocaleDateString('en-CA')
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0)
    const to = lastDay.toLocaleDateString('en-CA')

    const { data } = await supabase
      .from('provider_shifts')
      .select('shift_date, shift_time, provider_id, profiles(id, full_name)')
      .gte('shift_date', from)
      .lte('shift_date', to)

    const map = {}
    ;(data || []).forEach(row => {
      const key = `${row.shift_date}|${row.shift_time}`
      if (!map[key]) map[key] = []
      map[key].push({ id: row.provider_id, full_name: row.profiles?.full_name || '?' })
    })
    setMonthData(map)
    setLoading(false)
  }

  // ── Month view helpers ────────────────────────────────────────────────────
  function getMonthCalendarDays() {
    const now = new Date()
    const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
    const year  = target.getFullYear()
    const month = target.getMonth()
    const firstDow = new Date(year, month, 1).getDay() // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    // Pad to start on Monday
    const startPad = firstDow === 0 ? 6 : firstDow - 1
    const cells = []
    for (let i = 0; i < startPad; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d)
      const dow  = date.getDay()
      // Skip weekends
      cells.push({
        date: date.toLocaleDateString('en-CA'),
        day:  ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dow],
        num:  d,
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
      color: active ? '#0a0f0a' : 'var(--muted)',
      border: active ? 'none' : '1px solid var(--border)',
    }),
  }

  function CoverageCell({ cellKey, slim = false }) {
    const providers = slotData[cellKey] || monthData[cellKey] || []
    const count     = providers.length
    const isHovered = hoveredCell === cellKey
    const isEmpty   = count === 0
    const isFull    = count >= 3

    return (
      <div
        onMouseEnter={() => setHoveredCell(cellKey)}
        onMouseLeave={() => setHoveredCell(null)}
        style={{
          position: 'relative',
          padding: slim ? '0.3rem 0.25rem' : '0.5rem 0.35rem',
          borderRadius: '8px',
          border: `1px solid ${isFull ? 'rgba(2,65,107,0.4)' : isEmpty ? 'var(--border)' : 'rgba(2,65,107,0.25)'}`,
          background: isFull
            ? 'rgba(2,65,107,0.1)'
            : isEmpty
              ? 'transparent'
              : 'rgba(2,65,107,0.05)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.2rem',
          minHeight: slim ? '36px' : '52px',
          cursor: count > 0 ? 'pointer' : 'default',
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        {/* Pip dots */}
        <div style={{ display: 'flex', gap: '3px' }}>
          {[0,1,2].map(i => (
            <div key={i} style={{
              width: slim ? '5px' : '6px',
              height: slim ? '5px' : '6px',
              borderRadius: '50%',
              background: i < count ? 'var(--accent)' : 'var(--border)',
            }} />
          ))}
        </div>
        {!slim && (
          <span style={{
            fontSize: '0.62rem',
            fontFamily: 'DM Mono, monospace',
            color: isEmpty ? 'var(--border)' : 'var(--accent)',
            fontWeight: isEmpty ? 400 : 600,
          }}>
            {count}/3
          </span>
        )}

        {/* Hover tooltip */}
        {isHovered && count > 0 && (
          <div style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--surface)',
            border: '1px solid var(--accent)',
            borderRadius: '8px',
            padding: '0.5rem 0.75rem',
            zIndex: 50,
            minWidth: '140px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            pointerEvents: 'none',
          }}>
            {providers.map(p => (
              <p key={p.id} style={{ fontSize: '0.78rem', color: 'var(--text)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                {p.full_name}
              </p>
            ))}
            {count === 0 && <p style={{ fontSize: '0.78rem', color: 'var(--muted)', fontStyle: 'italic' }}>No providers</p>}
          </div>
        )}
      </div>
    )
  }

  // ── Week view ─────────────────────────────────────────────────────────────
  const today = getMountainDateStr()
  const isCurrentWeek = weekOffset === 0 ||
    weekDates.some(d => d.date === today)

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
            <button
              onClick={() => setWeekOffset(o => o - 1)}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.3rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}
            >←</button>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', minWidth: '160px', textAlign: 'center' }}>
              {weekDates[0]?.display} – {weekDates[4]?.display}
              {weekOffset === 0 && <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 500 }}>This week</span>}
            </span>
            <button
              onClick={() => setWeekOffset(o => o + 1)}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.3rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}
            >→</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={() => setMonthOffset(o => o - 1)}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.3rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}
            >←</button>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', minWidth: '140px', textAlign: 'center' }}>
              {getMonthCalendarDays().label}
            </span>
            <button
              onClick={() => setMonthOffset(o => o + 1)}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.3rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}
            >→</button>
          </div>
        )}
      </div>

      {/* Week grid */}
      {viewMode === 'week' && (
        <div style={S.card}>
          {loading ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Loading…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '70px repeat(5, 1fr)', gap: '0.4rem', marginBottom: '0.25rem' }}>
                <div />
                {weekDates.map(d => (
                  <div key={d.date} style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{DAY_LABEL[d.day]}</p>
                    <p style={{
                      fontFamily: 'DM Mono, monospace', fontSize: '0.9rem', fontWeight: 700,
                      color: d.date === today ? 'var(--accent)' : 'var(--text)',
                    }}>{d.dayNum}</p>
                  </div>
                ))}
              </div>

              {/* Rows */}
              {SHIFTS.map(shift => (
                <div key={shift} style={{ display: 'grid', gridTemplateColumns: '70px repeat(5, 1fr)', gap: '0.4rem', alignItems: 'center' }}>
                  <p style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600 }}>{shift}</p>
                  {weekDates.map(d => (
                    <CoverageCell key={d.date} cellKey={`${d.date}|${shift}`} />
                  ))}
                </div>
              ))}

              {/* Legend */}
              <div style={{ display: 'flex', gap: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                {[
                  { label: 'No coverage', dots: 0 },
                  { label: 'Partial', dots: 1 },
                  { label: 'Full (3/3)', dots: 3 },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', gap: '2px' }}>
                      {[0,1,2].map(i => (
                        <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: i < item.dots ? 'var(--accent)' : 'var(--border)' }} />
                      ))}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{item.label}</span>
                  </div>
                ))}
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontStyle: 'italic' }}>Hover a cell to see names</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Month grid */}
      {viewMode === 'month' && (() => {
        const { cells, label } = getMonthCalendarDays()
        return (
          <div style={S.card}>
            {loading ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Loading…</p>
            ) : (
              <div>
                {/* Day headers Mon–Fri only */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.35rem', marginBottom: '0.5rem' }}>
                  {['Mon','Tue','Wed','Thu','Fri'].map(d => (
                    <p key={d} style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{d}</p>
                  ))}
                </div>

                {/* Cells — render weeks as rows, skipping weekend cells */}
                {(() => {
                  const weekdayCells = cells.filter(c => !c?.isWeekend)
                  // Chunk into rows of 5 (Mon–Fri)
                  const rows = []
                  // We need to figure out which Monday each cell starts on
                  // Group by ISO week
                  const byWeek = {}
                  weekdayCells.forEach(c => {
                    if (!c) return
                    const d = new Date(c.date + 'T12:00:00')
                    const mon = new Date(d)
                    mon.setDate(d.getDate() - (d.getDay() - 1))
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
                            <p style={{
                              fontSize: '0.72rem',
                              fontFamily: 'DM Mono, monospace',
                              fontWeight: isToday ? 700 : 400,
                              color: isToday ? 'var(--accent)' : 'var(--muted)',
                              textAlign: 'center',
                            }}>{cell.num}</p>
                            {SHIFTS.map(shift => (
                              <CoverageCell key={shift} cellKey={`${cell.date}|${shift}`} slim />
                            ))}
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