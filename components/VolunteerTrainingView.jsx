'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { NO_ROLE_TRAINING_TEXT } from '../lib/trainingUtils'
import { ROLES } from '../lib/constants.js'

// ── Shared styles (matching BiannualSurvey / page.js conventions) ────────────
const S = {
  card: {
    background: 'var(--surface)',
    borderWidth: '1px solid var(--border)',
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

const inputStyle = { width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box' }

// ── Main component ────────────────────────────────────────────────────────────
// Volunteer-facing counterpart to the admin VolunteerRoleTraining editor
// (VolunteerRoleTraining.jsx): lets a volunteer read the training materials
// stored for a volunteer role. Layout mirrors WeeklyTrainingBanner.jsx — header,
// preamble, then content cards — but is read-only (no acknowledgement flow).

export default function VolunteerTrainingView({ profileRoles = [], role = false}) {
  const traineeRoles = profileRoles.filter(row => row.qualification == 'Trainee').map(row => row.role)
  const trainerRoles = profileRoles.filter(row => row.qualification == 'Trainer').map(row => row.role)

  const [selectedRole, setSelectedRole] = useState(role || traineeRoles[0] || '')
  const isMyRole = traineeRoles.includes(selectedRole)

  const [training, setTraining] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!selectedRole) {
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error: err } = await supabase
            .from('volunteer_role_trainings')
            .select('*')
            .eq('role', selectedRole)
            .maybeSingle()
      if (cancelled) return
      if (err) {
        setError('Could not load training for this role.')
        setLoading(false)
        return
      }
      setTraining(data || null)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [selectedRole])

  const preambleUi = (
    <div style={{ ...S.card, background: 'rgba(2,65,107,0.03)', borderColor: 'rgba(2,65,107,0.15)' }}>
      <p style={{ fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.65 }}>
        If you have any questions about this training, please contact your immediate supervisor — unless otherwise designated, the Office Manager or Clinical Supervisor.
      </p>
    </div>
  )

  const selectUi = (        <div>
                              <select
                                aria-label="Select which role to view the training for"
                                value={selectedRole}
                                placeholder="Select a role..."
                                onChange={e => setSelectedRole(e.target.value)}
                                style={{ ...inputStyle, flex: 1, minWidth: '180px' }}
                              >
                                {traineeRoles.map(role => (
                                  <option key={role} value={role}>{role} (Trainee)</option>
                                ))}
                                {trainerRoles.map(role => (
                                  <option key={role} value={role}>{role} (Trainer)</option>
                                ))}
                              </select>
                            </div>)

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {selectUi}
        {preambleUi}
        <div style={{ ...S.card, textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>
          <div>
            Loading...
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {selectUi}
        {preambleUi}
        <p style={{ fontSize: '0.85rem', color: 'var(--danger)', textAlign: 'center' }}>
          {error}
        </p>
      </div>
    )
  }

  if (!training) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'qrem' }}>
        {selectUi}
        {preambleUi}
        <div style={{ ...S.card, textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>
          No training has been set for this role yet.
        </div>
      </div>
    )
  }

  const traineeMaterial = training.trainee_material || ''
  const trainerMaterial = training.trainer_material || ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      {selectUi}
      <div>
        <h2 style={{ fontWeight: 600, fontSize: '1.05rem', marginBottom: '0.2rem' }}>
          {selectedRole} Training
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          {isMyRole ? `This is your training for ${selectedRole}.` : `Training materials for ${selectedRole} volunteers.`}
        </p>
      </div>

      {/* Preamble */}
      {preambleUi}

      {/* Trainee material */}
      { traineeRoles.includes(selectedRole) && (
        <div style={S.card}>
          <p style={{ ...S.label, marginBottom: '0.75rem' }}>Trainee Material</p>
          <p style={{ fontSize: '0.92rem', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {traineeMaterial || NO_ROLE_TRAINING_TEXT}
          </p>
        </div>
      )}

      {/* Trainer material */}
      { trainerRoles.includes(selectedRole) && (
        <div style={S.card}>
          <p style={{ ...S.label, marginBottom: '0.75rem' }}>Trainer Material</p>
          <p style={{ fontSize: '0.92rem', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {trainerMaterial || NO_ROLE_TRAINING_TEXT}
          </p>
        </div>
      )}
    </div>
  )
}
