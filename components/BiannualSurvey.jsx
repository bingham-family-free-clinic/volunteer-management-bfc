// TODO Change the survey months to the actual months when the survey is active. The current month represnt the intalization dates that will be phased out for the more more practial months.
'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ── Survey window configuration ──────────────────────────────────────────────
// Adjust these to change when the survey is active.
// The survey runs during the first full Mon–Sun week of each listed month (0-indexed).
export const SURVEY_MONTHS = [0, 6] // January (0) and July (6)
// export const SURVEY_MONTHS = [3,10] // April (3) and November (10)

// ── Date logic ────────────────────────────────────────────────────────────────
export function getSurveyWindow(year, month) {
  const firstDay = new Date(year, month, 1)
  const dayOfWeek = firstDay.getDay() // 0 = Sun, 1 = Mon …
  const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek
  const monday = new Date(year, month, 1 + daysUntilMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { start: monday, end: sunday }
}

export function isSurveyWeek() {
  const now = new Date()
  const month = now.getMonth()
  if (!SURVEY_MONTHS.includes(month)) return false
  const { start, end } = getSurveyWindow(now.getFullYear(), month)
  return now >= start && now <= end
}

export function currentSurveyPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ── Question config ───────────────────────────────────────────────────────────
const SCALE_QUESTIONS = [
  { id: 'q1', text: 'Overall, I have had a positive experience volunteering at BFC.' },
  { id: 'q2', text: 'My volunteer work feels meaningful and contributes to the clinic\'s mission.' },
  { id: 'q3', text: 'My volunteer experience at the clinic aligns well with my personal goals and needs.' },
  { id: 'q4', text: 'I understand what is expected of me in my volunteer role.' },
  { id: 'q5', text: 'I feel adequately trained and prepared for my responsibilities.' },
  { id: 'q6', text: 'Communication from clinic leadership and coordinators is clear and timely.' },
  { id: 'q7', text: 'Scheduling and volunteer logistics are handled effectively.' },
  { id: 'q8', text: 'I feel supported when questions or problems come up during my service.' },
  { id: 'q9', text: 'I anticipate serving at the Clinic six months from now.' },
]

const IMPROVEMENT_AREAS = [
  'Communication',
  'Scheduling',
  'Onboarding / Training',
  'Role Clarity',
  'Clinic Workflow / Supplies',
  'Recognition / Appreciation',
  'Flexibility in Opportunities',
  'Shift Leadership',
]

// ── Shared styles (matching page.js conventions) ──────────────────────────────
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
export default function BiannualSurvey({ userId, onSubmitted }) {
  const [answers, setAnswers]       = useState({})
  const [improvements, setImprovements] = useState([])
  const [frustrations, setFrustrations] = useState('')
  const [submitted, setSubmitted]   = useState(false)
  const [checking, setChecking]     = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState(null)

  const period = currentSurveyPeriod()

  // Check if this volunteer already submitted this period
  useEffect(() => {
    if (!userId) return
    async function check() {
      const { data } = await supabase
        .from('volunteer_feedback')
        .select('id')
        .eq('user_id', userId)
        .eq('survey_period', period)
        .maybeSingle()
      if (data) setSubmitted(true)
      setChecking(false)
    }
    check()
  }, [userId, period])

  function setScale(id, value) {
    setAnswers(prev => ({ ...prev, [id]: value }))
  }

  function toggleImprovement(area) {
    setImprovements(prev =>
      prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]
    )
  }

  const allScaleAnswered = SCALE_QUESTIONS.every(q => answers[q.id])

  async function handleSubmit() {
    if (!allScaleAnswered) return
    setSubmitting(true)
    setError(null)

    const row = {
      user_id:       userId,
      survey_period: period,
      submitted_at:  new Date().toISOString(),
      improvements:  improvements,
      frustrations:  frustrations.trim() || null,
    }
    SCALE_QUESTIONS.forEach(q => { row[q.id] = answers[q.id] })

    const { error: err } = await supabase.from('volunteer_feedback').insert(row)
    if (err) {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }
    setSubmitted(true)
    setSubmitting(false)
    if (onSubmitted) onSubmitted()
  }

  if (checking) return null

  // ── Submitted / confirmation view ─────────────────────────────────────────
  if (submitted) {
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
        <h2 style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.5rem' }}>Thank you for your service.</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6, maxWidth: '340px', margin: '0 auto' }}>
          We appreciate this feedback, and will use it to improve the volunteer experience at BFC.
        </p>
      </div>
    )
  }

  // ── Survey form ───────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Preamble */}
      <div style={{ ...S.card, background: 'rgba(2,65,107,0.03)', borderColor: 'rgba(2,65,107,0.15)' }}>
        <p style={{ fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.65 }}>
          This survey is hosted in the BFC Portal so we can better understand volunteer experiences across different roles and shifts. Responses will be reviewed in aggregate and used to improve the volunteer experience. They will not be used to evaluate, penalize, or negatively affect individual volunteers. The purpose of this form is to highlight areas the clinic should focus efforts to improve.
        </p>
      </div>

      {/* Scale questions */}
      <div style={S.card}>
        <p style={{ ...S.label, marginBottom: '1.25rem' }}>Questions 1–9 — Rate from 1 (least) to 5 (most)</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {SCALE_QUESTIONS.map((q, idx) => (
            <div key={q.id}>
              <p style={{ fontSize: '0.92rem', lineHeight: 1.5, marginBottom: '0.65rem', color: 'var(--text)' }}>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', color: 'var(--muted)', marginRight: '0.5rem' }}>{idx + 1}.</span>
                {q.text}
              </p>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {[1, 2, 3, 4, 5].map(val => {
                  const selected = answers[q.id] === val
                  return (
                    <button
                      key={val}
                      onClick={() => setScale(q.id, val)}
                      style={{
                        flex: 1,
                        padding: '0.55rem 0',
                        borderRadius: '8px',
                        border: selected ? 'none' : '1px solid var(--border)',
                        background: selected ? 'var(--accent)' : 'var(--bg)',
                        color: selected ? '#fff' : 'var(--muted)',
                        fontFamily: 'DM Mono, monospace',
                        fontSize: '0.9rem',
                        fontWeight: selected ? 700 : 400,
                        cursor: 'pointer',
                        transition: 'background 0.15s, color 0.15s',
                      }}
                    >
                      {val}
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>Least likely</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>Most likely</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Improvement areas */}
      <div style={S.card}>
        <p style={{ ...S.label, marginBottom: '0.25rem' }}>Question 10</p>
        <p style={{ fontSize: '0.92rem', lineHeight: 1.5, marginBottom: '1rem', color: 'var(--text)' }}>
          Improvements in which areas would have enhanced your volunteer experience?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {IMPROVEMENT_AREAS.map(area => {
            const checked = improvements.includes(area)
            return (
              <button
                key={area}
                onClick={() => toggleImprovement(area)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.65rem 0.9rem',
                  borderRadius: '8px',
                  border: checked ? '1px solid rgba(2,65,107,0.35)' : '1px solid var(--border)',
                  background: checked ? 'rgba(2,65,107,0.06)' : 'var(--bg)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'DM Sans, sans-serif',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{
                  width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0,
                  border: checked ? 'none' : '1.5px solid var(--border)',
                  background: checked ? 'var(--accent)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {checked && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1.5 5 4 7.5 8.5 2.5" />
                    </svg>
                  )}
                </span>
                <span style={{ fontSize: '0.9rem', color: checked ? 'var(--text)' : 'var(--muted)', fontWeight: checked ? 500 : 400 }}>
                  {area}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Open-ended frustrations */}
      <div style={S.card}>
        <label htmlFor="frustrations" style={{ ...S.label, marginBottom: '0.25rem' }}>Question 11</label>
        <p style={{ fontSize: '0.92rem', lineHeight: 1.5, marginBottom: '0.75rem', color: 'var(--text)' }}>
          What aspects of your volunteer experience could have been improved? What feedback would you like to share? 
        </p>
        <textarea
          id="frustrations"
          value={frustrations}
          onChange={e => setFrustrations(e.target.value)}
          placeholder="Please share any relevant thoughts."
          rows={4}
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text)',
            fontSize: '0.9rem',
            fontFamily: 'DM Sans, sans-serif',
            resize: 'vertical',
            outline: 'none',
            lineHeight: 1.55,
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <p style={{ fontSize: '0.85rem', color: 'var(--danger)', textAlign: 'center' }}>{error}</p>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!allScaleAnswered || submitting}
        style={{
          padding: '0.95rem',
          background: allScaleAnswered ? 'var(--accent)' : 'var(--surface)',
          color: allScaleAnswered ? '#fff' : 'var(--muted)',
          border: allScaleAnswered ? 'none' : '1px solid var(--border)',
          borderRadius: '10px',
          fontWeight: 600,
          fontSize: '1rem',
          cursor: allScaleAnswered && !submitting ? 'pointer' : 'not-allowed',
          fontFamily: 'DM Sans, sans-serif',
          transition: 'background 0.2s',
        }}
      >
        {submitting ? 'Submitting...' : !allScaleAnswered ? 'Answer all 9 scale questions to submit' : 'Submit Feedback'}
      </button>

    </div>
  )
}