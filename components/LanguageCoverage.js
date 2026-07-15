'use client'

import { useMemo, useState } from 'react'


const LANGUAGE_ALIASES = {
  spanish: 'Spanish', espanol: 'Spanish', 'español': 'Spanish',
  french: 'French', francais: 'French', 'français': 'French',
  german: 'German', deutsch: 'German',
  italian: 'Italian',
  portuguese: 'Portuguese', 'português': 'Portuguese', portugues: 'Portuguese',
  mandarin: 'Mandarin', cantonese: 'Cantonese', chinese: 'Chinese',
  vietnamese: 'Vietnamese',
  arabic: 'Arabic',
  russian: 'Russian',
  ukrainian: 'Ukrainian',
  korean: 'Korean',
  japanese: 'Japanese',
  hindi: 'Hindi',
  urdu: 'Urdu',
  punjabi: 'Punjabi',
  bengali: 'Bengali', bangla: 'Bengali',
  farsi: 'Farsi/Persian', persian: 'Farsi/Persian',
  dari: 'Dari',
  pashto: 'Pashto',
  somali: 'Somali',
  swahili: 'Swahili',
  amharic: 'Amharic',
  tigrinya: 'Tigrinya',
  nepali: 'Nepali',
  burmese: 'Burmese',
  karen: 'Karen',
  thai: 'Thai',
  tagalog: 'Tagalog', filipino: 'Tagalog',
  polish: 'Polish',
  romanian: 'Romanian',
  turkish: 'Turkish',
  greek: 'Greek',
  hebrew: 'Hebrew',
  asl: 'American Sign Language (ASL)', 'american sign language': 'American Sign Language (ASL)',
  'sign language': 'American Sign Language (ASL)',
  'haitian creole': 'Haitian Creole', creole: 'Haitian Creole', haitian: 'Haitian Creole',
  hmong: 'Hmong',
  lao: 'Lao', laotian: 'Lao',
  khmer: 'Khmer', cambodian: 'Khmer',
  indonesian: 'Indonesian',
  malay: 'Malay',
  dutch: 'Dutch',
  swedish: 'Swedish',
  norwegian: 'Norwegian',
  danish: 'Danish',
  finnish: 'Finnish',
  mongolian: 'Mongolian',
  armenian: 'Armenian',
  serbian: 'Serbian', croatian: 'Croatian', bosnian: 'Bosnian',
  albanian: 'Albanian',
  hungarian: 'Hungarian',
  czech: 'Czech', slovak: 'Slovak',
}

// Words/phrases that mean "this is English" — stripped out entirely, never
// turned into a tag.
const ENGLISH_WORDS = new Set(['english', 'eng'])

const PROFICIENCY_ALIASES = [
  ['native', 'Native'],
  ['fluent', 'Fluent'],
  ['proficient', 'Fluent'],
  ['advanced', 'Fluent'],
  ['conversational', 'Conversational'],
  ['intermediate', 'Conversational'],
  ['working knowledge', 'Conversational'],
  ['working', 'Conversational'],
  ['beginner', 'Beginner'],
  ['begineer', 'Beginner'], // common typo, kept intentionally
  ['beginer', 'Beginner'],  // common typo, kept intentionally
  ['basic', 'Beginner'],
  ['elementary', 'Beginner'],
  ['limited', 'Beginner'],
  ['a little', 'Beginner'],
  ['some', 'Beginner'],
]

function toTitleCase(s) {
  return s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

function parseLanguageField(raw) {
  const entries = []

  if (raw && raw.trim()) {
    const parts = raw.split(/[,;/&+]| and /i).map(s => s.trim()).filter(Boolean)
    for (const part of parts) {
      let workingLower = part.toLowerCase()
      let display = part
      let proficiency = null

      for (const [word, label] of PROFICIENCY_ALIASES) {
        const re = new RegExp(word, 'i')
        if (re.test(workingLower)) {
          proficiency = label
          workingLower = workingLower.replace(re, '').trim()
          display = display.replace(re, '').trim()
        }
      }

      workingLower = workingLower.replace(/\bspeaker\b|\bspeaking\b|\blanguage\b/gi, '').replace(/\s+/g, ' ').trim()
      display = display.replace(/\bspeaker\b|\bspeaking\b|\blanguage\b/gi, '').replace(/\s+/g, ' ').trim()
      if (!workingLower) continue

      // Drop English entirely — it's assumed for everyone and never shown.
      if (ENGLISH_WORDS.has(workingLower)) continue

      let canonical = LANGUAGE_ALIASES[workingLower]
      if (!canonical) {
        const key = Object.keys(LANGUAGE_ALIASES).find(k => workingLower.includes(k) || k.includes(workingLower))
        if (key) canonical = LANGUAGE_ALIASES[key]
      }
      // No match? Accept the cleaned text as its own unique language tag
      // rather than flagging it — nothing gets lost.
      if (!canonical) canonical = toTitleCase(display)

      entries.push({ language: canonical, proficiency, raw: part.trim() })
    }
  }

  // De-dupe by language, preferring whichever mention carries proficiency info
  const byLang = new Map()
  for (const e of entries) {
    const existing = byLang.get(e.language)
    if (!existing || (!existing.proficiency && e.proficiency)) byLang.set(e.language, e)
  }
  return { entries: [...byLang.values()] }
}

// ── Small display helpers ────────────────────────────────────────────────────
function LangChip({ entry }) {
  const color = 'var(--accent)'
  return (
    <span
      title={entry.raw ? `From profile: "${entry.raw}"` : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
        padding: '0.2rem 0.6rem', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 500,
        background: 'rgba(2,65,107,0.15)', color, border: '1px solid rgba(2,65,107,0.4)', whiteSpace: 'nowrap',
      }}
    >
      {entry.language}{entry.proficiency ? ` · ${entry.proficiency}` : ''}
    </span>
  )
}

const DAY_ORDER = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 }

// ── Main component ───────────────────────────────────────────────────────────
// Props:
//   volunteers — profile rows (expects at least id, full_name, languages, status, default_role)
//   schedule   — schedule rows (expects volunteer_id, day_of_week, shift_time)
export default function LanguageCoverage({ volunteers = [], schedule = [] }) {
  const [search, setSearch] = useState('')
  const [langFilter, setLangFilter] = useState('all')
  const [expandedCell, setExpandedCell] = useState(null)

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
  const labelStyle = { display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const inputStyle = { width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', fontFamily: 'DM Sans, sans-serif' }

  // Parse every active volunteer's language field once
  const parsed = useMemo(() => {
    const active = volunteers.filter(v => v.status === 'active')
    const map = new Map()
    for (const v of active) {
      const { entries } = parseLanguageField(v.languages)
      map.set(v.id, { volunteer: v, entries })
    }
    return map
  }, [volunteers])

  const activeCount = parsed.size

  // Clinic-wide tally
  const clinicTally = useMemo(() => {
    const tally = new Map() // language -> { count, people: [...] }
    for (const { volunteer, entries } of parsed.values()) {
      for (const e of entries) {
        if (!tally.has(e.language)) tally.set(e.language, { count: 0, people: [] })
        const bucket = tally.get(e.language)
        bucket.count += 1
        bucket.people.push({ name: volunteer.full_name, proficiency: e.proficiency })
      }
    }
    return [...tally.entries()].sort((a, b) => b[1].count - a[1].count)
  }, [parsed])

  // Filtered directory — only volunteers who actually have a language on file
  const directory = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...parsed.values()]
      .filter(({ entries }) => entries.length > 0)
      .filter(({ volunteer, entries }) => {
        if (langFilter !== 'all' && !entries.some(e => e.language === langFilter)) return false
        if (!q) return true
        if (volunteer.full_name?.toLowerCase().includes(q)) return true
        return entries.some(e => e.language.toLowerCase().includes(q))
      })
      .sort((a, b) => (a.volunteer.full_name || '').localeCompare(b.volunteer.full_name || ''))
  }, [parsed, search, langFilter])

  // Shift coverage grid — built from whatever days/shift times actually
  // appear in the schedule, so it doesn't drift from lib/constants. Anyone
  // with no language on file is left out entirely; everyone left is sorted
  // alphabetically by the first language on their profile.
  const grid = useMemo(() => {
    const days = [...new Set(schedule.map(s => s.day_of_week))].sort((a, b) => (DAY_ORDER[a] ?? 9) - (DAY_ORDER[b] ?? 9))
    const shiftTimes = [...new Set(schedule.map(s => s.shift_time))].sort()
    const cells = new Map() // "day|shift" -> { people: [{ volunteer, entries }] }
    for (const s of schedule) {
      const p = parsed.get(s.volunteer_id)
      if (!p || p.entries.length === 0) continue
      const key = `${s.day_of_week}|${s.shift_time}`
      if (!cells.has(key)) cells.set(key, { people: [] })
      cells.get(key).people.push(p)
    }
    for (const cell of cells.values()) {
      cell.people.sort((a, b) => a.entries[0].language.localeCompare(b.entries[0].language))
    }
    return { days, shiftTimes, cells }
  }, [schedule, parsed])

  if (!volunteers.length) {
    return <div style={card}><p style={{ color: 'var(--muted)' }}>Loading language data…</p></div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Shift coverage */}
      <div style={card}>
        <h3 style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Coverage by Shift</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '1rem' }}>
          Languages available in each regularly scheduled slot (ignores one-off date overrides). Only volunteers with a language on file are counted. Click a cell for names.
        </p>
        {grid.days.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No schedule entries yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '600px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>Day</th>
                  {grid.shiftTimes.map(sh => (
                    <th key={sh} style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'DM Mono, monospace', borderBottom: '1px solid var(--border)' }}>{sh}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.days.map(day => (
                  <tr key={day}>
                    <td style={{ padding: '0.6rem 0.75rem', fontWeight: 500, fontSize: '0.85rem', textTransform: 'capitalize', borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>{day}</td>
                    {grid.shiftTimes.map(sh => {
                      const key = `${day}|${sh}`
                      const cell = grid.cells.get(key)
                      if (!cell || !cell.people.length) {
                        return <td key={sh} style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: '0.78rem', verticalAlign: 'top' }}>—</td>
                      }
                      const langsHere = new Set()
                      cell.people.forEach(p => p.entries.forEach(e => langsHere.add(e.language)))
                      const isOpen = expandedCell === key
                      return (
                        <td
                          key={sh}
                          onClick={() => setExpandedCell(isOpen ? null : key)}
                          style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border)', cursor: 'pointer', verticalAlign: 'top', background: isOpen ? 'rgba(2,65,107,0.06)' : 'transparent' }}
                        >
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                            {[...langsHere].map(l => (
                              <span key={l} style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '100px', background: 'rgba(2,65,107,0.15)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.4)' }}>{l}</span>
                            ))}
                          </div>
                          {isOpen && (
                            <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                              {cell.people.map((p, i) => (
                                <div key={i} style={{ fontSize: '0.78rem' }}>
                                  <span style={{ fontWeight: 500 }}>{p.volunteer.full_name}</span>{' '}
                                  <span style={{ color: 'var(--muted)' }}>
                                    {p.entries.map(e => e.language).join(', ')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Directory */}
      <div style={card}>
        <h3 style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Volunteer Directory</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '1rem' }}>Only shows volunteers with a language listed on their profile.</p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <div style={{ flex: '1 1 220px' }}>
            <label style={labelStyle}>Search</label>
            <input style={inputStyle} placeholder="Name or language…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div style={{ flex: '0 1 220px' }}>
            <label style={labelStyle}>Filter by Language</label>
            <select style={inputStyle} value={langFilter} onChange={e => setLangFilter(e.target.value)}>
              <option value="all">All Languages</option>
              {clinicTally.map(([lang]) => <option key={lang} value={lang}>{lang}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {directory.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No volunteers match.</p>}
          {directory.map(({ volunteer, entries }) => (
            <div key={volunteer.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg)' }}>
              <div>
                <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>{volunteer.full_name}</p>
                {volunteer.default_role && <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{volunteer.default_role}</p>}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'flex-end' }}>
                {entries.map((e, i) => <LangChip key={i} entry={e} />)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Clinic-wide */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ fontWeight: 600 }}>Clinic-Wide Coverage</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            {activeCount} active volunteer{activeCount === 1 ? '' : 's'} · {clinicTally.length} language{clinicTally.length === 1 ? '' : 's'}
          </span>
        </div>
        {clinicTally.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No languages on file yet.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
            {clinicTally.map(([lang, data]) => {
              const pct = activeCount ? Math.round((data.count / activeCount) * 100) : 0
              return (
                <div key={lang} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '0.85rem 1rem', background: 'var(--bg)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{lang}</span>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--accent)' }}>{data.count}</span>
                  </div>
                  <div style={{ marginTop: '0.4rem', height: '6px', borderRadius: '100px', background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.35rem' }}>{pct}% of active volunteers</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
