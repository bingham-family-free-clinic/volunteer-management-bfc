'use client'
// app/schedule/[token]/page.js
//
// Public, unauthenticated page linked from the interview invitation email:
//   https://yourapp.com/schedule/<interview_scheduling_token>
//
// This page never talks to Postgres directly — it only calls the
// `schedule-interview` Supabase edge function (supabase/functions/schedule-interview),
// which is the sole source of truth for what's actually bookable. All this
// page does is render whatever that function returns and let the applicant
// pick a slot, reschedule, or cancel.
//
// KEEP THIS FILE'S APPEARANCE IN SYNC with Pipeline.js's Calendar tab — same
// palette, same fonts — so the applicant experience feels like one product.
//
// ASSUMPTION: the browser Supabase client is created from
// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY, the standard
// Next.js + Supabase convention. If this project already has a shared
// client (e.g. lib/supabaseClient.js), swap the two lines below to import
// it instead of constructing a new one here.

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { groupSlotsByDay, formatSlotTime, formatSlotFull, TIMEZONE_LABEL } from '../../../lib/interview-schedule'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// ── palette (mirrors Pipeline.js's C) ───────────────────────────────────────
const C = {
  primary: '#02416b',
  blue:    '#0369a1',
  light:   '#0ea5e9',
  pale:    '#bae6fd',
  muted:   '#7dd3fc',
  warn:    '#0284c7',
  danger:  '#1e40af',
  success: '#0369a1',
}

const FONT = 'DM Sans, system-ui, sans-serif'
const MONO = 'DM Mono, monospace'

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
      minHeight: '100vh', width: '100%', background: '#f4fafd',
      display: 'flex', justifyContent: 'center', padding: '3rem 1.25rem',
      fontFamily: FONT, boxSizing: 'border-box',
    }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div style={{
          background: '#fff', border: '1px solid #dbeafe', borderRadius: '16px',
          padding: '2rem', boxShadow: '0 1px 3px rgba(2,65,107,0.06)',
        }}>
          {status === 'loading' && (
            <p style={{ color: '#7dd3fc', fontSize: '0.95rem' }}>Loading...</p>
          )}

          {status === 'invalid' && (
            <>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: C.primary, marginBottom: '0.5rem' }}>
                Link not found
              </h1>
              <p style={{ fontSize: '0.9rem', color: '#64748b', lineHeight: 1.6 }}>{errorMsg}</p>
            </>
          )}

          {status === 'ready' && applicant && (
            <>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: C.primary, marginBottom: '0.25rem' }}>
                Hi {applicant.full_name?.split(' ')[0] || 'there'} 👋
              </h1>
              <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '1.5rem' }}>
                Schedule, reschedule, or cancel your interview below. Times are shown in {TIMEZONE_LABEL}.
              </p>

              {banner && (
                <div style={{
                  padding: '0.75rem 1rem', borderRadius: '10px', marginBottom: '1.25rem',
                  background: (banner.type === 'error' ? C.danger : C.success) + '0f',
                  border: `1px solid ${(banner.type === 'error' ? C.danger : C.success)}33`,
                }}>
                  <p style={{ fontSize: '0.85rem', color: banner.type === 'error' ? C.danger : C.success, fontWeight: 500 }}>
                    {banner.text}
                  </p>
                </div>
              )}

              {!applicant.schedulable ? (
                <p style={{ fontSize: '0.9rem', color: '#64748b', lineHeight: 1.6 }}>
                  Scheduling is no longer available for this application. If you have questions, please reply to
                  your invitation email and we'll help you out.
                </p>
              ) : (
                <>
                  {applicant.current_appointment && !picking && (
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: '1rem',
                      padding: '1rem 1.1rem', borderRadius: '10px',
                      background: C.blue + '0d', border: `1px solid ${C.blue}33`, marginBottom: '1.25rem',
                    }}>
                      <div>
                        <p style={{ fontSize: '0.72rem', fontWeight: 700, color: C.blue, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>
                          Your interview is scheduled
                        </p>
                        <p style={{ fontSize: '1.05rem', fontWeight: 600, color: C.primary, fontFamily: MONO }}>
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
                        <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {applicant.current_appointment ? 'Pick a new time' : 'Pick a time'}
                        </p>
                        {applicant.current_appointment && (
                          <button onClick={() => setPicking(false)} style={ghostBtnStyle()}>Back</button>
                        )}
                      </div>

                      {slotsLoading ? (
                        <p style={{ color: '#7dd3fc', fontSize: '0.9rem' }}>Loading available times...</p>
                      ) : slots.length === 0 ? (
                        <p style={{ color: '#64748b', fontSize: '0.88rem', fontStyle: 'italic' }}>
                          No openings in the next two weeks. Please check back soon or reply to your invitation email.
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', maxHeight: 420, overflowY: 'auto', paddingRight: '0.25rem' }}>
                          {groupSlotsByDay(slots).map(day => (
                            <div key={day.dayKey}>
                              <p style={{ fontSize: '0.78rem', fontWeight: 700, color: C.blue, marginBottom: '0.5rem' }}>{day.dayLabel}</p>
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
                                        background: isSel ? C.blue : C.blue + '0d',
                                        color: isSel ? '#fff' : C.blue,
                                        border: `1px solid ${C.blue}${isSel ? '' : '33'}`,
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

        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', marginTop: '1.25rem' }}>
          Having trouble? Reply to your invitation email and we'll help you get scheduled.
        </p>
      </div>
    </div>
  )
}

// ── local button styles (mirrors Pipeline.js's solidBtn/outlineBtn/ghostBtn) ─
function solidBtnStyle(color, disabled) {
  return {
    padding: '0.7rem 1.4rem', borderRadius: '8px', border: 'none',
    background: disabled ? '#e2e8f0' : color,
    color: disabled ? '#94a3b8' : '#fff',
    fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: FONT, fontSize: '0.875rem', width: '100%',
    opacity: disabled ? 0.7 : 1, transition: 'opacity 0.15s',
  }
}
function outlineBtnStyle(color) {
  return {
    padding: '0.6rem 1.2rem', borderRadius: '8px', border: `1px solid ${color}55`,
    background: color + '12', color, fontWeight: 600, cursor: 'pointer',
    fontFamily: FONT, fontSize: '0.85rem',
  }
}
function ghostBtnStyle() {
  return {
    padding: '0.6rem 1.1rem', borderRadius: '8px', border: '1px solid #e2e8f0',
    background: '#fff', color: '#64748b', fontWeight: 500,
    cursor: 'pointer', fontFamily: FONT, fontSize: '0.85rem',
  }
}