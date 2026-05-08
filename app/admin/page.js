'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { SHIFTS, ROLES, ROLE_SUGGESTIONS, SCHOOLS, MAJORS, ACTION_LABELS, ACTION_COLORS } from '../../lib/constants'
import { getMountainNow, getMountainLabel, asUTC, formatMountain, formatDateMountain, formatDateTime, toMountainInputValue, fromMountainInputValue } from '../../lib/timeUtils'
import DataDashboard from '../../components/DataDashboard'
import ClinicOpenings from '../../components/ClinicOpenings'
import Pipeline from '../../components/Pipeline'
import Waitlist from '../../components/Waitlist'
import LunchScheduler from '../../components/LunchScheduler'

export const dynamic = 'force-dynamic'

const DAYS = ['monday','tuesday','wednesday','thursday','friday']

// ── Pagination page sizes ────────────────────────────────────────────────────
// Reduced from 200/100/500 to small pages loaded on demand.
const SHIFTS_PAGE   = 25   // was 200 flat fetch
const HOURS_PAGE    = 20   // was 100 flat fetch
const AUDIT_PAGE    = 30   // was 500 flat fetch
const CALLOUTS_LIMIT = 60  // was 100 flat fetch

const PROVIDER_CRED_FIELDS = [
  { key: 'license_exp', label: 'License' },
  { key: 'bls_exp',     label: 'BLS' },
  { key: 'dea_exp',     label: 'DEA' },
  { key: 'ftca_exp',    label: 'FTCA' },
  { key: 'tb_exp',      label: 'TB' },
]

// ── Credential helpers ────────────────────────────────────────────────────────
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

// ── Shared sub-components ─────────────────────────────────────────────────────
function CredentialInput({ fieldKey, label, value, onChange, allowNA = false, inputStyle, labelStyle }) {
  const mode = value === 'N/A' ? 'na' : value === 'expired' ? 'expired' : 'date'
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <select
          value={mode}
          onChange={e => {
            const m = e.target.value
            if (m === 'na') onChange('N/A')
            else if (m === 'expired') onChange('expired')
            else onChange('')
          }}
          style={{ ...inputStyle, fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
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
            style={{ ...inputStyle, fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
          />
        )}
      </div>
    </div>
  )
}

function ExpandableSection({ label, isOpen, onToggle, loading: isLoading, children, count }) {
  return (
    <div style={{ borderRadius: '10px', border: `1px solid ${isOpen ? 'var(--accent)' : 'var(--border)'}`, overflow: 'hidden', transition: 'border-color 0.15s' }}>
      <button onClick={onToggle} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1rem', background: isOpen ? 'rgba(2,65,107,0.05)' : 'var(--bg)', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', color: isOpen ? 'var(--accent)' : 'var(--text)', transition: 'background 0.15s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '0.85rem', color: 'var(--muted)' }}>›</span>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{label}</span>
          {count !== undefined && count !== null && (
            <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: isOpen ? 'rgba(2,65,107,0.15)' : 'var(--surface)', color: isOpen ? 'var(--accent)' : 'var(--muted)', border: '1px solid var(--border)', fontFamily: 'DM Mono, monospace' }}>{count}</span>
          )}
        </div>
        {isLoading && <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Loading...</span>}
      </button>
      {isOpen && (
        <div style={{ padding: '0 1rem 1rem', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
          <div style={{ paddingTop: '0.75rem' }}>{children}</div>
        </div>
      )}
    </div>
  )
}

function ProviderCredentialsView({ vol }) {
  const fields = PROVIDER_CRED_FIELDS.map(f => ({ ...f, value: vol[f.key] || null, status: credentialStatus(vol[f.key]) }))
  return (
    <div style={{ padding: '1rem 1.25rem', borderRadius: '10px', border: '1px solid rgba(125,211,252,0.35)', background: 'rgba(125,211,252,0.04)', gridColumn: '1 / -1' }}>
      <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Provider Credentials</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.6rem' }}>
        {fields.map(f => {
          const isNA = f.status === 'na'; const isMissing = f.status === 'missing'
          const isExpired = f.status === 'expired'; const isExpiring = f.status === 'expiring'
          const borderColor = (isMissing || isExpired) ? 'rgba(239,68,68,0.4)' : isExpiring ? 'rgba(251,146,60,0.45)' : isNA ? 'rgba(156,163,175,0.35)' : 'rgba(2,65,107,0.3)'
          const bgColor = (isMissing || isExpired) ? 'rgba(239,68,68,0.06)' : isExpiring ? 'rgba(251,146,60,0.06)' : isNA ? 'rgba(156,163,175,0.06)' : 'rgba(2,65,107,0.05)'
          const textColor = (isMissing || isExpired) ? '#ef4444' : isExpiring ? '#f97316' : isNA ? 'var(--muted)' : 'var(--text)'
          return (
            <div key={f.key} style={{ padding: '0.6rem 0.75rem', borderRadius: '8px', border: `1px solid ${borderColor}`, background: bgColor }}>
              <p style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>{f.label}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem' }}>
                <p style={{ fontFamily: (isMissing || isNA) ? 'DM Sans, sans-serif' : 'DM Mono, monospace', fontSize: '0.82rem', fontWeight: (isMissing || isNA) ? 400 : 600, color: textColor, fontStyle: (isMissing || isNA) ? 'italic' : 'normal' }}>
                  {isMissing ? 'Not set' : formatExpDate(f.value)}
                </p>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: (isMissing || isExpired) ? '#ef4444' : isExpiring ? '#f97316' : isNA ? 'var(--muted)' : '#22c55e', flexShrink: 0 }}>
                  {(isMissing || isExpired) ? '✗' : isExpiring ? '!' : isNA ? '—' : '✓'}
                </span>
              </div>
              {isExpired  && <p style={{ fontSize: '0.65rem', color: '#ef4444', fontWeight: 700, marginTop: '0.15rem' }}>EXPIRED</p>}
              {isExpiring && <p style={{ fontSize: '0.65rem', color: '#f97316', fontWeight: 700, marginTop: '0.15rem' }}>EXP. SOON</p>}
              {isNA       && <p style={{ fontSize: '0.65rem', color: 'var(--muted)', fontWeight: 600, marginTop: '0.15rem' }}>NOT APPLICABLE</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProviderCredentialsSummaryBanner({ volunteers, onSelect }) {
  const [collapsed, setCollapsed] = useState(true)
  const providers = volunteers.filter(v => v.affiliation === 'provider' && (v.status ?? 'active') === 'active')
  if (providers.length === 0) return null
  const flagged = providers.flatMap(v =>
    PROVIDER_CRED_FIELDS.map(f => ({ ...f, vol: v, status: credentialStatus(v[f.key]) }))
      .filter(f => f.status === 'expired' || f.status === 'missing')
  )
  const expiring = providers.flatMap(v =>
    PROVIDER_CRED_FIELDS.map(f => ({ ...f, vol: v, status: credentialStatus(v[f.key]) }))
      .filter(f => f.status === 'expiring')
  )
  const allOk = flagged.length === 0 && expiring.length === 0
  const borderColor = flagged.length > 0 ? 'rgba(239,68,68,0.4)' : expiring.length > 0 ? 'rgba(251,146,60,0.4)' : 'rgba(2,65,107,0.35)'
  const bgColor = flagged.length > 0 ? 'rgba(239,68,68,0.04)' : expiring.length > 0 ? 'rgba(251,146,60,0.04)' : 'rgba(2,65,107,0.03)'
  const headerColor = flagged.length > 0 ? '#ef4444' : expiring.length > 0 ? '#f97316' : 'var(--accent)'
  return (
    <div style={{ borderRadius: '12px', border: `1px solid ${borderColor}`, background: bgColor, overflow: 'hidden' }}>
      <button onClick={() => setCollapsed(c => !c)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.2rem 0.6rem', borderRadius: '100px', background: `${headerColor}18`, color: headerColor, border: `1px solid ${headerColor}44` }}>Provider Credentials</span>
          <span style={{ fontSize: '0.82rem', color: headerColor, fontWeight: 500 }}>
            {allOk ? `All ${providers.length} provider${providers.length !== 1 ? 's' : ''} up to date` : flagged.length > 0 ? `${flagged.length} credential${flagged.length !== 1 ? 's' : ''} expired or missing` : `${expiring.length} credential${expiring.length !== 1 ? 's' : ''} expiring soon`}
          </span>
        </div>
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▾</span>
      </button>
      {!collapsed && (
        <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '1px solid var(--border)' }}>
          {allOk ? (
            <p style={{ paddingTop: '0.75rem', fontSize: '0.85rem', color: 'var(--muted)' }}>All credentials are current.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingTop: '0.75rem' }}>
              {[...flagged, ...expiring].map((item, i) => {
                const isExpiring = item.status === 'expiring'
                const rowColor = isExpiring ? '#f97316' : '#ef4444'
                const rowBg = isExpiring ? 'rgba(251,146,60,0.07)' : 'rgba(239,68,68,0.07)'
                const rowBorder = isExpiring ? 'rgba(251,146,60,0.35)' : 'rgba(239,68,68,0.3)'
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.45rem 0.75rem', borderRadius: '8px', background: rowBg, border: `1px solid ${rowBorder}`, flexWrap: 'wrap', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span onClick={() => onSelect(item.vol)} style={{ fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '2px' }}>{item.vol.full_name}</span>
                      <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.45rem', borderRadius: '6px', background: `${rowColor}18`, color: rowColor, border: `1px solid ${rowColor}44`, fontWeight: 600 }}>{item.label}</span>
                    </div>
                    <span style={{ fontSize: '0.78rem', fontFamily: 'DM Mono, monospace', color: rowColor, fontWeight: 600 }}>
                      {item.status === 'missing' ? 'Not on file' : item.status === 'expired' ? `Expired ${formatExpDate(item.vol[item.key])}` : `Exp. ${formatExpDate(item.vol[item.key])}`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Load-more button ──────────────────────────────────────────────────────────
function LoadMoreButton({ onClick, loading, hasMore, label = 'Load more' }) {
  if (!hasMore) return null
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{ marginTop: '0.75rem', width: '100%', padding: '0.6rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontFamily: 'DM Sans, sans-serif' }}
    >
      {loading ? 'Loading…' : label}
    </button>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [profile, setProfile] = useState(null)

  // ── Core data — loaded once on init ────────────────────────────────────────
  // CHANGE: volunteers query no longer joins shifts(*). Previously that join
  // pulled every shift row for every volunteer on every page load — by far the
  // largest single egress source on this page.
  const [volunteers, setVolunteers]   = useState([])
  const [activeShifts, setActiveShifts] = useState([])
  const [callouts, setCallouts]       = useState([])
  const [schedule, setSchedule]       = useState([])
  const [tab, setTab]                 = useState('dashboard')
  const [loading, setLoading]         = useState(true)
  const [toast, setToast]             = useState(null)
  const [currentTime, setCurrentTime] = useState(getMountainNow())

  // Tab loaded guard — prevents re-fetching on revisit
  const loadedTabs = useRef(new Set(['dashboard']))

  // ── Schedule tab state ──────────────────────────────────────────────────────
  const [showReadCallouts, setShowReadCallouts]   = useState(false)
  const [scheduleDay, setScheduleDay]             = useState('monday')
  const [scheduleShift, setScheduleShift]         = useState('10-2')
  const [addingRole, setAddingRole]               = useState(null)
  const [addVolId, setAddVolId]                   = useState('')
  const [addingEntry, setAddingEntry]             = useState(false)
  const [addStartDate, setAddStartDate]           = useState('')
  const [addEndDate, setAddEndDate]               = useState('')
  const [addWeekPattern, setAddWeekPattern]       = useState('every')
  const [addNotes, setAddNotes]                   = useState('')
  const [showClinicOpenings, setShowClinicOpenings] = useState(false)
  const [showWaitlist, setShowWaitlist]           = useState(false)
  const [scheduleDate, setScheduleDate]           = useState('')
  const [dateCoverShifts, setDateCoverShifts]     = useState([])

  // ── Volunteer tab state ─────────────────────────────────────────────────────
  const [selectedVolunteer, setSelectedVolunteer] = useState(null)
  const [editing, setEditing]                     = useState(false)
  const [showInactive, setShowInactive]           = useState(false)
  const [statusForm, setStatusForm]               = useState({ status: 'active', status_reason: '' })
  const [changingStatus, setChangingStatus]       = useState(false)
  const [editForm, setEditForm]                   = useState({})
  const [saving, setSaving]                       = useState(false)
  const [filterAffiliation, setFilterAffiliation] = useState('all')
  const [filterSchool, setFilterSchool]           = useState('all')
  const [filterRole, setFilterRole]               = useState('all')
  const [filterDefaultRole, setFilterDefaultRole] = useState('all')
  const [filterSearch, setFilterSearch]           = useState('')
  const [filtersOpen, setFiltersOpen]             = useState(true)
  const [volunteersOpen, setVolunteersOpen]       = useState(true)
  const [showRecentShifts, setShowRecentShifts]   = useState(false)
  const [showScheduledShifts, setShowScheduledShifts] = useState(false)
  const [recentShifts, setRecentShifts]           = useState([])
  const [scheduledShifts, setScheduledShifts]     = useState([])
  const [loadingRecentShifts, setLoadingRecentShifts]       = useState(false)
  const [loadingScheduledShifts, setLoadingScheduledShifts] = useState(false)
  // CHANGE: volunteer total hours now fetched on demand instead of via shifts(*) join
  const [volunteerTotalHours, setVolunteerTotalHours] = useState(null)
  const [loadingVolHours, setLoadingVolHours]     = useState(false)

  // ── Create volunteer state ──────────────────────────────────────────────────
  const [newName, setNewName]         = useState(''); const [newEmail, setNewEmail]       = useState(''); const [newPassword, setNewPassword]   = useState('')
  const [newRole, setNewRole]         = useState('volunteer'); const [newAffiliation, setNewAffiliation] = useState(''); const [newCredentials, setNewCredentials] = useState('')
  const [newPhone, setNewPhone]       = useState(''); const [newLanguages, setNewLanguages] = useState(''); const [newSmaName, setNewSmaName]     = useState('')
  const [newSmaContact, setNewSmaContact] = useState(''); const [newSchool, setNewSchool] = useState(''); const [newMajor, setNewMajor]         = useState('')
  const [newBirthday, setNewBirthday] = useState(''); const [newDefaultRole, setNewDefaultRole] = useState(''); const [creating, setCreating]         = useState(false)
  const [newAdvisorName, setNewAdvisorName]       = useState(''); const [newAdvisorContact, setNewAdvisorContact] = useState('')
  const [newInternSchool, setNewInternSchool]     = useState(''); const [newInternDepartment, setNewInternDepartment] = useState('')
  const [newProviderCreds, setNewProviderCreds]   = useState({ license_exp: '', bls_exp: '', dea_exp: '', ftca_exp: '', tb_exp: '' })

  // ── Cover requests state ────────────────────────────────────────────────────
  const [coverRequests, setCoverRequests]   = useState([])
  const [approvingCoverId, setApprovingCoverId] = useState(null)
  const [pendingCalloutsOpen, setPendingCalloutsOpen] = useState(true)
  const [openShiftsOpen, setOpenShiftsOpen] = useState(true)

  // ── Shifts tab — paginated ──────────────────────────────────────────────────
  // CHANGE: was a single fetch of 200 rows. Now loads SHIFTS_PAGE (25) at a time.
  const [allShifts, setAllShifts]           = useState([])
  const [shiftsLoading, setShiftsLoading]   = useState(false)
  const [shiftsLoadingMore, setShiftsLoadingMore] = useState(false)
  const [shiftsHasMore, setShiftsHasMore]   = useState(false)
  const [shiftsCursor, setShiftsCursor]     = useState(null) // oldest clock_in fetched
  const [editingShiftId, setEditingShiftId] = useState(null)
  const [shiftEditForm, setShiftEditForm]   = useState({ clock_in: '', clock_out: '', role: '', clock_in_utc: '', clock_out_utc: '' })
  const [savingShift, setSavingShift]       = useState(false)
  const [showNewShiftForm, setShowNewShiftForm] = useState(false)
  const [newShiftForm, setNewShiftForm]     = useState({ volunteer_id: '', clock_in: '', clock_out: '', role: '' })
  const [creatingShift, setCreatingShift]   = useState(false)
  const [shiftFilterVolId, setShiftFilterVolId] = useState('')

  // ── Hours tab — paginated, split pending/reviewed ───────────────────────────
  // CHANGE: was a single 100-row fetch. Now pending loads first (usually tiny);
  // reviewed history is paginated separately and only loads when scrolled to.
  const [pendingHours, setPendingHours]             = useState([])
  const [reviewedHours, setReviewedHours]           = useState([])
  const [hoursLoading, setHoursLoading]             = useState(false)
  const [reviewedHoursLoading, setReviewedHoursLoading] = useState(false)
  const [reviewedHoursHasMore, setReviewedHoursHasMore] = useState(false)
  const [reviewedHoursCursor, setReviewedHoursCursor]   = useState(null)
  const [approvingHoursId, setApprovingHoursId]     = useState(null)

  // ── Audit tab — paginated ───────────────────────────────────────────────────
  // CHANGE: was a single 500-row fetch. Now loads AUDIT_PAGE (30) at a time.
  const [auditLogs, setAuditLogs]           = useState([])
  const [auditLoading, setAuditLoading]     = useState(false)
  const [auditLoadingMore, setAuditLoadingMore] = useState(false)
  const [auditHasMore, setAuditHasMore]     = useState(false)
  const [auditCursor, setAuditCursor]       = useState(null) // oldest created_at fetched
  const [auditFilterAdmin, setAuditFilterAdmin]   = useState('')
  const [auditFilterAction, setAuditFilterAction] = useState('')
  const [auditFilterFrom, setAuditFilterFrom]     = useState('')
  const [auditFilterTo, setAuditFilterTo]         = useState('')

  const [lightboxUrl, setLightboxUrl] = useState(null)

  // ── Stable style objects ────────────────────────────────────────────────────
  const card        = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
  const inputStyle  = { width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', fontFamily: 'DM Sans, sans-serif' }
  const labelStyle  = { display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const affiliationColor = { missionary: '#818cf8', intern: '#150d5a', student: '#38bdf8', volunteer: '#02416B', provider: '#7dd3fc' }
  const badgeStyle  = (color) => ({ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 500, background: color + '22', color: color, border: `1px solid ${color}55` })
  const pillBtn     = (active, mono) => ({ padding: '0.45rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: mono ? 'DM Mono, monospace' : 'DM Sans, sans-serif', background: active ? (mono ? '#1e40af' : 'var(--accent)') : 'var(--surface)', color: active ? (mono ? '#bfdbfe' : '#0a0f0a') : 'var(--muted)', border: active ? 'none' : '1px solid var(--border)' })
  const tzLabel     = getMountainLabel()
  const DAY_ORDER   = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 }

  // ── Data loaders ────────────────────────────────────────────────────────────

  // CHANGE: removed all columns not rendered in the list view. No joins to shifts.
  async function loadVolunteers() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, role, affiliation, status, status_reason, credentials, languages, default_role, school, major, sma_name, sma_contact, advisor_name, advisor_contact, intern_school, intern_department, license_exp, bls_exp, dea_exp, ftca_exp, tb_exp, birthday')
      .order('full_name')
    setVolunteers(data || [])
  }

  async function loadActiveShifts() {
    const { data } = await supabase
      .from('shifts')
      .select('id, volunteer_id, clock_in, profiles(id, full_name)')
      .is('clock_out', null)
    setActiveShifts(data || [])
  }

  // CHANGE: limit reduced from 100 to 60; only future + today callouts fetched
  // by default. Old closed callouts only show when admin expands that section.
  async function loadCallouts() {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
    const { data } = await supabase
      .from('callouts')
      .select('id, volunteer_id, callout_date, day_of_week, shift_time, role, reason, status, is_read, covered_by, submitted_at, volunteer:profiles!callouts_volunteer_id_fkey(full_name)')
      .gte('callout_date', todayStr)           // CHANGE: only future callouts on init
      .order('submitted_at', { ascending: false })
      .limit(CALLOUTS_LIMIT)
    setCallouts((data || []).map(c => ({ ...c, profiles: c.volunteer, status: c.status ?? (c.is_read ? 'approved' : 'pending') })))
  }

  async function loadSchedule() {
    const { data } = await supabase
      .from('schedule')
      .select('id, volunteer_id, day_of_week, shift_time, role, start_date, end_date, week_pattern, notes, profiles(id, full_name)')
      .order('role')
    setSchedule(data || [])
  }

  async function loadCoverRequests() {
    const { data } = await supabase
      .from('shift_cover_requests')
      .select('id, callout_id, volunteer_id, status, requested_at, reviewed_at, profiles(full_name)')
      .order('requested_at', { ascending: false })
    setCoverRequests(data || [])
  }

  // ── Shifts tab — first page ─────────────────────────────────────────────────
  // CHANGE: was loadAllShifts() fetching 200 rows unconditionally. Now fetches
  // only SHIFTS_PAGE rows and exposes a "load more" button.
  async function loadShiftsFirstPage(volId = '') {
    setShiftsLoading(true)
    let q = supabase
      .from('shifts')
      .select('id, volunteer_id, clock_in, clock_out, role, profiles(id, full_name)')
      .order('clock_in', { ascending: false })
      .limit(SHIFTS_PAGE)
    if (volId) q = q.eq('volunteer_id', volId)
    const { data } = await q
    const rows = data || []
    setAllShifts(rows)
    setShiftsHasMore(rows.length === SHIFTS_PAGE)
    setShiftsCursor(rows.length > 0 ? rows[rows.length - 1].clock_in : null)
    setShiftsLoading(false)
  }

  async function loadMoreShifts() {
    if (!shiftsCursor || shiftsLoadingMore) return
    setShiftsLoadingMore(true)
    let q = supabase
      .from('shifts')
      .select('id, volunteer_id, clock_in, clock_out, role, profiles(id, full_name)')
      .order('clock_in', { ascending: false })
      .lt('clock_in', shiftsCursor)
      .limit(SHIFTS_PAGE)
    if (shiftFilterVolId) q = q.eq('volunteer_id', shiftFilterVolId)
    const { data } = await q
    const rows = data || []
    setAllShifts(prev => [...prev, ...rows])
    setShiftsHasMore(rows.length === SHIFTS_PAGE)
    setShiftsCursor(rows.length > 0 ? rows[rows.length - 1].clock_in : null)
    setShiftsLoadingMore(false)
  }

  // ── Hours tab — pending only on init, reviewed paginated on demand ──────────
  // CHANGE: previously fetched 100 rows (all statuses) in one query. Now:
  //   1. loadPendingHours() fetches only pending — usually < 10 rows.
  //   2. loadReviewedHours() is called lazily when admin clicks "View history".
  async function loadPendingHours() {
    setHoursLoading(true)
    const { data } = await supabase
      .from('hours_submissions')
      .select('id, volunteer_id, work_date, hours, role, notes, status, submitted_at, reviewed_at, profiles(full_name, role)')
      .eq('status', 'pending')
      .order('submitted_at', { ascending: false })
    setPendingHours((data || []).filter(h => h.profiles?.role !== 'admin'))
    setHoursLoading(false)
  }

  async function loadReviewedHoursFirstPage() {
    setReviewedHoursLoading(true)
    const { data } = await supabase
      .from('hours_submissions')
      .select('id, volunteer_id, work_date, hours, role, notes, status, submitted_at, reviewed_at, profiles(full_name, role)')
      .neq('status', 'pending')
      .order('submitted_at', { ascending: false })
      .limit(HOURS_PAGE)
    const rows = (data || []).filter(h => h.profiles?.role !== 'admin')
    setReviewedHours(rows)
    setReviewedHoursHasMore(rows.length === HOURS_PAGE)
    setReviewedHoursCursor(rows.length > 0 ? rows[rows.length - 1].submitted_at : null)
    setReviewedHoursLoading(false)
  }

  async function loadMoreReviewedHours() {
    if (!reviewedHoursCursor || reviewedHoursLoading) return
    setReviewedHoursLoading(true)
    const { data } = await supabase
      .from('hours_submissions')
      .select('id, volunteer_id, work_date, hours, role, notes, status, submitted_at, reviewed_at, profiles(full_name, role)')
      .neq('status', 'pending')
      .lt('submitted_at', reviewedHoursCursor)
      .order('submitted_at', { ascending: false })
      .limit(HOURS_PAGE)
    const rows = (data || []).filter(h => h.profiles?.role !== 'admin')
    setReviewedHours(prev => [...prev, ...rows])
    setReviewedHoursHasMore(rows.length === HOURS_PAGE)
    setReviewedHoursCursor(rows.length > 0 ? rows[rows.length - 1].submitted_at : null)
    setReviewedHoursLoading(false)
  }

  // ── Audit tab — first page ──────────────────────────────────────────────────
  // CHANGE: was a single 500-row fetch every time filters change. Now loads
  // AUDIT_PAGE (30) rows and offers "load more". 500 audit log rows × ~1 KB each
  // = ~500 KB per filter apply. This cuts that to ~30 KB.
  async function loadAuditFirstPage() {
    setAuditLoading(true)
    setAuditLogs([])
    setAuditCursor(null)
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    let q = buildAuditQuery()
      .gte('created_at', twoWeeksAgo)
      .limit(AUDIT_PAGE)
    const { data } = await q
    const rows = (data || []).filter(log => log.action !== 'sent_message')
    setAuditLogs(rows)
    setAuditHasMore(rows.length === AUDIT_PAGE)
    setAuditCursor(rows.length > 0 ? rows[rows.length - 1].created_at : null)
    setAuditLoading(false)
  }

  async function loadMoreAudit() {
    if (!auditCursor || auditLoadingMore) return
    setAuditLoadingMore(true)
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const { data } = await buildAuditQuery()
      .gte('created_at', twoWeeksAgo)
      .lt('created_at', auditCursor)
      .limit(AUDIT_PAGE)
    const rows = (data || []).filter(log => log.action !== 'sent_message')
    setAuditLogs(prev => [...prev, ...rows])
    setAuditHasMore(rows.length === AUDIT_PAGE)
    setAuditCursor(rows.length > 0 ? rows[rows.length - 1].created_at : null)
    setAuditLoadingMore(false)
  }

  function buildAuditQuery() {
    let q = supabase
      .from('audit_logs')
      .select('id, admin_id, action, target_type, target_id, target_name, details, created_at, admin:profiles!audit_logs_admin_id_fkey(full_name)')
      .order('created_at', { ascending: false })
    if (auditFilterAdmin)  q = q.eq('admin_id', auditFilterAdmin)
    if (auditFilterAction) q = q.eq('action', auditFilterAction)
    if (auditFilterFrom)   q = q.gte('created_at', auditFilterFrom + 'T00:00:00Z')
    if (auditFilterTo)     q = q.lte('created_at', auditFilterTo + 'T23:59:59Z')
    return q
  }

  // ── Volunteer detail — lazy loaders ────────────────────────────────────────
  async function loadRecentShiftsForVolunteer(volunteerId) {
    setLoadingRecentShifts(true)
    const { data } = await supabase
      .from('shifts')
      .select('id, clock_in, clock_out, role')
      .eq('volunteer_id', volunteerId)
      .not('clock_out', 'is', null)
      .order('clock_in', { ascending: false })
      .limit(10)
    setRecentShifts(data || [])
    setLoadingRecentShifts(false)
  }

  async function loadScheduledShiftsForVolunteer(volunteerId) {
    setLoadingScheduledShifts(true)
    const { data } = await supabase
      .from('schedule')
      .select('id, day_of_week, shift_time, role, week_pattern, start_date, end_date, notes')
      .eq('volunteer_id', volunteerId)
      .order('day_of_week')
    setScheduledShifts(data || [])
    setLoadingScheduledShifts(false)
  }

  // CHANGE: volunteer total hours now fetched on-demand when detail opens,
  // not pre-joined into every profiles row on the list load.
  async function loadVolunteerTotalHours(volunteerId) {
    setLoadingVolHours(true)
    const { data } = await supabase
      .from('shifts')
      .select('clock_in, clock_out')
      .eq('volunteer_id', volunteerId)
      .not('clock_out', 'is', null)
    const total = (data || []).reduce((acc, s) => acc + (asUTC(s.clock_out) - asUTC(s.clock_in)) / 3600000, 0).toFixed(1)
    setVolunteerTotalHours(total)
    setLoadingVolHours(false)
  }

  async function loadDateCoverShifts(date) {
    const { data } = await supabase
      .from('shifts')
      .select('id, volunteer_id, clock_in, profiles(id, full_name)')
      .gte('clock_in', date + 'T00:00:00Z')
      .lt('clock_in', date + 'T23:59:59Z')
    setDateCoverShifts(data || [])
  }

  // ── Tab switcher ────────────────────────────────────────────────────────────
  function switchTab(key) {
    setTab(key)
    setSelectedVolunteer(null)
    setAddingRole(null)
    if (!loadedTabs.current.has(key)) {
      loadedTabs.current.add(key)
      if (key === 'shifts') loadShiftsFirstPage()
      if (key === 'hours')  loadPendingHours()
      if (key === 'audit')  loadAuditFirstPage()
    }
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  // CHANGE: uses getSession() instead of getUser() — reads localStorage,
  // no network round-trip when token is fresh.
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { window.location.href = '/'; return }
      const { data: p } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, default_role')
        .eq('id', user.id).single()
      if (p?.role !== 'admin') { window.location.href = '/volunteer'; return }
      setProfile(p)
      await Promise.all([loadVolunteers(), loadActiveShifts(), loadCallouts(), loadSchedule(), loadCoverRequests()])
      setLoading(false)
    }
    init()
    const interval = setInterval(() => setCurrentTime(getMountainNow()), 60000)
    return () => clearInterval(interval)
  }, [])

  // ── Audit helper ────────────────────────────────────────────────────────────
  async function audit(action, target_type, target_id, target_name, details) {
    try {
      await supabase.from('audit_logs').insert({ admin_id: profile.id, action, target_type, target_id: target_id ? String(target_id) : null, target_name: target_name || null, details: details || null })
    } catch (e) { console.error('audit log failed:', e) }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function totalHours(shifts) {
    return (shifts || []).reduce((acc, s) => {
      if (!s.clock_out) return acc
      return acc + (asUTC(s.clock_out) - asUTC(s.clock_in)) / 3600000
    }, 0).toFixed(1)
  }
  function calcShiftHours(clock_in, clock_out) {
    if (!clock_out) return null
    return ((asUTC(clock_out) - asUTC(clock_in)) / 3600000).toFixed(1)
  }
  function showMessage(text, type) { setToast({ text, type }); setTimeout(() => setToast(null), 3500) }

  function getEntries(day, shift, role) {
    if (!scheduleDate) return schedule.filter(s => s.day_of_week === day && s.shift_time === shift && s.role === role)
    const d = new Date(scheduleDate + 'T12:00:00'); let count = 0; const target = d.getDay()
    const check = new Date(d.getFullYear(), d.getMonth(), 1)
    while (check <= d) { if (check.getDay() === target) count++; check.setDate(check.getDate() + 1) }
    return schedule.filter(s => {
      if (s.day_of_week !== day || s.shift_time !== shift || s.role !== role) return false
      if (s.start_date && s.start_date > scheduleDate) return false
      if (s.end_date   && s.end_date   < scheduleDate) return false
      if (s.week_pattern === 'odd'  && count % 2 !== 1) return false
      if (s.week_pattern === 'even' && count % 2 !== 0) return false
      return true
    })
  }

  const expectedVolunteers = (() => {
    const todayMtnStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
    const mtnNow = getMountainNow(); const dayIndex = mtnNow.getDay()
    const isWeekday = dayIndex >= 1 && dayIndex <= 5
    const h = mtnNow.getHours() + mtnNow.getMinutes() / 60
    const currentShift = h >= 10 && h < 14 ? '10-2' : h >= 14 && h < 18 ? '2-6' : null
    const currentDay = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dayIndex]
    if (!isWeekday || !currentShift) return []
    const calledOutIds = new Set(callouts.filter(c => c.callout_date === todayMtnStr && c.shift_time === currentShift && c.status === 'approved').map(c => c.volunteer_id))
    const coverIds = new Set(callouts.filter(c => c.callout_date === todayMtnStr && c.shift_time === currentShift && c.covered_by).map(c => c.covered_by))
    const scheduled = schedule.filter(s => s.day_of_week === currentDay && s.shift_time === currentShift && (!s.start_date || s.start_date <= todayMtnStr) && (!s.end_date || s.end_date >= todayMtnStr))
    const expectedIds = new Set([...scheduled.filter(s => !calledOutIds.has(s.volunteer_id)).map(s => s.volunteer_id), ...coverIds])
    const clockedInIds = new Set(activeShifts.map(s => s.profiles?.id).filter(Boolean))
    return [...expectedIds].filter(id => !clockedInIds.has(id)).map(id => {
      const vol = volunteers.find(v => v.id === id)
      const entry = scheduled.find(s => s.volunteer_id === id)
      if (!vol) return null
      return { ...vol, role: entry?.role || '—', notes: entry?.notes || null }
    }).filter(Boolean)
  })()

  function openVolunteer(v) {
    setTab('volunteers')
    setSelectedVolunteer(v)
    setEditForm({
      full_name: v.full_name||'', email: v.email||'', phone: v.phone||'',
      affiliation: v.affiliation||'', credentials: v.credentials||'',
      languages: v.languages||'', role: v.role||'volunteer',
      sma_name: v.sma_name||'', sma_contact: v.sma_contact||'',
      school: v.school||'', default_role: v.default_role||'', birthday: v.birthday||'',
      advisor_name: v.advisor_name||'', advisor_contact: v.advisor_contact||'',
      intern_school: v.intern_school||'', intern_department: v.intern_department||'',
      license_exp: v.license_exp||'', bls_exp: v.bls_exp||'',
      dea_exp: v.dea_exp||'', ftca_exp: v.ftca_exp||'', tb_exp: v.tb_exp||'',
    })
    setStatusForm({ status: v.status || 'active', status_reason: v.status_reason || '' })
    setEditing(false)
    setShowRecentShifts(false); setShowScheduledShifts(false)
    setRecentShifts([]); setScheduledShifts([])
    setVolunteerTotalHours(null)
    // CHANGE: fetch total hours immediately when opening a volunteer detail
    // (replaces the old shifts(*) join that ran for every volunteer in the list)
    loadVolunteerTotalHours(v.id)
  }

  function handleToggleRecentShifts(volunteerId) {
    if (!showRecentShifts) { setShowRecentShifts(true); loadRecentShiftsForVolunteer(volunteerId) }
    else setShowRecentShifts(false)
  }
  function handleToggleScheduledShifts(volunteerId) {
    if (!showScheduledShifts) { setShowScheduledShifts(true); loadScheduledShiftsForVolunteer(volunteerId) }
    else setShowScheduledShifts(false)
  }

  // ── Mutations ───────────────────────────────────────────────────────────────
  async function approveCallout(callout) {
    const { error } = await supabase.from('callouts').update({ status: 'approved', is_read: true }).eq('id', callout.id)
    if (error) showMessage(error.message, 'error')
    else { showMessage('Callout approved — shift is now open for coverage', 'success'); await audit('approved_callout', 'callout', callout.id, callout.profiles?.full_name, `${callout.callout_date} ${callout.shift_time}`); await loadCallouts() }
  }
  async function denyCallout(id) {
    const callout = callouts.find(c => c.id === id)
    const { error } = await supabase.from('callouts').update({ status: 'denied', is_read: true }).eq('id', id)
    if (error) showMessage(error.message, 'error')
    else { showMessage('Callout denied.', 'success'); await audit('denied_callout', 'callout', id, callout?.profiles?.full_name, `${callout?.callout_date} ${callout?.shift_time}`); await loadCallouts() }
  }
  async function approveCover(req) {
    setApprovingCoverId(req.id)
    const callout = callouts.find(c => c.id === req.callout_id)
    if (!callout) { showMessage('Callout not found', 'error'); setApprovingCoverId(null); return }
    await supabase.from('callouts').update({ covered_by: req.volunteer_id }).eq('id', req.callout_id)
    await supabase.from('shift_cover_requests').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', req.id)
    await supabase.from('shift_cover_requests').update({ status: 'denied', reviewed_at: new Date().toISOString() }).eq('callout_id', req.callout_id).neq('id', req.id)
    showMessage(`${req.profiles?.full_name} approved to cover shift!`, 'success')
    await audit('approved_cover', 'callout', req.callout_id, req.profiles?.full_name, `covering ${callout.callout_date} ${callout.shift_time}`)
    await loadCallouts(); await loadCoverRequests(); setApprovingCoverId(null)
  }
  async function denyCover(id) {
    setApprovingCoverId(id)
    const req = coverRequests.find(r => r.id === id)
    const { error } = await supabase.from('shift_cover_requests').update({ status: 'denied', reviewed_at: new Date().toISOString() }).eq('id', id)
    if (error) showMessage(error.message, 'error')
    else { showMessage('Cover request denied.', 'success'); await audit('denied_cover', 'callout', req?.callout_id, req?.profiles?.full_name); await loadCoverRequests() }
    setApprovingCoverId(null)
  }
  async function handleShiftEditSave(shiftId) {
    setSavingShift(true)
    const origClockIn  = toMountainInputValue(shiftEditForm.clock_in_utc)
    const origClockOut = toMountainInputValue(shiftEditForm.clock_out_utc)
    const clockIn  = shiftEditForm.clock_in  !== origClockIn  ? fromMountainInputValue(shiftEditForm.clock_in)  : shiftEditForm.clock_in_utc
    const clockOut = shiftEditForm.clock_out ? (shiftEditForm.clock_out !== origClockOut ? fromMountainInputValue(shiftEditForm.clock_out) : shiftEditForm.clock_out_utc) : null
    const shift = allShifts.find(s => s.id === shiftId)
    const { error } = await supabase.from('shifts').update({ clock_in: clockIn, clock_out: clockOut, role: shiftEditForm.role || null }).eq('id', shiftId)
    if (error) showMessage(error.message, 'error')
    else {
      showMessage('Shift updated!', 'success')
      await audit('edited_shift', 'shift', shiftId, shift?.profiles?.full_name, `${formatDateTime(clockIn)} → ${clockOut ? formatDateTime(clockOut) : 'active'}`)
      setEditingShiftId(null)
      // Refresh just the first page — don't reload entire list
      await loadShiftsFirstPage(shiftFilterVolId)
      await loadActiveShifts()
    }
    setSavingShift(false)
  }
  async function handleShiftDelete(shiftId) {
    if (!confirm('Delete this shift entry? This cannot be undone.')) return
    const shift = allShifts.find(s => s.id === shiftId)
    const { error } = await supabase.from('shifts').delete().eq('id', shiftId)
    if (error) showMessage(error.message, 'error')
    else {
      showMessage('Shift deleted.', 'success')
      await audit('deleted_shift', 'shift', shiftId, shift?.profiles?.full_name, `${formatDateTime(shift?.clock_in)}`)
      await loadShiftsFirstPage(shiftFilterVolId)
      await loadActiveShifts()
    }
  }
  async function approveHours(sub) {
    setApprovingHoursId(sub.id)
    const clockInUTC  = fromMountainInputValue(`${sub.work_date}T09:00`)
    const clockOutUTC = new Date(new Date(clockInUTC).getTime() + sub.hours * 3600000).toISOString()
    const { error: shiftErr } = await supabase.from('shifts').insert({ volunteer_id: sub.volunteer_id, clock_in: clockInUTC, clock_out: clockOutUTC, role: sub.role })
    if (shiftErr) { showMessage(shiftErr.message, 'error'); setApprovingHoursId(null); return }
    await supabase.from('hours_submissions').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', sub.id)
    showMessage('Hours approved and shift created!', 'success')
    await audit('approved_hours', 'hours', sub.id, sub.profiles?.full_name, `${sub.hours}h on ${sub.work_date} (${sub.role})`)
    // Move item from pending to top of reviewed list locally — no extra query
    setPendingHours(prev => prev.filter(h => h.id !== sub.id))
    setReviewedHours(prev => [{ ...sub, status: 'approved', reviewed_at: new Date().toISOString() }, ...prev])
    setApprovingHoursId(null)
  }
  async function rejectHours(id) {
    setApprovingHoursId(id)
    const sub = pendingHours.find(h => h.id === id)
    await supabase.from('hours_submissions').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', id)
    showMessage('Submission rejected.', 'success')
    await audit('rejected_hours', 'hours', id, sub?.profiles?.full_name, `${sub?.hours}h on ${sub?.work_date}`)
    // Move locally — no extra query
    setPendingHours(prev => prev.filter(h => h.id !== id))
    setReviewedHours(prev => [{ ...sub, status: 'rejected', reviewed_at: new Date().toISOString() }, ...prev])
    setApprovingHoursId(null)
  }
  async function handleCreateShift(e) {
    e.preventDefault()
    if (!newShiftForm.volunteer_id || !newShiftForm.clock_in) return
    setCreatingShift(true)
    const clockIn  = fromMountainInputValue(newShiftForm.clock_in)
    const clockOut = newShiftForm.clock_out ? fromMountainInputValue(newShiftForm.clock_out) : null
    const vol = volunteers.find(v => v.id === newShiftForm.volunteer_id)
    const { error } = await supabase.from('shifts').insert({ volunteer_id: newShiftForm.volunteer_id, clock_in: clockIn, clock_out: clockOut, role: newShiftForm.role || null })
    if (error) showMessage(error.message, 'error')
    else {
      showMessage('Shift entry created!', 'success')
      await audit('created_shift', 'shift', null, vol?.full_name, `${formatDateTime(clockIn)}`)
      setNewShiftForm({ volunteer_id: '', clock_in: '', clock_out: '', role: '' })
      setShowNewShiftForm(false)
      await loadShiftsFirstPage(shiftFilterVolId)
      await loadActiveShifts()
    }
    setCreatingShift(false)
  }
  async function handleAddEntry() {
    if (!addVolId) return; setAddingEntry(true)
    const currentEntries = getEntries(scheduleDay, scheduleShift, addingRole)
    const effectiveCount = currentEntries.reduce((sum, entry) => {
      if (addStartDate && entry.end_date && entry.end_date < addStartDate) return sum
      if (addEndDate && entry.start_date && entry.start_date > addEndDate) return sum
      return sum + (entry.week_pattern === 'every' ? 1 : 0.5)
    }, 0)
    const limit = ROLE_SUGGESTIONS[addingRole]
    if (limit && effectiveCount >= limit) { showMessage(`Limit reached for ${addingRole} (${limit})`, 'error'); setAddingEntry(false); return }
    const exists = schedule.find(s => {
      if (s.volunteer_id !== addVolId || s.day_of_week !== scheduleDay || s.shift_time !== scheduleShift || s.role !== addingRole) return false
      const aStart = s.start_date || '0000-01-01'; const aEnd = s.end_date || '9999-12-31'
      const bStart = addStartDate || '0000-01-01'; const bEnd = addEndDate || '9999-12-31'
      return aStart <= bEnd && bStart <= aEnd
    })
    if (exists) { showMessage('Volunteer already assigned to this slot', 'error'); setAddingEntry(false); return }
    const vol = volunteers.find(v => v.id === addVolId)
    const { error } = await supabase.from('schedule').insert({ volunteer_id: addVolId, day_of_week: scheduleDay, shift_time: scheduleShift, role: addingRole, start_date: addStartDate || null, end_date: addEndDate || null, week_pattern: addWeekPattern || 'every', notes: addNotes || null })
    if (error) showMessage(error.message, 'error')
    else {
      showMessage('Volunteer assigned!', 'success')
      await audit('assigned_schedule', 'schedule', null, vol?.full_name, `${scheduleDay} ${scheduleShift} — ${addingRole}`)
      setAddingRole(null); setAddVolId(''); setAddStartDate(''); setAddEndDate(''); setAddWeekPattern('every'); setAddNotes('')
      await loadSchedule()
    }
    setAddingEntry(false)
  }
  async function handleRemoveEntry(id) {
    const entry = schedule.find(s => s.id === id)
    const { error } = await supabase.from('schedule').delete().eq('id', id)
    if (error) showMessage(error.message, 'error')
    else {
      showMessage('Removed from schedule', 'success')
      await audit('removed_schedule', 'schedule', id, entry?.profiles?.full_name, `${entry?.day_of_week} ${entry?.shift_time} — ${entry?.role}`)
      await loadSchedule()
    }
  }
  async function handleStatusChange(newStatus, reason) {
    setChangingStatus(true)
    const volunteerId = selectedVolunteer.id
    const isDeactivating = newStatus === 'inactive'
    const { error } = await supabase.from('profiles').update({ status: newStatus, status_reason: isDeactivating ? (reason || null) : null, status_changed_at: new Date().toISOString() }).eq('id', volunteerId)
    if (error) { showMessage(error.message, 'error'); setChangingStatus(false); return }
    if (isDeactivating) {
      const { error: se } = await supabase.from('schedule').delete().eq('volunteer_id', volunteerId)
      if (se) { showMessage(se.message, 'error'); setChangingStatus(false); return }
    }
    const { data: fresh } = await supabase.from('profiles').select('id, full_name, email, phone, role, affiliation, status, status_reason, credentials, languages, default_role, school, major, sma_name, sma_contact, advisor_name, advisor_contact, intern_school, intern_department, license_exp, bls_exp, dea_exp, ftca_exp, tb_exp, birthday').eq('id', volunteerId).single()
    await audit(isDeactivating ? 'deactivated_volunteer' : 'reactivated_volunteer', 'volunteer', volunteerId, selectedVolunteer.full_name, reason || null)
    showMessage(isDeactivating ? 'Volunteer deactivated and removed from schedule.' : 'Volunteer reactivated!', 'success')
    setSelectedVolunteer(fresh); await loadVolunteers(); setChangingStatus(false)
  }
  async function handleSaveEdit() {
    setSaving(true)
    const isProvider = editForm.affiliation === 'provider'; const isIntern   = editForm.affiliation === 'intern'
    const isMission  = editForm.affiliation === 'missionary'; const isStudent = editForm.affiliation === 'student'
    const { error } = await supabase.from('profiles').update({
      full_name: editForm.full_name, phone: editForm.phone, affiliation: editForm.affiliation || null,
      credentials: editForm.credentials || null, languages: editForm.languages, role: editForm.role,
      sma_name: isMission ? (editForm.sma_name||null) : null, sma_contact: isMission ? (editForm.sma_contact||null) : null,
      school: isStudent ? (editForm.school||null) : null, major: isStudent ? (editForm.major||null) : null,
      advisor_name: isIntern ? (editForm.advisor_name||null) : null, advisor_contact: isIntern ? (editForm.advisor_contact||null) : null,
      intern_school: isIntern ? (editForm.intern_school||null) : null, intern_department: isIntern ? (editForm.intern_department||null) : null,
      license_exp: isProvider ? (editForm.license_exp||null) : null, bls_exp: isProvider ? (editForm.bls_exp||null) : null,
      dea_exp: isProvider ? (editForm.dea_exp||null) : null, ftca_exp: isProvider ? (editForm.ftca_exp||null) : null,
      tb_exp: isProvider ? (editForm.tb_exp||null) : null,
      default_role: editForm.default_role || null, birthday: editForm.birthday || null,
    }).eq('id', selectedVolunteer.id)
    if (error) { showMessage(error.message, 'error'); setSaving(false); return }
    const { data: fresh } = await supabase.from('profiles').select('id, full_name, email, phone, role, affiliation, status, status_reason, credentials, languages, default_role, school, major, sma_name, sma_contact, advisor_name, advisor_contact, intern_school, intern_department, license_exp, bls_exp, dea_exp, ftca_exp, tb_exp, birthday').eq('id', selectedVolunteer.id).single()
    showMessage('Profile updated!', 'success')
    await audit('edited_volunteer', 'volunteer', selectedVolunteer.id, selectedVolunteer.full_name)
    setEditing(false); setSelectedVolunteer(fresh); await loadVolunteers(); setSaving(false)
  }
  async function handleCreateVolunteer(e) {
    e.preventDefault(); setCreating(true)
    const isProvider = newAffiliation === 'provider'; const isIntern = newAffiliation === 'intern'
    const isMission  = newAffiliation === 'missionary'; const isStudent = newAffiliation === 'student'
    const { data, error } = await supabase.auth.signUp({ email: newEmail, password: newPassword })
    if (error) { showMessage(error.message, 'error'); setCreating(false); return }
    const { error: pe } = await supabase.from('profiles').insert({
      id: data.user.id, full_name: newName, email: newEmail, role: 'volunteer',
      affiliation: newAffiliation||null, credentials: newCredentials || null,
      phone: newPhone||null, languages: newLanguages||null,
      sma_name: isMission ? (newSmaName||null) : null, sma_contact: isMission ? (newSmaContact||null) : null,
      school: isStudent ? (newSchool||null) : null, major: isStudent ? (newMajor||null) : null,
      advisor_name: isIntern ? (newAdvisorName||null) : null, advisor_contact: isIntern ? (newAdvisorContact||null) : null,
      intern_school: isIntern ? (newInternSchool||null) : null, intern_department: isIntern ? (newInternDepartment||null) : null,
      license_exp: isProvider ? (newProviderCreds.license_exp||null) : null, bls_exp: isProvider ? (newProviderCreds.bls_exp||null) : null,
      dea_exp: isProvider ? (newProviderCreds.dea_exp||null) : null, ftca_exp: isProvider ? (newProviderCreds.ftca_exp||null) : null,
      tb_exp: isProvider ? (newProviderCreds.tb_exp||null) : null,
      birthday: newBirthday || null, default_role: newDefaultRole || null,
    })
    if (pe) showMessage(pe.message, 'error')
    else {
      showMessage(`Account created for ${newName}!`, 'success')
      await audit('created_volunteer', 'volunteer', data.user.id, newName, newRole)
      setNewName(''); setNewEmail(''); setNewPassword(''); setNewRole('volunteer')
      setNewAffiliation(''); setNewCredentials(''); setNewPhone(''); setNewLanguages('')
      setNewSmaName(''); setNewSmaContact(''); setNewSchool(''); setNewMajor('')
      setNewBirthday(''); setNewDefaultRole('')
      setNewAdvisorName(''); setNewAdvisorContact('')
      setNewInternSchool(''); setNewInternDepartment('')
      setNewProviderCreds({ license_exp: '', bls_exp: '', dea_exp: '', ftca_exp: '', tb_exp: '' })
      loadVolunteers()
    }
    setCreating(false)
  }

  // ── Derived lists ───────────────────────────────────────────────────────────
  const adminList = volunteers.filter(v => v.role === 'admin')
  const filteredShifts = shiftFilterVolId ? allShifts.filter(s => s.volunteer_id === shiftFilterVolId) : allShifts
  const userList = volunteers
    .filter(v => showInactive || (v.status || 'active') === 'active')
    .filter(v => {
      if (filterSearch) { const q = filterSearch.toLowerCase(); if (!(v.full_name || '').toLowerCase().includes(q) && !(v.email || '').toLowerCase().includes(q)) return false }
      if (filterRole !== 'all' && v.role !== filterRole) return false
      if (filterAffiliation !== 'all') {
        if (['missionary','student','volunteer','intern','provider'].includes(filterAffiliation) && v.affiliation !== filterAffiliation) return false
        if (filterAffiliation === 'BYU' && v.school !== 'BYU') return false
        if (filterAffiliation === 'UVU' && v.school !== 'UVU') return false
      }
      if (filterDefaultRole !== 'all' && v.default_role !== filterDefaultRole) return false
      return true
    })
    .sort((a, b) => { const ln = n => (n?.full_name?.split(' ').slice(-1)[0] || '').toLowerCase(); return ln(a).localeCompare(ln(b)) })

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <p style={{ color: 'var(--muted)' }}>Loading...</p>
    </div>
  )

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 600, letterSpacing: '-0.02em' }}>Admin Dashboard</h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Bingham Family Clinic &nbsp;·&nbsp;<span style={{ fontFamily: 'DM Mono, monospace' }}>{currentTime.toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit' })} {tzLabel}</span></p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={() => window.location.href = '/volunteer'} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem' }}>Volunteer View</button>
            <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/' }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem' }}>Sign out</button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Not Clocked In',  value: expectedVolunteers.length, warn: expectedVolunteers.length > 0 },
            { label: 'Pending Call-Outs', value: callouts.filter(c => !c.status || c.status === 'pending').length, warn: callouts.filter(c => !c.status || c.status === 'pending').length > 0 },
            { label: 'Pending Hours',   value: pendingHours.filter(h => !h.status || h.status === 'pending').length, warn: pendingHours.some(h => !h.status || h.status === 'pending') },
          ].map(s => (
            <div key={s.label} style={{ ...card, textAlign: 'center', borderColor: s.warn ? 'var(--warn)' : 'var(--border)' }}>
              <p style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: s.warn ? 'var(--warn)' : 'var(--text)' }}>{s.value}</p>
              <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {[
            ['dashboard', 'Live'], ['schedule', 'Scheduling'], ['lunch', 'Lunch'], ['volunteers', 'Volunteers'],
            ['pipeline', 'Pipeline'], ['shifts', 'Shifts'], ['callouts', 'Call-Outs'],
            ['hours', 'Hours'], ['audit', 'Recent Activity'], ['create', 'Add Volunteer'], ['data', 'Data'],
          ].map(([key, label]) => (
            <button key={key} onClick={() => switchTab(key)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: tab === key ? 'var(--accent)' : 'var(--surface)', color: tab === key ? '#fff' : 'var(--muted)', border: tab === key ? 'none' : '1px solid var(--border)' }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── LIVE TAB ──────────────────────────────────────────────────────── */}
        {tab === 'dashboard' && (() => {
          const todayMtnStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
          const mtnNow = getMountainNow(); const dayIndex = mtnNow.getDay(); const isWeekday = dayIndex >= 1 && dayIndex <= 5
          const h = mtnNow.getHours() + mtnNow.getMinutes() / 60
          const currentShift = h >= 10 && h < 14 ? '10-2' : h >= 14 && h < 18 ? '2-6' : null
          const currentDay = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dayIndex]
          const expectedVols = isWeekday && currentShift ? (() => {
            const calledOutIds = new Set(callouts.filter(c => c.callout_date === todayMtnStr && c.shift_time === currentShift && c.status === 'approved').map(c => c.volunteer_id))
            const coverIds = new Set(callouts.filter(c => c.callout_date === todayMtnStr && c.shift_time === currentShift && c.covered_by).map(c => c.covered_by))
            const scheduled = schedule.filter(s => s.day_of_week === currentDay && s.shift_time === currentShift && (!s.start_date || s.start_date <= todayMtnStr) && (!s.end_date || s.end_date >= todayMtnStr))
            const expectedIds = new Set([...scheduled.filter(s => !calledOutIds.has(s.volunteer_id)).map(s => s.volunteer_id), ...coverIds])
            const clockedInIds = new Set(activeShifts.map(s => s.profiles?.id).filter(Boolean))
            return [...expectedIds].filter(id => !clockedInIds.has(id)).map(id => { const vol = volunteers.find(v => v.id === id); const entry = scheduled.find(s => s.volunteer_id === id); if (!vol) return null; return { ...vol, role: entry?.role || '—', notes: entry?.notes || null } }).filter(Boolean)
          })() : []
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {isWeekday && currentShift && (
                <div style={{ ...card, borderColor: expectedVols.length > 0 ? 'var(--danger)' : 'rgba(2,65,107,0.4)', background: expectedVols.length > 0 ? 'rgba(239,68,68,0.03)' : 'rgba(2,65,107,0.03)' }}>
                  <h2 style={{ fontWeight: 600, marginBottom: expectedVols.length > 0 ? '1rem' : 0, fontSize: '1rem' }}>{expectedVols.length > 0 ? `${expectedVols.length} volunteer${expectedVols.length !== 1 ? 's' : ''} not yet clocked in — ${currentDay} ${currentShift}` : `All expected volunteers clocked in — ${currentDay} ${currentShift}`}</h2>
                  {expectedVols.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {expectedVols.map(v => (
                        <div key={v.id} onClick={() => openVolunteer(v)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.06)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'}>
                          <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{v.full_name}</span>
                          {v.notes && <span style={{ fontSize: '0.78rem', color: '#60a5fa', fontStyle: 'italic' }}>({v.notes})</span>}
                          <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{v.role}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div style={card}>
                <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Currently Clocked In</h2>
                {activeShifts.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No one is currently clocked in.</p> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {activeShifts.map(s => (
                      <div key={s.id} onClick={() => { const full = volunteers.find(v => v.id === s.profiles?.id); if (full) openVolunteer(full) }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(2,65,107,0.05)', borderRadius: '8px', border: '1px solid var(--accent)', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.opacity = '0.85'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
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
              {(() => {
                const todayMtn = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
                const todaysCallouts = callouts.filter(c => c.callout_date === todayMtn && c.status !== 'denied')
                return todaysCallouts.length > 0 && (
                  <div style={card}>
                    <h2 style={{ fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>Today's Call-Outs</span>
                      <span style={{ padding: '0.15rem 0.55rem', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 600, border: '1px solid rgba(96,165,250,0.3)' }}>{todaysCallouts.length}</span>
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {todaysCallouts.map(c => {
                        const isCovered = c.status === 'approved' && c.covered_by
                        const isOpen = c.status === 'approved' && !c.covered_by
                        return (
                          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.9rem', background: isCovered ? 'rgba(2,65,107,0.04)' : isOpen ? 'rgba(239,68,68,0.04)' : 'rgba(96,165,250,0.05)', borderRadius: '8px', border: `1px solid ${isCovered ? 'rgba(2,65,107,0.25)' : isOpen ? 'rgba(239,68,68,0.25)' : 'rgba(96,165,250,0.3)'}`, flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.profiles?.full_name}</span>
                              {c.shift_time && <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', padding: '0.15rem 0.5rem', borderRadius: '6px', border: '1px solid rgba(96,165,250,0.3)' }}>{c.day_of_week ? c.day_of_week.charAt(0).toUpperCase() + c.day_of_week.slice(1,3) + ' ' : ''}{c.shift_time}</span>}
                              <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '100px', fontWeight: 600, background: isCovered ? 'rgba(2,65,107,0.1)' : isOpen ? 'rgba(239,68,68,0.08)' : 'rgba(96,165,250,0.1)', color: isCovered ? 'var(--accent)' : isOpen ? '#ef4444' : '#60a5fa', border: `1px solid ${isCovered ? 'rgba(2,65,107,0.3)' : isOpen ? 'rgba(239,68,68,0.25)' : 'rgba(96,165,250,0.3)'}` }}>{isCovered ? 'covered' : isOpen ? 'open' : 'pending'}</span>
                              {c.reason && <span style={{ fontSize: '0.82rem', color: 'var(--muted)', fontStyle: 'italic' }}>{c.reason}</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
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
          )
        })()}

        {/* ── SCHEDULE TAB ──────────────────────────────────────────────────── */}
        {tab === 'schedule' && (
          <div>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {DAYS.map(d => (
                  <button key={d} onClick={() => { setScheduleDay(d); setAddingRole(null); setScheduleDate(''); setDateCoverShifts([]) }} style={{ ...pillBtn(scheduleDay === d, false), textTransform: 'capitalize' }}>{d.slice(0,3)}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {SHIFTS.map(sh => (
                  <button key={sh} onClick={() => { setScheduleShift(sh); setAddingRole(null); setScheduleDate(''); setDateCoverShifts([]) }} style={pillBtn(scheduleShift === sh, true)}>{sh}</button>
                ))}
              </div>
              <button onClick={() => { setShowWaitlist(o => !o); setShowClinicOpenings(false) }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: showWaitlist ? 'rgba(59,130,246,0.15)' : 'var(--surface)', color: showWaitlist ? '#3b82f6' : 'var(--muted)', border: showWaitlist ? '1px solid rgba(59,130,246,0.45)' : '1px solid var(--border)', transition: 'all 0.15s' }}>Waitlist</button>
              <button onClick={() => { setShowClinicOpenings(o => !o); setShowWaitlist(false) }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: showClinicOpenings ? 'rgba(251,191,36,0.15)' : 'var(--surface)', color: showClinicOpenings ? '#eab308' : 'var(--muted)', border: showClinicOpenings ? '1px solid rgba(251,191,36,0.45)' : '1px solid var(--border)', transition: 'all 0.15s' }}>Clinic Openings</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
                <label style={{ ...labelStyle, margin: 0, whiteSpace: 'nowrap' }}>View date:</label>
                <input type="date" value={scheduleDate} onChange={e => { const val = e.target.value; setScheduleDate(val); if (val) { loadDateCoverShifts(val); const d = new Date(val + 'T12:00:00'); const dayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][d.getDay()]; if (dayName !== 'sunday' && dayName !== 'saturday') setScheduleDay(dayName) } else { setDateCoverShifts([]) } }} style={{ ...inputStyle, width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }} />
              </div>
            </div>
            {showWaitlist && <div style={{ marginBottom: '1.25rem' }}><Waitlist supabase={supabase} profile={profile} /></div>}
            {showClinicOpenings && <div style={{ marginBottom: '1.25rem' }}><ClinicOpenings onClose={() => setShowClinicOpenings(false)} /></div>}
            {!showClinicOpenings && !showWaitlist && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {ROLES.map(role => {
                  const entries = getEntries(scheduleDay, scheduleShift, role)
                  const isOpen = addingRole === role
                  return (
                    <div key={role} style={{ ...card, padding: '1rem 1.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: entries.length > 0 || isOpen ? '0.75rem' : 0 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{role}{ROLE_SUGGESTIONS[role] ? ` — ${ROLE_SUGGESTIONS[role]}` : ''}</span>
                        <button onClick={() => { setAddingRole(isOpen ? null : role); setAddVolId('') }} style={{ padding: '0.3rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: isOpen ? 'var(--surface)' : 'rgba(2,65,107,0.12)', color: isOpen ? 'var(--muted)' : 'var(--accent)', border: `1px solid ${isOpen ? 'var(--border)' : 'var(--accent)'}` }}>{isOpen ? 'Cancel' : '+ Assign'}</button>
                      </div>
                      {entries.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: isOpen ? '0.75rem' : 0 }}>
                          {entries.map(entry => {
                            const approvedCallout = callouts.find(c => c.volunteer_id === entry.volunteer_id && c.callout_date === scheduleDate && c.shift_time === scheduleShift && c.status === 'approved')
                            const coverShift = approvedCallout && dateCoverShifts.find(s => s.volunteer_id === approvedCallout.covered_by)
                            const coverName = coverShift ? coverShift.profiles?.full_name : null
                            return (
                              <div key={entry.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.6rem 0.3rem 0.75rem', borderRadius: '100px', fontSize: '0.85rem', background: approvedCallout ? 'rgba(96,165,250,0.08)' : 'rgba(2,65,107,0.08)', border: `1px solid ${approvedCallout ? 'rgba(96,165,250,0.4)' : 'rgba(2,65,107,0.35)'}`, color: approvedCallout ? 'var(--warn)' : 'var(--text)' }}>
                                  {approvedCallout && <span style={{ fontSize: '0.7rem' }}>out</span>}
                                  <span style={{ textDecoration: approvedCallout ? 'line-through' : 'none', opacity: approvedCallout ? 0.6 : 1 }}>{entry.profiles?.full_name}</span>
                                  {entry.notes && <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontStyle: 'italic' }}>({entry.notes})</span>}
                                  {(entry.start_date || entry.end_date) && <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontStyle: 'italic' }}>({entry.start_date ?? '...'} → {entry.end_date ?? '...'})</span>}
                                  {entry.week_pattern && entry.week_pattern !== 'every' && <span style={{ fontSize: '0.65rem', background: 'rgba(96,165,250,0.15)', color: '#60a5fa', borderRadius: '4px', padding: '0.1rem 0.35rem' }}>{entry.week_pattern === 'odd' ? '1st&3rd' : '2nd&4th'}</span>}
                                  <button onClick={() => handleRemoveEntry(entry.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.75rem', padding: '0 2px' }}>✕</button>
                                </div>
                                {coverName && <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.25rem 0.6rem 0.25rem 0.75rem', borderRadius: '100px', fontSize: '0.82rem', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.35)', color: '#60a5fa', marginLeft: '0.5rem' }}><span style={{ fontSize: '0.7rem' }}>cover</span><span>{coverName}</span></div>}
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {isOpen && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          <select value={addVolId} onChange={e => setAddVolId(e.target.value)} style={inputStyle}><option value="">— Select volunteer —</option>{userList.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}</select>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {[{ value: 'every', label: 'Every week' }, { value: 'odd', label: '1st & 3rd' }, { value: 'even', label: '2nd & 4th' }].map(opt => (<button key={opt.value} type="button" onClick={() => setAddWeekPattern(opt.value)} style={{ ...pillBtn(addWeekPattern === opt.value, false), fontSize: '0.78rem', padding: '0.3rem 0.75rem' }}>{opt.label}</button>))}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            <div><label style={labelStyle}>Start date <span style={{ textTransform: 'none', color: 'var(--muted)', fontSize: '0.72rem' }}>(optional)</span></label><input type="date" value={addStartDate} onChange={e => setAddStartDate(e.target.value)} style={{ ...inputStyle, fontSize: '0.85rem', padding: '0.5rem 0.75rem' }} /></div>
                            <div><label style={labelStyle}>End date <span style={{ textTransform: 'none', color: 'var(--muted)', fontSize: '0.72rem' }}>(optional)</span></label><input type="date" value={addEndDate} onChange={e => setAddEndDate(e.target.value)} style={{ ...inputStyle, fontSize: '0.85rem', padding: '0.5rem 0.75rem' }} /></div>
                          </div>
                          <div><label style={labelStyle}>Schedule note <span style={{ textTransform: 'none', color: 'var(--muted)', fontSize: '0.72rem' }}>(optional)</span></label><input type="text" value={addNotes} onChange={e => setAddNotes(e.target.value)} placeholder="e.g. arriving late" style={{ ...inputStyle, fontSize: '0.85rem', padding: '0.5rem 0.75rem' }} /></div>
                          <button onClick={handleAddEntry} disabled={!addVolId || addingEntry} style={{ padding: '0.75rem 1.25rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{addingEntry ? '...' : 'Assign'}</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── VOLUNTEERS LIST ────────────────────────────────────────────────── */}
        {tab === 'volunteers' && !selectedVolunteer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <ProviderCredentialsSummaryBanner volunteers={volunteers} onSelect={openVolunteer} />
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <button onClick={() => setFiltersOpen(o => !o)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Filters</span>
                <span style={{ transform: filtersOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--muted)' }}>▾</span>
              </button>
              {filtersOpen && (
                <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <input placeholder="Search name or email…" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                    <select value={filterAffiliation} onChange={e => setFilterAffiliation(e.target.value)} style={inputStyle}><option value="all">All affiliations</option><option value="missionary">Missionary</option><option value="student">Student</option><option value="volunteer">Volunteer</option><option value="intern">Intern</option><option value="provider">Provider</option><option value="BYU">BYU</option><option value="UVU">UVU</option></select>
                    <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={inputStyle}><option value="all">All roles</option><option value="volunteer">Volunteer</option><option value="admin">Admin</option></select>
                    <select value={filterDefaultRole} onChange={e => setFilterDefaultRole(e.target.value)} style={inputStyle}><option value="all">All positions</option>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select>
                    <button onClick={() => setShowInactive(s => !s)} style={pillBtn(showInactive, false)}>{showInactive ? 'Hide Inactive' : 'Show Inactive'}</button>
                  </div>
                </div>
              )}
            </div>
            <ExpandableSection label="Volunteers" isOpen={volunteersOpen} onToggle={() => setVolunteersOpen(o => !o)} count={userList.length}>
              {userList.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontStyle: 'italic' }}>No volunteers match these filters.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {userList.map(v => {
                    const isInactive = (v.status ?? 'active') === 'inactive'
                    return (
                      <div key={v.id} onClick={() => openVolunteer(v)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', background: isInactive ? 'rgba(156,163,175,0.06)' : 'var(--bg)', cursor: 'pointer', opacity: isInactive ? 0.7 : 1 }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: isInactive ? 'var(--muted)' : 'var(--accent)' }}>{v.full_name?.charAt(0)}</div>
                          <div><p style={{ fontWeight: 500 }}>{v.full_name}</p><p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{v.email}</p></div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                          {isInactive && <span style={badgeStyle('#9ca3af')}>inactive</span>}
                          {v.role === 'admin' && <span style={badgeStyle('#f59e0b')}>admin</span>}
                          {v.affiliation && <span style={badgeStyle(affiliationColor[v.affiliation] ?? '#9ca3af')}>{v.affiliation}</span>}
                          <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--muted)', fontSize: '0.8rem' }}>›</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </ExpandableSection>
          </div>
        )}

        {/* ── VOLUNTEER DETAIL ───────────────────────────────────────────────── */}
        {tab === 'volunteers' && selectedVolunteer && (
          <div style={card}>
            <button onClick={() => setSelectedVolunteer(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.875rem', marginBottom: '1.25rem', padding: 0, fontFamily: 'DM Sans, sans-serif' }}>← Back</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.3rem', color: 'var(--accent)', border: '2px solid var(--accent)' }}>{selectedVolunteer.full_name?.charAt(0)}</div>
                <div>
                  <h2 style={{ fontWeight: 600, fontSize: '1.2rem' }}>{selectedVolunteer.full_name}</h2>
                  <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{selectedVolunteer.email}</p>
                  {/* CHANGE: total hours now shown here, loaded on demand */}
                  <p style={{ fontSize: '0.8rem', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', marginTop: '0.2rem' }}>
                    {loadingVolHours ? 'Loading hours…' : volunteerTotalHours !== null ? `${volunteerTotalHours}h total` : ''}
                  </p>
                </div>
              </div>
              <button onClick={() => setEditing(!editing)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: editing ? 'var(--surface)' : 'var(--accent)', color: editing ? 'var(--muted)' : '#0a0f0a', border: editing ? '1px solid var(--border)' : 'none' }}>{editing ? 'Cancel' : 'Edit'}</button>
            </div>

            {!editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {[
                    { label: 'Phone', value: selectedVolunteer.phone },
                    { label: 'Affiliation', value: selectedVolunteer.affiliation },
                    { label: 'Credentials / Skills', value: selectedVolunteer.credentials },
                    { label: 'Languages', value: selectedVolunteer.languages },
                    { label: 'Role', value: selectedVolunteer.role },
                    { label: 'Default Position', value: selectedVolunteer.default_role },
                    { label: 'Birthday', value: selectedVolunteer.birthday },
                    ...(selectedVolunteer.affiliation === 'missionary' ? [{ label: 'SMA Name', value: selectedVolunteer.sma_name }, { label: 'SMA Contact', value: selectedVolunteer.sma_contact }] : []),
                    ...(selectedVolunteer.affiliation === 'intern' ? [{ label: 'Advisor Name', value: selectedVolunteer.advisor_name }, { label: 'Advisor Contact', value: selectedVolunteer.advisor_contact }, { label: 'School', value: selectedVolunteer.intern_school }, { label: 'Dept / Company', value: selectedVolunteer.intern_department }] : []),
                    ...(selectedVolunteer.affiliation === 'student' ? [{ label: 'School', value: selectedVolunteer.school }, { label: 'Major', value: selectedVolunteer.major }] : [])
                  ].map(({ label, value }) => (
                    <div key={label} style={{ padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>{label}</p>
                      <p style={{ fontWeight: 500, color: value ? 'var(--text)' : 'var(--muted)', fontStyle: value ? 'normal' : 'italic' }}>{value || 'Not set'}</p>
                    </div>
                  ))}
                  {selectedVolunteer.affiliation === 'provider' && <ProviderCredentialsView vol={selectedVolunteer} />}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button onClick={() => handleToggleRecentShifts(selectedVolunteer.id)} style={{ flex: 1, minWidth: '180px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '10px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: showRecentShifts ? 'rgba(2,65,107,0.08)' : 'var(--bg)', border: `1px solid ${showRecentShifts ? 'var(--accent)' : 'var(--border)'}`, color: showRecentShifts ? 'var(--accent)' : 'var(--text)', transition: 'all 0.15s' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}><span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Recent Shifts</span><span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>last 10</span></div>
                      <span style={{ display: 'inline-block', transform: showRecentShifts ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--muted)', fontSize: '1rem' }}>›</span>
                    </button>
                    <button onClick={() => handleToggleScheduledShifts(selectedVolunteer.id)} style={{ flex: 1, minWidth: '180px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '10px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: showScheduledShifts ? 'rgba(2,65,107,0.08)' : 'var(--bg)', border: `1px solid ${showScheduledShifts ? 'var(--accent)' : 'var(--border)'}`, color: showScheduledShifts ? 'var(--accent)' : 'var(--text)', transition: 'all 0.15s' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}><span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Schedule</span><span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>recurring</span></div>
                      <span style={{ display: 'inline-block', transform: showScheduledShifts ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--muted)', fontSize: '1rem' }}>›</span>
                    </button>
                  </div>
                  {showRecentShifts && (
                    <div style={{ borderRadius: '10px', border: '1px solid var(--accent)', overflow: 'hidden', background: 'var(--bg)' }}>
                      <div style={{ padding: '0.65rem 1rem', background: 'rgba(2,65,107,0.06)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)' }}>Recent Shifts</span>
                        {!loadingRecentShifts && <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>{recentShifts.length} shown</span>}
                        {loadingRecentShifts && <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Loading…</span>}
                      </div>
                      {loadingRecentShifts ? <div style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.85rem' }}>Loading…</div> : recentShifts.length === 0 ? <div style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>No completed shifts on record.</div> : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {recentShifts.map((s, i) => {
                            const hours = calcShiftHours(s.clock_in, s.clock_out)
                            return (
                              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 1rem', borderBottom: i < recentShifts.length - 1 ? '1px solid var(--border)' : 'none', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <div><p style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.82rem', color: 'var(--text)' }}>{formatDateTime(s.clock_in)}</p>{s.role && <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.15rem' }}>{s.role}</p>}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>{hours && <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.88rem', fontWeight: 600, color: 'var(--accent)' }}>{hours}h</span>}</div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  {showScheduledShifts && (
                    <div style={{ borderRadius: '10px', border: '1px solid var(--accent)', overflow: 'hidden', background: 'var(--bg)' }}>
                      <div style={{ padding: '0.65rem 1rem', background: 'rgba(2,65,107,0.06)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)' }}>Recurring Schedule</span>
                        {!loadingScheduledShifts && <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>{scheduledShifts.length} slot{scheduledShifts.length !== 1 ? 's' : ''}</span>}
                        {loadingScheduledShifts && <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Loading…</span>}
                      </div>
                      {loadingScheduledShifts ? <div style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.85rem' }}>Loading…</div> : scheduledShifts.length === 0 ? <div style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>Not assigned to any recurring shifts.</div> : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {[...scheduledShifts].sort((a, b) => (DAY_ORDER[a.day_of_week] ?? 9) - (DAY_ORDER[b.day_of_week] ?? 9) || a.shift_time.localeCompare(b.shift_time)).map((s, i) => (
                            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 1rem', borderBottom: i < scheduledShifts.length - 1 ? '1px solid var(--border)' : 'none', gap: '0.75rem', flexWrap: 'wrap' }}>
                              <div><p style={{ fontWeight: 500, fontSize: '0.88rem', textTransform: 'capitalize' }}>{s.day_of_week}</p><p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.1rem' }}>{s.role || 'No role'}</p></div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.82rem', background: 'rgba(2,65,107,0.1)', color: 'var(--accent)', padding: '0.2rem 0.55rem', borderRadius: '6px', border: '1px solid rgba(2,65,107,0.3)' }}>{s.shift_time}</span>
                                {s.week_pattern && s.week_pattern !== 'every' && <span style={{ fontSize: '0.72rem', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', padding: '0.15rem 0.45rem', borderRadius: '5px', border: '1px solid rgba(96,165,250,0.3)' }}>{s.week_pattern === 'odd' ? '1st & 3rd' : '2nd & 4th'}</span>}
                                {s.notes && <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontStyle: 'italic' }}>({s.notes})</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Status control */}
                {(() => {
                  const isInactive = (selectedVolunteer.status || 'active') === 'inactive'
                  return (
                    <div style={{ padding: '1rem 1.25rem', borderRadius: '8px', border: `1px solid ${isInactive ? 'rgba(156,163,175,0.4)' : 'rgba(2,65,107,0.35)'}`, background: isInactive ? 'rgba(156,163,175,0.06)' : 'rgba(2,65,107,0.04)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div>
                          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Status</p>
                          <p style={{ fontWeight: 600, color: isInactive ? 'var(--muted)' : 'var(--accent)' }}>{isInactive ? 'Inactive' : 'Active'}</p>
                          {isInactive && selectedVolunteer.status_reason && <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: '0.25rem', fontStyle: 'italic' }}>Reason: {selectedVolunteer.status_reason}</p>}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '200px' }}>
                          {!isInactive && <select value={statusForm.status_reason} onChange={e => setStatusForm({ ...statusForm, status_reason: e.target.value })} style={{ ...inputStyle, fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}><option value="">— Reason for deactivating —</option><option value="Graduated">Graduated</option><option value="Mission / Service Term Ended">Mission / Service Term Ended</option><option value="Schedule Conflict">Schedule Conflict</option><option value="Moved Away">Moved Away</option><option value="Personal / Unknown">Personal / Unknown</option></select>}
                          <button onClick={() => handleStatusChange(isInactive ? 'active' : 'inactive', statusForm.status_reason)} disabled={changingStatus || (!isInactive && !statusForm.status_reason)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: (changingStatus || (!isInactive && !statusForm.status_reason)) ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', border: 'none', background: isInactive ? 'var(--accent)' : '#dc2626', color: isInactive ? '#0a0f0a' : '#fff', opacity: (!isInactive && !statusForm.status_reason) ? 0.5 : 1 }}>{changingStatus ? 'Saving...' : isInactive ? 'Reactivate' : 'Deactivate'}</button>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div><label style={labelStyle}>Full Name</label><input value={editForm.full_name} onChange={e => setEditForm({...editForm, full_name: e.target.value})} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Phone</label><input value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} placeholder="xxx-xxx-xxxx" style={inputStyle} /></div>
                  <div><label style={labelStyle}>Affiliation</label><select value={editForm.affiliation} onChange={e => setEditForm({...editForm, affiliation: e.target.value})} style={inputStyle}><option value="">— Select —</option><option value="missionary">Missionary</option><option value="intern">Intern</option><option value="student">Student</option><option value="volunteer">Volunteer</option><option value="provider">Provider</option></select></div>
                  <div><label style={labelStyle}>Credentials / Skills</label><input type="text" value={editForm.credentials} onChange={e => setEditForm({...editForm, credentials: e.target.value})} placeholder="e.g. EMT, Phlebotomy" style={inputStyle} /></div>                
                  <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Languages</label><input value={editForm.languages} onChange={e => setEditForm({...editForm, languages: e.target.value})} placeholder="e.g. Spanish, French" style={inputStyle} /></div>
                  {profile?.default_role === 'Director' && (  
                    <div><label style={labelStyle}>Role</label><select value={editForm.role} onChange={e => setEditForm({...editForm, role: e.target.value})} style={inputStyle}><option value="volunteer">Volunteer</option><option value="admin">Admin</option></select></div>
                  )}
                  {!profile?.default_role === 'Director' && (
                    <div>
                      <label style={labelStyle}>Role</label>
                      <p style={{ padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', fontSize: '0.95rem' }}>{editForm.role}</p>
                    </div>
                  )}                  
                  <div><label style={labelStyle}>Default Position</label><select value={editForm.default_role} onChange={e => setEditForm({...editForm, default_role: e.target.value})} style={inputStyle}><option value="">— None —</option>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                  <div><label style={labelStyle}>Birthday</label><input type="date" value={editForm.birthday || ''} onChange={e => setEditForm({ ...editForm, birthday: e.target.value })} style={inputStyle} /></div>
                  {editForm.affiliation === 'missionary' && (<><div><label style={labelStyle}>SMA Name</label><input value={editForm.sma_name} onChange={e => setEditForm({...editForm, sma_name: e.target.value})} placeholder="SMA full name" style={inputStyle} /></div><div><label style={labelStyle}>SMA Contact</label><input value={editForm.sma_contact} onChange={e => setEditForm({...editForm, sma_contact: e.target.value})} placeholder="Phone or email" style={inputStyle} /></div></>)}
                  {editForm.affiliation === 'intern' && (<><div><label style={labelStyle}>Advisor Name</label><input value={editForm.advisor_name} onChange={e => setEditForm({...editForm, advisor_name: e.target.value})} placeholder="Advisor full name" style={inputStyle} /></div><div><label style={labelStyle}>Advisor Contact</label><input value={editForm.advisor_contact} onChange={e => setEditForm({...editForm, advisor_contact: e.target.value})} placeholder="Phone or email" style={inputStyle} /></div><div><label style={labelStyle}>School</label><input value={editForm.intern_school} onChange={e => setEditForm({...editForm, intern_school: e.target.value})} placeholder="University or institution" style={inputStyle} /></div><div><label style={labelStyle}>Dept / Company</label><input value={editForm.intern_department} onChange={e => setEditForm({...editForm, intern_department: e.target.value})} placeholder="Department or company name" style={inputStyle} /></div></>)}
                  {editForm.affiliation === 'student' && (<><div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>School</label><select value={editForm.school} onChange={e => setEditForm({...editForm, school: e.target.value})} style={inputStyle}><option value="">— Select school —</option>{SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}</select></div><div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Major</label><select value={editForm.major || ''} onChange={e => setEditForm({...editForm, major: e.target.value})} style={inputStyle}><option value="">— Select major —</option>{MAJORS.map(m => <option key={m} value={m}>{m}</option>)}</select></div></>)}
                  {editForm.affiliation === 'provider' && (
                    <div style={{ gridColumn: '1 / -1', padding: '1rem 1.25rem', borderRadius: '10px', border: '1px solid rgba(125,211,252,0.4)', background: 'rgba(125,211,252,0.04)' }}>
                      <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#7dd3fc', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.85rem' }}>Credential Expiration Dates</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
                        {PROVIDER_CRED_FIELDS.map(f => (
                          <CredentialInput key={f.key} fieldKey={f.key} label={f.label} value={editForm[f.key] || ''} onChange={val => setEditForm({ ...editForm, [f.key]: val })} allowNA={f.key === 'dea_exp'} inputStyle={inputStyle} labelStyle={labelStyle} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <button onClick={handleSaveEdit} disabled={saving} style={{ padding: '0.85rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{saving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            )}
          </div>
        )}

        {/* ── PIPELINE ──────────────────────────────────────────────────────── */}
        {tab === 'pipeline' && <Pipeline supabase={supabase} profile={profile} onVolunteerCreated={() => loadVolunteers()} />}

        {/* ── SHIFTS TAB — paginated ─────────────────────────────────────────── */}
        {tab === 'shifts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {showNewShiftForm && (
              <div style={{ ...card, borderColor: 'var(--accent)', background: 'rgba(2,65,107,0.04)' }}>
                <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>New Shift Entry</h2>
                <form onSubmit={handleCreateShift} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div><label style={labelStyle}>Volunteer</label><select value={newShiftForm.volunteer_id} onChange={e => setNewShiftForm({ ...newShiftForm, volunteer_id: e.target.value })} required style={inputStyle}><option value="">— Select volunteer —</option>{userList.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}</select></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div><label style={labelStyle}>Clock In ({tzLabel})</label><input type="datetime-local" value={newShiftForm.clock_in} onChange={e => setNewShiftForm({ ...newShiftForm, clock_in: e.target.value })} required style={inputStyle} /></div>
                    <div><label style={labelStyle}>Clock Out ({tzLabel})</label><input type="datetime-local" value={newShiftForm.clock_out} onChange={e => setNewShiftForm({ ...newShiftForm, clock_out: e.target.value })} style={inputStyle} /></div>
                  </div>
                  <div><label style={labelStyle}>Position</label><select value={newShiftForm.role} onChange={e => setNewShiftForm({ ...newShiftForm, role: e.target.value })} style={inputStyle}><option value="">— No role —</option>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button type="submit" disabled={creatingShift} style={{ flex: 1, padding: '0.85rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: creatingShift ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{creatingShift ? 'Creating...' : 'Create Entry'}</button>
                    <button type="button" onClick={() => { setShowNewShiftForm(false); setNewShiftForm({ volunteer_id: '', clock_in: '', clock_out: '', role: '' }) }} style={{ padding: '0.85rem 1.25rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Cancel</button>
                  </div>
                </form>
              </div>
            )}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <h2 style={{ fontWeight: 600 }}>Shift Entries <span style={{ marginLeft: '0.5rem', color: 'var(--muted)', fontWeight: 400, fontSize: '0.85rem' }}>— {SHIFTS_PAGE} at a time</span></h2>
                <button onClick={() => { setShowNewShiftForm(true); setEditingShiftId(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', background: 'rgba(2,65,107,0.12)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem' }}>+ New Entry</button>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Filter by volunteer</label>
                <select value={shiftFilterVolId} onChange={e => { setShiftFilterVolId(e.target.value); loadShiftsFirstPage(e.target.value) }} style={{ ...inputStyle, maxWidth: '320px' }}>
                  <option value="">All volunteers</option>
                  {volunteers.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}
                </select>
              </div>
              {shiftsLoading ? <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading shifts...</p> : filteredShifts.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No shift entries found.</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {filteredShifts.map(s => {
                    const isEditing = editingShiftId === s.id
                    const hours = calcShiftHours(s.clock_in, s.clock_out)
                    return (
                      <div key={s.id} style={{ padding: '0.85rem 1rem', background: 'var(--bg)', borderRadius: '10px', border: `1px solid ${isEditing ? 'var(--accent)' : 'var(--border)'}` }}>
                        {!isEditing ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent)', flexShrink: 0 }}>{s.profiles?.full_name?.charAt(0)}</div>
                              <div>
                                <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>{s.profiles?.full_name}</p>
                                <p style={{ color: 'var(--muted)', fontSize: '0.8rem', fontFamily: 'DM Mono, monospace' }}>{formatDateTime(s.clock_in)} → {s.clock_out ? formatDateTime(s.clock_out) : <span style={{ color: 'var(--accent)' }}>active</span>}</p>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              {s.role ? <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '100px', background: 'rgba(2,65,107,0.1)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.35)', fontWeight: 500 }}>{s.role}</span> : <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '100px', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', fontStyle: 'italic' }}>no role</span>}
                              {hours !== null ? <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.9rem', color: 'var(--accent)', fontWeight: 600 }}>{hours}h</span> : <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--accent)', background: 'rgba(2,65,107,0.1)', padding: '0.2rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(2,65,107,0.35)' }}>active</span>}
                              <button onClick={() => { setEditingShiftId(s.id); setShiftEditForm({ clock_in: toMountainInputValue(s.clock_in), clock_out: toMountainInputValue(s.clock_out), role: s.role || '', clock_in_utc: s.clock_in, clock_out_utc: s.clock_out || '' }) }} style={{ padding: '0.3rem 0.7rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Edit</button>
                              <button onClick={() => handleShiftDelete(s.id)} style={{ padding: '0.3rem 0.7rem', background: 'rgba(248,113,113,0.08)', color: 'var(--danger)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Delete</button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.75rem', color: 'var(--accent)' }}>Editing: {s.profiles?.full_name}</p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                              <div><label style={labelStyle}>Clock In ({tzLabel})</label><input type="datetime-local" value={shiftEditForm.clock_in} onChange={e => setShiftEditForm({ ...shiftEditForm, clock_in: e.target.value })} style={inputStyle} /></div>
                              <div><label style={labelStyle}>Clock Out ({tzLabel})</label><input type="datetime-local" value={shiftEditForm.clock_out} onChange={e => setShiftEditForm({ ...shiftEditForm, clock_out: e.target.value })} style={inputStyle} /></div>
                            </div>
                            <div style={{ marginBottom: '0.75rem' }}><label style={labelStyle}>Position</label><select value={shiftEditForm.role} onChange={e => setShiftEditForm({ ...shiftEditForm, role: e.target.value })} style={inputStyle}><option value="">— No role —</option>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button onClick={() => handleShiftEditSave(s.id)} disabled={savingShift} style={{ padding: '0.55rem 1.1rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '7px', fontWeight: 600, cursor: savingShift ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem' }}>{savingShift ? 'Saving...' : 'Save'}</button>
                              <button onClick={() => setEditingShiftId(null)} style={{ padding: '0.55rem 1rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '7px', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem' }}>Cancel</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <LoadMoreButton onClick={loadMoreShifts} loading={shiftsLoadingMore} hasMore={shiftsHasMore} label={`Load ${SHIFTS_PAGE} more shifts`} />
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'callouts' && (() => {
          const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
          const pendingCallouts  = callouts.filter(c => (!c.status || c.status === 'pending') && c.callout_date >= todayStr)
          const approvedCallouts = [...callouts.filter(c => c.status === 'approved' && !c.covered_by && c.callout_date >= todayStr)]
            .sort((a, b) => {
              const aPending = coverRequests.filter(r => r.callout_id === a.id && r.status === 'pending').length
              const bPending = coverRequests.filter(r => r.callout_id === b.id && r.status === 'pending').length
              return bPending - aPending
            })
          const closedCallouts   = callouts.filter(c => c.status === 'denied' || (c.status === 'approved' && c.covered_by))
          const pendingCovers    = coverRequests.filter(r => r.status === 'pending')
        
          // Sort pending callouts: those with a pending cover request float to top
          const sortedPendingCallouts = [...pendingCallouts].sort((a, b) => {
            const aHasCover = coverRequests.some(r => r.callout_id === a.id && r.status === 'pending') ? 0 : 1
            const bHasCover = coverRequests.some(r => r.callout_id === b.id && r.status === 'pending') ? 0 : 1
            return aHasCover - bHasCover
          })
        
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        
              {/* ── Pending Call-Outs (collapsible) ── */}
              <div style={card}>
                <button
                  onClick={() => setPendingCalloutsOpen(o => !o)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', padding: 0, marginBottom: pendingCalloutsOpen ? '1.25rem' : 0 }}
                >
                  <h2 style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                    Pending Call-Outs
                  </h2>
                  <span style={{ color: 'var(--muted)', fontSize: '0.85rem', transform: pendingCalloutsOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▾</span>
                </button>
        
                {pendingCalloutsOpen && (
                  pendingCallouts.length === 0
                    ? <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No pending call-outs.</p>
                    : <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {sortedPendingCallouts.map(c => {
                          const pendingCoverReqs = coverRequests.filter(r => r.callout_id === c.id && r.status === 'pending')
                          const hasCoverRequest  = pendingCoverReqs.length > 0
                          return (
                            <div key={c.id} style={{ padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: `1px solid ${hasCoverRequest ? 'rgba(34,197,94,0.4)' : 'rgba(96,165,250,0.35)'}` }}>
                              {hasCoverRequest && (
                                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
                                  ✦ Volunteer ready to cover
                                </p>
                              )}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div>
                                  <span style={{ fontWeight: 600 }}>{c.profiles?.full_name}</span>
                                  <span style={{ marginLeft: '0.5rem', fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'capitalize' }}>
                                    {c.callout_date} · {c.day_of_week} {c.shift_time}
                                  </span>
                                  {c.role && (
                                    <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: 'rgba(2,65,107,0.1)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.35)' }}>
                                      {c.role}
                                    </span>
                                  )}
                                  {c.reason && (
                                    <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: '0.25rem', fontStyle: 'italic' }}>{c.reason}</p>
                                  )}
                                  {/* Show who wants to cover, right here for quick approval */}
                                  {hasCoverRequest && (
                                    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                      {pendingCoverReqs.map(r => {
                                        const vol = coverRequests.find(cr => cr.id === r.id)
                                        const name = r.profiles?.full_name || volunteers.find(v => v.id === r.volunteer_id)?.full_name
                                        return (
                                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.82rem', color: '#22c55e', fontWeight: 500 }}>{name} wants to cover</span>
                                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                                              <button
                                                onClick={() => approveCover(r)}
                                                disabled={approvingCoverId === r.id}
                                                style={{ padding: '0.2rem 0.65rem', background: 'rgba(34,197,94,0.12)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.35)', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
                                              >
                                                {approvingCoverId === r.id ? '...' : '✓ Assign'}
                                              </button>
                                              <button
                                                onClick={() => denyCover(r.id)}
                                                disabled={approvingCoverId === r.id}
                                                style={{ padding: '0.2rem 0.65rem', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                  <button onClick={() => approveCallout(c)} style={{ padding: '0.3rem 0.8rem', background: 'rgba(2,65,107,0.12)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.35)', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>✓ Approve</button>
                                  <button onClick={() => denyCallout(c.id)} style={{ padding: '0.3rem 0.8rem', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>✕ Deny</button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                )}
              </div>
        
              {/* ── Open Shifts — Awaiting Coverage (collapsible) ── */}
              {(approvedCallouts.length > 0 ) && (
                <div style={card}>
                  <button
                    onClick={() => setOpenShiftsOpen(o => !o)}
                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', padding: 0, marginBottom: openShiftsOpen ? '1.25rem' : 0 }}
                  >
                    <h2 style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                      Open Shifts — Awaiting Coverage
                    </h2>
                    <span style={{ color: 'var(--muted)', fontSize: '0.85rem', transform: openShiftsOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▾</span>
                  </button>
        
                  {openShiftsOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {approvedCallouts.map(c => {
                        const requests = coverRequests.filter(r => r.callout_id === c.id)
                        const pending  = requests.filter(r => r.status === 'pending')
                        return (
                          <div key={c.id} style={{ padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid rgba(96,165,250,0.35)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: pending.length > 0 ? '0.75rem' : 0, flexWrap: 'wrap', gap: '0.5rem' }}>
                              <div>
                                <span style={{ fontWeight: 500, color: 'var(--muted)', fontSize: '0.85rem' }}>Called out: </span>
                                <span style={{ fontWeight: 600 }}>{c.profiles?.full_name}</span>
                                <span style={{ marginLeft: '0.5rem', fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--muted)' }}>{c.callout_date} · {c.day_of_week} {c.shift_time}</span>
                                {c.role && <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: 'rgba(2,65,107,0.1)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.35)' }}>{c.role}</span>}
                              </div>
                              {pending.length === 0 && <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontStyle: 'italic' }}>No volunteers yet</span>}
                            </div>
                            {pending.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {pending.map(r => (
                                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'var(--surface)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                    <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>{r.profiles?.full_name}</span>
                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                      <button onClick={() => approveCover(r)} disabled={approvingCoverId === r.id} style={{ padding: '0.25rem 0.7rem', background: 'rgba(2,65,107,0.12)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.35)', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{approvingCoverId === r.id ? '...' : '✓ Assign'}</button>
                                      <button onClick={() => denyCover(r.id)} disabled={approvingCoverId === r.id} style={{ padding: '0.25rem 0.7rem', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>✕</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
        
            </div>
          )
        })()}

        {/* ── HOURS TAB — split pending / reviewed history ───────────────────── */}
        {tab === 'hours' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {hoursLoading ? (
              <p style={{ color: 'var(--muted)', padding: '1rem' }}>Loading...</p>
            ) : (
              <>
                {/* Pending — always shown first */}
                <div style={card}>
                  <h2 style={{ fontWeight: 600, marginBottom: '1rem' }}>
                    Pending Approval
                    {pendingHours.length > 0 && <span style={{ marginLeft: '0.5rem', padding: '0.15rem 0.55rem', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 600, border: '1px solid rgba(96,165,250,0.3)' }}>{pendingHours.length}</span>}
                  </h2>
                  {pendingHours.length === 0 ? (
                    <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No pending submissions.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {pendingHours.map(h => (
                        <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', flexWrap: 'wrap', gap: '0.75rem' }}>
                          <div>
                            <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{h.profiles?.full_name}</p>
                            <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>{h.work_date} &nbsp;·&nbsp; {h.role} &nbsp;·&nbsp; <span style={{ fontFamily: 'DM Mono, monospace' }}>{h.hours}h</span></p>
                            {h.notes && <p style={{ fontSize: '0.8rem', color: 'var(--muted)', fontStyle: 'italic', marginTop: '0.2rem' }}>{h.notes}</p>}
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => approveHours(h)} disabled={approvingHoursId === h.id} style={{ padding: '0.4rem 0.9rem', background: 'rgba(2,65,107,0.12)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.35)', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{approvingHoursId === h.id ? '...' : '✓ Approve'}</button>
                            <button onClick={() => rejectHours(h.id)} disabled={approvingHoursId === h.id} style={{ padding: '0.4rem 0.9rem', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>✕ Reject</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Reviewed history — loaded lazily on demand */}
                {/* CHANGE: previously all 100 rows loaded together. Now reviewed
                    history only loads when admin clicks the button, saving the
                    majority of the hours tab egress for admins who only care about
                    pending items (the common case). */}
                <div style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontWeight: 600, color: 'var(--muted)' }}>Previously Reviewed</h2>
                    {reviewedHours.length === 0 && !reviewedHoursLoading && (
                      <button
                        onClick={loadReviewedHoursFirstPage}
                        style={{ padding: '0.4rem 0.9rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'DM Sans, sans-serif' }}
                      >
                        Load history
                      </button>
                    )}
                  </div>
                  {reviewedHoursLoading && reviewedHours.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.75rem' }}>Loading…</p>}
                  {reviewedHours.length > 0 && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {reviewedHours.map(h => (
                        <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', opacity: 0.75 }}>
                          <div><span style={{ fontWeight: 500, fontSize: '0.88rem' }}>{h.profiles?.full_name}</span><span style={{ color: 'var(--muted)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>{h.work_date} · {h.role} · {h.hours}h</span></div>
                          <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '100px', fontWeight: 500, background: h.status === 'approved' ? 'rgba(2,65,107,0.12)' : 'rgba(239,68,68,0.1)', color: h.status === 'approved' ? 'var(--accent)' : '#ef4444', border: `1px solid ${h.status === 'approved' ? 'rgba(2,65,107,0.35)' : 'rgba(239,68,68,0.25)'}` }}>{h.status}</span>
                        </div>
                      ))}
                      <LoadMoreButton onClick={loadMoreReviewedHours} loading={reviewedHoursLoading} hasMore={reviewedHoursHasMore} label={`Load ${HOURS_PAGE} more`} />
                    </div>
                  )}
                  {reviewedHours.length === 0 && !reviewedHoursLoading && <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.75rem' }}>Click "Load history" to view past reviews.</p>}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── AUDIT TAB — paginated ──────────────────────────────────────────── */}
        {tab === 'audit' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={card}><p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.5, maxWidth: '600px' }}>Tracks administrative actions for the last 2 weeks. Use filters to narrow results.</p></div>
            <div style={card}>
              <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Filters</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div><label style={labelStyle}>Admin</label><select value={auditFilterAdmin} onChange={e => setAuditFilterAdmin(e.target.value)} style={inputStyle}><option value="">All admins</option>{adminList.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}</select></div>
                <div><label style={labelStyle}>Action type</label><select value={auditFilterAction} onChange={e => setAuditFilterAction(e.target.value)} style={inputStyle}><option value="">All actions</option>{Object.entries(ACTION_LABELS).map(([value, label]) => (<option key={value} value={value}>{label}</option>))}</select></div>
                <div><label style={labelStyle}>From date</label><input type="date" value={auditFilterFrom} onChange={e => setAuditFilterFrom(e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>To date</label><input type="date" value={auditFilterTo} onChange={e => setAuditFilterTo(e.target.value)} style={inputStyle} /></div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button onClick={loadAuditFirstPage} disabled={auditLoading} style={{ padding: '0.75rem 1.5rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: auditLoading ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{auditLoading ? 'Loading...' : 'Apply Filters'}</button>
                <button onClick={() => { setAuditFilterAdmin(''); setAuditFilterAction(''); setAuditFilterFrom(''); setAuditFilterTo(''); setTimeout(loadAuditFirstPage, 50) }} style={{ padding: '0.75rem 1rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Reset</button>
              </div>
            </div>
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h2 style={{ fontWeight: 600 }}>Activity Log{auditLogs.length > 0 && <span style={{ marginLeft: '0.5rem', color: 'var(--muted)', fontWeight: 400, fontSize: '0.85rem' }}>— {auditLogs.length} loaded</span>}</h2>
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Last 2 weeks · {AUDIT_PAGE}/page</span>
              </div>
              {auditLoading ? <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading...</p> : auditLogs.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No activity found for the selected filters.</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {auditLogs.map(log => {
                    const color = ACTION_COLORS[log.action] || '#94a3b8'
                    const label = ACTION_LABELS[log.action] || log.action
                    return (
                      <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0, marginTop: '0.35rem' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.4rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '100px', fontWeight: 600, background: color + '18', color, border: `1px solid ${color}44` }}>{label}</span>
                              {log.target_name && <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{log.target_name}</span>}
                            </div>
                            <span style={{ color: 'var(--muted)', fontSize: '0.78rem', fontFamily: 'DM Mono, monospace', whiteSpace: 'nowrap' }}>{formatDateTime(log.created_at)}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>by {log.admin?.full_name || 'Admin'}</span>
                            {log.details && (<><span style={{ color: 'var(--border)' }}>·</span><span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontStyle: 'italic' }}>{log.details}</span></>)}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <LoadMoreButton onClick={loadMoreAudit} loading={auditLoadingMore} hasMore={auditHasMore} label={`Load ${AUDIT_PAGE} more`} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CREATE TAB ────────────────────────────────────────────────────── */}
        {tab === 'create' && (
          <div style={card}>
            <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Create Volunteer Account</h2>
            <form onSubmit={handleCreateVolunteer} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div><label style={labelStyle}>Full Name</label><input value={newName} onChange={e => setNewName(e.target.value)} required placeholder="Jane Smith" style={inputStyle} /></div>
                <div><label style={labelStyle}>Email</label><input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required placeholder="jane@example.com" style={inputStyle} /></div>
                <div><label style={labelStyle}>Temporary Password</label><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required placeholder="Min 6 characters" style={inputStyle} /></div>
                <div><label style={labelStyle}>Phone</label><input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="xxx-xxx-xxxx" style={inputStyle} /></div>
                <div><label style={labelStyle}>Affiliation</label><select value={newAffiliation} onChange={e => setNewAffiliation(e.target.value)} style={inputStyle}><option value="">— Select —</option><option value="missionary">Missionary</option><option value="student">Student</option><option value="intern">Intern</option><option value="volunteer">Volunteer</option><option value="provider">Provider</option></select></div>
                <div><label style={labelStyle}>Credentials / Skills</label><input type="text" value={newCredentials} onChange={e => setNewCredentials(e.target.value)} placeholder="e.g. EMT, Phlebotomy" style={inputStyle} /></div>
                <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Languages Spoken</label><input value={newLanguages} onChange={e => setNewLanguages(e.target.value)} placeholder="e.g. Spanish, Mandarin" style={inputStyle} /></div>
                <div><label style={labelStyle}>Default Position</label><select value={newDefaultRole} onChange={e => setNewDefaultRole(e.target.value)} style={inputStyle}><option value="">— None —</option>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                <div><label style={labelStyle}>Birthday</label><input type="date" value={newBirthday} onChange={e => setNewBirthday(e.target.value)} style={inputStyle} /></div>
                {newAffiliation === 'missionary' && (<><div><label style={labelStyle}>SMA Name</label><input value={newSmaName} onChange={e => setNewSmaName(e.target.value)} placeholder="SMA full name" style={inputStyle} /></div><div><label style={labelStyle}>SMA Contact</label><input value={newSmaContact} onChange={e => setNewSmaContact(e.target.value)} placeholder="Phone or email" style={inputStyle} /></div></>)}
                {newAffiliation === 'student' && (<><div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>School</label><select value={newSchool} onChange={e => setNewSchool(e.target.value)} style={inputStyle}><option value="">— Select school —</option>{SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}</select></div><div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Major</label><select value={newMajor} onChange={e => setNewMajor(e.target.value)} style={inputStyle}><option value="">— Select major —</option>{MAJORS.map(m => <option key={m} value={m}>{m}</option>)}</select></div></>)}
                {newAffiliation === 'intern' && (<><div><label style={labelStyle}>Advisor Name</label><input value={newAdvisorName} onChange={e => setNewAdvisorName(e.target.value)} placeholder="Advisor full name" style={inputStyle} /></div><div><label style={labelStyle}>Advisor Contact</label><input value={newAdvisorContact} onChange={e => setNewAdvisorContact(e.target.value)} placeholder="Phone or email" style={inputStyle} /></div><div><label style={labelStyle}>School</label><input value={newInternSchool} onChange={e => setNewInternSchool(e.target.value)} placeholder="University or institution" style={inputStyle} /></div><div><label style={labelStyle}>Dept / Company</label><input value={newInternDepartment} onChange={e => setNewInternDepartment(e.target.value)} placeholder="Department or company" style={inputStyle} /></div></>)}
                {newAffiliation === 'provider' && (
                  <div style={{ gridColumn: '1 / -1', padding: '1rem 1.25rem', borderRadius: '10px', border: '1px solid rgba(125,211,252,0.4)', background: 'rgba(125,211,252,0.04)' }}>
                    <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#7dd3fc', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.85rem' }}>Credential Expiration Dates</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
                      {PROVIDER_CRED_FIELDS.map(f => (
                        <CredentialInput key={f.key} fieldKey={f.key} label={f.label} value={newProviderCreds[f.key]} onChange={val => setNewProviderCreds(prev => ({ ...prev, [f.key]: val }))} allowNA={f.key === 'dea_exp'} inputStyle={inputStyle} labelStyle={labelStyle} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button type="submit" disabled={creating} style={{ padding: '0.85rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{creating ? 'Creating...' : 'Create Account'}</button>
            </form>
          </div>
        )}

        {/* ── DATA TAB ──────────────────────────────────────────────────────── */}
        {tab === 'data' && <DataDashboard supabase={supabase} />}
        {tab === 'lunch' && (
          <LunchScheduler supabase={supabase} profile={profile} />
        )}
        {/* Toast */}
        {toast && (
          <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'success' ? 'var(--accent)' : 'var(--danger)', color: toast.type === 'success' ? '#0a0f0a' : '#fff', padding: '0.75rem 1.5rem', borderRadius: '100px', fontWeight: 500, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 100 }}>
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
