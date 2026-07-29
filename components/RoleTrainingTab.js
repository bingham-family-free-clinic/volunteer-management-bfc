'use client'
import { useState, useEffect } from 'react'
import { TRAINING_STAGE_LABELS } from '../lib/constants'
import RoleTrainingShiftPicker from './RoleTrainingShiftPicker'

// Stages at which written training is done (approved or not needing
// approval) and the volunteer should see the shift-booking UI.
const PAST_WRITTEN_STAGES = ['shift_1_pending', 'shift_2_pending', 'pending_vouch', 'active']

// ─── Component ────────────────────────────────────────────────────────────────
// Step 9 — dropped into `volunteer_page.js` as the content for a dynamic
// `"{{Role}} Training"` tab, one per in-progress `training_tracks` row
// belonging to the logged-in volunteer (same conditional-tab pattern already
// used for the existing Weekly Training tab — see volunteer_page.js).
//
// Shows the role's written-training content (from `role_written_trainings`,
// built in Step 6), a "Mark Complete" button that stamps
// `written_training_completed_at` and advances `stage` (to
// `pending_written_approval` if the role requires written-training approval,
// otherwise straight to `shift_1_pending`), and — once past written training
// — the Step 7 `RoleTrainingShiftPicker` twice over (shift 1 and shift 2), so
// the volunteer can self-book both shadow shifts. Mirrors the layout shape of
// `RoleTrainerEditor.js` (card, label, toast conventions) rather than
// inventing a new visual style for this tab.
//
// Props:
//   supabase       — Supabase client
//   profile        — the logged-in volunteer's own profile row
//   track          — a `training_tracks` row (this volunteer's), needs at
//                     minimum `id`, `role`, `stage`, `written_training_approved_at`
//   onTrackUpdated — callback(updatedTrackRow), fired after a successful
//                    stage-advancing update, so the parent can refresh its
//                    `myTrainingTracks` list (and drop/relabel this tab)
export default function RoleTrainingTab({ supabase, profile, track, onTrackUpdated }) {
  const [writtenTraining, setWrittenTraining] = useState(undefined) // undefined = loading, null = no row yet
  const [loadError, setLoadError] = useState(null)
  const [completing, setCompleting] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { loadWrittenTraining() }, [track?.role])

  function msg(text, type = 'success') { setToast({ text, type }); setTimeout(() => setToast(null), 3500) }

  async function loadWrittenTraining() {
    if (!track?.role) return
    setLoadError(null)
    const { data, error } = await supabase
      .from('role_written_trainings')
      .select('*')
      .eq('role', track.role)
      .maybeSingle()
    if (error) { setLoadError(error.message); return }
    setWrittenTraining(data || null)
  }

  // Not in the audit action vocabulary used elsewhere (`triggered_training`,
  // `approved_written_training`, etc.) — same open question already flagged
  // on RoleTrainerEditor.js's content edits; left unlogged here for the same
  // reason, easy to add a `completed_written_training` action later if wanted.
  async function handleMarkComplete() {
    setCompleting(true)
    const requiresApproval = !!writtenTraining?.requires_written_approval
    const nextStage = requiresApproval ? 'pending_written_approval' : 'shift_1_pending'

    const { data, error } = await supabase
      .from('training_tracks')
      .update({
        written_training_completed_at: new Date().toISOString(),
        stage: nextStage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', track.id)
      .select()
      .single()

    if (error) {
      msg(`Failed to mark complete: ${error.message}`, 'error')
      setCompleting(false)
      return
    }

    msg(
      requiresApproval
        ? 'Marked complete — waiting on written-training approval.'
        : 'Written training complete — you can now book your shifts below.'
    )
    setCompleting(false)
    onTrackUpdated?.(data)
  }

  // ── Stable style objects ──────────────────────────────────────────────────
  const card  = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }
  const label = { fontSize: '0.78rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const badge = (bg, fg) => ({ alignSelf: 'flex-start', fontSize: '0.72rem', padding: '0.15rem 0.6rem', borderRadius: '100px', fontWeight: 600, background: bg, color: fg, border: `1px solid ${fg}44` })

  if (loadError) {
    return (
      <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', background: 'rgba(2,65,107,0.06)', border: '1px solid rgba(2,65,107,0.3)' }}>
        <p style={{ fontSize: '0.85rem', color: '#02416b', fontWeight: 500 }}>Failed to load: {loadError}</p>
      </div>
    )
  }

  if (writtenTraining === undefined) {
    return <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Loading…</p>
  }

  const isWrittenStage   = track.stage === 'written_training'
  const isPendingApproval = track.stage === 'pending_written_approval'
  const isPastWritten     = PAST_WRITTEN_STAGES.includes(track.stage)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ fontWeight: 600, fontFamily: 'DM Sans, sans-serif', margin: 0 }}>{track.role} Training</h2>
        {toast && (
          <span style={{ fontSize: '0.78rem', fontWeight: 500, color: toast.type === 'error' ? '#92a6b9' : '#02416b' }}>{toast.text}</span>
        )}
      </div>

      {/* Written training content */}
      <div style={card}>
        <p style={label}>Written Training{track.role ? ` — ${track.role}` : ''}</p>

        {writtenTraining?.content ? (
          <p style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>
            {writtenTraining.content}
          </p>
        ) : (
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', fontStyle: 'italic' }}>
            No written training content has been added for this role yet — check back later or ask your Role Trainer.
          </p>
        )}

        {isWrittenStage && (
          <button
            onClick={handleMarkComplete}
            disabled={completing}
            style={{
              alignSelf: 'flex-start', padding: '0.6rem 1.1rem', borderRadius: '8px', border: 'none', fontWeight: 600,
              fontFamily: 'DM Sans, sans-serif', fontSize: '0.85rem',
              cursor: completing ? 'not-allowed' : 'pointer',
              background: completing ? 'var(--border)' : '#02416b',
              color: completing ? 'var(--muted)' : '#fff',
            }}
          >
            {completing ? 'Marking Complete…' : 'Mark Complete'}
          </button>
        )}

        {isPendingApproval && (
          <span style={badge('#92a6b918', '#92a6b9')}>Awaiting written-training approval</span>
        )}

        {isPastWritten && (
          <span style={badge('#02416b18', '#02416b')}>
            Written training complete{track.written_training_approved_at ? ' & approved' : ''}
          </span>
        )}
      </div>

      {/* Shift booking — Step 7's component, once past written training */}
      {isPastWritten && (
        <>
          <RoleTrainingShiftPicker supabase={supabase} trainingTrack={track} shiftNumber={1} />
          <RoleTrainingShiftPicker supabase={supabase} trainingTrack={track} shiftNumber={2} />
        </>
      )}

      {!isWrittenStage && !isPendingApproval && !isPastWritten && (
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          Stage: {TRAINING_STAGE_LABELS[track.stage] || track.stage}
        </p>
      )}
    </div>
  )
}