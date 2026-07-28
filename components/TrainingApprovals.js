'use client'
import { useState, useEffect } from 'react'
import { ROLES } from '../lib/constants'
import { formatDateTime } from '../lib/timeUtils'

/* ════════════════════════════════════════════════════════════════════════
   TRAINING APPROVALS — configuration
   ════════════════════════════════════════════════════════════════════════

   This component is the one place in the app where someone can:
     1. Approve a completed WRITTEN TRAINING            (written_training_*)
     2. VOUCH for a completed shadow shift (Shift 1 & 2) (shadow shifts)
     3. Give the FINAL APPROVAL that activates a volunteer in a role

   It's imported as-is into both admin_page.js and volunteer_page.js. Each
   host page passes a `pageContext` prop ('admin' or 'volunteer') so the
   component knows which visibility list to check itself against — see
   PAGE_VISIBILITY below. Nothing else about the component changes between
   the two pages.

   ── "Approver identities" ────────────────────────────────────────────────
   A person can qualify as an approver two ways:
     • profiles.default_role   — e.g. 'Clinical Supervisor', 'Director'
     • volunteer_role_status.training_privileges — e.g. 'CMI'
   Both are folded into a single list of "identities" per person (see
   getApproverIdentities below) so the matrix and visibility lists below can
   mix plain default_role strings with privilege strings interchangeably.

   ── HOW TO RESTRICT WHO CAN APPROVE WHAT ─────────────────────────────────
   Edit TRAINING_ROLE_APPROVAL_MATRIX below. Every role currently allows
   ANY approver identity (Clinical Supervisor, CMI, AA, EA, Director, Office
   Manager, Lab Director) to approve/vouch/finalize training for that role.
   To restrict a role, replace its array with just the identities that
   should be allowed. For example, to make only Clinical Supervisors and
   CMI-privileged volunteers able to approve EMT training:

     'EMT': [APPROVER.CLINICAL_SUPERVISOR, APPROVER.CMI],

   This matrix is checked on every action (approve written / vouch shift /
   final approval) — a person who can *see* the component (per
   PAGE_VISIBILITY) but isn't listed for a given trainee's role simply won't
   see that specific track in their queues.
   ════════════════════════════════════════════════════════════════════════ */

// Canonical approver identities. Keep these strings in sync with
// profiles.default_role values and volunteer_role_status.training_privileges
// entries elsewhere in the app.
export const APPROVER = {
  CLINICAL_SUPERVISOR:      'Clinical Supervisor',
  CMI:                      'CMI',
  ADMINISTRATIVE_ASSISTANT: 'Administrative Assistant',
  EXECUTIVE_ASSISTANT:      'Executive Assistant',
  DIRECTOR:                 'Director',
  OFFICE_MANAGER:           'Office Manager',
  LAB_DIRECTOR:             'Lab Director',
}

const ALL_APPROVERS = Object.values(APPROVER)

// Which page(s) a person can even see this component on. This is a
// visibility gate only — it does NOT decide whose training they can act on
// (that's TRAINING_ROLE_APPROVAL_MATRIX below). Someone could in principle
// appear on both lists; that's fine.
const PAGE_VISIBILITY = {
  volunteer: [APPROVER.CLINICAL_SUPERVISOR, APPROVER.CMI],
  admin: [
    APPROVER.ADMINISTRATIVE_ASSISTANT,
    APPROVER.EXECUTIVE_ASSISTANT,
    APPROVER.DIRECTOR,
    APPROVER.OFFICE_MANAGER,
    APPROVER.LAB_DIRECTOR,
  ],
}

// ── THE MATRIX ─────────────────────────────────────────────────────────────
// Default state per the current ask: anybody who can see the component can
// approve/vouch/finalize training for ANY role. Narrow individual roles down
// to specific approver identities as needed — see comment block above.
export const TRAINING_ROLE_APPROVAL_MATRIX = (ROLES || []).reduce((acc, role) => {
  acc[role] = [...ALL_APPROVERS]
  return acc
}, {})

// ── Permission helpers (exported so host pages can use them too, e.g. to
//    decide whether to show a "Training Approvals" tab/badge at all) ───────
export function getApproverIdentities(profile, roleStatus) {
  const identities = []
  if (profile?.default_role) identities.push(profile.default_role)
  if (roleStatus?.training_privileges?.includes('CMI')) identities.push('CMI')
  return identities
}

export function canSeeTrainingApprovals(profile, roleStatus, pageContext) {
  const allowList = PAGE_VISIBILITY[pageContext] || []
  const mine = getApproverIdentities(profile, roleStatus)
  return mine.some(id => allowList.includes(id))
}

export function canActOnRoleTraining(profile, roleStatus, trainingRole) {
  const allowList = TRAINING_ROLE_APPROVAL_MATRIX[trainingRole] || ALL_APPROVERS
  const mine = getApproverIdentities(profile, roleStatus)
  return mine.some(id => allowList.includes(id))
}

// ── Stage machine this component operates on ────────────────────────────────
// Mirrors the training_stage Postgres enum. This component only ever reads/
// writes the four "in review" stages — 'written_training' (still with the
// trainee) and 'active' (already done) are display-only elsewhere.
//   pending_written_approval  → [Approve Written]     → shift_1_pending
//   shift_1_pending           → [Vouch Shift 1]        → shift_2_pending
//   shift_2_pending           → [Vouch Shift 2]        → pending_vouch
//   pending_vouch             → [Final Approval]       → active
const SECTIONS = [
  { stage: 'pending_written_approval', title: 'Written Training Approvals', action: 'Approve', empty: 'No one is waiting on written-training approval right now.' },
  { stage: 'shift_1_pending',          title: 'Shadow Shift Vouching — Shift 1', action: 'Vouch Shift 1', empty: 'No one is waiting on a Shift 1 vouch right now.', shiftNumber: 1 },
  { stage: 'shift_2_pending',          title: 'Shadow Shift Vouching — Shift 2', action: 'Vouch Shift 2', empty: 'No one is waiting on a Shift 2 vouch right now.', shiftNumber: 2 },
  { stage: 'pending_vouch',            title: 'Final Approval',                 action: 'Give Final Approval', empty: 'No one is waiting on final approval right now.' },
]
const NEXT_STAGE = {
  pending_written_approval: 'shift_1_pending',
  shift_1_pending:          'shift_2_pending',
  shift_2_pending:          'pending_vouch',
  pending_vouch:            'active',
}

/* ════════════════════════════════════════════════════════════════════════
   Component
   ════════════════════════════════════════════════════════════════════════ */
export default function TrainingApprovals({ supabase, profile, pageContext, roleStatus }) {
  const [myRoleStatus, setMyRoleStatus] = useState(roleStatus || null)
  const [tracks, setTracks]             = useState([])
  const [loading, setLoading]           = useState(true)
  const [loadError, setLoadError]       = useState(null)
  const [busyId, setBusyId]             = useState(null) // `${track.id}:${action}` currently in flight
  const [toast, setToast]               = useState(null)

  // If the host page already loaded this person's volunteer_role_status,
  // use it directly instead of fetching a second copy.
  useEffect(() => {
    if (roleStatus !== undefined) { setMyRoleStatus(roleStatus); return }
    if (!profile?.id) return
    supabase
      .from('volunteer_role_status')
      .select('*')
      .eq('volunteer_id', profile.id)
      .maybeSingle()
      .then(({ data }) => setMyRoleStatus(data || null))
  }, [profile?.id, roleStatus])

  const canSee = canSeeTrainingApprovals(profile, myRoleStatus, pageContext)

  useEffect(() => {
    if (canSee) loadTracks()
  }, [canSee])

  function msg(text, type = 'success') { setToast({ text, type }); setTimeout(() => setToast(null), 3500) }

  async function audit(action, target_id, target_name, details) {
    try {
      await supabase.from('audit_logs').insert({
        admin_id: profile.id,
        action,
        target_type: 'training_track',
        target_id:   target_id ? String(target_id) : null,
        target_name: target_name || null,
        details:     details || null,
      })
    } catch (e) { console.error('audit failed:', e) }
  }

  async function loadTracks() {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('training_tracks')
      .select('*, volunteer:profiles!training_tracks_volunteer_id_fkey(full_name, email, default_role, affiliation)')
      .in('stage', SECTIONS.map(s => s.stage))
      .order('created_at', { ascending: true })
    if (error) { setLoadError(error.message); setLoading(false); return }
    setTracks(data || [])
    setLoading(false)
  }

  if (!canSee) return null

  // Only show tracks whose role this person is actually allowed to act on,
  // per TRAINING_ROLE_APPROVAL_MATRIX.
  const visibleTracks = tracks.filter(t => canActOnRoleTraining(profile, myRoleStatus, t.role))

  async function handleApproveWritten(track) {
    const key = `${track.id}:written`
    setBusyId(key)
    const { error } = await supabase
      .from('training_tracks')
      .update({
        written_training_approved_by: profile.id,
        written_training_approved_at: new Date().toISOString(),
        stage: NEXT_STAGE.pending_written_approval,
      })
      .eq('id', track.id)

    if (error) { msg(`Failed to approve: ${error.message}`, 'error'); setBusyId(null); return }
    await audit('approved_written_training', track.id, track.volunteer?.full_name, `role: ${track.role}`)
    msg(`Written training approved for ${track.volunteer?.full_name || 'volunteer'} — ${track.role}`)
    setBusyId(null)
    loadTracks()
  }

  async function handleVouchShift(track, shiftNumber) {
    const key = `${track.id}:shift${shiftNumber}`
    setBusyId(key)

    const { data: shift, error: shiftLoadErr } = await supabase
      .from('role_training_shifts')
      .select('*')
      .eq('training_track_id', track.id)
      .eq('shift_number', shiftNumber)
      .maybeSingle()

    if (shiftLoadErr || !shift) {
      msg(`Can't vouch — no completed Shift ${shiftNumber} found for ${track.volunteer?.full_name || 'this volunteer'} yet.`, 'error')
      setBusyId(null)
      return
    }

    const { error: vouchErr } = await supabase
      .from('role_training_shifts')
      .update({ vouched_by: profile.id, vouched_at: new Date().toISOString() })
      .eq('id', shift.id)

    if (vouchErr) { msg(`Failed to vouch: ${vouchErr.message}`, 'error'); setBusyId(null); return }

    const nextStage = shiftNumber === 1 ? NEXT_STAGE.shift_1_pending : NEXT_STAGE.shift_2_pending
    const { error: stageErr } = await supabase
      .from('training_tracks')
      .update({ stage: nextStage })
      .eq('id', track.id)

    if (stageErr) {
      msg(`Shift vouched, but failed to advance the track: ${stageErr.message}. Please check this track manually.`, 'error')
      setBusyId(null)
      loadTracks()
      return
    }

    await audit(`vouched_shift_${shiftNumber}`, track.id, track.volunteer?.full_name, `role: ${track.role}`)
    msg(`Shift ${shiftNumber} vouched for ${track.volunteer?.full_name || 'volunteer'} — ${track.role}`)
    setBusyId(null)
    loadTracks()
  }

  // Final Approval: activates the volunteer in the role. Same completion
  // side-effects as the rest of the training pipeline elsewhere in the app
  // (active_roles, waitlist, audit log, completion email) — treated as
  // best-effort follow-ups since the stage transition itself already
  // succeeded by the time we get to them.
  async function handleFinalApproval(track) {
    const key = `${track.id}:final`
    setBusyId(key)
    const warnings = []

    const { error: stageErr } = await supabase
      .from('training_tracks')
      .update({ stage: 'active' })
      .eq('id', track.id)

    if (stageErr) { msg(`Failed to give final approval: ${stageErr.message}`, 'error'); setBusyId(null); return }

    const { data: existingStatus, error: statusLoadErr } = await supabase
      .from('volunteer_role_status')
      .select('*')
      .eq('volunteer_id', track.volunteer_id)
      .maybeSingle()

    if (statusLoadErr) {
      warnings.push(`active_roles lookup failed: ${statusLoadErr.message}`)
    } else if (!existingStatus) {
      const { error } = await supabase
        .from('volunteer_role_status')
        .insert({ volunteer_id: track.volunteer_id, active_roles: [track.role] })
      if (error) warnings.push(`active_roles insert failed: ${error.message}`)
    } else {
      const nextRoles = existingStatus.active_roles?.includes(track.role)
        ? existingStatus.active_roles
        : [...(existingStatus.active_roles || []), track.role]
      const { error } = await supabase
        .from('volunteer_role_status')
        .update({ active_roles: nextRoles, updated_at: new Date().toISOString() })
        .eq('id', existingStatus.id)
      if (error) warnings.push(`active_roles update failed: ${error.message}`)
    }

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

    await audit('final_approval_training', track.id, track.volunteer?.full_name, `role: ${track.role}`)

    try {
      const { error: emailErr } = await supabase.functions.invoke('send-stage-email', {
        body: {
          applicantEmail: track.volunteer?.email,
          applicantName:  track.volunteer?.full_name,
          stage:          'training_completed_waitlisted',
          role:           track.role,
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
    if (warnings.length) warnings.forEach(w => console.error('Final approval side-effect issue:', w))

    setBusyId(null)
    loadTracks()
  }

  const ACTION_HANDLERS = {
    pending_written_approval: (t) => handleApproveWritten(t),
    shift_1_pending:          (t) => handleVouchShift(t, 1),
    shift_2_pending:          (t) => handleVouchShift(t, 2),
    pending_vouch:            (t) => handleFinalApproval(t),
  }

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem 1.25rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.9rem' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <h2 style={{ fontWeight: 600, fontFamily: 'DM Sans, sans-serif', margin: 0 }}>Training Approvals</h2>

      {toast && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: toast.type === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)', border: `1px solid ${toast.type === 'error' ? 'rgba(239,68,68,0.35)' : 'rgba(34,197,94,0.35)'}` }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 500, color: toast.type === 'error' ? '#ef4444' : '#22c55e' }}>{toast.text}</p>
        </div>
      )}

      {loadError && (
        <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <p style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: 500 }}>Failed to load: {loadError}</p>
        </div>
      )}

      {loading && <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Loading…</p>}

      {!loading && !loadError && SECTIONS.map(section => {
        const items = visibleTracks.filter(t => t.stage === section.stage)
        return (
          <div key={section.stage} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ fontWeight: 600, fontFamily: 'DM Sans, sans-serif', margin: 0 }}>{section.title}</p>

            {items.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{section.empty}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {items.map(t => {
                  const key = `${t.id}:${section.stage === 'pending_written_approval' ? 'written' : section.stage === 'pending_vouch' ? 'final' : `shift${section.shiftNumber}`}`
                  const busy = busyId === key
                  return (
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

                      <div style={{ minWidth: '150px' }}>
                        <p style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Started</p>
                        <p style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', color: 'var(--text)' }}>{formatDateTime(t.created_at)}</p>
                      </div>

                      <button
                        onClick={() => ACTION_HANDLERS[section.stage](t)}
                        disabled={busy}
                        style={{
                          marginLeft: 'auto', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', fontWeight: 600,
                          fontFamily: 'DM Sans, sans-serif', fontSize: '0.82rem',
                          cursor: busy ? 'not-allowed' : 'pointer',
                          background: busy ? 'var(--border)' : 'var(--accent)',
                          color: busy ? 'var(--muted)' : '#fff',
                        }}
                      >
                        {busy ? 'Working…' : section.action}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}