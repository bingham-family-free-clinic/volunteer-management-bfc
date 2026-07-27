'use client'
import { useState, useEffect } from 'react'
import { ROLES, TRAINING_STAGE_LABELS } from '../lib/constants'
import { formatDateTime } from '../lib/timeUtils'
import { canTriggerTraining, canApproveWrittenTraining, canApproveTraining } from '../lib/trainingHelpers'

// ─── Constants ────────────────────────────────────────────────────────────────
// Mirrors the order of the `training_stage` Postgres enum (migration 001).
const STAGE_ORDER = [
  'written_training',
  'pending_written_approval',
  'shift_1_pending',
  'shift_2_pending',
  'pending_vouch',
  'active',
]

// One color per stage, mirroring the STAGE_COLORS-per-stage pattern used for
// the applicant pipeline's stage filter bar in Pipeline.js.
const STAGE_COLORS = {
  written_training:         '#0ea5e9',
  pending_written_approval: '#f59e0b',
  shift_1_pending:          '#6366f1',
  shift_2_pending:          '#6366f1',
  pending_vouch:            '#ec4899',
  active:                   '#22c55e',
}

// ─── Component ────────────────────────────────────────────────────────────────
// Step 4 — read-only list + filters (done).
// Step 5 — adds the "Trigger Training" action below (gated by canTriggerTraining()).
// Step 6 — adds the Written Training Approvals queue (gated by canApproveWrittenTraining()).
// Step 8 — adds the Vouch action + completion side-effects (gated by canApproveTraining()).
export default function RoleTrainingDashboard({ supabase, profile }) {
  const [tracks, setTracks]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState(null)
  const [roleFilter, setRoleFilter]   = useState('all')
  const [stageFilter, setStageFilter] = useState('all')

  // ── Trigger Training action (Step 5) ──────────────────────────────────────
  const [myRoleStatus, setMyRoleStatus]     = useState(null)   // current admin's own volunteer_role_status row, for canTriggerTraining()/canApproveTraining()/canApproveWrittenTraining()
  const [volunteers, setVolunteers]         = useState([])
  const [volunteerQuery, setVolunteerQuery] = useState('')
  const [pickedVolunteer, setPickedVolunteer] = useState(null)
  const [triggerRole, setTriggerRole]       = useState('')
  const [isNewVolunteerTrack, setIsNewVolunteerTrack] = useState(false)
  const [triggering, setTriggering]         = useState(false)
  const [toast, setToast]                   = useState(null)

  // ── Written Training Approval queue (Step 6) ──────────────────────────────
  const [approvingId, setApprovingId]       = useState(null)   // training_track id currently being approved

  // ── Vouch queue + completion side-effects (Step 8) ────────────────────────
  const [vouchingId, setVouchingId]         = useState(null)   // training_track id currently being vouched

  useEffect(() => { loadTracks() }, [])
  useEffect(() => { loadMyRoleStatus() }, [])
  useEffect(() => { loadVolunteers() }, [])

  function msg(text, type = 'success') { setToast({ text, type }); setTimeout(() => setToast(null), 3500) }

  async function audit(action, target_type, target_id, target_name, details) {
    try {
      await supabase.from('audit_logs').insert({
        admin_id: profile.id, action, target_type,
        target_id:   target_id   ? String(target_id) : null,
        target_name: target_name || null,
        details:     details     || null,
      })
    } catch (e) { console.error('audit failed:', e) }
  }

  async function loadMyRoleStatus() {
    const { data } = await supabase
      .from('volunteer_role_status')
      .select('*')
      .eq('volunteer_id', profile.id)
      .maybeSingle()
    setMyRoleStatus(data || null)
  }

  async function loadVolunteers() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, default_role')
      .eq('role', 'volunteer')
      .order('full_name')
    setVolunteers(data || [])
  }

  async function loadTracks() {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('training_tracks')
      .select('*, volunteer:profiles!training_tracks_volunteer_id_fkey(full_name, email, default_role, affiliation)')
      .order('created_at', { ascending: false })
    if (error) { setLoadError(error.message); setLoading(false); return }
    setTracks(data || [])
    setLoading(false)
  }

  const stageCounts = STAGE_ORDER.reduce((acc, s) => {
    acc[s] = tracks.filter(t => t.stage === s).length
    return acc
  }, {})

  const filtered = tracks.filter(t => {
    if (roleFilter !== 'all' && t.role !== roleFilter) return false
    if (stageFilter !== 'all' && t.stage !== stageFilter) return false
    return true
  })

  const canTrigger = canTriggerTraining(profile, myRoleStatus)
  const canApproveWritten = canApproveWrittenTraining(profile, myRoleStatus)
  const canVouch = canApproveTraining(profile, myRoleStatus)

  const pendingWrittenApproval = tracks.filter(t => t.stage === 'pending_written_approval')
  const pendingVouch = tracks.filter(t => t.stage === 'pending_vouch')

  const matchingVolunteers = volunteerQuery.trim().length === 0
    ? []
    : volunteers.filter(v => {
        const q = volunteerQuery.trim().toLowerCase()
        return v.full_name?.toLowerCase().includes(q) || v.email?.toLowerCase().includes(q)
      }).slice(0, 8)

  async function handleTrigger() {
    if (!pickedVolunteer || !triggerRole) return

    const existing = tracks.find(t =>
      t.volunteer_id === pickedVolunteer.id && t.role === triggerRole && t.stage !== 'active'
    )
    if (existing) {
      msg(`${pickedVolunteer.full_name} already has an in-progress ${triggerRole} training track.`, 'error')
      return
    }

    setTriggering(true)
    const { data, error } = await supabase
      .from('training_tracks')
      .insert({
        volunteer_id: pickedVolunteer.id,
        role: triggerRole,
        is_new_volunteer_track: isNewVolunteerTrack,
        requested_by: profile.id,
      })
      .select()
      .single()

    if (error) {
      msg(`Failed to start training: ${error.message}`, 'error')
      setTriggering(false)
      return
    }

    await audit(
      'triggered_training',
      'training_track',
      data.id,
      pickedVolunteer.full_name,
      `role: ${triggerRole}${isNewVolunteerTrack ? ' (new volunteer track)' : ''}`
    )

    msg(`Training started for ${pickedVolunteer.full_name} — ${triggerRole}`)
    setPickedVolunteer(null)
    setVolunteerQuery('')
    setTriggerRole('')
    setIsNewVolunteerTrack(false)
    setTriggering(false)
    loadTracks()
  }

  async function handleApproveWritten(track) {
    setApprovingId(track.id)
    const { error } = await supabase
      .from('training_tracks')
      .update({
        written_training_approved_by: profile.id,
        written_training_approved_at: new Date().toISOString(),
        stage: 'shift_1_pending',
      })
      .eq('id', track.id)

    if (error) {
      msg(`Failed to approve: ${error.message}`, 'error')
      setApprovingId(null)
      return
    }

    await audit(
      'approved_written_training',
      'training_track',
      track.id,
      track.volunteer?.full_name,
      `role: ${track.role}`
    )

    msg(`Written training approved for ${track.volunteer?.full_name || 'volunteer'} — ${track.role}`)
    setApprovingId(null)
    loadTracks()
  }

  // ── Vouch action + completion side-effects (Step 8) ───────────────────────
  // No client-side transaction, so these run as a best-effort sequence: the
  // two steps that define the actual state transition (stamping the shift-2
  // row, advancing training_tracks.stage) are treated as hard failures that
  // stop here; everything after that (active_roles, waitlist, audit log,
  // completion email) is a side-effect of a transition that already
  // succeeded, so a failure there is surfaced as a warning rather than
  // rolled back — same "the important thing happened, a follow-up step
  // didn't" pattern Pipeline.js already uses for stage-move-but-email-failed.
  async function handleVouch(track) {
    setVouchingId(track.id)
    const warnings = []

    const { data: shift2, error: shift2Err } = await supabase
      .from('role_training_shifts')
      .select('*')
      .eq('training_track_id', track.id)
      .eq('shift_number', 2)
      .maybeSingle()

    if (shift2Err || !shift2) {
      msg(`Can't vouch — no completed Shift 2 found for ${track.volunteer?.full_name || 'this volunteer'}.`, 'error')
      setVouchingId(null)
      return
    }

    const { error: vouchErr } = await supabase
      .from('role_training_shifts')
      .update({ vouched_by: profile.id, vouched_at: new Date().toISOString() })
      .eq('id', shift2.id)

    if (vouchErr) {
      msg(`Failed to vouch: ${vouchErr.message}`, 'error')
      setVouchingId(null)
      return
    }

    const { error: stageErr } = await supabase
      .from('training_tracks')
      .update({ stage: 'active' })
      .eq('id', track.id)

    if (stageErr) {
      // Shift 2 is already stamped as vouched at this point — flagging as a
      // known gap rather than attempting a manual rollback of the shift
      // update, since there's no transaction wrapping the two calls.
      msg(`Vouched, but failed to activate the track: ${stageErr.message}. Please check this track manually.`, 'error')
      setVouchingId(null)
      loadTracks()
      return
    }

    // 1) Append role into volunteer_role_status.active_roles (upsert if missing)
    const { data: roleStatus, error: roleStatusLoadErr } = await supabase
      .from('volunteer_role_status')
      .select('*')
      .eq('volunteer_id', track.volunteer_id)
      .maybeSingle()

    if (roleStatusLoadErr) {
      warnings.push(`active_roles lookup failed: ${roleStatusLoadErr.message}`)
    } else if (!roleStatus) {
      const { error } = await supabase
        .from('volunteer_role_status')
        .insert({ volunteer_id: track.volunteer_id, active_roles: [track.role] })
      if (error) warnings.push(`active_roles insert failed: ${error.message}`)
    } else {
      const nextRoles = roleStatus.active_roles.includes(track.role)
        ? roleStatus.active_roles
        : [...roleStatus.active_roles, track.role]
      const { error } = await supabase
        .from('volunteer_role_status')
        .update({ active_roles: nextRoles, updated_at: new Date().toISOString() })
        .eq('id', roleStatus.id)
      if (error) warnings.push(`active_roles update failed: ${error.message}`)
    }

    // 2) Upsert the waitlist row (insert or append preferred_roles) — the
    // trigger point this table moved to when Step 3 removed the old insert
    // out of Pipeline.js's handleCreateProfile().
    const { data: wlRow, error: wlLoadErr } = await supabase
      .from('waitlist')
      .select('*')
      .eq('volunteer_id', track.volunteer_id)
      .maybeSingle()

    if (wlLoadErr) {
      warnings.push(`waitlist lookup failed: ${wlLoadErr.message}`)
    } else if (!wlRow) {
      const { error } = await supabase
        .from('waitlist')
        .insert({
          volunteer_id: track.volunteer_id,
          preferred_roles: [track.role],
          source: 'role_training_completed',
          added_by: profile.id,
        })
      if (error) warnings.push(`waitlist insert failed: ${error.message}`)
    } else {
      const nextPreferred = (wlRow.preferred_roles || []).includes(track.role)
        ? wlRow.preferred_roles
        : [...(wlRow.preferred_roles || []), track.role]
      const { error } = await supabase
        .from('waitlist')
        .update({ preferred_roles: nextPreferred })
        .eq('id', wlRow.id)
      if (error) warnings.push(`waitlist update failed: ${error.message}`)
    }

    // 3) Audit log
    await audit(
      'vouched_training',
      'training_track',
      track.id,
      track.volunteer?.full_name,
      `role: ${track.role}`
    )

    // 4) Completion email. Reuses the same `send-stage-email` edge function
    // Pipeline.js already calls for applicant-stage emails, generalized to a
    // new `stage` key — per the Data Model / Step 10 note, extend the
    // existing template system rather than build a second one. NOTE: Step 10
    // is what actually creates the `email_templates` row for
    // `training_completed_waitlisted`; until that row exists, this call is
    // expected to no-op or fail server-side depending on how the edge
    // function handles an unknown stage — treated as non-fatal here exactly
    // like Pipeline.js's own "stage moved, but email failed" handling, since
    // the training track has already gone active regardless of the email.
    try {
      const { error: emailErr } = await supabase.functions.invoke('send-stage-email', {
        body: {
          applicantEmail: track.volunteer?.email,
          applicantName:  track.volunteer?.full_name,
          stage:          'training_completed_waitlisted',
          senderName:     profile?.full_name || 'BFC Volunteer Team',
        },
      })
      if (emailErr) warnings.push(`completion email failed: ${emailErr.message}`)
    } catch (e) {
      warnings.push(`completion email failed: ${e.message}`)
    }

    msg(
      warnings.length === 0
        ? `${track.volunteer?.full_name || 'Volunteer'} is now active in ${track.role}.`
        : `${track.volunteer?.full_name || 'Volunteer'} is now active in ${track.role}, but some follow-up steps had issues — check console.`,
      warnings.length === 0 ? 'success' : 'error'
    )
    if (warnings.length) warnings.forEach(w => console.error('Vouch side-effect issue:', w))

    setVouchingId(null)
    loadTracks()
  }

  // ── Stable style objects ──────────────────────────────────────────────────
  const selectStyle = { padding: '0.6rem 0.85rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.85rem', outline: 'none', fontFamily: 'DM Sans, sans-serif' }
  const card        = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem 1.25rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.9rem' }

  const stagePill = (stage, label, count, active, onClick) => {
    const color = stage === 'all' ? 'var(--accent)' : STAGE_COLORS[stage]
    return (
      <button
        key={stage}
        onClick={onClick}
        style={{
          padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 500,
          cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
          background: active ? color + '18' : 'var(--surface)',
          color: active ? color : 'var(--muted)',
          border: active ? `1px solid ${color}55` : '1px solid var(--border)',
        }}
      >
        {label} <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', opacity: 0.8 }}>({count})</span>
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h2 style={{ fontWeight: 600, fontFamily: 'DM Sans, sans-serif', margin: 0 }}>Role Training</h2>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={selectStyle}>
          <option value="all">All roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {toast && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: toast.type === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)', border: `1px solid ${toast.type === 'error' ? 'rgba(239,68,68,0.35)' : 'rgba(34,197,94,0.35)'}` }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 500, color: toast.type === 'error' ? '#ef4444' : '#22c55e' }}>{toast.text}</p>
        </div>
      )}

      {canTrigger && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ fontWeight: 600, fontFamily: 'DM Sans, sans-serif', margin: 0 }}>Trigger Training</p>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '220px' }}>
              <input
                type="text"
                placeholder="Search volunteer by name or email…"
                value={pickedVolunteer ? pickedVolunteer.full_name : volunteerQuery}
                onChange={e => { setPickedVolunteer(null); setVolunteerQuery(e.target.value) }}
                style={{ ...selectStyle, width: '100%' }}
              />
              {!pickedVolunteer && matchingVolunteers.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '0.25rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', zIndex: 10, overflow: 'hidden' }}>
                  {matchingVolunteers.map(v => (
                    <button
                      key={v.id}
                      onClick={() => { setPickedVolunteer(v); setVolunteerQuery('') }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.55rem 0.85rem', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.85rem', color: 'var(--text)' }}
                    >
                      {v.full_name} <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{v.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <select value={triggerRole} onChange={e => setTriggerRole(e.target.value)} style={selectStyle}>
              <option value="">— Select role —</option>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--text)', fontFamily: 'DM Sans, sans-serif', padding: '0.6rem 0' }}>
              <input type="checkbox" checked={isNewVolunteerTrack} onChange={e => setIsNewVolunteerTrack(e.target.checked)} />
              New volunteer (first role)
            </label>

            <button
              onClick={handleTrigger}
              disabled={!pickedVolunteer || !triggerRole || triggering}
              style={{
                padding: '0.6rem 1.1rem', borderRadius: '8px', border: 'none', fontWeight: 600, fontFamily: 'DM Sans, sans-serif', fontSize: '0.85rem',
                cursor: (!pickedVolunteer || !triggerRole || triggering) ? 'not-allowed' : 'pointer',
                background: (!pickedVolunteer || !triggerRole || triggering) ? 'var(--border)' : 'var(--accent)',
                color: (!pickedVolunteer || !triggerRole || triggering) ? 'var(--muted)' : '#fff',
              }}
            >
              {triggering ? 'Starting…' : 'Trigger Training'}
            </button>
          </div>
        </div>
      )}

      {canApproveWritten && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ fontWeight: 600, fontFamily: 'DM Sans, sans-serif', margin: 0 }}>Written Training Approvals</p>

          {pendingWrittenApproval.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>No one is waiting on written-training approval right now.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {pendingWrittenApproval.map(t => (
                <div key={t.id} style={{ ...card, background: 'var(--bg)' }}>
                  <div style={{ minWidth: '160px', flex: '1 1 200px' }}>
                    <p style={{ fontWeight: 600, fontFamily: 'DM Sans, sans-serif', color: 'var(--text)' }}>
                      {t.volunteer?.full_name || 'Unknown volunteer'}
                    </p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{t.volunteer?.email}</p>
                  </div>

                  <div style={{ minWidth: '120px' }}>
                    <p style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Role</p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text)', fontWeight: 500 }}>{t.role}</p>
                  </div>

                  <button
                    onClick={() => handleApproveWritten(t)}
                    disabled={approvingId === t.id}
                    style={{
                      marginLeft: 'auto', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', fontWeight: 600,
                      fontFamily: 'DM Sans, sans-serif', fontSize: '0.82rem',
                      cursor: approvingId === t.id ? 'not-allowed' : 'pointer',
                      background: approvingId === t.id ? 'var(--border)' : 'var(--accent)',
                      color: approvingId === t.id ? 'var(--muted)' : '#fff',
                    }}
                  >
                    {approvingId === t.id ? 'Approving…' : 'Approve'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {canVouch && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ fontWeight: 600, fontFamily: 'DM Sans, sans-serif', margin: 0 }}>Vouch Queue</p>

          {pendingVouch.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>No one is waiting on a vouch right now.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {pendingVouch.map(t => (
                <div key={t.id} style={{ ...card, background: 'var(--bg)' }}>
                  <div style={{ minWidth: '160px', flex: '1 1 200px' }}>
                    <p style={{ fontWeight: 600, fontFamily: 'DM Sans, sans-serif', color: 'var(--text)' }}>
                      {t.volunteer?.full_name || 'Unknown volunteer'}
                    </p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{t.volunteer?.email}</p>
                  </div>

                  <div style={{ minWidth: '120px' }}>
                    <p style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Role</p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text)', fontWeight: 500 }}>{t.role}</p>
                  </div>

                  <button
                    onClick={() => handleVouch(t)}
                    disabled={vouchingId === t.id}
                    style={{
                      marginLeft: 'auto', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', fontWeight: 600,
                      fontFamily: 'DM Sans, sans-serif', fontSize: '0.82rem',
                      cursor: vouchingId === t.id ? 'not-allowed' : 'pointer',
                      background: vouchingId === t.id ? 'var(--border)' : 'var(--accent)',
                      color: vouchingId === t.id ? 'var(--muted)' : '#fff',
                    }}
                  >
                    {vouchingId === t.id ? 'Vouching…' : 'Vouch'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {stagePill('all', 'All', tracks.length, stageFilter === 'all', () => setStageFilter('all'))}
        {STAGE_ORDER.map(s =>
          stagePill(s, TRAINING_STAGE_LABELS[s], stageCounts[s], stageFilter === s, () => setStageFilter(s))
        )}
      </div>

      {loadError && (
        <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <p style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: 500 }}>Failed to load: {loadError}</p>
        </div>
      )}

      {loading && <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Loading…</p>}

      {!loading && !loadError && filtered.length === 0 && (
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>No training tracks match these filters.</p>
      )}

      {!loading && !loadError && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {filtered.map(t => {
            const color = STAGE_COLORS[t.stage] || 'var(--muted)'
            return (
              <div key={t.id} style={card}>
                <div style={{ minWidth: '160px', flex: '1 1 200px' }}>
                  <p style={{ fontWeight: 600, fontFamily: 'DM Sans, sans-serif', color: 'var(--text)' }}>
                    {t.volunteer?.full_name || 'Unknown volunteer'}
                  </p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{t.volunteer?.email}</p>
                </div>

                <div style={{ minWidth: '120px' }}>
                  <p style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Role</p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text)', fontWeight: 500 }}>{t.role}</p>
                </div>

                <div style={{ minWidth: '150px' }}>
                  <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.6rem', borderRadius: '100px', fontWeight: 600, background: color + '18', color, border: `1px solid ${color}44` }}>
                    {TRAINING_STAGE_LABELS[t.stage] || t.stage}
                  </span>
                </div>

                {t.is_new_volunteer_track && (
                  <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.6rem', borderRadius: '100px', fontWeight: 600, background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                    New Volunteer
                  </span>
                )}

                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <p style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Started</p>
                  <p style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', color: 'var(--text)' }}>{formatDateTime(t.created_at)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}