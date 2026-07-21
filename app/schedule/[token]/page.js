'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { groupSlotsByDay, formatSlotTime, formatSlotFull, TIMEZONE_LABEL } from '../../../lib/interview-schedule'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// ── palette (mirrors volunteer page's CSS variables) ────────────────────────
const C = {
  primary: 'var(--text)',
  blue:    'var(--accent)',
  light:   'var(--accent)',
  pale:    'var(--border)',
  muted:   'var(--muted)',
  warn:    'var(--warn)',
  danger:  'var(--danger)',
  success: 'var(--accent)',
}

const FONT = 'DM Sans, sans-serif'
const MONO = 'DM Mono, monospace'

// ── shared style objects (mirrors volunteer page's S object) ────────────────
const S = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '1.5rem',
  },
  label: {
    display: 'block',
    fontSize: '0.72rem',
    fontWeight: 700,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
}

async function extractErrorMessage(error, fallback) {
  try {
    if (error?.context?.json) {
      const body = await error.context.json()
      if (body?.error) return body.error
    }
  } catch (_) { /* fall through */ }
  return error?.message || fallback || 'Something went wrong. Please try again.'
}

export default function SchedulePage({ params }) {
  const { token } = params

  const [status,       setStatus]       = useState('loading') // loading | invalid | ready | error
  const [applicant,    setApplicant]    = useState(null)
  const [errorMsg,     setErrorMsg]     = useState('')
  const [picking,      setPicking]      = useState(false)
  const [slots,        setSlots]        = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [booking,      setBooking]      = useState(false)
  const [cancelling,   setCancelling]   = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [banner,       setBanner]       = useState(null) // { type: 'success' | 'error', text }

  useEffect(() => { loadInfo() }, [])

  async function loadInfo() {
    setStatus('loading')
    const { data, error } = await supabase.functions.invoke(
      `schedule-interview?token=${encodeURIComponent(token)}&action=info`,
      { method: 'GET' }
    )
    if (error) {
      const message = await extractErrorMessage(error, 'This scheduling link is invalid or has expired.')
      setErrorMsg(message)
      setStatus('invalid')
      return
    }
    setApplicant(data)
    setStatus('ready')
    setPicking(!data.current_appointment && data.schedulable)
    if (!data.current_appointment && data.schedulable) loadSlots()
  }

  async function loadSlots() {
    setSlotsLoading(true)
    setSelectedSlot(null)
    const { data, error } = await supabase.functions.invoke(
      `schedule-interview?token=${encodeURIComponent(token)}&action=availability`,
      { method: 'GET' }
    )
    if (error) {
      const message = await extractErrorMessage(error, 'Could not load available times.')
      setBanner({ type: 'error', text: message })
      setSlots([])
    } else {
      setSlots(data.slots ?? [])
    }
    setSlotsLoading(false)
  }

  async function book() {
    if (!selectedSlot) return
    setBooking(true)
    setBanner(null)
    const { error } = await supabase.functions.invoke('schedule-interview', {
      method: 'POST',
      body: { token, action: 'book', slot: selectedSlot },
    })
    if (error) {
      const message = await extractErrorMessage(error, 'That time could not be booked.')
      setBanner({ type: 'error', text: message })
      // The slot was likely just taken — refresh the list so it disappears.
      loadSlots()
    } else {
      setBanner({ type: 'success', text: 'Your interview is booked. See you then!' })
      setPicking(false)
      await loadInfo()
    }
    setBooking(false)
  }

  async function cancel() {
    setCancelling(true)
    setBanner(null)
    const { error } = await supabase.functions.invoke('schedule-interview', {
      method: 'POST',
      body: { token, action: 'cancel' },
    })
    if (error) {
      const message = await extractErrorMessage(error, 'Could not cancel your interview.')
      setBanner({ type: 'error', text: message })
    } else {
      setBanner({ type: 'success', text: 'Your interview has been cancelled.' })
      setConfirmCancel(false)
      await loadInfo()
    }
    setCancelling(false)
  }

  function startPicking() {
    setBanner(null)
    setPicking(true)
    if (slots.length === 0) loadSlots()
  }

  // ── shared page chrome ────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', width: '100%', background: 'var(--bg)',
      display: 'flex', justifyContent: 'center', padding: '3rem 1.25rem',
      fontFamily: FONT, boxSizing: 'border-box',
    }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div style={S.card}>
          {status === 'loading' && (
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading...</p>
          )}

          {status === 'invalid' && (
            <>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>
                Link not found
              </h1>
              <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.6 }}>{errorMsg}</p>
            </>
          )}

          {status === 'ready' && applicant && (
            <>
              <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>
                Schedule, reschedule, or cancel your interview below. Times are shown in {TIMEZONE_LABEL}.
              </p>

              {banner && (
                <div style={{
                  padding: '0.75rem 1rem', borderRadius: '10px', marginBottom: '1.25rem',
                  background: banner.type === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(74,222,128,0.08)',
                  border: `1px solid ${banner.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(74,222,128,0.3)'}`,
                }}>
                  <p style={{ fontSize: '0.85rem', color: banner.type === 'error' ? 'var(--danger)' : 'var(--accent)', fontWeight: 500 }}>
                    {banner.text}
                  </p>
                </div>
              )}

              {!applicant.schedulable ? (
                <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                  Scheduling is no longer available for this application. If you have questions, please reply to
                  your invitation email and we'll help you out.
                </p>
              ) : (
                <>
                  {applicant.current_appointment && !picking && (
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: '1rem',
                      padding: '1rem 1.1rem', borderRadius: '10px',
                      background: 'rgba(2,65,107,0.05)', border: '1px solid var(--border)', marginBottom: '1.25rem',
                    }}>
                      <div>
                        <p style={{ ...S.label, marginBottom: '0.35rem' }}>
                          Your interview is scheduled
                        </p>
                        <p style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text)', fontFamily: MONO }}>
                          {formatSlotFull(applicant.current_appointment)}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <button onClick={startPicking} style={outlineBtnStyle(C.blue)}>Reschedule</button>
                        {!confirmCancel ? (
                          <button onClick={() => setConfirmCancel(true)} style={ghostBtnStyle()}>Cancel Interview</button>
                        ) : (
                          <>
                            <button onClick={cancel} disabled={cancelling} style={solidBtnStyle(C.danger, cancelling)}>
                              {cancelling ? 'Cancelling...' : 'Yes, cancel it'}
                            </button>
                            <button onClick={() => setConfirmCancel(false)} style={ghostBtnStyle()}>Never mind</button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {picking && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
                        <p style={S.label}>
                          {applicant.current_appointment ? 'Pick a new time' : 'Pick a time'}
                        </p>
                        {applicant.current_appointment && (
                          <button onClick={() => setPicking(false)} style={ghostBtnStyle()}>Back</button>
                        )}
                      </div>

                      {slotsLoading ? (
                        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading available times...</p>
                      ) : slots.length === 0 ? (
                        <p style={{ color: 'var(--muted)', fontSize: '0.88rem', fontStyle: 'italic' }}>
                          No openings in the next two weeks. Please check back soon or reply to your invitation email.
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', maxHeight: 420, overflowY: 'auto', paddingRight: '0.25rem' }}>
                          {groupSlotsByDay(slots).map(day => (
                            <div key={day.dayKey}>
                              <p style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent)', marginBottom: '0.5rem' }}>{day.dayLabel}</p>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: '0.5rem' }}>
                                {day.slots.map(iso => {
                                  const isSel = selectedSlot === iso
                                  return (
                                    <button
                                      key={iso}
                                      onClick={() => setSelectedSlot(iso)}
                                      style={{
                                        padding: '0.5rem 0.4rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600,
                                        fontFamily: MONO, cursor: 'pointer',
                                        background: isSel ? 'var(--accent)' : 'var(--bg)',
                                        color: isSel ? '#fff' : 'var(--text)',
                                        border: isSel ? 'none' : '1px solid var(--border)',
                                        transition: 'all 0.12s',
                                      }}
                                    >
                                      {formatSlotTime(iso)}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.6rem' }}>
                        <button
                          onClick={book}
                          disabled={!selectedSlot || booking}
                          style={solidBtnStyle(C.blue, !selectedSlot || booking)}
                        >
                          {booking ? 'Booking...' : selectedSlot ? `Confirm ${formatSlotFull(selectedSlot)}` : 'Select a time above'}
                        </button>
                      </div>
                    </div>
                  )}

                  {!picking && !applicant.current_appointment && (
                    <button onClick={startPicking} style={solidBtnStyle(C.blue, false)}>Schedule Your Interview</button>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--muted)', marginTop: '1.25rem' }}>
          Having trouble? Reply to your invitation email and we'll help you get scheduled.
        </p>
      </div>
    </div>
  )
}

// ── local button styles (mirrors Pipeline.js's solidBtn/outlineBtn/ghostBtn) ─
function solidBtnStyle(color, disabled) {
  return {
    padding: '0.85rem 1.4rem', borderRadius: '8px', border: 'none',
    background: disabled ? 'var(--border)' : color,
    color: disabled ? 'var(--muted)' : '#fff',
    fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: FONT, fontSize: '0.9rem', width: '100%',
    opacity: disabled ? 0.7 : 1, transition: 'opacity 0.15s',
  }
}
function outlineBtnStyle(color) {
  return {
    padding: '0.6rem 1.2rem', borderRadius: '8px', border: `1px solid ${color}`,
    background: 'rgba(2,65,107,0.08)', color, fontWeight: 600, cursor: 'pointer',
    fontFamily: FONT, fontSize: '0.85rem',
  }
}
function ghostBtnStyle() {
  return {
    padding: '0.6rem 1.1rem', borderRadius: '8px', border: '1px solid var(--border)',
    background: 'var(--surface)', color: 'var(--muted)', fontWeight: 500,
    cursor: 'pointer', fontFamily: FONT, fontSize: '0.85rem',
  }
}