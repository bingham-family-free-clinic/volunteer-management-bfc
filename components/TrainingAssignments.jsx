'use client'

import { useMemo, useState, useEffect } from 'react'
import { ROLES, AFFILIATION_LABELS, TRAINING_STATUSES } from '../lib/constants'

// 72 hours
const RECENTLY_EXPIRED_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000
// 2 weeks
const DEFAULT_EXPIRE_DATE_AHEAD_MS = 2 * 7 * 24 * 60 * 60 * 1000

export default function TrainingAssignments({
  supabase,
  title = 'Training Assignments',
  subtitle = 'Assign volunteers to train in roles'
}) {
  const [allTrainingAssignemnts, setAllTrainingAssignments] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [volunteers, setVolunteers] = useState([])

  async function pullVolunteersFromSupabase(){
    const {data, error} = await supabase
          .from('profiles')
          .select()
    if(error){
      setLoadError(error.message)
      return;
    } else {
      setLoadError(null)
      setVolunteers(data || [])
    }
  }

  async function pullAllTrainingAssignments(){
    const {data, error} = await supabase
          .from('person_training_assignments')
          .select()
    if(error){
      setLoadError(error.message)
      return;
    } else {
      setLoadError(null)
    }
    const savedAssignments = []
    for(const row of data){
      const expired = Date.parse(row.expires_at)
      const timeNow = Date.now()
      const trainer = volunteers.find()
      savedAssignemnts.push({
        trainerId: row.trainer_id,
        traineeId: row.trainee_id,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        role: ROLES.includes(row.role)?row.role:"No Role",
        expired: expired < timeNow,
        recentlyExpired: expired < timeNow && (timeNow - expired) <= RECENTLY_EXPIRED_THRESHOLD_MS
      })
    }
    setAllTrainingAssignments(savedAssignments)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontWeight: 600, fontSize: '1.1rem' }}>{title}</h2>
          {subtitle && <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>{subtitle}</p>}
        </div>
      </div>

      {/* Filters */}
      {/*
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <button
          onClick={() => setFiltersOpen(o => !o)}
          style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
        >
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Filters</span>
          <span style={{ transform: filtersOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--muted)' }}>▾</span>
        </button>
        {filtersOpen && (
          <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <input
                aria-label="Search volunteers by name or email"
                placeholder="Search name or email…"
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                style={{ ...inputStyle, flex: 1, minWidth: '180px' }}
              />
              <select
                aria-label="Filter by affiliation"
                value={filterAffiliation}
                onChange={e => setFilterAffiliation(e.target.value)}
                style={{ ...inputStyle, width: 'auto' }}
              >
                <option value="all">All affiliations</option>
                {AFFILIATION_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button onClick={() => setShowInactive(s => !s)} style={pillBtn(showInactive)}>
                {showInactive ? 'Hide Inactive' : 'Show Inactive'}
              </button>
              <button onClick={() => setShowEmpty(s => !s)} style={pillBtn(showEmpty)}>
                {showEmpty ? 'Hide Empty' : 'Show Empty'}
              </button>
            </div>
          </div>
        )}
      </div>
      */}

      {loadError && (
        <div style={{ ...card, borderColor: 'rgba(239,68,68,0.4)', color: '#ef4444', fontSize: '0.85rem' }}>
          Could not load volunteers: {loadError}
        </div>
      )}
    </div>
  )
}
