'use client'

import { useState, useEffect, useCallback } from 'react'
import { ROLE_QUALIFICATION_STATUS } from '../lib/constants'

export default function TrainingTab({supabase}) {
  const [volunteerPositions, setVolunteerPositions] = useState([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)

  function showToast(text, type) {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function pullVolunteerPositionsFromSupabase(){
    const { data, error } = await supabase
          .from('profiles')
          .select()
    console.log('loaded ' + (data.length))
    if(error){
      showToast(error.message, 'error')
    } else {
      console.log('loaded ' + data.length)
      setVolunteerPositions(data)
    }
  }

  useEffect(() => {
    console.log("Loading...")
    pullVolunteerPositionsFromSupabase();
  }, [])

  useEffect(() => {
    showToast('loaded ' + volunteerPositions.length, 'error');
  }, [volunteerPositions])

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <button onClick={() => setFiltersOpen(o => !o)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Filters</span>
          <span style={{ transform: filtersOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--muted)' }}>▾</span>
        </button>
        { /*filtersOpen && (
          <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <input placeholder="Search name or email…" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              <select value={filterAffiliation} onChange={e => setFilterAffiliation(e.target.value)} style={inputStyle}><option value="all">All affiliations</option><option value="missionary">Missionary</option><option value="student">Student</option><option value="volunteer">Volunteer</option><option value="intern">Intern</option><option value="provider">Clinical Care Volunteer</option><option value="BYU">BYU</option><option value="UVU">UVU</option></select>
              <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={inputStyle}><option value="all">All roles</option><option value="volunteer">Volunteer</option><option value="admin">Admin</option></select>
              <select value={filterDefaultRole} onChange={e => setFilterDefaultRole(e.target.value)} style={inputStyle}><option value="all">All positions</option>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select>
              <button onClick={() => setShowInactive(s => !s)} style={pillBtn(showInactive, false)}>{showInactive ? 'Hide Inactive' : 'Show Inactive'}</button>
            </div>
          </div>
        ) */}
      </div>
      <ExpandableSection label="Volunteers" isOpen={volunteersOpen} onToggle={() => setVolunteersOpen(o => !o)} count={volunteersTabList.length}>
        {volunteersTabList.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontStyle: 'italic' }}>No volunteers match these filters.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {volunteersTabList.map(v => {
              const isInactive = (v.status ?? 'active') === 'inactive'
              return (
                <div key={v.id} onClick={() => openVolunteer(v)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', background: isInactive ? 'rgba(156,163,175,0.06)' : 'var(--bg)', cursor: 'pointer', opacity: isInactive ? 0.7 : 1 }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: isInactive ? 'var(--muted)' : 'var(--accent)' }}>
                      {v.full_name?.charAt(0)}
                    </div>
                    <div><p style={{ fontWeight: 500 }}>{v.full_name}</p><p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{v.email}</p></div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    {isInactive && <span style={badgeStyle('#9ca3af')}>inactive</span>}
                    {v.role === 'admin' && <span style={badgeStyle('#f59e0b')}>admin</span>}
                    {v.affiliation && <span style={badgeStyle(affiliationColor[v.affiliation] ?? '#9ca3af')}>{AFFILIATION_LABELS[v.affiliation] ?? v.affiliation}</span>}
                    <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--muted)', fontSize: '0.8rem' }}>›</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </ExpandableSection>
      {/* Guest organizations — bottom of the page, collapsed by default.
          Visible to ALL admins, not subject to the volunteer filters /
          role scoping above. Deactivate hides an org from the public
          /guest-hours form without deleting history. */}
    {/*(
      <ExpandableSection label="Guest Organizations" isOpen={guestOrgsOpen} onToggle={() => setGuestOrgsOpen(o => !o)} loading={guestOrgsLoading} count={guestOrgs.length || undefined}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {guestOrgs.length === 0 && !guestOrgsLoading ? (
            <p style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: '0.85rem' }}>
              No guest organizations yet — add the first one below (or run supabase/migration1–3.sql and migration5.sql).
            </p>
          ) : (
            guestOrgs.map(org => {
              const totals = guestHoursTotals[org.id]
              const recent = guestHoursRecent.filter(r => r.organization_id === org.id).slice(0, 10)
              const expanded = expandedGuestOrgId === org.id
              const inactive = !org.is_active
              return (
                <div key={org.id} style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', background: inactive ? 'rgba(156,163,175,0.06)' : 'var(--bg)', opacity: inactive ? 0.75 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button onClick={() => setExpandedGuestOrgId(expanded ? null : org.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textAlign: 'left', padding: 0 }}>
                      <span style={{ fontWeight: 600 }}>{org.name}</span>
                      <span style={{ color: 'var(--muted)', fontSize: '0.8rem', marginLeft: '0.6rem', fontFamily: 'DM Mono, monospace' }}>
                        {totals ? `${Number(totals.hours).toFixed(1)}h · ${totals.count} ${totals.count === 1 ? 'entry' : 'entries'}` : '—'}
                      </span>
                      <span style={{ color: 'var(--muted)', fontSize: '0.8rem', marginLeft: '0.4rem' }}>{expanded ? '▾' : '›'}</span>
                    </button>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {inactive && <span style={badgeStyle('#9ca3af')}>inactive</span>}
                      <button
                        onClick={() => handleToggleGuestOrg(org)}
                        disabled={togglingGuestOrgId === org.id}
                        style={{ padding: '0.3rem 0.75rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 500, cursor: togglingGuestOrgId === org.id ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', background: inactive ? 'rgba(74,222,128,0.12)' : 'rgba(156,163,175,0.12)', color: inactive ? 'var(--accent)' : 'var(--muted)', border: '1px solid var(--border)' }}
                      >
                        {togglingGuestOrgId === org.id ? '…' : inactive ? 'Reactivate' : 'Deactivate'}
                      </button>
                    </div>
                  </div>
                  {expanded && (
                    <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {recent.length === 0 ? (
                        <p style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: '0.82rem' }}>No submissions yet.</p>
                      ) : recent.map(r => (
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
          <form onSubmit={handleCreateGuestOrg} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              value={newGuestOrgName}
              onChange={e => setNewGuestOrgName(e.target.value)}
              placeholder="New organization name…"
              maxLength={60}
              style={{ ...inputStyle, flex: 1, minWidth: '200px' }}
            />
            <button
              type="submit"
              disabled={creatingGuestOrg || newGuestOrgName.trim().length < 2}
              style={{ padding: '0.75rem 1.25rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: creatingGuestOrg ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', opacity: creatingGuestOrg ? 0.7 : 1 }}
            >
              {creatingGuestOrg ? 'Adding…' : '+ Add'}
            </button>
          </form>
          <p style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
            Public form: <span style={{ fontFamily: 'DM Mono, monospace' }}>/guest-hours</span> · Hours auto-submit (no approval). Guest hours are also merged into the Shifts tab and Data totals.
          </p>
        </div>
        </ExpandableSection>)*/}
    </div>
  )

}
