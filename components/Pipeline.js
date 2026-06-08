'use client'
import { useState, useEffect, useRef } from 'react'
import { ROLES, SHIFTS, ROLE_SUGGESTIONS, SCHOOLS, MAJORS } from '../lib/constants'

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']

const ALL_SLOTS = DAYS.flatMap(day =>
  SHIFTS.map(shift => ({
    key: `${day}-${shift}`,
    day,
    shift,
    label: `${day.slice(0,3).charAt(0).toUpperCase()}${day.slice(1,3)} ${shift}`
  }))
)

function parseSlotKey(key) {
  const idx   = key.indexOf('-')
  const day   = key.slice(0, idx)
  const shift = key.slice(idx + 1)
  return { day, shift }
}

const STAGES       = ['applied', 'interview', 'onboarding', 'rejected']
const STAGE_LABELS = { applied: 'Applied', interview: 'Interview', onboarding: 'Onboarding', rejected: 'Rejected' }

// ── Blue-only palette ─────────────────────────────────────────────────────────
const C = {
  primary:  '#02416b',
  blue:     '#0369a1',
  light:    '#0ea5e9',
  pale:     '#bae6fd',
  muted:    '#7dd3fc',
  warn:     '#0284c7',
  danger:   '#1e40af',
  success:  '#0369a1',
}

const STAGE_COLORS = {
  applied:    C.light,
  interview:  C.warn,
  onboarding: C.blue,
  rejected:   C.danger,
}

const AFFILIATION_OPTIONS = [
  { value: 'missionary', label: 'Missionary' },
  { value: 'student',    label: 'Student'    },
  { value: 'intern',     label: 'Intern'     },
  { value: 'volunteer',  label: 'Volunteer'  },
  { value: 'provider',   label: 'Provider'   },
]

const PROVIDER_CRED_FIELDS = [
  { key: 'license_exp', label: 'License'            },
  { key: 'bls_exp',     label: 'BLS'                },
  { key: 'dea_exp',     label: 'DEA', allowNA: true },
  { key: 'ftca_exp',    label: 'FTCA'               },
  { key: 'tb_exp',      label: 'TB'                 },
]

const CHECKLIST_ITEMS = [
  { key: 'background_check',          label: 'Background Check',          mandatory: true,  bucket: 'onboarding-background-checks', urlKey: 'background_check_url'  },
  { key: 'id_check',                  label: 'ID',                        mandatory: true,  bucket: 'onboarding-ids',               urlKey: 'id_check_url'          },
  { key: 'immunization',              label: 'Immunization',              mandatory: true,  bucket: 'onboarding-immunizations',     urlKey: 'immunization_url'      },
  { key: 'tb_test',                   label: 'TB Test',                   mandatory: true,  bucket: 'onboarding-tb-tests',          urlKey: 'tb_test_url'           },
  { key: 'licenses_certifications',   label: 'Licenses & Certifications', mandatory: false, bucket: 'onboarding-licenses',           urlKey: 'licenses_url'          },
  { key: 'confidentiality_agreement', label: 'Confidentiality Agreement', mandatory: false, bucket: 'onboarding-confidentiality',   urlKey: 'confidentiality_url'   },
  { key: 'welcome_packet',            label: 'Welcome Packet',            mandatory: true,  bucket: null,                           urlKey: null                    },
  { key: 'parking_pass',              label: 'Parking Pass',              mandatory: false, bucket: 'onboarding-parking-passes',    urlKey: 'parking_pass_url'      },
]

const FILE_CHECKLIST_ITEMS = CHECKLIST_ITEMS.filter(i => i.bucket && i.urlKey)
const NON_MISSIONARY_REQUIRED = ['background_check', 'id_check', 'immunization', 'welcome_packet']

const TOTAL_STEPS = 5

// ─── Slot picker ──────────────────────────────────────────────────────────────
function SlotPicker({ selected, onChange }) {
  const toggle = (key) =>
    onChange(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `120px repeat(${SHIFTS.length}, 1fr)`, gap: '0.35rem', alignItems: 'center' }}>
        <div />
        {SHIFTS.map(s => (
          <div key={s} style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, color: C.muted, fontFamily: 'DM Mono, monospace', letterSpacing: '0.04em' }}>{s}</div>
        ))}
      </div>
      {DAYS.map(day => (
        <div key={day} style={{ display: 'grid', gridTemplateColumns: `120px repeat(${SHIFTS.length}, 1fr)`, gap: '0.35rem', alignItems: 'center' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text)', textTransform: 'capitalize', paddingRight: '0.5rem' }}>{day}</div>
          {SHIFTS.map(shift => {
            const key    = `${day}-${shift}`
            const active = selected.includes(key)
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggle(key)}
                style={{
                  padding: '0.5rem 0.25rem',
                  borderRadius: '8px',
                  border: `1px solid ${active ? C.blue + '88' : 'var(--border)'}`,
                  background: active ? C.blue + '1a' : 'var(--bg)',
                  color: active ? C.blue : 'var(--muted)',
                  fontWeight: active ? 700 : 400,
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  fontFamily: 'DM Mono, monospace',
                  transition: 'all 0.12s',
                  textAlign: 'center',
                }}
              >
                {active ? '✓' : '○'}
              </button>
            )
          })}
        </div>
      ))}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', paddingTop: '0.25rem' }}>
        <button type="button" onClick={() => onChange(ALL_SLOTS.map(s => s.key))} style={{ padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>All</button>
        <button type="button" onClick={() => onChange([])} style={{ padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>None</button>
        {SHIFTS.map(shift => (
          <button key={shift} type="button"
            onClick={() => {
              const shiftKeys = DAYS.map(d => `${d}-${shift}`)
              const allOn     = shiftKeys.every(k => selected.includes(k))
              onChange(allOn ? selected.filter(k => !shiftKeys.includes(k)) : [...new Set([...selected, ...shiftKeys])])
            }}
            style={{ padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Mono, monospace', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
          >All {shift}</button>
        ))}
      </div>
    </div>
  )
}

// ─── Role picker ──────────────────────────────────────────────────────────────
function RolePicker({ selected, onChange }) {
  const toggle = (r) => onChange(selected.includes(r) ? selected.filter(x => x !== r) : [...selected, r])
  return (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
      {ROLES.map(r => {
        const active = selected.includes(r)
        return (
          <button key={r} type="button" onClick={() => toggle(r)} style={{ padding: '0.35rem 0.8rem', borderRadius: '100px', fontSize: '0.78rem', fontWeight: active ? 600 : 400, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', border: `1px solid ${active ? C.blue + '66' : 'var(--border)'}`, background: active ? C.blue + '18' : 'var(--bg)', color: active ? C.blue : 'var(--muted)', transition: 'all 0.12s' }}>{r}</button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Pipeline({ supabase, profile, onVolunteerCreated }) {

  // Pipeline state
  const [applicants,      setApplicants]      = useState([])
  const [completed,       setCompleted]       = useState([])
  const [loading,         setLoading]         = useState(true)
  const [loadError,       setLoadError]       = useState(null)
  const [selected,        setSelected]        = useState(null)
  const [activeTab,       setActiveTab]       = useState('pipeline')
  const [stageFilter,     setStageFilter]     = useState('applied')
  const [movingStage,     setMovingStage]     = useState(false)
  const [interviewDate,   setInterviewDate]   = useState('')
  const [interviewTime,   setInterviewTime]   = useState('')
  const [savingInterview, setSavingInterview] = useState(false)
  const [creatingProfile, setCreatingProfile] = useState(false)

  // ── Parking pass modal state ───────────────────────────────────────────────
  // context: { applicantId, applicantName, isRecent } — isRecent=true when opened from Recently Added
  const [parkingPassModal,  setParkingPassModal]  = useState(null)
  const [parkingPassSaving, setParkingPassSaving] = useState(false)
  const parkingPassIframeRef = useRef(null)

  // ── Confidentiality agreement modal state ─────────────────────────────────
  // Mirrors parking pass exactly: same context shape, same lifecycle
  const [confidentialityModal,  setConfidentialityModal]  = useState(null)
  const [confidentialitySaving, setConfidentialitySaving] = useState(false)
  const confidentialityIframeRef = useRef(null)

  // Recently Added state
  const [recentChecklist,    setRecentChecklist]    = useState({})
  const [recentUploadingKey, setRecentUploadingKey] = useState(null)
  const [offloadingId,       setOffloadingId]       = useState(null)
  const [expandedId,         setExpandedId]         = useState(null)
  const [recentPhotoUrls,    setRecentPhotoUrls]    = useState({})   // { [applicantId]: signedUrl }
  const [recentPhotoUploading, setRecentPhotoUploading] = useState(null) // applicantId currently uploading

  // Onboarding form
  const EMPTY_FORM = {
    affiliation: '', sma_name: '', sma_contact: '',
    school: '', major: '',
    intern_school: '', intern_department: '', advisor_name: '', advisor_contact: '',
    credentials: '',
    license_exp: '', bls_exp: '', dea_exp: '', ftca_exp: '', tb_exp: '',
    birthday: '', default_role: '',
    preferred_slots: [],
    preferred_roles: [],
  }
  const [onboardForm,  setOnboardForm]  = useState(EMPTY_FORM)
  const [onboardStep,  setOnboardStep]  = useState(1)
  const [savingStep,   setSavingStep]   = useState(false)

  const EMPTY_CHECKLIST = {
    confidentiality_agreement: false,
    tb_test: false,
    background_check: false,
    welcome_packet: false,
    parking_pass: false,
    id_check: false,
    immunization: false,
    licenses_certifications: false,
    licenses_url: null,
    background_check_url: null,
    id_check_url: null,
    confidentiality_url: null,
    immunization_url: null,
    tb_test_url: null,
    parking_pass_url: null,
  }
  const [checklist,       setChecklist]       = useState(EMPTY_CHECKLIST)
  const [savingChecklist, setSavingChecklist] = useState(false)
  const [uploadingKey,    setUploadingKey]    = useState(null)

  const [toast, setToast] = useState(null)

  // ── Applicant profile photo state ──────────────────────────────────────────
  const [applicantPhotoUrl,       setApplicantPhotoUrl]       = useState(null)
  const [uploadingApplicantPhoto, setUploadingApplicantPhoto] = useState(false)
  const [applicantAvatarPath,     setApplicantAvatarPath]     = useState(null)
  const applicantPhotoInputRef = useRef(null)

  useEffect(() => { loadAll() }, [])

  // ── Parking pass PDF message listener ─────────────────────────────────────
  useEffect(() => {
    async function onMessage(e) {
      if (!e.data || e.data.type !== 'parking_pass_pdf') return
      if (!parkingPassModal) return

      const { base64, volunteer_name, pass_number, date_issued } = e.data
      const { applicantId, isRecent } = parkingPassModal

      setParkingPassSaving(true)
      try {
        const byteChars = atob(base64)
        const byteNums  = new Array(byteChars.length)
        for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i)
        const blob     = new Blob([new Uint8Array(byteNums)], { type: 'application/pdf' })
        const filename = `${applicantId}/parking_pass-${Date.now()}.pdf`

        const { error: upErr } = await supabase.storage
          .from('onboarding-parking-passes').upload(filename, blob, { contentType: 'application/pdf', upsert: true })

        if (upErr) {
          msg(upErr.message, 'error')
          parkingPassIframeRef.current?.contentWindow?.postMessage(
            { type: 'parking_pass_error', message: upErr.message }, '*'
          )
          setParkingPassSaving(false)
          return
        }

        if (isRecent) {
          const existing = recentChecklist[applicantId] || { ...EMPTY_CHECKLIST }
          const next     = { ...existing, parking_pass: true, parking_pass_url: filename }
          setRecentChecklist(prev => ({ ...prev, [applicantId]: next }))
          await supabase.from('onboarding_checklists')
            .upsert({ applicant_id: applicantId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'applicant_id' })
        } else {
          const next = { ...checklist, parking_pass: true, parking_pass_url: filename }
          setChecklist(next)
          await supabase.from('onboarding_checklists')
            .upsert({ applicant_id: applicantId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'applicant_id' })
        }

        await audit('parking_pass_generated', 'applicant', applicantId, volunteer_name,
          `Pass #${pass_number || '—'}, issued ${date_issued}`)

        parkingPassIframeRef.current?.contentWindow?.postMessage({ type: 'parking_pass_saved' }, '*')
        msg('Parking pass PDF saved')
        setParkingPassModal(null)
      } catch (err) {
        msg(err.message || 'Upload failed', 'error')
        parkingPassIframeRef.current?.contentWindow?.postMessage(
          { type: 'parking_pass_error', message: err.message }, '*'
        )
      }
      setParkingPassSaving(false)
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [parkingPassModal, checklist, recentChecklist])

  // ── Confidentiality agreement PDF message listener ────────────────────────
  // Mirrors the parking pass listener exactly — only message types and storage
  // bucket differ; all state update, audit, and error patterns are identical.
  useEffect(() => {
    async function onMessage(e) {
      if (!e.data || e.data.type !== 'confidentiality_agreement_pdf') return
      if (!confidentialityModal) return

      const { base64, printed_name, date_signed } = e.data
      const { applicantId, isRecent } = confidentialityModal

      setConfidentialitySaving(true)
      try {
        const byteChars = atob(base64)
        const byteNums  = new Array(byteChars.length)
        for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i)
        const blob     = new Blob([new Uint8Array(byteNums)], { type: 'application/pdf' })
        const filename = `${applicantId}/confidentiality_agreement-${Date.now()}.pdf`

        const { error: upErr } = await supabase.storage
          .from('onboarding-confidentiality').upload(filename, blob, { contentType: 'application/pdf', upsert: true })

        if (upErr) {
          msg(upErr.message, 'error')
          confidentialityIframeRef.current?.contentWindow?.postMessage(
            { type: 'confidentiality_agreement_error', message: upErr.message }, '*'
          )
          setConfidentialitySaving(false)
          return
        }

        if (isRecent) {
          const existing = recentChecklist[applicantId] || { ...EMPTY_CHECKLIST }
          const next     = { ...existing, confidentiality_agreement: true, confidentiality_url: filename }
          setRecentChecklist(prev => ({ ...prev, [applicantId]: next }))
          await supabase.from('onboarding_checklists')
            .upsert({ applicant_id: applicantId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'applicant_id' })
        } else {
          const next = { ...checklist, confidentiality_agreement: true, confidentiality_url: filename }
          setChecklist(next)
          await supabase.from('onboarding_checklists')
            .upsert({ applicant_id: applicantId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'applicant_id' })
        }

        await audit('confidentiality_agreement_signed', 'applicant', applicantId, printed_name,
          `Signed by ${printed_name} on ${date_signed}`)

        confidentialityIframeRef.current?.contentWindow?.postMessage(
          { type: 'confidentiality_agreement_saved' }, '*'
        )
        msg('Confidentiality agreement PDF saved')
        setConfidentialityModal(null)
      } catch (err) {
        msg(err.message || 'Upload failed', 'error')
        confidentialityIframeRef.current?.contentWindow?.postMessage(
          { type: 'confidentiality_agreement_error', message: err.message }, '*'
        )
      }
      setConfidentialitySaving(false)
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [confidentialityModal, checklist, recentChecklist])

  // ─── Loaders ──────────────────────────────────────────────────────────────

  async function loadAll() {
    setLoading(true); setLoadError(null)
    const [appRes, compRes] = await Promise.all([
      supabase.from('volunteer_applications').select('*').in('stage', STAGES).order('created_at', { ascending: false }),
      supabase.from('volunteer_applications').select('*').eq('stage', 'completed').order('full_name', { ascending: true }),
    ])
    if (appRes.error)  { setLoadError(appRes.error.message); setApplicants([]) }
    else setApplicants(appRes.data || [])
    if (!compRes.error) {
      const completedApps = compRes.data || []
      setCompleted(completedApps)
      if (completedApps.length > 0) await loadRecentChecklists(completedApps.map(a => a.id))
    }
    setLoading(false)
  }

  async function loadApplicants() {
    const { data, error } = await supabase
      .from('volunteer_applications').select('*').in('stage', STAGES).order('created_at', { ascending: false })
    if (error) { setLoadError(error.message); setApplicants([]) }
    else setApplicants(data || [])
  }

  async function loadCompleted() {
    const { data, error } = await supabase
      .from('volunteer_applications').select('*').eq('stage', 'completed').order('full_name', { ascending: true })
    if (!error && data) {
      setCompleted(data)
      if (data.length > 0) {
        const ids = data.map(a => a.id)
        await loadRecentChecklists(ids)
      }
    }
  }

  async function loadRecentChecklists(ids) {
    if (!ids.length) return
    const { data } = await supabase.from('onboarding_checklists').select('*').in('applicant_id', ids)
    if (data) {
      const map = {}
      data.forEach(row => {
        map[row.applicant_id] = {
          confidentiality_agreement: row.confidentiality_agreement ?? false,
          tb_test:          row.tb_test          ?? false,
          background_check: row.background_check ?? false,
          welcome_packet:   row.welcome_packet   ?? false,
          parking_pass:     row.parking_pass     ?? false,
          id_check:         row.id_check         ?? false,
          immunization:     row.immunization     ?? false,
          licenses_certifications: row.licenses_certifications ?? false,
          licenses_url:            row.licenses_url ?? null,
          background_check_url: row.background_check_url ?? null,
          id_check_url:     row.id_check_url     ?? null,
          confidentiality_url: row.confidentiality_url ?? null,
          immunization_url: row.immunization_url ?? null,
          tb_test_url:      row.tb_test_url      ?? null,
          parking_pass_url: row.parking_pass_url ?? null,
        }
      })
      setRecentChecklist(map)
    }
  }

  async function loadChecklist(applicantId) {
    const { data } = await supabase.from('onboarding_checklists').select('*').eq('applicant_id', applicantId).maybeSingle()
    setChecklist(data ? {
      confidentiality_agreement: data.confidentiality_agreement ?? false,
      tb_test:          data.tb_test          ?? false,
      background_check: data.background_check ?? false,
      welcome_packet:   data.welcome_packet   ?? false,
      parking_pass:     data.parking_pass     ?? false,
      id_check:         data.id_check         ?? false,
      immunization:     data.immunization     ?? false,
      licenses_certifications: data.licenses_certifications ?? false,
      licenses_url:            data.licenses_url ?? null,
      background_check_url: data.background_check_url ?? null,
      id_check_url:     data.id_check_url     ?? null,
      confidentiality_url: data.confidentiality_url ?? null,
      immunization_url: data.immunization_url ?? null,
      tb_test_url:      data.tb_test_url      ?? null,
      parking_pass_url: data.parking_pass_url ?? null,
    } : EMPTY_CHECKLIST)
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function msg(text, type = 'success') { setToast({ text, type }); setTimeout(() => setToast(null), 3500) }

  async function audit(action, target_type, target_id, target_name, details) {
    try {
      await supabase.from('audit_logs').insert({
        admin_id: profile.id, action, target_type,
        target_id:   target_id   ? String(target_id) : null,
        target_name: target_name || null,
        details:     details     || null,
      })
    } catch (e) { console.error('audit failed:', e) }
  }

  async function saveOnboardProgress(applicantId, patch) {
    setSavingStep(true)
    await supabase.from('volunteer_applications').update(patch).eq('id', applicantId)
    setSavingStep(false)
  }

  function formatInterviewDateTime(isoString) {
    if (!isoString) return null
    const d    = new Date(isoString)
    const date = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
    const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0
    return hasTime ? `${date} at ${time}` : date
  }

  // ─── Pipeline actions ─────────────────────────────────────────────────────

  async function moveToStage(applicant, stage) {
    setMovingStage(true)
    const { error } = await supabase.from('volunteer_applications')
      .update({ stage, stage_updated_at: new Date().toISOString() }).eq('id', applicant.id)
    if (error) msg(error.message, 'error')
    else {
      msg(`Moved to ${STAGE_LABELS[stage]}`)
      await audit(`pipeline_${stage}`, 'applicant', applicant.id, applicant.full_name, stage)
      await loadApplicants()
      setSelected(prev => prev?.id === applicant.id ? { ...prev, stage } : prev)
    }
    setMovingStage(false)
  }

  async function saveInterviewTime(applicant) {
    if (!interviewDate) return
    setSavingInterview(true)
    const iso = interviewTime
      ? new Date(`${interviewDate}T${interviewTime}`).toISOString()
      : new Date(`${interviewDate}T00:00`).toISOString()
    const { error } = await supabase.from('volunteer_applications')
      .update({ interview_scheduled_at: iso }).eq('id', applicant.id)
    if (error) msg(error.message, 'error')
    else { msg('Interview scheduled'); await loadApplicants(); setSelected(p => p?.id === applicant.id ? { ...p, interview_scheduled_at: iso } : p) }
    setSavingInterview(false)
  }

  async function toggleChecklistItem(applicantId, key, value) {
    setSavingChecklist(true)
    const next = { ...checklist, [key]: value }
    setChecklist(next)
    const { error } = await supabase.from('onboarding_checklists')
      .upsert({ applicant_id: applicantId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'applicant_id' })
    if (error) { msg(error.message, 'error'); setChecklist(checklist) }
    setSavingChecklist(false)
  }

  async function handleFileUpload(applicantId, item, file) {
    if (!file || !item.bucket || !item.urlKey) return
    setUploadingKey(item.key)
    try {
      const ext  = file.name.split('.').pop()
      const path = `${applicantId}/${item.key}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from(item.bucket).upload(path, file, { upsert: true })
      if (upErr) { msg(upErr.message, 'error'); setUploadingKey(null); return }
      const next = { ...checklist, [item.urlKey]: path }
      setChecklist(next)
      const { error: dbErr } = await supabase.from('onboarding_checklists')
        .upsert({ applicant_id: applicantId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'applicant_id' })
      if (dbErr) msg(dbErr.message, 'error')
      else msg(`${item.label} uploaded`)
    } catch (e) { msg(e.message, 'error') }
    setUploadingKey(null)
  }

  // ─── Recently Added: per-item file upload ─────────────────────────────────

  async function handleRecentFileUpload(applicantId, item, file) {
    if (!file || !item.bucket || !item.urlKey) return
    const uploadKey = `${applicantId}-${item.key}`
    setRecentUploadingKey(uploadKey)
    try {
      const ext  = file.name.split('.').pop()
      const path = `${applicantId}/${item.key}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from(item.bucket).upload(path, file, { upsert: true })
      if (upErr) { msg(upErr.message, 'error'); setRecentUploadingKey(null); return }
      const existing = recentChecklist[applicantId] || { ...EMPTY_CHECKLIST }
      const next = {
        ...existing,
        [item.urlKey]: path,
        [item.key]:    true,
      }
      setRecentChecklist(prev => ({ ...prev, [applicantId]: next }))
      const { error: dbErr } = await supabase.from('onboarding_checklists')
        .upsert({ applicant_id: applicantId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'applicant_id' })
      if (dbErr) msg(dbErr.message, 'error')
      else msg(`${item.label} uploaded`)
    } catch (e) { msg(e.message, 'error') }
    setRecentUploadingKey(null)
  }

  async function handleRecentPhotoUpload(applicantId, file) {
    if (!file) return
    setRecentPhotoUploading(applicantId)
    try {
      const compressed = await compressImage(file)
      const path = `${applicantId}/avatar.jpg`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, compressed, { contentType: 'image/jpeg', upsert: true })
      if (upErr) { msg(upErr.message, 'error'); setRecentPhotoUploading(null); return }
      // Also write avatar_url to the profile row (volunteer_id links application → profile)
      const app = completed.find(a => a.id === applicantId)
      if (app?.volunteer_id) {
        await supabase.from('profiles').update({ avatar_url: path }).eq('id', app.volunteer_id)
      }
      const { data } = await supabase.storage.from('avatars').createSignedUrl(path, 3600)
      if (data?.signedUrl) {
        setRecentPhotoUrls(prev => ({ ...prev, [applicantId]: data.signedUrl }))
      }
      msg('Photo uploaded!')
    } catch (e) {
      msg('Upload failed: ' + e.message, 'error')
    }
    setRecentPhotoUploading(null)
  }

  async function openFile(bucket, storagePath) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 120)
    if (error) { msg('Could not open file', 'error'); return }
    window.open(data.signedUrl, '_blank')
  }

  async function openResume(resumeUrl) {
    if (!resumeUrl) return
    const { data, error } = await supabase.storage.from('resumes').createSignedUrl(resumeUrl, 60)
    if (error) { msg('Could not load resume', 'error'); return }
    window.open(data.signedUrl, '_blank')
  }

  // ─── Applicant photo helpers ──────────────────────────────────────────────

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

  async function handleApplicantPhotoUpload(file) {
    if (!file || !selected) return
    setUploadingApplicantPhoto(true)
    try {
      const compressed = await compressImage(file)
      const path = `${selected.id}/avatar.jpg`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, compressed, { contentType: 'image/jpeg', upsert: true })
      if (upErr) { msg(upErr.message, 'error'); setUploadingApplicantPhoto(false); return }
      const { data } = await supabase.storage.from('avatars').createSignedUrl(path, 3600)
      setApplicantPhotoUrl(data?.signedUrl || null)
      setApplicantAvatarPath(path)
      msg('Photo uploaded!')
    } catch (e) {
      msg('Upload failed: ' + e.message, 'error')
    }
    setUploadingApplicantPhoto(false)
  }

  // ─── Offload ──────────────────────────────────────────────────────────────

  async function handleOffload(applicant) {
    setOffloadingId(applicant.id)
    try {
      const cl = recentChecklist[applicant.id] || {}
      const fileEntries = []

      if (applicant.resume_url) {
        const { data: rData, error: rErr } = await supabase.storage.from('resumes').createSignedUrl(applicant.resume_url, 300)
        if (!rErr && rData?.signedUrl) {
          const ext = applicant.resume_url.split('.').pop()
          fileEntries.push({ label: 'Resume', url: rData.signedUrl, filename: `resume.${ext}` })
        }
      }

      for (const item of FILE_CHECKLIST_ITEMS) {
        const storagePath = cl[item.urlKey]
        if (!storagePath) continue
        const { data, error } = await supabase.storage.from(item.bucket).createSignedUrl(storagePath, 300)
        if (!error && data?.signedUrl) {
          fileEntries.push({ label: item.label, url: data.signedUrl, filename: `${item.key}.${storagePath.split('.').pop()}` })
        }
      }

      if (fileEntries.length === 0) {
        msg('No files to download — marking as offloaded', 'success')
      } else {
        let JSZip = null
        try { JSZip = (await import('jszip')).default } catch (_) {}

        if (JSZip) {
          const zip    = new JSZip()
          const folder = zip.folder(applicant.full_name.replace(/\s+/g, '_'))
          for (const entry of fileEntries) {
            try { const res = await fetch(entry.url); folder.file(entry.filename, await res.blob()) }
            catch (e) { console.warn(`Could not fetch ${entry.label}:`, e) }
          }
          const zipBlob = await zip.generateAsync({ type: 'blob' })
          const link = document.createElement('a')
          link.href = URL.createObjectURL(zipBlob)
          link.download = `${applicant.full_name.replace(/\s+/g, '_')}_files.zip`
          link.click()
          URL.revokeObjectURL(link.href)
        } else {
          for (const entry of fileEntries) {
            const link = document.createElement('a')
            link.href = entry.url; link.download = entry.filename; link.target = '_blank'
            document.body.appendChild(link); link.click(); document.body.removeChild(link)
            await new Promise(r => setTimeout(r, 400))
          }
        }
      }

      await supabase.from('volunteer_applications')
        .update({ stage: 'offloaded', offloaded_at: new Date().toISOString() }).eq('id', applicant.id)
      await audit('offloaded_volunteer', 'volunteer', applicant.id, applicant.full_name, 'files downloaded, removed from recently added')
      msg(`${applicant.full_name} offloaded successfully`)
      setCompleted(prev => prev.filter(a => a.id !== applicant.id))
      setRecentChecklist(prev => { const next = { ...prev }; delete next[applicant.id]; return next })
    } catch (e) {
      msg(e.message || 'Offload failed', 'error')
    }
    setOffloadingId(null)
  }

  // ─── Create volunteer profile ──────────────────────────────────────────────

  async function handleCreateProfile() {
    if (!selected) return
    const affil = onboardForm.affiliation
    if (!affil)                    { msg('Select an affiliation', 'error'); setOnboardStep(1); return }
    if (!onboardForm.birthday)     { msg('Birthday is required',  'error'); setOnboardStep(2); return }
    if (!onboardForm.default_role) { msg('Select a default position', 'error'); setOnboardStep(3); return }

    const _missingDocs = getMissingRequiredDocs()
    if (_missingDocs.length > 0) {
      msg(`Missing required docs: ${_missingDocs.join(', ')}`, 'error')
      setOnboardStep(5)
      return
    }

    setCreatingProfile(true)

    const { data: fnData, error: fnErr } = await supabase.functions.invoke('create-volunteer', {
      body: { email: selected.email, password: 'BFC2025!' },
    })
    if (fnErr) { msg(fnErr.message, 'error'); setCreatingProfile(false); return }
    if (fnData?.error) { msg(fnData.error, 'error'); setCreatingProfile(false); return }
    const authData = fnData

    const uid        = authData.user.id
    const isProvider = affil === 'provider'
    const affiliData = onboardForm

    const { error: profileErr } = await supabase.from('profiles').insert({
      id: uid, full_name: selected.full_name, email: selected.email,
      phone: selected.phone || null, role: 'volunteer', affiliation: affil || null,
      languages: selected.languages || null,
      default_role: affiliData.default_role || null,
      birthday:     affiliData.birthday     || null,
      status: 'active',
      avatar_url: applicantAvatarPath || null,
      sma_name:    affil === 'missionary' ? (affiliData.sma_name    || null) : null,
      sma_contact: affil === 'missionary' ? (affiliData.sma_contact || null) : null,
      school:      affil === 'student'    ? (affiliData.school      || null) : null,
      major:       affil === 'student'    ? (affiliData.major       || null) : null,
      intern_school:     affil === 'intern' ? (affiliData.intern_school     || null) : null,
      intern_department: affil === 'intern' ? (affiliData.intern_department || null) : null,
      advisor_name:      affil === 'intern' ? (affiliData.advisor_name      || null) : null,
      advisor_contact:   affil === 'intern' ? (affiliData.advisor_contact   || null) : null,
      credentials: isProvider ? (affiliData.credentials || null) : (selected.credentials || null),
      license_exp: isProvider ? (affiliData.license_exp || null) : null,
      bls_exp:     isProvider ? (affiliData.bls_exp     || null) : null,
      dea_exp:     isProvider ? (affiliData.dea_exp     || null) : null,
      ftca_exp:    isProvider ? (affiliData.ftca_exp    || null) : null,
      tb_exp:      isProvider ? (affiliData.tb_exp      || null) : null,
    })
    if (profileErr) { msg(profileErr.message, 'error'); setCreatingProfile(false); return }

    const { error: waitlistErr } = await supabase.from('waitlist').insert({
      volunteer_id:    uid,
      preferred_slots: affiliData.preferred_slots ?? [],
      preferred_roles: affiliData.preferred_roles ?? [],
      source:          'pipeline',
      added_by:        profile.id,
    })
    if (waitlistErr) msg(`Profile created but waitlist insert failed: ${waitlistErr.message}`, 'error')

    const { error: appErr } = await supabase.from('volunteer_applications')
      .update({ stage: 'completed', volunteer_id: uid, stage_updated_at: new Date().toISOString() })
      .eq('id', selected.id)
    if (appErr) msg(`Profile created but application stage update failed: ${appErr.message}`, 'error')

    await audit('created_volunteer', 'volunteer', uid, selected.full_name, 'from pipeline → added to waitlist')
    if (!waitlistErr && !appErr) msg(`Profile created for ${selected.full_name} — added to waitlist`)
    if (onVolunteerCreated) onVolunteerCreated()

    setSelected(null)
    setOnboardStep(1)
    setOnboardForm(EMPTY_FORM)
    setChecklist(EMPTY_CHECKLIST)
    setApplicantPhotoUrl(null)
    setApplicantAvatarPath(null)

    await loadAll()
    setActiveTab('recent')
    setCreatingProfile(false)
  }

  // ─── Select applicant ─────────────────────────────────────────────────────

  function selectApplicant(a) {
    setSelected(a)
    setOnboardStep(1)
    setChecklist(EMPTY_CHECKLIST)
    setInterviewDate(new Date().toISOString().slice(0, 10)); setInterviewTime('')

    const affiliData = a.onboard_affil_data || {}
    setOnboardForm({
      affiliation:   a.onboard_affiliation   || '',
      birthday:      a.onboard_birthday      || '',
      default_role:  a.onboard_default_role  || '',
      preferred_slots: a.onboard_preferred_slots || [],
      preferred_roles: a.onboard_preferred_roles || [],
      sma_name:          affiliData.sma_name          || '',
      sma_contact:       affiliData.sma_contact        || '',
      school:            affiliData.school             || '',
      major:             affiliData.major              || '',
      intern_school:     affiliData.intern_school      || '',
      intern_department: affiliData.intern_department  || '',
      advisor_name:      affiliData.advisor_name       || '',
      advisor_contact:   affiliData.advisor_contact    || '',
      credentials:       affiliData.credentials        || '',
      license_exp:       affiliData.license_exp        || '',
      bls_exp:           affiliData.bls_exp            || '',
      dea_exp:           affiliData.dea_exp            || '',
      ftca_exp:          affiliData.ftca_exp           || '',
      tb_exp:            affiliData.tb_exp             || '',
    })

    if (a.stage === 'onboarding') loadChecklist(a.id)
    if (a.interview_scheduled_at) {
      const d = new Date(a.interview_scheduled_at)
      setInterviewDate(d.toISOString().slice(0, 10))
      setInterviewTime(d.toTimeString().slice(0, 5))
    }

    // Reset photo state — photo will appear only once uploaded this session
    setApplicantPhotoUrl(null)
    setApplicantAvatarPath(null)
  }

  // ─── Derived ──────────────────────────────────────────────────────────────

  const filteredApplicants = applicants.filter(a => a.stage === stageFilter)
  const stageCounts        = STAGES.reduce((acc, s) => { acc[s] = applicants.filter(a => a.stage === s).length; return acc }, {})

  // ─── Non-missionary document validation ───────────────────────────────────────

  function getMissingRequiredDocs() {
    // Missionaries are exempt from this requirement entirely.
    if (onboardForm.affiliation === 'missionary') return []

    return NON_MISSIONARY_REQUIRED.filter(key => {
      // Checkbox must be checked.
      if (!checklist[key]) return true

      // If the item has a file slot (urlKey), that file must also be uploaded.
      const item = CHECKLIST_ITEMS.find(i => i.key === key)
      if (item?.urlKey && !checklist[item.urlKey]) return true

      return false
    }).map(key => CHECKLIST_ITEMS.find(i => i.key === key)?.label ?? key)
  }

  const missingRequiredDocs = getMissingRequiredDocs()
  const docsComplete        = missingRequiredDocs.length === 0
  // ─── Shared styles ────────────────────────────────────────────────────────

  const card       = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
  const inputStyle = { width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box', colorScheme: 'light' }
  const labelStyle = { display: 'block', fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const secLabel   = { fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.85rem' }

  const solidBtn = (color, disabled) => ({
    padding: '0.65rem 1.35rem', borderRadius: '8px', border: 'none',
    background: disabled ? 'var(--surface)' : color,
    color: disabled ? 'var(--muted)' : '#fff',
    fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem',
    opacity: disabled ? 0.5 : 1, transition: 'opacity 0.15s',
  })
  const outlineBtn = (color) => ({
    padding: '0.65rem 1.35rem', borderRadius: '8px', border: `1px solid ${color}55`,
    background: color + '12', color, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem',
  })
  const ghostBtn = () => ({
    padding: '0.65rem 1.25rem', borderRadius: '8px', border: '1px solid var(--border)',
    background: 'var(--surface)', color: 'var(--muted)', fontWeight: 500,
    cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem',
  })

  // ─── Sub-components ───────────────────────────────────────────────────────

  function StagePill({ stage }) {
    const color = STAGE_COLORS[stage] || C.muted
    return <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.6rem', borderRadius: '100px', fontWeight: 600, background: color + '18', color, border: `1px solid ${color}44` }}>{STAGE_LABELS[stage] || stage}</span>
  }

  function StepDots({ current, total, color }) {
    return (
      <div style={{ display: 'flex', gap: '0.35rem' }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{ width: 28, height: 6, borderRadius: 3, background: i < current ? color : 'var(--border)', transition: 'background 0.2s' }} />
        ))}
      </div>
    )
  }

  function SavedBadge() {
    return savingStep
      ? <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontStyle: 'italic' }}>saving…</span>
      : <span style={{ fontSize: '0.7rem', color: C.light, fontWeight: 600 }}>✓ saved</span>
  }

  function CredentialInput({ fieldKey, label, value, onChange, allowNA }) {
    const mode = value === 'N/A' ? 'na' : value === 'expired' ? 'expired' : 'date'
    return (
      <div>
        <label style={labelStyle}>{label}</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <select value={mode} onChange={e => { const m = e.target.value; onChange(m === 'na' ? 'N/A' : m === 'expired' ? 'expired' : '') }} style={{ ...inputStyle, fontSize: '0.82rem', padding: '0.45rem 0.65rem' }}>
            <option value="date">Set date</option>
            {allowNA && <option value="na">N/A</option>}
            <option value="expired">Mark expired</option>
          </select>
          {mode === 'date' && <input type="date" value={value && value !== 'N/A' && value !== 'expired' ? value : ''} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, fontSize: '0.82rem', padding: '0.45rem 0.65rem' }} />}
        </div>
      </div>
    )
  }

  function AffiliationExtras() {
    const a = onboardForm.affiliation
    if (a === 'missionary') return (
      <div style={{ padding: '1rem', background: 'var(--bg)', borderRadius: '10px', border: `1px solid ${C.blue}33` }}>
        <p style={{ ...secLabel, marginBottom: '0.75rem' }}>Mission Service Assignment</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
          <div><label style={labelStyle}>SMA Name</label><input value={onboardForm.sma_name} onChange={e => setOnboardForm(f => ({ ...f, sma_name: e.target.value }))} placeholder="Full name" style={inputStyle} /></div>
          <div><label style={labelStyle}>SMA Contact</label><input value={onboardForm.sma_contact} onChange={e => setOnboardForm(f => ({ ...f, sma_contact: e.target.value }))} placeholder="Phone or email" style={inputStyle} /></div>
        </div>
      </div>
    )
    if (a === 'student') return (
      <div style={{ padding: '1rem', background: 'var(--bg)', borderRadius: '10px', border: `1px solid ${C.blue}33` }}>
        <p style={{ ...secLabel, marginBottom: '0.75rem' }}>Academic Information</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
          <div>
            <label style={labelStyle}>School <span style={{ color: C.danger }}>*</span></label>
            <select value={onboardForm.school} onChange={e => setOnboardForm(f => ({ ...f, school: e.target.value }))} style={inputStyle}>
              <option value="">— Select school —</option>
              {SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Major <span style={{ color: C.danger }}>*</span></label>
            <select value={onboardForm.major} onChange={e => setOnboardForm(f => ({ ...f, major: e.target.value }))} style={inputStyle}>
              <option value="">— Select major —</option>
              {MAJORS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>
    )
    if (a === 'intern') return (
      <div style={{ padding: '1rem', background: 'var(--bg)', borderRadius: '10px', border: `1px solid ${C.blue}33` }}>
        <p style={{ ...secLabel, marginBottom: '0.75rem' }}>Internship Details</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
          <div><label style={labelStyle}>School <span style={{ color: C.danger }}>*</span></label><input value={onboardForm.intern_school} onChange={e => setOnboardForm(f => ({ ...f, intern_school: e.target.value }))} style={inputStyle} /></div>
          <div><label style={labelStyle}>Department <span style={{ color: C.danger }}>*</span></label><input value={onboardForm.intern_department} onChange={e => setOnboardForm(f => ({ ...f, intern_department: e.target.value }))} style={inputStyle} /></div>
          <div><label style={labelStyle}>Advisor Name <span style={{ color: C.danger }}>*</span></label><input value={onboardForm.advisor_name} onChange={e => setOnboardForm(f => ({ ...f, advisor_name: e.target.value }))} style={inputStyle} /></div>
          <div><label style={labelStyle}>Advisor Contact <span style={{ color: C.danger }}>*</span></label><input value={onboardForm.advisor_contact} onChange={e => setOnboardForm(f => ({ ...f, advisor_contact: e.target.value }))} style={inputStyle} /></div>
        </div>
      </div>
    )
    if (a === 'provider') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <div style={{ padding: '1rem', background: 'var(--bg)', borderRadius: '10px', border: `1px solid ${C.blue}33` }}>
          <p style={{ ...secLabel, marginBottom: '0.75rem' }}>Credentials / Licensure <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></p>
          <input value={onboardForm.credentials} onChange={e => setOnboardForm(f => ({ ...f, credentials: e.target.value }))} placeholder="e.g. MD, NP, RN, PA" style={inputStyle} />
        </div>
        <div style={{ padding: '1rem', background: 'var(--bg)', borderRadius: '10px', border: `1px solid ${C.blue}33` }}>
          <p style={{ ...secLabel, color: C.muted, marginBottom: '0.85rem' }}>Credential Expiration Dates <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
            {PROVIDER_CRED_FIELDS.map(f => <CredentialInput key={f.key} fieldKey={f.key} label={f.label} value={onboardForm[f.key] || ''} onChange={val => setOnboardForm(p => ({ ...p, [f.key]: val }))} allowNA={!!f.allowNA} />)}
          </div>
        </div>
      </div>
    )
    return null
  }

  function FileRow({ item, applicantId }) {
    const ref = useRef(null)
    const has       = !!(checklist[item.urlKey])
    const uploading = uploadingKey === item.key
    if (!item.bucket || !item.urlKey) return null
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem' }}>
        <input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(applicantId, item, f); e.target.value = '' }} />
        {has
          ? <><button onClick={() => openFile(item.bucket, checklist[item.urlKey])} style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: C.blue + '14', color: C.blue, border: `1px solid ${C.blue}44` }}>View File</button><button onClick={() => ref.current?.click()} style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>Replace</button></>
          : <button onClick={() => ref.current?.click()} disabled={uploading} style={{ padding: '0.2rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', opacity: uploading ? 0.5 : 1 }}>{uploading ? 'Uploading...' : '+ Attach File'}</button>
        }
        <span style={{ fontSize: '0.67rem', color: 'var(--muted)', opacity: 0.6, fontFamily: 'DM Mono, monospace' }}>PDF or JPG/PNG</span>
      </div>
    )
  }

  // ─── Validity ─────────────────────────────────────────────────────────────

  function step1Valid() {
    const a = onboardForm.affiliation
    if (!a) return false
    if (a === 'student') return !!(onboardForm.school)
    if (a === 'intern')  return !!(onboardForm.intern_school && onboardForm.intern_department && onboardForm.advisor_name && onboardForm.advisor_contact)
    return true
  }
  const step2Valid    = !!onboardForm.birthday
  const step3Valid    = !!onboardForm.default_role
  const allStepsValid = step1Valid() && step2Valid && step3Valid && docsComplete

  function profileSummary() {
    const base = [
      { label: 'Name',     value: selected?.full_name },
      { label: 'Email',    value: selected?.email },
      { label: 'Affil.',   value: onboardForm.affiliation },
      { label: 'Birthday', value: onboardForm.birthday },
      { label: 'Position', value: onboardForm.default_role },
    ]
    if (onboardForm.preferred_slots.length > 0)
      base.push({ label: 'Slots', value: `${onboardForm.preferred_slots.length} selected` })
    return base
  }

  function buildAffilData() {
    const f = onboardForm
    return {
      sma_name: f.sma_name, sma_contact: f.sma_contact,
      school: f.school, major: f.major,
      intern_school: f.intern_school, intern_department: f.intern_department,
      advisor_name: f.advisor_name, advisor_contact: f.advisor_contact,
      credentials: f.credentials,
      license_exp: f.license_exp, bls_exp: f.bls_exp, dea_exp: f.dea_exp,
      ftca_exp: f.ftca_exp, tb_exp: f.tb_exp,
    }
  }

  // ─── Parking pass modal helpers ───────────────────────────────────────────

  function openParkingPassModal(applicantId, applicantName, isRecent = false) {
    setParkingPassModal({ applicantId, applicantName, isRecent })
    setParkingPassSaving(false)
  }

  function ParkingPassModal() {
    if (!parkingPassModal) return null
    const { applicantName } = parkingPassModal
    const today  = new Date().toISOString().slice(0, 10)
    const params = new URLSearchParams({ name: applicantName || '', date: today })
    const src    = `/parking_pass.html?${params.toString()}`

    return (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(2,30,55,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
        onClick={e => { if (e.target === e.currentTarget) setParkingPassModal(null) }}
      >
        <div style={{ background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', boxShadow: '0 8px 48px rgba(2,65,107,0.22)', width: '100%', maxWidth: 600, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: C.primary, fontFamily: 'DM Sans, sans-serif', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Parking Pass</span>
              {applicantName && <span style={{ fontSize: '0.82rem', color: 'var(--muted)', fontFamily: 'DM Sans, sans-serif' }}>— {applicantName}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {parkingPassSaving && <span style={{ fontSize: '0.78rem', color: C.blue, fontStyle: 'italic', fontFamily: 'DM Sans, sans-serif' }}>Saving PDF…</span>}
              <button onClick={() => setParkingPassModal(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '0.1rem 0.3rem' }} title="Close">×</button>
            </div>
          </div>
          <iframe
            ref={parkingPassIframeRef}
            src={src}
            title="Volunteer Parking Pass"
            style={{ flex: 1, border: 'none', minHeight: 580, background: '#f9fafb' }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
      </div>
    )
  }

  // ─── Confidentiality agreement modal helpers ──────────────────────────────
  // Mirrors ParkingPassModal exactly — title, iframe src, and message types differ only.

  function openConfidentialityModal(applicantId, applicantName, isRecent = false) {
    setConfidentialityModal({ applicantId, applicantName, isRecent })
    setConfidentialitySaving(false)
  }

  function ConfidentialityModal() {
    if (!confidentialityModal) return null
    const { applicantName } = confidentialityModal
    const today  = new Date().toISOString().slice(0, 10)
    const params = new URLSearchParams({ name: applicantName || '', date: today })
    const src    = `/confidentiality_agreement.html?${params.toString()}`

    return (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(2,30,55,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
        onClick={e => { if (e.target === e.currentTarget) setConfidentialityModal(null) }}
      >
        <div style={{ background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', boxShadow: '0 8px 48px rgba(2,65,107,0.22)', width: '100%', maxWidth: 760, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: C.primary, fontFamily: 'DM Sans, sans-serif', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Confidentiality Agreement</span>
              {applicantName && <span style={{ fontSize: '0.82rem', color: 'var(--muted)', fontFamily: 'DM Sans, sans-serif' }}>— {applicantName}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {confidentialitySaving && <span style={{ fontSize: '0.78rem', color: C.blue, fontStyle: 'italic', fontFamily: 'DM Sans, sans-serif' }}>Saving PDF…</span>}
              <button onClick={() => setConfidentialityModal(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '0.1rem 0.3rem' }} title="Close">×</button>
            </div>
          </div>
          <iframe
            ref={confidentialityIframeRef}
            src={src}
            title="Volunteer & Student Confidentiality Agreement"
            style={{ flex: 1, border: 'none', minHeight: 680, background: '#f9fafb' }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
      </div>
    )
  }

  // ─────────────────────────── RECENTLY ADDED ───────────────────────────────

  function RecentlyAdded() {
    if (loading) return <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading...</p>

    if (completed.length === 0) return (
      <div style={{ ...card, textAlign: 'center', padding: '2.5rem' }}>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>No recently added volunteers.</p>
      </div>
    )

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {completed.map(a => {
          const cl           = recentChecklist[a.id] || {}
          const isOffloading = offloadingId === a.id
          const isExpanded   = expandedId === a.id
          const fileCount    = FILE_CHECKLIST_ITEMS.filter(i => cl[i.urlKey]).length

          return (
            <div key={a.id} style={{ background: 'var(--surface)', border: `1px solid ${isExpanded ? C.blue + '55' : 'var(--border)'}`, borderRadius: '12px', overflow: 'hidden', transition: 'border-color 0.2s' }}>

              {/* ── Card header row ── */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  {/* Profile photo upload */}
                  {(() => {
                    const photoUrl    = recentPhotoUrls[a.id] || null
                    const isUploading = recentPhotoUploading === a.id
                    const inputId     = `recent-photo-${a.id}`
                    return (
                      <>
                        <div
                          onClick={() => { if (!isUploading) document.getElementById(inputId)?.click() }}
                          title={photoUrl ? 'Click to replace photo' : 'Click to upload photo'}
                          style={{ position: 'relative', width: 38, height: 38, borderRadius: '50%', background: C.primary + '22', border: `2px solid ${C.blue}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem', color: C.blue, overflow: 'hidden', cursor: 'pointer', flexShrink: 0 }}
                        >
                          {isUploading
                            ? <span style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>…</span>
                            : photoUrl
                              ? <img src={photoUrl} alt={a.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <span>{a.full_name?.charAt(0)}</span>
                          }
                          {photoUrl && !isUploading && (
                            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: '50%', background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--surface)' }}>
                              <span style={{ fontSize: '0.45rem', color: '#fff' }}>✎</span>
                            </div>
                          )}
                        </div>
                        <input
                          id={inputId}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleRecentPhotoUpload(a.id, f); e.target.value = '' }}
                        />
                      </>
                    )
                  })()}
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{a.full_name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.15rem', flexWrap: 'wrap' }}>
                      <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{a.email}</p>
                      <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.5rem', borderRadius: '100px', background: C.blue + '14', color: C.blue, border: `1px solid ${C.blue}33`, fontWeight: 600 }}>Active</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>{fileCount} / {FILE_CHECKLIST_ITEMS.length} files</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : a.id)}
                    style={{ padding: '0.35rem 0.85rem', borderRadius: '7px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: isExpanded ? C.blue + '20' : C.primary + '12', color: C.blue, border: `1px solid ${C.blue}44` }}
                  >
                    {isExpanded ? '▲ Hide Files' : `▼ View Files (${fileCount})`}
                  </button>
                  <button
                    onClick={() => handleOffload(a)}
                    disabled={isOffloading}
                    style={{ padding: '0.35rem 0.85rem', borderRadius: '7px', fontSize: '0.75rem', fontWeight: 600, cursor: isOffloading ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', background: isOffloading ? 'var(--surface)' : C.primary + '12', color: isOffloading ? 'var(--muted)' : C.primary, border: `1px solid ${C.primary}${isOffloading ? '22' : '55'}`, opacity: isOffloading ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    {isOffloading
                      ? <><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: `2px solid ${C.primary}`, borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} /> Offloading...</>
                      : 'Do not click this button.'
                    }
                  </button>
                </div>
              </div>

              {/* ── Expanded file panel ── */}
              {isExpanded && (
                <div style={{ borderTop: `1px solid ${C.blue}22`, background: C.primary + '08', padding: '1rem 1.25rem' }}>
                  <p style={{ ...secLabel, color: C.blue, marginBottom: '0.9rem' }}>Documents & Files</p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

                    {/* ── Resume (submitted with application) ── */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.9rem', borderRadius: '8px', background: a.resume_url ? C.blue + '0a' : 'var(--bg)', border: `1px solid ${a.resume_url ? C.blue + '44' : 'var(--border)'}`, gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                        <div style={{ width: 18, height: 18, borderRadius: '4px', flexShrink: 0, background: a.resume_url ? C.blue : 'transparent', border: `2px solid ${a.resume_url ? C.blue : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {a.resume_url && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: a.resume_url ? 600 : 400, color: a.resume_url ? 'var(--text)' : 'var(--muted)' }}>
                          Resume
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 400, marginLeft: '0.35rem' }}>(submitted with application)</span>
                        </span>
                        {a.resume_url && <span style={{ fontSize: '0.7rem', color: C.light, fontWeight: 600, flexShrink: 0 }}>Uploaded</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                        {a.resume_url
                          ? <button onClick={() => openResume(a.resume_url)} style={{ padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: C.blue + '14', color: C.blue, border: `1px solid ${C.blue}44` }}>View ↗</button>
                          : <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontStyle: 'italic' }}>None submitted</span>
                        }
                      </div>
                    </div>

                    {FILE_CHECKLIST_ITEMS.map(item => {

                      // ── Confidentiality Agreement: open the HTML form modal ──
                      // Mirrors the parking_pass special case exactly.
                      if (item.key === 'confidentiality_agreement') {
                        const hasPdf = !!(cl[item.urlKey])
                        return (
                          <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.9rem', borderRadius: '8px', background: hasPdf ? C.blue + '0a' : 'var(--bg)', border: `1px solid ${hasPdf ? C.blue + '44' : 'var(--border)'}`, gap: '0.75rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                              <div style={{ width: 18, height: 18, borderRadius: '4px', flexShrink: 0, background: hasPdf ? C.blue : 'transparent', border: `2px solid ${hasPdf ? C.blue : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {hasPdf && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                              </div>
                              <span style={{ fontSize: '0.85rem', fontWeight: hasPdf ? 600 : 400, color: hasPdf ? 'var(--text)' : 'var(--muted)' }}>
                                Confidentiality Agreement
                              </span>
                              {hasPdf && <span style={{ fontSize: '0.7rem', color: C.light, fontWeight: 600, flexShrink: 0 }}>PDF saved</span>}
                            </div>
                            <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                              {hasPdf && (
                                <button
                                  onClick={() => openFile('onboarding-confidentiality', cl[item.urlKey])}
                                  style={{ padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: C.blue + '14', color: C.blue, border: `1px solid ${C.blue}44` }}
                                >View ↗</button>
                              )}
                              <button
                                onClick={() => openConfidentialityModal(a.id, a.full_name, true)}
                                style={{ padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                              >{hasPdf ? 'Re-sign' : '+ Fill Out Agreement'}</button>
                            </div>
                          </div>
                        )
                      }

                      // ── Parking Pass: open the HTML form modal ──
                      if (item.key === 'parking_pass') {
                        const hasPdf = !!(cl[item.urlKey])
                        return (
                          <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.9rem', borderRadius: '8px', background: hasPdf ? C.blue + '0a' : 'var(--bg)', border: `1px solid ${hasPdf ? C.blue + '44' : 'var(--border)'}`, gap: '0.75rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                              <div style={{ width: 18, height: 18, borderRadius: '4px', flexShrink: 0, background: hasPdf ? C.blue : 'transparent', border: `2px solid ${hasPdf ? C.blue : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {hasPdf && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                              </div>
                              <span style={{ fontSize: '0.85rem', fontWeight: hasPdf ? 600 : 400, color: hasPdf ? 'var(--text)' : 'var(--muted)' }}>
                                Parking Pass
                              </span>
                              {hasPdf && <span style={{ fontSize: '0.7rem', color: C.light, fontWeight: 600, flexShrink: 0 }}>PDF saved</span>}
                            </div>
                            <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                              {hasPdf && (
                                <button
                                  onClick={() => openFile('onboarding-parking-passes', cl[item.urlKey])}
                                  style={{ padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: C.blue + '14', color: C.blue, border: `1px solid ${C.blue}44` }}
                                >View ↗</button>
                              )}
                              <button
                                onClick={() => openParkingPassModal(a.id, a.full_name, true)}
                                style={{ padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                              >{hasPdf ? 'Re-issue' : '+ Fill Out Pass'}</button>
                            </div>
                          </div>
                        )
                      }

                      // ── Standard file upload ──
                      const hasFile     = !!(cl[item.urlKey])
                      const uploadKey   = `${a.id}-${item.key}`
                      const isUploading = recentUploadingKey === uploadKey
                      const ref         = useRef(null)

                      return (
                        <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.9rem', borderRadius: '8px', background: hasFile ? C.blue + '0a' : 'var(--bg)', border: `1px solid ${hasFile ? C.blue + '44' : 'var(--border)'}`, gap: '0.75rem', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                            <div style={{ width: 18, height: 18, borderRadius: '4px', flexShrink: 0, background: hasFile ? C.blue : 'transparent', border: `2px solid ${hasFile ? C.blue : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {hasFile && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                            </div>
                            <span style={{ fontSize: '0.85rem', fontWeight: hasFile ? 600 : 400, color: hasFile ? 'var(--text)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.label}
                              {item.mandatory && <span style={{ color: C.warn, marginLeft: '0.2rem', fontWeight: 700 }}>*</span>}
                            </span>
                            {hasFile && <span style={{ fontSize: '0.7rem', color: C.light, fontWeight: 600, flexShrink: 0 }}>Uploaded</span>}
                          </div>
                          <input
                            ref={ref}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.webp,image/*"
                            style={{ display: 'none' }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleRecentFileUpload(a.id, item, f); e.target.value = '' }}
                          />
                          <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                            {hasFile && (
                              <button
                                onClick={() => openFile(item.bucket, cl[item.urlKey])}
                                style={{ padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: C.blue + '14', color: C.blue, border: `1px solid ${C.blue}44` }}
                              >View ↗</button>
                            )}
                            <button
                              onClick={() => ref.current?.click()}
                              disabled={isUploading}
                              style={{ padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: isUploading ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', opacity: isUploading ? 0.5 : 1 }}
                            >
                              {isUploading ? 'Uploading...' : hasFile ? 'Replace' : '+ Upload'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Missing mandatory warning */}
                  {(() => {
                    const missing = FILE_CHECKLIST_ITEMS.filter(i => i.mandatory && !cl[i.urlKey])
                    if (missing.length === 0) return (
                      <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.85rem', borderRadius: '7px', background: C.blue + '10', border: `1px solid ${C.blue}33`, fontSize: '0.78rem', color: C.blue, fontWeight: 600 }}>
                        ✓ All required documents uploaded
                      </div>
                    )
                    return (
                      <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.85rem', borderRadius: '7px', background: C.primary + '0a', border: `1px solid ${C.primary}33`, fontSize: '0.78rem', color: C.primary }}>
                        Missing required: {missing.map(i => i.label).join(', ')}
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ─────────────────────────── APPLICANT DETAIL ─────────────────────────────

  function ApplicantDetail({ applicant }) {
    const isApplied    = applicant.stage === 'applied'
    const isInterview  = applicant.stage === 'interview'
    const isOnboarding = applicant.stage === 'onboarding'
    const isRejected   = applicant.stage === 'rejected'

    const scheduledLabel = formatInterviewDateTime(applicant.interview_scheduled_at)

    const fields = [
      { label: 'Email',       value: applicant.email },
      { label: 'Phone',       value: applicant.phone },
      { label: 'Languages',   value: applicant.languages },
      { label: 'Credentials', value: applicant.credentials },
      { label: 'Skills',      value: applicant.skills },
      { label: 'Education',   value: applicant.educational_background },
      { label: 'Start Date',  value: applicant.start_date },
      { label: 'Reference 1', value: applicant.ref1_name ? `${applicant.ref1_name} — ${applicant.ref1_contact}` : null },
      { label: 'Reference 2', value: applicant.ref2_name ? `${applicant.ref2_name} — ${applicant.ref2_contact}` : null },
    ].filter(f => f.value)

    const checklistCount    = CHECKLIST_ITEMS.filter(i => checklist[i.key]).length
    const mandatoryComplete = CHECKLIST_ITEMS.filter(i => i.mandatory).every(i => checklist[i.key])
    const s1 = step1Valid()

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Profile photo — click to upload or replace */}
            <div
              onClick={() => { if (!uploadingApplicantPhoto) applicantPhotoInputRef.current?.click() }}
              title={applicantPhotoUrl ? 'Click to replace photo' : 'Click to upload photo'}
              style={{ position: 'relative', width: 48, height: 48, borderRadius: '50%', background: C.primary + '18', border: `2px solid ${C.blue}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.2rem', color: C.blue, overflow: 'hidden', cursor: 'pointer', flexShrink: 0 }}
            >
              {uploadingApplicantPhoto
                ? <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>…</span>
                : applicantPhotoUrl
                  ? <img src={applicantPhotoUrl} alt={applicant.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span>{applicant.full_name?.charAt(0)}</span>
              }
              {applicantPhotoUrl && !uploadingApplicantPhoto && (
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 16, height: 16, borderRadius: '50%', background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--surface)', cursor: 'pointer' }}>
                  <span style={{ fontSize: '0.5rem', color: '#fff' }}>✎</span>
                </div>
              )}
            </div>
            <input
              ref={applicantPhotoInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleApplicantPhotoUpload(f); e.target.value = '' }}
            />
            <div>
              <h3 style={{ fontWeight: 600, fontSize: '1.1rem' }}>{applicant.full_name}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                <StagePill stage={applicant.stage} />
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Applied {applicant.created_at ? new Date(applicant.created_at).toLocaleDateString() : '—'}</span>
              </div>
            </div>
          </div>
          <button onClick={() => { setSelected(null); setOnboardStep(1) }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif' }}>Back</button>
        </div>

        {/* Application data */}
        <div style={{ ...card, padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
            <p style={secLabel}>Application</p>
            {applicant.resume_url && <button onClick={() => openResume(applicant.resume_url)} style={outlineBtn(C.blue)}>View Resume</button>}
          </div>
          {fields.length === 0
            ? <p style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: '0.88rem' }}>No application data on file.</p>
            : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {fields.map(f => <div key={f.label} style={{ padding: '0.65rem 0.9rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', gridColumn: f.value?.length > 80 ? '1 / -1' : undefined }}><p style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>{f.label}</p><p style={{ fontSize: '0.88rem', lineHeight: 1.5 }}>{f.value}</p></div>)}
              </div>
          }
        </div>

        {/* Applied */}
        {isApplied && (
          <div style={{ ...card, padding: '1rem 1.25rem', borderColor: C.warn + '55', background: C.warn + '06' }}>
            <p style={{ ...secLabel, color: C.warn }}>Review</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1rem', lineHeight: 1.5 }}>Review this application and decide whether to schedule an interview or reject it.</p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button onClick={() => moveToStage(applicant, 'interview')} disabled={movingStage} style={outlineBtn(C.warn)}>Move to Interview</button>
              <button onClick={() => moveToStage(applicant, 'rejected')} disabled={movingStage} style={outlineBtn(C.danger)}>Reject Application</button>
            </div>
          </div>
        )}

        {/* Interview */}
        {isInterview && (
          <div style={{ ...card, padding: '1rem 1.25rem', borderColor: C.warn + '55', background: C.warn + '06' }}>
            <p style={{ ...secLabel, color: C.warn }}>Interview</p>
            <div style={{ padding: '1rem', background: 'var(--bg)', borderRadius: '10px', border: '1px solid var(--border)', marginBottom: '1.25rem' }}>
              <p style={{ ...secLabel, marginBottom: '0.75rem' }}>Schedule</p>
              {scheduledLabel && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem', padding: '0.45rem 0.9rem', borderRadius: '8px', background: C.warn + '14', border: `1px solid ${C.warn}44` }}>
                  <span style={{ fontSize: '0.82rem', color: C.warn, fontWeight: 600 }}>{scheduledLabel}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>— scheduled</span>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.75rem', alignItems: 'flex-end' }}>
                <div><label style={labelStyle}>Date</label><input type="date" value={interviewDate} onChange={e => setInterviewDate(e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Time (optional)</label><input type="time" value={interviewTime} onChange={e => setInterviewTime(e.target.value)} style={inputStyle} /></div>
                <button onClick={() => saveInterviewTime(applicant)} disabled={savingInterview || !interviewDate} style={solidBtn(C.warn, savingInterview || !interviewDate)}>{savingInterview ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
            <p style={{ ...secLabel, marginBottom: '0.65rem' }}>Decision</p>

            {/* Block advancement until an interview has actually been saved */}
            {!applicant.interview_scheduled_at && (
              <div style={{
                marginBottom: '0.85rem',
                padding: '0.65rem 0.9rem',
                borderRadius: '8px',
                background: C.danger + '08',
                border: `1px solid ${C.danger}44`,
                fontSize: '0.82rem',
                color: C.danger,
                fontWeight: 500,
                lineHeight: 1.5,
              }}>
                An interview must be scheduled and saved before this applicant can be
                moved to onboarding. Use the Schedule section above to set a date and
                click <strong>Save</strong>.
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => moveToStage(applicant, 'onboarding')}
                disabled={movingStage || !applicant.interview_scheduled_at}
                style={outlineBtn(applicant.interview_scheduled_at ? C.blue : C.muted)}
                title={!applicant.interview_scheduled_at ? 'Schedule and save an interview date first' : undefined}
              >
                Accept — Move to Onboarding
              </button>
              <button onClick={() => moveToStage(applicant, 'rejected')} disabled={movingStage} style={outlineBtn(C.danger)}>Reject Application</button>
            </div>
          </div>
        )}

        {/* Onboarding — 5 steps */}
        {isOnboarding && (
          <div style={{ ...card, padding: '1rem 1.25rem', borderColor: C.blue + '55', background: C.blue + '06' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <p style={{ ...secLabel, color: C.blue, marginBottom: 0 }}>Onboarding — Step {onboardStep} of {TOTAL_STEPS}</p>
                <SavedBadge />
              </div>
              <StepDots current={onboardStep} total={TOTAL_STEPS} color={C.blue} />
            </div>

            {/* Step tabs */}
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              {[
                { n: 1, label: 'Affiliation',  valid: s1 },
                { n: 2, label: 'Birthday',     valid: step2Valid },
                { n: 3, label: 'Position',     valid: step3Valid },
                { n: 4, label: 'Availability', valid: onboardForm.preferred_slots.length > 0 },
                { n: 5, label: 'Checklist',    valid: checklistCount > 0 },
              ].map(({ n, label, valid }) => (
                <button key={n} onClick={() => setOnboardStep(n)} style={{ padding: '0.35rem 0.85rem', borderRadius: '8px', fontSize: '0.78rem', fontWeight: onboardStep === n ? 700 : 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', border: `1px solid ${onboardStep === n ? C.blue : valid ? C.blue + '44' : 'var(--border)'}`, background: onboardStep === n ? C.blue + '18' : 'var(--bg)', color: onboardStep === n ? C.blue : valid ? C.blue : 'var(--muted)' }}>
                  {valid && onboardStep !== n ? `${label} ✓` : label}
                </button>
              ))}
            </div>

            {/* Step 1 */}
            {onboardStep === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>What is their affiliation?</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.6rem' }}>
                  {AFFILIATION_OPTIONS.map(opt => { const active = onboardForm.affiliation === opt.value; return <button key={opt.value} onClick={() => setOnboardForm(f => ({ ...EMPTY_FORM, affiliation: opt.value, birthday: f.birthday, default_role: f.default_role, preferred_slots: f.preferred_slots, preferred_roles: f.preferred_roles }))} style={{ padding: '0.75rem 1rem', borderRadius: '10px', border: `1px solid ${active ? C.blue : 'var(--border)'}`, background: active ? C.blue + '18' : 'var(--bg)', color: active ? C.blue : 'var(--text)', fontWeight: active ? 700 : 400, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.88rem', transition: 'all 0.15s' }}>{opt.label}</button> })}
                </div>
                {onboardForm.affiliation && <AffiliationExtras />}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={async () => { await saveOnboardProgress(applicant.id, { onboard_affiliation: onboardForm.affiliation, onboard_affil_data: buildAffilData() }); setOnboardStep(2) }} disabled={!s1} style={solidBtn(C.blue, !s1)}>Save &amp; Next</button>
                </div>
              </div>
            )}

            {/* Step 2 */}
            {onboardStep === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>Date of Birth</p>
                <div style={{ maxWidth: 260 }}><label style={labelStyle}>Birthday</label><input type="date" value={onboardForm.birthday} onChange={e => setOnboardForm(f => ({ ...f, birthday: e.target.value }))} style={inputStyle} /></div>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => setOnboardStep(1)} style={ghostBtn()}>Back</button>
                  <button onClick={async () => { await saveOnboardProgress(applicant.id, { onboard_birthday: onboardForm.birthday || null }); setOnboardStep(3) }} disabled={!step2Valid} style={solidBtn(C.blue, !step2Valid)}>Save &amp; Next</button>
                </div>
              </div>
            )}

            {/* Step 3 */}
            {onboardStep === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>Default Position</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.6rem' }}>
                  {ROLES.map(role => { const active = onboardForm.default_role === role; return <button key={role} onClick={() => setOnboardForm(f => ({ ...f, default_role: role }))} style={{ padding: '0.65rem 0.9rem', borderRadius: '10px', textAlign: 'left', border: `1px solid ${active ? C.blue : 'var(--border)'}`, background: active ? C.blue + '18' : 'var(--bg)', color: active ? C.blue : 'var(--text)', fontWeight: active ? 700 : 400, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.82rem', transition: 'all 0.15s' }}>{role}</button> })}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => setOnboardStep(2)} style={ghostBtn()}>Back</button>
                  <button onClick={async () => { await saveOnboardProgress(applicant.id, { onboard_default_role: onboardForm.default_role || null }); setOnboardStep(4) }} disabled={!step3Valid} style={solidBtn(C.blue, !step3Valid)}>Save &amp; Next</button>
                </div>
              </div>
            )}

            {/* Step 4 */}
            {onboardStep === 4 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <p style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.35rem' }}>Availability &amp; Waitlist Preferences</p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.6 }}>Select which specific shifts this volunteer can cover. Leave everything unchecked to mark them as fully flexible.</p>
                </div>
                <div style={{ padding: '1.1rem 1.25rem', borderRadius: '10px', background: 'var(--bg)', border: `1px solid ${C.blue}2a`, overflowX: 'auto' }}>
                  <p style={{ ...secLabel, color: C.blue, marginBottom: '0.85rem' }}>Shift Grid</p>
                  <SlotPicker selected={onboardForm.preferred_slots} onChange={val => setOnboardForm(f => ({ ...f, preferred_slots: val }))} />
                </div>
                <div style={{ padding: '1rem 1.25rem', borderRadius: '10px', background: 'var(--bg)', border: `1px solid ${C.blue}2a` }}>
                  <p style={{ ...secLabel, color: C.blue, marginBottom: '0.75rem' }}>Willing to Fill Roles <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></p>
                  <RolePicker selected={onboardForm.preferred_roles} onChange={val => setOnboardForm(f => ({ ...f, preferred_roles: val }))} />
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {onboardForm.preferred_slots.length === 0
                    ? <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontStyle: 'italic' }}>No slots selected — will be added as fully flexible.</span>
                    : onboardForm.preferred_slots.map(k => {
                        const s = ALL_SLOTS.find(x => x.key === k)
                        return <span key={k} style={{ padding: '0.2rem 0.55rem', borderRadius: '100px', fontSize: '0.72rem', background: C.blue + '14', color: C.blue, border: `1px solid ${C.blue}33`, fontFamily: 'DM Mono, monospace' }}>{s?.label || k}</span>
                      })
                  }
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => setOnboardStep(3)} style={ghostBtn()}>Back</button>
                  <button onClick={async () => { await saveOnboardProgress(applicant.id, { onboard_preferred_slots: onboardForm.preferred_slots, onboard_preferred_roles: onboardForm.preferred_roles }); setOnboardStep(5) }} style={solidBtn(C.blue, false)}>Save &amp; Next</button>
                </div>
              </div>
            )}

            {/* Step 5 — Onboarding Checklist */}
            {onboardStep === 5 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>Onboarding Checklist</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>{checklistCount} / {CHECKLIST_ITEMS.length}</span>
                    {mandatoryComplete && <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '100px', background: C.blue + '18', color: C.blue, border: `1px solid ${C.blue}44`, fontWeight: 600 }}>Required Complete</span>}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>

                  {/* Standard checklist items — parking_pass and confidentiality_agreement
                      are excluded here and rendered as dedicated rows below. */}
                  {CHECKLIST_ITEMS
                    .filter(item => item.key !== 'parking_pass' && item.key !== 'confidentiality_agreement')
                    .map(item => {
                      const checked = checklist[item.key]
                      return (
                        <div key={item.key} style={{ padding: '0.85rem 1rem', borderRadius: '10px', border: `1px solid ${checked ? C.blue + '55' : item.mandatory ? C.danger + '33' : 'var(--border)'}`, background: checked ? C.blue + '08' : item.mandatory ? C.danger + '04' : 'var(--bg)', transition: 'all 0.15s' }}>
                          <div onClick={() => !savingChecklist && toggleChecklistItem(applicant.id, item.key, !checked)} style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', cursor: 'pointer' }}>
                            <div style={{ width: 20, height: 20, borderRadius: '5px', flexShrink: 0, border: `2px solid ${checked ? C.blue : item.mandatory ? C.danger + '66' : 'var(--border)'}`, background: checked ? C.blue : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                              {checked && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4L4 7L10 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                            </div>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ fontSize: '0.9rem', fontWeight: checked ? 600 : 400, color: checked ? 'var(--text)' : 'var(--muted)', transition: 'color 0.15s' }}>{item.label}</span>
                              {item.mandatory && <span style={{ color: C.danger, fontWeight: 700, fontSize: '0.85rem', lineHeight: 1 }}>*</span>}
                            </div>
                            {checked && <span style={{ fontSize: '0.72rem', color: C.blue, fontWeight: 600, flexShrink: 0 }}>Complete</span>}
                          </div>
                          {item.bucket && <FileRow item={item} applicantId={applicant.id} />}
                        </div>
                      )
                    })
                  }
                </div>
                
                {/* Non-missionary document requirement error — shown above the submit button */}
                {onboardForm.affiliation && onboardForm.affiliation !== 'missionary' && missingRequiredDocs.length > 0 && (
                  <div style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    background: C.danger + '08',
                    border: `1px solid ${C.danger}44`,
                    fontSize: '0.83rem',
                    color: C.danger,
                    fontWeight: 500,
                    lineHeight: 1.6,
                  }}>
                    <span style={{ fontWeight: 700 }}>Cannot create profile yet.</span>{' '}
                    The following items must be uploaded and checked off before a
                    non-missionary volunteer profile can be created:{' '}
                    <span style={{ fontWeight: 700 }}>{missingRequiredDocs.join(', ')}</span>.
                    <span style={{ display: 'block', marginTop: '0.3rem', fontWeight: 400, opacity: 0.85 }}>
                      Background Check, ID, and Immunization each require a file attachment.
                      Welcome Packet only requires the checkbox to be marked.
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button onClick={() => setOnboardStep(4)} style={ghostBtn()}>Back</button>
                  <button onClick={handleCreateProfile} disabled={creatingProfile || !allStepsValid} style={solidBtn(C.primary, creatingProfile || !allStepsValid)}>
                    {creatingProfile ? 'Creating...' : 'Create Volunteer Profile'}
                  </button>
                </div>

                {allStepsValid && !creatingProfile && (
                  <div style={{ padding: '0.85rem 1rem', borderRadius: '8px', background: C.blue + '06', border: `1px solid ${C.blue}25` }}>
                    <p style={{ ...secLabel, marginBottom: '0.6rem' }}>Profile Summary</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {profileSummary().map(item => <div key={item.label} style={{ padding: '0.3rem 0.75rem', borderRadius: '100px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.78rem', color: 'var(--muted)' }}><span style={{ color: 'var(--text)', fontWeight: 500 }}>{item.label}: </span>{item.value}</div>)}
                      <div style={{ padding: '0.3rem 0.75rem', borderRadius: '100px', background: C.blue + '10', border: `1px solid ${C.blue}35`, fontSize: '0.78rem' }}><span style={{ color: 'var(--muted)', fontWeight: 500 }}>Password: </span><span style={{ fontFamily: 'DM Mono, monospace', color: C.blue, fontWeight: 600 }}>BFC2025!</span></div>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: C.light, fontWeight: 500, marginTop: '0.6rem' }}>✓ Will be automatically added to the waitlist on creation.</p>
                  </div>
                )}

                {!allStepsValid && (
                  <p style={{ fontSize: '0.82rem', color: C.warn, fontWeight: 500 }}>
                    {!step1Valid() && 'Affiliation details required. '}
                    {!step2Valid && 'Birthday required. '}
                    {!step3Valid && 'Default position required. '}
                  </p>
                )}
              </div>
            )}

            {/* Reject — always visible in onboarding, separated from step content */}
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: `1px solid ${C.danger}22`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.78rem', color: 'var(--muted)', fontStyle: 'italic' }}>Need to remove this applicant from onboarding?</p>
              <button onClick={() => moveToStage(applicant, 'rejected')} disabled={movingStage} style={outlineBtn(C.danger)}>
                Reject Application
              </button>
            </div>
          </div>
        )}

        {/* Rejected */}
        {isRejected && (
          <div style={{ ...card, padding: '1rem 1.25rem', borderColor: C.danger + '44', background: C.danger + '06' }}>
            <p style={{ fontSize: '0.85rem', color: C.danger, fontWeight: 500 }}>This applicant has been rejected.</p>
          </div>
        )}
      </div>
    )
  }

  // ─────────────────────────── ROOT RENDER ──────────────────────────────────

  if (selected) {
    return (
      <div style={{ position: 'relative' }}>
        <ApplicantDetail applicant={selected} />
        {toast && <Toast toast={toast} />}
        <ParkingPassModal />
        <ConfidentialityModal />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
        {[
          { id: 'pipeline', label: 'Pipeline' },
          { id: 'recent',   label: `Recently Added${completed.length > 0 ? ` (${completed.length})` : ''}` },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: activeTab === tab.id ? 700 : 500,
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              background: activeTab === tab.id ? C.blue + '18' : 'transparent',
              color: activeTab === tab.id ? C.blue : 'var(--muted)',
              border: activeTab === tab.id ? `1px solid ${C.blue}44` : '1px solid transparent',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Pipeline tab */}
      {activeTab === 'pipeline' && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {STAGES.map(stage => {
              const color  = STAGE_COLORS[stage]
              const active = stageFilter === stage
              return (
                <button key={stage} onClick={() => setStageFilter(stage)} style={{ padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: active ? color + '18' : 'var(--surface)', color: active ? color : 'var(--muted)', border: active ? `1px solid ${color}55` : '1px solid var(--border)' }}>
                  {STAGE_LABELS[stage]} <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', opacity: 0.8 }}>({stageCounts[stage]})</span>
                </button>
              )
            })}
          </div>

          {loadError && (
            <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', background: C.danger + '08', border: `1px solid ${C.danger}33` }}>
              <p style={{ fontSize: '0.85rem', color: C.danger, fontWeight: 500 }}>Failed to load: {loadError}</p>
            </div>
          )}

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }}>
            {loading ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading applicants...</p>
            ) : filteredApplicants.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>No applicants in this stage.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {filteredApplicants.map(a => {
                  const interviewLabel = formatInterviewDateTime(a.interview_scheduled_at)
                  return (
                    <div key={a.id} onClick={() => selectApplicant(a)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', transition: 'border-color 0.15s' }} onMouseEnter={e => e.currentTarget.style.borderColor = C.blue} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.primary + '14', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: C.blue, fontSize: '0.95rem', flexShrink: 0 }}>{a.full_name?.charAt(0)}</div>
                        <div>
                          <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>{a.full_name}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{a.email}</p>
                            {interviewLabel && <span style={{ fontSize: '0.72rem', color: C.warn, fontWeight: 600 }}>{interviewLabel}</span>}
                            {a.resume_url && <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: C.blue + '14', color: C.blue, border: `1px solid ${C.blue}33`, fontWeight: 600 }}>resume</span>}
                            {a.stage === 'onboarding' && (
                              <span style={{ display: 'flex', gap: '0.2rem' }}>
                                {[a.onboard_affiliation, a.onboard_birthday, a.onboard_default_role].map((v, i) => (
                                  <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: v ? C.light : 'var(--border)' }} />
                                ))}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <StagePill stage={a.stage} />
                        {a.created_at && <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>{new Date(a.created_at).toLocaleDateString()}</span>}
                        <span style={{ color: 'var(--muted)' }}>›</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Recently Added tab */}
      {activeTab === 'recent' && <RecentlyAdded />}

      {toast && <Toast toast={toast} />}

      <ParkingPassModal />
      <ConfidentialityModal />

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function Toast({ toast }) {
  const bg = toast.type === 'error' ? '#1e40af' : '#02416b'
  return (
    <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: bg, color: '#fff', padding: '0.75rem 1.5rem', borderRadius: '100px', fontWeight: 500, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(2,65,107,0.4)', zIndex: 100, fontFamily: 'DM Sans, sans-serif' }}>
      {toast.text}
    </div>
  )
}