'use client'

import { useEffect, useState } from 'react'

const inputStyle = {
  width: '100%', padding: '0.75rem 1rem',
  background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: '8px', color: 'var(--text)',
  fontSize: '0.95rem', outline: 'none',
  fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
}
const labelStyle = {
  display: 'block', fontSize: '0.8rem', color: 'var(--muted)',
  marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em',
}

function mountainDateStr(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
}

function durationPreview(arrival, exit) {
  if (!arrival || !exit) return ''
  const [ah, am] = arrival.split(':').map(Number)
  const [eh, em] = exit.split(':').map(Number)
  if ([ah, am, eh, em].some(v => Number.isNaN(v))) return ''
  const mins = (eh * 60 + em) - (ah * 60 + am)
  if (mins <= 0) return ''
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`
}

export default function GuestHoursPage() {
  const [orgs, setOrgs] = useState([])
  const [orgsLoading, setOrgsLoading] = useState(true)
  const [orgId, setOrgId] = useState('')
  const [name, setName] = useState('')
  const [workDate, setWorkDate] = useState(() => mountainDateStr(0))
  const [arrival, setArrival] = useState('')
  const [exit, setExit] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    fetch('/api/guest-hours')
      .then(r => r.json())
      .then(d => setOrgs(d.organizations || []))
      .catch(() => setOrgs([]))
      .finally(() => setOrgsLoading(false))
  }, [])

  const mins = arrival && exit
    ? (() => {
        const [ah, am] = arrival.split(':').map(Number)
        const [eh, em] = exit.split(':').map(Number)
        if ([ah, am, eh, em].some(v => Number.isNaN(v))) return null
        return (eh * 60 + em) - (ah * 60 + am)
      })()
    : null
  const invalidReason =
    mins !== null && mins <= 0 ? 'Exit time must be after arrival time.'
    : mins !== null && mins < 15 ? 'Shift must be at least 15 minutes.'
    : mins !== null && mins > 12 * 60 ? 'Shifts over 12 hours cannot be submitted here — please see staff.'
    : ''

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const honeypot = e.target?.website?.value
    if (!orgId || !name.trim() || !workDate || !arrival || !exit) {
      setError('Please fill out every field.')
      return
    }
    if (invalidReason) { setError(invalidReason); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/guest-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_name: name.trim(),
          organization_id: orgId,
          work_date: workDate,
          arrival_time: arrival,
          exit_time: exit,
          website: honeypot || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        return
      }
      const orgName = orgs.find(o => o.id === orgId)?.name || data.organization || ''
      setSuccess({ name: name.trim(), orgName, duration: data.duration_hours })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function resetForNext() {
    setSuccess(null)
    setName('')
    setArrival('')
    setExit('')
    setWorkDate(mountainDateStr(0))
    setError('')
  }

  const preview = durationPreview(arrival, exit)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: '440px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <img src="/logo3.png" alt="Logo" style={{ width: '96px', height: 'auto', display: 'block', margin: '0 auto 1rem', borderRadius: '12px' }} />
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Volunteer Hours</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>One-time volunteers — log your time. No sign-in needed.</p>
        </div>

        {success ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'center' }}>
            <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid var(--accent)', borderRadius: '8px', padding: '1rem', color: 'var(--accent)', fontSize: '0.95rem' }}>
              Thanks, <strong>{success.name}</strong>!<br />
              Logged <strong>{success.duration}h</strong> for <strong>{success.orgName}</strong>.
            </div>
            <button type="button" onClick={resetForNext} style={{ padding: '0.85rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
              Submit another
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>Affiliation</label>
              <select value={orgId} onChange={e => setOrgId(e.target.value)} required disabled={orgsLoading} style={inputStyle}>
                <option value="">{orgsLoading ? 'Loading…' : '— Select affiliation —'}</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required maxLength={100} placeholder="First + Last" style={inputStyle} autoComplete="name" />
            </div>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} required min={mountainDateStr(-1)} max={mountainDateStr(1)} style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={labelStyle}>Arrival Time</label>
                <input type="time" value={arrival} onChange={e => setArrival(e.target.value)} required style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Exit Time</label>
                <input type="time" value={exit} onChange={e => setExit(e.target.value)} required style={inputStyle} />
              </div>
            </div>
            {preview && !invalidReason && (
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Duration: <strong style={{ color: 'var(--text)' }}>{preview}</strong></p>
            )}
            {invalidReason && (
              <p style={{ fontSize: '0.85rem', color: '#ef4444' }}>{invalidReason}</p>
            )}
            {/* Honeypot — hidden from humans */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" style={{ display: 'none' }} aria-hidden="true" />

            {error && (
              <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #ef4444', borderRadius: '8px', padding: '0.75rem 1rem', color: '#ef4444', fontSize: '0.875rem' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={submitting || !orgId || !name.trim() || !arrival || !exit || !!invalidReason} style={{ padding: '0.85rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Submitting…' : 'Submit Hours'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
