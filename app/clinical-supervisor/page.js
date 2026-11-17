'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { getMountainNow, asUTC, formatDateTime } from '../../lib/timeUtils'
import { SHIFTS, ROLES, getRoleCapacity, AFFILIATION_LABELS } from '../../lib/constants'
// import LunchScheduler from '../../components/LunchScheduler'
import ProviderScheduleView from '../../components/ProviderScheduleView'
import Live from '../../components/Live'
import WeeklyTraining from '../../components/WeeklyTraining'
import WeeklyTrainingCompletion from '../../components/WeeklyTrainingCompletion'
import LanguageCoverage from '../../components/LanguageCoverage'

const CALLOUTS_LIMIT = 60

const MAIN_TABS = [
  ['live', 'Live'],
  ['schedule', 'Schedule'],
]

const OTHER_TABS = [
  ['languages', 'Language Coverage'],
  ['providers', 'Providers'],
]

// Office Managers get a different (view-only, except Weekly Training) layout:
// full schedule, all volunteers, guest organizations, and the weekly training editor.
const OM_MAIN_TABS = [
  ['live', 'Live'],
  ['schedule', 'Schedule'],
  ['volunteers', 'Volunteers'],
  ['guests', 'Guest Orgs'],
  ['training', 'Weekly Training'],
]

// Full profile columns so the read-only volunteer detail view has what it needs.
const OM_PROFILE_COLS = 'id,full_name,email,phone,role,affiliation,status,status_reason,credentials,languages,default_role,school,major,sma_name,sma_contact,advisor_name,advisor_contact,intern_school,intern_department,end_date,avatar_url'

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
  return <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: 0 }}>{children}</p>
}

function ExpandableSection({ label, isOpen, onToggle, count, children, loading: isLoading }) {
  return (
    <div style={{ borderRadius: '10px', border: `1px solid ${isOpen ? 'var(--accent)' : 'var(--border)'}`, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1rem', background: isOpen ? 'rgba(2,65,107,0.05)' : 'var(--bg)', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', color: isOpen ? 'var(--accent)' : 'var(--text)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '0.85rem', color: 'var(--muted)' }}>›</span>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{label}</span>
          {count !== undefined && count !== null && (
            <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: isOpen ? 'rgba(2,65,107,0.15)' : 'var(--surface)', color: isOpen ? 'var(--accent)' : 'var(--muted)', border: '1px solid var(--border)', fontFamily: 'DM Mono, monospace' }}>{count}</span>
          )}
        </div>
        {isLoading && <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Loading...</span>}
      </button>
      {isOpen && (
        <div style={{ padding: '0 1rem 1rem', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
          <div style={{ paddingTop: '0.75rem' }}>{children}</div>
        </div>
      )}
    </div>
  )
}

// ── Schedule (view only) ─────────────────────────────────────────────────────
function OfficeManagerSchedule({ schedule = [], callouts = [] }) {
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

// ── Volunteers (view only, with hours/headshots/recent shifts) ───────────────
function OfficeManagerVolunteers({ volunteers = [], schedule = [] }) {
  const [search, setSearch] = useState('')
  const [affiliation, setAffiliation] = useState('all')
  const [defaultRole, setDefaultRole] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [photoUrl, setPhotoUrl] = useState(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [totalHours, setTotalHours] = useState(null)
  const [loadingHours, setLoadingHours] = useState(false)
  const [recentShifts, setRecentShifts] = useState([])
  const [loadingRecent, setLoadingRecent] = useState(false)
  const [showRecent, setShowRecent] = useState(false)

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

  async function openVolunteer(v) {
    setSelected(v)
    setShowRecent(false)
    setRecentShifts([])
    setTotalHours(null)
    setPhotoUrl(null)
    if (v.avatar_url) {
      setPhotoLoading(true)
      const { data } = await supabase.storage.from('avatars').createSignedUrl(v.avatar_url, 3600)
      setPhotoUrl(data?.signedUrl || null)
      setPhotoLoading(false)
    }
    setLoadingHours(true)
    const { data: shifts } = await supabase
      .from('shifts')
      .select('clock_in,clock_out')
      .eq('volunteer_id', v.id)
      .not('clock_out', 'is', null)
    const total = (shifts || []).reduce((acc, s) => acc + (asUTC(s.clock_out) - asUTC(s.clock_in)) / 3600000, 0).toFixed(1)
    setTotalHours(total)
    setLoadingHours(false)
  }

  async function toggleRecent(volunteerId) {
    if (showRecent) { setShowRecent(false); return }
    setShowRecent(true)
    setLoadingRecent(true)
    const { data } = await supabase
      .from('shifts')
      .select('id,clock_in,clock_out,role')
      .eq('volunteer_id', volunteerId)
      .not('clock_out', 'is', null)
      .order('clock_in', { ascending: false })
      .limit(10)
    setRecentShifts(data || [])
    setLoadingRecent(false)
  }

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
          <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.3rem', color: 'var(--accent)', border: '2px solid var(--accent)', flexShrink: 0, overflow: 'hidden' }}>
            {photoLoading ? <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>…</span> : photoUrl ? <img src={photoUrl} alt={selected.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : selected.full_name?.charAt(0)}
          </div>
          <div>
            <h2 style={{ fontWeight: 600, fontSize: '1.2rem', margin: 0 }}>{selected.full_name}</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>{selected.email}</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', margin: '0.2rem 0 0' }}>{loadingHours ? 'Loading hours…' : totalHours !== null ? `${totalHours}h total` : ''}</p>
            {isInactive && <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0.25rem 0 0' }}>Inactive{selected.status_reason ? ` — ${selected.status_reason}` : ''}</p>}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <button onClick={() => toggleRecent(selected.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '10px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: showRecent ? 'rgba(2,65,107,0.08)' : 'var(--bg)', border: `1px solid ${showRecent ? 'var(--accent)' : 'var(--border)'}`, color: showRecent ? 'var(--accent)' : 'var(--text)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}><span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Recent Shifts</span><span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>last 10</span></div>
            <span style={{ display: 'inline-block', transform: showRecent ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--muted)' }}>›</span>
          </button>
          {showRecent && (
            <div style={{ borderRadius: '10px', border: '1px solid var(--accent)', overflow: 'hidden', background: 'var(--bg)' }}>
              <div style={{ padding: '0.65rem 1rem', background: 'rgba(2,65,107,0.06)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)' }}>Recent Shifts</span>
                {!loadingRecent && <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>{recentShifts.length} shown</span>}
                {loadingRecent && <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Loading…</span>}
              </div>
              {loadingRecent ? (
                <div style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.85rem' }}>Loading…</div>
              ) : recentShifts.length === 0 ? (
                <div style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>No completed shifts on record.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {recentShifts.map((s, i) => {
                    const hours = s.clock_out ? ((asUTC(s.clock_out) - asUTC(s.clock_in)) / 3600000).toFixed(1) : null
                    return (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 1rem', borderBottom: i < recentShifts.length - 1 ? '1px solid var(--border)' : 'none', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div>
                          <p style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.82rem', color: 'var(--text)', margin: 0 }}>{formatDateTime(s.clock_in)}</p>
                          {s.role && <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '0.15rem 0 0' }}>{s.role}</p>}
                        </div>
                        <div>{hours && <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.88rem', fontWeight: 600, color: 'var(--accent)' }}>{hours}h</span>}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
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
                  onClick={() => openVolunteer(v)}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', background: inactive ? 'rgba(156,163,175,0.06)' : 'var(--bg)', cursor: 'pointer', opacity: inactive ? 0.7 : 1 }}
                >
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', minWidth: 0 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: inactive ? 'var(--muted)' : 'var(--accent)', flexShrink: 0 }}>
                      {v.full_name?.charAt(0)}
                    </div>
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

// ── Guest Organizations (view only) ──────────────────────────────────────────
function OfficeManagerGuestOrgs() {
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(true)
  const [orgs, setOrgs] = useState([])
  const [recent, setRecent] = useState([])
  const [totals, setTotals] = useState({})
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [{ data: orgRows }, { data: recentRows }] = await Promise.all([
          supabase.from('guest_organizations').select('id,name,is_active').order('name'),
          supabase.from('guest_hours_submissions')
            .select('id,guest_name,organization_id,work_date,arrival_time,exit_time,duration_hours,submitted_at')
            .order('submitted_at', { ascending: false })
            .limit(60),
        ])
        if (cancelled) return
        setOrgs(orgRows || [])
        setRecent(recentRows || [])
        let from = 0
        const t = {}
        for (;;) {
          const { data, error } = await supabase
            .from('guest_hours_submissions')
            .select('organization_id,duration_hours')
            .range(from, from + 999)
          if (error || !data || data.length === 0) break
          data.forEach(r => {
            if (!t[r.organization_id]) t[r.organization_id] = { hours: 0, count: 0 }
            t[r.organization_id].hours += Number(r.duration_hours) || 0
            t[r.organization_id].count += 1
          })
          if (data.length < 1000) break
          from += 1000
        }
        if (!cancelled) setTotals(t)
      } catch (e) {
        if (!cancelled) { setOrgs([]); setRecent([]); setTotals({}) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <ReadOnlyNotice>View only — guest organization management is handled by an administrator.</ReadOnlyNotice>
      <ExpandableSection label="Guest Organizations" isOpen={open} onToggle={() => setOpen(o => !o)} loading={loading} count={orgs.length || undefined}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {orgs.length === 0 && !loading ? (
            <p style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: '0.85rem' }}>No guest organizations found.</p>
          ) : (
            orgs.map(org => {
              const t = totals[org.id]
              const orgRecent = recent.filter(r => r.organization_id === org.id).slice(0, 10)
              const expanded = expandedId === org.id
              const inactive = !org.is_active
              return (
                <div key={org.id} style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', background: inactive ? 'rgba(156,163,175,0.06)' : 'var(--bg)', opacity: inactive ? 0.75 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button onClick={() => setExpandedId(expanded ? null : org.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textAlign: 'left', padding: 0, color: 'var(--text)' }}>
                      <span style={{ fontWeight: 600 }}>{org.name}</span>
                      <span style={{ color: 'var(--muted)', fontSize: '0.8rem', marginLeft: '0.6rem', fontFamily: 'DM Mono, monospace' }}>
                        {t ? `${Number(t.hours).toFixed(1)}h · ${t.count} ${t.count === 1 ? 'entry' : 'entries'}` : '—'}
                      </span>
                      <span style={{ color: 'var(--muted)', fontSize: '0.8rem', marginLeft: '0.4rem' }}>{expanded ? '▾' : '›'}</span>
                    </button>
                    {inactive && <span style={badgeStyle('#9ca3af')}>inactive</span>}
                  </div>
                  {expanded && (
                    <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {orgRecent.length === 0 ? (
                        <p style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: '0.82rem' }}>No submissions yet.</p>
                      ) : orgRecent.map(r => (
                        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.82rem', padding: '0.4rem 0.6rem', background: 'var(--surface)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                          <span style={{ fontWeight: 500 }}>{r.guest_name} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {r.work_date} · {String(r.arrival_time).slice(0, 5)}–{String(r.exit_time).slice(0, 5)}</span></span>
                          <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--muted)', flexShrink: 0 }}>{Number(r.duration_hours).toFixed(2)}h</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </ExpandableSection>
    </div>
  )
}

function dropdownItemStyle(active) {
  return {
    width: '100%',
    textAlign: 'left',
    padding: '0.6rem 0.75rem',
    borderRadius: '8px',
    border: 'none',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--text)',
    fontSize: '0.9rem',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'DM Sans, sans-serif',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  }
}

function HeaderMenu({ label, items, activeTab, open, onToggle, onClose, onSelectTab }) {
  const isActive = items.some(([key]) => key === activeTab)
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onToggle}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'DM Sans, sans-serif',
          fontSize: '0.95rem',
          fontWeight: isActive || open ? 600 : 500,
          color: isActive || open ? 'var(--text)' : 'var(--muted)',
        }}
      >
        {label}
      </button>

      {open && (
        <>
          <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 0.9rem)', right: 0,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px',
            minWidth: '210px', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.15rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 1001,
          }}>
            {items.map(([key, itemLabel]) => (
              <button key={key} onClick={() => { onClose(); onSelectTab(key) }} style={dropdownItemStyle(activeTab === key)}>
                {itemLabel}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function DesktopHeader({ activeTab, onSelectTab, otherOpen, onToggleOther, onCloseOther, onSwitchView, onSignOut, mainTabs = MAIN_TABS }) {
  const otherActive = OTHER_TABS.some(([key]) => key === activeTab)

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', padding: '0.5rem 0' }}>
      <img src="/logos/logo2-96.webp" alt="Logo" style={{ width: '42px', height: '42px', objectFit: 'contain' }} />

      <nav style={{ display: 'flex', alignItems: 'center', gap: '2.25rem' }}>
        {mainTabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => onSelectTab(key)}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif', fontSize: '0.95rem',
              fontWeight: activeTab === key ? 600 : 500,
              color: activeTab === key ? 'var(--text)' : 'var(--muted)',
            }}
          >
            {label}
          </button>
        ))}

        <div style={{ position: 'relative' }}>
          <button
            onClick={onToggleOther}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: '0.95rem',
              fontWeight: otherActive || otherOpen ? 600 : 500,
              color: otherActive || otherOpen ? 'var(--text)' : 'var(--muted)',
            }}
          >
            Other
          </button>

          {otherOpen && (
            <>
              <div onClick={onCloseOther} style={{ position: 'fixed', inset: 0, zIndex: 1000 }} />
              <div style={{
                position: 'absolute', top: 'calc(100% + 0.9rem)', right: 0,
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px',
                minWidth: '210px', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.15rem',
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 1001,
              }}>
                <button onClick={() => { onCloseOther(); onSwitchView() }} style={dropdownItemStyle(false)}>Volunteer View</button>
                {OTHER_TABS.map(([key, label]) => (
                  <button key={key} onClick={() => { onCloseOther(); onSelectTab(key) }} style={dropdownItemStyle(activeTab === key)}>{label}</button>
                ))}
                <button onClick={() => { onCloseOther(); onSignOut() }} style={{ ...dropdownItemStyle(false), color: 'var(--muted)', marginTop: '0.3rem', borderTop: '1px solid var(--border)', paddingTop: '0.65rem', borderRadius: 0 }}>Sign out</button>
              </div>
            </>
          )}
        </div>
      </nav>
    </div>
  )
}

function OfficeManagerDesktopHeader({ activeTab, onSelectTab, openMenu, onToggleMenu, onCloseMenu, onSwitchView, onSignOut }) {
  const volunteerItems = [
    ['live', 'Live'],
    ['schedule', 'Schedule'],
    ['volunteers', 'Volunteers'],
    ['guests', 'Guest Orgs'],
  ]
  const trainingItems = [
    ['training', 'Weekly Training'],
    ['training-completion', 'Training Completion'],
  ]
  const otherItems = [
    ['languages', 'Language Coverage'],
    ['providers', 'Provider Schedule'],
  ]
  const otherActive = otherItems.some(([key]) => key === activeTab)
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', padding: '0.5rem 0' }}>
      <img src="/logos/logo2-96.webp" alt="Logo" style={{ width: '42px', height: '42px', objectFit: 'contain' }} />
      <nav style={{ display: 'flex', alignItems: 'center', gap: '2.25rem' }}>
        <HeaderMenu label="Volunteers" items={volunteerItems} activeTab={activeTab} open={openMenu === 'volunteers'} onToggle={() => onToggleMenu('volunteers')} onClose={onCloseMenu} onSelectTab={onSelectTab} />
        <HeaderMenu label="Training" items={trainingItems} activeTab={activeTab} open={openMenu === 'training'} onToggle={() => onToggleMenu('training')} onClose={onCloseMenu} onSelectTab={onSelectTab} />
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => onToggleMenu('other')}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif', fontSize: '0.95rem',
              fontWeight: otherActive || openMenu === 'other' ? 600 : 500,
              color: otherActive || openMenu === 'other' ? 'var(--text)' : 'var(--muted)',
            }}
          >
            Other
          </button>
          {openMenu === 'other' && (
            <>
              <div onClick={onCloseMenu} style={{ position: 'fixed', inset: 0, zIndex: 1000 }} />
              <div style={{
                position: 'absolute', top: 'calc(100% + 0.9rem)', right: 0,
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px',
                minWidth: '210px', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.15rem',
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 1001,
              }}>
                <button onClick={() => { onCloseMenu(); onSwitchView() }} style={dropdownItemStyle(false)}>Volunteer View</button>
                {otherItems.map(([key, label]) => (
                  <button key={key} onClick={() => { onCloseMenu(); onSelectTab(key) }} style={dropdownItemStyle(activeTab === key)}>{label}</button>
                ))}
                <button onClick={() => { onCloseMenu(); onSignOut() }} style={{ ...dropdownItemStyle(false), color: 'var(--muted)', marginTop: '0.3rem', borderTop: '1px solid var(--border)', paddingTop: '0.65rem', borderRadius: 0 }}>Sign out</button>
              </div>
            </>
          )}
        </div>
      </nav>
    </div>
  )
}

function MobileSidebar({ open, onClose, navItems, activeTab, onSelectTab, showSwitchView, onSwitchView, onSignOut }) {
  function handleItemClick(action) { action(); onClose() }
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 0.25s ease', zIndex: 1000 }} />
      <div style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: '78%', maxWidth: '300px', background: 'var(--surface)', borderRight: '1px solid var(--border)', transform: open ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.25s ease', zIndex: 1001, display: 'flex', flexDirection: 'column', padding: '1.25rem 1rem', overflowY: 'auto' }}>
        <button onClick={onClose} style={{ alignSelf: 'flex-end', background: 'none', border: 'none', color: 'var(--muted)', fontSize: '1.3rem', cursor: 'pointer', padding: '0.25rem 0.5rem', marginBottom: '0.5rem' }}>✕</button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {showSwitchView && (
            <button onClick={() => handleItemClick(onSwitchView)} style={{ width: '100%', textAlign: 'left', padding: '0.9rem 1rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.95rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Volunteer View</button>
          )}
          {navItems.map(({ key, label }) => (
            <button key={key} onClick={() => handleItemClick(() => onSelectTab(key))} style={{ width: '100%', textAlign: 'left', padding: '0.9rem 1rem', borderRadius: '10px', border: activeTab === key ? 'none' : '1px solid var(--border)', background: activeTab === key ? 'var(--accent)' : 'var(--bg)', color: activeTab === key ? '#fff' : 'var(--text)', fontSize: '0.95rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{label}</button>
          ))}
          <button onClick={() => handleItemClick(onSignOut)} style={{ width: '100%', textAlign: 'left', padding: '0.9rem 1rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--muted)', fontSize: '0.95rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', marginTop: '0.5rem' }}>Sign out</button>
        </div>
      </div>
    </>
  )
}

export default function CSPage() {
  const router = useRouter()

  const [loading, setLoading]           = useState(true)
  const [authorized, setAuthorized]     = useState(false)
  const [currentTime, setCurrentTime]   = useState(getMountainNow())
  const [myProfile, setMyProfile]       = useState(null)

  const [activeShifts, setActiveShifts] = useState([])
  const [schedule, setSchedule]         = useState([])
  const [volunteers, setVolunteers]     = useState([])
  const [callouts, setCallouts]         = useState([])
  const [mySchedule, setMySchedule]     = useState([])

  const [tab, setTab]                   = useState('live')
  const [selectedContact, setSelectedContact] = useState(null)
  const [langModal, setLangModal]       = useState(null)

  const [isMobile, setIsMobile] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [otherOpen, setOtherOpen] = useState(false)
  const [openMenu, setOpenMenu] = useState(null) // OM desktop header menus: 'volunteers' | 'training' | 'other' | null
  useEffect(() => {
    const ua = navigator.userAgent || navigator.vendor || ''
    const isMobileUA = /android|iphone|ipad|ipod|iemobile|blackberry|opera mini|mobile/i.test(ua)
    const check = () => {
      const isNarrow = window.innerWidth < 428
      setIsMobile(isMobileUA || isNarrow)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    checkAccess()
    const tick = setInterval(() => setCurrentTime(getMountainNow()), 60000)
    return () => clearInterval(tick)
  }, [])

  async function checkAccess() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, default_role, role, phone, languages, affiliation, email')
      .eq('id', user.id)
      .single()

    if (profile?.default_role !== 'Clinical Supervisor' && profile?.default_role !== 'Office Manager' && profile?.role !== 'admin') {
      router.push('/volunteer')
      return
    }

    setMyProfile(profile)
    setAuthorized(true)
    await loadData(user.id, profile?.default_role === 'Office Manager')
    setLoading(false)
  }

  async function loadCallouts() {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
    const cols = 'id,volunteer_id,callout_date,day_of_week,shift_time,role,reason,status,is_read,covered_by,submitted_at,volunteer:profiles!callouts_volunteer_id_fkey(full_name)'

    const [{ data: pendingData }, { data: approvedData }] = await Promise.all([
      supabase.from('callouts').select(cols)
        .gte('callout_date', todayStr)
        .or('status.eq.pending,status.is.null')
        .order('callout_date', { ascending: true })
        .limit(CALLOUTS_LIMIT),
      supabase.from('callouts').select(cols)
        .gte('callout_date', todayStr)
        .eq('status', 'approved')
        .order('callout_date', { ascending: true })
        .limit(CALLOUTS_LIMIT),
    ])

    const pending  = (pendingData  || [])
    const approved = (approvedData || []).filter(a => !pending.some(p => p.id === a.id))
    const merged   = [...pending, ...approved].slice(0, CALLOUTS_LIMIT)

    setCallouts(merged.map(c => ({ ...c, profiles: c.volunteer, status: c.status ?? (c.is_read ? 'approved' : 'pending') })))
  }

  async function loadData(userId, isOM = false) {
    const [shiftsRes, schedRes, volsRes, mySchedRes] = await Promise.all([
      supabase.from('shifts').select('id, volunteer_id, clock_in, profiles(id, full_name)').is('clock_out', null),
      supabase.from('schedule').select('*, profiles(id, full_name)').order('role'),
      supabase.from('profiles').select(isOM ? OM_PROFILE_COLS : 'id, full_name, phone, languages, role, default_role, affiliation, email, status'),
      supabase.from('schedule').select('*').eq('volunteer_id', userId),
    ])

    setActiveShifts(shiftsRes.data || [])
    setSchedule(schedRes.data || [])
    setVolunteers(volsRes.data || [])
    setMySchedule(mySchedRes.data || [])

    await loadCallouts()
  }

  const mtnNow       = getMountainNow()
  const dayIndex     = mtnNow.getDay()
  const isWeekday    = dayIndex >= 1 && dayIndex <= 5
  const h            = mtnNow.getHours() + mtnNow.getMinutes() / 60
  const currentShift = h >= 10 && h < 14 ? '10-2' : h >= 14 && h < 18 ? '2-6' : null
  const currentDay   = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dayIndex]

  function getVol(id) { return volunteers.find(v => v.id === id) }
  function openVolunteer(vol) { if (vol) setSelectedContact(vol) }

  const clockedInIds = new Set(activeShifts.map(s => s.volunteer_id))

  const isOfficeManager = myProfile?.default_role === 'Office Manager'
  const mainTabs = isOfficeManager ? OM_MAIN_TABS : MAIN_TABS

  const myShiftCombos = mySchedule.reduce((acc, s) => {
    const key = `${s.day_of_week}|${s.shift_time}`
    if (!acc.find(x => x.key === key)) acc.push({ key, day: s.day_of_week, shift: s.shift_time })
    return acc
  }, [])

  function getEntriesForShift(day, shift) {
    return schedule.filter(s => s.day_of_week === day && s.shift_time === shift)
  }

  function getLangsForShift(day, shift) {
    const entries = getEntriesForShift(day, shift)
    const langs = new Set()
    entries.forEach(e => {
      const vol = getVol(e.volunteer_id)
      if (vol?.languages) {
        vol.languages.split(',').map(l => l.trim()).filter(Boolean).forEach(l => langs.add(l))
      }
    })
    return [...langs]
  }

  function speakersOf(lang, day, shift) {
    const shiftVolIds = new Set(getEntriesForShift(day, shift).map(e => e.volunteer_id))
    return volunteers.filter(v => shiftVolIds.has(v.id) && v.languages?.split(',').map(l => l.trim()).includes(lang))
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <p style={{ color: 'var(--muted)' }}>Loading...</p>
    </div>
  )

  if (!authorized) return null

  function LangBubble({ lang, highlighted, day, shift }) {
    const isOpen = langModal?.lang === lang && langModal?.day === day && langModal?.shift === shift
    return (
      <button
        onClick={() => setLangModal(isOpen ? null : { lang, day, shift })}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
          padding: '0.3rem 0.85rem', borderRadius: '100px', fontSize: '0.85rem', fontWeight: 500,
          cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
          background: highlighted ? 'rgba(74,222,128,0.12)' : 'rgba(96,165,250,0.1)',
          color:      highlighted ? '#4ade80'                : '#60a5fa',
          border:     `1px solid ${highlighted ? 'rgba(74,222,128,0.3)' : 'rgba(96,165,250,0.3)'}`,
          outline:    isOpen ? `2px solid ${highlighted ? '#4ade80' : '#60a5fa'}` : 'none',
          outlineOffset: '2px',
        }}
      >
        {lang}
      </button>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>

        {langModal && (() => {
          const speakers = speakersOf(langModal.lang, langModal.day, langModal.shift)
          const speakersIn = speakers.filter(v => clockedInIds.has(v.id))
          return (
            <div onClick={() => setLangModal(null)} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
              <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.5rem', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h3 style={{ fontWeight: 600, fontSize: '1rem', margin: 0 }}>{langModal.lang} speakers</h3>
                  <button onClick={() => setLangModal(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: '0.2rem' }}>✕</button>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '1rem', textTransform: 'capitalize' }}>
                  {langModal.day} · {langModal.shift} &nbsp;·&nbsp; {speakers.length} scheduled, {speakersIn.length} currently in
                </p>
                {speakers.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>No one scheduled for this shift speaks this language.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {speakers.map(vol => {
                      const isIn = clockedInIds.has(vol.id)
                      return (
                        <div key={vol.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0.85rem', background: isIn ? 'rgba(74,222,128,0.04)' : 'var(--bg)', borderRadius: '8px', border: `1px solid ${isIn ? 'rgba(74,222,128,0.3)' : 'var(--border)'}` }}>
                          <div>
                            <p style={{ fontWeight: 500, fontSize: '0.88rem', margin: 0 }}>{vol.full_name}</p>
                            {vol.default_role && <p style={{ color: 'var(--muted)', fontSize: '0.75rem', margin: 0 }}>{vol.default_role}</p>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {isIn && <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', fontWeight: 600 }}>in</span>}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                              {vol.phone && <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', color: 'var(--muted)' }}>{vol.phone}</span>}
                              {vol.email && <a href={`mailto:${vol.email}`} style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.75rem', color: 'var(--muted)', textDecoration: 'none' }}>{vol.email}</a>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {isMobile ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <button onClick={() => setSidebarOpen(true)} aria-label="Open menu" style={{ background: 'none', border: 'none', padding: '0.4rem', cursor: 'pointer' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <img src="/logos/logo2-96.webp" alt="Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
          </div>
        ) : isOfficeManager ? (
          <OfficeManagerDesktopHeader
            activeTab={tab}
            onSelectTab={setTab}
            openMenu={openMenu}
            onToggleMenu={(name) => setOpenMenu(m => (m === name ? null : name))}
            onCloseMenu={() => setOpenMenu(null)}
            onSwitchView={() => { window.location.href = '/volunteer' }}
            onSignOut={async () => { await supabase.auth.signOut(); window.location.href = '/' }}
          />
        ) : (
          <DesktopHeader
            activeTab={tab}
            onSelectTab={setTab}
            otherOpen={otherOpen}
            onToggleOther={() => setOtherOpen(o => !o)}
            onCloseOther={() => setOtherOpen(false)}
            onSwitchView={() => { window.location.href = '/volunteer' }}
            onSignOut={async () => { await supabase.auth.signOut(); window.location.href = '/' }}
            mainTabs={mainTabs}
          />
        )}

        <MobileSidebar
          open={isMobile && sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          navItems={(isOfficeManager ? [
            { key: 'live', label: 'Live' },
            { key: 'schedule', label: 'Schedule' },
            { key: 'volunteers', label: 'Volunteers' },
            { key: 'guests', label: 'Guest Orgs' },
            { key: 'training', label: 'Weekly Training' },
            { key: 'training-completion', label: 'Training Completion' },
            { key: 'languages', label: 'Language Coverage' },
            { key: 'providers', label: 'Provider Schedule' },
          ] : [...mainTabs, ...OTHER_TABS].map(([key, label]) => ({ key, label })))}
          activeTab={tab}
          onSelectTab={setTab}
          showSwitchView={true}
          onSwitchView={() => { window.location.href = '/volunteer' }}
          onSignOut={async () => { await supabase.auth.signOut(); window.location.href = '/' }}
        />

        {tab === 'live' && (
          <Live
            schedule={schedule}
            callouts={callouts}
            activeShifts={activeShifts}
            volunteers={volunteers}
            onOpenVolunteer={openVolunteer}
          />
        )}

        {/* Office Manager tabs (view-only, except Weekly Training) */}
        {isOfficeManager && tab === 'volunteers' && (
          <OfficeManagerVolunteers volunteers={volunteers} schedule={schedule} />
        )}
        {isOfficeManager && tab === 'guests' && <OfficeManagerGuestOrgs />}
        {isOfficeManager && tab === 'training' && (
          <WeeklyTraining supabase={supabase} profile={myProfile} />
        )}
        {isOfficeManager && tab === 'training-completion' && (
          <WeeklyTrainingCompletion supabase={supabase} profile={myProfile} />
        )}
        {isOfficeManager && tab === 'schedule' && (
          <OfficeManagerSchedule schedule={schedule} callouts={callouts} />
        )}
        {isOfficeManager && tab === 'languages' && (
          <LanguageCoverage volunteers={volunteers} schedule={schedule} />
        )}

        {tab === 'providers' && <ProviderScheduleView supabase={supabase} />}

        {/* Clinical Supervisor schedule/languages (personal only) */}
        {!isOfficeManager && tab === 'schedule' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
              Showing only the shifts you are personally scheduled for. Tap a name to expand contact info.
            </p>
            {myShiftCombos.length === 0 ? (
              <div style={card}><p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>You have no scheduled shifts on record.</p></div>
            ) : (
              myShiftCombos.map(({ key, day, shift }) => {
                const entries = getEntriesForShift(day, shift)
                const isCurrentSlot = isWeekday && currentDay === day && currentShift === shift
                return (
                  <div key={key} style={{ ...card, borderColor: isCurrentSlot ? 'var(--accent)' : 'var(--border)', background: isCurrentSlot ? 'rgba(2,65,107,0.03)' : 'var(--surface)' }}>
                    <h2 style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ textTransform: 'capitalize' }}>{day}</span>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--muted)', background: 'var(--bg)', padding: '0.15rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}>{shift}</span>
                      {isCurrentSlot && <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.5rem', borderRadius: '100px', background: 'rgba(2,65,107,0.12)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.35)', fontWeight: 600 }}>Now</span>}
                      <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 400 }}>{entries.length} scheduled</span>
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {entries.map(e => {
                        const vol        = getVol(e.volunteer_id)
                        const isExpanded = selectedContact?.id === e.volunteer_id
                        const isClockedIn = clockedInIds.has(e.volunteer_id)
                        return (
                          <div key={e.id} onClick={() => setSelectedContact(isExpanded ? null : vol)} style={{ padding: '0.6rem 0.85rem', background: 'var(--bg)', borderRadius: '7px', border: '1px solid var(--border)', cursor: 'pointer' }} onMouseEnter={ev => ev.currentTarget.style.borderColor = 'var(--accent)'} onMouseLeave={ev => ev.currentTarget.style.borderColor = 'var(--border)'}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>{vol?.full_name || 'Unknown'}</span>
                                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{e.role}</span>
                                {e.notes && <span style={{ fontSize: '0.72rem', color: '#60a5fa', fontStyle: 'italic' }}>({e.notes})</span>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {isClockedIn && isCurrentSlot && <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', fontWeight: 600 }}>in</span>}
                                <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{isExpanded ? '▲' : '▾'}</span>
                              </div>
                            </div>
                            {isExpanded && vol && (
                              <div style={{ marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                                <div>
                                  <p style={labelStyle}>Phone</p>
                                  <p style={{ fontSize: '0.85rem', fontFamily: 'DM Mono, monospace', color: vol.phone ? 'var(--text)' : 'var(--muted)', fontStyle: vol.phone ? 'normal' : 'italic', margin: 0 }}>{vol.phone || 'Not set'}</p>
                                </div>
                                <div>
                                  <p style={labelStyle}>Email</p>
                                  <p style={{ fontSize: '0.85rem', fontFamily: 'DM Mono, monospace', color: vol.email ? 'var(--text)' : 'var(--muted)', fontStyle: vol.email ? 'normal' : 'italic', margin: 0 }}>
                                    {vol.email ? <a href={`mailto:${vol.email}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>{vol.email}</a> : 'Not set'}
                                  </p>
                                </div>
                                {vol.languages && (
                                  <div>
                                    <p style={labelStyle}>Languages</p>
                                    <p style={{ fontSize: '0.85rem', margin: 0 }}>{vol.languages}</p>
                                  </div>
                                )}
                                {vol.affiliation && (
                                  <div>
                                    <p style={labelStyle}>Affiliation</p>
                                    <p style={{ fontSize: '0.85rem', textTransform: 'capitalize', margin: 0 }}>{vol.affiliation}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {!isOfficeManager && tab === 'languages' && (
          <LanguageCoverage volunteers={volunteers} schedule={schedule} />
        )}

        {/* {tab === 'lunch' && <LunchScheduler supabase={supabase} profile={myProfile} />} */}
      </div>
    </div>
  )
}
