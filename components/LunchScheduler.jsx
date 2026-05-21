'use client'

import { useState, useEffect, useCallback } from 'react'
import { LUNCH_SHIFTS } from '../lib/constants'

// ── Constants ─────────────────────────────────────────────────────────────────
const WEEKDAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']

// ── Helpers ───────────────────────────────────────────────────────────────────
function getMtnToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function LunchScheduler({ supabase, profile }) {
  const today = getMtnToday()

  const [selectedDate, setSelectedDate] = useState(today)
  const [scheduledVols, setScheduledVols] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(null)
  const [toast, setToast] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  // ── Load data whenever date changes ──────────────────────────────────────
  const loadData = useCallback(async (date) => {
    setLoading(true)

    const dateObj  = new Date(date + 'T12:00:00')
    const dayIndex = dateObj.getDay()
    const dayName  = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dayIndex]

    const [{ data: schedRows }, { data: lunches }] = await Promise.all([
      supabase
        .from('schedule')
        .select('volunteer_id, shift_time, role, profiles(id, full_name, default_role)')
        .eq('day_of_week', dayName)
        .not('volunteer_id', 'is', null),
      supabase
        .from('lunch_assignments')
        .select('id, volunteer_id, lunch_shift, notes')
        .eq('assignment_date', date),
    ])

    // Group shifts per volunteer, then filter to only those with both 10-2 AND 2-6
    const volMap = {}
    for (const row of (schedRows || [])) {
      if (!row.profiles) continue
      if (!volMap[row.volunteer_id]) {
        volMap[row.volunteer_id] = {
          id:           row.volunteer_id,
          full_name:    row.profiles.full_name,
          default_role: row.profiles.default_role,
          shifts:       new Set(),
        }
      }
      volMap[row.volunteer_id].shifts.add(row.shift_time)
    }

    const vols = Object.values(volMap)
      .filter(v => v.shifts.has('10-2') && v.shifts.has('2-6'))
      .map(({ shifts, ...rest }) => rest)
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))

    setScheduledVols(vols)
    setAssignments(lunches || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData(selectedDate) }, [selectedDate, loadData])

  // ── Derived maps ──────────────────────────────────────────────────────────
  const assignmentMap = {}
  for (const a of assignments) assignmentMap[a.volunteer_id] = a.lunch_shift

  const slotVols = {
    1: scheduledVols.filter(v => assignmentMap[v.id] === 1),
    2: scheduledVols.filter(v => assignmentMap[v.id] === 2),
  }
  const unassigned = scheduledVols.filter(v => !assignmentMap[v.id])

  // ── Mutations ─────────────────────────────────────────────────────────────
  async function assign(volunteerId, lunchShift) {
    setSaving(volunteerId)
    const existing = assignments.find(a => a.volunteer_id === volunteerId)

    let error
    let inserted = null

    if (existing) {
      if (existing.lunch_shift === lunchShift) {
        ;({ error } = await supabase
          .from('lunch_assignments')
          .delete()
          .eq('id', existing.id))
      } else {
        ;({ error } = await supabase
          .from('lunch_assignments')
          .update({ lunch_shift: lunchShift, assigned_by: profile?.id, assigned_at: new Date().toISOString() })
          .eq('id', existing.id))
      }
    } else {
      ;({ data: inserted, error } = await supabase
        .from('lunch_assignments')
        .insert({
          volunteer_id:    volunteerId,
          assignment_date: selectedDate,
          lunch_shift:     lunchShift,
          assigned_by:     profile?.id,
        })
        .select('id, volunteer_id, lunch_shift')
        .single())
    }

    if (error) {
      showToast(error.message, 'error')
    } else {
      setAssignments(prev => {
        const without = prev.filter(a => a.volunteer_id !== volunteerId)
        const same    = existing && existing.lunch_shift === lunchShift
        if (same) return without
        // Use the real row (with id) if it was a fresh insert, otherwise patch existing
        const newRow = inserted ?? { ...existing, lunch_shift: lunchShift }
        return [...without, newRow]
      })
    }
    setSaving(null)
  }

  async function unassign(volunteerId) {
    setSaving(volunteerId)
    const existing = assignments.find(a => a.volunteer_id === volunteerId)
    if (!existing) { setSaving(null); return }
    const { error } = await supabase.from('lunch_assignments').delete().eq('id', existing.id)
    if (error) showToast(error.message, 'error')
    else setAssignments(prev => prev.filter(a => a.volunteer_id !== volunteerId))
    setSaving(null)
  }

  function onDragStart(e, volunteerId) {
    e.dataTransfer.setData('volunteer_id', volunteerId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDrop(e, lunchShift) {
    e.preventDefault()
    const vid = e.dataTransfer.getData('volunteer_id')
    if (vid) assign(vid, lunchShift)
    setDragOver(null)
  }

  function showToast(text, type) {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3500)
  }

  const isToday = selectedDate === today

  // ── Styles ────────────────────────────────────────────────────────────────
  const card    = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
  const inputSt = { padding: '0.65rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.9rem', outline: 'none', fontFamily: 'DM Sans, sans-serif' }
  const labelSt = { display: 'block', fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }

  const slotColors = {
    1: { bg: 'rgba(30,64,175,0.08)', border: 'rgba(30,64,175,0.45)', text: '#3b82f6', pill: 'rgba(30,64,175,0.12)', pillBorder: 'rgba(30,64,175,0.4)' },
    2: { bg: 'rgba(125,211,252,0.08)', border: 'rgba(125,211,252,0.45)', text: '#7dd3fc', pill: 'rgba(125,211,252,0.12)', pillBorder: 'rgba(125,211,252,0.4)' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Date picker */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <label style={labelSt}>Schedule Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              style={inputSt}
            />
          </div>
          <div style={{ paddingTop: '1.2rem' }}>
            <button
              onClick={() => setSelectedDate(today)}
              style={{ padding: '0.65rem 1.1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: isToday ? 'var(--accent)' : 'var(--surface)', color: isToday ? '#fff' : 'var(--muted)', border: isToday ? 'none' : '1px solid var(--border)' }}
            >
              Today
            </button>
          </div>
          <div style={{ marginLeft: 'auto', paddingTop: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{formatDateDisplay(selectedDate)}</span>
            {loading && <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Loading…</span>}
          </div>
        </div>
      </div>

      {/* Summary counts */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          {[
            { label: 'Scheduled Today', value: scheduledVols.length, color: 'var(--text)' },
            { label: 'Assigned',        value: scheduledVols.length - unassigned.length, color: 'var(--accent)' },
            { label: 'Unassigned',      value: unassigned.length, color: unassigned.length > 0 ? '#5c0303' : 'var(--muted)' },
          ].map(s => (
            <div key={s.label} style={{ ...card, padding: '0.85rem 1rem', textAlign: 'center' }}>
              <p style={{ fontSize: '1.6rem', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: s.color, lineHeight: 1 }}>{s.value}</p>
              <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Drag-and-drop slots */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {LUNCH_SHIFTS.map(ls => {
            const c = slotColors[ls.id]
            const isOver = dragOver === ls.id
            return (
              <div
                key={ls.id}
                onDragOver={e => { e.preventDefault(); setDragOver(ls.id) }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => onDrop(e, ls.id)}
                style={{ borderRadius: '12px', border: `2px ${isOver ? 'solid' : 'dashed'} ${c.border}`, background: isOver ? c.bg + '80' : c.bg, padding: '1rem', minHeight: '160px', transition: 'all 0.15s' }}
              >
                <div style={{ marginBottom: '0.85rem' }}>
                  <p style={{ fontWeight: 700, fontSize: '0.9rem', color: c.text }}>{ls.label}</p>
                  <p style={{ fontSize: '0.78rem', fontFamily: 'DM Mono, monospace', color: 'var(--muted)' }}>{ls.time}</p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '0.2rem' }}>{slotVols[ls.id].length} assigned</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {slotVols[ls.id].map(v => (
                    <div
                      key={v.id}
                      draggable
                      onDragStart={e => onDragStart(e, v.id)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0.65rem', background: c.pill, border: `1px solid ${c.pillBorder}`, borderRadius: '8px', cursor: saving === v.id ? 'not-allowed' : 'grab', opacity: saving === v.id ? 0.5 : 1, gap: '0.35rem' }}
                    >
                      <div>
                        <p style={{ fontWeight: 600, fontSize: '0.82rem', margin: 0 }}>{v.full_name}</p>
                        {v.default_role && <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: 0 }}>{v.default_role}</p>}
                      </div>
                      <button
                        onClick={() => unassign(v.id)}
                        disabled={saving === v.id}
                        title="Remove"
                        style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.75rem', padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {slotVols[ls.id].length === 0 && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--muted)', fontStyle: 'italic', textAlign: 'center', paddingTop: '0.5rem' }}>
                      Drop volunteers here
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Unassigned pool */}
      {!loading && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>Scheduled — Unassigned</p>
              <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.15rem' }}>Drag to a slot above, or use the buttons to assign</p>
            </div>
            {unassigned.length === 0 && scheduledVols.length > 0 && (
              <span style={{ fontSize: '0.78rem', padding: '0.2rem 0.6rem', borderRadius: '100px', background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', fontWeight: 600 }}>All assigned ✓</span>
            )}
          </div>

          {scheduledVols.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem', fontStyle: 'italic' }}>No volunteers scheduled for this day.</p>
          ) : unassigned.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem', fontStyle: 'italic' }}>Everyone has been assigned a lunch slot.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {unassigned.map(v => (
                <div
                  key={v.id}
                  draggable
                  onDragStart={e => onDragStart(e, v.id)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.85rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', cursor: saving === v.id ? 'not-allowed' : 'grab', opacity: saving === v.id ? 0.5 : 1, flexWrap: 'wrap', gap: '0.5rem' }}
                >
                  <div>
                    <p style={{ fontWeight: 500, fontSize: '0.88rem', margin: 0 }}>{v.full_name}</p>
                    {v.default_role && <p style={{ fontSize: '0.74rem', color: 'var(--muted)', margin: 0 }}>{v.default_role}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {LUNCH_SHIFTS.map(ls => {
                      const c = slotColors[ls.id]
                      return (
                        <button
                          key={ls.id}
                          onClick={() => assign(v.id, ls.id)}
                          disabled={saving === v.id}
                          style={{ padding: '0.3rem 0.75rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: saving === v.id ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', background: c.pill, color: c.text, border: `1px solid ${c.pillBorder}` }}
                        >
                          {saving === v.id ? '…' : ls.label.replace('Lunch ', '')}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Already-assigned list (collapsible) */}
      {!loading && scheduledVols.length > 0 && assignments.length > 0 && (
        <details style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <summary style={{ padding: '0.85rem 1.25rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', userSelect: 'none', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Full Assignment List</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 400 }}>{assignments.length} of {scheduledVols.length} assigned ▾</span>
          </summary>
          <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {LUNCH_SHIFTS.map(ls => {
              const c = slotColors[ls.id]
              const vols = slotVols[ls.id]
              if (vols.length === 0) return null
              return (
                <div key={ls.id} style={{ marginTop: '0.6rem' }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, color: c.text, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.4rem' }}>{ls.label} · {ls.time}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {vols.map(v => (
                      <span key={v.id} style={{ padding: '0.2rem 0.65rem', borderRadius: '100px', fontSize: '0.8rem', background: c.pill, color: c.text, border: `1px solid ${c.pillBorder}`, fontWeight: 500 }}>{v.full_name}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </details>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'success' ? 'var(--accent)' : '#dc2626', color: '#fff', padding: '0.75rem 1.5rem', borderRadius: '100px', fontWeight: 500, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 200 }}>
          {toast.text}
        </div>
      )}
    </div>
  )
}