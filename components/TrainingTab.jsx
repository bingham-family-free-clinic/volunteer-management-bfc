'use client'

import { useState, useEffect, useCallback } from 'react'
import { ROLE_QUALIFICATION_STATUS } from '../lib/constants'

export default function TrainingTab({supabase}) {
  const [volunteerPositions, setVolunteerPositions] = useState([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)

  function showToast(text, type) {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function pullVolunteerPositionsFromSupabase(){
    const { posData, error } = await supabase
          .from('profiles')
          .select()
    if(error){
      showToast(error.message, 'error')
    } else {
      setVolunteerPositions([...posData])
      if(!posData.length){
        showToast('No volunteerPositions', 'error')
      } else {
        showToast('Loading volunteers... (' + posData.length + ')', 'error')
      }
    }
  }

  useEffect(() => {
    pullVolunteerPositionsFromSupabase();
  }, [])

  useEffect(() => {
    showToast('loaded ' + volunteerPositions.length, 'error');
  }, [volunteerPositions])

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <p> Volunteer Positions </p>
      {!loading && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          {volunteerPositions && volunteerPositions.map(row => (
            <div style={card}>
              <p>
                <span>{row.full_name}</span>
                <span>{row.role}</span>
                <span>{row.qualification}</span>
              </p>
            </div>
          ))
          }
          {volunteerPositions && !volunteerPositions.length && (
            <div style={card}>
              <p> No volunteers </p>
            </div>
          )}
        </div>
      )}
      {toast && (
        <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'success' ? 'var(--accent)' : '#dc2626', color: '#fff', padding: '0.75rem 1.5rem', borderRadius: '100px', fontWeight: 500, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 200 }}>
          {toast.text}
        </div>
      )}
    </div>)

}
