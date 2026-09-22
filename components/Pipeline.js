'use client'
import JSZip from 'jszip'
import { useState, useEffect, useRef, useMemo } from 'react'
import { ROLES, SHIFTS, ROLE_SUGGESTIONS, SCHOOLS, MAJORS, getRoleCapacity } from '../lib/constants'
import { formatSlotFull, formatSlotDayLabel, formatSlotTime, TIMEZONE_LABEL } from '../lib/interview-schedule'

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

// ── Application shift-availability helpers ────────────────────────────────
// The volunteer application form stores each shift as its own boolean
// column (e.g. shift_mon_10_2, shift_tue_2_6 — abbreviated day + shift with
// underscores), while the Training-stage SlotPicker/onboard_preferred_slots
// use "monday-10-2" style keys (full day name + shift). These helpers
// translate between the two so an applicant's stated availability can be
// displayed and used to pre-fill the SlotPicker.
function shiftColumnKey(day, shift) {
  return `shift_${day.slice(0, 3)}_${shift.replace(/-/g, '_')}`
}

function getStatedAvailability(applicant) {
  return ALL_SLOTS.filter(s => applicant?.[shiftColumnKey(s.day, s.shift)])
}

function formatStatedAvailability(applicant) {
  const slots = getStatedAvailability(applicant)
  return slots.length ? slots.map(s => s.label).join(', ') : null
}

// Joins a text[] application field into a readable string, appending the
// free-text "Other" value (e.g. languages_other, certifications_other,
// skills_other) when "Other" was one of the selections.
function joinWithOther(values, otherValue) {
  if (!values || values.length === 0) return null
  const parts = values.map(v => (v === 'Other' && otherValue ? `Other (${otherValue})` : v))
  return parts.join(', ')
}

// Combines a reference's name + contact info into one display string,
// e.g. "Jane Doe — (801) 555-0100". Returns null if both are empty.
function formatReference(name, contact) {
  if (!name && !contact) return null
  if (name && contact) return `${name} — ${contact}`
  return name || contact
}

const STAGES       = ['applied', 'interview', 'onboarding', 'training', 'rejected']
const STAGE_LABELS = { applied: 'Applied', interview: 'Interview', onboarding: 'Onboarding', training: 'Training', rejected: 'Rejected' }

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
  training: '#0c4a6e',
}

const STAGE_COLORS = {
  applied:               C.light,
  interview:             C.warn,
  onboarding:            C.blue,
  onboarding_missionary: C.primary,
  training:              C.training,
  rejected:              C.danger,
}

const EMAIL_STAGES = ['interview', 'onboarding', 'onboarding_missionary', 'rejected']

const TEMPLATE_LABELS = {
  interview:             'Interview Invitation',
  onboarding:            'Onboarding Welcome',
  onboarding_missionary: 'Onboarding — Missionary',
  rejected:              'Rejection Notice',
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
  { key: 'parking_pass',              label: 'Parking Pass',              mandatory: false, bucket: 'onboarding-parking-passes',    urlKey: 'parking_pass_url'      },
]

const FILE_CHECKLIST_ITEMS = CHECKLIST_ITEMS.filter(i => i.bucket && i.urlKey)
const NON_PATIENT_ROLES = ['Information Systems', 'Communications']

const DEFAULT_REQUIRED = ['background_check', 'id_check', 'immunization', 'tb_test']
const NON_PATIENT_ROLES_REQUIRED = ['background_check', 'id_check']
const MISSIONARY_REQUIRED = ['id_check']

const TOTAL_STEPS = 3

// ─── Preparedness scoring ─────────────────────────────────────────────────────
// Hard-coded 100-pt "preparedness" score for each of the six scored roles,
// computed from the volunteer application. Only roles the applicant listed in
// roles_interested are scored. Every category is capped at its stated maximum,
// and each role's category maximums add up to exactly 100.
//
//   • Certifications / Skills — additive per matched item, then capped
//   • Patient care hours      — linear, full points at PREP_HOURS_FULL_AT hrs
//   • Shift availability      — worth PREP_SHIFT_MAX (20) pts for EVERY role;
//                               linear, 1 of 10 shifts = 1/10 of the points,
//                               10 of 10 = all of the points
//   • Language proficiency    — non-English language(s) × proficiency level
//
// Application values are matched by keyword rather than exact string, so
// "Registered Nurse (RN)" and "RN" both count, "AEMT" never counts as "EMT",
// and minor wording changes in the application form won't silently zero a score.

const PREP_HOURS_FULL_AT = 300
const PREP_SHIFT_MAX = 20   // same weight for every role

// Language: share of the language points earned per proficiency level. The
// application's dropdown offers None / Basic / Conversational / Fluent /
// Native; the highest level found in language_proficiency wins ("None"
// scores 0 even if a language box was ticked). If a non-English language is
// listed but no level was chosen, PREP_LANG_DEFAULT_FACTOR is used.
const PREP_LANG_LEVELS = [
  { factor: 1,    label: 'Native / fluent', re: /\b(native|fluen\w*|bilingual|mother tongue)\b/ },
  { factor: 0.75, label: 'Advanced',        re: /\b(advanced|proficient|professional|fully)\b/ },
  { factor: 0.5,  label: 'Conversational',  re: /\b(conversation\w*|intermediate)\b/ },
  { factor: 0.25, label: 'Basic',           re: /\b(basic|beginner|elementary|limited|novice)\b/ },
  { factor: 0,    label: 'None',            re: /\bnone\b/ },
]
const PREP_LANG_DEFAULT_FACTOR = 0.5

// Matched against normText() output (lowercase, punctuation → spaces).
const PREP_CERT_MATCHERS = {
  RN:   /\brn\b|registered nurse/,
  LPN:  /\blpn\b|licensed practical/,
  MA:   /\b[cr]?ma\b|medical assistant/,
  AEMT: /\baemt\b|advanced emt|advanced emergency medical/,
  EMT:  /\bemt\b|emergency medical tech/,
  CNA:  /\bcna\b|\brna\b|nursing assistant/,   // the application also offers "RNA"; scored the same as CNA
  ACLS: /\bacls\b|advanced cardiac|advanced cardiovascular/,
  BLS:  /\bbls\b|basic life support/,
  CPR:  /\bcpr\b/,
}

const PREP_SKILL_MATCHERS = {
  vitalSigns:     /vital/,
  patientIntake:  /intake/,
  phlebotomy:     /phlebotom|venipuncture/,
  emr:            /\bemr\b|\behr\b|electronic (medical|health) record/,
  medTerminology: /medical terminology|med terminology/,
  medTranslation: /translat|interpret/,
  scheduling:     /schedul|front desk/,
  office:         /microsoft|google workspace|google suite|g suite|office suite/,
  scribing:       /scrib/,
  lab:            /laborator|\blab\b/,
}

const PREP_SKILL_LABELS = {
  vitalSigns:     'Vital Signs',
  patientIntake:  'Patient Intake',
  phlebotomy:     'Phlebotomy/Venipuncture',
  emr:            'EMR',
  medTerminology: 'Medical Terminology',
  medTranslation: 'Medical Translation',
  scheduling:     'Scheduling/Front Desk',
  office:         'Microsoft Office/Google Workspace',
  scribing:       'Medical Scribing',
  lab:            'Laboratory Skills',
}

// Category kinds: 'certs' | 'skills' (pts table + cap), 'hours' | 'shifts' |
// 'language' (max only). Categories are listed in the same order as the spec.
const PREP_ROLES = [
  {
    key: 'clinical', role: 'Clinical Staff', short: 'Clinical', aliases: ['clinical staff'],
    categories: [
      { kind: 'certs', label: 'Certifications', cap: 31, pts: { RN: 31, LPN: 25, MA: 21, AEMT: 19, EMT: 15, CNA: 12, ACLS: 9, BLS: 6, CPR: 4, Other: 3 } },
      { kind: 'skills', label: 'Skills', cap: 22, pts: { vitalSigns: 9, patientIntake: 5, emr: 4, medTerminology: 4 } },
      { kind: 'hours', label: 'Patient care hours', cap: 17 },
      { kind: 'shifts', label: 'Shift availability', cap: PREP_SHIFT_MAX },
      { kind: 'language', label: 'Language proficiency', cap: 10 },
    ],
  },
  {
    key: 'navigator', role: 'Patient Nav.', short: 'Navigator', aliases: ['patient nav', 'patient navigator', 'patient navigators'],
    categories: [
      { kind: 'language', label: 'Language proficiency', cap: 44 },
      { kind: 'skills', label: 'Skills', cap: 26, pts: { medTranslation: 16, patientIntake: 5, scheduling: 5 } },
      { kind: 'shifts', label: 'Shift availability', cap: PREP_SHIFT_MAX },
      { kind: 'certs', label: 'Certifications', cap: 10, pts: { BLS: 6, CPR: 4 } },
    ],
  },
  {
    key: 'support', role: 'Support Center', short: 'Support Ctr', aliases: ['support center', 'support centre'],
    categories: [
      { kind: 'shifts', label: 'Shift availability', cap: PREP_SHIFT_MAX },
      { kind: 'skills', label: 'Skills', cap: 53, pts: { scheduling: 33, office: 13, patientIntake: 7 } },
      { kind: 'language', label: 'Language proficiency', cap: 20 },
      { kind: 'certs', label: 'Certifications', cap: 7, pts: { BLS: 4, CPR: 3 } },
    ],
  },
  {
    key: 'scribe', role: 'Scribe', short: 'Scribe', aliases: ['scribe', 'medical scribe'],
    categories: [
      { kind: 'skills', label: 'Skills', cap: 45, pts: { scribing: 28, medTerminology: 11, emr: 6 } },
      { kind: 'shifts', label: 'Shift availability', cap: PREP_SHIFT_MAX },
      { kind: 'hours', label: 'Patient care hours', cap: 15 },
      { kind: 'certs', label: 'Certifications', cap: 10, pts: { BLS: 6, CPR: 4 } },
      { kind: 'language', label: 'Language proficiency', cap: 10 },
    ],
  },
  {
    key: 'lab', role: 'Lab', short: 'Lab', aliases: ['lab', 'laboratory'],
    categories: [
      { kind: 'skills', label: 'Skills', cap: 28, pts: { phlebotomy: 28, lab: 19 } },
      { kind: 'certs', label: 'Certifications', cap: 29, pts: { MA: 17, RN: 17, LPN: 17, AEMT: 17, CNA: 12, EMT: 12 } },
      { kind: 'hours', label: 'Patient care hours', cap: 13 },
      { kind: 'shifts', label: 'Shift availability', cap: PREP_SHIFT_MAX },
      { kind: 'language', label: 'Language proficiency', cap: 10 },
    ],
  },
  {
    key: 'receptionist', role: 'Receptionist', short: 'Reception', aliases: ['receptionist'],
    categories: [
      { kind: 'shifts', label: 'Shift availability', cap: PREP_SHIFT_MAX },
      { kind: 'skills', label: 'Skills', cap: 60, pts: { scheduling: 39, office: 21 } },
      { kind: 'certs', label: 'Certifications', cap: 7, pts: { BLS: 4, CPR: 3 } },
      { kind: 'language', label: 'Language proficiency', cap: 13 },
    ],
  },
]

// ─── Staffing-need scoring (Applied stage) ────────────────────────────────
// A quick "High / Moderate / Low Staffing Need" read on each applicant,
// based on the same six clinic roles PREP_ROLES already knows how to match
// against roles_interested (Clinical Staff, Scribe, Lab, Patient Nav.,
// Receptionist, Support Center):
//   • High     — an open clinic slot exists for a role/day/shift combo the
//                applicant is interested in
//   • Moderate — not High, but fewer than 4 waitlist entries are interested
//                in the same role as the applicant
//   • Low      — neither of the above
const STAFFING_ROLES = PREP_ROLES.map(r => r.role)
const STAFFING_WAITLIST_THRESHOLD = 4

// Canonical clinic roles (matching PREP_ROLES aliases) the applicant expressed
// interest in, deduped, in the order listed.
function getApplicantStaffingRoles(applicant) {
  const interested = prepToList(applicant?.roles_interested).map(normText)
  const roles = []
  const seen = new Set()
  for (const label of interested) {
    const cfg = PREP_ROLES.find(r => r.aliases.includes(label))
    if (!cfg || seen.has(cfg.role)) continue
    seen.add(cfg.role)
    roles.push(cfg.role)
  }
  return roles
}

// Set of "day-shift-role" keys (role limited to STAFFING_ROLES) that
// currently have an unfilled clinic slot — mirrors the openings math in
// ClinicOpenings.jsx / Waitlist.js's computeAvailableSlots.
function computeOpenStaffingSlotSet(scheduleRows) {
  const today = new Date().toISOString().split('T')[0]
  const activeRows = (scheduleRows || []).filter(r => r.end_date == null || r.end_date > today)
  const set = new Set()
  for (const day of DAYS) {
    for (const shift of SHIFTS) {
      for (const role of STAFFING_ROLES) {
        const required = getRoleCapacity(day, shift, role)
        if (!required) continue
        const slotRows = activeRows.filter(r =>
          r.day_of_week?.toLowerCase().trim() === day &&
          r.shift_time?.toLowerCase().trim()  === shift &&
          r.role                               === role
        )
        const filled = slotRows.reduce((sum, r) => sum + (r.week_pattern === 'every' ? 1 : 0.5), 0)
        if (filled < required) set.add(`${day}-${shift}-${role}`)
      }
    }
  }
  return set
}

// How many waitlist entries are interested in each staffing role. An entry
// with no preferred_roles set is "flexible" and counts toward every role
// (same convention Waitlist.js/computeAvailableSlots uses for empty prefs).
function computeWaitlistRoleCounts(waitlistRows) {
  const counts = {}
  for (const role of STAFFING_ROLES) counts[role] = 0
  for (const entry of (waitlistRows || [])) {
    const roles = (entry.preferred_roles?.length > 0) ? entry.preferred_roles : STAFFING_ROLES
    for (const role of roles) {
      if (counts[role] !== undefined) counts[role] += 1
    }
  }
  return counts
}

// Returns 'high' | 'moderate' | 'low', or null if the applicant hasn't
// expressed interest in any of the six scored clinic roles.
function getStaffingNeedLevel(applicant, openSlotSet, waitlistCounts) {
  const roles = getApplicantStaffingRoles(applicant)
  if (roles.length === 0) return null

  const statedSlots = getStatedAvailability(applicant)
  const slots = statedSlots.length > 0 ? statedSlots : ALL_SLOTS   // no shifts checked = flexible

  const hasOpenSlot = roles.some(role =>
    slots.some(s => openSlotSet.has(`${s.day}-${s.shift}-${role}`))
  )
  if (hasOpenSlot) return 'high'

  const underStaffedWaitlist = roles.some(role => (waitlistCounts[role] ?? 0) < STAFFING_WAITLIST_THRESHOLD)
  if (underStaffedWaitlist) return 'moderate'

  return 'low'
}

const STAFFING_NEED_STYLE = {
  high:     { label: 'High Staffing Need',     color: C.primary },
  moderate: { label: 'Moderate Staffing Need', color: C.blue    },
  low:      { label: 'Low Staffing Need',      color: C.muted   },
}

function normText(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// text[] columns normally arrive as arrays; tolerate a delimited string too.
function prepToList(v) {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') return v.split(/[,;\n]/)
  return []
}

function prepClassifyCerts(applicant) {
  const found = new Set()
  for (const raw of prepToList(applicant?.certifications)) {
    const t = normText(raw)
    if (!t) continue
    if (t === 'other') { found.add('Other'); continue }
    let hits = Object.keys(PREP_CERT_MATCHERS).filter(k => PREP_CERT_MATCHERS[k].test(t))
    if (hits.includes('AEMT')) hits = hits.filter(k => k !== 'EMT')   // "Advanced EMT" is AEMT only
    if (hits.length === 0) found.add('Other')   // a real cert we don't have a tier for
    hits.forEach(k => found.add(k))
  }
  if (normText(applicant?.certifications_other)) found.add('Other')
  return found
}

function prepClassifySkills(applicant) {
  const found = new Set()
  for (const raw of prepToList(applicant?.skills_selected)) {
    const t = normText(raw)
    if (!t) continue
    Object.keys(PREP_SKILL_MATCHERS).forEach(k => { if (PREP_SKILL_MATCHERS[k].test(t)) found.add(k) })
  }
  return found
}

function prepPatientHours(applicant) {
  const n = parseFloat(String(applicant?.patient_care_hours ?? '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : 0
}

// Non-English languages spoken + the proficiency level read from
// language_proficiency. English alone earns nothing.
function prepLanguageContext(applicant) {
  const names = []
  for (const l of prepToList(applicant?.languages_spoken)) {
    const t = normText(l)
    if (!t || t === 'english') continue
    if (t === 'other') { if (!normText(applicant?.languages_other)) names.push('Other') }
    else names.push(String(l).trim())
  }
  if (normText(applicant?.languages_other)) names.push(String(applicant.languages_other).trim())
  if (names.length === 0) {
    for (const l of prepToList(applicant?.languages)) {
      const t = normText(l)
      if (t && t !== 'english') names.push(String(l).trim())
    }
  }
  if (names.length === 0) return { factor: 0, note: 'No non-English language listed' }

  const text = normText(applicant?.language_proficiency)
  const levels = PREP_LANG_LEVELS.filter(lv => lv.re.test(text))
  const best = levels.reduce((a, b) => (!a || b.factor > a.factor ? b : a), null)
  const list = names.join(', ')
  return best
    ? { factor: best.factor, note: `${list} — ${best.label}` }
    : { factor: PREP_LANG_DEFAULT_FACTOR, note: `${list} — level not stated (counted as conversational)` }
}

function prepTrim(n) {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

// Returns one entry per scored role the applicant is interested in, in the
// order they listed them: { key, role, short, total, max, categories: [...] }.
function getPreparednessScores(applicant) {
  const interested = prepToList(applicant?.roles_interested).map(normText)
  if (interested.length === 0) return []

  const ctx = {
    certs:  prepClassifyCerts(applicant),
    skills: prepClassifySkills(applicant),
    hours:  prepPatientHours(applicant),
    shifts: getStatedAvailability(applicant).length,
    lang:   prepLanguageContext(applicant),
  }

  const results = []
  const seen = new Set()
  for (const label of interested) {
    const cfg = PREP_ROLES.find(r => r.aliases.includes(label))
    if (!cfg || seen.has(cfg.key)) continue
    seen.add(cfg.key)

    const categories = cfg.categories.map(cat => {
      let earned = 0, note = ''
      if (cat.kind === 'certs') {
        const matched = Object.keys(cat.pts).filter(k => ctx.certs.has(k))
        earned = Math.min(matched.reduce((s, k) => s + cat.pts[k], 0), cat.cap)
        note = matched.length ? matched.join(', ') : 'None'
      } else if (cat.kind === 'skills') {
        const matched = Object.keys(cat.pts).filter(k => ctx.skills.has(k))
        earned = Math.min(matched.reduce((s, k) => s + cat.pts[k], 0), cat.cap)
        note = matched.length ? matched.map(k => PREP_SKILL_LABELS[k]).join(', ') : 'None'
      } else if (cat.kind === 'hours') {
        earned = cat.cap * Math.min(ctx.hours, PREP_HOURS_FULL_AT) / PREP_HOURS_FULL_AT
        note = ctx.hours ? `${prepTrim(ctx.hours)} hrs (full points at ${PREP_HOURS_FULL_AT})` : 'None reported'
      } else if (cat.kind === 'shifts') {
        earned = cat.cap * Math.min(ctx.shifts, ALL_SLOTS.length) / ALL_SLOTS.length
        note = `${ctx.shifts} of ${ALL_SLOTS.length} shifts`
      } else if (cat.kind === 'language') {
        earned = cat.cap * ctx.lang.factor
        note = ctx.lang.note
      }
      return { label: cat.label, earned, max: cat.cap, note }
    })

    results.push({
      key: cfg.key, role: cfg.role, short: cfg.short,
      total: categories.reduce((s, c) => s + c.earned, 0),
      max: categories.reduce((s, c) => s + c.max, 0),
      categories,
    })
  }
  return results
}

// Same scoring math as getPreparednessScores, but returns every one of the
// six core clinical roles regardless of roles_interested — used by the
// Applied-stage "Compare Applicants" overlay so every applicant lines up
// against the same six columns. `interested` flags roles the applicant
// actually listed, so the overlay can distinguish "scored high because
// they're genuinely prepared" from "scored high but never asked for this role".
function getAllRoleScores(applicant) {
  const ctx = {
    certs:  prepClassifyCerts(applicant),
    skills: prepClassifySkills(applicant),
    hours:  prepPatientHours(applicant),
    shifts: getStatedAvailability(applicant).length,
    lang:   prepLanguageContext(applicant),
  }
  const interestedRoles = new Set(getApplicantStaffingRoles(applicant))

  return PREP_ROLES.map(cfg => {
    const total = cfg.categories.reduce((sum, cat) => {
      let earned = 0
      if (cat.kind === 'certs') {
        const matched = Object.keys(cat.pts).filter(k => ctx.certs.has(k))
        earned = Math.min(matched.reduce((s, k) => s + cat.pts[k], 0), cat.cap)
      } else if (cat.kind === 'skills') {
        const matched = Object.keys(cat.pts).filter(k => ctx.skills.has(k))
        earned = Math.min(matched.reduce((s, k) => s + cat.pts[k], 0), cat.cap)
      } else if (cat.kind === 'hours') {
        earned = cat.cap * Math.min(ctx.hours, PREP_HOURS_FULL_AT) / PREP_HOURS_FULL_AT
      } else if (cat.kind === 'shifts') {
        earned = cat.cap * Math.min(ctx.shifts, ALL_SLOTS.length) / ALL_SLOTS.length
      } else if (cat.kind === 'language') {
        earned = cat.cap * ctx.lang.factor
      }
      return sum + earned
    }, 0)
    return { key: cfg.key, short: cfg.short, total: Math.round(total), interested: interestedRoles.has(cfg.role) }
  })
}

// Blue-palette tiers so a score reads at a glance.
function prepTierColor(total) {
  if (total >= 70) return C.primary
  if (total >= 40) return C.blue
  return C.light
}

// Per-role scores for the applicant detail view (Applied stage only). Nothing
// is shown on the pipeline list. Each role's score is a button; its category
// breakdown stays hidden until that score is clicked (click again to hide).
function PreparednessPanel({ applicant, card, secLabel }) {
  const [openKeys, setOpenKeys] = useState([])
  const scores = getPreparednessScores(applicant)
  if (scores.length === 0) return null

  const toggle = key => setOpenKeys(keys => keys.includes(key) ? keys.filter(k => k !== key) : [...keys, key])
  const openScores = scores.filter(s => openKeys.includes(s.key))

  return (
    <div style={{ ...card, padding: '1rem 1.25rem' }}>
      <p style={secLabel}>Preparedness</p>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
        {scores.map(s => {
          const color  = prepTierColor(s.total)
          const isOpen = openKeys.includes(s.key)
          return (
            <button key={s.key} type="button" onClick={() => toggle(s.key)} aria-expanded={isOpen}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', padding: '0.25rem 0.7rem', borderRadius: '100px', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: color + (isOpen ? '26' : '14'), color, border: `1px solid ${color}${isOpen ? '99' : '44'}`, whiteSpace: 'nowrap' }}>
              {s.short}
              <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>{Math.round(s.total)}</span>
              <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>{isOpen ? '▾' : '▸'}</span>
            </button>
          )
        })}
      </div>

      {openScores.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem', marginTop: '0.9rem' }}>
          {openScores.map(s => {
            const color = prepTierColor(s.total)
            return (
              <div key={s.key} style={{ padding: '0.75rem 0.9rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.6rem' }}>
                  <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.role}</p>
                  <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: '1rem', color }}>
                    {Math.round(s.total)}<span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 500 }}>/{s.max}</span>
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {s.categories.map(c => (
                    <div key={c.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                        <span>{c.label}</span>
                        <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--muted)' }}>{prepTrim(c.earned)}/{c.max}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', marginTop: '0.2rem', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${c.max ? (c.earned / c.max) * 100 : 0}%`, background: color, borderRadius: 2 }} />
                      </div>
                      <p style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: '0.15rem', lineHeight: 1.4 }}>{c.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

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

// ─── WelcomePacketManager ─────────────────────────────────────────────────────
// Lifted out of Pipeline so React never remounts it during parent re-renders.
function WelcomePacketManager({ supabase, msg, outlineBtn, solidBtn, secLabel, card }) {
  const [packetPath, setPacketPath] = useState(null)
  const [uploading,  setUploading]  = useState(false)
  const ref = useRef(null)

  useEffect(() => { loadPacketMeta() }, [])

  async function loadPacketMeta() {
    const { data } = await supabase
      .from('email_templates')
      .select('welcome_packet_path')
      .eq('stage', 'onboarding')
      .maybeSingle()
    if (data?.welcome_packet_path) setPacketPath(data.welcome_packet_path)
  }

  async function handleUpload(file) {
    setUploading(true)
    const path = `welcome_packet.pdf`
    const { error } = await supabase.storage
      .from('onboarding-assets')
      .upload(path, file, { upsert: true, contentType: 'application/pdf' })
    if (error) { msg(error.message, 'error'); setUploading(false); return }

    await supabase
      .from('email_templates')
      .update({ welcome_packet_path: path })
      .eq('stage', 'onboarding')

    setPacketPath(path)
    msg('Welcome packet updated')
    setUploading(false)
  }

  async function viewCurrent() {
    const { data } = await supabase.storage
      .from('onboarding-assets')
      .createSignedUrl(packetPath, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  return (
    <div style={{
      ...card,
      padding: '1rem 1.25rem',
      borderColor: C.blue + '44',
      background: C.blue + '06',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '0.75rem',
      marginBottom: '0.5rem',
    }}>
      <div>
        <p style={{ ...secLabel, marginBottom: '0.2rem', color: C.blue }}>
          Welcome Packet Attachment
        </p>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.5 }}>
          {packetPath
            ? 'A PDF is attached to every onboarding email automatically (both standard and missionary).'
            : 'No packet uploaded yet — onboarding emails will send without an attachment.'}
        </p>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
        {packetPath && (
          <button onClick={viewCurrent} style={outlineBtn(C.blue)}>
            View Current ↗
          </button>
        )}
        <input
          ref={ref}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleUpload(f)
            e.target.value = ''
          }}
        />
        <button
          onClick={() => ref.current?.click()}
          disabled={uploading}
          style={solidBtn(C.blue, uploading)}
        >
          {uploading ? 'Uploading...' : packetPath ? 'Replace Packet' : '+ Upload Packet'}
        </button>
      </div>
    </div>
  )
}

// ─── EmailTemplatesTab ────────────────────────────────────────────────────────
// Lifted out of Pipeline so React never remounts it during parent re-renders.
function EmailTemplatesTab({
  supabase, profile,
  templatesLoading, templates, setTemplates,
  templateDrafts, setTemplateDrafts,
  activeTemplate, setActiveTemplate,
  savingTemplate, saveTemplate, updateDraft,
  card, inputStyle, labelStyle, secLabel,
  solidBtn, ghostBtn, outlineBtn, msg,
}) {
  if (templatesLoading) return <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading templates...</p>

  const draft   = templateDrafts[activeTemplate] || templates[activeTemplate] || { subject: '', body: '' }
  const isDirty = JSON.stringify(draft) !== JSON.stringify(templates[activeTemplate] || {})

  // Preview: replace placeholders with sample values
  const senderPreview   = profile?.full_name || 'Your Name'
  const schedulingPreview = 'https://yourapp.com/schedule/sample-token-1234'
  const previewSubject = (draft.subject || '')
    .replace(/\{\{name\}\}/g, 'Jane Doe')
    .replace(/\{\{email\}\}/g, 'jane@example.com')
    .replace(/\{\{sender_name\}\}/g, senderPreview)
    .replace(/\{\{scheduling_link\}\}/g, schedulingPreview)
  const previewBody    = (draft.body    || '')
    .replace(/\{\{name\}\}/g, 'Jane Doe')
    .replace(/\{\{email\}\}/g, 'jane@example.com')
    .replace(/\{\{sender_name\}\}/g, senderPreview)
    .replace(/\{\{scheduling_link\}\}/g, schedulingPreview)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      <WelcomePacketManager
        supabase={supabase}
        msg={msg}
        outlineBtn={outlineBtn}
        solidBtn={solidBtn}
        secLabel={secLabel}
        card={card}
      />

      {/* Stage selector pills */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {EMAIL_STAGES.map(stage => {
          const color   = STAGE_COLORS[stage]
          const active  = activeTemplate === stage
          const hasDiff = JSON.stringify(templateDrafts[stage]) !== JSON.stringify(templates[stage] || {})
          return (
            <button
              key={stage}
              onClick={() => setActiveTemplate(stage)}
              style={{
                padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem',
                fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                background: active ? color + '18' : 'var(--surface)',
                color: active ? color : 'var(--muted)',
                border: active ? `1px solid ${color}55` : '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: '0.4rem',
              }}
            >
              {TEMPLATE_LABELS[stage]}
              {hasDiff && <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />}
            </button>
          )
        })}
      </div>

      {/* Editor + Preview side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'start' }}>

        {/* Left: editor */}
        <div style={{ ...card, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ ...secLabel, color: STAGE_COLORS[activeTemplate], marginBottom: 0 }}>
              {TEMPLATE_LABELS[activeTemplate]}
            </p>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>
              Use {'{{name}}'}, {'{{email}}'}, {'{{sender_name}}'}
              {activeTemplate === 'interview' && <>, {'{{scheduling_link}}'}</>}
            </span>
          </div>

          <div>
            <label style={labelStyle}>Subject line</label>
            <input
              value={draft.subject}
              onChange={e => updateDraft(activeTemplate, 'subject', e.target.value)}
              placeholder="Subject…"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Body</label>
            <textarea
              value={draft.body}
              onChange={e => updateDraft(activeTemplate, 'body', e.target.value)}
              placeholder="Email body…"
              rows={14}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', alignItems: 'center' }}>
            {isDirty && (
              <button
                onClick={() => setTemplateDrafts(prev => ({ ...prev, [activeTemplate]: templates[activeTemplate] || { subject: '', body: '' } }))}
                style={ghostBtn()}
              >
                Discard
              </button>
            )}
            <button
              onClick={() => saveTemplate(activeTemplate)}
              disabled={savingTemplate || !isDirty}
              style={solidBtn(STAGE_COLORS[activeTemplate], savingTemplate || !isDirty)}
            >
              {savingTemplate ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>

        {/* Right: preview */}
        <div style={{ ...card, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--bg)' }}>
          <p style={{ ...secLabel, marginBottom: 0 }}>Preview — sample applicant</p>

          {/* Email chrome mockup */}
          <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', fontSize: '0.85rem' }}>
            {/* Header */}
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.3rem' }}>
                <span style={{ color: 'var(--muted)', fontSize: '0.78rem', minWidth: 50 }}>To</span>
                <span style={{ fontSize: '0.78rem' }}>Jane Doe &lt;jane@example.com&gt;</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span style={{ color: 'var(--muted)', fontSize: '0.78rem', minWidth: 50 }}>Subject</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{previewSubject || <em style={{ opacity: 0.5 }}>No subject</em>}</span>
              </div>
            </div>
            {/* Body */}
            <div style={{ padding: '1rem', background: 'var(--surface)', whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: '0.85rem', color: 'var(--text)', minHeight: 200 }}>
              {previewBody || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>No body yet</span>}
            </div>
          </div>

          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.5 }}>
            This email is sent automatically when an applicant is moved to <strong>{STAGE_LABELS[activeTemplate]}</strong>.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── CalendarTab ──────────────────────────────────────────────────────────────
// Lifted out of Pipeline so React never remounts it during parent re-renders.
// Admin-facing view of the interview self-scheduling system: shows booked
// appointments (however they were booked — by the applicant themselves via
// their link, or manually by an admin on the applicant's detail page), lets
// staff carve out blackout windows, and surfaces each interview-stage
// applicant's personal scheduling link so it can be copied into an email.
function CalendarTab({
  supabase, profile, applicants,
  card, inputStyle, labelStyle, secLabel,
  solidBtn, ghostBtn, outlineBtn, msg, audit,
}) {
  const [appointments,   setAppointments]   = useState([])
  const [blocked,        setBlocked]        = useState([])
  const [loading,        setLoading]        = useState(true)
  const [cancellingId,   setCancellingId]   = useState(null)
  const [deletingId,     setDeletingId]     = useState(null)
  const [copiedToken,    setCopiedToken]    = useState(null)

  const EMPTY_BLOCK_FORM = { startDate: '', startTime: '', endDate: '', endTime: '', reason: '' }
  const [blockForm,  setBlockForm]  = useState(EMPTY_BLOCK_FORM)
  const [savingBlock, setSavingBlock] = useState(false)

  // Manual interview scheduling (admin picks an applicant + a date/time directly)
  const EMPTY_MANUAL_FORM = { applicantId: '', date: '', time: '' }
  const [manualForm,      setManualForm]      = useState(EMPTY_MANUAL_FORM)
  const [schedulingManual, setSchedulingManual] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: appts, error: apptErr }, { data: blocks, error: blockErr }] = await Promise.all([
      supabase
        .from('interview_appointments')
        .select('id, applicant_id, scheduled_at, status, source, volunteer_applications ( full_name, email, stage )')
        .eq('status', 'booked')
        .order('scheduled_at', { ascending: true }),
      supabase
        .from('interview_blocked_times')
        .select('id, start_at, end_at, reason')
        .order('start_at', { ascending: true }),
    ])
    if (apptErr)  console.error('load appointments failed:', apptErr)
    if (blockErr) console.error('load blocked times failed:', blockErr)
    setAppointments(appts ?? [])
    setBlocked(blocks ?? [])
    setLoading(false)
  }

  async function cancelAppointment(appt) {
    setCancellingId(appt.id)

    const { error } = await supabase.from('interview_appointments').delete().eq('id', appt.id)
    if (error) {
      msg(`Failed to cancel: ${error.message}`, 'error')
      setCancellingId(null)
      return
    }

    // Clear the applicant's cached scheduled time so the Pipeline tab no
    // longer shows or gates on an interview that no longer exists.
    const { error: applicantError } = await supabase.from('volunteer_applications')
      .update({ interview_scheduled_at: null })
      .eq('id', appt.applicant_id)
    if (applicantError) console.error('failed to clear interview_scheduled_at:', applicantError)

    await audit(
      'interview_appointment_cancelled',
      'applicant',
      appt.applicant_id,
      appt.volunteer_applications?.full_name,
      `interview scheduled for ${formatSlotFull(appt.scheduled_at)} was cancelled and removed`
    )

    msg('Interview cancelled')
    await load()
    setCancellingId(null)
  }

  async function scheduleManual() {
    if (!manualForm.applicantId || !manualForm.date) return
    setSchedulingManual(true)
    const iso = manualForm.time
      ? new Date(`${manualForm.date}T${manualForm.time}`).toISOString()
      : new Date(`${manualForm.date}T00:00`).toISOString()

    const { error: apptError } = await supabase.from('interview_appointments').insert({
      applicant_id: manualForm.applicantId,
      scheduled_at: iso,
      status:       'booked',
      source:       'admin',
    })
    if (apptError) {
      msg(`Failed to schedule: ${apptError.message}`, 'error')
      setSchedulingManual(false)
      return
    }

    // Keep the applicant record's cached scheduled time in sync (used to gate
    // moving an applicant to onboarding on the Pipeline tab).
    const { error: applicantError } = await supabase.from('volunteer_applications')
      .update({ interview_scheduled_at: iso })
      .eq('id', manualForm.applicantId)
    if (applicantError) msg(`Interview booked, but failed to update applicant record: ${applicantError.message}`, 'error')
    else msg('Interview scheduled')

    setManualForm(EMPTY_MANUAL_FORM)
    await load()
    setSchedulingManual(false)
  }

  async function addBlock() {
    if (!blockForm.startDate || !blockForm.endDate) return
    const start = new Date(`${blockForm.startDate}T${blockForm.startTime || '00:00'}`)
    const end   = new Date(`${blockForm.endDate}T${blockForm.endTime || '23:59'}`)
    if (end <= start) { msg('End time must be after start time.', 'error'); return }

    setSavingBlock(true)
    const { error } = await supabase.from('interview_blocked_times').insert({
      start_at:   start.toISOString(),
      end_at:     end.toISOString(),
      reason:     blockForm.reason || null,
      created_by: profile?.id ?? null,
    })
    if (error) msg(`Failed to add blocked time: ${error.message}`, 'error')
    else { msg('Blocked time added'); setBlockForm(EMPTY_BLOCK_FORM); await load() }
    setSavingBlock(false)
  }

  async function deleteBlock(id) {
    setDeletingId(id)
    const { error } = await supabase.from('interview_blocked_times').delete().eq('id', id)
    if (error) msg(`Failed to remove blocked time: ${error.message}`, 'error')
    else { msg('Blocked time removed'); await load() }
    setDeletingId(null)
  }

  function copyLink(token) {
    const url = `${window.location.origin}/schedule/${token}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(token)
      setTimeout(() => setCopiedToken(t => (t === token ? null : t)), 2000)
    })
  }

  // Group appointments by local calendar day for display
  function groupByDay(list) {
    const byDay = new Map()
    for (const a of list) {
      const key = formatSlotDayLabel(a.scheduled_at)
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key).push(a)
    }
    return Array.from(byDay.entries())
  }

  const now = new Date()
  // Only surface appointments for applicants still in the interview stage —
  // once an applicant moves on (onboarding, rejected, back to applied), their
  // slot is hidden here even though the row itself is left alone in the DB.
  const visibleAppointments = appointments.filter(a => a.volunteer_applications?.stage === 'interview')
  const upcomingAppointments = visibleAppointments.filter(a => new Date(a.scheduled_at) >= now)
  const lapsedAppointments   = visibleAppointments
    .filter(a => new Date(a.scheduled_at) < now)
    .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at)) // most recently lapsed first

  const upcomingDays = groupByDay(upcomingAppointments)
  const lapsedDays   = groupByDay(lapsedAppointments)

  const interviewApplicants = (applicants || []).filter(a => a.stage === 'interview')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* ── Upcoming interviews ── */}
      <div style={card}>
        <p style={secLabel}>Upcoming Interviews <span style={{ opacity: 0.7 }}>({TIMEZONE_LABEL})</span></p>
        {loading ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading...</p>
        ) : upcomingDays.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>No interviews booked yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {upcomingDays.map(([day, appts]) => (
              <div key={day}>
                <p style={{ fontSize: '0.78rem', fontWeight: 700, color: C.blue, marginBottom: '0.5rem' }}>{day}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {appts.map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.9rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.85rem', fontWeight: 600, color: C.primary, minWidth: 84 }}>{formatSlotTime(a.scheduled_at)}</span>
                        <div>
                          <p style={{ fontWeight: 500, fontSize: '0.88rem' }}>{a.volunteer_applications?.full_name ?? '—'}</p>
                          <p style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{a.volunteer_applications?.email}</p>
                        </div>
                        <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: (a.source === 'self' ? C.light : C.muted) + '18', color: a.source === 'self' ? C.light : 'var(--muted)', border: `1px solid ${a.source === 'self' ? C.light : 'var(--muted)'}44`, fontWeight: 600 }}>
                          {a.source === 'self' ? 'self-booked' : 'admin'}
                        </span>
                      </div>
                      <button onClick={() => cancelAppointment(a)} disabled={cancellingId === a.id} style={ghostBtn()}>
                        {cancellingId === a.id ? 'Cancelling...' : 'Cancel'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Lapsed interviews (scheduled time has passed but appointment is still "booked") ── */}
      <div style={card}>
        <p style={secLabel}>Lapsed Interviews <span style={{ opacity: 0.7 }}>({TIMEZONE_LABEL})</span></p>
        {loading ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading...</p>
        ) : lapsedDays.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>No lapsed interviews.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {lapsedDays.map(([day, appts]) => (
              <div key={day}>
                <p style={{ fontSize: '0.78rem', fontWeight: 700, color: C.danger, marginBottom: '0.5rem' }}>{day}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {appts.map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.9rem', borderRadius: '8px', border: `1px solid ${C.danger}33`, background: C.danger + '08' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.85rem', fontWeight: 600, color: C.danger, minWidth: 84 }}>{formatSlotTime(a.scheduled_at)}</span>
                        <div>
                          <p style={{ fontWeight: 500, fontSize: '0.88rem' }}>{a.volunteer_applications?.full_name ?? '—'}</p>
                          <p style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{a.volunteer_applications?.email}</p>
                        </div>
                        <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: C.danger + '18', color: C.danger, border: `1px solid ${C.danger}44`, fontWeight: 600 }}>
                          lapsed
                        </span>
                        <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: (a.source === 'self' ? C.light : C.muted) + '18', color: a.source === 'self' ? C.light : 'var(--muted)', border: `1px solid ${a.source === 'self' ? C.light : 'var(--muted)'}44`, fontWeight: 600 }}>
                          {a.source === 'self' ? 'self-booked' : 'admin'}
                        </span>
                      </div>
                      <button onClick={() => cancelAppointment(a)} disabled={cancellingId === a.id} style={ghostBtn()}>
                        {cancellingId === a.id ? 'Cancelling...' : 'Cancel'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Blocked times ── */}
      <div style={card}>
        <p style={secLabel}>Blocked Times</p>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
          Applicants won't see or be able to book any slot that falls inside a blocked window (vacations, holidays,
          all-staff meetings, etc.).
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '0.6rem', alignItems: 'end', marginBottom: '1rem' }}>
          <div>
            <label style={labelStyle}>Start date</label>
            <input type="date" value={blockForm.startDate} onChange={e => setBlockForm(f => ({ ...f, startDate: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Start time</label>
            <input type="time" value={blockForm.startTime} onChange={e => setBlockForm(f => ({ ...f, startTime: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>End date</label>
            <input type="date" value={blockForm.endDate} onChange={e => setBlockForm(f => ({ ...f, endDate: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>End time</label>
            <input type="time" value={blockForm.endTime} onChange={e => setBlockForm(f => ({ ...f, endTime: e.target.value }))} style={inputStyle} />
          </div>
          <button onClick={addBlock} disabled={savingBlock || !blockForm.startDate || !blockForm.endDate} style={solidBtn(C.warn, savingBlock || !blockForm.startDate || !blockForm.endDate)}>
            {savingBlock ? 'Adding...' : 'Add Block'}
          </button>
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Reason (optional)</label>
          <input type="text" placeholder="e.g. Staff retreat" value={blockForm.reason} onChange={e => setBlockForm(f => ({ ...f, reason: e.target.value }))} style={inputStyle} />
        </div>

        {blocked.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>No blocked times set.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {blocked.map(b => (
              <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.9rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                <div>
                  <p style={{ fontWeight: 500, fontSize: '0.88rem' }}>{formatSlotFull(b.start_at)} → {formatSlotFull(b.end_at)}</p>
                  {b.reason && <p style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{b.reason}</p>}
                </div>
                <button onClick={() => deleteBlock(b.id)} disabled={deletingId === b.id} style={ghostBtn()}>
                  {deletingId === b.id ? 'Removing...' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Manually schedule an interview ── */}
      <div style={card}>
        <p style={secLabel}>Manually Schedule Interview</p>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
          Book an interview time for an applicant directly, as an alternative to them booking it themselves via their
          scheduling link.
        </p>
        {interviewApplicants.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>No applicants currently in the Interview stage.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr auto', gap: '0.6rem', alignItems: 'end' }}>
            <div>
              <label style={labelStyle}>Applicant</label>
              <select value={manualForm.applicantId} onChange={e => setManualForm(f => ({ ...f, applicantId: e.target.value }))} style={inputStyle}>
                <option value="">Select applicant…</option>
                {interviewApplicants.map(a => (
                  <option key={a.id} value={a.id}>{a.full_name} — {a.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={manualForm.date} onChange={e => setManualForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Time (optional)</label>
              <input type="time" value={manualForm.time} onChange={e => setManualForm(f => ({ ...f, time: e.target.value }))} style={inputStyle} />
            </div>
            <button
              onClick={scheduleManual}
              disabled={schedulingManual || !manualForm.applicantId || !manualForm.date}
              style={solidBtn(C.warn, schedulingManual || !manualForm.applicantId || !manualForm.date)}
            >
              {schedulingManual ? 'Scheduling...' : 'Schedule'}
            </button>
          </div>
        )}
      </div>

      {/* ── Scheduling links ── 
      <div style={card}>
        <p style={secLabel}>Applicant Scheduling Links</p>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
          Each applicant in the Interview stage has a personal link they can use to pick, reschedule, or cancel
          their own interview time — no admin action needed. Copy it into their interview invitation email.
        </p>
        {interviewApplicants.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>No applicants currently in the Interview stage.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {interviewApplicants.map(a => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.9rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                <div>
                  <p style={{ fontWeight: 500, fontSize: '0.88rem' }}>{a.full_name}</p>
                  <p style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{a.email}</p>
                </div>
                <button onClick={() => copyLink(a.interview_scheduling_token)} style={outlineBtn(copiedToken === a.interview_scheduling_token ? C.success : C.blue)}>
                  {copiedToken === a.interview_scheduling_token ? 'Copied ✓' : 'Copy Link'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>*/}
    </div>
  )
}

// Textbox inputs for extra fields that only appear for certain affiliation types (missionary, student, intern, provider).

function CredentialInput({ fieldKey, label, value, onChange, allowNA, labelStyle, inputStyle }) {
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

function AffiliationExtras({ onboardForm, setOnboardForm, labelStyle, inputStyle, secLabel }) {
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
          {PROVIDER_CRED_FIELDS.map(f => <CredentialInput key={f.key} fieldKey={f.key} label={f.label} value={onboardForm[f.key] || ''} onChange={val => setOnboardForm(p => ({ ...p, [f.key]: val }))} allowNA={!!f.allowNA} labelStyle={labelStyle} inputStyle={inputStyle} />)}
        </div>
      </div>
    </div>
  )
  return null
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
  const [affiliationModal, setAffiliationModal] = useState(null)   // { applicant } | null
  const [affiliationPick,  setAffiliationPick]  = useState('')      // value chosen in modal
  const [rejectModal,      setRejectModal]      = useState(null)   // { applicant } | null — choose notify-email vs silent reject
  const [creatingProfile, setCreatingProfile] = useState(false)

  // Training stage — availability & roles-trained-in are collected here
  // (post-onboarding) instead of during the onboarding wizard. Keyed by
  // applicant id so edits on one card don't leak into another.
  const [trainingSaving,       setTrainingSaving]       = useState({}) // { [applicantId]: boolean }
  const [trainingDrafts,       setTrainingDrafts]       = useState({}) // { [applicantId]: { preferred_slots, preferred_roles } }
  const [movingToWaitlistId,   setMovingToWaitlistId]   = useState(null)
  const [rejectingTrainingId,  setRejectingTrainingId]  = useState(null)

  // templates shape: { interview: { subject, body }, onboarding: { ... }, rejected: { ... } }
  const [templates,        setTemplates]        = useState({})
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [activeTemplate,   setActiveTemplate]   = useState('interview')
  const [savingTemplate,   setSavingTemplate]   = useState(false)
  // local edits per stage before saving
  const [templateDrafts,   setTemplateDrafts]   = useState({})

  // ── Parking pass modal state ───────────────────────────────────────────────
  const [parkingPassModal,  setParkingPassModal]  = useState(null)
  const [parkingPassSaving, setParkingPassSaving] = useState(false)
  const parkingPassIframeRef = useRef(null)

  // ── Confidentiality agreement modal state ─────────────────────────────────
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
    default_role: '',
  }
  const [onboardForm,  setOnboardForm]  = useState(EMPTY_FORM)
  const [onboardStep,  setOnboardStep]  = useState(1)
  const [savingStep,   setSavingStep]   = useState(false)

  // Admin notes — free text captured during onboarding, carried over to the
  // volunteer's profile once created (visible/editable on the Volunteers tab).
  const [notesDraft,  setNotesDraft]  = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

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

  // ── Staffing-need context (Applied stage badge) ────────────────────────────
  // Raw rows pulled once and recomputed into lookups via useMemo below.
  const [staffingSchedule, setStaffingSchedule] = useState([])
  const [staffingWaitlist, setStaffingWaitlist] = useState([])

  // ── Applied-stage "Compare Applicants" overlay ──────────────────────────
  const [compareOpen, setCompareOpen] = useState(false)

  // ── Applicant profile photo state ──────────────────────────────────────────
  const [applicantPhotoUrl,       setApplicantPhotoUrl]       = useState(null)
  const [uploadingApplicantPhoto, setUploadingApplicantPhoto] = useState(false)
  const [applicantAvatarPath,     setApplicantAvatarPath]     = useState(null)
  const applicantPhotoInputRef = useRef(null)

  useEffect(() => { loadAll(); loadStaffingContext() }, [])

  useEffect(() => {
    if (activeTab === 'templates' && Object.keys(templates).length === 0) {
      loadTemplates()
    }
  }, [activeTab])

  // Lookups for the Applied-stage "Staffing Need" badge — recomputed only
  // when the underlying clinic schedule / waitlist rows change.
  const staffingOpenSlots = useMemo(
    () => computeOpenStaffingSlotSet(staffingSchedule),
    [staffingSchedule]
  )
  const staffingWaitlistCounts = useMemo(
    () => computeWaitlistRoleCounts(staffingWaitlist),
    [staffingWaitlist]
  )

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
      // Recently Added shows anyone who has finished onboarding: those currently
      // in training (just onboarded) as well as those who finished training
      // (moved to the waitlist, or rejected out of training).
      supabase.from('volunteer_applications').select('*').in('stage', ['training', 'completed']).order('stage_updated_at', { ascending: false }),
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

  // Clinic schedule + waitlist rows feeding the Applied-stage "Staffing Need"
  // badge. Failures here are non-fatal — the badge just won't render.
  async function loadStaffingContext() {
    const [schedRes, wlRes] = await Promise.all([
      supabase.from('schedule').select('day_of_week, shift_time, role, end_date, week_pattern'),
      supabase.from('waitlist').select('preferred_roles'),
    ])
    if (!schedRes.error) setStaffingSchedule(schedRes.data || [])
    if (!wlRes.error)    setStaffingWaitlist(wlRes.data || [])
  }

  async function loadCompleted() {
    const { data, error } = await supabase
      .from('volunteer_applications').select('*').in('stage', ['training', 'completed']).order('stage_updated_at', { ascending: false })
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

  async function loadTemplates() {
    setTemplatesLoading(true)
    const { data, error } = await supabase
      .from('email_templates')
      .select('stage, subject, body')
      .in('stage', EMAIL_STAGES)

    if (!error && data) {
      const map = {}
      data.forEach(row => { map[row.stage] = { subject: row.subject, body: row.body } })
      setTemplates(map)
      // Initialise drafts from DB values so inputs are populated immediately
      setTemplateDrafts(map)
    }
    setTemplatesLoading(false)
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

  // ─── Admin notes (application/needs/wants) ────────────────────────────────
  async function saveApplicantNotes(applicantId, value) {
    setSavingNotes(true)
    const { error } = await supabase.from('volunteer_applications').update({ notes: value }).eq('id', applicantId)
    if (error) {
      msg(error.message, 'error')
    } else {
      setSelected(prev => (prev && prev.id === applicantId) ? { ...prev, notes: value } : prev)
    }
    setSavingNotes(false)
  }

  async function sendStageEmail(applicant, stage) {
    if (!EMAIL_STAGES.includes(stage)) return

    // For onboarding emails (both regular and missionary), generate a signed URL for the welcome packet
    let attachmentUrl = null
    const isOnboardingVariant = stage === 'onboarding' || stage === 'onboarding_missionary'
    if (isOnboardingVariant) {
      const { data: tmpl } = await supabase
        .from('email_templates')
        .select('welcome_packet_path')
        .eq('stage', 'onboarding')
        .maybeSingle()

      if (tmpl?.welcome_packet_path) {
        const { data: signed } = await supabase.storage
          .from('onboarding-assets')
          .createSignedUrl(tmpl.welcome_packet_path, 3600)
        attachmentUrl = signed?.signedUrl ?? null
      }
    }

    // For the interview invitation, build the applicant's personal self-scheduling
    // link so the edge function can substitute it into the {{scheduling_link}}
    // placeholder in the email body.
    const schedulingLink = stage === 'interview' && applicant.interview_scheduling_token
      ? `${window.location.origin}/schedule/${applicant.interview_scheduling_token}`
      : null

    try {
      const { error } = await supabase.functions.invoke('send-stage-email', {
        body: {
          applicantEmail: applicant.email,
          applicantName:  applicant.full_name,
          stage,
          attachmentUrl,
          schedulingLink,
          senderName: profile?.full_name || 'BFC Volunteer Team',
        },
      })
      if (error) {
        console.error('Email send error:', error)
        msg(`Stage moved, but email failed: ${error.message}`, 'error')
      } else {
        const stageLabel = stage === 'onboarding_missionary' ? 'Onboarding (Missionary)' : STAGE_LABELS[stage] ?? stage
        msg(`Moved to ${stageLabel} — email sent to ${applicant.email}`)
      }
    } catch (e) {
      console.error('Email send exception:', e)
      msg(`Stage moved, but email failed: ${e.message}`, 'error')
    }
  }

  // ─── Pipeline actions ─────────────────────────────────────────────────────

  // ── MODIFIED: moveToStage now fires sendStageEmail after a successful move ─
  // opts.silent — when true (used for rejections), skips sendStageEmail entirely
  async function moveToStage(applicant, stage, opts = {}) {
    setMovingStage(true)
    const { error } = await supabase.from('volunteer_applications')
      .update({ stage, stage_updated_at: new Date().toISOString() }).eq('id', applicant.id)
    if (error) {
      msg(error.message, 'error')
    } else {
      await audit(`pipeline_${stage}`, 'applicant', applicant.id, applicant.full_name, opts.silent ? `${stage} (silent — no email sent)` : stage)
      await loadApplicants()
      setSelected(prev => prev?.id === applicant.id ? { ...prev, stage } : prev)

      if (opts.silent) {
        msg(`Moved to ${STAGE_LABELS[stage] ?? stage} — no email sent`)
      } else {
        await sendStageEmail(applicant, stage)
      }
    }
    setMovingStage(false)
  }

  // ── NEW: opens the reject modal so the admin can choose notify-email vs silent ─
  function openRejectModal(applicant) {
    setRejectModal({ applicant })
  }

  async function confirmReject(silent) {
    if (!rejectModal) return
    const { applicant } = rejectModal
    setRejectModal(null)
    await moveToStage(applicant, 'rejected', { silent })
  }

  // ── NEW: opens the affiliation modal before moving to onboarding ──────────
  function openAffiliationModal(applicant) {
    // Pre-fill with any previously saved affiliation on the applicant row
    setAffiliationPick(applicant.onboard_affiliation || '')
    setAffiliationModal({ applicant })
  }

  async function confirmMoveToOnboarding() {
    if (!affiliationModal) return
    const { applicant } = affiliationModal
    const affiliation   = affiliationPick

    setMovingStage(true)

    // Persist the affiliation on the applicant row immediately
    if (affiliation) {
      await supabase.from('volunteer_applications')
        .update({ onboard_affiliation: affiliation })
        .eq('id', applicant.id)
    }

    // Move stage
    const { error } = await supabase.from('volunteer_applications')
      .update({ stage: 'onboarding', stage_updated_at: new Date().toISOString() })
      .eq('id', applicant.id)

    if (error) {
      msg(error.message, 'error')
      setMovingStage(false)
      setAffiliationModal(null)
      return
    }

    await audit('pipeline_onboarding', 'applicant', applicant.id, applicant.full_name,
      `affiliation: ${affiliation || 'unknown'}`)
    await loadApplicants()
    setSelected(prev => prev?.id === applicant.id
      ? { ...prev, stage: 'onboarding', onboard_affiliation: affiliation }
      : prev
    )

    // Fire the correct email template based on affiliation
    const emailStage = affiliation === 'missionary' ? 'onboarding_missionary' : 'onboarding'
    await sendStageEmail({ ...applicant, onboard_affiliation: affiliation }, emailStage)

    setMovingStage(false)
    setAffiliationModal(null)
  }

  // ─── Training stage: availability & trained-roles editing, waitlist/reject ─

  // The applicant/onboarding row stores these under the onboard_-prefixed
  // column names; the waitlist table (and the rest of this component) uses
  // the shorter preferred_slots/preferred_roles names, so this maps between
  // the two wherever we read from or write to volunteer_applications.
  const TRAINING_FIELD_COLUMN = {
    preferred_slots: 'onboard_preferred_slots',
    preferred_roles: 'onboard_preferred_roles',
  }

  // Merges any in-progress local edits for this applicant with what's already
  // saved on their application row, so callers always see the latest values
  // regardless of whether a given field has been touched yet.
  function getTrainingDraft(applicant) {
    const savedSlots = applicant.onboard_preferred_slots
    const statedSlots = getStatedAvailability(applicant).map(s => s.key)
    return {
      // Fall back to what the applicant said on their application if staff
      // haven't set/overridden availability yet, instead of starting blank.
      preferred_slots: trainingDrafts[applicant.id]?.preferred_slots ?? (savedSlots?.length ? savedSlots : statedSlots),
      preferred_roles: trainingDrafts[applicant.id]?.preferred_roles ?? applicant.onboard_preferred_roles ?? [],
    }
  }

  async function updateTrainingField(applicantId, field, value) {
    setTrainingDrafts(prev => ({
      ...prev,
      [applicantId]: { ...(prev[applicantId] || {}), [field]: value },
    }))
    setTrainingSaving(prev => ({ ...prev, [applicantId]: true }))
    const column = TRAINING_FIELD_COLUMN[field]
    const { error } = await supabase.from('volunteer_applications').update({ [column]: value }).eq('id', applicantId)
    if (error) msg(`Failed to save ${field === 'preferred_slots' ? 'availability' : 'trained roles'}: ${error.message}`, 'error')
    setTrainingSaving(prev => ({ ...prev, [applicantId]: false }))
  }

  async function moveToWaitlist(applicant) {
    const { preferred_slots, preferred_roles } = getTrainingDraft(applicant)
    setMovingToWaitlistId(applicant.id)

    const { error: waitlistErr } = await supabase.from('waitlist').insert({
      volunteer_id:    applicant.volunteer_id,
      preferred_slots,
      preferred_roles,
      source:          'pipeline',
      added_by:        profile.id,
    })
    if (waitlistErr) {
      msg(`Waitlist insert failed: ${waitlistErr.message}`, 'error')
      setMovingToWaitlistId(null)
      return
    }

    const { error: appErr } = await supabase.from('volunteer_applications')
      .update({ stage: 'completed', stage_updated_at: new Date().toISOString() })
      .eq('id', applicant.id)
    if (appErr) {
      msg(`Added to waitlist, but failed to update pipeline stage: ${appErr.message}`, 'error')
      setMovingToWaitlistId(null)
      return
    }

    await audit('moved_to_waitlist', 'volunteer', applicant.volunteer_id, applicant.full_name,
      `preferred_roles: ${preferred_roles.join(', ') || 'none'}`)
    msg(`${applicant.full_name} moved to the waitlist`)

    setTrainingDrafts(prev => { const next = { ...prev }; delete next[applicant.id]; return next })
    setSelected(null)
    await loadAll()
    setActiveTab('recent')
    setMovingToWaitlistId(null)
  }

  // Removes the volunteer from the active pipeline without touching their
  // account — they keep their profile/login, they're just not moving into
  // active service right now. Distinct from the pre-profile "Reject
  // Application" flow (openRejectModal/confirmReject), which sends a
  // rejection email and never created an account in the first place.
  async function rejectFromTraining(applicant) {
    setRejectingTrainingId(applicant.id)
    const { error } = await supabase.from('volunteer_applications')
      .update({ stage: 'completed', stage_updated_at: new Date().toISOString() })
      .eq('id', applicant.id)
    if (error) {
      msg(error.message, 'error')
      setRejectingTrainingId(null)
      return
    }
    await audit('rejected_from_training', 'volunteer', applicant.volunteer_id, applicant.full_name,
      'moved to Recently Added — account kept active')
    msg(`${applicant.full_name} moved to Recently Added`)

    setTrainingDrafts(prev => { const next = { ...prev }; delete next[applicant.id]; return next })
    setSelected(null)
    await loadAll()
    setActiveTab('recent')
    setRejectingTrainingId(null)
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

  async function uploadChecklistFiles(applicantId, item, filesArr) {
    if (!filesArr.length || !item.bucket || !item.urlKey) {
      throw new Error('Invalid file upload')
    }

    const zip = new JSZip()

    for (const file of filesArr) {
      zip.file(file.name, file)
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' })

    const path = `${applicantId}/${item.key}-${Date.now()}.zip`

    const { error } = await supabase.storage
        .from(item.bucket)
        .upload(path, zipBlob, {
          contentType: 'application/zip',
          upsert: true
        })

    if (error) throw error

    return path
  }

  async function handleFileUpload(applicantId, item, filesArr) {
    if (!filesArr.length || !item.bucket || !item.urlKey) return

    setUploadingKey(item.key)

    try {
      const path = await uploadChecklistFiles(
          applicantId,
          item,
          filesArr
      )

      const next = {
        ...checklist,
        [item.urlKey]: path
      }

      setChecklist(next)

      const { error: dbErr } = await supabase
          .from('onboarding_checklists')
          .upsert(
              {
                applicant_id: applicantId,
                ...next,
                updated_at: new Date().toISOString()
              },
              {
                onConflict: 'applicant_id'
              }
          )

      if (dbErr) {
        msg(dbErr.message, 'error')
      } else {
        msg(`${item.label} uploaded`)
      }

    } catch (e) {
      msg(e.message, 'error')
    } finally {
      setUploadingKey(null)
    }
  }

  // ─── Recently Added: per-item file upload ─────────────────────────────────

  async function handleRecentFileUpload(applicantId, item, filesArr) {
    if (!filesArr.length || !item.bucket || !item.urlKey) return

    const uploadKey = `${applicantId}-${item.key}`
    setRecentUploadingKey(uploadKey)

    try {
      const path = await uploadChecklistFiles(
          applicantId,
          item,
          filesArr
      )

      const existing =
          recentChecklist[applicantId] || { ...EMPTY_CHECKLIST }

      const next = {
        ...existing,
        [item.urlKey]: path,
        [item.key]: true,
      }

      setRecentChecklist(prev => ({
        ...prev,
        [applicantId]: next
      }))

      const { error: dbErr } = await supabase
          .from('onboarding_checklists')
          .upsert(
              {
                applicant_id: applicantId,
                ...next,
                updated_at: new Date().toISOString()
              },
              {
                onConflict: 'applicant_id'
              }
          )

      if (dbErr) {
        msg(dbErr.message, 'error')
      } else {
        msg(`${item.label} uploaded`)
      }

    } catch (e) {
      msg(e.message, 'error')
    } finally {
      setRecentUploadingKey(null)
    }
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
  // Downloads each file locally, then deletes it from Supabase Storage —
  // only for files that actually finished downloading, so a failed download
  // never causes data loss. DB references to deleted files are cleared too,
  // so nothing in the app points at a file that no longer exists.

  async function handleOffload(applicant) {
    setOffloadingId(applicant.id)
    try {
      const cl = recentChecklist[applicant.id] || {}
      const fileEntries = []

      if (applicant.resume_url) {
        const { data: rData, error: rErr } = await supabase.storage.from('resumes').createSignedUrl(applicant.resume_url, 300)
        if (!rErr && rData?.signedUrl) {
          const ext = applicant.resume_url.split('.').pop()
          fileEntries.push({ label: 'Resume', url: rData.signedUrl, filename: `resume.${ext}`, bucket: 'resumes', path: applicant.resume_url })
        } else if (rErr) {
          console.warn('Could not sign resume URL:', rErr.message)
        }
      }

      const unavailable = []
      for (const item of FILE_CHECKLIST_ITEMS) {
        const storagePath = cl[item.urlKey]
        if (!storagePath) continue
        const { data, error } = await supabase.storage.from(item.bucket).createSignedUrl(storagePath, 300)
        if (!error && data?.signedUrl) {
          fileEntries.push({ label: item.label, url: data.signedUrl, filename: `${item.key}.${storagePath.split('.').pop()}`, bucket: item.bucket, path: storagePath, urlKey: item.urlKey, itemKey: item.key })
        } else {
          unavailable.push(item.label)
          console.warn(`Could not sign URL for ${item.label} (bucket: ${item.bucket}):`, error?.message)
        }
      }
      if (unavailable.length > 0) {
        msg(`Skipped (couldn't access in Storage): ${unavailable.join(', ')} — check console`, 'error')
      }

      // Only files that are confirmed downloaded end up here — this is what
      // actually gets deleted from Supabase Storage afterward.
      const downloaded = []

      if (fileEntries.length === 0) {
        msg('No files to download — marking as offloaded', 'success')
      } else {

        if (JSZip) {
          const zip    = new JSZip()

          const folder = zip.folder(applicant.full_name.replace(/\s+/g, '_'))
          for (const entry of fileEntries) {
            try {
              const res = await fetch(entry.url)
              if (!res.ok) throw new Error(`HTTP ${res.status}`)
              folder.file(entry.filename, await res.blob())
              downloaded.push(entry)
            } catch (e) {
              console.warn(`Could not fetch ${entry.label}:`, e)
            }
          }
          if (downloaded.length > 0) {
            const zipBlob = await zip.generateAsync({ type: 'blob' })
            const link = document.createElement('a')
            link.href = URL.createObjectURL(zipBlob)
            link.download = `${applicant.full_name.replace(/\s+/g, '_')}_files.zip`
            link.click()
            URL.revokeObjectURL(link.href)
          }
        } else {
          // No JSZip available — fall back to individual downloads. We can't
          // verify these actually saved (browser download, not a fetch), so
          // we assume success, same as the app's prior behavior.
          for (const entry of fileEntries) {
            const link = document.createElement('a')
            link.href = entry.url; link.download = entry.filename; link.target = '_blank'
            document.body.appendChild(link); link.click(); document.body.removeChild(link)
            await new Promise(r => setTimeout(r, 400))
            downloaded.push(entry)
          }
        }
      }

      // Delete only the files that were actually downloaded, grouped by
      // bucket since storage.remove() takes a list of paths per bucket.
      const failedDeletes = []
      const byBucket = downloaded.reduce((acc, e) => {
        (acc[e.bucket] ||= []).push(e)
        return acc
      }, {})
      for (const [bucket, entries] of Object.entries(byBucket)) {
        const { error: delErr } = await supabase.storage.from(bucket).remove(entries.map(e => e.path))
        if (delErr) { failedDeletes.push(...entries.map(e => e.label)); console.warn(`Could not delete from ${bucket}:`, delErr) }
      }

      // Clear DB references to whatever was actually deleted, so nothing in
      // the app still points at a file that no longer exists in Storage.
      const successfullyDeleted = downloaded.filter(e => !failedDeletes.includes(e.label))
      const resumeDeleted = successfullyDeleted.some(e => e.bucket === 'resumes')
      const checklistClears = successfullyDeleted.filter(e => e.urlKey)

      if (resumeDeleted) {
        await supabase.from('volunteer_applications').update({ resume_url: null }).eq('id', applicant.id)
      }
      if (checklistClears.length > 0) {
        const clearPatch = {}
        for (const e of checklistClears) { clearPatch[e.urlKey] = null }
        await supabase.from('onboarding_checklists').update(clearPatch).eq('applicant_id', applicant.id)
      }

      await supabase.from('volunteer_applications')
        .update({ stage: 'offloaded', offloaded_at: new Date().toISOString() }).eq('id', applicant.id)

      if (failedDeletes.length > 0) {
        msg(`${applicant.full_name} offloaded, but ${failedDeletes.length} file(s) could not be removed from storage — check console`, 'error')
      } else {
        msg(`${applicant.full_name} offloaded — files downloaded and removed from Supabase`)
      }
      await audit('offloaded_volunteer', 'volunteer', applicant.id, applicant.full_name,
        `files downloaded, ${successfullyDeleted.length} removed from storage${failedDeletes.length ? `, ${failedDeletes.length} failed to delete` : ''}`)
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
    if (!onboardForm.default_role) { msg('Select a default position', 'error'); setOnboardStep(2); return }

    const _missingDocs = getMissingRequiredDocs()
    if (_missingDocs.length > 0) {
      msg(`Missing required docs: ${_missingDocs.join(', ')}`, 'error')
      setOnboardStep(3)
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

    // profiles has no dedicated columns for educational_background, the raw
    // `skills` text field, or reference contacts — fold them into
    // admin_notes so this info isn't silently dropped when the applicant
    // becomes a volunteer profile.
    const extraInfo = [
      selected.educational_background ? `Educational Background: ${selected.educational_background}` : null,
      selected.skills ? `Additional Skills: ${selected.skills}` : null,
      formatReference(selected.ref1_name, selected.ref1_contact) ? `Reference 1: ${formatReference(selected.ref1_name, selected.ref1_contact)}` : null,
      formatReference(selected.ref2_name, selected.ref2_contact) ? `Reference 2: ${formatReference(selected.ref2_name, selected.ref2_contact)}` : null,
    ].filter(Boolean).join('\n')

    const { error: profileErr } = await supabase.from('profiles').insert({
      id: uid, full_name: selected.full_name, email: selected.email,
      phone: selected.phone || null, role: 'volunteer', affiliation: affil || null,
      languages: joinWithOther(selected.languages_spoken, selected.languages_other) || selected.languages || null,
      default_role: affiliData.default_role || null,
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
      credentials: isProvider ? (affiliData.credentials || null) : (joinWithOther(selected.certifications, selected.certifications_other) || selected.credentials || null),
      license_exp: isProvider ? (affiliData.license_exp || null) : null,
      bls_exp:     isProvider ? (affiliData.bls_exp     || null) : null,
      dea_exp:     isProvider ? (affiliData.dea_exp     || null) : null,
      ftca_exp:    isProvider ? (affiliData.ftca_exp    || null) : null,
      tb_exp:      isProvider ? (affiliData.tb_exp      || null) : null,
      admin_notes: [notesDraft || selected.notes || null, extraInfo || null].filter(Boolean).join('\n\n') || null,
    })
    if (profileErr) { msg(profileErr.message, 'error'); setCreatingProfile(false); return }

    const { error: appErr } = await supabase.from('volunteer_applications')
      .update({ stage: 'training', volunteer_id: uid, stage_updated_at: new Date().toISOString() })
      .eq('id', selected.id)
    if (appErr) msg(`Profile created but application stage update failed: ${appErr.message}`, 'error')

    await audit('created_volunteer', 'volunteer', uid, selected.full_name, 'from pipeline → moved to training')
    if (!appErr) msg(`Profile created for ${selected.full_name} — moved to training`)
    if (onVolunteerCreated) onVolunteerCreated()

    setSelected(null)
    setOnboardStep(1)
    setOnboardForm(EMPTY_FORM)
    setChecklist(EMPTY_CHECKLIST)
    setApplicantPhotoUrl(null)
    setApplicantAvatarPath(null)
    setNotesDraft('')

    await loadAll()
    setActiveTab('recent')
    setCreatingProfile(false)
  }

  // ─── Select applicant ─────────────────────────────────────────────────────

  async function selectApplicant(a) {
    let applicant = a

    // re-fetch the applicant row if it's in the interview stage, to ensure interview_scheduled_at is up to date
    if (a.stage === 'interview') {
      const { data, error } = await supabase
        .from('volunteer_applications')
        .select('*')
        .eq('id', a.id)
        .single()

      if (error) {
        console.error('failed to refresh applicant on select:', error)
      } else if (data) {
        applicant = data
        setApplicants(prev => prev.map(app => app.id === data.id ? data : app))
      }
    }

    setSelected(applicant)
    setOnboardStep(1)
    setChecklist(EMPTY_CHECKLIST)
    setNotesDraft(a.notes || '')

    // Staff-entered values (affiliData) take priority if they've already
    // been filled in; otherwise fall back to what the applicant told us on
    // the application itself (School/Program), so nobody has to re-ask a
    // question already answered.
    const affiliData = applicant.onboard_affil_data || {}
    setOnboardForm({
      affiliation:   applicant.onboard_affiliation   || '',
      default_role:  applicant.onboard_default_role  || '',
      preferred_slots: applicant.onboard_preferred_slots || [],
      preferred_roles: applicant.onboard_preferred_roles || [],
      sma_name:          affiliData.sma_name          || '',
      sma_contact:       affiliData.sma_contact        || '',
      school:            affiliData.school             || applicant.school  || '',
      major:             affiliData.major              || applicant.program || '',
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

    if (applicant.stage === 'onboarding') loadChecklist(applicant.id)

    // Reset photo state — photo will appear only once uploaded this session
    setApplicantPhotoUrl(null)
    setApplicantAvatarPath(null)
  }

  // ─── Derived ──────────────────────────────────────────────────────────────

  const filteredApplicants = (() => {
    const base = applicants.filter(a => a.stage === stageFilter)
    if (stageFilter === 'interview') {
      // 1. Upcoming interviews first, soonest→latest (this afternoon, tomorrow, next week...).
      // 2. Past interviews next, most recent→oldest.
      // 3. Applicants with no interview date at the bottom, sorted by application date, newest first.
      const now = new Date()
      const withDate    = base.filter(a => a.interview_scheduled_at)
      const withoutDate = base.filter(a => !a.interview_scheduled_at)

      const upcoming = withDate
        .filter(a => new Date(a.interview_scheduled_at) >= now)
        .sort((a, b) => new Date(a.interview_scheduled_at) - new Date(b.interview_scheduled_at))
      const past = withDate
        .filter(a => new Date(a.interview_scheduled_at) < now)
        .sort((a, b) => new Date(b.interview_scheduled_at) - new Date(a.interview_scheduled_at))
      const noDate = [...withoutDate].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

      return [...upcoming, ...past, ...noDate]
    }
    if (stageFilter === 'onboarding') {
      // Sort by interview date descending; applicants without one go to the bottom.
      const withDate    = base.filter(a =>  a.interview_scheduled_at).sort((a, b) => new Date(b.interview_scheduled_at) - new Date(a.interview_scheduled_at))
      const withoutDate = base.filter(a => !a.interview_scheduled_at)
      return [...withDate, ...withoutDate]
    }
    if (stageFilter === 'rejected') {
      // Alphabetical by full name.
      return [...base].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
    }
    // Default (applied): preserve existing order (created_at desc from DB)
    return base
  })()
  const stageCounts        = STAGES.reduce((acc, s) => { acc[s] = applicants.filter(a => a.stage === s).length; return acc }, {})

  // ─── Non-missionary, Information Systems, and Communications document validation ────────────────────────────────────

  function getRequiredChecks() {
    return onboardForm.affiliation === 'missionary' && MISSIONARY_REQUIRED || NON_PATIENT_ROLES.includes(onboardForm.default_role) && NON_PATIENT_ROLES_REQUIRED || DEFAULT_REQUIRED
  }

  function getMissingRequiredDocs() {
    const requiredChecks = getRequiredChecks()
    return requiredChecks.filter(key => {
      if (!checklist[key]) return true
      const item = CHECKLIST_ITEMS.find(i => i.key === key)
      if (item?.urlKey && !checklist[item.urlKey]) return true
      return false
    }).map(key => CHECKLIST_ITEMS.find(i => i.key === key)?.label ?? key)
  }

  const requiredChecks         = getRequiredChecks()
  const missingRequiredDocs    = getMissingRequiredDocs()
  const completedRequiredCount = requiredChecks.length - missingRequiredDocs.length
  const docsComplete           = missingRequiredDocs.length === 0

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

  // Applied-stage-only badge: High / Moderate / Low Staffing Need, based on
  // whether the applicant's interested role(s) + shift(s) line up with an
  // open clinic slot, or a thin waitlist for that role. Renders nothing if
  // the applicant hasn't listed any of the six scored clinic roles.
  function StaffingNeedBadge({ applicant }) {
    const level = getStaffingNeedLevel(applicant, staffingOpenSlots, staffingWaitlistCounts)
    if (!level) return null
    const { label, color } = STAFFING_NEED_STYLE[level]
    return (
      <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.6rem', borderRadius: '100px', fontWeight: 600, background: color + '18', color, border: `1px solid ${color}44`, whiteSpace: 'nowrap' }}>
        {label}
      </span>
    )
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

  function FileRow({ item, applicantId }) {
    const ref = useRef(null)
    const has       = !!(checklist[item.urlKey])
    const uploading = uploadingKey === item.key
    if (!item.bucket || !item.urlKey) return null
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem' }}>
        <input ref={ref}
               type="file"
               multiple
               accept=".pdf,.jpg,.jpeg,.png,.webp,image/*"
               style={{ display: 'none' }}
               onChange={e => {
                 const files = Array.from(e.target.files || [])
                 if (files.length > 0) {
                   handleFileUpload(applicantId, item, files);
                 }
                 e.target.value = ''
               }

               }
        />
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
  const step2Valid    = !!onboardForm.default_role
  const allStepsValid = step1Valid() && step2Valid && docsComplete

  function profileSummary() {
    const base = [
      { label: 'Name',     value: selected?.full_name },
      { label: 'Email',    value: selected?.email },
      { label: 'Affil.',   value: onboardForm.affiliation },
      { label: 'Position', value: onboardForm.default_role },
    ]
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

  // ─── Affiliation pre-move modal ───────────────────────────────────────────

  function AffiliationModal() {
    if (!affiliationModal) return null
    const { applicant } = affiliationModal
    const canConfirm    = !!affiliationPick

    return (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(2,30,55,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
        onClick={e => { if (e.target === e.currentTarget && !movingStage) setAffiliationModal(null) }}
      >
        <div style={{ background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', boxShadow: '0 8px 48px rgba(2,65,107,0.22)', width: '100%', maxWidth: 420, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div>
              <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.25rem' }}>
                Move to Onboarding
              </p>
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                Select <strong>{applicant.full_name}</strong>'s affiliation before confirming. This determines which onboarding email they receive.
              </p>
            </div>
            {!movingStage && (
              <button
                onClick={() => setAffiliationModal(null)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '0.1rem 0.3rem', flexShrink: 0 }}
                title="Cancel"
              >×</button>
            )}
          </div>

          {/* Affiliation picker */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Applicant Affiliation <span style={{ color: C.danger }}>*</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem' }}>
              {AFFILIATION_OPTIONS.map(opt => {
                const active = affiliationPick === opt.value
                const isMissionary = opt.value === 'missionary'
                return (
                  <button
                    key={opt.value}
                    onClick={() => setAffiliationPick(opt.value)}
                    disabled={movingStage}
                    style={{
                      padding: '0.65rem 0.75rem',
                      borderRadius: '10px',
                      border: `1px solid ${active ? (isMissionary ? C.light : C.blue) : 'var(--border)'}`,
                      background: active ? (isMissionary ? C.light + '18' : C.blue + '18') : 'var(--bg)',
                      color: active ? (isMissionary ? C.light : C.blue) : 'var(--text)',
                      fontWeight: active ? 700 : 400,
                      cursor: movingStage ? 'not-allowed' : 'pointer',
                      fontFamily: 'DM Sans, sans-serif',
                      fontSize: '0.85rem',
                      transition: 'all 0.15s',
                      textAlign: 'center',
                    }}
                  >
                    {opt.label}
                    {isMissionary && (
                      <span style={{ display: 'block', fontSize: '0.65rem', color: active ? C.light : 'var(--muted)', fontWeight: 400, marginTop: '0.15rem' }}>
                        missionary email
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Email preview note */}
          {affiliationPick && (
            <div style={{ padding: '0.65rem 0.9rem', borderRadius: '8px', background: C.blue + '08', border: `1px solid ${C.blue}33`, fontSize: '0.8rem', color: C.blue, lineHeight: 1.5 }}>
              {affiliationPick === 'missionary'
                ? <>Will send the <strong>Onboarding — Missionary</strong> email template.</>
                : <>Will send the <strong>Onboarding Welcome</strong> email template.</>
              }
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            {!movingStage && (
              <button onClick={() => setAffiliationModal(null)} style={ghostBtn()}>
                Cancel
              </button>
            )}
            <button
              onClick={confirmMoveToOnboarding}
              disabled={!canConfirm || movingStage}
              style={solidBtn(C.blue, !canConfirm || movingStage)}
            >
              {movingStage ? 'Moving...' : 'Confirm & Send Email'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── NEW: lets the admin choose between a normal rejection (sends the
  // Rejection Notice email) and a silent rejection (no email at all — for
  // accidental applications, requests to be withdrawn, wrong-system submissions, etc.) ──
  function RejectModal() {
    if (!rejectModal) return null
    const { applicant } = rejectModal

    return (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(2,30,55,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
        onClick={e => { if (e.target === e.currentTarget && !movingStage) setRejectModal(null) }}
      >
        <div style={{ background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', boxShadow: '0 8px 48px rgba(2,65,107,0.22)', width: '100%', maxWidth: 440, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div>
              <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.25rem' }}>
                Reject Application
              </p>
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                Choose how to reject <strong>{applicant.full_name}</strong>. This determines whether they receive a rejection email.
              </p>
            </div>
            {!movingStage && (
              <button
                onClick={() => setRejectModal(null)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '0.1rem 0.3rem', flexShrink: 0 }}
                title="Cancel"
              >×</button>
            )}
          </div>

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <button
              onClick={() => confirmReject(false)}
              disabled={movingStage}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.2rem',
                padding: '0.75rem 0.9rem', borderRadius: '10px', textAlign: 'left',
                border: `1px solid ${C.danger}55`, background: C.danger + '0a',
                cursor: movingStage ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: C.danger }}>Notify &amp; Email</span>
              <span style={{ fontSize: '0.76rem', color: 'var(--muted)', lineHeight: 1.4 }}>
                Sends the <strong>Rejection Notice</strong> template to {applicant.email}.
              </span>
            </button>

            <button
              onClick={() => confirmReject(true)}
              disabled={movingStage}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.2rem',
                padding: '0.75rem 0.9rem', borderRadius: '10px', textAlign: 'left',
                border: '1px solid var(--border)', background: 'var(--bg)',
                cursor: movingStage ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>Silent Reject</span>
              <span style={{ fontSize: '0.76rem', color: 'var(--muted)', lineHeight: 1.4 }}>
                No email is sent. Use for accidental, duplicate, or out-of-system applications (e.g. they emailed asking to be withdrawn).
              </span>
            </button>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            {!movingStage && (
              <button onClick={() => setRejectModal(null)} style={ghostBtn()}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    )
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

  // Applied-stage-only: a plain black-and-white comparison table so several
  // applicants can be scanned side by side — staffing need, a score for
  // each of the six core clinical roles, and service-missionary status, all
  // aligned into the same columns. No color coding is used, only bold vs.
  // regular weight, so it stays scannable at a glance.
  function CompareApplicantsOverlay() {
    if (!compareOpen) return null

    const rows = applicants
      .filter(a => a.stage === 'applied')
      .map(a => ({
        id: a.id,
        name: a.full_name || 'Unnamed',
        level: getStaffingNeedLevel(a, staffingOpenSlots, staffingWaitlistCounts),
        scores: getAllRoleScores(a),
        missionary: !!a.is_service_missionary,
      }))
      .sort((x, y) => x.name.localeCompare(y.name))

    const roleShorts  = PREP_ROLES.map(r => r.short)
    const levelLabel  = { high: 'High', moderate: 'Moderate', low: 'Low' }

    const thStyle = { textAlign: 'left', padding: '0.5rem 0.6rem', borderBottom: '2px solid #000', fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: '#fff' }
    const tdStyle = { padding: '0.5rem 0.6rem', borderBottom: '1px solid #ddd', whiteSpace: 'nowrap' }

    return (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 220, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
        onClick={e => { if (e.target === e.currentTarget) setCompareOpen(false) }}
      >
        <div style={{ background: '#fff', color: '#000', borderRadius: '10px', border: '1px solid #000', width: '100%', maxWidth: 1040, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'DM Sans, sans-serif' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.9rem 1.25rem', borderBottom: '2px solid #000' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Compare Applicants — Applied ({rows.length})</span>
            <button onClick={() => setCompareOpen(false)} style={{ background: 'none', border: 'none', color: '#000', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1, padding: '0.1rem 0.3rem' }} title="Close">×</button>
          </div>
          <div style={{ overflow: 'auto', padding: '0 1.25rem' }}>
            {rows.length === 0 ? (
              <p style={{ padding: '1.5rem 0', fontStyle: 'italic', color: '#555' }}>No applicants in the Applied stage.</p>
            ) : (
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Staffing Need</th>
                    {roleShorts.map(s => <th key={s} style={thStyle}>{s}</th>)}
                    <th style={thStyle}>Service Missionary</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{r.name}</td>
                      <td style={{ ...tdStyle, fontWeight: r.level === 'high' ? 700 : 400, color: r.level ? '#000' : '#999' }}>
                        {r.level ? levelLabel[r.level] : '—'}
                      </td>
                      {r.scores.map(s => (
                        <td key={s.key} style={{ ...tdStyle, fontFamily: 'DM Mono, monospace', fontWeight: s.interested ? 700 : 400, color: s.interested ? '#000' : '#999' }}>
                          {s.total}
                        </td>
                      ))}
                      <td style={{ ...tdStyle, fontWeight: r.missionary ? 700 : 400 }}>{r.missionary ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ padding: '0.7rem 1.25rem', borderTop: '1px solid #ccc' }}>
            <span style={{ fontSize: '0.68rem', color: '#555' }}>Bold role scores are roles the applicant listed interest in; gray scores are shown for comparison only. Staffing Need reflects current clinic openings and waitlist depth.</span>
          </div>
        </div>
      </div>
    )
  }

  async function saveTemplate(stage) {
    const draft = templateDrafts[stage]
    if (!draft?.subject || !draft?.body) {
      msg('Subject and body are required', 'error')
      return
    }
    setSavingTemplate(true)
    const { error } = await supabase
      .from('email_templates')
      .upsert({ stage, subject: draft.subject, body: draft.body, updated_at: new Date().toISOString() }, { onConflict: 'stage' })
    if (error) {
      msg(`Save failed: ${error.message}`, 'error')
    } else {
      setTemplates(prev => ({ ...prev, [stage]: { subject: draft.subject, body: draft.body } }))
      msg(`${TEMPLATE_LABELS[stage]} template saved`)
    }
    setSavingTemplate(false)
  }

  function updateDraft(stage, field, value) {
    setTemplateDrafts(prev => ({
      ...prev,
      [stage]: { ...(prev[stage] || {}), [field]: value },
    }))
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

                    {/* Resume */}
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

                      if (item.key === 'confidentiality_agreement') {
                        const hasPdf = !!(cl[item.urlKey])
                        return (
                          <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.9rem', borderRadius: '8px', background: hasPdf ? C.blue + '0a' : 'var(--bg)', border: `1px solid ${hasPdf ? C.blue + '44' : 'var(--border)'}`, gap: '0.75rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                              <div style={{ width: 18, height: 18, borderRadius: '4px', flexShrink: 0, background: hasPdf ? C.blue : 'transparent', border: `2px solid ${hasPdf ? C.blue : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {hasPdf && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                              </div>
                              <span style={{ fontSize: '0.85rem', fontWeight: hasPdf ? 600 : 400, color: hasPdf ? 'var(--text)' : 'var(--muted)' }}>Confidentiality Agreement</span>
                              {hasPdf && <span style={{ fontSize: '0.7rem', color: C.light, fontWeight: 600, flexShrink: 0 }}>PDF saved</span>}
                            </div>
                            <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                              {hasPdf && <button onClick={() => openFile('onboarding-confidentiality', cl[item.urlKey])} style={{ padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: C.blue + '14', color: C.blue, border: `1px solid ${C.blue}44` }}>View ↗</button>}
                              <button onClick={() => openConfidentialityModal(a.id, a.full_name, true)} style={{ padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>{hasPdf ? 'Re-sign' : '+ Fill Out Agreement'}</button>
                            </div>
                          </div>
                        )
                      }

                      if (item.key === 'parking_pass') {
                        const hasPdf = !!(cl[item.urlKey])
                        return (
                          <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.9rem', borderRadius: '8px', background: hasPdf ? C.blue + '0a' : 'var(--bg)', border: `1px solid ${hasPdf ? C.blue + '44' : 'var(--border)'}`, gap: '0.75rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                              <div style={{ width: 18, height: 18, borderRadius: '4px', flexShrink: 0, background: hasPdf ? C.blue : 'transparent', border: `2px solid ${hasPdf ? C.blue : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {hasPdf && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                              </div>
                              <span style={{ fontSize: '0.85rem', fontWeight: hasPdf ? 600 : 400, color: hasPdf ? 'var(--text)' : 'var(--muted)' }}>Parking Pass</span>
                              {hasPdf && <span style={{ fontSize: '0.7rem', color: C.light, fontWeight: 600, flexShrink: 0 }}>PDF saved</span>}
                            </div>
                            <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                              {hasPdf && <button onClick={() => openFile('onboarding-parking-passes', cl[item.urlKey])} style={{ padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: C.blue + '14', color: C.blue, border: `1px solid ${C.blue}44` }}>View ↗</button>}
                              <button onClick={() => openParkingPassModal(a.id, a.full_name, true)} style={{ padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>{hasPdf ? 'Re-issue' : '+ Fill Out Pass'}</button>
                            </div>
                          </div>
                        )
                      }

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
                            </span>
                            {hasFile && <span style={{ fontSize: '0.7rem', color: C.light, fontWeight: 600, flexShrink: 0 }}>Uploaded</span>}
                          </div>
                          <input ref={ref}
                                 type="file"
                                 multiple
                                 accept=".pdf,.jpg,.jpeg,.png,.webp,image/*"
                                 style={{ display: 'none' }}
                                 onChange={e => {
                                   const files = Array.from(e.target.files || []);

                                   if (files.length > 0)
                                     handleRecentFileUpload(a.id, item, files);
                                   e.target.value = ''
                                 }
                                }
                          />
                          <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                            {hasFile && <button onClick={() => openFile(item.bucket, cl[item.urlKey])} style={{ padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: C.blue + '14', color: C.blue, border: `1px solid ${C.blue}44` }}>View ↗</button>}
                            <button onClick={() => ref.current?.click()} disabled={isUploading} style={{ padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: isUploading ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', opacity: isUploading ? 0.5 : 1 }}>
                              {isUploading ? 'Uploading...' : hasFile ? 'Replace' : '+ Upload'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
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
    const isTraining   = applicant.stage === 'training'
    const isRejected   = applicant.stage === 'rejected'
    const trainingDraft = isTraining ? getTrainingDraft(applicant) : null

    const schoolProgram = [applicant.school, applicant.program].filter(Boolean).join(' — ')
    const languagesStr  = joinWithOther(applicant.languages_spoken, applicant.languages_other)
    const certsStr      = joinWithOther(applicant.certifications, applicant.certifications_other)
    const skillsStr     = joinWithOther(applicant.skills_selected, applicant.skills_other)
    const rolesStr      = applicant.roles_interested?.length ? applicant.roles_interested.join(', ') : null
    const availabilityStr = formatStatedAvailability(applicant)
    const ref1Str       = formatReference(applicant.ref1_name, applicant.ref1_contact)
    const ref2Str       = formatReference(applicant.ref2_name, applicant.ref2_contact)

    const fields = [
      { label: 'Email',                value: applicant.email },
      { label: 'Phone',                value: applicant.phone },
      { label: 'School / Program',     value: schoolProgram || null },
      { label: 'Educational Background', value: applicant.educational_background },
      { label: 'Languages',            value: languagesStr },
      { label: 'Additional Languages', value: applicant.languages },
      { label: 'Language Proficiency', value: applicant.language_proficiency },
      { label: 'Service Missionary',   value: applicant.is_service_missionary ? 'Yes' : 'No' },
      { label: 'Role Interest',        value: rolesStr },
      { label: 'Certifications',       value: certsStr },
      { label: 'Credentials',          value: applicant.credentials },
      { label: 'Skills',               value: skillsStr },
      { label: 'Additional Skills',    value: applicant.skills },
      { label: 'Shift Availability',   value: availabilityStr },
      { label: 'Expected Duration',    value: applicant.expected_duration },
      { label: 'Patient Care Hours',   value: applicant.patient_care_hours != null ? String(applicant.patient_care_hours) : null },
      { label: 'Referral Source',      value: applicant.referral_source },
      { label: 'Experience Notes',     value: applicant.experience_notes },
      { label: 'Reference 1',          value: ref1Str },
      { label: 'Reference 2',          value: ref2Str },
    ].filter(f => f.value)

    const checklistCount    = CHECKLIST_ITEMS.filter(i => checklist[i.key]).length
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

        {/* Preparedness — Applied stage; breakdown opens on click */}
        {isApplied && <PreparednessPanel key={applicant.id} applicant={applicant} card={card} secLabel={secLabel} />}

        {/* Applied */}
        {isApplied && (
          <div style={{ ...card, padding: '1rem 1.25rem', borderColor: C.warn + '55', background: C.warn + '06' }}>
            <p style={{ ...secLabel, color: C.warn }}>Review</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1rem', lineHeight: 1.5 }}>Review this application and decide whether to schedule an interview or reject it.</p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button onClick={() => moveToStage(applicant, 'interview')} disabled={movingStage} style={outlineBtn(C.warn)}>Move to Interview</button>
              <button onClick={() => openRejectModal(applicant)} disabled={movingStage} style={outlineBtn(C.danger)}>Reject Application</button>
            </div>
          </div>
        )}

        {/* Interview */}
        {isInterview && (
          <div style={{ ...card, padding: '1rem 1.25rem', borderColor: C.warn + '55', background: C.warn + '06' }}>
            <p style={{ ...secLabel, color: C.warn }}>Interview</p>
            <div style={{ padding: '1rem', background: 'var(--bg)', borderRadius: '10px', border: '1px solid var(--border)', marginBottom: '1.25rem' }}>
              <p style={{ ...secLabel, marginBottom: '0.5rem' }}>Schedule</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                {applicant.interview_scheduled_at
                  ? 'This applicant has an interview scheduled.'
                  : 'No interview scheduled yet.'} Manage interview times from the <strong>Calendar</strong> tab.
              </p>
            </div>
            <p style={{ ...secLabel, marginBottom: '0.65rem' }}>Decision</p>

            {!applicant.interview_scheduled_at && (
              <div style={{ marginBottom: '0.85rem', padding: '0.65rem 0.9rem', borderRadius: '8px', background: C.danger + '08', border: `1px solid ${C.danger}44`, fontSize: '0.82rem', color: C.danger, fontWeight: 500, lineHeight: 1.5 }}>
                An interview must be scheduled and saved before this applicant can be moved to onboarding.
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button onClick={() => openAffiliationModal(applicant)} disabled={movingStage || !applicant.interview_scheduled_at} style={outlineBtn(applicant.interview_scheduled_at ? C.blue : C.muted)}>
                Accept — Move to Onboarding
              </button>
              <button onClick={() => openRejectModal(applicant)} disabled={movingStage} style={outlineBtn(C.danger)}>Reject Application</button>
            </div>
          </div>
        )}

        {/* Onboarding — 3 steps */}
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
                { n: 2, label: 'Position',     valid: step2Valid },
                { n: 3, label: 'Checklist',    valid: checklistCount > 0 },
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
                  {AFFILIATION_OPTIONS.map(opt => { const active = onboardForm.affiliation === opt.value; return <button key={opt.value} onClick={() => setOnboardForm(f => ({ ...EMPTY_FORM, affiliation: opt.value, default_role: f.default_role }))} style={{ padding: '0.75rem 1rem', borderRadius: '10px', border: `1px solid ${active ? C.blue : 'var(--border)'}`, background: active ? C.blue + '18' : 'var(--bg)', color: active ? C.blue : 'var(--text)', fontWeight: active ? 700 : 400, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.88rem', transition: 'all 0.15s' }}>{opt.label}</button> })}
                </div>
                {onboardForm.affiliation && <AffiliationExtras onboardForm={onboardForm} setOnboardForm={setOnboardForm} labelStyle={labelStyle} inputStyle={inputStyle} secLabel={secLabel} />}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={async () => { await saveOnboardProgress(applicant.id, { onboard_affiliation: onboardForm.affiliation, onboard_affil_data: buildAffilData() }); setOnboardStep(2) }} disabled={!s1} style={solidBtn(C.blue, !s1)}>Save &amp; Next</button>
                </div>
              </div>
            )}

            {/* Step 2 */}
            {onboardStep === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>Default Position</p>
                {applicant.roles_interested?.length > 0 && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '-0.5rem' }}>
                    {applicant.full_name} expressed interest in: {applicant.roles_interested.join(', ')}
                  </p>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.6rem' }}>
                  {ROLES.map(role => {
                    const active    = onboardForm.default_role === role
                    return (
                      <button key={role} onClick={() => setOnboardForm(f => ({ ...f, default_role: role }))} style={{ position: 'relative', padding: '0.65rem 0.9rem', borderRadius: '10px', textAlign: 'left', border: `1px solid ${active ? C.blue : 'var(--border)'}`, background: active ? C.blue + '18' : 'var(--bg)', color: active ? C.blue : 'var(--text)', fontWeight: active ? 700 : 400, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.82rem', transition: 'all 0.15s' }}>
                        {role}
                      </button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => setOnboardStep(1)} style={ghostBtn()}>Back</button>
                  <button onClick={async () => { await saveOnboardProgress(applicant.id, { onboard_default_role: onboardForm.default_role || null }); setOnboardStep(3) }} disabled={!step2Valid} style={solidBtn(C.blue, !step2Valid)}>Save &amp; Next</button>
                </div>
              </div>
            )}

            {/* Step 3 */}
            {onboardStep === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>Onboarding Checklist</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>{completedRequiredCount} / {requiredChecks.length} Required Complete</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {CHECKLIST_ITEMS
                    .filter(item => item.key !== 'parking_pass' && item.key !== 'confidentiality_agreement')
                    .map(item => {
                      const checked = checklist[item.key]
                      return (
                        <div key={item.key} style={{ padding: '0.85rem 1rem', borderRadius: '10px', border: `1px solid ${checked ? C.blue + '55' : 'var(--border)'}`, background: checked ? C.blue + '08' : 'var(--bg)', transition: 'all 0.15s' }}>
                          <div onClick={() => !savingChecklist && toggleChecklistItem(applicant.id, item.key, !checked)} style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', cursor: 'pointer' }}>
                            <div style={{ width: 20, height: 20, borderRadius: '5px', flexShrink: 0, border: `2px solid ${checked ? C.blue : 'var(--border)'}`, background: checked ? C.blue : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                              {checked && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4L4 7L10 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                            </div>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ fontSize: '0.9rem', fontWeight: checked ? 600 : 400, color: checked ? 'var(--text)' : 'var(--muted)', transition: 'color 0.15s' }}>{item.label}</span>
                            </div>
                            {checked && <span style={{ fontSize: '0.72rem', color: C.blue, fontWeight: 600, flexShrink: 0 }}>Complete</span>}
                          </div>
                          {item.bucket && <FileRow item={item} applicantId={applicant.id} />}
                        </div>
                      )
                    })
                  }
                </div>

                {onboardForm.affiliation && missingRequiredDocs.length > 0 && (
                  <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: C.danger + '08', border: `1px solid ${C.danger}44`, fontSize: '0.83rem', color: C.danger, fontWeight: 500, lineHeight: 1.6 }}>
                    <span style={{ fontWeight: 700 }}>Cannot create profile yet.</span>{' '}
                    Missing: <span style={{ fontWeight: 700 }}>{missingRequiredDocs.join(', ')}</span>.
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button onClick={() => setOnboardStep(2)} style={ghostBtn()}>Back</button>
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
                    <p style={{ fontSize: '0.8rem', color: C.light, fontWeight: 500, marginTop: '0.6rem' }}>✓ Will be moved to Training on creation, where availability and trained roles are set before joining the waitlist.</p>
                  </div>
                )}

                {!allStepsValid && (
                  <p style={{ fontSize: '0.82rem', color: C.warn, fontWeight: 500 }}>
                    {!step1Valid() && 'Affiliation details required. '}
                    {!step2Valid && 'Default position required. '}
                  </p>
                )}
              </div>
            )}

            {/* Reject — always visible in onboarding, separated from step content */}
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: `1px solid ${C.danger}22`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.78rem', color: 'var(--muted)', fontStyle: 'italic' }}>Need to remove this applicant from onboarding?</p>
              <button onClick={() => openRejectModal(applicant)} disabled={movingStage} style={outlineBtn(C.danger)}>
                Reject Application
              </button>
            </div>
          </div>
        )}

        {/* Training — availability & trained roles are set here, post-onboarding */}
        {isTraining && (
          <div style={{ ...card, padding: '1rem 1.25rem', borderColor: C.training + '55', background: C.training + '08' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <p style={{ ...secLabel, color: C.training, marginBottom: 0 }}>Training</p>
              <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontStyle: trainingSaving[applicant.id] ? 'italic' : 'normal' }}>
                {trainingSaving[applicant.id] ? 'saving…' : '✓ saved'}
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Set <strong>{applicant.full_name}</strong>'s availability and the roles they've been trained in, then move them to the waitlist.
            </p>

            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ ...secLabel, marginBottom: '0.65rem' }}>Availability</p>
              <SlotPicker
                selected={trainingDraft.preferred_slots}
                onChange={slots => updateTrainingField(applicant.id, 'preferred_slots', slots)}
              />
            </div>

            <div style={{ marginBottom: '0.5rem' }}>
              <p style={{ ...secLabel, marginBottom: '0.65rem' }}>Trained Roles</p>
              <RolePicker
                selected={trainingDraft.preferred_roles}
                onChange={roles => updateTrainingField(applicant.id, 'preferred_roles', roles)}
              />
            </div>

            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: `1px solid ${C.training}22`, display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                onClick={() => rejectFromTraining(applicant)}
                disabled={movingToWaitlistId === applicant.id || rejectingTrainingId === applicant.id}
                style={outlineBtn(C.danger)}
              >
                {rejectingTrainingId === applicant.id ? 'Rejecting…' : 'Reject'}
              </button>
              <button
                onClick={() => moveToWaitlist(applicant)}
                disabled={movingToWaitlistId === applicant.id || rejectingTrainingId === applicant.id || trainingDraft.preferred_roles.length === 0}
                style={solidBtn(C.training, movingToWaitlistId === applicant.id || rejectingTrainingId === applicant.id || trainingDraft.preferred_roles.length === 0)}
              >
                {movingToWaitlistId === applicant.id ? 'Moving…' : 'Move to Waitlist'}
              </button>
            </div>
            {trainingDraft.preferred_roles.length === 0 && (
              <p style={{ fontSize: '0.78rem', color: C.warn, fontWeight: 500, textAlign: 'right', marginTop: '0.5rem' }}>
                Select at least one trained role before moving to the waitlist.
              </p>
            )}
          </div>
        )}
        {(isOnboarding || isTraining) && (
          <div style={{ ...card, padding: '1rem 1.25rem', background: 'var(--bg)', border: `1px solid ${C.blue}2a` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
              <p style={{ ...secLabel, color: C.blue, marginBottom: 0 }}>Admin Notes</p>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{savingNotes ? 'Saving…' : 'Saved to applicant & carried to profile'}</span>
            </div>
            <textarea
              value={notesDraft}
              onChange={e => setNotesDraft(e.target.value)}
              onBlur={() => saveApplicantNotes(applicant.id, notesDraft)}
              placeholder="Notes on this person's application, needs, or wants…"
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.5 }}
            />
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
        {ApplicantDetail({ applicant: selected })}
        {toast && <Toast toast={toast} />}
        <AffiliationModal />
        <RejectModal />
        <ParkingPassModal />
        <ConfidentialityModal />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* ── Tab switcher — now includes Email Templates ── */}
      <div style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
        {[
          { id: 'pipeline',  label: 'Pipeline' },
          { id: 'calendar',  label: 'Calendar' },
          { id: 'recent',    label: `Recently Added${completed.length > 0 ? ` (${completed.length})` : ''}` },
          { id: 'templates', label: 'Email Templates' },  
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
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
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
            {stageFilter === 'applied' && (
              <button onClick={() => setCompareOpen(true)} style={{ padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: '#000', color: '#fff', border: '1px solid #000' }}>
                Compare Applicants
              </button>
            )}
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
                  return (
                    <div key={a.id} onClick={() => selectApplicant(a)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', transition: 'border-color 0.15s' }} onMouseEnter={e => e.currentTarget.style.borderColor = C.blue} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.primary + '14', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: C.blue, fontSize: '0.95rem', flexShrink: 0 }}>{a.full_name?.charAt(0)}</div>
                        <div>
                          <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>{a.full_name}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{a.email}</p>
                            {a.resume_url && <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: C.blue + '14', color: C.blue, border: `1px solid ${C.blue}33`, fontWeight: 600 }}>resume</span>}
                            {a.is_service_missionary && <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: C.light + '14', color: C.light, border: `1px solid ${C.light}33`, fontWeight: 600 }}>service missionary</span>}
                            {a.stage === 'onboarding' && (
                              <span style={{ display: 'flex', gap: '0.2rem' }}>
                                {[a.onboard_affiliation, a.onboard_default_role].map((v, i) => (
                                  <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: v ? C.light : 'var(--border)' }} />
                                ))}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {a.stage === 'applied' && <StaffingNeedBadge applicant={a} />}
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

      {/* Calendar tab */}
      {activeTab === 'calendar' && (
        <CalendarTab
          supabase={supabase}
          profile={profile}
          applicants={applicants}
          card={card}
          inputStyle={inputStyle}
          labelStyle={labelStyle}
          secLabel={secLabel}
          solidBtn={solidBtn}
          ghostBtn={ghostBtn}
          outlineBtn={outlineBtn}
          msg={msg}
          audit={audit}
        />
      )}

      {/* Recently Added tab */}
      {activeTab === 'recent' && <RecentlyAdded />}

      {activeTab === 'templates' && (
        <EmailTemplatesTab
          supabase={supabase}
          profile={profile}
          templatesLoading={templatesLoading}
          templates={templates}
          setTemplates={setTemplates}
          templateDrafts={templateDrafts}
          setTemplateDrafts={setTemplateDrafts}
          activeTemplate={activeTemplate}
          setActiveTemplate={setActiveTemplate}
          savingTemplate={savingTemplate}
          saveTemplate={saveTemplate}
          updateDraft={updateDraft}
          card={card}
          inputStyle={inputStyle}
          labelStyle={labelStyle}
          secLabel={secLabel}
          solidBtn={solidBtn}
          ghostBtn={ghostBtn}
          outlineBtn={outlineBtn}
          msg={msg}
        />
      )}

      {toast && <Toast toast={toast} />}

      <AffiliationModal />
      <RejectModal />
      <ParkingPassModal />
      <ConfidentialityModal />
      <CompareApplicantsOverlay />

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