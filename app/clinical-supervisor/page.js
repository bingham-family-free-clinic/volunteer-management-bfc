'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { getMountainNow, getMountainLabel } from '../../lib/timeUtils'
import LunchScheduler from '../../components/LunchScheduler'
import ProviderScheduleView from '../../components/ProviderScheduleView'
import Live from '../../components/Live'

export default function CSPage() {
  const router = useRouter()

  const [loading, setLoading]           = useState(true)
  const [authorized, setAuthorized]     = useState(false)
  const [currentTime, setCurrentTime]   = useState(getMountainNow())
  const [myProfile, setMyProfile]       = useState(null)

  const [activeShifts, setActiveShifts] = useState([])
  const [schedule, setSchedule]         = useState([])
  const [volunteers, setVolunteers]     = useState([])
  const [callouts, setCallouts]         = useState([])
  const [mySchedule, setMySchedule]     = useState([])

  const [tab, setTab]                   = useState('live')
  const [selectedContact, setSelectedContact] = useState(null)
  const [langModal, setLangModal]       = useState(null) // { lang, day, shift } or null

  useEffect(() => {
    checkAccess()
    const tick = setInterval(() => setCurrentTime(getMountainNow()), 60000)
    return () => clearInterval(tick)
  }, [])

  async function checkAccess() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, default_role, role, phone, languages, affiliation, email')
      .eq('id', user.id)
      .single()

    if (profile?.default_role !== 'Clinical Supervisor' && profile?.role !== 'admin') {
      router.push('/volunteer')
      return
    }

    setMyProfile(profile)
    setAuthorized(true)
    await loadData(user.id)
    setLoading(false)
  }

  async function loadData(userId) {
    const [shiftsRes, schedRes, volsRes, calloutsRes, mySchedRes] = await Promise.all([
      supabase.from('shifts').select('id, volunteer_id, clock_in, profiles(id, full_name)').is('clock_out', null),
      supabase.from('schedule').select('*, profiles(id, full_name)').order('role'),
      supabase.from('profiles').select('id, full_name, phone, languages, role, default_role, affiliation, email, status, birthday'),
      supabase.from('callouts')
        .select('*, volunteer:profiles!callouts_volunteer_id_fkey(full_name)')
        .order('submitted_at', { ascending: false })
        .limit(100),
      supabase.from('schedule').select('*').eq('volunteer_id', userId),
    ])

    setActiveShifts(shiftsRes.data || [])
    setSchedule(schedRes.data || [])
    setVolunteers(volsRes.data || [])

    const normalised = (calloutsRes.data || []).map(c => ({
      ...c,
      profiles: c.volunteer,
      status: c.status ?? (c.is_read ? 'approved' : 'pending'),
    }))
    setCallouts(normalised)
    setMySchedule(mySchedRes.data || [])
  }

  // ── Derived state ──────────────────────────────────────────

  const mtnNow       = getMountainNow()
  const dayIndex     = mtnNow.getDay()
  const isWeekday    = dayIndex >= 1 && dayIndex <= 5
  const h            = mtnNow.getHours() + mtnNow.getMinutes() / 60
  const currentShift = h >= 10 && h < 14 ? '10-2' : h >= 14 && h < 18 ? '2-6' : null
  const currentDay   = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dayIndex]

  function getVol(id) { return volunteers.find(v => v.id === id) }

  function openVolunteer(vol) {
    if (vol) setSelectedContact(vol)
  }

  const clockedInIds = new Set(activeShifts.map(s => s.volunteer_id))

  // The day+shift combos the CS user is personally scheduled for
  const myShiftCombos = mySchedule.reduce((acc, s) => {
    const key = `${s.day_of_week}|${s.shift_time}`
    if (!acc.find(x => x.key === key)) {
      acc.push({ key, day: s.day_of_week, shift: s.shift_time })
    }
    return acc
  }, [])

  // Schedule entries for a specific day+shift
  function getEntriesForShift(day, shift) {
    return schedule.filter(s => s.day_of_week === day && s.shift_time === shift)
  }

  // ── Language coverage ──────────────────────────────────────
  // Per shift: only people scheduled for THAT shift who speak the language

  function getLangsForShift(day, shift) {
    const entries = getEntriesForShift(day, shift)
    const langs = new Set()
    entries.forEach(e => {
      const vol = getVol(e.volunteer_id)
      if (vol?.languages) {
        vol.languages.split(',').map(l => l.trim()).filter(Boolean).forEach(l => langs.add(l))
      }
    })
    return [...langs]
  }

  // Speakers of a language scoped to a specific shift only
  function speakersOf(lang, day, shift) {
    const shiftVolIds = new Set(getEntriesForShift(day, shift).map(e => e.volunteer_id))
    return volunteers.filter(v =>
      shiftVolIds.has(v.id) &&
      v.languages?.split(',').map(l => l.trim()).includes(lang)
    )
  }

  // ── Styles ─────────────────────────────────────────────────

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <p style={{ color: 'var(--muted)' }}>Loading...</p>
    </div>
  )

  if (!authorized) return null

  const card       = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
  const labelStyle = { display: 'block', fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const tzLabel    = getMountainLabel()

  // Clickable language bubble
  function LangBubble({ lang, highlighted, day, shift }) {
    const isOpen = langModal?.lang === lang && langModal?.day === day && langModal?.shift === shift
    return (
      <button
        onClick={() => setLangModal(isOpen ? null : { lang, day, shift })}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
          padding: '0.3rem 0.85rem', borderRadius: '100px', fontSize: '0.85rem', fontWeight: 500,
          cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
          background: highlighted ? 'rgba(74,222,128,0.12)' : 'rgba(96,165,250,0.1)',
          color:      highlighted ? '#4ade80'                : '#60a5fa',
          border:     `1px solid ${highlighted ? 'rgba(74,222,128,0.3)' : 'rgba(96,165,250,0.3)'}`,
          outline:    isOpen ? `2px solid ${highlighted ? '#4ade80' : '#60a5fa'}` : 'none',
          outlineOffset: '2px',
        }}
      >
        {lang}
      </button>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>

        {/* Language speaker modal */}
        {langModal && (() => {
          const speakers = speakersOf(langModal.lang, langModal.day, langModal.shift)
          // Of those speakers, which are currently clocked in
          const speakersIn = speakers.filter(v => clockedInIds.has(v.id))
          return (
            <div
              onClick={() => setLangModal(null)}
              style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.5rem', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h3 style={{ fontWeight: 600, fontSize: '1rem', margin: 0 }}>
                    {langModal.lang} speakers
                  </h3>
                  <button onClick={() => setLangModal(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: '0.2rem' }}>✕</button>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '1rem', textTransform: 'capitalize' }}>
                  {langModal.day} · {langModal.shift} &nbsp;·&nbsp; {speakers.length} scheduled, {speakersIn.length} currently in
                </p>

                {speakers.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>No one scheduled for this shift speaks this language.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {speakers.map(vol => {
                      const isIn = clockedInIds.has(vol.id)
                      return (
                        <div key={vol.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0.85rem', background: isIn ? 'rgba(74,222,128,0.04)' : 'var(--bg)', borderRadius: '8px', border: `1px solid ${isIn ? 'rgba(74,222,128,0.3)' : 'var(--border)'}` }}>
                          <div>
                            <p style={{ fontWeight: 500, fontSize: '0.88rem', margin: 0 }}>{vol.full_name}</p>
                            {vol.default_role && <p style={{ color: 'var(--muted)', fontSize: '0.75rem', margin: 0 }}>{vol.default_role}</p>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {isIn && (
                              <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', fontWeight: 600 }}>in</span>
                            )}
                            {vol.phone && (
                              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', color: 'var(--muted)' }}>{vol.phone}</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 600, letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
              Clinical Supervisor
            </h1>

            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              {currentTime.toLocaleDateString('en-US', {
                timeZone: 'America/Denver',
                weekday: 'long',
                month: 'long',
                day: 'numeric'
              })}
              &nbsp;·&nbsp;
              <span style={{ fontFamily: 'DM Mono, monospace' }}>
                {currentTime.toLocaleTimeString('en-US', {
                  timeZone: 'America/Denver',
                  hour: '2-digit',
                  minute: '2-digit'
                })} {tzLabel}
              </span>
            </p>
          </div>
        
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        
            {/* Switch to Volunteer View */}
            <button
              onClick={() => {
                window.location.href = '/volunteer'
              }}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--muted)',
                padding: '0.4rem 0.9rem',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              Volunteer View
            </button>
        
            {/* Sign out */}
            <button
              onClick={async () => {
                await supabase.auth.signOut()
                window.location.href = '/'
              }}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--muted)',
                padding: '0.4rem 0.9rem',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              Sign out
            </button>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
         {[
            ['live', 'Live'],
            ['schedule', 'Schedule'],
            ['languages', 'Language Coverage'],
            ['lunch', 'Lunch'],
            ['providers', 'Providers']
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
                background: tab === key ? 'var(--accent)' : 'var(--surface)',
                color: tab === key ? '#fff' : 'var(--muted)',
                border: tab === key ? 'none' : '1px solid var(--border)'
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── LIVE TAB ───────────────────────────────────────── */}
        {tab === 'live' && (
          <Live
            schedule={schedule}
            callouts={callouts}
            activeShifts={activeShifts}
            volunteers={volunteers}
            onOpenVolunteer={openVolunteer}
          />
        )}

        {tab === 'providers' && (
          <>
            <div
              style={{
                background: '#fef3c7',
                border: '1px solid #f59e0b',
                color: '#92400e',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                fontWeight: 700,
                textAlign: 'center',
                fontSize: '0.9rem',
                marginBottom: '1rem',
              }}
            >
              Please Ignore — In Testing
            </div>
        
            <ProviderScheduleView supabase={supabase} />
          </>
        )}

        {/* ── MY SCHEDULE TAB ───────────────────────────────── */}
        {tab === 'schedule' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
              Showing only the shifts you are personally scheduled for. Tap a name to expand contact info.
            </p>
            {myShiftCombos.length === 0 ? (
              <div style={card}><p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>You have no scheduled shifts on record.</p></div>
            ) : (
              myShiftCombos.map(({ key, day, shift }) => {
                const entries = getEntriesForShift(day, shift)
                const isCurrentSlot = isWeekday && currentDay === day && currentShift === shift
                return (
                  <div key={key} style={{ ...card, borderColor: isCurrentSlot ? 'var(--accent)' : 'var(--border)', background: isCurrentSlot ? 'rgba(2,65,107,0.03)' : 'var(--surface)' }}>
                    <h2 style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ textTransform: 'capitalize' }}>{day}</span>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--muted)', background: 'var(--bg)', padding: '0.15rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}>{shift}</span>
                      {isCurrentSlot && <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.5rem', borderRadius: '100px', background: 'rgba(2,65,107,0.12)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.35)', fontWeight: 600 }}>Now</span>}
                      <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 400 }}>{entries.length} scheduled</span>
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {entries.map(e => {
                        const vol        = getVol(e.volunteer_id)
                        const isExpanded = selectedContact?.id === e.volunteer_id
                        const isClockedIn = clockedInIds.has(e.volunteer_id)
                        return (
                          <div
                            key={e.id}
                            onClick={() => setSelectedContact(isExpanded ? null : vol)}
                            style={{ padding: '0.6rem 0.85rem', background: 'var(--bg)', borderRadius: '7px', border: '1px solid var(--border)', cursor: 'pointer' }}
                            onMouseEnter={ev => ev.currentTarget.style.borderColor = 'var(--accent)'}
                            onMouseLeave={ev => ev.currentTarget.style.borderColor = 'var(--border)'}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>{vol?.full_name || 'Unknown'}</span>
                                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{e.role}</span>
                                {e.notes && <span style={{ fontSize: '0.72rem', color: '#60a5fa', fontStyle: 'italic' }}>({e.notes})</span>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {isClockedIn && isCurrentSlot && (
                                  <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', fontWeight: 600 }}>in</span>
                                )}
                                <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{isExpanded ? '▲' : '▾'}</span>
                              </div>
                            </div>
                            {isExpanded && vol && (
                              <div style={{ marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                                <div>
                                  <p style={labelStyle}>Phone</p>
                                  <p style={{ fontSize: '0.85rem', fontFamily: 'DM Mono, monospace', color: vol.phone ? 'var(--text)' : 'var(--muted)', fontStyle: vol.phone ? 'normal' : 'italic', margin: 0 }}>{vol.phone || 'Not set'}</p>
                                </div>
                                {vol.languages && (
                                  <div>
                                    <p style={labelStyle}>Languages</p>
                                    <p style={{ fontSize: '0.85rem', margin: 0 }}>{vol.languages}</p>
                                  </div>
                                )}
                                {vol.affiliation && (
                                  <div>
                                    <p style={labelStyle}>Affiliation</p>
                                    <p style={{ fontSize: '0.85rem', textTransform: 'capitalize', margin: 0 }}>{vol.affiliation}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* ── LANGUAGES TAB ─────────────────────────────────── */}
        {tab === 'languages' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
              Language coverage for your scheduled shifts only. Click a bubble to see who speaks it.
            </p>

            {/* Current shift highlight */}
            {isWeekday && currentShift && myShiftCombos.some(c => c.day === currentDay && c.shift === currentShift) && (
              <div style={{ ...card, borderColor: 'var(--accent)', background: 'rgba(2,65,107,0.04)' }}>
                <h2 style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.85rem' }}>
                  Current Shift Coverage
                  <span style={{ marginLeft: '0.5rem', fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 400 }}>{currentDay} {currentShift}</span>
                </h2>
                {(() => {
                  const langs = getLangsForShift(currentDay, currentShift)
                  const presentLangs = {}
                  getEntriesForShift(currentDay, currentShift).forEach(e => {
                    if (!clockedInIds.has(e.volunteer_id)) return
                    const vol = getVol(e.volunteer_id)
                    vol?.languages?.split(',').map(l => l.trim()).filter(Boolean).forEach(l => {
                      presentLangs[l] = (presentLangs[l] || 0) + 1
                    })
                  })
                  if (langs.length === 0) return <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>No language data for this shift.</p>
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {langs.map(lang => (
                        <div key={lang} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                          <LangBubble lang={lang} highlighted={presentLangs[lang] > 0} day={currentDay} shift={currentShift} />
                          {presentLangs[lang] > 0 && (
                            <span style={{ fontSize: '0.65rem', color: '#4ade80' }}>{presentLangs[lang]} in</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Per-shift breakdown — my shifts only */}
            {myShiftCombos.length === 0 ? (
              <div style={card}><p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No scheduled shifts on record.</p></div>
            ) : (
              myShiftCombos.map(({ key, day, shift }) => {
                const langs = getLangsForShift(day, shift)
                const isCurrentSlot = isWeekday && currentDay === day && currentShift === shift
                return (
                  <div key={key} style={{ ...card, borderColor: isCurrentSlot ? 'var(--accent)' : 'var(--border)' }}>
                    <h2 style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ textTransform: 'capitalize' }}>{day}</span>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--muted)', background: 'var(--bg)', padding: '0.15rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}>{shift}</span>
                      {isCurrentSlot && <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.5rem', borderRadius: '100px', background: 'rgba(2,65,107,0.12)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.35)', fontWeight: 600 }}>Now</span>}
                    </h2>
                    {langs.length === 0 ? (
                      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>No language data for this shift.</p>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {langs.map(lang => (
                          <LangBubble key={lang} lang={lang} highlighted={false} day={day} shift={shift} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}

            {/* Multilingual volunteers — scoped per shift, shown as plain tags */}
            <div style={card}>
              <h2 style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.85rem' }}>Multilingual Volunteers by Shift</h2>
              {myShiftCombos.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>No scheduled shifts on record.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {myShiftCombos.map(({ key, day, shift }) => {
                    const shiftVolIds = new Set(getEntriesForShift(day, shift).map(e => e.volunteer_id))
                    const multilingualVols = volunteers.filter(v => shiftVolIds.has(v.id) && v.languages)
                    if (multilingualVols.length === 0) return null
                    return (
                      <div key={key}>
                        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', textTransform: 'capitalize', fontWeight: 500, marginBottom: '0.5rem' }}>
                          {day} · {shift}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          {multilingualVols.map(vol => (
                            <div key={vol.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'var(--bg)', borderRadius: '7px', border: '1px solid var(--border)', flexWrap: 'wrap', gap: '0.5rem' }}>
                              <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{vol.full_name}</span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                {vol.languages.split(',').map(l => l.trim()).filter(Boolean).map(l => (
                                  <span key={l} style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)', fontWeight: 500 }}>{l}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {tab === 'lunch' && (
          <LunchScheduler supabase={supabase} profile={myProfile} />
        )}

      </div>
    </div>
  )
}
