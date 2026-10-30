'use client'

import { useState, useEffect, useRef } from 'react'
import {
  getMonday,
  toWeekKey,
  currentTrainingWeekStart,
  nextTrainingWeekStart,
  formatWeekRangeShort,
  TRAINING_ROLES,
} from '../lib/trainingUtils'
import { isSurveyWeekKey } from './BiannualSurvey'

// ── Shared styles (matching admin page conventions) ───────────────────────────
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
const S = {
  card,
  input: {
    width: '100%',
    padding: '0.7rem 0.9rem',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text)',
    fontSize: '0.9rem',
    outline: 'none',
    fontFamily: 'DM Sans, sans-serif',
    boxSizing: 'border-box',
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

const BLANK_ROLE_TRAININGS = Object.fromEntries(TRAINING_ROLES.map(r => [r, '']))

// Sizes a textarea once to fit its current content, floored at a minimum
// number of lines (matching its original `rows`), for browsers that don't
// support the native `field-sizing: content` CSS property.
function applyFallbackSizing(el, minLines) {
  const computed = window.getComputedStyle(el)
  const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2 || 20
  const paddingTop = parseFloat(computed.paddingTop) || 0
  const paddingBottom = parseFloat(computed.paddingBottom) || 0
  const minHeight = lineHeight * minLines + paddingTop + paddingBottom

  el.style.height = 'auto'
  const contentHeight = el.scrollHeight
  el.style.height = Math.max(contentHeight, minHeight) + 'px'
}

// ── Main component ────────────────────────────────────────────────────────────
// Lets an admin create or edit the training content for a given week.
// Defaults to next week, since that's the primary workflow ("prep next
// week's training"), but admins can switch to the current week or pick any
// date to correct/backfill a different week.
export default function WeeklyTraining({ supabase, profile }) {
  const [weekStart, setWeekStart] = useState(() => nextTrainingWeekStart())
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState(null)
  const [saved, setSaved]         = useState(false)

  const [recordId, setRecordId]               = useState(null)
  const [announcements, setAnnouncements]     = useState([''])
  const [generalTraining, setGeneralTraining] = useState('')
  const [weeklyGoal, setWeeklyGoal]           = useState('')
  const [lastWeekResult, setLastWeekResult]   = useState('')
  const [roleTrainings, setRoleTrainings]     = useState(BLANK_ROLE_TRAININGS)
  const [openRoles, setOpenRoles]             = useState(new Set())

  // Auto size textboxes if browser supports it
  const [supportsFieldSizing] = useState(() =>
    typeof CSS !== 'undefined' && CSS.supports && CSS.supports('field-sizing', 'content')
  )
  const generalTrainingRef = useRef(null)
  const lastWeekResultRef  = useRef(null)
  const roleTextareaRefs   = useRef({})
  const roleRefFns         = useRef({})

  function getRoleRefFn(role) {
    if (!roleRefFns.current[role]) {
      roleRefFns.current[role] = (el) => {
        if (el) {
          roleTextareaRefs.current[role] = el
          if (!supportsFieldSizing) applyFallbackSizing(el, 3)
        } else {
          delete roleTextareaRefs.current[role]
        }
      }
    }
    return roleRefFns.current[role]
  }

  useEffect(() => {
    if (loading || supportsFieldSizing) return
    if (generalTrainingRef.current) applyFallbackSizing(generalTrainingRef.current, 5)
    if (lastWeekResultRef.current) applyFallbackSizing(lastWeekResultRef.current, 3)
  }, [loading, supportsFieldSizing])

  // Load whatever exists for the selected week (or reset to blank)
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setSaved(false)
      const { data, error: err } = await supabase
        .from('weekly_trainings')
        .select('*')
        .eq('week_start', weekStart)
        .maybeSingle()
      if (cancelled) return
      if (err) {
        setError('Could not load training for this week.')
        setLoading(false)
        return
      }
      if (data) {
        setRecordId(data.id)
        setAnnouncements(data.announcements?.length ? data.announcements : [''])
        setGeneralTraining(data.general_training || '')
        setWeeklyGoal(data.weekly_goal || '')
        setLastWeekResult(data.last_week_goal_result || '')
        setRoleTrainings({ ...BLANK_ROLE_TRAININGS, ...(data.role_trainings || {}) })
      } else {
        setRecordId(null)
        setAnnouncements([''])
        setGeneralTraining('')
        setWeeklyGoal('')
        setLastWeekResult('')
        setRoleTrainings(BLANK_ROLE_TRAININGS)
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [weekStart, supabase])

  function updateAnnouncement(idx, value) {
    setAnnouncements(prev => prev.map((a, i) => (i === idx ? value : a)))
  }
  function addAnnouncement() {
    setAnnouncements(prev => [...prev, ''])
  }
  function removeAnnouncement(idx) {
    setAnnouncements(prev => prev.length === 1 ? [''] : prev.filter((_, i) => i !== idx))
  }

  function toggleRole(role) {
    setOpenRoles(prev => {
      const next = new Set(prev)
      next.has(role) ? next.delete(role) : next.add(role)
      return next
    })
  }

  function updateRoleTraining(role, value) {
    setRoleTrainings(prev => ({ ...prev, [role]: value }))
  }

  function handleWeekPick(dateStr) {
    if (!dateStr) return
    const [y, m, d] = dateStr.split('-').map(Number)
    setWeekStart(toWeekKey(getMonday(new Date(y, m - 1, d))))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)

    const cleanedAnnouncements = announcements.map(a => a.trim()).filter(Boolean)
    const cleanedRoleTrainings = Object.fromEntries(
      Object.entries(roleTrainings).map(([role, text]) => [role, text.trim()])
    )

    const row = {
      week_start:             weekStart,
      announcements:          cleanedAnnouncements,
      general_training:       generalTraining.trim() || null,
      weekly_goal:            weeklyGoal.trim() || null,
      last_week_goal_result:  lastWeekResult.trim() || null,
      role_trainings:         cleanedRoleTrainings,
      updated_by:             profile?.id || null,
      ...(recordId ? {} : { created_by: profile?.id || null }),
    }

    const { data, error: err } = await supabase
      .from('weekly_trainings')
      .upsert(row, { onConflict: 'week_start' })
      .select()
      .single()

    if (err) {
      setError('Something went wrong saving this training. Please try again.')
      setSaving(false)
      return
    }

    setRecordId(data.id)
    setSaving(false)
    setSaved(true)
  }

  const isCurrentWeek = weekStart === currentTrainingWeekStart()
  const isNextWeek     = weekStart === nextTrainingWeekStart()
  // Training is never published during the volunteer feedback survey week
  const surveyBlocked      = isSurveyWeekKey(weekStart)
  const currentIsSurvey    = isSurveyWeekKey(currentTrainingWeekStart())
  const nextIsSurvey       = isSurveyWeekKey(nextTrainingWeekStart())
  const filledRoleCount = Object.values(roleTrainings).filter(t => t.trim()).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Week selector */}
      <div style={card}>
        <p style={{ ...S.label, marginBottom: '0.75rem' }}>Week</p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.9rem' }}>
          <button
            onClick={() => setWeekStart(currentTrainingWeekStart())}
            style={{
              padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif',
              background: isCurrentWeek ? 'var(--accent)' : 'var(--bg)',
              color: isCurrentWeek ? '#fff' : 'var(--muted)',
              border: isCurrentWeek ? 'none' : '1px solid var(--border)',
            }}
          >
            This Week{currentIsSurvey && <span style={{ marginLeft: '0.4rem', fontSize: '0.68rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: '999px', background: 'rgba(217,119,6,0.15)', color: '#b45309' }}>Survey week</span>}
          </button>
          <button
            onClick={() => setWeekStart(nextTrainingWeekStart())}
            style={{
              padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif',
              background: isNextWeek ? 'var(--accent)' : 'var(--bg)',
              color: isNextWeek ? '#fff' : 'var(--muted)',
              border: isNextWeek ? 'none' : '1px solid var(--border)',
            }}
          >
            Upcoming Week{nextIsSurvey && <span style={{ marginLeft: '0.4rem', fontSize: '0.68rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: '999px', background: 'rgba(217,119,6,0.15)', color: '#b45309' }}>Survey week</span>}
          </button>
          <input
            type="date"
            onChange={e => handleWeekPick(e.target.value)}
            style={{ ...S.input, width: 'auto', padding: '0.45rem 0.7rem', fontSize: '0.85rem' }}
          />
        </div>
        <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>
          Monday {formatWeekRangeShort(weekStart)} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({weekStart})</span>
        </p>
        {recordId && (
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.3rem' }}>Editing an existing training for this week.</p>
        )}
      </div>

      {/* Survey-week notice */}
      {surveyBlocked && (
        <div
          role="alert"
          style={{
            display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
            padding: '1rem 1.1rem', borderRadius: '12px',
            background: 'rgba(217,119,6,0.10)', border: '1px solid rgba(217,119,6,0.45)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '0.1rem' }}>
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <p style={{ fontWeight: 600, fontSize: '0.92rem', color: '#b45309', marginBottom: '0.2rem' }}>
              This training will not be published
            </p>
            <p style={{ fontSize: '0.84rem', color: 'var(--text)', lineHeight: 1.5, margin: 0 }}>
              This is the Volunteer Feedback Survey week, so volunteers will not see a weekly training for {formatWeekRangeShort(weekStart)}.
              {recordId ? ' Anything saved here stays hidden from volunteers.' : ' You can still save content here, but it will stay hidden from volunteers.'}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>Loading…</div>
      ) : (
        <>
          {/* Announcements */}
          <div style={card}>
            <p style={{ ...S.label, marginBottom: '0.75rem' }}>Announcements</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {announcements.map((a, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    value={a}
                    onChange={e => updateAnnouncement(idx, e.target.value)}
                    placeholder="Announcement"
                    style={S.input}
                  />
                  <button
                    onClick={() => removeAnnouncement(idx)}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0 0.8rem', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addAnnouncement}
              style={{ marginTop: '0.6rem', background: 'none', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.5rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'DM Sans, sans-serif' }}
            >
              + Add announcement
            </button>
          </div>

          {/* General training */}
          <div style={card}>
            <label style={{ ...S.label, marginBottom: '0.5rem' }}>General Training</label>
            <textarea
              ref={generalTrainingRef}
              value={generalTraining}
              onChange={e => setGeneralTraining(e.target.value)}
              rows={5}
              placeholder="This week's general training content…"
              style={{ ...S.input, resize: supportsFieldSizing ? 'none' : 'vertical', overflowY: 'auto', overflowX: 'hidden', fieldSizing: 'content', minBlockSize: '5lh', lineHeight: 1.55 }}
            />
          </div>

          {/* Weekly goal / last week's result */}
          <div style={card}>
            <label style={{ ...S.label, marginBottom: '0.5rem' }}>Weekly Goal <span style={{ textTransform: 'none', fontWeight: 400 }}>(leave blank to hide this week)</span></label>
            <input
              value={weeklyGoal}
              onChange={e => setWeeklyGoal(e.target.value)}
              placeholder="e.g. Improve check-in wait times"
              style={{ ...S.input, marginBottom: '1.1rem' }}
            />
            <label style={{ ...S.label, marginBottom: '0.5rem' }}>Result of Last Week's Goal <span style={{ textTransform: 'none', fontWeight: 400 }}>(leave blank to hide)</span></label>
            <textarea
              ref={lastWeekResultRef}
              value={lastWeekResult}
              onChange={e => setLastWeekResult(e.target.value)}
              rows={4}
              placeholder="How did last week's goal go?"
              style={{ ...S.input, resize: supportsFieldSizing ? 'none' : 'vertical', overflowY: 'auto', overflowX: 'hidden', fieldSizing: 'content', minBlockSize: '4lh', lineHeight: 1.55 }}
            />
          </div>

          {/* Role-specific trainings */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
              <p style={S.label}>Role-Specific Trainings</p>
              <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{filledRoleCount} of {TRAINING_ROLES.length} filled in</p>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
              Leave a role blank and volunteers in that role will see "No specific weekly training for this role."
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {TRAINING_ROLES.map(role => {
                const open = openRoles.has(role)
                const hasContent = roleTrainings[role]?.trim()
                return (
                  <div key={role} style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                    <button
                      onClick={() => toggleRole(role)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0.7rem 0.9rem', background: 'var(--bg)', border: 'none', cursor: 'pointer',
                        fontFamily: 'DM Sans, sans-serif', textAlign: 'left',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 500, color: 'var(--text)' }}>
                        {hasContent && <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
                        {role}
                      </span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                    {open && (
                      <div style={{ padding: '0.9rem' }}>
                        <textarea
                          ref={getRoleRefFn(role)}
                          value={roleTrainings[role] || ''}
                          onChange={e => updateRoleTraining(role, e.target.value)}
                          rows={3}
                          placeholder="No specific weekly training for this role"
                          style={{ ...S.input, resize: supportsFieldSizing ? 'none' : 'vertical', overflowY: 'auto', overflowX: 'hidden', fieldSizing: 'content', minBlockSize: '3lh', lineHeight: 1.5 }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Error / save */}
          {error && <p style={{ fontSize: '0.85rem', color: 'var(--danger)', textAlign: 'center' }}>{error}</p>}
          {saved && !error && (
            surveyBlocked
              ? <p style={{ fontSize: '0.85rem', color: '#b45309', textAlign: 'center' }}>Saved — but volunteers will not see this training because it falls in the survey week.</p>
              : <p style={{ fontSize: '0.85rem', color: 'var(--accent)', textAlign: 'center' }}>Saved — volunteers will see this when their week begins.</p>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '0.95rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '10px',
              fontWeight: 600, fontSize: '1rem', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving
              ? 'Saving…'
              : surveyBlocked
                ? 'Save Training (Not Published — Survey Week)'
                : recordId ? 'Update Training' : 'Publish Training'}
          </button>
        </>
      )}
    </div>
  )
}