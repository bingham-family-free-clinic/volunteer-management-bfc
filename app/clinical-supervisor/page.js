'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { getMountainNow, getMountainLabel, asUTC, formatMountain } from '../../lib/timeUtils'
import LunchScheduler from '../../components/LunchScheduler'
import ProviderScheduleView from '../../components/ProviderScheduleView'

function minutesSince(ts) {
  if (!ts) return null
  return Math.floor((Date.now() - asUTC(ts).getTime()) / 60000)
}

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
    const todayMtn = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })

    const [shiftsRes, schedRes, volsRes, calloutsRes, mySchedRes] = await Promise.all([
      supabase.from('shifts').select('*, profiles(id, full_name)').is('clock_out', null),
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
  const todayMtn     = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })

  function getVol(id) { return volunteers.find(v => v.id === id) }

  const clockedInIds = new Set(activeShifts.map(s => s.volunteer_id))

  // The day+shift combos the CS user is personally scheduled for
  const myShiftCombos = mySchedule.reduce((acc, s) => {
    const key = `${s.day_of_week}|${s.shift_time}`
    if (!acc.find(x => x.key === key)) {
      acc.push({ key, day: s.day_of_week, shift: s.shift_time })
    }
    return acc
  }, [])

  // All volunteer IDs scheduled for any of my shifts
  const myShiftVolunteerIds = new Set(
    schedule
      .filter(s => myShiftCombos.some(c => c.day === s.day_of_week && c.shift === s.shift_time))
      .map(s => s.volunteer_id)
  )

  // Volunteers on my shifts (for contacts tab)
  const myShiftVolunteers = volunteers.filter(v =>
    myShiftVolunteerIds.has(v.id) && (v.status || 'active') === 'active'
  )

  // Schedule entries for a specific day+shift
  function getEntriesForShift(day, shift) {
    return schedule.filter(s => s.day_of_week === day && s.shift_time === shift)
  }

  // ── LIVE TAB: expected not clocked in (admin logic) ────────

  const expectedVolunteers = isWeekday && currentShift ? (() => {
    const calledOutIds = new Set(
      callouts
        .filter(c => c.callout_date === todayMtn && c.shift_time === currentShift && c.status === 'approved')
        .map(c => c.volunteer_id)
    )
    const coverIds = new Set(
      callouts
        .filter(c => c.callout_date === todayMtn && c.shift_time === currentShift && c.covered_by)
        .map(c => c.covered_by)
    )
    const scheduled = schedule.filter(s =>
      s.day_of_week === currentDay && s.shift_time === currentShift &&
      (!s.start_date || s.start_date <= todayMtn) &&
      (!s.end_date   || s.end_date   >= todayMtn)
    )
    const expectedIds = new Set([
      ...scheduled.filter(s => !calledOutIds.has(s.volunteer_id)).map(s => s.volunteer_id),
      ...coverIds,
    ])
    const clockedInFromProfiles = new Set(activeShifts.map(s => s.profiles?.id).filter(Boolean))
    return [...expectedIds]
      .filter(id => !clockedInFromProfiles.has(id))
      .map(id => {
        const vol   = volunteers.find(v => v.id === id)
        const entry = scheduled.find(s => s.volunteer_id === id)
        if (!vol) return null
        return { ...vol, role: entry?.role || '—', notes: entry?.notes || null }
      })
      .filter(Boolean)
  })() : []

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
  const inputStyle = { width: '100%', padding: '0.65rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.9rem', outline: 'none', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box' }
  const labelStyle = { display: 'block', fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const tzLabel    = getMountainLabel()

  // Volunteer row used in live tab
  function VolRow({ entry, status }) {
    const vol    = getVol(entry.volunteer_id)
    const shift  = activeShifts.find(s => s.volunteer_id === entry.volunteer_id)
    const mins   = shift ? minutesSince(shift.clock_in) : null
    const isOpen = selectedContact?.id === entry.volunteer_id

    const sc = {
      present: { bg: 'rgba(74,222,128,0.12)',  color: '#4ade80',  border: 'rgba(74,222,128,0.3)'  },
      excused: { bg: 'rgba(96,165,250,0.12)',  color: '#60a5fa',  border: 'rgba(96,165,250,0.3)'  },
      missing: { bg: 'rgba(239,68,68,0.10)',   color: '#ef4444',  border: 'rgba(239,68,68,0.25)'  },
    }[status] || { bg: 'rgba(239,68,68,0.10)', color: '#ef4444', border: 'rgba(239,68,68,0.25)' }

    const badgeSty = { fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.55rem', borderRadius: '100px', background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }

    return (
      <div
        onClick={() => setSelectedContact(isOpen ? null : vol)}
        style={{ padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer', transition: 'border-color 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.9rem', color: status === 'present' ? 'var(--accent)' : status === 'excused' ? '#60a5fa' : '#ef4444' }}>
              {vol?.full_name?.charAt(0) || '?'}
            </div>
            <div>
              <p style={{ fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>{vol?.full_name || 'Unknown'}</p>
              <p style={{ color: 'var(--muted)', fontSize: '0.78rem', margin: 0 }}>{entry.role}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {status === 'present' && shift && (
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', color: 'var(--muted)' }}>
                in {formatMountain(shift.clock_in)}
                {mins !== null && mins > 0 && (
                  <span style={{ marginLeft: '0.35rem', color: mins > 20 ? '#02416b' : 'var(--muted)' }}>({mins}m ago)</span>
                )}
              </span>
            )}
            <span style={badgeSty}>{status === 'present' ? 'Present' : status === 'excused' ? 'Excused' : 'Not In'}</span>
          </div>
        </div>
        {isOpen && vol && (
          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
            <div>
              <p style={labelStyle}>Phone</p>
              <p style={{ fontSize: '0.88rem', fontFamily: 'DM Mono, monospace', color: vol.phone ? 'var(--text)' : 'var(--muted)', fontStyle: vol.phone ? 'normal' : 'italic', margin: 0 }}>{vol.phone || 'Not set'}</p>
            </div>
            {vol.languages && (
              <div>
                <p style={labelStyle}>Languages</p>
                <p style={{ fontSize: '0.88rem', color: 'var(--text)', margin: 0 }}>{vol.languages}</p>
              </div>
            )}
            {vol.affiliation && (
              <div>
                <p style={labelStyle}>Affiliation</p>
                <p style={{ fontSize: '0.88rem', color: 'var(--text)', textTransform: 'capitalize', margin: 0 }}>{vol.affiliation}</p>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Expected not clocked in */}
            {isWeekday && currentShift && (
              <div style={{ ...card, borderColor: expectedVolunteers.length > 0 ? 'var(--danger)' : 'rgba(2,65,107,0.4)', background: expectedVolunteers.length > 0 ? 'rgba(239,68,68,0.03)' : 'rgba(2,65,107,0.03)' }}>
                <h2 style={{ fontWeight: 600, marginBottom: expectedVolunteers.length > 0 ? '1rem' : 0, fontSize: '1rem' }}>
                  {expectedVolunteers.length > 0
                    ? `${expectedVolunteers.length} volunteer${expectedVolunteers.length !== 1 ? 's' : ''} not yet clocked in — ${currentDay} ${currentShift}`
                    : `All expected volunteers clocked in — ${currentDay} ${currentShift}`}
                </h2>
                {expectedVolunteers.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {expectedVolunteers.map(v => (
                      <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.06)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)' }}>
                        <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{v.full_name}</span>
                        {v.notes && <span style={{ fontSize: '0.78rem', color: '#60a5fa', fontStyle: 'italic' }}>({v.notes})</span>}
                        <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{v.role}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Currently clocked in */}
            <div style={card}>
              <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Currently Clocked In</h2>
              {activeShifts.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No one is currently clocked in.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {activeShifts.map(s => (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(2,65,107,0.05)', borderRadius: '8px', border: '1px solid var(--accent)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />
                        <span style={{ fontWeight: 500 }}>{s.profiles?.full_name}</span>
                      </div>
                      <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Since {formatMountain(s.clock_in)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Today's call-outs */}
            {(() => {
              const todaysCallouts = callouts.filter(c => c.callout_date === todayMtn && c.status !== 'denied')
              return todaysCallouts.length > 0 && (
                <div style={card}>
                  <h2 style={{ fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>Today's Call-Outs</span>
                    <span style={{ padding: '0.15rem 0.55rem', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 600, border: '1px solid rgba(96,165,250,0.3)' }}>
                      {todaysCallouts.length}
                    </span>
                  </h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {todaysCallouts.map(c => {
                      const isCovered = c.status === 'approved' && c.covered_by
                      const isOpen    = c.status === 'approved' && !c.covered_by
                      return (
                        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.9rem', background: isCovered ? 'rgba(2,65,107,0.04)' : isOpen ? 'rgba(239,68,68,0.04)' : 'rgba(96,165,250,0.05)', borderRadius: '8px', border: `1px solid ${isCovered ? 'rgba(2,65,107,0.25)' : isOpen ? 'rgba(239,68,68,0.25)' : 'rgba(96,165,250,0.3)'}`, flexWrap: 'wrap', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.profiles?.full_name}</span>
                            {c.shift_time && (
                              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', padding: '0.15rem 0.5rem', borderRadius: '6px', border: '1px solid rgba(96,165,250,0.3)' }}>
                                {c.day_of_week ? c.day_of_week.charAt(0).toUpperCase() + c.day_of_week.slice(1,3) + ' ' : ''}{c.shift_time}
                              </span>
                            )}
                            <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '100px', fontWeight: 600,
                              background: isCovered ? 'rgba(2,65,107,0.1)' : isOpen ? 'rgba(239,68,68,0.08)' : 'rgba(96,165,250,0.1)',
                              color:      isCovered ? 'var(--accent)'      : isOpen ? '#ef4444'              : '#60a5fa',
                              border:     `1px solid ${isCovered ? 'rgba(2,65,107,0.3)' : isOpen ? 'rgba(239,68,68,0.25)' : 'rgba(96,165,250,0.3)'}`,
                            }}>
                              {isCovered ? 'covered' : isOpen ? 'open' : 'pending'}
                            </span>
                            {c.reason && <span style={{ fontSize: '0.82rem', color: 'var(--muted)', fontStyle: 'italic' }}>{c.reason}</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Birthdays today */}
            {(() => {
              const today   = getMountainNow()
              const todayMD = `${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
              const bdays   = volunteers.filter(v => v.birthday && v.birthday.slice(5) === todayMD)
              return bdays.length > 0 && (
                <div style={{ ...card, borderColor: 'rgba(129,140,248,0.5)', background: 'rgba(129,140,248,0.04)' }}>
                  <h2 style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '1rem' }}>Birthdays Today</h2>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {bdays.map(v => (
                      <span key={v.id} style={{ padding: '0.3rem 0.75rem', borderRadius: '100px', background: 'rgba(129,140,248,0.12)', color: '#818cf8', border: '1px solid rgba(129,140,248,0.35)', fontSize: '0.875rem', fontWeight: 500 }}>
                        {v.full_name}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {tab === 'providers' && (
          <ProviderScheduleView supabase={supabase} />
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