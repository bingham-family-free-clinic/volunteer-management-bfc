'use client'

// Read-only Schedule and Volunteers views for the Office Manager.
// These mirror what the admin page shows on its Scheduling and Volunteers
// tabs, but contain NO editing controls and perform NO writes.

import { useState } from 'react'
import { SHIFTS, ROLES, getRoleCapacity, AFFILIATION_LABELS } from '../lib/constants'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
const HIDDEN_SCHEDULE_ROLES = ['Provider', 'Director']

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
const inputStyle = { width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', fontFamily: 'DM Sans, sans-serif' }
const labelStyle = { display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }
const affiliationColor = { missionary: '#818cf8', intern: '#150d5a', student: '#38bdf8', volunteer: '#02416B', provider: '#7dd3fc' }
const badgeStyle = (color) => ({ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 500, background: color + '22', color, border: `1px solid ${color}55` })
const pillBtn = (active, mono) => ({ padding: '0.45rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: mono ? 'DM Mono, monospace' : 'DM Sans, sans-serif', background: active ? (mono ? '#1e40af' : 'var(--accent)') : 'var(--surface)', color: active ? (mono ? '#bfdbfe' : '#fff') : 'var(--muted)', border: active ? 'none' : '1px solid var(--border)' })
const biweeklyBadge = { fontWeight: 600, background: '#dbeafe', color: '#1e3a8a', border: '1px solid #2563eb' }

function ReadOnlyNotice({ children }) {
  return (
    <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: 0 }}>{children}</p>
  )
}

// ── Schedule (view only) ─────────────────────────────────────────────────────
export function OfficeManagerSchedule({ schedule = [], callouts = [] }) {
  const [day, setDay] = useState('monday')
  const [shift, setShift] = useState(SHIFTS[0])
  const [date, setDate] = useState('')

  function getEntries(role) {
    if (!date) return schedule.filter(s => s.day_of_week === day && s.shift_time === shift && s.role === role)
    const d = new Date(date + 'T12:00:00')
    const target = d.getDay()
    let count = 0
    const check = new Date(d.getFullYear(), d.getMonth(), 1)
    while (check <= d) { if (check.getDay() === target) count++; check.setDate(check.getDate() + 1) }
    return schedule.filter(s => {
      if (s.day_of_week !== day || s.shift_time !== shift || s.role !== role) return false
      if (s.start_date && s.start_date > date) return false
      if (s.end_date && s.end_date < date) return false
      if (s.week_pattern === 'odd' && count % 2 !== 1) return false
      if (s.week_pattern === 'even' && count % 2 !== 0) return false
      return true
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {DAYS.map(d => (
            <button key={d} onClick={() => { setDay(d); setDate('') }} style={{ ...pillBtn(day === d, false), textTransform: 'capitalize' }}>{d.slice(0, 3)}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {SHIFTS.map(sh => (
            <button key={sh} onClick={() => { setShift(sh); setDate('') }} style={pillBtn(shift === sh, true)}>{sh}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
          <label style={{ ...labelStyle, margin: 0, whiteSpace: 'nowrap' }}>View date:</label>
          <input
            type="date"
            value={date}
            onChange={e => {
              const val = e.target.value
              setDate(val)
              if (val) {
                const name = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(val + 'T12:00:00').getDay()]
                if (name !== 'sunday' && name !== 'saturday') setDay(name)
              }
            }}
            style={{ ...inputStyle, width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
          />
        </div>
      </div>
      <div style={{ marginBottom: '1rem' }}><ReadOnlyNotice>View only — schedule changes are made by an administrator.</ReadOnlyNotice></div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {ROLES.filter(r => !HIDDEN_SCHEDULE_ROLES.includes(r)).map(role => {
          const entries = getEntries(role)
          const cap = getRoleCapacity(day, shift, role)
          return (
            <div key={role} style={{ ...card, padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: entries.length > 0 ? '0.75rem' : 0 }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{role}{cap ? ` — ${cap}` : ''}</span>
              </div>
              {entries.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {entries.map(entry => {
                    const out = date && callouts.find(c => c.volunteer_id === entry.volunteer_id && c.callout_date === date && c.shift_time === shift && c.status === 'approved')
                    return (
                      <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.75rem', borderRadius: '100px', fontSize: '0.85rem', background: out ? 'rgba(96,165,250,0.08)' : 'rgba(2,65,107,0.08)', border: `1px solid ${out ? 'rgba(96,165,250,0.4)' : 'rgba(2,65,107,0.35)'}`, color: out ? 'var(--warn)' : 'var(--text)' }}>
                        {out && <span style={{ fontSize: '0.7rem' }}>out</span>}
                        <span style={{ textDecoration: out ? 'line-through' : 'none', opacity: out ? 0.6 : 1 }}>{entry.profiles?.full_name}</span>
                        {entry.notes && <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontStyle: 'italic' }}>({entry.notes})</span>}
                        {(entry.start_date || entry.end_date) && <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontStyle: 'italic' }}>({entry.start_date ?? '...'} → {entry.end_date ?? '...'})</span>}
                        {entry.week_pattern && entry.week_pattern !== 'every' && <span style={{ ...biweeklyBadge, fontSize: '0.65rem', borderRadius: '4px', padding: '0.1rem 0.35rem' }}>{entry.week_pattern === 'odd' ? '1st&3rd' : '2nd&4th'}</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Volunteers (view only) ───────────────────────────────────────────────────
export function OfficeManagerVolunteers({ volunteers = [], schedule = [] }) {
  const [search, setSearch] = useState('')
  const [affiliation, setAffiliation] = useState('all')
  const [defaultRole, setDefaultRole] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selected, setSelected] = useState(null)

  const list = volunteers
    .filter(v => v.default_role !== 'Provider')
    .filter(v => showInactive || (v.status || 'active') === 'active')
    .filter(v => {
      if (search) {
        const q = search.toLowerCase()
        if (!(v.full_name || '').toLowerCase().includes(q) && !(v.email || '').toLowerCase().includes(q)) return false
      }
      if (affiliation !== 'all' && v.affiliation !== affiliation) return false
      if (defaultRole !== 'all' && v.default_role !== defaultRole) return false
      return true
    })
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))

  if (selected) {
    const isInactive = (selected.status || 'active') === 'inactive'
    const myShifts = schedule
      .filter(s => s.volunteer_id === selected.id)
      .sort((a, b) => DAYS.indexOf(a.day_of_week) - DAYS.indexOf(b.day_of_week) || String(a.shift_time).localeCompare(String(b.shift_time)))
    const fields = [
      { label: 'Phone', value: selected.phone },
      { label: 'Affiliation', value: AFFILIATION_LABELS[selected.affiliation] ?? selected.affiliation },
      { label: 'Credentials / Skills', value: selected.credentials },
      { label: 'Languages', value: selected.languages },
      { label: 'Role', value: selected.role },
      { label: 'Default Position', value: selected.default_role },
      { label: 'End Date', value: selected.end_date || null },
      ...(selected.affiliation === 'missionary' ? [{ label: 'SMA Name', value: selected.sma_name }, { label: 'SMA Contact', value: selected.sma_contact }] : []),
      ...(selected.affiliation === 'intern' ? [{ label: 'Advisor Name', value: selected.advisor_name }, { label: 'Advisor Contact', value: selected.advisor_contact }, { label: 'School', value: selected.intern_school }, { label: 'Department', value: selected.intern_department }] : []),
      ...(selected.affiliation === 'student' ? [{ label: 'School', value: selected.school }, { label: 'Major', value: selected.major }] : []),
    ]
    return (
      <div style={card}>
        <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.875rem', marginBottom: '1.25rem', padding: 0, fontFamily: 'DM Sans, sans-serif' }}>← Back</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.3rem', color: 'var(--accent)', border: '2px solid var(--accent)', flexShrink: 0 }}>
            {selected.full_name?.charAt(0)}
          </div>
          <div>
            <h2 style={{ fontWeight: 600, fontSize: '1.2rem', margin: 0 }}>{selected.full_name}</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>{selected.email}</p>
            {isInactive && (
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0.25rem 0 0' }}>
                Inactive{selected.status_reason ? ` — ${selected.status_reason}` : ''}
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {fields.map(({ label, value }) => (
            <div key={label} style={{ padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>{label}</p>
              <p style={{ fontSize: '0.9rem', margin: 0, color: value ? 'var(--text)' : 'var(--muted)', fontStyle: value ? 'normal' : 'italic' }}>{value || 'Not set'}</p>
            </div>
          ))}
        </div>
        <h3 style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.6rem' }}>Scheduled Shifts</h3>
        {myShifts.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>No scheduled shifts.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {myShifts.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', padding: '0.5rem 0.75rem', background: 'var(--bg)', borderRadius: '7px', border: '1px solid var(--border)', fontSize: '0.85rem' }}>
                <span><span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{s.day_of_week}</span> <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--muted)' }}>{s.shift_time}</span></span>
                <span style={{ color: 'var(--muted)' }}>
                  {s.role}
                  {s.week_pattern && s.week_pattern !== 'every' ? ` · ${s.week_pattern === 'odd' ? '1st & 3rd' : '2nd & 4th'}` : ''}
                  {(s.start_date || s.end_date) ? ` · ${s.start_date ?? '...'} → ${s.end_date ?? '...'}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <ReadOnlyNotice>View only — volunteer records are managed by an administrator.</ReadOnlyNotice>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <button onClick={() => setFiltersOpen(o => !o)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', color: 'var(--text)' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Filters</span>
          <span style={{ transform: filtersOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--muted)' }}>▾</span>
        </button>
        {filtersOpen && (
          <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <input placeholder="Search name or email…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: '200px' }} />
            <select value={affiliation} onChange={e => setAffiliation(e.target.value)} style={inputStyle}>
              <option value="all">All affiliations</option>
              {Object.entries(AFFILIATION_LABELS).filter(([k]) => k !== 'provider').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select value={defaultRole} onChange={e => setDefaultRole(e.target.value)} style={inputStyle}>
              <option value="all">All positions</option>
              {ROLES.filter(r => r !== 'Provider').map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={() => setShowInactive(s => !s)} style={pillBtn(showInactive, false)}>{showInactive ? 'Hide Inactive' : 'Show Inactive'}</button>
          </div>
        )}
      </div>

      <div style={card}>
        <h2 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.85rem' }}>
          Volunteers <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.8rem' }}>({list.length})</span>
        </h2>
        {list.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontStyle: 'italic' }}>No volunteers match these filters.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {list.map(v => {
              const inactive = (v.status ?? 'active') === 'inactive'
              return (
                <div
                  key={v.id}
                  onClick={() => setSelected(v)}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', background: inactive ? 'rgba(156,163,175,0.06)' : 'var(--bg)', cursor: 'pointer', opacity: inactive ? 0.7 : 1 }}
                >
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', minWidth: 0 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: inactive ? 'var(--muted)' : 'var(--accent)', flexShrink: 0 }}>{v.full_name?.charAt(0)}</div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 500, margin: 0 }}>{v.full_name}</p>
                      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.email}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                    {inactive && <span style={badgeStyle('#9ca3af')}>inactive</span>}
                    {v.affiliation && <span style={badgeStyle(affiliationColor[v.affiliation] ?? '#9ca3af')}>{AFFILIATION_LABELS[v.affiliation] ?? v.affiliation}</span>}
                    <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--muted)', fontSize: '0.8rem' }}>›</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}