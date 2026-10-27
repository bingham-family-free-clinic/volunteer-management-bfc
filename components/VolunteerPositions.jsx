'use client'

import { useMemo, useState, useEffect } from 'react'
import { ROLES, AFFILIATION_LABELS } from '../lib/constants'

// ── Style tokens (mirrors the admin Volunteers tab) ───────────────────────────
const card       = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
const inputStyle = { width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box' }

const affiliationColor = {
  missionary: '#818cf8',
  intern: '#150d5a',
  student: '#38bdf8',
  volunteer: '#02416B',
  provider: '#7dd3fc',
}

const AFFILIATION_OPTIONS = [
  ...Object.entries(AFFILIATION_LABELS).map(([value, label]) => ({ value, label })),
  { value: 'BYU', label: 'BYU' },
  { value: 'UVU', label: 'UVU' },
]

function badgeStyle(color) {
  return {
    display: 'inline-block',
    padding: '0.2rem 0.6rem',
    borderRadius: '100px',
    fontSize: '0.75rem',
    fontWeight: 500,
    background: color + '22',
    color,
    border: `1px solid ${color}55`,
  }
}

function pillBtn(active) {
  return {
    padding: '0.45rem 0.85rem',
    borderRadius: '8px',
    fontSize: '0.8rem',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'DM Sans, sans-serif',
    background: active ? 'var(--accent)' : 'var(--surface)',
    color: active ? '#fff' : 'var(--muted)',
    border: active ? 'none' : '1px solid var(--border)',
  }
}

function positionName(position) {
  if (typeof position === 'string') return position
  return position?.name ?? position?.label ?? position?.title ?? position?.default_role ?? ''
}

// Resolve a volunteer's roles. Newer data can supply a `roles` array; profiles
// that only have the legacy single `default_role` still work unchanged.
// `roleOverrides` holds optimistic UI updates keyed by volunteer id.
function volunteerRoleList(volunteer, roleOverrides = {}) {
  const override = volunteer?.id != null ? roleOverrides[volunteer.id] : undefined
  const raw = override !== undefined
    ? override
    : Array.isArray(volunteer?.roles)
    ? volunteer.roles
    : Array.isArray(volunteer?.positions)
    ? volunteer.positions
    : volunteer?.default_role
    ? [volunteer.default_role]
    : []
  return Array.from(new Set(raw.filter(Boolean)))
}

// ── One volunteer row, expandable into role management ───────────────────────
function VolunteerRow({
  volunteer,
  roles,
  allRoles,
  expanded,
  onToggle,
  onSelectVolunteer,
  onAddRole,
  onRemoveRole,
  isPending,
  error,
}) {
  const [selectedRole, setSelectedRole] = useState('')
  const isInactive = (volunteer.status ?? 'active') === 'inactive'
  const selectable = typeof onSelectVolunteer === 'function'
  const availableRoles = allRoles.filter(role => !roles.includes(role))

  async function handleAddRole() {
    if (!selectedRole || isPending) return
    const added = await onAddRole(volunteer, selectedRole)
    if (added) setSelectedRole('')
  }

  return (
    <div
      style={{
        borderRadius: '8px',
        border: '1px solid var(--border)',
        background: isInactive ? 'rgba(156,163,175,0.06)' : 'var(--surface)',
        opacity: isInactive ? 0.7 : 1,
        overflow: 'hidden',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={selectable ? e => { e.currentTarget.style.borderColor = 'var(--accent)' } : undefined}
      onMouseLeave={selectable ? e => { e.currentTarget.style.borderColor = 'var(--border)' } : undefined}
    >
    <div
        onClick={e => { e.stopPropagation(); onToggle() }}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.65rem 0.85rem',
          cursor: selectable ? 'pointer' : 'default',
        }}
    >
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', minWidth: 0 }}>
         <span style={{ fontSize: '0.65rem' }}>{expanded ? '▴' : '▾'}</span>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              color: isInactive ? 'var(--muted)' : 'var(--accent)',
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            {volunteer.avatar_url ? (
              <img src={volunteer.avatar_url} alt={volunteer.full_name || 'Volunteer'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              volunteer.full_name?.charAt(0) || '?'
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{volunteer.full_name || 'Unnamed volunteer'}</p>
            {volunteer.email && (
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{volunteer.email}</p>
            )}
          </div>
        </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', flexShrink: 0 }}>
          {isInactive && <span style={badgeStyle('#9ca3af')}>inactive</span>}
          {volunteer.role === 'admin' && <span style={badgeStyle('#f59e0b')}>admin</span>}
          {volunteer.affiliation && (
            <span style={badgeStyle(affiliationColor[volunteer.affiliation] ?? '#9ca3af')}>
              {AFFILIATION_LABELS[volunteer.affiliation] ?? volunteer.affiliation}
            </span>
          )}
          <button
            type="button"
            onClick={selectable ? () => onSelectVolunteer(volunteer) : undefined}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Hide' : 'Manage'} roles for ${volunteer.full_name || 'volunteer'}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.25rem 0.55rem',
              borderRadius: '6px',
              border: `1px solid ${expanded ? 'var(--accent)' : 'var(--border)'}`,
              background: expanded ? 'rgba(2,65,107,0.08)' : 'var(--bg)',
              color: expanded ? 'var(--accent)' : 'var(--muted)',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Info
            {selectable && <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--muted)', fontSize: '0.8rem' }}>›</span>}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0.85rem', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.55rem' }}>
            <p style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              Trained in
            </p>
            {isPending && <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Saving…</span>}
          </div>

          {roles.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: '0.82rem' }}>No roles assigned.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {roles.map(role => (
                <span
                  key={role}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.3rem 0.55rem',
                    borderRadius: '100px',
                    border: '1px solid rgba(2,65,107,0.3)',
                    background: 'rgba(2,65,107,0.08)',
                    color: 'var(--accent)',
                    fontSize: '0.78rem',
                    fontWeight: 500,
                  }}
                >
                  {role}
                  <button
                    type="button"
                    onClick={() => onRemoveRole(volunteer, role)}
                    disabled={isPending}
                    aria-label={`Remove ${role} from ${volunteer.full_name || 'volunteer'}`}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'inherit',
                      cursor: isPending ? 'not-allowed' : 'pointer',
                      fontSize: '0.72rem',
                      lineHeight: 1,
                      opacity: isPending ? 0.4 : 0.75,
                    }}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <select
              aria-label={`Add a role for ${volunteer.full_name || 'volunteer'}`}
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value)}
              disabled={isPending || availableRoles.length === 0}
              style={{ ...inputStyle, flex: 1, minWidth: '180px', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
            >
              <option value="">{availableRoles.length === 0 ? 'All roles assigned' : 'Select a role to add…'}</option>
              {availableRoles.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddRole}
              disabled={!selectedRole || isPending}
              style={{
                ...pillBtn(Boolean(selectedRole) && !isPending),
                padding: '0.5rem 0.9rem',
                cursor: !selectedRole || isPending ? 'not-allowed' : 'pointer',
                opacity: !selectedRole || isPending ? 0.6 : 1,
              }}
            >
              + Add role
            </button>
          </div>

          {error && <p style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '0.5rem' }}>{error}</p>}
        </div>
      )}
    </div>
  )
}

// ── One position + the volunteers assigned to it ─────────────────────────────
function PositionSection({
  group,
  collapsed,
  onToggle,
  onSelectVolunteer,
  allRoles,
  roleOverrides,
  expandedVolunteerKeys,
  onToggleVolunteer,
  onAddRole,
  onRemoveRole,
  pendingRole,
  roleErrors,
}) {
  const { name, volunteers } = group
  const inactiveCount = volunteers.filter(v => (v.status ?? 'active') === 'inactive').length

  return (
    <div
      style={{
        ...card,
        padding: 0,
        overflow: 'hidden',
        borderColor: !collapsed && volunteers.length > 0 ? 'var(--accent)' : 'var(--border)',
        transition: 'border-color 0.15s',
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={!collapsed}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          padding: '0.85rem 1rem',
          background: !collapsed ? 'rgba(2,65,107,0.05)' : 'var(--bg)',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'DM Sans, sans-serif',
          color: !collapsed ? 'var(--accent)' : 'var(--text)',
          textAlign: 'left',
          transition: 'background 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
          <span
            style={{
              display: 'inline-block',
              transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
              transition: 'transform 0.2s',
              fontSize: '0.85rem',
              color: 'var(--muted)',
              flexShrink: 0,
            }}
          >
            ›
          </span>
          <span style={{ fontWeight: 600, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </span>
          <span
            style={{
              fontSize: '0.72rem',
              padding: '0.1rem 0.45rem',
              borderRadius: '100px',
              background: !collapsed ? 'rgba(2,65,107,0.15)' : 'var(--surface)',
              color: !collapsed ? 'var(--accent)' : 'var(--muted)',
              border: '1px solid var(--border)',
              fontFamily: 'DM Mono, monospace',
              flexShrink: 0,
            }}
          >
            {volunteers.length}
          </span>
          {inactiveCount > 0 && (
            <span style={{ ...badgeStyle('#9ca3af'), fontSize: '0.68rem', flexShrink: 0 }}>
              {inactiveCount} inactive
            </span>
          )}
        </div>

        <span style={{ fontSize: '0.78rem', color: 'var(--muted)', flexShrink: 0 }}>
          {volunteers.length === 0 ? 'No volunteers' : volunteers.length === 1 ? '1 volunteer' : `${volunteers.length} volunteers`}
        </span>
      </button>

      {!collapsed && (
        <div style={{ padding: '0.75rem 1rem 1rem', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
          {volunteers.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: '0.85rem' }}>
              No volunteers assigned to this position.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {volunteers.map(volunteer => {
                const rowKey = `${name}:${volunteer.id}`
                return (
                  <VolunteerRow
                    key={volunteer.id}
                    volunteer={volunteer}
                    roles={volunteerRoleList(volunteer, roleOverrides)}
                    allRoles={allRoles}
                    expanded={expandedVolunteerKeys.has(rowKey)}
                    onToggle={() => onToggleVolunteer(rowKey)}
                    onSelectVolunteer={onSelectVolunteer}
                    onAddRole={onAddRole}
                    onRemoveRole={onRemoveRole}
                    isPending={pendingRole?.volunteerId === volunteer.id}
                    error={roleErrors[volunteer.id]}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Positions list ────────────────────────────────────────────────────────────
// Fetches profiles through Supabase, groups them by role/position, and renders
// one expandable section per position. Each volunteer row expands into a small
// role editor; persistence is delegated to the optional onAddRole/onRemoveRole
// callbacks supplied by the parent.
export default function VolunteerPositions({
//  volunteers = [],
  positions = ROLES,
  onSelectVolunteer,
  supabase,
  // Called when a role is added/removed. Both may be async and receive
  // (volunteer, role, nextRoles). Return false (or throw) to roll back the UI.
  onNewAddRole,
  onNewRemoveRole,
  title = 'Volunteer Positions',
  subtitle = 'Volunteers grouped by the positions they are trained in.',
  loading = false,
  showEmptyPositions = false,
}) {
  const [filterSearch, setFilterSearch] = useState('')
  const [filterAffiliation, setFilterAffiliation] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [showEmpty, setShowEmpty] = useState(showEmptyPositions)
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [expanded, setExpanded] = useState(() => new Set())

  const [volunteers, setVolunteers] = useState([])
  const [roleOverrides, setRoleOverrides] = useState({})
  const [expandedVolunteerKeys, setExpandedVolunteerKeys] = useState(() => new Set())
  const [pendingRole, setPendingRole] = useState(null)
  const [roleErrors, setRoleErrors] = useState({})
  const [loadError, setLoadError] = useState(null)

 async function setRoleOverridesFromSupabase(){
  const {data, error} = await supabase
        .from('person_role_qualifications')
        .select()
  if(error){
   setLoadError(error.message)
   return;
  } else {
   setLoadError(null)
  }
  const savedOverrides = {}
  for(const row of data){
   if(row.qualification != 'Trained') continue;
   if(!savedOverrides[row.person_id]){
    savedOverrides[row.person_id] = []
   }
   savedOverrides[row.person_id].push(row.role)
  }
  setRoleOverrides(savedOverrides)
 }

  async function pullVolunteersFromSupabase(){
    const {data, error} = await supabase
          .from('profiles')
          .select()
    if(error){
      setLoadError(error.message)
      return;
    } else {
      setLoadError(null)
      setVolunteers(data || [])
    }
  }

  useEffect(() => {
   if (!supabase) return;
   pullVolunteersFromSupabase()
   setRoleOverridesFromSupabase()
  }, [supabase]);

  // Role options = configured positions plus any already assigned to a
  // volunteer, so legacy/unknown roles remain removable.
  const allRoles = useMemo(() => {
    const configured = (positions || []).map(positionName).filter(Boolean)
    const assigned = (volunteers || []).flatMap(v => volunteerRoleList(v, roleOverrides))
    return Array.from(new Set([...configured, ...assigned]))
  }, [positions, volunteers, roleOverrides])

  const positionGroups = useMemo(() => {
    const query = filterSearch.trim().toLowerCase()

    const filtered = (volunteers || [])
      .filter(v => showInactive || (v.status || 'active') === 'active')
      .filter(v => {
        if (query && !(v.full_name || '').toLowerCase().includes(query) && !(v.email || '').toLowerCase().includes(query)) return false
        if (filterAffiliation !== 'all') {
          if (['missionary', 'student', 'volunteer', 'intern', 'provider'].includes(filterAffiliation) && v.affiliation !== filterAffiliation) return false
          if (filterAffiliation === 'BYU' && v.school !== 'BYU') return false
          if (filterAffiliation === 'UVU' && v.school !== 'UVU') return false
        }
        return true
      })

    const configured = Array.from(new Set((positions || []).map(positionName).filter(Boolean)))
    const groups = new Map(configured.map(name => [name, []]))

    filtered.forEach(v => {
      const roles = volunteerRoleList(v, roleOverrides)

      if (roles.length === 0) {
        if (!groups.has('Unassigned')) groups.set('Unassigned', [])
        groups.get('Unassigned').push(v)
        return
      }

      roles.forEach(name => {
        if (!groups.has(name)) groups.set(name, [])
        groups.get(name).push(v)
      })
    })

    // Only surface "Unassigned" when someone actually belongs there.
    if (!groups.has('Unassigned') || groups.get('Unassigned').length === 0) {
      groups.delete('Unassigned')
    }

    const showEmptyNow = showEmpty && !query

    return Array.from(groups.entries())
      .map(([name, list]) => ({
        name,
        volunteers: [...list].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')),
      }))
      .filter(group => showEmptyNow || group.volunteers.length > 0)
  }, [volunteers, positions, filterSearch, filterAffiliation, showInactive, showEmpty, roleOverrides])

  // Delete and replace for now when a role updates
  async function onRemoveRole(v,r,nr){
    //console.log("REMOVE ",v,r,nr);
    const {error: deleteError} = await supabase
          .from('person_role_qualifications')
          .delete()
          .eq('person_id', v.id)
    if(deleteError){
      console.warn('SUPABASE ERROR ', deleteError);
      return;
    }

    const newRows = nr.map((rn) => {return {person_id: v.id, role: rn, qualification: 'Trained'}})

    const {error: insertError} = await supabase
          .from('person_role_qualifications')
          .insert(newRows)
    onNewRemoveRole && onNewRemoveRole(v,r,nr);

    if(insertError){
      console.warn('SUPABASE ERROR ', insertError);
      return;
    }

   console.log(v,r,nr)
  }
  async function onAddRole(v,r,nr){
    const {error: deleteError} = await supabase
          .from('person_role_qualifications')
          .delete()
          .eq('person_id', v.id)
    if(deleteError){
      console.warn('SUPABASE ERROR ', deleteError);
      return;
    }

    const newRows = nr.map((rn) => {return {person_id: v.id, role: rn, qualification: 'Trained'}})

    const {error: insertError} = await supabase
          .from('person_role_qualifications')
          .insert(newRows)
    onNewRemoveRole && onNewRemoveRole(v,r,nr);

    if(insertError){
      console.warn('SUPABASE ERROR ', insertError);
      return;
    }

   onNewAddRole && onNewAddRole(v,r,nr);

   console.log(v,r,nr)
  }

  // A volunteer can appear under more than one role, so count unique people.
  const totalVolunteers = useMemo(() => {
    const ids = new Set()
    positionGroups.forEach(group => group.volunteers.forEach(v => ids.add(v.id)))
    return ids.size
  }, [positionGroups])
  const populatedPositions = positionGroups.filter(group => group.volunteers.length > 0).length

  function togglePosition(name) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function collapseAll() {
    setExpanded(new Set())
  }

  function expandAll() {
    setExpanded(new Set(positionGroups.map(group => group.name)))
  }

  function toggleVolunteer(key) {
    //setExpandedVolunteerKey(prev => (prev === key ? null : key))
    setExpandedVolunteerKeys(prev => {
      const add = !prev.has(key)
      const nextTags = new Set(prev)
      if(add){
        nextTags.add(key)
      } else {
        nextTags.delete(key)
      }
      return nextTags
    })
  }

  function clearRoleError(volunteerId) {
    setRoleErrors(prev => (prev[volunteerId] ? { ...prev, [volunteerId]: null } : prev))
  }

  async function handleAddRole(volunteer, role) {
    if (!volunteer || !role) return false

    const currentRoles = volunteerRoleList(volunteer, roleOverrides)
    if (currentRoles.includes(role)) return true

    const nextRoles = [...currentRoles, role]
    clearRoleError(volunteer.id)
    setPendingRole({ volunteerId: volunteer.id, action: 'add', role })
    setRoleOverrides(prev => ({ ...prev, [volunteer.id]: nextRoles }))

    try {
      if (typeof onAddRole === 'function') {
        const result = await onAddRole(volunteer, role, nextRoles)
        if (result === false) throw new Error(`Could not add ${role}.`)
      }
      return true
    } catch (err) {
      setRoleOverrides(prev => ({ ...prev, [volunteer.id]: currentRoles }))
      setRoleErrors(prev => ({
        ...prev,
        [volunteer.id]: err?.message || `Could not add ${role}.`,
      }))
      return false
    } finally {
      setPendingRole(null)
    }
  }

  async function handleRemoveRole(volunteer, role) {
    if (!volunteer || !role) return false

    const currentRoles = volunteerRoleList(volunteer, roleOverrides)
    if (!currentRoles.includes(role)) return true

    const nextRoles = currentRoles.filter(existing => existing !== role)
    clearRoleError(volunteer.id)
    setPendingRole({ volunteerId: volunteer.id, action: 'remove', role })
    setRoleOverrides(prev => ({ ...prev, [volunteer.id]: nextRoles }))

    try {
      if (typeof onRemoveRole === 'function') {
        const result = await onRemoveRole(volunteer, role, nextRoles)
        if (result === false) throw new Error(`Could not remove ${role}.`)
      }
      return true
    } catch (err) {
      setRoleOverrides(prev => ({ ...prev, [volunteer.id]: currentRoles }))
      setRoleErrors(prev => ({
        ...prev,
        [volunteer.id]: err?.message || `Could not remove ${role}.`,
      }))
      return false
    } finally {
      setPendingRole(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontWeight: 600, fontSize: '1.1rem' }}>{title}</h2>
          {subtitle && <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>{subtitle}</p>}
        </div>
      </div>

      {/* Filters */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <button
          onClick={() => setFiltersOpen(o => !o)}
          style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
        >
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Filters</span>
          <span style={{ transform: filtersOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--muted)' }}>▾</span>
        </button>
        {filtersOpen && (
          <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <input
                aria-label="Search volunteers by name or email"
                placeholder="Search name or email…"
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                style={{ ...inputStyle, flex: 1, minWidth: '180px' }}
              />
              <select
                aria-label="Filter by affiliation"
                value={filterAffiliation}
                onChange={e => setFilterAffiliation(e.target.value)}
                style={{ ...inputStyle, width: 'auto' }}
              >
                <option value="all">All affiliations</option>
                {AFFILIATION_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button onClick={() => setShowInactive(s => !s)} style={pillBtn(showInactive)}>
                {showInactive ? 'Hide Inactive' : 'Show Inactive'}
              </button>
              <button onClick={() => setShowEmpty(s => !s)} style={pillBtn(showEmpty)}>
                {showEmpty ? 'Hide Empty' : 'Show Empty'}
              </button>
            </div>
          </div>
        )}
      </div>

      {loadError && (
        <div style={{ ...card, borderColor: 'rgba(239,68,68,0.4)', color: '#ef4444', fontSize: '0.85rem' }}>
          Could not load volunteers: {loadError}
        </div>
      )}

      {/* Positions + volunteers */}
      {loading ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>
          Loading positions…
        </div>
      ) : positionGroups.length === 0 ? (
        <div style={{ ...card, textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: '0.9rem' }}>
            No positions or volunteers match these filters.
          </p>
          {!showEmpty && (
            <button onClick={() => setShowEmpty(true)} style={{ ...pillBtn(false), marginTop: '0.75rem' }}>
              Show empty positions
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {positionGroups.map(group => (
            <PositionSection
              key={group.name}
              group={group}
              collapsed={!expanded.has(group.name)}
              onToggle={() => togglePosition(group.name)}
              onSelectVolunteer={onSelectVolunteer}
              allRoles={allRoles}
              roleOverrides={roleOverrides}
              expandedVolunteerKeys={expandedVolunteerKeys}
              onToggleVolunteer={toggleVolunteer}
              onAddRole={handleAddRole}
              onRemoveRole={handleRemoveRole}
              pendingRole={pendingRole}
              roleErrors={roleErrors}
            />
          ))}
        </div>
      )}
    </div>
  )
}
