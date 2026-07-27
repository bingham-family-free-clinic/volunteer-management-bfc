'use client'
import { useState, useEffect } from 'react'
import { ROLES, TRAINING_STAGE_LABELS } from '../lib/constants'
import { formatDateTime } from '../lib/timeUtils'

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
// Step 4 — read-only. No mutations here; this step only proves the data model
// (training_tracks joined to profiles) renders correctly. Trigger/approve/vouch
// actions and the RBAC-widening of the tab's own visibility come in Steps 5, 6, 8.
export default function RoleTrainingDashboard({ supabase, profile }) {
  const [tracks, setTracks]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState(null)
  const [roleFilter, setRoleFilter]   = useState('all')
  const [stageFilter, setStageFilter] = useState('all')

  useEffect(() => { loadTracks() }, [])

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