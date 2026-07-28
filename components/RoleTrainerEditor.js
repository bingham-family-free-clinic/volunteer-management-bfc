'use client'
import { useState, useEffect } from 'react'
import { ROLES } from '../lib/constants'

// ─── Who may edit written-training content ─────────────────────────────────
// Restricted to Administrative Assistants, Executive Assistants, and the
// Director. This is deliberately its own, narrower check — separate from
// canApproveWrittenTraining() in lib/trainingHelpers.js, which governs who
// can *sign off* on a volunteer's completed written training (Clinical
// Supervisors / CMIs, per the training-privileges model) and is unrelated to
// who may edit the underlying training *content*. Exported so any page that
// renders this component (admin_page.js, volunteer_page.js) can gate the tab
// itself with the same rule, rather than duplicating the role list.
//
// NOTE: lib/constants.js and lib/trainingHelpers.js weren't provided as
// files in this session, so this list lives here rather than as a proper
// shared constant (e.g. TRAINING_CONTENT_EDITOR_ROLES). If those files are
// available, consider moving ROLE_TRAINER_EDITOR_ROLES there and having both
// pages import it from one place instead.
export const ROLE_TRAINER_EDITOR_ROLES = ['Director', 'Administrative Assistant', 'Executive Assistant']

export function canEditRoleTrainerContent(profile) {
  return ROLE_TRAINER_EDITOR_ROLES.includes(profile?.default_role)
}

// ─── Component ────────────────────────────────────────────────────────────────
// Step 6 — CRUD for `role_written_trainings`: one row per role, holding the
// editable written-training `content` and the `requires_written_approval`
// toggle that drives whether a track sits in `pending_written_approval` after
// written training or skips straight to `shift_1_pending`.
//
// Reachable from both admin_page.js and volunteer_page.js, each gating the
// tab itself via canEditRoleTrainerContent() above. The in-component guard
// below is belt-and-suspenders in case a badge/link elsewhere in the app
// ever points straight at this tab key, or the component gets rendered
// unconditionally by mistake.
export default function RoleTrainerEditor({ supabase, profile }) {
  if (!canEditRoleTrainerContent(profile)) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem' }}>
        <p style={{ fontSize: '0.9rem', fontWeight: 600, fontFamily: 'DM Sans, sans-serif', margin: 0 }}>Access restricted</p>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
          Only Administrative Assistants, Executive Assistants, and the Director can edit role written trainings.
        </p>
      </div>
    )
  }
  return <RoleTrainerEditorInner supabase={supabase} profile={profile} />
}

function RoleTrainerEditorInner({ supabase, profile }) {
  const [trainings, setTrainings]     = useState({})   // role -> row from role_written_trainings
  const [drafts, setDrafts]           = useState({})   // role -> in-progress edits
  const [activeRole, setActiveRole]   = useState(ROLES[0] || '')
  const [loading, setLoading]         = useState(true)
  const [loadError, setLoadError]     = useState(null)
  const [saving, setSaving]           = useState(false)
  const [toast, setToast]             = useState(null)

  useEffect(() => { loadTrainings() }, [])

  function msg(text, type = 'success') { setToast({ text, type }); setTimeout(() => setToast(null), 3500) }

  async function loadTrainings() {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('role_written_trainings')
      .select('*')
    if (error) { setLoadError(error.message); setLoading(false); return }
    const byRole = {}
    ;(data || []).forEach(row => { byRole[row.role] = row })
    setTrainings(byRole)
    setLoading(false)
  }

  const current = drafts[activeRole] || trainings[activeRole] || { content: '', requires_written_approval: false }
  const saved   = trainings[activeRole] || { content: '', requires_written_approval: false }
  const isDirty = JSON.stringify({ content: current.content, requires_written_approval: current.requires_written_approval })
    !== JSON.stringify({ content: saved.content, requires_written_approval: saved.requires_written_approval })

  function updateDraft(field, value) {
    setDrafts(prev => ({
      ...prev,
      [activeRole]: { ...(prev[activeRole] || trainings[activeRole] || { content: '', requires_written_approval: false }), [field]: value },
    }))
  }

  async function handleSave() {
    if (!canEditRoleTrainerContent(profile)) {
      msg('Only Administrative Assistants, Executive Assistants, and the Director can save changes.', 'error')
      return
    }
    setSaving(true)
    const { data, error } = await supabase
      .from('role_written_trainings')
      .upsert({
        role: activeRole,
        content: current.content || '',
        requires_written_approval: !!current.requires_written_approval,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'role' })
      .select()
      .single()

    if (error) {
      msg(`Failed to save: ${error.message}`, 'error')
      setSaving(false)
      return
    }

    setTrainings(prev => ({ ...prev, [activeRole]: data }))
    setDrafts(prev => {
      const next = { ...prev }
      delete next[activeRole]
      return next
    })
    msg(`${activeRole} written training saved`)
    setSaving(false)
  }

  function handleDiscard() {
    setDrafts(prev => {
      const next = { ...prev }
      delete next[activeRole]
      return next
    })
  }

  // ── Stable style objects ──────────────────────────────────────────────────
  const inputStyle = { width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.9rem', outline: 'none', fontFamily: 'DM Sans, sans-serif' }
  const labelStyle = { display: 'block', fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const card       = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <h2 style={{ fontWeight: 600, fontFamily: 'DM Sans, sans-serif', margin: 0 }}>Role Trainer Editor</h2>

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

      {loading ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Loading…</p>
      ) : (
        <>
          {/* Role selector pills */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {ROLES.map(r => {
              const active  = activeRole === r
              const hasDiff = !!drafts[r] && JSON.stringify({ content: drafts[r].content, requires_written_approval: drafts[r].requires_written_approval })
                !== JSON.stringify({ content: (trainings[r] || {}).content || '', requires_written_approval: !!(trainings[r] || {}).requires_written_approval })
              return (
                <button
                  key={r}
                  onClick={() => setActiveRole(r)}
                  style={{
                    padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 500,
                    cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', gap: '0.4rem',
                    background: active ? 'var(--accent)' + '18' : 'var(--surface)',
                    color: active ? 'var(--accent)' : 'var(--muted)',
                    border: active ? '1px solid var(--accent)55' : '1px solid var(--border)',
                  }}
                >
                  {r}
                  {hasDiff && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />}
                </button>
              )
            })}
          </div>

          {/* Editor */}
          <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
              <p style={{ fontWeight: 600, fontFamily: 'DM Sans, sans-serif', margin: 0 }}>{activeRole}</p>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--text)', fontFamily: 'DM Sans, sans-serif' }}>
                <input
                  type="checkbox"
                  checked={!!current.requires_written_approval}
                  onChange={e => updateDraft('requires_written_approval', e.target.checked)}
                />
                Requires written-training approval
              </label>
            </div>

            <div>
              <label style={labelStyle}>Written training content</label>
              <textarea
                value={current.content || ''}
                onChange={e => updateDraft('content', e.target.value)}
                placeholder="Written training content for this role…"
                rows={16}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', alignItems: 'center' }}>
              {isDirty && (
                <button
                  onClick={handleDiscard}
                  style={{ padding: '0.6rem 1.1rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--muted)', fontWeight: 600, fontFamily: 'DM Sans, sans-serif', fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  Discard
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving || !isDirty}
                style={{
                  padding: '0.6rem 1.1rem', borderRadius: '8px', border: 'none', fontWeight: 600, fontFamily: 'DM Sans, sans-serif', fontSize: '0.85rem',
                  cursor: (saving || !isDirty) ? 'not-allowed' : 'pointer',
                  background: (saving || !isDirty) ? 'var(--border)' : 'var(--accent)',
                  color: (saving || !isDirty) ? 'var(--muted)' : '#fff',
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}