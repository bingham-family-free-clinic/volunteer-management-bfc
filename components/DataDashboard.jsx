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
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        {/* Proportion bar */}
        <div style={{ width: '60px', height: '5px', borderRadius: '3px', background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${v.rate}%`,
            background: isHigh ? '#ef4444' : 'rgba(2,65,107,0.5)',
            borderRadius: '3px',
            transition: 'width 0.4s ease',
          }} />
        </div>
        <span style={{
          fontFamily: 'DM Mono, monospace', fontSize: '0.85rem', fontWeight: 700,
          color: isHigh ? '#ef4444' : 'var(--muted)',
          minWidth: '34px', textAlign: 'right',
        }}>
          {v.rate}%
        </span>
        <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
          {v.count}/{v.total} shifts
        </span>
      </div>
    </div>
  )
}

// ── Weekly Line Chart ─────────────────────────────────────────────────────────
const AFF_LINES = [
  { key: 'volunteer',  label: 'Volunteer',              color: '#02416B' },
  { key: 'provider',   label: 'Clinical Care',          color: '#7dd3fc' },
  { key: 'missionary', label: 'Missionary',             color: '#818cf8' },
  { key: 'student',    label: 'Student',                color: '#34d399' },
  { key: 'intern',     label: 'Intern',                 color: '#fb923c' },
]

function WeeklyLineChart({ data }) {
  const [hovered, setHovered] = useState(null)  // { x, y, week, values }
  const [hidden,  setHidden]  = useState(new Set())

  const W = 700, H = 260
  const padL = 48, padR = 24, padT = 16, padB = 40
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  const visible = AFF_LINES.filter(l => !hidden.has(l.key))
  const maxVal = Math.max(1, ...data.flatMap(d => visible.map(l => d[l.key] || 0)))
  const yMax = Math.ceil(maxVal / 10) * 10

  const xScale = (i) => padL + (i / (data.length - 1 || 1)) * chartW
  const yScale = (v) => padT + chartH - (v / yMax) * chartH

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(yMax * f))

  function buildPath(key) {
    return data.map((d, i) => {
      const x = xScale(i), y = yScale(d[key] || 0)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }

  function buildArea(key) {
    const base = yScale(0)
    const pts = data.map((d, i) => `${xScale(i).toFixed(1)},${yScale(d[key] || 0).toFixed(1)}`).join(' L')
    const last = xScale(data.length - 1), first = xScale(0)
    return `M${first},${base} L${pts} L${last},${base} Z`
  }

  // X-axis: show every ~8 weeks
  const step = Math.max(1, Math.floor(data.length / 8))
  const xLabels = data.filter((_, i) => i % step === 0 || i === data.length - 1)

  function handleMouseMove(e) {
    const svg = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - svg.left - padL
    const idx = Math.round((mx / chartW) * (data.length - 1))
    const clamped = Math.max(0, Math.min(data.length - 1, idx))
    const d = data[clamped]
    setHovered({ idx: clamped, d, x: xScale(clamped), y: padT + 8 })
  }

  return (
    <div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
        {AFF_LINES.map(l => {
          const isHidden = hidden.has(l.key)
          return (
            <button
              key={l.key}
              onClick={() => setHidden(prev => {
                const n = new Set(prev)
                n.has(l.key) ? n.delete(l.key) : n.add(l.key)
                return n
              })}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '0.2rem 0.5rem', borderRadius: '6px',
                opacity: isHidden ? 0.35 : 1,
                transition: 'opacity 0.15s',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              <span style={{ width: 14, height: 3, borderRadius: 2, background: l.color, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: '0.78rem', color: 'var(--text)', fontWeight: 500 }}>{l.label}</span>
            </button>
          )
        })}
      </div>

      {/* SVG */}
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', minWidth: 320, display: 'block', cursor: 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHovered(null)}
        >
          {/* Grid lines */}
          {yTicks.map(v => (
            <g key={v}>
              <line x1={padL} y1={yScale(v)} x2={padL + chartW} y2={yScale(v)}
                stroke="var(--border)" strokeWidth={0.75} strokeDasharray={v === 0 ? 'none' : '3,4'} />
              <text x={padL - 6} y={yScale(v) + 4} textAnchor="end"
                style={{ fontSize: 10, fill: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>
                {v}
              </text>
            </g>
          ))}

          {/* Area fills */}
          {AFF_LINES.filter(l => !hidden.has(l.key)).map(l => (
            <path key={l.key + '-area'} d={buildArea(l.key)}
              fill={l.color} opacity={0.07} />
          ))}

          {/* Lines */}
          {AFF_LINES.filter(l => !hidden.has(l.key)).map(l => (
            <path key={l.key} d={buildPath(l.key)}
              fill="none" stroke={l.color} strokeWidth={2}
              strokeLinecap="round" strokeLinejoin="round" />
          ))}

          {/* Hover dots */}
          {hovered && AFF_LINES.filter(l => !hidden.has(l.key)).map(l => (
            <circle key={l.key}
              cx={hovered.x} cy={yScale(hovered.d[l.key] || 0)} r={4}
              fill={l.color} stroke="var(--surface)" strokeWidth={2} />
          ))}

          {/* X axis labels */}
          {xLabels.map((d, i) => {
            const origIdx = data.indexOf(d)
            return (
              <text key={i} x={xScale(origIdx)} y={H - 6} textAnchor="middle"
                style={{ fontSize: 9.5, fill: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>
                {d.week}
              </text>
            )
          })}

          {/* Hover crosshair + tooltip */}
          {hovered && (
            <>
              <line x1={hovered.x} y1={padT} x2={hovered.x} y2={padT + chartH}
                stroke="var(--border)" strokeWidth={1} strokeDasharray="3,3" />
              {/* Tooltip box */}
              {(() => {
                const boxW = 148, boxH = 16 + AFF_LINES.filter(l => !hidden.has(l.key)).length * 17 + 8
                const bx = Math.min(hovered.x + 10, W - padR - boxW)
                const by = padT
                return (
                  <g>
                    <rect x={bx} y={by} width={boxW} height={boxH} rx={6}
                      fill="var(--surface)" stroke="var(--border)" strokeWidth={1}
                      style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.18))' }} />
                    <text x={bx + 10} y={by + 13} style={{ fontSize: 10, fontWeight: 700, fill: 'var(--text)', fontFamily: 'DM Mono, monospace' }}>
                      {hovered.d.week}
                    </text>
                    {AFF_LINES.filter(l => !hidden.has(l.key)).map((l, i) => (
                      <g key={l.key}>
                        <rect x={bx + 10} y={by + 22 + i * 17} width={8} height={8} rx={2} fill={l.color} />
                        <text x={bx + 24} y={by + 30 + i * 17} style={{ fontSize: 10, fill: 'var(--text)', fontFamily: 'DM Sans, sans-serif' }}>
                          {l.label}: <tspan fontFamily="DM Mono, monospace" fontWeight={700}>{(hovered.d[l.key] || 0).toFixed(1)}h</tspan>
                        </text>
                      </g>
                    ))}
                  </g>
                )
              })()}
            </>
          )}
        </svg>
      </div>
    </div>
  )
}

// ── Shift Bar Chart ───────────────────────────────────────────────────────────
function ShiftBarChart({ data, type }) {
  const [hovered, setHovered] = useState(null)

  // Filter based on type
  const filtered = data.filter(d => {
    if (type === 'noshow') return d.noShows > 0
    if (type === 'late')   return d.late > 0
    return d.noShows > 0 || d.late > 0
  })

  const maxVal = Math.max(1, ...filtered.map(d =>
    type === 'noshow' ? d.noShows :
    type === 'late'   ? d.late :
    d.noShows + d.late
  ))

  const BAR_H = 36, GAP = 8
  const padL = 90, padR = 60, padT = 16, padB = 24
  const W = 700
  const chartW = W - padL - padR
  const H = padT + filtered.length * (BAR_H + GAP) + padB

  function barWidth(v) { return (v / maxVal) * chartW }

  const noShowColor = '#ef4444'
  const lateColor   = '#f59e0b'

  return (
    <div style={{ overflowX: 'auto' }}>
      {filtered.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>No data matches the current filter.</p>
      ) : (
        <>
          {/* Legend */}
          {type === 'both' && (
            <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: noShowColor, display: 'inline-block' }} />
                <span style={{ fontSize: '0.78rem', color: 'var(--text)', fontWeight: 500 }}>No-shows</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: lateColor, display: 'inline-block' }} />
                <span style={{ fontSize: '0.78rem', color: 'var(--text)', fontWeight: 500 }}>Late</span>
              </div>
            </div>
          )}
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 320, display: 'block' }}>
            {filtered.map((d, i) => {
              const y = padT + i * (BAR_H + GAP)
              const isHov = hovered === i
              const nsW  = type === 'late'   ? 0 : barWidth(d.noShows)
              const ltW  = type === 'noshow' ? 0 : barWidth(d.late)
              const totalW = type === 'noshow' ? nsW : type === 'late' ? ltW : nsW + ltW
              const displayVal = type === 'noshow' ? d.noShows : type === 'late' ? d.late : d.noShows + d.late

              return (
                <g key={d.shift}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: 'default' }}
                >
                  {/* Shift label */}
                  <text x={padL - 8} y={y + BAR_H / 2 + 4} textAnchor="end"
                    style={{ fontSize: 11.5, fill: isHov ? 'var(--text)' : 'var(--muted)', fontFamily: 'DM Mono, monospace', fontWeight: isHov ? 700 : 400, transition: 'fill 0.1s' }}>
                    {d.shift}
                  </text>

                  {/* Background track */}
                  <rect x={padL} y={y + 6} width={chartW} height={BAR_H - 12} rx={4}
                    fill="var(--bg)" stroke="var(--border)" strokeWidth={0.75} />

                  {/* No-show bar */}
                  {nsW > 0 && (
                    <rect x={padL} y={y + 6} width={Math.max(nsW, 4)} height={BAR_H - 12} rx={4}
                      fill={noShowColor} opacity={isHov ? 0.92 : 0.72} style={{ transition: 'opacity 0.12s' }} />
                  )}

                  {/* Late bar (stacked) */}
                  {ltW > 0 && (
                    <rect x={padL + nsW} y={y + 6} width={Math.max(ltW, 4)} height={BAR_H - 12}
                      rx={nsW === 0 ? 4 : 0}
                      style={{ borderRadius: nsW === 0 ? 4 : 0 }}
                      fill={lateColor} opacity={isHov ? 0.92 : 0.72} />
                  )}

                  {/* Value label */}
                  {totalW > 0 && (
                    <text x={padL + totalW + 7} y={y + BAR_H / 2 + 4}
                      style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', fontWeight: 700, fill: isHov ? 'var(--text)' : 'var(--muted)' }}>
                      {type === 'both' ? (
                        `${d.noShows}/${d.late}`
                      ) : displayVal}
                    </text>
                  )}

                  {/* Hover tooltip */}
                  {isHov && type === 'both' && (
                    <g>
                      {(() => {
                        const tx = padL + totalW + 50, ty = y - 4
                        const inBounds = tx + 100 < W
                        const fx = inBounds ? tx : padL + totalW - 115
                        return (
                          <>
                            <rect x={fx} y={ty} width={110} height={36} rx={6}
                              fill="var(--surface)" stroke="var(--border)" strokeWidth={1}
                              style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.15))' }} />
                            <text x={fx + 10} y={ty + 14} style={{ fontSize: 10, fill: noShowColor, fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}>
                              No-shows: <tspan fontFamily="DM Mono, monospace">{d.noShows}</tspan>
                            </text>
                            <text x={fx + 10} y={ty + 27} style={{ fontSize: 10, fill: lateColor, fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}>
                              Late: <tspan fontFamily="DM Mono, monospace">{d.late}</tspan>
                            </text>
                          </>
                        )
                      })()}
                    </g>
                  )}
                </g>
              )
            })}
            {/* X-axis baseline */}
            <line x1={padL} y1={padT + filtered.length * (BAR_H + GAP) - GAP + 4}
              x2={padL + chartW} y2={padT + filtered.length * (BAR_H + GAP) - GAP + 4}
              stroke="var(--border)" strokeWidth={0.75} />
          </svg>
        </>
      )}
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
  const [noShowMonth, setNoShowMonth] = useState(new Date().getMonth() + 1)
  const [noShowYear,  setNoShowYear]  = useState(CURRENT_YEAR)

  const [lateOpen,    setLateOpen]    = useState(false)
  const [lateMonth,   setLateMonth]   = useState(new Date().getMonth() + 1)
  const [lateYear,    setLateYear]    = useState(CURRENT_YEAR)

  // ── Weekly hours chart state ──────────────────────────────
  const [weeklyChartOpen,   setWeeklyChartOpen]   = useState(false)
  const [weeklyChartData,   setWeeklyChartData]   = useState([])   // [{week, volunteer, provider, missionary, student, intern}]
  const [weeklyChartYear,   setWeeklyChartYear]   = useState(CURRENT_YEAR)
  const [weeklyChartLoading, setWeeklyChartLoading] = useState(false)

  // ── Shift attendance bar chart state ─────────────────────
  const [shiftChartOpen,    setShiftChartOpen]    = useState(false)
  const [shiftChartData,    setShiftChartData]    = useState([])   // [{shift, noShows, late}]
  const [shiftChartMonth,   setShiftChartMonth]   = useState(0)
  const [shiftChartYear,    setShiftChartYear]    = useState(CURRENT_YEAR)
  const [shiftChartType,    setShiftChartType]    = useState('both') // 'both'|'noshow'|'late'
  const [shiftChartLoading, setShiftChartLoading] = useState(false)

  // ── Data state ────────────────────────────────────────────
  const [loading,         setLoading]         = useState(true)
  const [totalHoursVal,   setTotalHoursVal]   = useState(0)
  const [shiftCount,      setShiftCount]      = useState(0)
  const [noShowsAll,      setNoShowsAll]      = useState([])   // all-time
  const [noShowsWeek,     setNoShowsWeek]     = useState([])   // past week
  const [latePeople,      setLatePeople]      = useState([])
  const [topHours,        setTopHours]        = useState([])
  const [profiles,        setProfiles]        = useState([])

  // ── Excuse / drawer state ─────────────────────────────────
  const [drawerPerson,     setDrawerPerson]     = useState(null)   // { id, name, records[] }
  const [excuseTarget,     setExcuseTarget]     = useState(null)   // single attendance_record
  const [excusedRecordKeys, setExcusedRecordKeys] = useState(new Set()) // "vol|date|time"

  // Load ALL profiles (no role filter) so any affiliation resolves names
  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, affiliation, sma_name, school, role, status')
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

    const inactiveIds = new Set(
      profiles.filter(p => p.status === 'inactive').map(p => p.id)
    )

    // ── Helper: compute date range from month/year selectors ──
    function getDateRange(month, year) {
      if (year === 0) return { fromDate: ATTENDANCE_CUTOFF, toDate: `${CURRENT_YEAR}-12-31` }
      if (month === 0) return { fromDate: `${year}-01-01`, toDate: `${year}-12-31` }
      const mm = String(month).padStart(2, '0')
      const lastDay = new Date(year, month, 0).getDate()
      return { fromDate: `${year}-${mm}-01`, toDate: `${year}-${mm}-${lastDay}` }
    }

    // ── No-shows ──────────────────────────────────────────────
    const { fromDate: nsFrom, toDate: nsTo } = getDateRange(noShowMonth, noShowYear)

    // Fetch total scheduled shifts per volunteer in the no-show period (for proportion)
    const totalShiftsForNS = await fetchAllRows(supabase, 'attendance_records', (q) =>
      q.select('volunteer_id')
        .gte('shift_date', nsFrom > ATTENDANCE_CUTOFF ? nsFrom : ATTENDANCE_CUTOFF)
        .lte('shift_date', nsTo)
    )
    const totalShiftsByVolNS = {}
    ;(totalShiftsForNS || []).forEach(r => {
      totalShiftsByVolNS[r.volunteer_id] = (totalShiftsByVolNS[r.volunteer_id] || 0) + 1
    })

    const absentData = await fetchAllRows(supabase, 'attendance_records', (q) =>
      q.select('volunteer_id, shift_date, shift_time, role, profiles(full_name)')
        .eq('status', 'absent')
        .gte('shift_date', nsFrom > ATTENDANCE_CUTOFF ? nsFrom : ATTENDANCE_CUTOFF)
        .lte('shift_date', nsTo)
        .order('shift_date', { ascending: false })
    )

    const absentMap = {}
    ;(absentData || []).forEach(r => {
      if (excusedIds.has(r.volunteer_id)) return
      if (inactiveIds.has(r.volunteer_id)) return
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
    Object.entries(absentMap).forEach(([id, { name, records }]) => {
      const total = totalShiftsByVolNS[id] || records.length
      const rate  = Math.round((records.length / total) * 100)
      allTime.push({ id, name, count: records.length, total, rate, records })
    })
    allTime.sort((a, b) => b.rate - a.rate || b.count - a.count)

    setNoShowsAll(allTime)
    setNoShowsWeek([]) // kept for compatibility; not currently shown

    // ── Late arrivals ─────────────────────────────────────────
    const { fromDate: ltFrom, toDate: ltTo } = getDateRange(lateMonth, lateYear)

    // Fetch total scheduled shifts per volunteer in the late period (for proportion)
    const totalShiftsForLate = await fetchAllRows(supabase, 'attendance_records', (q) =>
      q.select('volunteer_id')
        .gte('shift_date', ltFrom > ATTENDANCE_CUTOFF ? ltFrom : ATTENDANCE_CUTOFF)
        .lte('shift_date', ltTo)
    )
    const totalShiftsByVolLate = {}
    ;(totalShiftsForLate || []).forEach(r => {
      totalShiftsByVolLate[r.volunteer_id] = (totalShiftsByVolLate[r.volunteer_id] || 0) + 1
    })

    const lateData = await fetchAllRows(supabase, 'attendance_records', (q) =>
      q.select('volunteer_id, shift_date, shift_time, late_minutes, profiles(full_name)')
        .eq('status', 'late')
        .gte('shift_date', ltFrom > ATTENDANCE_CUTOFF ? ltFrom : ATTENDANCE_CUTOFF)
        .lte('shift_date', ltTo)
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
        .map(([id, { name, records }]) => {
          const total = totalShiftsByVolLate[id] || records.length
          const rate  = Math.round((records.length / total) * 100)
          return {
            id, name,
            count: records.length,
            total,
            rate,
            avgLate: Math.round(
              records.reduce((s, r) => s + (r.late_minutes || 0), 0) / records.length
            ),
            records,
          }
        })
        .sort((a, b) => b.rate - a.rate || b.count - a.count)
    )
  }, [supabase, profiles, noShowMonth, noShowYear, lateMonth, lateYear])

  // ── Weekly hours by affiliation ───────────────────────────
  const loadWeeklyChart = useCallback(async () => {
    setWeeklyChartLoading(true)
    const fromDate = `${weeklyChartYear}-01-01`
    const toDate   = `${weeklyChartYear}-12-31`
    const shiftsData = await fetchAllRows(supabase, 'shifts', (q) =>
      q.select('clock_in, clock_out, profiles(affiliation)')
        .not('clock_out', 'is', null)
        .gte('clock_in', fromDate + 'T00:00:00Z')
        .lte('clock_in', toDate   + 'T23:59:59Z')
    )
    // Group by ISO week number
    const weekMap = {}
    ;(shiftsData || []).forEach(s => {
      const d = asUTC(s.clock_in)
      if (!d) return
      const jan1 = new Date(d.getFullYear(), 0, 1)
      const weekNum = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7)
      const key = `W${String(weekNum).padStart(2, '0')}`
      const aff = s.profiles?.affiliation || 'volunteer'
      const hrs = (asUTC(s.clock_out) - d) / 3600000
      if (!weekMap[key]) weekMap[key] = { week: key, volunteer: 0, provider: 0, missionary: 0, student: 0, intern: 0 }
      const bucket = ['provider','missionary','student','intern'].includes(aff) ? aff : 'volunteer'
      weekMap[key][bucket] += hrs
    })
    const weeks = Object.keys(weekMap).sort()
    setWeeklyChartData(weeks.map(w => ({
      ...weekMap[w],
      volunteer:  +weekMap[w].volunteer.toFixed(1),
      provider:   +weekMap[w].provider.toFixed(1),
      missionary: +weekMap[w].missionary.toFixed(1),
      student:    +weekMap[w].student.toFixed(1),
      intern:     +weekMap[w].intern.toFixed(1),
    })))
    setWeeklyChartLoading(false)
  }, [supabase, weeklyChartYear])

  // ── Shift attendance by shift time ────────────────────────
  const loadShiftChart = useCallback(async () => {
    setShiftChartLoading(true)
    let fromDate, toDate
    if (shiftChartYear === 0) {
      fromDate = `2000-01-01`
      toDate   = `${CURRENT_YEAR}-12-31`
    } else if (shiftChartMonth === 0) {
      fromDate = `${shiftChartYear}-01-01`
      toDate   = `${shiftChartYear}-12-31`
    } else {
      const mm = String(shiftChartMonth).padStart(2, '0')
      const lastDay = new Date(shiftChartYear, shiftChartMonth, 0).getDate()
      fromDate = `${shiftChartYear}-${mm}-01`
      toDate   = `${shiftChartYear}-${mm}-${lastDay}`
    }
    const DAY_ORDER = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 }
    const DAY_ABBR  = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' }
    const [absentData, lateData] = await Promise.all([
      fetchAllRows(supabase, 'attendance_records', (q) =>
        q.select('shift_time, day_of_week, shift_date')
          .eq('status', 'absent')
          .gte('shift_date', fromDate)
          .lte('shift_date', toDate)
          .gte('shift_date', ATTENDANCE_CUTOFF)
      ),
      fetchAllRows(supabase, 'attendance_records', (q) =>
        q.select('shift_time, day_of_week, shift_date')
          .eq('status', 'late')
          .gte('shift_date', fromDate)
          .lte('shift_date', toDate)
          .gte('shift_date', ATTENDANCE_CUTOFF)
      ),
    ])
    const map = {}
    const makeKey = (r) => {
      const day = r.day_of_week || 'unknown'
      const st  = r.shift_time  || 'unknown'
      return `${day}||${st}`
    }
    ;(absentData || []).forEach(r => {
      const key = makeKey(r)
      if (!map[key]) map[key] = { shift: `${DAY_ABBR[r.day_of_week] || r.day_of_week} ${r.shift_time || '?'}`, day: r.day_of_week || 'unknown', time: r.shift_time || 'unknown', noShows: 0, late: 0 }
      map[key].noShows++
    })
    ;(lateData || []).forEach(r => {
      const key = makeKey(r)
      if (!map[key]) map[key] = { shift: `${DAY_ABBR[r.day_of_week] || r.day_of_week} ${r.shift_time || '?'}`, day: r.day_of_week || 'unknown', time: r.shift_time || 'unknown', noShows: 0, late: 0 }
      map[key].late++
    })
    const sorted = Object.values(map).sort((a, b) => {
      const dayDiff = (DAY_ORDER[a.day] ?? 99) - (DAY_ORDER[b.day] ?? 99)
      if (dayDiff !== 0) return dayDiff
      return (a.time || '').localeCompare(b.time || '')
    })
    setShiftChartData(sorted)
    setShiftChartLoading(false)
  }, [supabase, shiftChartMonth, shiftChartYear])

  // ── Bootstrap on profiles load ────────────────────────────
  useEffect(() => {
    if (!profiles.length) return
    setLoading(true)
    Promise.all([loadHours(), loadTopHours(), loadAttendance()])
      .finally(() => setLoading(false))
  }, [profiles]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (profiles.length) loadHours()      }, [hoursMonth, hoursYear, hoursAff, loadHours])
  useEffect(() => { if (profiles.length) loadTopHours()   }, [topMonth, topYear, topAff, topCount, loadTopHours])
  useEffect(() => { if (profiles.length) loadAttendance() }, [noShowMonth, noShowYear, lateMonth, lateYear, loadAttendance]) // eslint-disable-line react-hooks/exhaustive-deps

  // Chart loaders — independent of profiles
  useEffect(() => { loadWeeklyChart() }, [loadWeeklyChart])
  useEffect(() => { loadShiftChart()  }, [loadShiftChart])

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
            flexWrap: 'wrap', gap: '0.75rem',
            marginBottom: noShowOpen ? '1rem' : 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button onClick={() => setNoShowOpen(s => !s)} style={collapseBtn}>
                <Chevron open={noShowOpen} />
                <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)' }}>No-Shows</span>
                {noShowsAll.length > 0 && (
                  <span style={{ ...pillStyle('#02416b') }}>
                    {noShowsAll.length}
                  </span>
                )}
              </button>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Click a name to view shifts missed.</span>
              <select value={noShowMonth} onChange={e => setNoShowMonth(Number(e.target.value))} disabled={noShowYear === 0} style={{ ...sel, opacity: noShowYear === 0 ? 0.4 : 1 }}>
                {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <select value={noShowYear} onChange={e => setNoShowYear(Number(e.target.value))} style={sel}>
                {YEARS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
              </select>
            </div>
          </div>

          {noShowOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

              {/* ── Filtered period list ── */}
              <div style={{
                borderRadius: '10px', border: '1px solid var(--border)',
                background: 'var(--bg)', padding: '1rem',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem',
                }}>
                  <span style={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>
                    {noShowMonth === 0 ? (noShowYear === 0 ? 'All Time' : String(noShowYear)) : `${MONTHS.find(m => m.value === noShowMonth)?.label} ${noShowYear}`}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                    · sorted by % of shifts missed
                  </span>
                  {noShowsAll.length > 0 && (
                    <span style={{ ...pillStyle('#9ca3af') }}>{noShowsAll.length}</span>
                  )}
                </div>
                {noShowsAll.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>No absences recorded for this period.</p>
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
            flexWrap: 'wrap', gap: '0.75rem',
            marginBottom: lateOpen && latePeople.length > 0 ? '1rem' : 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button onClick={() => setLateOpen(s => !s)} style={collapseBtn}>
                <Chevron open={lateOpen} />
                <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)' }}>Repeat Late Arrivals</span>
                {latePeople.length > 0 && (
                  <span style={{ ...pillStyle('#92a6b9') }}>{latePeople.length}</span>
                )}
              </button>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>≥2 times</span>
              <select value={lateMonth} onChange={e => setLateMonth(Number(e.target.value))} disabled={lateYear === 0} style={{ ...sel, opacity: lateYear === 0 ? 0.4 : 1 }}>
                {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <select value={lateYear} onChange={e => setLateYear(Number(e.target.value))} style={sel}>
                {YEARS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
              </select>
            </div>
          </div>
          {lateOpen && (
            latePeople.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: '0.75rem' }}>No repeat late arrivals for this period.</p>
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
                        {/* Proportion bar */}
                        <div style={{ width: '60px', height: '5px', borderRadius: '3px', background: 'var(--border)', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            width: `${v.rate}%`,
                            background: isHigh ? '#f59e0b' : 'rgba(245,158,11,0.5)',
                            borderRadius: '3px',
                            transition: 'width 0.4s ease',
                          }} />
                        </div>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.85rem', fontWeight: 700, color: isHigh ? '#f59e0b' : 'var(--muted)', minWidth: '34px', textAlign: 'right' }}>
                          {v.rate}%
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                          {v.count}/{v.total} shifts
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>avg {v.avgLate}m late</span>
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

        {/* ── 5. Weekly Hours by Affiliation (Line Chart) ─────── */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: weeklyChartOpen ? '1.25rem' : 0 }}>
            <button onClick={() => setWeeklyChartOpen(s => !s)} style={collapseBtn}>
              <Chevron open={weeklyChartOpen} />
              <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)' }}>Weekly Hours by Affiliation</span>
            </button>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select value={weeklyChartYear} onChange={e => setWeeklyChartYear(Number(e.target.value))} style={sel}>
                {YEARS.filter(y => y.value > 0).map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
              </select>
            </div>
          </div>
          {weeklyChartOpen && (
            weeklyChartLoading ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>Loading chart…</p>
            ) : weeklyChartData.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>No shift data for {weeklyChartYear}.</p>
            ) : (
              <WeeklyLineChart data={weeklyChartData} />
            )
          )}
        </div>

        {/* ── 6. Shift Late/No-Show Bar Chart ─────────────────── */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: shiftChartOpen ? '1.25rem' : 0 }}>
            <button onClick={() => setShiftChartOpen(s => !s)} style={collapseBtn}>
              <Chevron open={shiftChartOpen} />
              <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)' }}>Late &amp; No-Shows by Shift</span>
            </button>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={shiftChartType} onChange={e => setShiftChartType(e.target.value)} style={sel}>
                <option value="both">Both</option>
                <option value="noshow">No-shows only</option>
                <option value="late">Late only</option>
              </select>
              <select value={shiftChartMonth} onChange={e => setShiftChartMonth(Number(e.target.value))} disabled={shiftChartYear === 0} style={{ ...sel, opacity: shiftChartYear === 0 ? 0.4 : 1 }}>
                {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <select value={shiftChartYear} onChange={e => setShiftChartYear(Number(e.target.value))} style={sel}>
                {YEARS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
              </select>
            </div>
          </div>
          {shiftChartOpen && (
            shiftChartLoading ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>Loading chart…</p>
            ) : shiftChartData.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>No attendance data for this period.</p>
            ) : (
              <ShiftBarChart data={shiftChartData} type={shiftChartType} />
            )
          )}
        </div>

      </div>
    </>
  )
}