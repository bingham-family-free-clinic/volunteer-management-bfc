'use client'

import { useMemo, useState } from 'react'

// ── Language normalization ───────────────────────────────────────────────────
// profiles.languages is completely free text — "Beginner Spanish",
// "French, English, ASL", "english", etc. This is a best-effort parser:
// split on common separators, strip proficiency qualifiers, then map the
// remaining word(s) to a canonical language name via the alias table below.
// Anything that can't be confidently matched is NOT silently dropped — it
// shows up in the "Needs Review" panel so an admin can clean up the source
// data, and the rest of that person's entry is still counted normally.
//
// Everyone is assumed to speak English unless proven otherwise: if a
// profile's languages field doesn't parse out an explicit English entry,
// one is added automatically and flagged as "assumed".

const LANGUAGE_ALIASES = {
  english: 'English', eng: 'English',
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

const PROFICIENCY_COLOR = { Native: '#22c55e', Fluent: '#22c55e', Conversational: '#7dd3fc', Beginner: '#fbbf24' }

function parseLanguageField(raw) {
  const entries = []
  const unrecognized = []
  let hasEnglish = false

  if (raw && raw.trim()) {
    const parts = raw.split(/[,;/&+]| and /i).map(s => s.trim()).filter(Boolean)
    for (const part of parts) {
      let working = part.toLowerCase()
      let proficiency = null
      for (const [word, label] of PROFICIENCY_ALIASES) {
        if (working.includes(word)) {
          proficiency = label
          working = working.replace(word, '').trim()
        }
      }
      working = working.replace(/\bspeaker\b|\bspeaking\b|\blanguage\b/gi, '').replace(/\s+/g, ' ').trim()
      if (!working) continue

      let canonical = LANGUAGE_ALIASES[working]
      if (!canonical) {
        const key = Object.keys(LANGUAGE_ALIASES).find(k => working.includes(k) || k.includes(working))
        if (key) canonical = LANGUAGE_ALIASES[key]
      }

      if (canonical) {
        if (canonical === 'English') hasEnglish = true
        entries.push({ language: canonical, proficiency, raw: part.trim() })
      } else {
        unrecognized.push(part.trim())
      }
    }
  }

  if (!hasEnglish) entries.push({ language: 'English', proficiency: null, assumed: true })

  // De-dupe by language, preferring whichever mention carries proficiency info
  const byLang = new Map()
  for (const e of entries) {
    const existing = byLang.get(e.language)
    if (!existing || (!existing.proficiency && e.proficiency)) byLang.set(e.language, e)
  }
  return { entries: [...byLang.values()], unrecognized }
}

// ── Small display helpers ────────────────────────────────────────────────────
function LangChip({ entry }) {
  const color = entry.language === 'English' ? '#64748b' : (entry.proficiency ? PROFICIENCY_COLOR[entry.proficiency] : 'var(--accent)')
  return (
    <span
      title={entry.raw ? `From profile: "${entry.raw}"` : (entry.assumed ? 'Not listed — assumed' : undefined)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
        padding: '0.2rem 0.6rem', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 500,
        background: color + '22', color, border: `1px solid ${color}55`, whiteSpace: 'nowrap',
      }}
    >
      {entry.language}{entry.proficiency ? ` · ${entry.proficiency}` : ''}{entry.assumed ? ' (assumed)' : ''}
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
  const [showReview, setShowReview] = useState(false)

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
  const labelStyle = { display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const inputStyle = { width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', fontFamily: 'DM Sans, sans-serif' }

  // Parse every active volunteer's language field once
  const parsed = useMemo(() => {
    const active = volunteers.filter(v => v.status === 'active')
    const map = new Map()
    for (const v of active) {
      const { entries, unrecognized } = parseLanguageField(v.languages)
      map.set(v.id, { volunteer: v, entries, unrecognized })
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
        bucket.people.push({ name: volunteer.full_name, proficiency: e.proficiency, assumed: e.assumed })
      }
    }
    return [...tally.entries()].sort((a, b) => {
      if (a[0] === 'English') return -1
      if (b[0] === 'English') return 1
      return b[1].count - a[1].count
    })
  }, [parsed])

  const nonEnglishCount = clinicTally.filter(([lang]) => lang !== 'English').length

  // Profiles whose text had fragments the parser couldn't match
  const needsReview = useMemo(() => {
    const list = []
    for (const { volunteer, unrecognized } of parsed.values()) {
      if (unrecognized.length) list.push({ name: volunteer.full_name, raw: volunteer.languages, fragments: unrecognized })
    }
    return list
  }, [parsed])

  // Filtered directory
  const directory = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...parsed.values()]
      .filter(({ volunteer, entries }) => {
        if (langFilter !== 'all' && !entries.some(e => e.language === langFilter)) return false
        if (!q) return true
        if (volunteer.full_name?.toLowerCase().includes(q)) return true
        return entries.some(e => e.language.toLowerCase().includes(q))
      })
      .sort((a, b) => (a.volunteer.full_name || '').localeCompare(b.volunteer.full_name || ''))
  }, [parsed, search, langFilter])

  // Shift coverage grid — built from whatever days/shift times actually
  // appear in the schedule, so it doesn't drift from lib/constants.
  const grid = useMemo(() => {
    const days = [...new Set(schedule.map(s => s.day_of_week))].sort((a, b) => (DAY_ORDER[a] ?? 9) - (DAY_ORDER[b] ?? 9))
    const shiftTimes = [...new Set(schedule.map(s => s.shift_time))].sort()
    const cells = new Map() // "day|shift" -> { people: [{ volunteer, entries }] }
    for (const s of schedule) {
      const key = `${s.day_of_week}|${s.shift_time}`
      if (!cells.has(key)) cells.set(key, { people: [] })
      const p = parsed.get(s.volunteer_id)
      if (p) cells.get(key).people.push(p)
    }
    return { days, shiftTimes, cells }
  }, [schedule, parsed])

  if (!volunteers.length) {
    return <div style={card}><p style={{ color: 'var(--muted)' }}>Loading language data…</p></div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Intro */}
      <div style={card}>
        <h2 style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Language Coverage</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.6 }}>
          Built from the free-text "Languages" field on each volunteer's profile. Since that field isn't
          standardized, this parses common spellings and proficiency words (e.g. "Beginner Spanish", "French, English, ASL")
          into consistent tags. Every active volunteer is assumed to speak English unless the field says otherwise.
          Entries that couldn't be matched confidently are listed under Needs Review at the bottom rather than being dropped.
        </p>
      </div>

      {/* Clinic-wide */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ fontWeight: 600 }}>Clinic-Wide Coverage</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            {activeCount} active volunteer{activeCount === 1 ? '' : 's'} · {nonEnglishCount} language{nonEnglishCount === 1 ? '' : 's'} beyond English
          </span>
        </div>
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
                  <div style={{ width: `${pct}%`, height: '100%', background: lang === 'English' ? '#64748b' : 'var(--accent)' }} />
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.35rem' }}>{pct}% of active volunteers</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Shift coverage */}
      <div style={card}>
        <h3 style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Coverage by Shift</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '1rem' }}>
          Languages beyond English available in each regularly scheduled slot (ignores one-off date overrides). Click a cell for names.
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
                      cell.people.forEach(p => p.entries.forEach(e => { if (e.language !== 'English') langsHere.add(e.language) }))
                      const isGap = langsHere.size === 0
                      const isOpen = expandedCell === key
                      return (
                        <td
                          key={sh}
                          onClick={() => setExpandedCell(isOpen ? null : key)}
                          style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border)', cursor: 'pointer', verticalAlign: 'top', background: isOpen ? 'rgba(2,65,107,0.06)' : 'transparent' }}
                        >
                          {isGap ? (
                            <span style={{ fontSize: '0.72rem', color: '#fbbf24', border: '1px solid #fbbf2455', background: '#fbbf2422', padding: '0.15rem 0.5rem', borderRadius: '100px' }}>English only</span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                              {[...langsHere].map(l => (
                                <span key={l} style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '100px', background: 'rgba(2,65,107,0.15)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.4)' }}>{l}</span>
                              ))}
                            </div>
                          )}
                          {isOpen && (
                            <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                              {cell.people.map((p, i) => (
                                <div key={i} style={{ fontSize: '0.78rem' }}>
                                  <span style={{ fontWeight: 500 }}>{p.volunteer.full_name}</span>{' '}
                                  <span style={{ color: 'var(--muted)' }}>
                                    {p.entries.filter(e => e.language !== 'English').map(e => e.language).join(', ') || 'English only'}
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
        <h3 style={{ fontWeight: 600, marginBottom: '1rem' }}>Volunteer Directory</h3>
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

      {/* Needs review */}
      {needsReview.length > 0 && (
        <div style={card}>
          <button onClick={() => setShowReview(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: 0, fontFamily: 'DM Sans, sans-serif' }}>
            <h3 style={{ fontWeight: 600, color: 'var(--text)' }}>Needs Review</h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>({needsReview.length}) {showReview ? '▲' : '▼'}</span>
          </button>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0.4rem 0 0' }}>
            These profiles have language text the parser couldn't confidently match to a known language. Any languages it did recognize from the same entry are still counted above.
          </p>
          {showReview && (
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {needsReview.map((r, i) => (
                <div key={i} style={{ padding: '0.65rem 0.9rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)' }}>
                  <p style={{ fontWeight: 500, fontSize: '0.85rem' }}>{r.name}</p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Raw: "{r.raw}"</p>
                  <p style={{ fontSize: '0.78rem', color: '#fbbf24' }}>Unmatched: {r.fragments.join(', ')}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}