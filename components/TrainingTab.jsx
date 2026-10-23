'use client'

import { useState, useEffect, useMemo } from 'react'
import { ROLES, DAYS, SHIFTS } from '../lib/constants'

/* ════════════════════════════════════════════════════════════════════════════
   VOLUNTEER TRAINING TAB
   ────────────────────────────────────────────────────────────────────────────
   UI is complete. Everything marked TODO(backend) is yours to wire up.

   Layout (mirrors the admin "Volunteers" tab):
     • Collapsible "Filters" card  → position, person name, day, shift
     • One expandable banner per role in ROLES (lib/constants.js)
     • Clicking a banner opens an empty panel directly beneath it
       (<TrainedPanel/> — build the "individuals trained" list there)

   BACKEND TODO CHECKLIST
   ──────────────────────
   [1] loadAssignments()   – fetch who is scheduled in which role/day/shift.
                             This feeds the name filter, the day/shift filter
                             and the "n scheduled" count on each banner.
   [2] Trained records     – decide where "trained in role X" lives (suggested
                             table below), then load it and merge it into the
                             roster so the name filter can find trained people
                             who aren't currently scheduled.
   [3] <TrainedPanel/>     – render the list of trained individuals. It already
                             receives `role` and `people` (the filtered roster).
   [4] Banner header count – optionally add a "n trained" count next to
                             "n scheduled" once [2] exists.
   [5] Slot semantics      – decide how end_date / start_date / week_pattern
                             should affect the day+shift filter (see [1]).
   [6] Permissions         – confirm RLS lets admins read the tables above.
   [7] Turn off sample data – set USE_SAMPLE_DATA to false.
   ════════════════════════════════════════════════════════════════════════════ */

// Flip to false once loadAssignments() is wired to Supabase.
// While true, the tab shows made-up people so you can try the filters.
const USE_SAMPLE_DATA = true

// Shape the UI expects from loadAssignments(). One row per scheduled slot,
// identical to the rows the admin Scheduling tab already loads:
//   { id, volunteer_id, day_of_week, shift_time, role, start_date, end_date,
//     week_pattern, profiles: { id, full_name, status } }
const SAMPLE_ASSIGNMENTS = [
  { id: 1,  volunteer_id: 'a1', day_of_week: 'monday',    shift_time: '10-2', role: 'Intake',              profiles: { full_name: 'Ava Thompson',  status: 'active' } },
  { id: 2,  volunteer_id: 'a2', day_of_week: 'monday',    shift_time: '2-6',  role: 'Intake',              profiles: { full_name: 'Noah Bennett',  status: 'active' } },
  { id: 3,  volunteer_id: 'a1', day_of_week: 'wednesday', shift_time: '10-2', role: 'Intake',              profiles: { full_name: 'Ava Thompson',  status: 'active' } },
  { id: 4,  volunteer_id: 'a3', day_of_week: 'monday',    shift_time: '10-2', role: 'Scribe',              profiles: { full_name: 'Mia Rodriguez', status: 'active' } },
  { id: 5,  volunteer_id: 'a4', day_of_week: 'tuesday',   shift_time: '2-6',  role: 'Scribe',              profiles: { full_name: 'Liam Carter',   status: 'active' } },
  { id: 6,  volunteer_id: 'a5', day_of_week: 'thursday',  shift_time: '10-2', role: 'Receptionist',        profiles: { full_name: 'Emma Nguyen',   status: 'active' } },
  { id: 7,  volunteer_id: 'a6', day_of_week: 'friday',    shift_time: '2-6',  role: 'Lab',                 profiles: { full_name: 'Owen Patel',    status: 'active' } },
  { id: 8,  volunteer_id: 'a7', day_of_week: 'monday',    shift_time: '10-2', role: 'Clinical Supervisor', profiles: { full_name: 'Grace Holmes',  status: 'active' } },
  { id: 9,  volunteer_id: 'a3', day_of_week: 'friday',    shift_time: '10-2', role: 'Patient Nav.',        profiles: { full_name: 'Mia Rodriguez', status: 'active' } },
  { id: 10, volunteer_id: 'a8', day_of_week: 'wednesday', shift_time: '2-6',  role: 'Pharmacy',            profiles: { full_name: 'Lucas Reed',    status: 'active' } },
]

// ── Shared look (copied from admin/page.js so this tab matches Volunteers) ───
const card       = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
const inputStyle = { width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', fontFamily: 'DM Sans, sans-serif' }
const pillBtn    = (active) => ({ padding: '0.45rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: active ? 'var(--accent)' : 'var(--surface)', color: active ? '#fff' : 'var(--muted)', border: active ? 'none' : '1px solid var(--border)' })

// Same banner as ExpandableSection in admin/page.js. Local copy because the
// original isn't exported. `meta` is the small mono pill next to the label.
function RoleBanner({ label, meta, isOpen, onToggle, children, panelId }) {
  return (
    <div style={{ borderRadius: '10px', border: `1px solid ${isOpen ? 'var(--accent)' : 'var(--border)'}`, overflow: 'hidden', transition: 'border-color 0.15s' }}>
      <button
        className="training-banner-btn"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1rem', background: isOpen ? 'rgba(2,65,107,0.05)' : 'var(--bg)', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', color: isOpen ? 'var(--accent)' : 'var(--text)', transition: 'background 0.15s' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span aria-hidden="true" style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '0.85rem', color: 'var(--muted)' }}>›</span>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{label}</span>
          {meta && (
            <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: isOpen ? 'rgba(2,65,107,0.15)' : 'var(--surface)', color: isOpen ? 'var(--accent)' : 'var(--muted)', border: '1px solid var(--border)', fontFamily: 'DM Mono, monospace' }}>{meta}</span>
          )}
        </div>
      </button>
      {isOpen && (
        <div id={panelId} style={{ padding: '0 1rem 1rem', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
          <div style={{ paddingTop: '0.75rem' }}>{children}</div>
        </div>
      )}
    </div>
  )
}

// ── The empty banner that opens under a role ────────────────────────────────
// TODO(backend) [3]: render the individuals trained in `role` here.
//   Props you get:
//     role    – string from ROLES, e.g. 'Intake'
//     people  – roster entries for this role that pass the current filters:
//               [{ id, name, slots: [{ day, shift }] }]
//     supabase – client, in case this panel should fetch its own data
//   Suggested row: name, date trained, trained by, and a status badge.
//   If you add per-row actions (mark trained / remove), call a reload of the
//   parent data afterwards so counts stay accurate.
function TrainedPanel({ role, people, supabase }) { // eslint-disable-line no-unused-vars
  return (
    <div style={{ padding: '1.25rem', borderRadius: '8px', border: '1px dashed var(--border)', background: 'var(--surface)', textAlign: 'center' }}>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
        Trained volunteers for {role} will appear here.
      </p>
    </div>
  )
}

export default function TrainingTab({ supabase }) {
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  // UI state
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [expandedRoles, setExpandedRoles] = useState(() => new Set())
  const [filterRole, setFilterRole] = useState('all')   // position
  const [filterName, setFilterName] = useState('')      // person's name
  const [filterDay, setFilterDay] = useState('all')     // slot: day
  const [filterShift, setFilterShift] = useState('all') // slot: shift

  function showToast(text, type) {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3500)
  }

  // ── DATA LOADING ──────────────────────────────────────────────────────────
  // TODO(backend) [1]: replace the body of this function.
  //
  // Suggested query (same columns the admin Scheduling tab loads):
  //
  //   const { data, error } = await supabase
  //     .from('schedule')
  //     .select('id,volunteer_id,day_of_week,shift_time,role,start_date,end_date,week_pattern,profiles(id,full_name,status)')
  //     .order('role')
  //   if (error) { showToast(error.message, 'error'); return }
  //   setAssignments(data || [])
  //
  // Decide [5] while you're here — a "scheduled for this slot" filter probably
  // shouldn't include rows whose end_date is in the past or whose start_date is
  // in the future. Either filter in the query (.or('end_date.is.null,end_date.gte.<today>'))
  // or in the roster memo below. week_pattern (odd/even) can be ignored for a
  // simple "who is ever on this slot" view, or handled with
  // recurringAppliesToDate-style logic if you want a specific date.
  //
  // TODO(backend) [2]: also load trained records here, e.g. suggested table:
  //   volunteer_trainings(id, volunteer_id, role, trained_at, trained_by)
  //   and store them in their own state (setTrainings). Then in the `roster`
  //   memo below, add trained people who have no schedule row so the name
  //   filter finds them too.
  async function loadAssignments() {
    setLoading(true)
    if (USE_SAMPLE_DATA) {
      setAssignments(SAMPLE_ASSIGNMENTS)
    } else {
      setAssignments([]) // TODO(backend): remove once the query above is in place
    }
    setLoading(false)
  }

  useEffect(() => {
    loadAssignments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── ROSTER: role → people (deduped), each with the slots they work ───────
  const roster = useMemo(() => {
    const byRole = {}
    for (const row of assignments) {
      if (!row.role) continue
      if ((row.profiles?.status ?? 'active') === 'inactive') continue // matches Volunteers tab default
      const people = (byRole[row.role] ||= new Map())
      const person = people.get(row.volunteer_id) || { id: row.volunteer_id, name: row.profiles?.full_name || 'Unknown', slots: [] }
      person.slots.push({ day: String(row.day_of_week || '').toLowerCase(), shift: row.shift_time })
      people.set(row.volunteer_id, person)
    }
    const out = {}
    for (const [role, people] of Object.entries(byRole)) out[role] = [...people.values()]
    return out
  }, [assignments])

  // ── FILTERING ─────────────────────────────────────────────────────────────
  const nameQuery = filterName.trim().toLowerCase()
  const slotFilterActive = filterDay !== 'all' || filterShift !== 'all'
  const personFilterActive = nameQuery !== '' || slotFilterActive
  const activeFilterCount = [filterRole !== 'all', nameQuery !== '', filterDay !== 'all', filterShift !== 'all'].filter(Boolean).length

  const visibleRoles = useMemo(() => {
    return ROLES
      .filter(role => filterRole === 'all' || role === filterRole)
      .map(role => {
        const people = roster[role] || []
        const matching = people.filter(p => {
          if (nameQuery && !p.name.toLowerCase().includes(nameQuery)) return false
          if (slotFilterActive) {
            return p.slots.some(s =>
              (filterDay === 'all' || s.day === filterDay.toLowerCase()) &&
              (filterShift === 'all' || s.shift === filterShift))
          }
          return true
        })
        return { role, total: people.length, matching }
      })
      // When filtering by name or slot, hide positions nobody matches.
      .filter(r => !personFilterActive || r.matching.length > 0)
  }, [roster, filterRole, nameQuery, filterDay, filterShift, personFilterActive, slotFilterActive])

  function toggleRole(role) {
    setExpandedRoles(prev => {
      const next = new Set(prev)
      next.has(role) ? next.delete(role) : next.add(role)
      return next
    })
  }

  function clearFilters() {
    setFilterRole('all'); setFilterName(''); setFilterDay('all'); setFilterShift('all')
  }

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <style>{`
        .training-banner-btn:focus-visible,
        .training-filters-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
      `}</style>

      {USE_SAMPLE_DATA && (
        <div style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)', color: '#b45309', fontSize: '0.8rem' }}>
          Showing sample people so you can try the filters. Set USE_SAMPLE_DATA to false in TrainingTab.jsx once the backend is connected.
        </div>
      )}

      {/* Filters — same collapsible card as the Volunteers tab */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <button
          className="training-filters-btn"
          onClick={() => setFiltersOpen(o => !o)}
          aria-expanded={filtersOpen}
          style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', color: 'var(--text)' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Filters</span>
            {activeFilterCount > 0 && (
              <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: 'var(--accent)', color: '#fff', fontFamily: 'DM Mono, monospace' }}>{activeFilterCount}</span>
            )}
          </span>
          <span aria-hidden="true" style={{ transform: filtersOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--muted)' }}>▾</span>
        </button>
        {filtersOpen && (
          <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <input
                aria-label="Search by volunteer name"
                placeholder="Search volunteer name…"
                value={filterName}
                onChange={e => setFilterName(e.target.value)}
                style={{ ...inputStyle, flex: 1, minWidth: '200px' }}
              />
              <select aria-label="Filter by position" value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
                <option value="all">All positions</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <select aria-label="Filter by day" value={filterDay} onChange={e => setFilterDay(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
                <option value="all">Any day</option>
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select aria-label="Filter by shift" value={filterShift} onChange={e => setFilterShift(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
                <option value="all">Any shift</option>
                {SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} style={pillBtn(false)}>Clear filters</button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* One banner per role */}
      {loading ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Loading…</p>
      ) : visibleRoles.length === 0 ? (
        <div style={card}>
          <p style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
            No positions match these filters.{' '}
            <button onClick={clearFilters} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 'inherit', textDecoration: 'underline' }}>Clear filters</button>
          </p>
        </div>
      ) : (
        <>
          <p style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
            Showing {visibleRoles.length} of {ROLES.length} positions
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {visibleRoles.map(({ role, total, matching }) => {
              const count = personFilterActive ? matching.length : total
              const noun = personFilterActive ? 'matching' : 'scheduled'
              return (
                <RoleBanner
                  key={role}
                  label={role}
                  meta={`${count} ${noun}`}
                  isOpen={expandedRoles.has(role)}
                  onToggle={() => toggleRole(role)}
                  panelId={`training-panel-${role.replace(/\W+/g, '-').toLowerCase()}`}
                >
                  <TrainedPanel role={role} people={matching} supabase={supabase} />
                </RoleBanner>
              )
            })}
          </div>
        </>
      )}

      {toast && (
        <div role="status" style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'success' ? 'var(--accent)' : '#dc2626', color: '#fff', padding: '0.75rem 1.5rem', borderRadius: '100px', fontWeight: 500, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 200 }}>
          {toast.text}
        </div>
      )}
    </div>
  )
}