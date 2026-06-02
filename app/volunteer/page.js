'use client'

import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { supabase } from '../../lib/supabase'
import { DAYS, SHIFTS, ROLES, MAX_FILE_SIZE } from '../../lib/constants'
import { formatDate, formatTime, asUTC } from '../../lib/timeUtils'
import { getInboxMessages } from '../../lib/messageUtils'
import { MessageCard } from '../../components/MessageCard'
import { subscribeToPush, unsubscribeFromPush } from '../../lib/pushNotifications.js'
import { SubmitHoursPanel } from '../../components/SubmitHoursPanel'
import { MessageTab } from '../../components/MessageTab'


export const dynamic = 'force-dynamic'

const BROADCAST_TYPES = ['everyone', 'role', 'shift']
const MSG_PAGE_SIZE = 10

const PROVIDER_CRED_FIELDS = [
  { key: 'license_exp', label: 'License Expiration' },
  { key: 'bls_exp',     label: 'BLS Expiration' },
  { key: 'dea_exp',     label: 'DEA Expiration' },
  { key: 'tb_exp',      label: 'TB Expiration' },
]

// ── Shared style objects (defined once, not recreated per render) ────────────
const S = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '1.5rem',
  },
  input: {
    width: '100%',
    padding: '0.75rem 1rem',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text)',
    fontSize: '0.95rem',
    outline: 'none',
    fontFamily: 'DM Sans, sans-serif',
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

// ── Credential helpers (pure, no state) ─────────────────────────────────────
function credentialStatus(dateStr) {
  if (!dateStr) return 'missing'
  if (dateStr === 'N/A') return 'na'
  if (dateStr === 'expired') return 'expired'
  const exp = new Date(dateStr + 'T12:00:00')
  const now = new Date()
  const oneMonthOut = new Date()
  oneMonthOut.setMonth(oneMonthOut.getMonth() + 1)
  if (exp < now) return 'expired'
  if (exp <= oneMonthOut) return 'expiring'
  return 'ok'
}

function formatExpDate(dateStr) {
  if (!dateStr) return null
  if (dateStr === 'N/A') return 'N/A'
  if (dateStr === 'expired') return 'Expired'
  const [y, m, d] = dateStr.split('-')
  return `${m}/${d}/${y}`
}

// ── Sub-components ───────────────────────────────────────────────────────────

function TabButton({ id, label, active, onClick, badge }) {
  return (
    <button
      onClick={() => onClick(id)}
      style={{
        position: 'relative',
        padding: '0.5rem 1rem',
        borderRadius: '8px',
        fontSize: '0.875rem',
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'DM Sans, sans-serif',
        background: active ? 'var(--accent)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--muted)',
        border: active ? 'none' : '1px solid var(--border)',
      }}
    >
      {label}
      {badge > 0 && (
        <span style={{
          position: 'absolute', top: '-5px', right: '-5px',
          background: '#ef4444', color: '#fff', borderRadius: '50%',
          width: '17px', height: '17px', fontSize: '0.65rem', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '2px solid var(--bg)', lineHeight: 1,
        }}>
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}

function CredentialInput({ fieldKey, label, value, onChange, allowNA = false }) {
  const mode = value === 'N/A' ? 'na' : value === 'expired' ? 'expired' : 'date'
  return (
    <div>
      <label style={S.label}>{label}</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <select
          value={mode}
          onChange={e => {
            const m = e.target.value
            if (m === 'na') onChange('N/A')
            else if (m === 'expired') onChange('expired')
            else onChange('')
          }}
          style={{ ...S.input, fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
        >
          <option value="date">Set date</option>
          {allowNA && <option value="na">N/A</option>}
          <option value="expired">Mark as expired</option>
        </select>
        {mode === 'date' && (
          <input
            type="date"
            value={value && value !== 'N/A' && value !== 'expired' ? value : ''}
            onChange={e => onChange(e.target.value)}
            style={{ ...S.input, fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
          />
        )}
      </div>
    </div>
  )
}

function ProviderCredCard({ vol }) {
  const fields = PROVIDER_CRED_FIELDS.map(f => ({
    ...f,
    value: vol[f.key] || null,
    status: credentialStatus(vol[f.key]),
  }))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.6rem' }}>
      {fields.map(f => {
        const { status } = f
        const isMissing  = status === 'missing'
        const isExpired  = status === 'expired'
        const isExpiring = status === 'expiring'
        const isNA       = status === 'na'
        const borderColor = (isMissing || isExpired) ? 'rgba(2,65,107,0.45)' : isExpiring ? 'rgba(146,166,185,0.6)' : isNA ? 'rgba(146,166,185,0.35)' : 'rgba(2,65,107,0.3)'
        const bgColor     = (isMissing || isExpired) ? 'rgba(2,65,107,0.08)' : isExpiring ? 'rgba(146,166,185,0.12)' : isNA ? 'rgba(146,166,185,0.06)' : 'rgba(2,65,107,0.05)'
        const textColor   = (isMissing || isExpired) ? '#02416B' : isExpiring ? '#5f7f99' : isNA ? 'var(--muted)' : 'var(--text)'
        return (
          <div key={f.key} style={{ padding: '0.6rem 0.75rem', borderRadius: '8px', border: `1px solid ${borderColor}`, background: bgColor }}>
            <p style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>{f.label}</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem' }}>
              <p style={{ fontFamily: (isMissing || isNA) ? 'DM Sans, sans-serif' : 'DM Mono, monospace', fontSize: '0.82rem', fontWeight: (isMissing || isNA) ? 400 : 600, color: textColor, fontStyle: (isMissing || isNA) ? 'italic' : 'normal' }}>
                {isMissing ? 'Not set' : formatExpDate(f.value)}
              </p>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#02416b', flexShrink: 0 }}>
                {(isMissing || isExpired) ? '✗' : isExpiring ? '!' : isNA ? '—' : '✓'}
              </span>
            </div>
            {isExpired  && <p style={{ fontSize: '0.65rem', color: '#02416B', fontWeight: 700, marginTop: '0.15rem' }}>EXPIRED</p>}
            {isExpiring && <p style={{ fontSize: '0.65rem', color: '#5f7f99', fontWeight: 700, marginTop: '0.15rem' }}>EXP. SOON</p>}
            {isNA       && <p style={{ fontSize: '0.65rem', color: 'var(--muted)', fontWeight: 600, marginTop: '0.15rem' }}>NOT APPLICABLE</p>}
          </div>
        )
      })}
    </div>
  )
}

function ViewCountBadge({ message, broadcastReadCounts }) {
  if (!BROADCAST_TYPES.includes(message?.recipient_type)) return null
  const count = broadcastReadCounts[message.id] ?? null
  return (
    <span
      title={count === null ? 'Loading views…' : `${count} ${count === 1 ? 'person has' : 'people have'} read this`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', fontWeight: 500, color: 'var(--muted)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '100px', padding: '0.15rem 0.55rem', marginTop: '0.35rem', fontFamily: 'DM Mono, monospace', letterSpacing: '0.01em', userSelect: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
    >
      <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
        <path d="M1 10s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" />
        <circle cx="10" cy="10" r="2.5" />
      </svg>
      {count === null ? '…' : count}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function VolunteerPage() {
  // ── Core auth/profile state (loaded immediately) ─────────────────────────
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState('clock')

  // ── Clock tab state ───────────────────────────────────────────────────────
  const [activeShift, setActiveShift]   = useState(null)
  const [clockLoading, setClockLoading] = useState(false)
  const [lunchAssignment, setLunchAssignment] = useState(null)

  // ── Schedule tab state (lazy) ─────────────────────────────────────────────
  const [schedule, setSchedule] = useState([])
  const [approvedCallouts, setApprovedCallouts] = useState([])
  const [approvedCovers, setApprovedCovers]     = useState([])

  // ── Callout tab state (lazy) ──────────────────────────────────────────────
  const [calloutDate, setCalloutDate]           = useState('')
  const [calloutShift, setCalloutShift]         = useState('')
  const [calloutReason, setCalloutReason]       = useState('')
  const [calloutRole, setCalloutRole]           = useState('')
  const [calloutMode, setCalloutMode]           = useState('single')
  const [calloutStartDate, setCalloutStartDate] = useState('')
  const [calloutEndDate, setCalloutEndDate]     = useState('')
  const [openShifts, setOpenShifts]             = useState([])
  const [myCoverRequests, setMyCoverRequests]   = useState([])
  const [requestingCoverId, setRequestingCoverId] = useState(null)

  const [unreadCount, setUnreadCount] = useState(0)

  // ── Account tab state (lazy) ──────────────────────────────────────────────
  const [allShifts, setAllShifts]               = useState([])
  const [shifts, setShifts]                     = useState([])
  const [showShiftHistory, setShowShiftHistory] = useState(false)
  const [newPassword, setNewPassword]           = useState('')
  const [confirmPassword, setConfirmPassword]   = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [pushEnabled, setPushEnabled]           = useState(false)
  const [pushLoading, setPushLoading]           = useState(false)
  const [editingCreds, setEditingCreds]         = useState(false)
  const [credForm, setCredForm]                 = useState({})
  const [savingCreds, setSavingCreds]           = useState(false)

  // ── Intern report tab state (lazy) ────────────────────────────────────────
  const [internHours, setInternHours]         = useState('')
  const [internRole, setInternRole]           = useState('')
  const [internProgress, setInternProgress]   = useState('')
  const [submittingInternReport, setSubmittingInternReport] = useState(false)

  // ── UI state ──────────────────────────────────────────────────────────────
  const [toast, setToast]         = useState(null)
  const [lightboxUrl, setLightboxUrl] = useState(null)

  // ── Tab fetch dedup guard ─────────────────────────────────────────────────
  // Tracks which tabs have already had their data fetched so we never
  // re-fetch on every re-render or tab revisit.
  const fetchedTabs = useRef(new Set())

  const [isMobile, setIsMobile] = useState(true)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const isIntern   = profile?.affiliation === 'intern'
  const isProvider = profile?.affiliation === 'provider'

  // ── CRITICAL PATH INIT — only profile + active shift ─────────────────────
  useEffect(() => {
    initCriticalPath()
  }, [])

  async function initCriticalPath() {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { window.location.href = '/'; return }
    setUser(user)

    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, full_name, role, default_role, affiliation, license_exp, bls_exp, dea_exp, tb_exp')
      .eq('id', user.id)
      .single()
    setProfile(profileData)

    if (profileData?.affiliation === 'provider') {
      setCredForm({
        license_exp: profileData.license_exp || '',
        bls_exp:     profileData.bls_exp     || '',
        dea_exp:     profileData.dea_exp     || '',
        tb_exp:      profileData.tb_exp      || '',
      })
    }

    const { data: open } = await supabase
      .from('shifts')
      .select('id, clock_in, role')
      .eq('volunteer_id', user.id)
      .is('clock_out', null)
      .maybeSingle()
    setActiveShift(open || null)

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
    const { data: lunch } = await supabase
      .from('lunch_assignments')
      .select('lunch_shift')
      .eq('volunteer_id', user.id)
      .eq('assignment_date', today)
      .maybeSingle()
    setLunchAssignment(lunch || null)

    await fetchScheduleTab(user.id)

    setLoading(false)
  }

  // ── Per-tab lazy fetchers ─────────────────────────────────────────────────

  const fetchScheduleTab = useCallback(async (uid) => {
    const userId = uid || user?.id
    if (!userId || fetchedTabs.current.has('schedule')) return
    fetchedTabs.current.add('schedule')

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })

    const [{ data: sched }, { data: myCallouts }, { data: myCoverReqs }] = await Promise.all([
      supabase
        .from('schedule')
        .select('id, day_of_week, shift_time, role, start_date, end_date, week_pattern, notes, volunteer_id')
        .eq('volunteer_id', userId)
        .order('day_of_week'),
      supabase
        .from('callouts')
        .select('id, callout_date, day_of_week, shift_time, role, reason')
        .eq('volunteer_id', userId)
        .eq('status', 'approved')
        .gte('callout_date', today)
        .order('callout_date', { ascending: true }),
      supabase
        .from('shift_cover_requests')
        .select('id, callout_id, status, callout:callouts!shift_cover_requests_callout_id_fkey(callout_date, day_of_week, shift_time, role, volunteer:profiles!callouts_volunteer_id_fkey(full_name))')
        .eq('volunteer_id', userId)
        .eq('status', 'approved')
        .gte('callouts.callout_date', today),
    ])

    setSchedule(sched || [])
    setApprovedCallouts(myCallouts || [])
    // Filter out any cover rows where the joined callout date is in the past
    // (the .gte filter above applies to the join, but guard here too)
    setApprovedCovers(
      (myCoverReqs || []).filter(r => r.callout?.callout_date >= today)
    )
  }, [user?.id])

  const fetchCalloutTab = useCallback(async () => {
    if (!user || fetchedTabs.current.has('callout')) return
    fetchedTabs.current.add('callout')

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
    const [{ data: openSubs }, { data: myCoverReqs }] = await Promise.all([
      supabase
        .from('callouts')
        .select('id, callout_date, day_of_week, shift_time, role, volunteer:profiles!callouts_volunteer_id_fkey(full_name)')
        .eq('status', 'approved')
        .is('covered_by', null)
        .gte('callout_date', today)
        .order('callout_date', { ascending: true }),
      supabase
        .from('shift_cover_requests')
        .select('callout_id, status')
        .eq('volunteer_id', user.id),
    ])

    setOpenShifts((openSubs || []).map(c => ({ ...c, profiles: c.volunteer })))
    setMyCoverRequests(myCoverReqs || [])
  }, [user])

  const fetchAccountTab = useCallback(async () => {
    if (!user || fetchedTabs.current.has('account')) return
    fetchedTabs.current.add('account')

    const [{ data: all }, { data: history }, pushState] = await Promise.all([
      supabase
        .from('shifts')
        .select('id, clock_in, clock_out')
        .eq('volunteer_id', user.id)
        .not('clock_out', 'is', null),
      supabase
        .from('shifts')
        .select('id, clock_in, clock_out, role')
        .eq('volunteer_id', user.id)
        .order('clock_in', { ascending: false })
        .limit(10),
      (async () => {
        if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false
        try {
          const reg = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, reject) => setTimeout(() => reject(new Error('SW timeout')), 3000)),
          ])
          const sub = await reg?.pushManager?.getSubscription().catch(() => null)
          return !!sub
        } catch { return false }
      })(),
    ])

    setAllShifts(all || [])
    setShifts(history || [])
    setPushEnabled(pushState)
  }, [user])

  // ── Tab switch handler ────────────────────────────────────────────────────
  async function handleTabChange(newTab) {
    setTab(newTab)
    if (newTab === 'schedule')    await fetchScheduleTab()
    if (newTab === 'callout')     await fetchCalloutTab()
    if (newTab === 'messages') {
      setUnreadCount(0)
    }
    if (newTab === 'account')     await fetchAccountTab()
    if (newTab === 'internreport') {
      // Intern report only needs schedule (already fetched in critical path)
    }
  }

  // ── Clock helpers ─────────────────────────────────────────────────────────
  function getCurrentShiftWindow() {
    const now = new Date()
    const mtnStr = now.toLocaleString('en-US', { timeZone: 'America/Denver' })
    const mtn = new Date(mtnStr)
    const dayIndex = mtn.getDay()
    if (dayIndex === 0 || dayIndex === 6) return { day: null, shift: null }
    const day = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dayIndex]
    const h = mtn.getHours() + mtn.getMinutes() / 60
    const shift = h >= 10 && h < 14 ? '10-2' : h >= 14 && h < 18 ? '2-6' : null
    return { day, shift }
  }

  async function handleClockIn() {
    setClockLoading(true)
    let resolvedRole = null
    const { day, shift } = getCurrentShiftWindow()
    if (day && shift) {
      const matches = schedule.filter(s => s.day_of_week === day && s.shift_time === shift)
      if (matches.length === 1) resolvedRole = matches[0].role
      else if (matches.length > 1) {
        const preferred = matches.find(s => s.role === profile?.default_role)
        resolvedRole = preferred ? preferred.role : matches[0].role
      }
    }
    if (!resolvedRole && profile?.default_role) resolvedRole = profile.default_role
    const { data, error } = await supabase
      .from('shifts')
      .insert({ volunteer_id: user.id, clock_in: new Date().toISOString(), role: resolvedRole })
      .select('id, clock_in, role')
      .single()
    if (error) showToast(error.message, 'error')
    else { setActiveShift(data); showToast('Clocked in successfully!', 'success') }
    setClockLoading(false)
  }

  async function handleClockOut() {
    setClockLoading(true)
    const { error } = await supabase
      .from('shifts')
      .update({ clock_out: new Date().toISOString() })
      .eq('id', activeShift.id)
    if (error) showToast(error.message, 'error')
    else {
      setActiveShift(null)
      showToast('Clocked out. Great work!', 'success')
      // Invalidate account tab so total hours refresh on next visit
      fetchedTabs.current.delete('account')
    }
    setClockLoading(false)
  }

  async function handleCallout(e) {
    e.preventDefault()
    const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
    if (calloutMode === 'single') {
      const derivedDay = calloutDate ? dayNames[new Date(calloutDate + 'T12:00:00').getDay()] : null
      const { error } = await supabase.from('callouts').insert({
        volunteer_id: user.id, callout_date: calloutDate, day_of_week: derivedDay,
        shift_time: calloutShift || null, reason: calloutReason, role: calloutRole || null,
      })
      if (error) showToast(error.message, 'error')
      else { showToast('Call-out submitted!', 'success'); setCalloutDate(''); setCalloutShift(''); setCalloutReason(''); setCalloutRole('') }
      return
    }
    if (!calloutStartDate || !calloutEndDate) return
    const start = new Date(calloutStartDate + 'T12:00:00')
    const end   = new Date(calloutEndDate   + 'T12:00:00')
    const rows  = []
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayName = dayNames[d.getDay()]
      if (dayName === 'sunday' || dayName === 'saturday') continue
      const dateStr = d.toLocaleDateString('en-CA')
      const matchingShifts = schedule.filter(s => s.day_of_week === dayName)
      if (matchingShifts.length === 0) continue
      const seen = new Set()
      for (const s of matchingShifts) {
        const key = `${dateStr}|${s.shift_time}`
        if (seen.has(key)) continue
        seen.add(key)
        rows.push({ volunteer_id: user.id, callout_date: dateStr, day_of_week: dayName, shift_time: s.shift_time, reason: calloutReason || null, role: s.role || null })
      }
    }
    if (rows.length === 0) { showToast('No scheduled shifts found in that date range.', 'error'); return }
    const { error } = await supabase.from('callouts').insert(rows)
    if (error) showToast(error.message, 'error')
    else { showToast(`${rows.length} call-out${rows.length !== 1 ? 's' : ''} submitted!`, 'success'); setCalloutStartDate(''); setCalloutEndDate(''); setCalloutReason('') }
  }

  async function handleRequestCover(calloutId) {
    setRequestingCoverId(calloutId)
    const { error } = await supabase.from('shift_cover_requests').insert({ callout_id: calloutId, volunteer_id: user.id })
    if (error) showToast(error.message, 'error')
    else { showToast('Cover request submitted!', 'success'); setMyCoverRequests(prev => [...prev, { callout_id: calloutId, status: 'pending' }]) }
    setRequestingCoverId(null)
  }

  async function handleInternReport(e) {
    e.preventDefault()
    if (!internHours || !internRole || !internProgress.trim()) return
    setSubmittingInternReport(true)
    try {
      const hours   = parseFloat(internHours)
      const clockOut = new Date()
      const clockIn  = new Date(clockOut.getTime() - hours * 3600000)
      const { error: shiftError } = await supabase.from('shifts').insert({
        volunteer_id: user.id, clock_in: clockIn.toISOString(), clock_out: clockOut.toISOString(), role: internRole,
      })
      if (shiftError) throw shiftError

      const { data: directors } = await supabase.from('profiles').select('id').eq('default_role', 'Director')
      const { data: { session } } = await supabase.auth.getSession()
      const sendPromises = (directors || []).map(director =>
        fetch('/api/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({
            recipient_type: 'volunteer',
            recipient_volunteer_id: director.id,
            body: `📋 Weekly Intern Report from ${profile?.full_name}\n\nHours logged: ${hours}h as ${internRole}\n\nWeekly Progress:\n${internProgress.trim()}`,
            image_url: null,
          }),
        })
      )
      await Promise.all(sendPromises)
      showToast('Weekly report submitted!', 'success')
      setInternHours(''); setInternRole(''); setInternProgress('')
      // Invalidate account tab
      fetchedTabs.current.delete('account')
    } catch (err) {
      showToast(err.message || 'Failed to submit report', 'error')
    } finally {
      setSubmittingInternReport(false)
    }
  }

  async function handleSaveCreds(e) {
    e.preventDefault()
    setSavingCreds(true)
    const { error } = await supabase.from('profiles').update({
      license_exp: credForm.license_exp || null,
      bls_exp:     credForm.bls_exp     || null,
      dea_exp:     credForm.dea_exp     || null,
      tb_exp:      credForm.tb_exp      || null,
    }).eq('id', user.id)
    if (error) {
      showToast(error.message, 'error')
    } else {
      showToast('Credentials updated!', 'success')
      const { data: fresh } = await supabase
        .from('profiles')
        .select('id, full_name, role, default_role, affiliation, license_exp, bls_exp, dea_exp, tb_exp')
        .eq('id', user.id)
        .single()
      setProfile(fresh)
      setEditingCreds(false)
    }
    setSavingCreds(false)
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    if (newPassword !== confirmPassword) { showToast('Passwords do not match', 'error'); return }
    if (newPassword.length < 6) { showToast('Password must be at least 6 characters', 'error'); return }
    setChangingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) showToast(error.message, 'error')
    else { showToast('Password updated!', 'success'); setNewPassword(''); setConfirmPassword('') }
    setChangingPassword(false)
  }

  function showToast(text, type) {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3500)
  }

  function calcHours(clock_in, clock_out) {
    if (!clock_out) return 'Active'
    return ((asUTC(clock_out) - asUTC(clock_in)) / 3600000).toFixed(1) + 'h'
  }
  function totalHours() {
    return allShifts.reduce((acc, s) => acc + (asUTC(s.clock_out) - asUTC(s.clock_in)) / 3600000, 0).toFixed(1)
  }

  async function handleSignOut() { await supabase.auth.signOut(); window.location.href = '/' }

  const myShiftCombos = schedule.reduce((acc, s) => {
    const key = `${s.day_of_week}|${s.shift_time}`
    if (!acc.find(x => x.key === key)) acc.push({ key, day: s.day_of_week, shift_time: s.shift_time, label: `${s.day_of_week.charAt(0).toUpperCase() + s.day_of_week.slice(1, 3)} ${s.shift_time}` })
    return acc
  }, [])

  const myRoles = [...new Set([
    ...schedule.filter(s => s.volunteer_id === user?.id).map(s => s.role).filter(Boolean),
    ...(profile?.default_role === 'Lab Director' ? ['Lab'] : []),
    ...(profile?.default_role === 'Lab' ? ['Lab'] : []),
  ])]

  const calloutSubmitDisabled = calloutMode === 'single'
    ? (!calloutDate || !calloutShift || !calloutRole || !calloutReason.trim())
    : (!calloutStartDate || !calloutEndDate || !calloutReason.trim())

  const TABS = [
    ['clock', 'Clock'],
    ['schedule', 'Schedule'],
    ['callout', 'Call-Out'],
    ['messages', 'Messages'],
    ...(isIntern ? [['internreport', 'Report Hours']] : []),
    ['account', 'Account'],
  ]

  if (loading) return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      gap: '1rem',
    }}>
      <div style={{ display: 'flex', gap: '6px' }}>
        {[0, 1, 2].map(i => (
          <span
            key={i}
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'var(--muted)',
              animation: `bounce 1s infinite ${i * 0.15}s`,
            }}
          />
        ))}
      </div>

      <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        Loading your page
      </p>

      {/* inject animation keyframes */}
      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 600, letterSpacing: '-0.02em' }}>
              Hey, {profile?.full_name?.split(' ')[0]}
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              {new Date().toLocaleDateString('en-US', { timeZone: 'America/Denver', weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {(profile?.role === 'admin' || profile?.default_role === 'Clinical Supervisor') && (
              <button
                onClick={() => {
                  if (profile?.default_role === 'Clinical Supervisor') { window.location.href = '/clinical-supervisor'; return }
                  if (window.location.pathname.includes('admin')) { window.location.href = '/volunteer' } else { window.location.href = '/admin' }
                }}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                Switch View
              </button>
            )}
            <button onClick={handleSignOut} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem' }}>
              Sign out
            </button>
          </div>
        </div>

        {/* Status banner */}
        <div style={{ ...S.card, marginBottom: '1.5rem', borderColor: activeShift ? 'var(--accent)' : 'var(--border)', background: activeShift ? 'rgba(74,222,128,0.05)' : 'var(--surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: activeShift ? 'var(--accent)' : 'var(--muted)', boxShadow: activeShift ? '0 0 8px var(--accent)' : 'none' }} />
            <span style={{ fontWeight: 500 }}>{activeShift ? `Clocked in since ${formatTime(activeShift.clock_in)}` : 'Not clocked in'}</span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {TABS.map(([key, label]) => (
            <TabButton
              key={key}
              id={key}
              label={label}
              active={tab === key}
              onClick={handleTabChange}
              badge={key === 'messages' ? unreadCount : 0}
            />
          ))}
        </div>

        {/* ── CLOCK TAB ───────────────────────────────────────────────────── */}
        {tab === 'clock' && (
          <div style={S.card}>
            <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Clock In / Out</h2>
            {activeShift ? (
              <button onClick={handleClockOut} disabled={clockLoading} style={{ width: '100%', padding: '1rem', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                {clockLoading ? 'Processing...' : 'Clock Out'}
              </button>
            ) : (
              <button onClick={handleClockIn} disabled={clockLoading} style={{ width: '100%', padding: '1rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                {clockLoading ? 'Processing...' : 'Clock In'}
              </button>
            )}

            {lunchAssignment && (
              <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(19, 90, 115, 0.35)', borderRadius: '8px' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Your Lunch Slot</p>
                <p style={{ fontWeight: 600, color: '#02416b', fontSize: '0.95rem' }}>
                  {lunchAssignment.lunch_shift === 1 ? 'Shift 1 · 12:30–1:00 PM' : 'Shift 2 · 1:00–1:30 PM'}
                </p>
              </div>
            )}

          </div>
        )}

        {tab === 'schedule' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* ── Existing recurring schedule ── */}
            <div style={S.card}>
              <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>My Schedule</h2>
              {schedule.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>You have no scheduled shifts yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {DAYS.map(day => {
                    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
                    const wom = (() => {
                      const d = new Date(today + 'T12:00:00'); let count = 0; const target = d.getDay()
                      const check = new Date(d.getFullYear(), d.getMonth(), 1)
                      while (check <= d) { if (check.getDay() === target) count++; check.setDate(check.getDate() + 1) }
                      return count
                    })()
                    const dayEntries = schedule.filter(s => {
                      if (s.day_of_week !== day.toLowerCase()) return false
                      if (s.start_date && s.start_date > today) return false
                      if (s.end_date   && s.end_date   < today) return false
                      if (s.week_pattern === 'odd'  && wom % 2 !== 1) return false
                      if (s.week_pattern === 'even' && wom % 2 !== 0) return false
                      return true
                    })
                    if (dayEntries.length === 0) return null
                    return (
                      <div key={day} style={{ padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <p style={{ fontWeight: 600, textTransform: 'capitalize', marginBottom: '0.6rem' }}>{day}</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          {SHIFTS.map(shift => {
                            const shiftEntries = dayEntries.filter(s => s.shift_time === shift)
                            if (shiftEntries.length === 0) return null
                            return shiftEntries.map(entry => (
                              <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                                <div>
                                  <span style={{ fontSize: '0.9rem' }}>{entry.role}</span>
                                  {entry.week_pattern && entry.week_pattern !== 'every' && (
                                    <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', borderRadius: '4px', padding: '0.1rem 0.35rem' }}>
                                      {entry.week_pattern === 'odd' ? '1st & 3rd week' : '2nd & 4th week'}
                                    </span>
                                  )}
                                  {entry.notes && (
                                    <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', borderRadius: '4px', padding: '0.1rem 0.35rem' }}>
                                      {entry.notes}
                                    </span>
                                  )}
                                </div>
                                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--muted)', background: 'var(--surface)', padding: '0.2rem 0.6rem', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                                  {shift}
                                </span>
                              </div>
                            ))
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {approvedCallouts.length > 0 && (
              <div style={S.card}>
                <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>
                  Approved Call-Outs
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {approvedCallouts.map(c => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.75rem 1rem',
                        background: 'var(--bg)',
                        borderRadius: '8px',
                        border: '1px solid rgba(239,68,68,0.25)',
                        gap: '0.75rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      {/* LEFT SIDE (like schedule role + tags) */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        
                        <span style={{
                          fontFamily: 'DM Mono, monospace',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: 'var(--text)',
                        }}>
                          {new Date(c.callout_date + 'T12:00:00').toLocaleDateString(
                            'en-US',
                            { weekday: 'short', month: 'short', day: 'numeric' }
                          )}
                        </span>

                        <span style={{
                          fontFamily: 'DM Mono, monospace',
                          fontSize: '0.78rem',
                          background: 'rgba(239,68,68,0.12)',
                          color: '#ef4444',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '6px',
                          border: '1px solid rgba(239,68,68,0.25)',
                          whiteSpace: 'nowrap',
                        }}>
                          {c.shift_time}
                        </span>

                        {c.role && (
                          <span style={{
                            fontSize: '0.78rem',
                            color: 'var(--muted)'
                          }}>
                            {c.role}
                          </span>
                        )}

                        {c.reason && (
                          <span style={{
                            fontSize: '0.72rem',
                            background: 'rgba(96,165,250,0.12)',
                            color: '#60a5fa',
                            borderRadius: '4px',
                            padding: '0.1rem 0.35rem',
                          }}>
                            {c.reason}
                          </span>
                        )}
                      </div>

                      {/* RIGHT SIDE (status-style like schedule shift time) */}
                      <span style={{
                        fontFamily: 'DM Mono, monospace',
                        fontSize: '0.8rem',
                        color: '#ef4444',
                        background: 'rgba(239,68,68,0.06)',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '6px',
                        whiteSpace: 'nowrap',
                      }}>
                        Call-out
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Shifts you're covering ── */}
            {approvedCovers.length > 0 && (
              <div style={{
                borderRadius: '12px',
                border: '1px solid rgba(2,65,107,0.4)',
                background: 'rgba(2,65,107,0.04)',
                overflow: 'hidden',
              }}>
                <div style={{
                  padding: '0.75rem 1.25rem',
                  borderBottom: '1px solid rgba(2,65,107,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                }}>
                  <span style={{
                    fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.07em',
                    textTransform: 'uppercase', padding: '0.2rem 0.6rem',
                    borderRadius: '100px', background: 'rgba(2,65,107,0.12)',
                    color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.35)',
                  }}>
                    Covering
                  </span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--accent)', fontWeight: 500 }}>
                    {approvedCovers.length} shift{approvedCovers.length !== 1 ? 's' : ''} you've picked up
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {approvedCovers.map((r, i) => {
                    const c = r.callout
                    return (
                      <div
                        key={r.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.65rem 1.25rem',
                          borderBottom: i < approvedCovers.length - 1 ? '1px solid rgba(2,65,107,0.1)' : 'none',
                          gap: '0.75rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                          <span style={{
                            fontFamily: 'DM Mono, monospace', fontSize: '0.85rem',
                            fontWeight: 600, color: 'var(--text)',
                          }}>
                            {new Date(c.callout_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          <span style={{
                            fontFamily: 'DM Mono, monospace', fontSize: '0.78rem',
                            background: 'rgba(2,65,107,0.1)', color: 'var(--accent)',
                            padding: '0.15rem 0.5rem', borderRadius: '6px',
                            border: '1px solid rgba(2,65,107,0.3)',
                          }}>
                            {c.shift_time}
                          </span>
                          {c.role && (
                            <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{c.role}</span>
                          )}
                        </div>
                        {c.volunteer?.full_name && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                            covering for <span style={{ fontWeight: 600, color: 'var(--text)' }}>{c.volunteer.full_name}</span>
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CALLOUT TAB ─────────────────────────────────────────────────── */}
        {tab === 'callout' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={S.card}>
              <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Submit a Call-Out</h2>
              <form onSubmit={handleCallout} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={S.label}>Type</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {[['single','Single Shift'],['range','Date Range']].map(([val, label]) => (
                      <button key={val} type="button"
                        onClick={() => { setCalloutMode(val); setCalloutDate(''); setCalloutShift(''); setCalloutRole(''); setCalloutStartDate(''); setCalloutEndDate('') }}
                        style={{ padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: calloutMode === val ? 'var(--accent)' : 'var(--surface)', color: calloutMode === val ? '#fff' : 'var(--muted)', border: calloutMode === val ? 'none' : '1px solid var(--border)' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {calloutMode === 'single' && <>
                  <div><label style={S.label}>Date you can't make it</label><input type="date" value={calloutDate} onChange={e => setCalloutDate(e.target.value)} required style={S.input} /></div>
                  <div>
                    <label style={S.label}>Shift</label>
                    <select value={calloutShift} onChange={e => {
                      const shift = e.target.value; setCalloutShift(shift)
                      if (calloutDate && shift) {
                        const dn = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
                        const d = dn[new Date(calloutDate + 'T12:00:00').getDay()]
                        const m = schedule.find(s => s.day_of_week === d && s.shift_time === shift)
                        if (m?.role) setCalloutRole(m.role)
                      }
                    }} style={S.input}>
                      <option value="">— Select —</option>
                      {SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>Role</label>
                    <select value={calloutRole} onChange={e => setCalloutRole(e.target.value)} required style={S.input}>
                      <option value="">— Select role —</option>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </>}
                {calloutMode === 'range' && <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div><label style={S.label}>From</label><input type="date" value={calloutStartDate} onChange={e => setCalloutStartDate(e.target.value)} required style={S.input} /></div>
                    <div><label style={S.label}>To</label><input type="date" value={calloutEndDate} onChange={e => setCalloutEndDate(e.target.value)} required style={S.input} /></div>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.5 }}>A call-out will be submitted for each of your scheduled shifts within this range. Weekends are skipped automatically.</p>
                </>}
                <div><label style={S.label}>Reason <span style={{ color: 'var(--accent)' }}>*</span></label><textarea value={calloutReason} onChange={e => setCalloutReason(e.target.value)} rows={3} placeholder="Let the team know why..." required style={{ ...S.input, resize: 'vertical' }} /></div>
                <button type="submit" disabled={calloutSubmitDisabled} style={{ padding: '0.85rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: calloutSubmitDisabled ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', opacity: calloutSubmitDisabled ? 0.5 : 1 }}>Submit Call-Out</button>
              </form>
            </div>

            <div style={S.card}>
              <h2 style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Open Shifts</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>Shifts that need coverage — tap to volunteer.</p>
              {openShifts.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No open shifts right now.</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {openShifts.map(c => {
                    const myReq = myCoverRequests.find(r => r.callout_id === c.id)
                    const isApproved = myReq?.status === 'approved'
                    return (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: `1px solid ${isApproved ? 'rgba(74,222,128,0.4)' : 'var(--border)'}`, flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div>
                          <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.callout_date}<span style={{ marginLeft: '0.5rem', fontFamily: 'DM Mono, monospace', fontSize: '0.82rem', color: 'var(--muted)' }}>{c.shift_time}</span></p>
                          <p style={{ color: 'var(--muted)', fontSize: '0.82rem', textTransform: 'capitalize' }}>{c.day_of_week}{c.role ? ` · ${c.role}` : ''}{c.profiles?.full_name ? ` · ${c.profiles.full_name} calling out` : ''}</p>
                        </div>
                        {isApproved
                          ? <span style={{ fontSize: '0.8rem', padding: '0.25rem 0.7rem', borderRadius: '100px', background: 'rgba(74,222,128,0.12)', color: 'var(--accent)', border: '1px solid rgba(74,222,128,0.3)', fontWeight: 600 }}>✓ You're covering</span>
                          : myReq
                            ? <span style={{ fontSize: '0.8rem', padding: '0.25rem 0.7rem', borderRadius: '100px', background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)', fontWeight: 500 }}>Requested</span>
                            : <button onClick={() => handleRequestCover(c.id)} disabled={requestingCoverId === c.id} style={{ padding: '0.35rem 0.9rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{requestingCoverId === c.id ? '...' : 'I can cover'}</button>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── MESSAGES TAB ────────────────────────────────────────────────── */}
        {tab === 'messages' && (
          <MessageTab
            user={user}
            profile={profile}
            supabase={supabase}
            showToast={showToast}
            isMobile={isMobile}
            getInboxMessages={getInboxMessages}
            MAX_FILE_SIZE={MAX_FILE_SIZE}
            SHIFTS={SHIFTS}
            schedule={schedule}
          />
        )}

        {/* ── INTERN REPORT TAB ───────────────────────────────────────────── */}
        {tab === 'internreport' && isIntern && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ ...S.card, borderColor: 'var(--accent)', background: 'rgba(2,65,107,0.04)' }}>
              <h2 style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Weekly Hours Report</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>Log your hours for the week and send a progress update to your internship coordinator.</p>
              <form onSubmit={handleInternReport} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={S.label}>Role</label>
                  <select value={internRole} onChange={e => setInternRole(e.target.value)} required style={S.input}>
                    <option value="">— Select role —</option>
                    {[...ROLES, "Intern"].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div><label style={S.label}>Hours Worked This Week</label><input type="number" min="0.5" max="60" step="0.5" value={internHours} onChange={e => setInternHours(e.target.value)} required placeholder="e.g. 20" style={S.input} /></div>
                <div>
                  <label style={S.label}>Weekly Progress <span style={{ textTransform: 'none', color: '#ef4444' }}>*</span></label>
                  <textarea value={internProgress} onChange={e => setInternProgress(e.target.value)} rows={5} required placeholder="Describe what you worked on this week, any challenges, and goals for next week..." style={{ ...S.input, resize: 'vertical' }} />
                  <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.35rem' }}>This will be sent directly to your internship coordinator.</p>
                </div>
                <button type="submit" disabled={submittingInternReport || !internHours || !internRole || !internProgress.trim()} style={{ padding: '0.85rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: submittingInternReport ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', opacity: (!internHours || !internRole || !internProgress.trim()) ? 0.5 : 1 }}>
                  {submittingInternReport ? 'Submitting…' : 'Submit Weekly Report'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── ACCOUNT TAB ─────────────────────────────────────────────────── */}
        {tab === 'account' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Hours summary */}
            <div style={{ ...S.card, borderColor: 'var(--accent)', background: 'rgba(2,65,107,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Total Hours</p>
                <p style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--accent)', lineHeight: 1 }}>{totalHours()}<span style={{ fontSize: '1rem', fontWeight: 500, marginLeft: '0.25rem', color: 'var(--muted)' }}>hrs</span></p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Completed Shifts</p>
                <p style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--text)', lineHeight: 1 }}>{allShifts.length}</p>
              </div>
            </div>

            {/* Shift history */}
            <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
              <button onClick={() => setShowShiftHistory(h => !h)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)' }}>Shift History</span>
                <span style={{ color: 'var(--muted)', fontSize: '1.1rem', transform: showShiftHistory ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▾</span>
              </button>
              {showShiftHistory && (
                <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {shifts.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No shifts recorded yet.</p> : shifts.map(s => (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <div><p style={{ fontWeight: 500, fontSize: '0.9rem' }}>{formatDate(s.clock_in)}</p><p style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{formatTime(s.clock_in)} → {formatTime(s.clock_out)}</p></div>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.9rem', color: s.clock_out ? 'var(--accent)' : 'var(--warn)' }}>{calcHours(s.clock_in, s.clock_out)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Provider credentials */}
            {isProvider && (
              <div style={{ ...S.card, borderColor: 'rgba(125,211,252,0.4)', background: 'rgba(125,211,252,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div>
                    <h2 style={{ fontWeight: 600, fontSize: '1rem' }}>My Credentials</h2>
                    <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: '0.15rem' }}>License &amp; certification expiration dates</p>
                  </div>
                  <button
                    onClick={() => {
                      if (!editingCreds) setCredForm({ license_exp: profile?.license_exp || '', bls_exp: profile?.bls_exp || '', dea_exp: profile?.dea_exp || '', tb_exp: profile?.tb_exp || '' })
                      setEditingCreds(e => !e)
                    }}
                    style={{ padding: '0.4rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: editingCreds ? 'var(--surface)' : 'rgba(125,211,252,0.15)', color: editingCreds ? 'var(--muted)' : '#7dd3fc', border: editingCreds ? '1px solid var(--border)' : '1px solid rgba(125,211,252,0.4)' }}
                  >
                    {editingCreds ? 'Cancel' : 'Update'}
                  </button>
                </div>
                {!editingCreds ? (
                  <ProviderCredCard vol={profile} />
                ) : (
                  <form onSubmit={handleSaveCreds} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
                      {PROVIDER_CRED_FIELDS.map(f => (
                        <CredentialInput key={f.key} fieldKey={f.key} label={f.label} value={credForm[f.key] || ''} onChange={val => setCredForm(prev => ({ ...prev, [f.key]: val }))} allowNA={f.key === 'dea_exp'} />
                      ))}
                    </div>
                    <button type="submit" disabled={savingCreds} style={{ padding: '0.85rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: savingCreds ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                      {savingCreds ? 'Saving…' : 'Save Credentials'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Submit hours — disabled for volunteers, available on provider page
            {!isIntern && (
              <SubmitHoursPanel
                supabase={supabase}
                userId={user.id}
                roles={ROLES}
                showToast={showToast}
                defaultRole={profile?.default_role}
              />
            )}
            */}

            {/* Push notifications */}
            <div style={S.card}>
              <h2 style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Notifications</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>Get notified about new messages and shift updates.</p>
              <button
                onClick={async () => {
                  setPushLoading(true)
                  if (pushEnabled) { await unsubscribeFromPush(supabase, user.id); setPushEnabled(false) }
                  else { const sub = await subscribeToPush(supabase, user.id); setPushEnabled(!!sub); if (!sub) showToast('Notification permission denied', 'error') }
                  setPushLoading(false)
                }}
                disabled={pushLoading}
                style={{ padding: '0.85rem', width: '100%', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: pushLoading ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', background: pushEnabled ? 'var(--danger)' : 'var(--accent)', color: '#fff' }}
              >
                {pushLoading ? 'Working...' : pushEnabled ? 'Turn off notifications' : 'Turn on notifications'}
              </button>
            </div>

            {/* Change password */}
            <div style={S.card}>
              <h2 style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Change Password</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>Must be at least 6 characters.</p>
              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div><label style={S.label}>New Password</label><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required placeholder="New password" style={S.input} /></div>
                <div><label style={S.label}>Confirm New Password</label><input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required placeholder="Repeat new password" style={S.input} /></div>
                <button type="submit" disabled={changingPassword || !newPassword || !confirmPassword} style={{ padding: '0.85rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: changingPassword ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{changingPassword ? 'Updating...' : 'Update Password'}</button>
              </form>
            </div>

          </div>
        )}

        {/* Toast */}
        {toast && (
          <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'success' ? 'var(--accent)' : 'var(--danger)', color: '#fff', padding: '0.75rem 1.5rem', borderRadius: '100px', fontWeight: 500, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
            {toast.text}
          </div>
        )}

        {/* Lightbox */}
        {lightboxUrl && (
          <div onClick={() => setLightboxUrl(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1.5rem', cursor: 'zoom-out' }}>
            <img src={lightboxUrl} alt="Full size" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: '10px', objectFit: 'contain', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()} />
            <button onClick={() => setLightboxUrl(null)} style={{ position: 'fixed', top: '1rem', right: '1rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%', color: '#fff', width: '36px', height: '36px', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        )}
      </div>
    </div>
  )
}
