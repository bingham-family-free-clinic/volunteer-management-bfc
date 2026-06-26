'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { TRAINING_ROLES, NO_ROLE_TRAINING_TEXT, formatWeekRange } from '../lib/trainingUtils'

// ── Shared styles (matching BiannualSurvey / page.js conventions) ────────────
const S = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '1.5rem',
  },
  label: {
    display: 'block',
    fontSize: '0.8rem',
    color: 'var(--muted)',
    marginBottom: '0.4rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
}

// ── Main component ────────────────────────────────────────────────────────────
// Displays this week's training and lets the volunteer acknowledge it.
// `weekStart` should be passed down from the page so the parent (which uses
// it to decide whether to show the tab/badge) and this component always
// agree on which week they're talking about.
export default function WeeklyTrainingBanner({ userId, roles = [], weekStart, onAcknowledged }) {
  const [training, setTraining]   = useState(null)
  const [checking, setChecking]   = useState(true)
  const [acknowledged, setAcknowledged] = useState(false)
  const [acking, setAcking]       = useState(false)
  const [error, setError]         = useState(null)
  const [openRoles, setOpenRoles] = useState(() => new Set(roles))

  useEffect(() => {
    if (!userId || !weekStart) return
    let cancelled = false
    async function load() {
      setChecking(true)
      const { data: row } = await supabase
        .from('weekly_trainings')
        .select('*')
        .eq('week_start', weekStart)
        .maybeSingle()
      if (cancelled) return
      setTraining(row || null)

      if (row) {
        const { data: ack } = await supabase
          .from('weekly_training_acknowledgments')
          .select('id')
          .eq('user_id', userId)
          .eq('week_start', weekStart)
          .maybeSingle()
        if (!cancelled && ack) setAcknowledged(true)
      }
      if (!cancelled) setChecking(false)
    }
    load()
    return () => { cancelled = true }
  }, [userId, weekStart])

  function toggleRole(r) {
    setOpenRoles(prev => {
      const next = new Set(prev)
      next.has(r) ? next.delete(r) : next.add(r)
      return next
    })
  }

  async function handleAcknowledge() {
    setAcking(true)
    setError(null)
    const { error: err } = await supabase
      .from('weekly_training_acknowledgments')
      .insert({ user_id: userId, week_start: weekStart })
    if (err) {
      setError('Something went wrong. Please try again.')
      setAcking(false)
      return
    }
    setAcknowledged(true)
    setAcking(false)
    if (onAcknowledged) onAcknowledged()
  }

  if (checking) return null
  if (!training) {
    return (
      <div style={{ ...S.card, textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>
        No training has been posted for this week yet.
      </div>
    )
  }

  // ── Completed view ─────────────────────────────────────────────────────────
  if (acknowledged) {
    return (
      <div style={{ ...S.card, textAlign: 'center', padding: '2.5rem 1.5rem' }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '50%',
          background: 'rgba(2,65,107,0.08)', border: '1px solid rgba(2,65,107,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1.25rem',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.5rem' }}>Training complete.</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6, maxWidth: '340px', margin: '0 auto' }}>
          Thanks for staying current. This week's training won't show again until next week.
        </p>
      </div>
    )
  }

  // ── Training content ──────────────────────────────────────────────────────
  const announcements = training.announcements || []
  const roleEntries = TRAINING_ROLES.map(r => [r, training.role_trainings?.[r]?.trim() || ''])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Header */}
      <div>
        <h2 style={{ fontWeight: 600, fontSize: '1.05rem', marginBottom: '0.2rem' }}>Bingham Family Clinic Training</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{formatWeekRange(weekStart)}</p>
      </div>

      {/* Preamble */}
      <div style={{ ...S.card, background: 'rgba(2,65,107,0.03)', borderColor: 'rgba(2,65,107,0.15)' }}>
        <p style={{ fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.65 }}>
          If you have any questions about this week's training, please contact your immediate supervisor — unless otherwise designated, the Office Manager or Clinical Supervisor.
        </p>
      </div>

      {/* Announcements */}
      {announcements.length > 0 && (
        <div style={S.card}>
          <p style={{ ...S.label, marginBottom: '0.75rem' }}>Announcements</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {announcements.map((a, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.9rem', color: 'var(--accent)', lineHeight: 1.5, flexShrink: 0 }}>–</span>
                <p style={{ fontSize: '0.92rem', color: 'var(--text)', lineHeight: 1.5, margin: 0 }}>{a}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* General training */}
      {training.general_training && (
        <div style={S.card}>
          <p style={{ ...S.label, marginBottom: '0.75rem' }}>General Training</p>
          <p style={{ fontSize: '0.92rem', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {training.general_training}
          </p>
        </div>
      )}

      {/* Weekly goal */}
      {training.weekly_goal && (
        <div style={S.card}>
          <p style={{ ...S.label, marginBottom: '0.5rem' }}>Weekly Goal</p>
          <p style={{ fontSize: '0.92rem', color: 'var(--text)', lineHeight: 1.55 }}>{training.weekly_goal}</p>
        </div>
      )}

      {/* Last week's result */}
      {training.last_week_goal_result && (
        <div style={S.card}>
          <p style={{ ...S.label, marginBottom: '0.5rem' }}>Result of Last Week's Goal</p>
          <p style={{ fontSize: '0.92rem', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {training.last_week_goal_result}
          </p>
        </div>
      )}

      {/* Role-specific trainings */}
      <div style={S.card}>
        <p style={{ ...S.label, marginBottom: '1rem' }}>Specific Role Trainings</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {roleEntries.map(([r, text]) => {
            const open = openRoles.has(r)
            const isMyRole = roles.includes(r)
            return (
              <div
                key={r}
                style={{
                  border: isMyRole ? '1px solid rgba(2,65,107,0.35)' : '1px solid var(--border)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  background: isMyRole ? 'rgba(2,65,107,0.03)' : 'transparent',
                }}
              >
                <button
                  onClick={() => toggleRole(r)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.7rem 0.9rem', background: 'transparent', border: 'none', cursor: 'pointer',
                    fontFamily: 'DM Sans, sans-serif', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: '0.9rem', fontWeight: isMyRole ? 600 : 500, color: 'var(--text)' }}>
                    {r}{isMyRole && <span style={{ color: 'var(--accent)', fontWeight: 500 }}> · your role</span>}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
                {open && (
                  <div style={{ padding: '0 0.9rem 0.9rem' }}>
                    <p style={{ fontSize: '0.88rem', color: text ? 'var(--text)' : 'var(--muted)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                      {text || NO_ROLE_TRAINING_TEXT}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Error */}
      {error && <p style={{ fontSize: '0.85rem', color: 'var(--danger)', textAlign: 'center' }}>{error}</p>}

      {/* Acknowledge */}
      <button
        onClick={handleAcknowledge}
        disabled={acking}
        style={{
          padding: '0.95rem',
          background: 'var(--accent)',
          color: '#fff',
          border: 'none',
          borderRadius: '10px',
          fontWeight: 600,
          fontSize: '1rem',
          cursor: acking ? 'not-allowed' : 'pointer',
          fontFamily: 'DM Sans, sans-serif',
          opacity: acking ? 0.7 : 1,
        }}
      >
        {acking ? 'Submitting…' : "I've Completed This Week's Training"}
      </button>

    </div>
  )
}