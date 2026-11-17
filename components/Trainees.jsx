'use client'

import { useMemo, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { AFFILIATION_LABELS } from '../lib/constants'

// {
// id: string,
// volunteer_id: string,
// day_of_week: string,
// role: string,
// week_pattern: string,
// being_trained_by: string (always the ID of the current volunteer viewing),
// trainee: {
//  id: string,
//  full_name: string,
//  email: string,
//  role: string
// }
// }
// Group the training assignments the current volunteer is handling (rows
// where `being_trained_by` matches this viewer) into one entry per trainee
// they are training, sorted by trainee name.
function getTraineesFromSchedule(schedule){
  const groups = new Map()
  ;(schedule || []).forEach(row => {
    const trainee = row?.trainee
    if (!trainee) return
    const id = trainee.id || row.volunteer_id
    if (!groups.has(id)) groups.set(id, { trainee, assignments: [] })
    groups.get(id).assignments.push(row)
  })
  return Array.from(groups.values())
              .sort((a, b) => (a.trainee?.full_name || '').localeCompare(b.trainee?.full_name || ''))
}

// ── Style tokens (mirrors the admin Volunteers tab / VolunteerTraining UI) ────
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }

const badgeStyle = (color) => ({
  display: 'inline-block',
  padding: '0.2rem 0.6rem',
  borderRadius: '100px',
  fontSize: '0.75rem',
  fontWeight: 500,
  background: color + '22',
  color,
  border: `1px solid ${color}55`,
})

const AFFILIATION_COLORS = {
  missionary: '#818cf8',
  intern: '#150d5a',
  student: '#38bdf8',
  volunteer: '#02416B',
  provider: '#7dd3fc',
}

// ── Training-status helpers (mirror VolunteerTraining.jsx) ────────────────────
const STATUS_LABELS = {
  Trainer: 'Trainers',
  Trained: 'Trained',
  Training: 'In Training',
  'No status': 'No Status',
}

const STATUS_COLORS = {
  Trainer: '#f59e0b',
  Trained: '#22c55e',
  Training: '#38bdf8',
  'No status': '#9ca3af',
}

function statusLabel(status) {
  return STATUS_LABELS[status] ?? status
}

function weekPatternLabel(pattern) {
  if (!pattern) return null
  if (pattern === 'odd') return '1st & 3rd week'
  if (pattern === 'even') return '2nd & 4th week'
  return null
}

function vouchButtonStyle(done) {
  return {
    padding: '0.45rem 0.85rem',
    borderRadius: '8px',
    fontSize: '0.78rem',
    fontWeight: 600,
    cursor: done ? 'default' : 'pointer',
    fontFamily: 'DM Sans, sans-serif',
    background: done ? 'rgba(34,197,94,0.12)' : 'rgba(2,65,107,0.08)',
    color: done ? '#16a34a' : 'var(--accent)',
    border: `1px solid ${done ? 'rgba(34,197,94,0.35)' : 'rgba(2,65,107,0.35)'}`,
  }
}

export default function Trainees({
  trainingSchedule = [],
  trainerId: trainerIdProp,
}) {
  const [trainerId, setTrainerId] = useState(trainerIdProp || null)
  const [traineeGroups, setTraineeGroups] = useState(() => getTraineesFromSchedule(trainingSchedule))
  const [qualifications, setQualifications] = useState({})
  const [vouchingKey, setVouchingKey] = useState(null)
  const [vouchedTraineeRoles, setVouchedTraineeRoles] = useState({})
  const [toast, setToast] = useState(null)

  useEffect(() => {
    setTraineeGroups(getTraineesFromSchedule(trainingSchedule))
  }, [trainingSchedule])

  useEffect(() => {
    let cancelled = false
    async function resolveTrainerId() {
      if (trainerIdProp) { setTrainerId(trainerIdProp); return }
      const { data } = await supabase.auth.getUser()
      if (!cancelled) setTrainerId(data?.user?.id ?? null)
    }
    resolveTrainerId()
    return () => { cancelled = true }
  }, [trainerIdProp])

  const traineeIds = useMemo(
    () => Array.from(new Set((traineeGroups || []).map(g => g.trainee?.id).filter(Boolean))),
    [traineeGroups]
  )

  useEffect(() => {
    if (traineeIds.length === 0) { setQualifications({}); return }
    let cancelled = false
    supabase
      .from('person_role_qualifications')
      .select('person_id, role, qualification')
      .in('person_id', traineeIds)
      .then(({ data }) => {
        if (cancelled) return
        const map = {}
        ;(data || []).forEach(row => { map[`${row.person_id}:${row.role}`] = row.qualification })
        setQualifications(map)
      })
      .catch(() => { if (!cancelled) setQualifications({}) })
    return () => { cancelled = true }
  }, [traineeIds])

  function showToast(text, type = 'success') {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleVouch(trainee, role) {
    if (!trainee?.id || !role || vouchingKey) return
    const key = `${trainee.id}:${role}`
    setVouchingKey(key)

    /*
      const { error } = await supabase
      .from('person_role_qualifications')
      .delete()
      .eq('person_id', trainee.id)
      .eq('role', role)
      if (error) { setVouchingKey(null); showToast('Could not vouch — ' + error.message, 'error'); return }

      const { error: insertError } = await supabase
      .from('person_role_qualifications')
      .insert({ person_id: trainee.id, role, qualification: 'Trained', being_trained_by: trainerId })
      if (insertError) { setVouchingKey(null); showToast('Could not vouch — ' + insertError.message, 'error'); return }
    */

    const { error } = await supabase
          .from('person_role_qualifications')
          .update({ qualification: 'Trained' })
          .match({ person_id: trainee.id, role: role })

    if (error) { setVouchingKey(null); showToast('Could not vouch qualification — ' + insertError.message, 'error'); return }

    const { error: schedulingError } = await supabase
          .from('schedule')
          .update({ being_trained_by: null })
          .match({ volunteer_id: trainee.id, role: role })

    if (schedulingError) { setVouchingKey(null); showToast('Could not update schedule of volunteer (You may still be listed as training) — ' + insertError.message, 'error'); return }

    console.log(trainee, role);

    setVouchingKey(null)
    setVouchedTraineeRoles(prev => ({ ...prev, [trainee.id]: role }))
    setQualifications(prev => ({ ...prev, [`${trainee.id}:${role}`]: 'Trained' }))
    showToast(`${trainee.full_name || 'Trainee'} vouched for in ${role}.`, 'success')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div>
        <h2 style={{ fontWeight: 600, fontSize: '1.1em' }}>Trainees</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
          Volunteers you are training. Vouch for a trainee once their training is complete.
        </p>
      </div>

      {/* Trainees this volunteer is training */}
      {traineeGroups.length === 0 ? (
        <div style={{ ...card, textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: '0.9rem' }}>
            You are not training anyone right now.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {traineeGroups.map(group => {
            const { trainee, assignments } = group
            const traineeId = trainee?.id
            const traineeName = trainee?.full_name || 'Unnamed trainee'

            const trainingAssignments = []
            const seenRoles = new Set()
            ;(assignments || []).forEach(a => {
              if (!a?.role || seenRoles.has(a.role)) return
              seenRoles.add(a.role)
              trainingAssignments.push(a)
            })

            return (
              <div key={traineeId || traineeName} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                {/* Trainee summary */}
                <div style={{ padding: '0.85rem 1rem', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: 'var(--accent)', flexShrink: 0, overflow: 'hidden' }}>
                      {trainee?.avatar_url ? (
                        <img src={trainee.avatar_url} alt={traineeName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        traineeName?.charAt(0) || '?'
                      )}
                    </div>
                    <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                      <p style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{traineeName}</p>
                      {trainee?.email && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trainee.email}</p>
                      )}
                    </div>
                    {trainee?.affiliation && (
                      <span style={badgeStyle(AFFILIATION_COLORS[trainee.affiliation] ?? '#9ca3af')}>
                        {AFFILIATION_LABELS[trainee.affiliation] ?? trainee.affiliation}
                      </span>
                    )}
                  </div>
                </div>

                {/* Training assignments */}
                <div style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--surface)' }}>
                  {trainingAssignments.length === 0 ? (
                    <p style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: '0.85rem' }}>No training assignments found.</p>
                  ) : (
                    trainingAssignments.map(a => {
                      const status = traineeId ? qualifications[`${traineeId}:${a.role}`] : null
                      const vouchedDone = traineeId ? vouchedTraineeRoles[traineeId] === a.role : false
                      const vouchingThis = vouchingKey === `${traineeId}:${a.role}`
                      const dayLabel = [a.day_of_week, a.shift_time].filter(Boolean).join(' · ')

                      return (
                        <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', minWidth: 0 }}>
                            {/*dayLabel && <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>{dayLabel}</span>*/}
                            {a.role && <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{a.role}</span>}
                            {/*weekPatternLabel(a.week_pattern) && <span style={{ fontSize: '0.72rem', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', borderRadius: '4px', padding: '0.1rem 0.35rem' }}>{weekPatternLabel(a.week_pattern)}</span>*/}
                            {a.notes && <span style={{ fontSize: '0.72rem', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', borderRadius: '4px', padding: '0.1rem 0.35rem' }}>{a.notes}</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {status && <span style={badgeStyle(STATUS_COLORS[status] ?? '#9ca3af')}>{statusLabel(status)}</span>}
                            {status !== 'Trainer' && (
                              <button
                                type="button"
                                onClick={() => handleVouch(trainee, a.role)}
                                disabled={vouchingThis}
                                aria-label={`Vouch for ${traineeName}${a.role ? ` in ${a.role}` : ''}`}
                                style={vouchButtonStyle(vouchedDone || vouchingThis)}
                              >
                                {vouchingThis ? 'Voching…' : vouchedDone ? 'Vouched ✓' : 'Vouch'}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'success' ? 'var(--accent)' : 'var(--danger)', color: '#fff', padding: '0.75rem 1.5rem', borderRadius: '100px', fontWeight: 500, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 2000 }}>
          {toast.text}
        </div>
      )}
    </div>
  )
}
