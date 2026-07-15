'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { SHIFTS, ROLES, ROLE_SUGGESTIONS, SCHOOLS, MAJORS, ACTION_LABELS, ACTION_COLORS, AFFILIATION_LABELS } from '../../lib/constants'
import { getMountainNow, getMountainLabel, asUTC, formatMountain, formatDateMountain, formatDateTime, toMountainInputValue, fromMountainInputValue } from '../../lib/timeUtils'
import DataDashboard from '../../components/DataDashboard'
import ClinicOpenings from '../../components/ClinicOpenings'
import Pipeline from '../../components/Pipeline'
import Waitlist from '../../components/Waitlist'
import LunchScheduler from '../../components/LunchScheduler'
import Providers from '../../components/Providers'
import Live, { computeExpectedNotClockedIn } from '../../components/Live'
import AdminTasks from '../../components/AdminTasks'
import WeeklyTraining from '../../components/WeeklyTraining'
import LanguageCoverage from '../../components/LanguageCoverage'

export const dynamic = 'force-dynamic'

const DAYS = ['monday','tuesday','wednesday','thursday','friday']

// ── Pagination page sizes ────────────────────────────────────────────────────
const SHIFTS_PAGE    = 25
const HOURS_PAGE     = 20
const AUDIT_PAGE     = 30
const CALLOUTS_LIMIT = 60
const TEAMS = [
  'Office Manager', 'Information Systems', 'Administrative Assistant',
  'Media', 'Volunteer Credentialing', 'Provider Credentialing',
  'Executive Assistant', 'OSSM',
]

// ── RBAC: who may access the admin dashboard's content ───────────────────────
// A user with role === 'admin' still needs affiliation === 'provider' (Clinical
// Care Volunteer) OR one of these default_role values to see anything here.
const ADMIN_ACCESS_DEFAULT_ROLES = [
  'Lab Director', 'Director', 'Information Systems', 'Provider',
  'Administrative Assistant', 'Executive Assistant',
  'OSSM', 'Office Manager', 'Human Resources', 'Credentialing',
]
function hasAdminAccess(p) {
  return p?.affiliation === 'provider' || ADMIN_ACCESS_DEFAULT_ROLES.includes(p?.default_role)
}

// ── Lab Director restricted view ──────────────────────────────────────────────
// Lab Director sees Live/Scheduling/Volunteers, but only for lab-affiliated
// people: anyone whose default_role is Lab or Lab Director, OR anyone
// scheduled for a Lab shift (schedule.role === LAB_SCHEDULE_ROLE).
const LAB_DEFAULT_ROLES = ['Lab', 'Lab Director']
const LAB_SCHEDULE_ROLE = 'Lab' // must match the exact role string used in ROLES/schedule.role for Lab shifts
function getLabVolunteerIds(volunteers, schedule) {
  const ids = new Set(
    volunteers.filter(v => LAB_DEFAULT_ROLES.includes(v?.default_role)).map(v => v.id)
  )
  schedule.forEach(s => { if (s.role === LAB_SCHEDULE_ROLE) ids.add(s.volunteer_id) })
  return ids
}

// ── Shared column lists (define once, reuse everywhere) ──────────────────────
// Full profile — used when we need to display/edit all volunteer fields
const PROFILE_COLS = 'id,full_name,email,phone,role,affiliation,status,status_reason,credentials,languages,default_role,school,major,sma_name,sma_contact,advisor_name,advisor_contact,intern_school,intern_department,license_exp,bls_exp,dea_exp,ftca_exp,tb_exp,end_date,avatar_url'

// Slim profile — list views only need identity + filter fields
const PROFILE_LIST_COLS = 'id,full_name,email,phone,role,affiliation,status,status_reason,credentials,languages,default_role,school,major,sma_name,sma_contact,advisor_name,advisor_contact,intern_school,intern_department,license_exp,bls_exp,dea_exp,ftca_exp,tb_exp,end_date,team,avatar_url'

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
      <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Clinical Care Volunteer Credentials</p>
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
          <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.2rem 0.6rem', borderRadius: '100px', background: `${headerColor}18`, color: headerColor, border: `1px solid ${headerColor}44` }}>Clinical Care Volunteer Credentials</span>
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

// ── Mobile sidebar (mirrors the volunteer page's MobileSidebar) ──────────────
function AdminSidebar({ open, onClose, navItems, activeTab, onSelectTab, onSwitchView, onSignOut }) {
  function handleItemClick(action) {
    action()
    onClose()
  }
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
          zIndex: 1000,
        }}
      />
      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: '78%',
          maxWidth: '300px',
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column',
          padding: '1.25rem 1rem',
          overflowY: 'auto',
        }}
      >
        <button
          onClick={onClose}
          style={{
            alignSelf: 'flex-end',
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            fontSize: '1.3rem',
            cursor: 'pointer',
            padding: '0.25rem 0.5rem',
            marginBottom: '0.5rem',
          }}
        >
          ✕
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button
            onClick={() => handleItemClick(onSwitchView)}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '0.9rem 1rem',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: '0.95rem',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            Volunteer View
          </button>

          {navItems.map(([key, label]) => (
            <button
              key={key}
              onClick={() => handleItemClick(() => onSelectTab(key))}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '0.9rem 1rem',
                borderRadius: '10px',
                border: activeTab === key ? 'none' : '1px solid var(--border)',
                background: activeTab === key ? 'var(--accent)' : 'var(--bg)',
                color: activeTab === key ? '#fff' : 'var(--text)',
                fontSize: '0.95rem',
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              {label}
            </button>
          ))}

          <button
            onClick={() => handleItemClick(onSignOut)}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '0.9rem 1rem',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--muted)',
              fontSize: '0.95rem',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif',
              marginTop: '0.5rem',
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [profile, setProfile] = useState(null)
  const [accessDenied, setAccessDenied] = useState(false)

  const [volunteers, setVolunteers]     = useState([])
  const [activeShifts, setActiveShifts] = useState([])
  const [callouts, setCallouts]         = useState([])
  const [schedule, setSchedule]         = useState([])
  const [tab, setTab]                   = useState('dashboard')
  const [loading, setLoading]           = useState(true)
  const [toast, setToast]               = useState(null)
  const [currentTime, setCurrentTime]   = useState(getMountainNow())

  const loadedTabs = useRef(new Set(['dashboard']))

  // ── Schedule tab state ──────────────────────────────────────────────────────
  const [showReadCallouts, setShowReadCallouts]     = useState(false)
  const [scheduleDay, setScheduleDay]               = useState('monday')
  const [scheduleShift, setScheduleShift]           = useState('10-2')
  const [addingRole, setAddingRole]                 = useState(null)
  const [addVolId, setAddVolId]                     = useState('')
  const [addingEntry, setAddingEntry]               = useState(false)
  const [addStartDate, setAddStartDate]             = useState('')
  const [addEndDate, setAddEndDate]                 = useState('')
  const [addWeekPattern, setAddWeekPattern]         = useState('every')
  const [addNotes, setAddNotes]                     = useState('')
  const [showClinicOpenings, setShowClinicOpenings] = useState(false)
  const [showWaitlist, setShowWaitlist]             = useState(false)
  const [scheduleDate, setScheduleDate]             = useState('')
  const [dateCoverShifts, setDateCoverShifts]       = useState([])

  // ── Volunteer tab state ─────────────────────────────────────────────────────
  const [selectedVolunteer, setSelectedVolunteer]       = useState(null)
  const [editing, setEditing]                           = useState(false)
  const [showInactive, setShowInactive]                 = useState(false)
  const [statusForm, setStatusForm]                     = useState({ status: 'active', status_reason: '' })
  const [changingStatus, setChangingStatus]             = useState(false)
  const [editForm, setEditForm]                         = useState({})
  const [saving, setSaving]                             = useState(false)
  const [filterAffiliation, setFilterAffiliation]       = useState('all')
  const [filterSchool, setFilterSchool]                 = useState('all')
  const [filterRole, setFilterRole]                     = useState('all')
  const [filterDefaultRole, setFilterDefaultRole]       = useState('all')
  const [filterSearch, setFilterSearch]                 = useState('')
  const [filtersOpen, setFiltersOpen]                   = useState(true)
  const [volunteersOpen, setVolunteersOpen]             = useState(true)
  const [showRecentShifts, setShowRecentShifts]         = useState(false)
  const [showScheduledShifts, setShowScheduledShifts]   = useState(false)
  const [recentShifts, setRecentShifts]                 = useState([])
  const [scheduledShifts, setScheduledShifts]           = useState([])
  const [loadingRecentShifts, setLoadingRecentShifts]   = useState(false)
  const [loadingScheduledShifts, setLoadingScheduledShifts] = useState(false)
  const [volunteerTotalHours, setVolunteerTotalHours]   = useState(null)
  const [loadingVolHours, setLoadingVolHours]           = useState(false)

  // ── Create volunteer state ──────────────────────────────────────────────────
  const [newName, setNewName]               = useState(''); const [newEmail, setNewEmail]             = useState(''); const [newPassword, setNewPassword]         = useState('')
  const [newRole, setNewRole]               = useState('volunteer'); const [newAffiliation, setNewAffiliation] = useState(''); const [newCredentials, setNewCredentials]   = useState('')
  const [newPhone, setNewPhone]             = useState(''); const [newLanguages, setNewLanguages]     = useState(''); const [newSmaName, setNewSmaName]           = useState('')
  const [newSmaContact, setNewSmaContact]   = useState(''); const [newSchool, setNewSchool]           = useState(''); const [newMajor, setNewMajor]               = useState('')
  const [newDefaultRole, setNewDefaultRole] = useState(''); const [creating, setCreating]               = useState(false)
  const [newAdvisorName, setNewAdvisorName] = useState(''); const [newAdvisorContact, setNewAdvisorContact] = useState('')
  const [newInternSchool, setNewInternSchool]   = useState(''); const [newInternDepartment, setNewInternDepartment] = useState('')
  const [newProviderCreds, setNewProviderCreds] = useState({ license_exp: '', bls_exp: '', dea_exp: '', ftca_exp: '', tb_exp: '' })
  const [endDateInput, setEndDateInput]     = useState('')
  const [newEndDate, setNewEndDate]         = useState('')

  // ── Cover requests state ────────────────────────────────────────────────────
  const [coverRequests, setCoverRequests]       = useState([])
  const [approvingCoverId, setApprovingCoverId] = useState(null)
  const [pendingCalloutsOpen, setPendingCalloutsOpen] = useState(true)
  const [openShiftsOpen, setOpenShiftsOpen]     = useState(true)

  // ── Shifts tab ──────────────────────────────────────────────────────────────
  const [allShifts, setAllShifts]               = useState([])
  const [shiftsLoading, setShiftsLoading]       = useState(false)
  const [shiftsLoadingMore, setShiftsLoadingMore] = useState(false)
  const [shiftsHasMore, setShiftsHasMore]       = useState(false)
  const [shiftsCursor, setShiftsCursor]         = useState(null)
  const [editingShiftId, setEditingShiftId]     = useState(null)
  const [shiftEditForm, setShiftEditForm]       = useState({ clock_in: '', clock_out: '', role: '', clock_in_utc: '', clock_out_utc: '' })
  const [savingShift, setSavingShift]           = useState(false)
  const [showNewShiftForm, setShowNewShiftForm] = useState(false)
  const [newShiftForm, setNewShiftForm]         = useState({ volunteer_id: '', clock_in: '', clock_out: '', role: '' })
  const [creatingShift, setCreatingShift]       = useState(false)
  const [shiftFilterVolId, setShiftFilterVolId] = useState('')

  // ── Hours tab ───────────────────────────────────────────────────────────────
  const [pendingHours, setPendingHours]                   = useState([])
  const [reviewedHours, setReviewedHours]                 = useState([])
  const [hoursLoading, setHoursLoading]                   = useState(false)
  const [reviewedHoursLoading, setReviewedHoursLoading]   = useState(false)
  const [reviewedHoursHasMore, setReviewedHoursHasMore]   = useState(false)
  const [reviewedHoursCursor, setReviewedHoursCursor]     = useState(null)
  const [approvingHoursId, setApprovingHoursId]           = useState(null)

  // ── Audit tab ───────────────────────────────────────────────────────────────
  const [auditLogs, setAuditLogs]               = useState([])
  const [auditLoading, setAuditLoading]         = useState(false)
  const [auditLoadingMore, setAuditLoadingMore] = useState(false)
  const [auditHasMore, setAuditHasMore]         = useState(false)
  const [auditCursor, setAuditCursor]           = useState(null)
  const [auditFilterAdmin, setAuditFilterAdmin] = useState('')
  const [auditFilterAction, setAuditFilterAction] = useState('')
  const [auditFilterFrom, setAuditFilterFrom]   = useState('')
  const [auditFilterTo, setAuditFilterTo]       = useState('')

  const [lightboxUrl, setLightboxUrl] = useState(null)

  // ── Mobile detection (mirrors the volunteer page) ─────────────────────────
  // Primary signal: device-based detection via the user-agent string.
  // Secondary signal: a narrow viewport (<428px) also counts as mobile, so a
  // desktop browser window can't get stuck rendering the mobile layout at a
  // wide width, but a squeezed-down window still gets it.
  const [isMobile, setIsMobile] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  useEffect(() => {
    const ua = navigator.userAgent || navigator.vendor || ''
    const isMobileUA = /android|iphone|ipad|ipod|iemobile|blackberry|opera mini|mobile/i.test(ua)
    const check = () => {
      const isNarrow = window.innerWidth < 428
      setIsMobile(isMobileUA || isNarrow)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const isTaskAdmin = ['Director', 'Administrative Assistant', 'Executive Assistant']
    .includes(profile?.default_role)

  const canOverrideRoleLimits = ['Director', 'Administrative Assistant', 'Executive Assistant']
    .includes(profile?.default_role)

  const isCredentialing = profile?.default_role === 'Credentialing'
  const isHR = profile?.default_role === 'Human Resources'
  const isOfficeManager = profile?.default_role === 'Office Manager'
  const isOSSM = profile?.default_role === 'OSSM'
  const isLabDirector = profile?.default_role === 'Lab Director'
  const isDirector = profile?.default_role === 'Director'
  const isAdminAssistant = profile?.default_role === 'Administrative Assistant'

  // Language Coverage tab is scoped to exactly these three roles, regardless
  // of which tabItems branch they fall into below.
  const canSeeLanguageCoverage = isOfficeManager || isDirector || isAdminAssistant

  // Lab Director's data scope — everyone else gets null (no restriction).
  const labVolunteerIds = isLabDirector ? getLabVolunteerIds(volunteers, schedule) : null
  const visibleVolunteers   = labVolunteerIds ? volunteers.filter(v => labVolunteerIds.has(v.id))      : volunteers
  const visibleSchedule     = labVolunteerIds ? schedule.filter(s => labVolunteerIds.has(s.volunteer_id))    : schedule
  const visibleActiveShifts = labVolunteerIds ? activeShifts.filter(s => labVolunteerIds.has(s.volunteer_id)) : activeShifts
  const visibleCallouts     = labVolunteerIds ? callouts.filter(c => labVolunteerIds.has(c.volunteer_id))   : callouts
    
  // ── Profile photo state ──────────────────────────────────────────────────────
  const [profilePhotoUrl, setProfilePhotoUrl]         = useState(null)
  const [profilePhotoLoading, setProfilePhotoLoading] = useState(false)
  const [uploadingPhoto, setUploadingPhoto]           = useState(false)
  const photoInputRef = useRef(null)

  // ── Stable style objects ────────────────────────────────────────────────────
  const card        = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
  const inputStyle  = { width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', fontFamily: 'DM Sans, sans-serif' }
  const labelStyle  = { display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const affiliationColor = { missionary: '#818cf8', intern: '#150d5a', student: '#38bdf8', volunteer: '#02416B', provider: '#7dd3fc' }
  const badgeStyle  = (color) => ({ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 500, background: color + '22', color: color, border: `1px solid ${color}55` })
  const pillBtn     = (active, mono) => ({ padding: '0.45rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: mono ? 'DM Mono, monospace' : 'DM Sans, sans-serif', background: active ? (mono ? '#1e40af' : 'var(--accent)') : 'var(--surface)', color: active ? (mono ? '#bfdbfe' : '#fff') : 'var(--muted)', border: active ? 'none' : '1px solid var(--border)' })
  const biweeklyBadge = { fontWeight: 600, background: '#dbeafe', color: '#1e3a8a', border: '1px solid #2563eb' }
  const tzLabel     = getMountainLabel()

  // ── Tab list (shared between the desktop pill row and the mobile sidebar) ──
  const tabItems = isLabDirector
    ? [
        ['dashboard', 'Live'], ['schedule', 'Scheduling'], ['volunteers', 'Volunteers'],
      ]
    : isCredentialing
    ? [
        ['providers', 'Providers'], ['volunteers', 'Volunteers'],
        ['create', 'Add Volunteer'], ['shifts', 'Shifts'],  ['hours', 'Hours'],
      ]
    : isOfficeManager
    ? [
        ['dashboard', 'Live'], ['schedule', 'Scheduling'], ['volunteers', 'Volunteers'],
        ['pipeline', 'Pipeline'], ['shifts', 'Shifts'], ['data', 'Data'], ['callouts', 'Call-Outs'],
        ['training', 'Weekly Training'],
      ]
    : isOSSM
    ? [
        ['dashboard', 'Live'], ['schedule', 'Scheduling'], ['volunteers', 'Volunteers'],
        ['pipeline', 'Pipeline'], ['shifts', 'Shifts'], ['data', 'Data'], ['callouts', 'Call-Outs'],
      ]
    : isHR
    ? [
        ['dashboard', 'Live'], ['schedule', 'Scheduling'], ['volunteers', 'Volunteers'],
        ['pipeline', 'Pipeline'], ['shifts', 'Shifts'], ['data', 'Data'], ['callouts', 'Call-Outs'],
      ]
    : [
        ['dashboard', 'Live'], ['schedule', 'Scheduling'], ['volunteers', 'Volunteers'], ['providers', 'Providers'],
        ['pipeline', 'Pipeline'], ['shifts', 'Shifts'], ['callouts', 'Call-Outs'],
        ['hours', 'Hours'], ['audit', 'Recent Activity'], ['create', 'Add Volunteer'], ['data', 'Data'], ['training', 'Weekly Training'], ...(isTaskAdmin ? [['tasks', 'Tasks']] : []),
      ]

  // Insert Language Coverage right after Volunteers, but only for the three
  // roles allowed to see it. Works regardless of which branch above produced
  // tabItems, since every branch that could match these roles includes 'volunteers'.
  if (canSeeLanguageCoverage) {
    const volIdx = tabItems.findIndex(([key]) => key === 'volunteers')
    tabItems.splice(volIdx === -1 ? tabItems.length : volIdx + 1, 0, ['languages', 'Languages'])
  }

  const DAY_ORDER   = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 }

  // ── Data loaders ────────────────────────────────────────────────────────────

  // Volunteers: fetch all profile fields once; subsequent mutations patch local state
  async function loadVolunteers() {
    const { data } = await supabase
      .from('profiles')
      .select(PROFILE_LIST_COLS)
      .order('full_name')
    setVolunteers(data || [])
  }

  // Active shifts: only the columns Live/stats actually need
  async function loadActiveShifts() {
    const { data } = await supabase
      .from('shifts')
      .select('id,volunteer_id,clock_in,profiles(id,full_name)')
      .is('clock_out', null)
    setActiveShifts(data || [])
  }

  async function loadCallouts() {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
    const cols = 'id,volunteer_id,callout_date,day_of_week,shift_time,role,reason,status,is_read,covered_by,submitted_at,volunteer:profiles!callouts_volunteer_id_fkey(full_name)'

    // Fetch pending first (priority), then fill remaining slots with approved
    // (covered or not — Live.js and the callouts tab need covered ones too,
    // both to render the "covered" badge and so computeExpectedNotClockedIn
    // correctly excludes volunteers who called out and got covered).
    const [{ data: pendingData }, { data: approvedData }] = await Promise.all([
      supabase.from('callouts').select(cols)
        .gte('callout_date', todayStr)
        .or('status.eq.pending,status.is.null')
        .order('callout_date', { ascending: true })
        .limit(CALLOUTS_LIMIT),
      supabase.from('callouts').select(cols)
        .gte('callout_date', todayStr)
        .eq('status', 'approved')
        .order('callout_date', { ascending: true })
        .limit(CALLOUTS_LIMIT),
    ])

    const pending  = (pendingData  || [])
    const approved = (approvedData || []).filter(a => !pending.some(p => p.id === a.id))
    const merged   = [...pending, ...approved].slice(0, CALLOUTS_LIMIT)

    setCallouts(merged.map(c => ({ ...c, profiles: c.volunteer, status: c.status ?? (c.is_read ? 'approved' : 'pending') })))
  }

  async function loadSchedule() {
    const { data } = await supabase
      .from('schedule')
      .select('id,volunteer_id,day_of_week,shift_time,role,start_date,end_date,week_pattern,notes,profiles(id,full_name)')
      .order('role')
    setSchedule(data || [])
  }

  async function loadCoverRequests() {
    // Fetch pending cover requests first, then reviewed ones to fill remaining slots
    const cols = 'id,callout_id,volunteer_id,status,requested_at,reviewed_at,profiles(full_name)'
    const COVER_LIMIT = 100
    const [{ data: pendingData }, { data: reviewedData }] = await Promise.all([
      supabase.from('shift_cover_requests').select(cols)
        .eq('status', 'pending')
        .order('requested_at', { ascending: false }),
      supabase.from('shift_cover_requests').select(cols)
        .neq('status', 'pending')
        .order('requested_at', { ascending: false })
        .limit(COVER_LIMIT),
    ])
    const pending  = (pendingData  || [])
    const reviewed = (reviewedData || []).filter(r => !pending.some(p => p.id === r.id))
    setCoverRequests([...pending, ...reviewed])
  }

  // ── Shifts pagination ───────────────────────────────────────────────────────
  async function loadShiftsFirstPage(volId = '') {
    setShiftsLoading(true)
    let q = supabase
      .from('shifts')
      .select('id,volunteer_id,clock_in,clock_out,role,profiles(id,full_name)')
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
      .select('id,volunteer_id,clock_in,clock_out,role,profiles(id,full_name)')
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

  // ── Hours pagination ────────────────────────────────────────────────────────
  // Narrow hours columns — only what the UI renders
  const HOURS_COLS = 'id,volunteer_id,work_date,hours,role,notes,status,submitted_at,reviewed_at,profiles(full_name,role)'

  async function loadPendingHours() {
    setHoursLoading(true)
    const { data } = await supabase
      .from('hours_submissions')
      .select(HOURS_COLS)
      .eq('status', 'pending')
      .order('submitted_at', { ascending: false })
    setPendingHours((data || []).filter(h => h.profiles?.role !== 'admin'))
    setHoursLoading(false)
  }

  async function loadReviewedHoursFirstPage() {
    setReviewedHoursLoading(true)
    const { data } = await supabase
      .from('hours_submissions')
      .select(HOURS_COLS)
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
      .select(HOURS_COLS)
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

  // ── Audit pagination ────────────────────────────────────────────────────────
  // Narrow audit columns to what's rendered
  const AUDIT_COLS = 'id,admin_id,action,target_type,target_id,target_name,details,created_at,admin:profiles!audit_logs_admin_id_fkey(full_name)'

  function buildAuditQuery() {
    let q = supabase
      .from('audit_logs')
      .select(AUDIT_COLS)
      .order('created_at', { ascending: false })
    if (auditFilterAdmin)  q = q.eq('admin_id', auditFilterAdmin)
    if (auditFilterAction) q = q.eq('action', auditFilterAction)
    if (auditFilterFrom)   q = q.gte('created_at', auditFilterFrom + 'T00:00:00Z')
    if (auditFilterTo)     q = q.lte('created_at', auditFilterTo + 'T23:59:59Z')
    return q
  }

  async function loadAuditFirstPage() {
    setAuditLoading(true)
    setAuditLogs([])
    setAuditCursor(null)
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const { data } = await buildAuditQuery()
      .gte('created_at', twoWeeksAgo)
      .limit(AUDIT_PAGE)
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

  // ── Per-volunteer lazy loaders ──────────────────────────────────────────────
  async function loadRecentShiftsForVolunteer(volunteerId) {
    setLoadingRecentShifts(true)
    const { data } = await supabase
      .from('shifts')
      .select('id,clock_in,clock_out,role')
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
      .select('id,day_of_week,shift_time,role,week_pattern,start_date,end_date,notes')
      .eq('volunteer_id', volunteerId)
      .order('day_of_week')
    setScheduledShifts(data || [])
    setLoadingScheduledShifts(false)
  }

  // Volunteer total hours: fetch only the two timestamp columns needed for math
  async function loadVolunteerTotalHours(volunteerId) {
    setLoadingVolHours(true)
    const { data } = await supabase
      .from('shifts')
      .select('clock_in,clock_out')
      .eq('volunteer_id', volunteerId)
      .not('clock_out', 'is', null)
    const total = (data || []).reduce((acc, s) => acc + (asUTC(s.clock_out) - asUTC(s.clock_in)) / 3600000, 0).toFixed(1)
    setVolunteerTotalHours(total)
    setLoadingVolHours(false)
  }

  // ── Profile photo helpers ───────────────────────────────────────────────────

  // Compress image to ≤200 KB JPEG before upload to minimise storage/egress
  async function compressImage(file, maxDim = 480, quality = 0.75) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height)
          width  = Math.round(width  * scale)
          height = Math.round(height * scale)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')), 'image/jpeg', quality)
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
      img.src = url
    })
  }

  // Fetch a short-lived signed URL for a volunteer's avatar (called lazily on profile open)
  async function loadProfilePhoto(avatarPath) {
    if (!avatarPath) { setProfilePhotoUrl(null); return }
    setProfilePhotoLoading(true)
    const { data } = await supabase.storage.from('avatars').createSignedUrl(avatarPath, 3600)
    setProfilePhotoUrl(data?.signedUrl || null)
    setProfilePhotoLoading(false)
  }

  async function handleProfilePhotoUpload(file) {
    if (!file || !selectedVolunteer) return
    setUploadingPhoto(true)
    try {
      const compressed = await compressImage(file)
      const ext  = 'jpg'
      const path = `${selectedVolunteer.id}/avatar.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, compressed, { contentType: 'image/jpeg', upsert: true })
      if (uploadErr) { showMessage(uploadErr.message, 'error'); return }

      // Store the path in the profile row
      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: path }).eq('id', selectedVolunteer.id)
      if (dbErr) { showMessage(dbErr.message, 'error'); return }

      // Refresh signed URL
      const { data } = await supabase.storage.from('avatars').createSignedUrl(path, 3600)
      setProfilePhotoUrl(data?.signedUrl || null)

      // Patch local state
      const fresh = { ...selectedVolunteer, avatar_url: path }
      setSelectedVolunteer(fresh)
      setVolunteers(prev => prev.map(v => v.id === selectedVolunteer.id ? fresh : v))
      await audit('uploaded_avatar', 'volunteer', selectedVolunteer.id, selectedVolunteer.full_name)
      showMessage('Photo updated!', 'success')
    } catch (e) {
      showMessage('Failed to upload photo: ' + e.message, 'error')
    } finally {
      setUploadingPhoto(false)
    }
  }

  // Date-cover shifts: only id, volunteer_id, clock_in, and the name join
  async function loadDateCoverShifts(date) {
    const { data } = await supabase
      .from('shifts')
      .select('id,volunteer_id,clock_in,profiles(id,full_name)')
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
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { window.location.href = '/'; return }
      // Fetch only the admin profile fields we actually use
      const { data: p } = await supabase
        .from('profiles')
        .select('id,full_name,email,role,default_role,affiliation')
        .eq('id', user.id).single()
      if (p?.role !== 'admin') { window.location.href = '/volunteer'; return }
      if (!hasAdminAccess(p)) {
        setProfile(p)
        setAccessDenied(true)
        setLoading(false)
        return
      }
      setProfile(p)
      if (p?.default_role === 'Credentialing') setTab('providers')
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
      await supabase.from('audit_logs').insert({
        admin_id: profile.id, action, target_type,
        target_id: target_id ? String(target_id) : null,
        target_name: target_name || null,
        details: details || null,
      })
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
    if (!scheduleDate) return visibleSchedule.filter(s => s.day_of_week === day && s.shift_time === shift && s.role === role)
    const d = new Date(scheduleDate + 'T12:00:00'); let count = 0; const target = d.getDay()
    const check = new Date(d.getFullYear(), d.getMonth(), 1)
    while (check <= d) { if (check.getDay() === target) count++; check.setDate(check.getDate() + 1) }
    return visibleSchedule.filter(s => {
      if (s.day_of_week !== day || s.shift_time !== shift || s.role !== role) return false
      if (s.start_date && s.start_date > scheduleDate) return false
      if (s.end_date   && s.end_date   < scheduleDate) return false
      if (s.week_pattern === 'odd'  && count % 2 !== 1) return false
      if (s.week_pattern === 'even' && count % 2 !== 0) return false
      return true
    })
  }

  const { list: expectedVolunteers } = computeExpectedNotClockedIn({ schedule: visibleSchedule, callouts: visibleCallouts, activeShifts: visibleActiveShifts, volunteers: visibleVolunteers })
  const visiblePendingHours = labVolunteerIds ? pendingHours.filter(h => labVolunteerIds.has(h.volunteer_id)) : pendingHours

  function openVolunteer(v) {
    setTab('volunteers')
    setSelectedVolunteer(v)
    setEditForm({
      full_name: v.full_name||'', email: v.email||'', phone: v.phone||'',
      affiliation: v.affiliation||'', credentials: v.credentials||'',
      languages: v.languages||'', role: v.role||'volunteer',
      sma_name: v.sma_name||'', sma_contact: v.sma_contact||'',
      school: v.school||'', default_role: v.default_role||'',
      advisor_name: v.advisor_name||'', advisor_contact: v.advisor_contact||'',
      intern_school: v.intern_school||'', intern_department: v.intern_department||'',
      license_exp: v.license_exp||'', bls_exp: v.bls_exp||'',
      dea_exp: v.dea_exp||'', ftca_exp: v.ftca_exp||'', tb_exp: v.tb_exp||'',
      end_date: v.end_date || '', status_reason: v.status_reason || '',
      team: v.team || '',
    })
    setStatusForm({ status: v.status || 'active', status_reason: v.status_reason || '' })
    setEditing(false)
    setShowRecentShifts(false); setShowScheduledShifts(false)
    setRecentShifts([]); setScheduledShifts([])
    setVolunteerTotalHours(null)
    loadVolunteerTotalHours(v.id)
    setEndDateInput(v.end_date || '')
    // Lazy-load photo only when a profile is selected
    setProfilePhotoUrl(null)
    loadProfilePhoto(v.avatar_url || null)
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

  // Patch a single callout in local state instead of re-fetching the whole list
  function patchCallout(id, patch) {
    setCallouts(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
  }

  async function approveCallout(callout) {
    const { error } = await supabase.from('callouts').update({ status: 'approved', is_read: true }).eq('id', callout.id)
    if (error) { showMessage(error.message, 'error'); return }
    showMessage('Callout approved — shift is now open for coverage', 'success')
    await audit('approved_callout', 'callout', callout.id, callout.profiles?.full_name, `${callout.callout_date} ${callout.shift_time}`)
    patchCallout(callout.id, { status: 'approved', is_read: true })
  }

  async function denyCallout(id) {
    const callout = callouts.find(c => c.id === id)
    const { error } = await supabase.from('callouts').update({ status: 'denied', is_read: true }).eq('id', id)
    if (error) { showMessage(error.message, 'error'); return }
    showMessage('Callout denied.', 'success')
    await audit('denied_callout', 'callout', id, callout?.profiles?.full_name, `${callout?.callout_date} ${callout?.shift_time}`)
    patchCallout(id, { status: 'denied', is_read: true })
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

    // Patch local state — no full re-fetch
    patchCallout(req.callout_id, { covered_by: req.volunteer_id })
    setCoverRequests(prev => prev.map(r => {
      if (r.callout_id !== req.callout_id) return r
      return { ...r, status: r.id === req.id ? 'approved' : 'denied', reviewed_at: new Date().toISOString() }
    }))
    setApprovingCoverId(null)
  }

  async function denyCover(id) {
    setApprovingCoverId(id)
    const req = coverRequests.find(r => r.id === id)
    const { error } = await supabase.from('shift_cover_requests').update({ status: 'denied', reviewed_at: new Date().toISOString() }).eq('id', id)
    if (error) { showMessage(error.message, 'error'); setApprovingCoverId(null); return }
    showMessage('Cover request denied.', 'success')
    await audit('denied_cover', 'callout', req?.callout_id, req?.profiles?.full_name)
    // Patch local state
    setCoverRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'denied', reviewed_at: new Date().toISOString() } : r))
    setApprovingCoverId(null)
  }

  async function handleShiftEditSave(shiftId) {
    setSavingShift(true)
    const clockIn  = fromMountainInputValue(shiftEditForm.clock_in)
    const clockOut = shiftEditForm.clock_out ? fromMountainInputValue(shiftEditForm.clock_out) : null
    if (clockOut) {
      const hours = (new Date(clockOut) - new Date(clockIn)) / 3600000
      if (hours <= 0) { showMessage('Clock-out must be after clock-in.', 'error'); setSavingShift(false); return }
      if (hours > 15) { showMessage('Shifts cannot be longer than 15 hours.', 'error'); setSavingShift(false); return }
    }
    const shift = allShifts.find(s => s.id === shiftId)
    const { error } = await supabase.from('shifts').update({ clock_in: clockIn, clock_out: clockOut, role: shiftEditForm.role || null }).eq('id', shiftId)
    if (error) { showMessage(error.message, 'error'); setSavingShift(false); return }
    showMessage('Shift updated!', 'success')
    await audit('edited_shift', 'shift', shiftId, shift?.profiles?.full_name, `${formatDateTime(clockIn)} → ${clockOut ? formatDateTime(clockOut) : 'active'}`)
    setEditingShiftId(null)
    // Patch local shift list — avoid full re-fetch
    setAllShifts(prev => prev.map(s => s.id === shiftId ? { ...s, clock_in: clockIn, clock_out: clockOut, role: shiftEditForm.role || null } : s))
    // If the shift was active (no clock_out) it may have changed active status
    if (!clockOut) {
      // Still active: keep in activeShifts as-is (clock_in may have changed)
      setActiveShifts(prev => prev.map(s => s.id === shiftId ? { ...s, clock_in: clockIn } : s))
    } else {
      // Now closed: remove from activeShifts
      setActiveShifts(prev => prev.filter(s => s.id !== shiftId))
    }
    setSavingShift(false)
  }

  async function handleShiftDelete(shiftId) {
    if (!confirm('Delete this shift entry? This cannot be undone.')) return
    const shift = allShifts.find(s => s.id === shiftId)
    const { error } = await supabase.from('shifts').delete().eq('id', shiftId)
    if (error) { showMessage(error.message, 'error'); return }
    showMessage('Shift deleted.', 'success')
    await audit('deleted_shift', 'shift', shiftId, shift?.profiles?.full_name, `${formatDateTime(shift?.clock_in)}`)
    // Patch local state — no re-fetch
    setAllShifts(prev => prev.filter(s => s.id !== shiftId))
    setActiveShifts(prev => prev.filter(s => s.id !== shiftId))
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
    const reviewed = { ...sub, status: 'approved', reviewed_at: new Date().toISOString() }
    setPendingHours(prev => prev.filter(h => h.id !== sub.id))
    setReviewedHours(prev => [reviewed, ...prev])
    setApprovingHoursId(null)
  }

  async function rejectHours(id) {
    setApprovingHoursId(id)
    const sub = pendingHours.find(h => h.id === id)
    await supabase.from('hours_submissions').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', id)
    showMessage('Submission rejected.', 'success')
    await audit('rejected_hours', 'hours', id, sub?.profiles?.full_name, `${sub?.hours}h on ${sub?.work_date}`)
    const reviewed = { ...sub, status: 'rejected', reviewed_at: new Date().toISOString() }
    setPendingHours(prev => prev.filter(h => h.id !== id))
    setReviewedHours(prev => [reviewed, ...prev])
    setApprovingHoursId(null)
  }

  async function handleCreateShift(e) {
    e.preventDefault()
    if (!newShiftForm.volunteer_id || !newShiftForm.clock_in) return
    setCreatingShift(true)
    const clockIn  = fromMountainInputValue(newShiftForm.clock_in)
    const clockOut = newShiftForm.clock_out ? fromMountainInputValue(newShiftForm.clock_out) : null
    if (clockOut) {
      const hours = (new Date(clockOut) - new Date(clockIn)) / 3600000
      if (hours < 0) { showMessage('Clock-out must be after clock-in.', 'error'); setCreatingShift(false); return }
      if (hours > 15) { showMessage('Shifts cannot be longer than 15 hours. If this is intentional, please break up into multiple shifts.', 'error'); setCreatingShift(false); return }
    }
    const vol = volunteers.find(v => v.id === newShiftForm.volunteer_id)
    const { data: inserted, error } = await supabase
      .from('shifts')
      .insert({ volunteer_id: newShiftForm.volunteer_id, clock_in: clockIn, clock_out: clockOut, role: newShiftForm.role || null })
      .select('id,volunteer_id,clock_in,clock_out,role,profiles(id,full_name)')
      .single()
    if (error) { showMessage(error.message, 'error'); setCreatingShift(false); return }
    showMessage('Shift entry created!', 'success')
    await audit('created_shift', 'shift', inserted?.id, vol?.full_name, `${formatDateTime(clockIn)}`)
    setNewShiftForm({ volunteer_id: '', clock_in: '', clock_out: '', role: '' })
    setShowNewShiftForm(false)
    // Prepend to local list — no full re-fetch
    setAllShifts(prev => [inserted, ...prev])
    if (!clockOut) setActiveShifts(prev => [{ id: inserted.id, volunteer_id: inserted.volunteer_id, clock_in: clockIn, profiles: inserted.profiles }, ...prev])
    setCreatingShift(false)
  }

  async function handleAddEntry() {
    if (!addVolId) return
    setAddingEntry(true)
    const currentEntries = getEntries(scheduleDay, scheduleShift, addingRole)
    const effectiveCount = currentEntries.reduce((sum, entry) => {
      if (addStartDate && entry.end_date && entry.end_date < addStartDate) return sum
      if (addEndDate && entry.start_date && entry.start_date > addEndDate) return sum
      return sum + (entry.week_pattern === 'every' ? 1 : 0.5)
    }, 0)
    const limit = ROLE_SUGGESTIONS[addingRole]
    if (limit && effectiveCount >= limit && !canOverrideRoleLimits) { showMessage(`Limit reached for ${addingRole} (${limit})`, 'error'); setAddingEntry(false); return }
    if (limit && effectiveCount >= limit && canOverrideRoleLimits) { showMessage(`Limit for ${addingRole} (${limit}) exceeded — adding anyway`, 'success') }
    const exists = schedule.find(s => {
      if (s.volunteer_id !== addVolId || s.day_of_week !== scheduleDay || s.shift_time !== scheduleShift || s.role !== addingRole) return false
      const aStart = s.start_date || '0000-01-01'; const aEnd = s.end_date || '9999-12-31'
      const bStart = addStartDate || '0000-01-01'; const bEnd = addEndDate || '9999-12-31'
      return aStart <= bEnd && bStart <= aEnd
    })
    if (exists) { showMessage('Volunteer already assigned to this slot', 'error'); setAddingEntry(false); return }
    const vol = volunteers.find(v => v.id === addVolId)
    const { data: inserted, error } = await supabase
      .from('schedule')
      .insert({ volunteer_id: addVolId, day_of_week: scheduleDay, shift_time: scheduleShift, role: addingRole, start_date: addStartDate || null, end_date: addEndDate || null, week_pattern: addWeekPattern || 'every', notes: addNotes || null })
      .select('id,volunteer_id,day_of_week,shift_time,role,start_date,end_date,week_pattern,notes,profiles(id,full_name)')
      .single()
    if (error) { showMessage(error.message, 'error'); setAddingEntry(false); return }
    showMessage('Volunteer assigned!', 'success')
    const overrodeLimit = limit && effectiveCount >= limit && canOverrideRoleLimits
    await audit('assigned_schedule', 'schedule', inserted?.id, vol?.full_name, `${scheduleDay} ${scheduleShift} — ${addingRole}${overrodeLimit ? ` (limit of ${limit} overridden)` : ''}`)
    setAddingRole(null); setAddVolId(''); setAddStartDate(''); setAddEndDate(''); setAddWeekPattern('every'); setAddNotes('')
    // Append to local schedule — no full re-fetch
    setSchedule(prev => [...prev, inserted].sort((a, b) => (a.role || '').localeCompare(b.role || '')))
    setAddingEntry(false)
  }

  async function handleRemoveEntry(id) {
    const entry = schedule.find(s => s.id === id)
    const { error } = await supabase.from('schedule').delete().eq('id', id)
    if (error) { showMessage(error.message, 'error'); return }
    showMessage('Removed from schedule', 'success')
    await audit('removed_schedule', 'schedule', id, entry?.profiles?.full_name, `${entry?.day_of_week} ${entry?.shift_time} — ${entry?.role}`)
    // Patch local state — no re-fetch
    setSchedule(prev => prev.filter(s => s.id !== id))
  }

  async function handleStatusChange(newStatus, reason) {
    setChangingStatus(true)
    const volunteerId = selectedVolunteer.id
    const isDeactivating = newStatus === 'inactive'
    const { error } = await supabase.from('profiles').update({
      status: newStatus,
      status_reason: isDeactivating ? (reason || null) : null,
      status_changed_at: new Date().toISOString(),
    }).eq('id', volunteerId)
    if (error) { showMessage(error.message, 'error'); setChangingStatus(false); return }
    if (isDeactivating) {
      const { error: se } = await supabase.from('schedule').delete().eq('volunteer_id', volunteerId)
      if (se) { showMessage(se.message, 'error'); setChangingStatus(false); return }
      // Remove from local schedule
      setSchedule(prev => prev.filter(s => s.volunteer_id !== volunteerId))
    }
    await audit(isDeactivating ? 'deactivated_volunteer' : 'reactivated_volunteer', 'volunteer', volunteerId, selectedVolunteer.full_name, reason || null)
    showMessage(isDeactivating ? 'Volunteer deactivated and removed from schedule.' : 'Volunteer reactivated!', 'success')
    // Patch volunteer in local state — avoid full re-fetch
    const patch = { status: newStatus, status_reason: isDeactivating ? (reason || null) : null }
    const fresh = { ...selectedVolunteer, ...patch }
    setSelectedVolunteer(fresh)
    setVolunteers(prev => prev.map(v => v.id === volunteerId ? { ...v, ...patch } : v))
    setChangingStatus(false)
  }

  async function handleSaveEdit() {
    setSaving(true)
    if (editForm.end_date && !editForm.status_reason) {
      showMessage('Please select a deactivation reason when setting an end date.', 'error')
      setSaving(false)
      return
    }
    const isProvider = editForm.affiliation === 'provider'
    const isIntern   = editForm.affiliation === 'intern'
    const isMission  = editForm.affiliation === 'missionary'
    const isStudent  = editForm.affiliation === 'student'
    const updates = {
      full_name: editForm.full_name, phone: editForm.phone, affiliation: editForm.affiliation || null,
      credentials: editForm.credentials || null, languages: editForm.languages, role: editForm.role,
      sma_name: isMission ? (editForm.sma_name||null) : null, sma_contact: isMission ? (editForm.sma_contact||null) : null,
      school: isStudent ? (editForm.school||null) : null, major: isStudent ? (editForm.major||null) : null,
      advisor_name: isIntern ? (editForm.advisor_name||null) : null, advisor_contact: isIntern ? (editForm.advisor_contact||null) : null,
      intern_school: isIntern ? (editForm.intern_school||null) : null, intern_department: isIntern ? (editForm.intern_department||null) : null,
      license_exp: isProvider ? (editForm.license_exp||null) : null, bls_exp: isProvider ? (editForm.bls_exp||null) : null,
      dea_exp: isProvider ? (editForm.dea_exp||null) : null, ftca_exp: isProvider ? (editForm.ftca_exp||null) : null,
      tb_exp: isProvider ? (editForm.tb_exp||null) : null,
      default_role: editForm.default_role || null,
      end_date: editForm.end_date || null,
      status_reason: editForm.end_date ? (editForm.status_reason || null) : null,
      team: editForm.team || null,
    }
    const { error } = await supabase.from('profiles').update(updates).eq('id', selectedVolunteer.id)
    if (error) { showMessage(error.message, 'error'); setSaving(false); return }
    showMessage('Profile updated!', 'success')
    await audit('edited_volunteer', 'volunteer', selectedVolunteer.id, selectedVolunteer.full_name)
    // Patch local volunteer list — no round-trip SELECT
    const fresh = { ...selectedVolunteer, ...updates }
    setEditing(false)
    setSelectedVolunteer(fresh)
    setVolunteers(prev => prev.map(v => v.id === selectedVolunteer.id ? fresh : v))
    setSaving(false)
  }

  async function handleCreateVolunteer(e) {
    e.preventDefault()
    setCreating(true)
    const isProvider = newAffiliation === 'provider'
    const isIntern   = newAffiliation === 'intern'
    const isMission  = newAffiliation === 'missionary'
    const isStudent  = newAffiliation === 'student'
    const { data, error } = await supabase.auth.signUp({ email: newEmail, password: newPassword })
    if (error) { showMessage(error.message, 'error'); setCreating(false); return }
    const profileData = {
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
      default_role: newDefaultRole || null, end_date: newEndDate || null,
      status: 'active', status_reason: null,
    }
    const { error: pe } = await supabase.from('profiles').insert(profileData)
    if (pe) { showMessage(pe.message, 'error') } else {
      showMessage(`Account created for ${newName}!`, 'success')
      await audit('created_volunteer', 'volunteer', data.user.id, newName, newRole)
      // Append to local volunteers — no full re-fetch
      setVolunteers(prev => [...prev, profileData].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')))
      setNewName(''); setNewEmail(''); setNewPassword(''); setNewRole('volunteer')
      setNewAffiliation(''); setNewCredentials(''); setNewPhone(''); setNewLanguages('')
      setNewSmaName(''); setNewSmaContact(''); setNewSchool(''); setNewMajor('')
      setNewDefaultRole(''); setNewEndDate('')
      setNewAdvisorName(''); setNewAdvisorContact('')
      setNewInternSchool(''); setNewInternDepartment('')
      setNewProviderCreds({ license_exp: '', bls_exp: '', dea_exp: '', ftca_exp: '', tb_exp: '' })
    }
    setCreating(false)
  }

  // ── Derived lists ───────────────────────────────────────────────────────────
  const adminList = volunteers.filter(v => v.role === 'admin')
  const filteredShifts = shiftFilterVolId ? allShifts.filter(s => s.volunteer_id === shiftFilterVolId) : allShifts
  const userList = visibleVolunteers
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
  // Volunteers tab display only — hides Providers from the browsable list without
  // affecting the volunteer/shift-assignment dropdowns elsewhere, which still use userList.
  // Credentialing gets a restricted view: only clinical care volunteers (affiliation
  // === 'provider') and Pharmacy staff (default_role === 'Pharmacy').
  // Director is the only role that can see both Providers and non-Providers together
  // on this tab — everyone else keeps the existing filtered views.
  const volunteersTabList = isDirector
    ? userList
    : isCredentialing
    ? userList.filter(v => v.affiliation === 'provider' || v.default_role === 'Pharmacy')
    : userList.filter(v => v.default_role !== 'Provider')

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '6px' }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--muted)', animation: `bounce 1s infinite ${i * 0.15}s` }} />
        ))}
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading your page</p>
      <style>{`@keyframes bounce { 0%, 100% { transform: translateY(0); opacity: 0.4; } 50% { transform: translateY(-6px); opacity: 1; } }`}</style>
    </div>
  )

  if (accessDenied) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '1.5rem' }}>
      <p style={{ color: 'var(--muted)', fontSize: '0.95rem', textAlign: 'center', maxWidth: '420px' }}>
        Please meet with the Volunteer Committee to change your default role to a role that has administrative privileges.
      </p>
    </div>
  )

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>

        {/* Header */}
        {isMobile ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: '6px',
                background: 'none',
                border: 'none',
                width: '48px',
                height: '48px',
                cursor: 'pointer',
                padding: '0',
                alignItems: 'center',
              }}
            >
              <span style={{ width: '26px', height: '3px', background: 'var(--text)', borderRadius: '2px' }} />
              <span style={{ width: '26px', height: '3px', background: 'var(--text)', borderRadius: '2px' }} />
              <span style={{ width: '26px', height: '3px', background: 'var(--text)', borderRadius: '2px' }} />
            </button>
            <img
              src="/logo2.png"
              alt="Logo"
              style={{ width: '48px', height: '48px', objectFit: 'contain', borderRadius: '10px' }}
            />
          </div>
        ) : (
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
        )}

        {/* Stats — on mobile, only shown on the Live tab; unchanged (always shown) on desktop */}
        {(!isMobile || tab === 'dashboard') && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Not Clocked In',    value: expectedVolunteers.length, warn: expectedVolunteers.length > 0 },
              { label: 'Pending Call-Outs', value: visibleCallouts.filter(c => !c.status || c.status === 'pending').length, warn: visibleCallouts.filter(c => !c.status || c.status === 'pending').length > 0 },
              { label: 'Pending Hours',     value: visiblePendingHours.filter(h => !h.status || h.status === 'pending').length, warn: visiblePendingHours.some(h => !h.status || h.status === 'pending') },
            ].map(s => (
              <div key={s.label} style={{ ...card, textAlign: 'center', borderColor: s.warn ? 'var(--warn)' : 'var(--border)' }}>
                <p style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: s.warn ? 'var(--warn)' : 'var(--text)' }}>{s.value}</p>
                <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs — pill row on desktop; on mobile these live in the sidebar instead */}
        {!isMobile && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            {tabItems.map(([key, label]) => (
              <button key={key} onClick={() => switchTab(key)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: tab === key ? 'var(--accent)' : 'var(--surface)', color: tab === key ? '#fff' : 'var(--muted)', border: tab === key ? 'none' : '1px solid var(--border)' }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ── LIVE TAB ──────────────────────────────────────────────────────── */}
        {tab === 'dashboard' && (
          <Live
            schedule={visibleSchedule}
            callouts={visibleCallouts}
            activeShifts={visibleActiveShifts}
            volunteers={visibleVolunteers}
            onOpenVolunteer={openVolunteer}
          />
        )}

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
                {ROLES.filter(role => role !== 'Provider' && role !== 'Director').map(role => {
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
                                  {entry.week_pattern && entry.week_pattern !== 'every' && <span style={{ ...biweeklyBadge, fontSize: '0.65rem', borderRadius: '4px', padding: '0.1rem 0.35rem' }}>{entry.week_pattern === 'odd' ? '1st&3rd' : '2nd&4th'}</span>}
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
                          <button onClick={handleAddEntry} disabled={!addVolId || addingEntry} style={{ padding: '0.75rem 1.25rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{addingEntry ? '...' : 'Assign'}</button>
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
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <button onClick={() => setFiltersOpen(o => !o)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Filters</span>
                <span style={{ transform: filtersOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--muted)' }}>▾</span>
              </button>
              {filtersOpen && (
                <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <input placeholder="Search name or email…" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                    <select value={filterAffiliation} onChange={e => setFilterAffiliation(e.target.value)} style={inputStyle}><option value="all">All affiliations</option><option value="missionary">Missionary</option><option value="student">Student</option><option value="volunteer">Volunteer</option><option value="intern">Intern</option><option value="provider">Clinical Care Volunteer</option><option value="BYU">BYU</option><option value="UVU">UVU</option></select>
                    <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={inputStyle}><option value="all">All roles</option><option value="volunteer">Volunteer</option><option value="admin">Admin</option></select>
                    <select value={filterDefaultRole} onChange={e => setFilterDefaultRole(e.target.value)} style={inputStyle}><option value="all">All positions</option>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select>
                    <button onClick={() => setShowInactive(s => !s)} style={pillBtn(showInactive, false)}>{showInactive ? 'Hide Inactive' : 'Show Inactive'}</button>
                  </div>
                </div>
              )}
            </div>
            <ExpandableSection label="Volunteers" isOpen={volunteersOpen} onToggle={() => setVolunteersOpen(o => !o)} count={volunteersTabList.length}>
              {volunteersTabList.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontStyle: 'italic' }}>No volunteers match these filters.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {volunteersTabList.map(v => {
                    const isInactive = (v.status ?? 'active') === 'inactive'
                    return (
                      <div key={v.id} onClick={() => openVolunteer(v)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', background: isInactive ? 'rgba(156,163,175,0.06)' : 'var(--bg)', cursor: 'pointer', opacity: isInactive ? 0.7 : 1 }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: isInactive ? 'var(--muted)' : 'var(--accent)' }}>
                            {v.full_name?.charAt(0)}
                          </div>
                          <div><p style={{ fontWeight: 500 }}>{v.full_name}</p><p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{v.email}</p></div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                          {isInactive && <span style={badgeStyle('#9ca3af')}>inactive</span>}
                          {v.role === 'admin' && <span style={badgeStyle('#f59e0b')}>admin</span>}
                          {v.affiliation && <span style={badgeStyle(affiliationColor[v.affiliation] ?? '#9ca3af')}>{AFFILIATION_LABELS[v.affiliation] ?? v.affiliation}</span>}
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
                {/* Profile photo: click to view full size or to upload */}
                <div
                  onClick={() => { if (profilePhotoUrl) { setLightboxUrl(profilePhotoUrl) } else { photoInputRef.current?.click() } }}
                  title={profilePhotoUrl ? 'Click to view full size' : 'Click to upload photo'}
                  style={{ position: 'relative', width: '52px', height: '52px', borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.3rem', color: 'var(--accent)', border: '2px solid var(--accent)', overflow: 'hidden', cursor: 'pointer', flexShrink: 0 }}>
                  {profilePhotoLoading || uploadingPhoto ? (
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>…</span>
                  ) : profilePhotoUrl ? (
                    <img src={profilePhotoUrl} alt={selectedVolunteer.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span>{selectedVolunteer.full_name?.charAt(0)}</span>
                  )}
                  {/* Replace-photo button shown when a photo already exists */}
                  {profilePhotoUrl && !uploadingPhoto && (
                    <div onClick={e => { e.stopPropagation(); photoInputRef.current?.click() }} title="Replace photo"
                      style={{ position: 'absolute', bottom: 0, right: 0, width: '18px', height: '18px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg)', cursor: 'pointer' }}>
                      <span style={{ fontSize: '0.55rem', color: '#fff' }}>✎</span>
                    </div>
                  )}
                </div>
                <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleProfilePhotoUpload(f); e.target.value = '' }} />
                <div>
                  <h2 style={{ fontWeight: 600, fontSize: '1.2rem' }}>{selectedVolunteer.full_name}</h2>
                  <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{selectedVolunteer.email}</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', marginTop: '0.2rem' }}>
                    {loadingVolHours ? 'Loading hours…' : volunteerTotalHours !== null ? `${volunteerTotalHours}h total` : ''}
                  </p>
                </div>
              </div>
              <button onClick={() => setEditing(!editing)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: editing ? 'var(--surface)' : 'var(--accent)', color: editing ? 'var(--muted)' : '#fff', border: editing ? '1px solid var(--border)' : 'none' }}>{editing ? 'Cancel' : 'Edit'}</button>
            </div>

            {!editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {[
                    { label: 'Phone', value: selectedVolunteer.phone },
                    { label: 'Affiliation', value: AFFILIATION_LABELS[selectedVolunteer.affiliation] ?? selectedVolunteer.affiliation },
                    { label: 'Credentials / Skills', value: selectedVolunteer.credentials },
                    { label: 'Languages', value: selectedVolunteer.languages },
                    { label: 'Role', value: selectedVolunteer.role },
                    { label: 'Default Position', value: selectedVolunteer.default_role },
                    { label: 'End Date', value: selectedVolunteer.end_date || null },
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
                                {s.week_pattern && s.week_pattern !== 'every' && <span style={{ ...biweeklyBadge, fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '5px' }}>{s.week_pattern === 'odd' ? '1st & 3rd' : '2nd & 4th'}</span>}
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
                          <button onClick={() => handleStatusChange(isInactive ? 'active' : 'inactive', statusForm.status_reason)} disabled={changingStatus || (!isInactive && !statusForm.status_reason)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: (changingStatus || (!isInactive && !statusForm.status_reason)) ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', border: 'none', background: isInactive ? 'var(--accent)' : '#dc2626', color: '#fff', opacity: (!isInactive && !statusForm.status_reason) ? 0.5 : 1 }}>{changingStatus ? 'Saving...' : isInactive ? 'Reactivate' : 'Deactivate'}</button>
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
                  <div><label style={labelStyle}>Affiliation</label><select value={editForm.affiliation} onChange={e => setEditForm({...editForm, affiliation: e.target.value})} style={inputStyle}><option value="">— Select —</option><option value="missionary">Missionary</option><option value="intern">Intern</option><option value="student">Student</option><option value="volunteer">Volunteer</option><option value="provider">Clinical Care Volunteer</option></select></div>
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
                  <div>
                    <label style={labelStyle}>End Date <span style={{ textTransform: 'none', color: 'var(--muted)', fontSize: '0.72rem' }}>(auto-deactivates on this date)</span></label>
                    <input type="date" value={editForm.end_date || ''} onChange={e => setEditForm({ ...editForm, end_date: e.target.value })} style={inputStyle} />
                    {editForm.end_date && <p style={{ fontSize: '0.75rem', color: '#f97316', marginTop: '0.3rem' }}>⚠ A deactivation reason is required below.</p>}
                  </div>
                  {editForm.end_date && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Reason for deactivation <span style={{ color: '#ef4444' }}>*</span></label>
                      <select value={editForm.status_reason || ''} onChange={e => setEditForm({ ...editForm, status_reason: e.target.value })} style={inputStyle}>
                        <option value="">— Select reason —</option>
                        <option value="Graduated">Graduated</option>
                        <option value="Mission / Service Term Ended">Mission / Service Term Ended</option>
                        <option value="Schedule Conflict">Schedule Conflict</option>
                        <option value="Moved Away">Moved Away</option>
                        <option value="Personal / Unknown">Personal / Unknown</option>
                      </select>
                    </div>
                  )}
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
                <button onClick={handleSaveEdit} disabled={saving} style={{ padding: '0.85rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{saving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            )}
          </div>
        )}

        {/* ── PIPELINE ──────────────────────────────────────────────────────── */}
        {tab === 'pipeline' && <Pipeline supabase={supabase} profile={profile} onVolunteerCreated={() => loadVolunteers()} />}

        {/* ── SHIFTS TAB ────────────────────────────────────────────────────── */}
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
                    <button type="submit" disabled={creatingShift} style={{ flex: 1, padding: '0.85rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: creatingShift ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{creatingShift ? 'Creating...' : 'Create Entry'}</button>
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
                              <button onClick={() => handleShiftEditSave(s.id)} disabled={savingShift} style={{ padding: '0.55rem 1.1rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 600, cursor: savingShift ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem' }}>{savingShift ? 'Saving...' : 'Save'}</button>
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

        {/* ── CALLOUTS TAB ──────────────────────────────────────────────────── */}
        {tab === 'callouts' && (() => {
          const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
          const pendingCallouts  = callouts.filter(c => (!c.status || c.status === 'pending') && c.callout_date >= todayStr)
          const approvedCallouts = [...callouts.filter(c => c.status === 'approved' && !c.covered_by && c.callout_date >= todayStr)]
            .sort((a, b) => {
              const aPending = coverRequests.filter(r => r.callout_id === a.id && r.status === 'pending').length
              const bPending = coverRequests.filter(r => r.callout_id === b.id && r.status === 'pending').length
              return bPending - aPending
            })
          const sortedPendingCallouts = [...pendingCallouts].sort((a, b) => {
            const aHasCover = coverRequests.some(r => r.callout_id === a.id && r.status === 'pending') ? 0 : 1
            const bHasCover = coverRequests.some(r => r.callout_id === b.id && r.status === 'pending') ? 0 : 1
            return aHasCover - bHasCover
          })
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={card}>
                <button onClick={() => setPendingCalloutsOpen(o => !o)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', padding: 0, marginBottom: pendingCalloutsOpen ? '1.25rem' : 0 }}>
                  <h2 style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>Pending Call-Outs</h2>
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
                              {hasCoverRequest && <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>✦ Volunteer ready to cover</p>}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div>
                                  <span style={{ fontWeight: 600 }}>{c.profiles?.full_name}</span>
                                  <span style={{ marginLeft: '0.5rem', fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'capitalize' }}>{c.callout_date} · {c.day_of_week} {c.shift_time}</span>
                                  {c.role && <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: 'rgba(2,65,107,0.1)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.35)' }}>{c.role}</span>}
                                  {c.reason && <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: '0.25rem', fontStyle: 'italic' }}>{c.reason}</p>}
                                  {hasCoverRequest && (
                                    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                      {pendingCoverReqs.map(r => {
                                        const name = r.profiles?.full_name || volunteers.find(v => v.id === r.volunteer_id)?.full_name
                                        return (
                                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.82rem', color: '#22c55e', fontWeight: 500 }}>{name} wants to cover</span>
                                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                                              <button onClick={() => approveCover(r)} disabled={approvingCoverId === r.id} style={{ padding: '0.2rem 0.65rem', background: 'rgba(34,197,94,0.12)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.35)', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{approvingCoverId === r.id ? '...' : '✓ Assign'}</button>
                                              <button onClick={() => denyCover(r.id)} disabled={approvingCoverId === r.id} style={{ padding: '0.2rem 0.65rem', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>✕</button>
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
              {approvedCallouts.length > 0 && (
                <div style={card}>
                  <button onClick={() => setOpenShiftsOpen(o => !o)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', padding: 0, marginBottom: openShiftsOpen ? '1.25rem' : 0 }}>
                    <h2 style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>Open Shifts — Awaiting Coverage</h2>
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

        {/* ── HOURS TAB ─────────────────────────────────────────────────────── */}
        {tab === 'hours' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {hoursLoading ? (
              <p style={{ color: 'var(--muted)', padding: '1rem' }}>Loading...</p>
            ) : (
              <>
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
                <div style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontWeight: 600, color: 'var(--muted)' }}>Previously Reviewed</h2>
                    {reviewedHours.length === 0 && !reviewedHoursLoading && (
                      <button onClick={loadReviewedHoursFirstPage} style={{ padding: '0.4rem 0.9rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'DM Sans, sans-serif' }}>Load history</button>
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

        {/* ── AUDIT TAB ─────────────────────────────────────────────────────── */}
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
                <button onClick={loadAuditFirstPage} disabled={auditLoading} style={{ padding: '0.75rem 1.5rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: auditLoading ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{auditLoading ? 'Loading...' : 'Apply Filters'}</button>
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
                <div><label style={labelStyle}>Affiliation</label><select value={newAffiliation} onChange={e => setNewAffiliation(e.target.value)} style={inputStyle}><option value="">— Select —</option><option value="missionary">Missionary</option><option value="student">Student</option><option value="intern">Intern</option><option value="volunteer">Volunteer</option><option value="provider">Clinical Care Volunteer</option></select></div>
                <div><label style={labelStyle}>Credentials / Skills</label><input type="text" value={newCredentials} onChange={e => setNewCredentials(e.target.value)} placeholder="e.g. EMT, Phlebotomy" style={inputStyle} /></div>
                <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Languages Spoken</label><input value={newLanguages} onChange={e => setNewLanguages(e.target.value)} placeholder="e.g. Spanish, Mandarin" style={inputStyle} /></div>
                <div><label style={labelStyle}>Default Position</label><select value={newDefaultRole} onChange={e => setNewDefaultRole(e.target.value)} style={inputStyle}><option value="">— None —</option>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                <div>
                  <label style={labelStyle}>End Date <span style={{ textTransform: 'none', color: 'var(--muted)', fontSize: '0.72rem' }}>(optional — auto-deactivates on this date)</span></label>
                  <input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} style={inputStyle} />
                </div>
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
              <button type="submit" disabled={creating} style={{ padding: '0.85rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{creating ? 'Creating...' : 'Create Account'}</button>
            </form>
          </div>
        )}

        {tab === 'providers' && <Providers supabase={supabase} />}
        {tab === 'data'      && <DataDashboard supabase={supabase} />}
        {tab === 'training'  && <WeeklyTraining supabase={supabase} profile={profile} />}
        {tab === 'languages' && canSeeLanguageCoverage && (
          <LanguageCoverage volunteers={volunteers} schedule={schedule} />
        )}
        {/* 
        {tab === 'lunch'     && <LunchScheduler supabase={supabase} profile={profile} />}
        */}
        {tab === 'tasks' && (
          <AdminTasks
            currentUserId={profile.id}
            volunteers={volunteers}
            onVolunteerTeamUpdate={(volId, newTeam) =>
              setVolunteers(prev =>
                prev.map(v => v.id === volId ? { ...v, team: newTeam } : v)
              )
            }
          />
        )}

        {/* Mobile sidebar — holds the tabs (as pills would show on desktop), plus
            Volunteer View / Sign out, which move here from the header on mobile. */}
        <AdminSidebar
          open={isMobile && sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          navItems={tabItems}
          activeTab={tab}
          onSelectTab={switchTab}
          onSwitchView={() => window.location.href = '/volunteer'}
          onSignOut={async () => { await supabase.auth.signOut(); window.location.href = '/' }}
        />

        {/* Toast */}
        {toast && (
          <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'success' ? 'var(--accent)' : 'var(--danger)', color: '#fff', padding: '0.75rem 1.5rem', borderRadius: '100px', fontWeight: 500, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 100 }}>
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

      <footer
        style={{
          marginTop: '3rem',
          padding: '1.5rem',
          textAlign: 'center',
          borderTop: '1px solid var(--border)'
        }}
      >
        <p style={{ fontSize: '0.78rem', color: '#474b52', margin: 0 }}>
          <a
            href="/privacy"
            style={{ color: '#474b52', textDecoration: 'none' }}
          >
            Privacy Policy
          </a>
          &nbsp;·&nbsp;
          <a
            href="/terms"
            style={{ color: '#474b52', textDecoration: 'none' }}
          >
            Terms of Service
          </a>
        </p>
      </footer>

    </div>
  )
}