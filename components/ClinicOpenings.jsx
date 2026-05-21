'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ROLE_SUGGESTIONS } from '../lib/constants'

const DAYS    = ['monday','tuesday','wednesday','thursday','friday']
const SHIFTS  = ['10-2','2-6']

const DAY_SHORT = { monday:'Mon', tuesday:'Tue', wednesday:'Wed', thursday:'Thu', friday:'Fri' }
const SHIFT_LABEL = { '10-2':'10–2', '2-6':'2–6' }

function severityColor(openings, capacity) {
  const pct = openings / capacity
  if (pct >= 0.1) return { bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.40)', text: '#ef4444', dot: '#ef4444' }
  return              { bg: 'rgba(2,65,107,0.10)',    border: 'rgba(2,65,107,0.40)',   text: 'var(--accent)', dot: 'var(--accent)' }
}

export default function ClinicOpenings({ onClose }) {
  const [data,    setData]    = useState([])   // { day, shift, role, capacity, filled, openings }[]
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [filter,  setFilter]  = useState('all') // 'all' | day name | shift string

  useEffect(() => { fetchOpenings() }, [])
  
  async function fetchOpenings() {
    setLoading(true); setError(null)
    try {
      const { data: rows, error: err } = await supabase
        .from('schedule')
        .select('day_of_week, shift_time, role, volunteer_id, end_date, week_pattern')
      if (err) throw err

      const today = new Date().toISOString().split('T')[0]
      const activeRows = (rows || []).filter(r =>
        (r.end_date == null || r.end_date > today)
      )
      
      const results = []
      for (const day of DAYS) {
        for (const shift of SHIFTS) {
          for (const [role, required] of Object.entries(ROLE_SUGGESTIONS)) {
            const slotRows = activeRows.filter(r =>
              r.day_of_week?.toLowerCase().trim() === day &&
              r.shift_time?.toLowerCase().trim()  === shift &&
              r.role                               === role
            )
            const filled   = slotRows.reduce((sum, r) =>
              sum + (r.week_pattern === 'every' ? 1 : 0.5), 0
            )
            const openings = required - filled
            if (openings > 0) {
              results.push({ day, shift, role, capacity: required, filled, openings })
            }
          }
        }
      }
      setData(results)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  // Unique days/shifts present in results for quick-filter pills
  const presentDays   = [...new Set(data.map(r => r.day))]
  const presentShifts = [...new Set(data.map(r => r.shift))]

  const filtered = filter === 'all'
    ? data
    : data.filter(r => r.day === filter || r.shift === filter)

  // Group for display: day → shift → rows
  const grouped = {}
  for (const row of filtered) {
    if (!grouped[row.day]) grouped[row.day] = {}
    if (!grouped[row.day][row.shift]) grouped[row.day][row.shift] = []
    grouped[row.day][row.shift].push(row)
  }

  const totalOpenings = filtered.reduce((s, r) => s + r.openings, 0)

  const card    = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
  const pill    = (active) => ({ padding: '0.3rem 0.75rem', borderRadius: '100px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', border: active ? 'none' : '1px solid var(--border)', background: active ? 'var(--accent)' : 'var(--surface)', color: active ? '#fff' : 'var(--muted)', transition: 'all 0.15s' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Header card */}
      <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderColor: totalOpenings > 0 ? 'rgba(251,191,36,0.4)' : 'var(--border)', background: totalOpenings > 0 ? 'rgba(251,191,36,0.04)' : 'var(--surface)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
            <h2 style={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>Clinic Openings</h2>
            {!loading && (
              <span style={{ padding: '0.15rem 0.6rem', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 700, background: totalOpenings > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(74,222,128,0.12)', color: totalOpenings > 0 ? '#ef4444' : 'var(--accent)', border: `1px solid ${totalOpenings > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(74,222,128,0.3)'}` }}>
                {totalOpenings} open slot{totalOpenings !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Roles with unfilled recurring schedule slots</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={fetchOpenings} style={{ padding: '0.4rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)' }}>↻ Refresh</button>
          {onClose && (
            <button onClick={onClose} style={{ padding: '0.4rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)' }}>✕ Close</button>
          )}
        </div>
      </div>

      {/* Filter pills */}
      {!loading && data.length > 0 && (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => setFilter('all')} style={pill(filter === 'all')}>All</button>
          <span style={{ color: 'var(--border)', fontSize: '0.85rem' }}>|</span>
          {presentDays.map(d => (
            <button key={d} onClick={() => setFilter(filter === d ? 'all' : d)} style={{ ...pill(filter === d), textTransform: 'capitalize' }}>{DAY_SHORT[d]}</button>
          ))}
          <span style={{ color: 'var(--border)', fontSize: '0.85rem' }}>|</span>
          {presentShifts.map(s => (
            <button key={s} onClick={() => setFilter(filter === s ? 'all' : s)} style={{ ...pill(filter === s), fontFamily: 'DM Mono, monospace' }}>{SHIFT_LABEL[s]}</button>
          ))}
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '120px' }}>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Calculating openings…</p>
        </div>
      ) : error ? (
        <div style={{ ...card, borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.05)' }}>
          <p style={{ color: '#ef4444', fontSize: '0.9rem' }}>Error: {error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '2.5rem 1.5rem' }}>
          <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>✓</p>
          <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>All slots filled</p>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No open positions for this filter.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {DAYS.filter(d => grouped[d]).map(day => (
            <div key={day} style={card}>
              <p style={{ fontWeight: 700, fontSize: '0.9rem', textTransform: 'capitalize', marginBottom: '0.85rem', letterSpacing: '-0.01em' }}>{day}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {SHIFTS.filter(sh => grouped[day]?.[sh]).map(shift => (
                  <div key={shift}>
                    {/* Shift sub-header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', fontWeight: 600, padding: '0.15rem 0.55rem', borderRadius: '6px', background: 'rgba(2,65,107,0.1)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.3)' }}>{SHIFT_LABEL[shift]}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                        {grouped[day][shift].reduce((s, r) => s + r.openings, 0)} opening{grouped[day][shift].reduce((s, r) => s + r.openings, 0) !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Role rows */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {grouped[day][shift].map(row => {
                        const col = severityColor(row.openings, row.capacity)
                        return (
                          <div key={row.role} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0.75rem', borderRadius: '8px', background: col.bg, border: `1px solid ${col.border}` }}>
                            {/* Dot */}
                            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: col.dot, flexShrink: 0 }} />
                            {/* Role name */}
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>{row.role}</span>
                            {/* Filled / capacity bar */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <div style={{ display: 'flex', gap: '3px' }}>
                                {Array.from({ length: row.capacity }).map((_, i) => (
                                  <div key={i} style={{ width: '10px', height: '10px', borderRadius: '3px', background: i < row.filled ? 'var(--accent)' : col.dot, opacity: i < row.filled ? 0.9 : 0.45 }} />
                                ))}
                              </div>
                              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.72rem', color: col.text, fontWeight: 700 }}>
                                {row.filled}/{row.capacity}
                              </span>
                            </div>
                            {/* Openings badge */}
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: '100px', background: col.bg, color: col.text, border: `1px solid ${col.border}` }}>
                              {row.openings} needed
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
