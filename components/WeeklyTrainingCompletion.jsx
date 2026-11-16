'use client'

import { useEffect, useMemo, useState } from 'react'
import { getMonday, toWeekKey, formatWeekRangeShort } from '../lib/trainingUtils'

const TRACKING_START_DATE = '2026-06-29'
const TRACKING_START_WEEK = toWeekKey(getMonday(new Date(2026, 5, 29))) // 2026-06-29 (Mon)

async function fetchAllRows(supabase, table, buildQuery, pageSize = 1000) {
  let allRows = []
  let from = 0
  while (true) {
    let q = supabase.from(table)
    q = buildQuery(q).range(from, from + pageSize - 1)
    const { data, error } = await q
    if (error) { console.error(`fetchAllRows(${table}) error:`, error); throw error }
    if (!data || data.length === 0) break
    allRows = allRows.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return allRows
}

function weekKeyFromDateStr(dateStr) {
  if (!dateStr) return null
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return toWeekKey(getMonday(new Date(y, m - 1, d)))
}

function pct(completed, required) {
  if (!required) return null
  return Math.round((completed / required) * 1000) / 10
}

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem' }
const inputStyle = { width: '100%', padding: '0.65rem 0.85rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.9rem', outline: 'none', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box' }
const labelStyle = { display: 'block', fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }
const pillBtn = (active) => ({ padding: '0.45rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: active ? 'var(--accent)' : 'var(--surface)', color: active ? '#fff' : 'var(--muted)', border: active ? 'none' : '1px solid var(--border)' })
const badge = (bg, color, border) => ({ display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: '100px', fontSize: '0.72rem', fontWeight: 600, background: bg, color, border: `1px solid ${border}` })

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ ...card, padding: '1rem 1.1rem' }}>
      <p style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.35rem' }}>{label}</p>
      <p style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, color: color || 'var(--text)', fontFamily: 'DM Mono, monospace' }}>{value}</p>
      {sub && <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '0.25rem 0 0' }}>{sub}</p>}
    </div>
  )
}

export default function WeeklyTrainingCompletion({ supabase, profile }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [attendanceRows, setAttendanceRows] = useState([])
  const [ackRows, setAckRows] = useState([])
  const [trainingWeeks, setTrainingWeeks] = useState([])

  const [view, setView] = useState('overview') // overview | byWeek
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [incompleteOnly, setIncompleteOnly] = useState(false)
  const [sortBy, setSortBy] = useState('rate-asc') // rate-asc, rate-desc, name, required, completed
  const [expanded, setExpanded] = useState({})
  const [selectedWeek, setSelectedWeek] = useState('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [profRes, attendance, acks, trainings] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, default_role, role, affiliation, status'),
        fetchAllRows(supabase, 'attendance_records', (q) =>
          q.select('volunteer_id, shift_date, excuse_reason')
            .is('excuse_reason', null)
            .gte('shift_date', TRACKING_START_DATE)
            .order('shift_date', { ascending: true })
        ),
        fetchAllRows(supabase, 'weekly_training_acknowledgments', (q) =>
          q.select('user_id, week_start')
            .gte('week_start', TRACKING_START_WEEK)
            .order('week_start', { ascending: true })
        ),
        supabase.from('weekly_trainings').select('week_start').gte('week_start', TRACKING_START_WEEK),
      ])
      if (profRes.error) throw profRes.error
      setProfiles(profRes.data || [])
      setAttendanceRows(attendance || [])
      setAckRows(acks || [])
      setTrainingWeeks((trainings.data || []).map(t => t.week_start))
    } catch (e) {
      console.error('WeeklyTrainingCompletion load failed', e)
      setError(e.message || 'Failed to load training completion data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const trainingWeekSet = useMemo(() => new Set(trainingWeeks), [trainingWeeks])

  const { volunteerStats, allRequiredWeeks, ackSetByUser } = useMemo(() => {
    const requiredByVolunteer = new Map() // id -> Set(weekKey)
    const allWeeks = new Set()
    for (const row of attendanceRows) {
      if (!row.volunteer_id) continue
      const wk = weekKeyFromDateStr(row.shift_date)
      if (!wk) continue
      allWeeks.add(wk)
      if (!requiredByVolunteer.has(row.volunteer_id)) requiredByVolunteer.set(row.volunteer_id, new Set())
      requiredByVolunteer.get(row.volunteer_id).add(wk)
    }
    const ackByUser = new Map() // id -> Set(weekKey)
    for (const row of ackRows) {
      if (!row.user_id || !row.week_start) continue
      const wk = String(row.week_start).slice(0, 10)
      if (!ackByUser.has(row.user_id)) ackByUser.set(row.user_id, new Set())
      ackByUser.get(row.user_id).add(wk)
    }
    const profileMap = new Map(profiles.map(p => [p.id, p]))
    const stats = []
    for (const [volId, reqSet] of requiredByVolunteer.entries()) {
      const prof = profileMap.get(volId) || null
      const ackSet = ackByUser.get(volId) || new Set()
      const requiredWeeks = Array.from(reqSet).sort()
      const missingWeeks = requiredWeeks.filter(w => !ackSet.has(w))
      const completedWeeksArr = requiredWeeks.filter(w => ackSet.has(w))
      const required = requiredWeeks.length
      const completed = completedWeeksArr.length
      stats.push({
        id: volId,
        profile: prof,
        name: prof?.full_name || '(Unknown volunteer)',
        email: prof?.email || '',
        status: prof?.status || 'active',
        default_role: prof?.default_role || '',
        affiliation: prof?.affiliation || '',
        required,
        completed,
        rate: pct(completed, required),
        requiredWeeks,
        completedWeeksArr,
        missingWeeks,
      })
    }
    // include profiles with no required weeks? not necessary for "who completes..." based on required; omit to reduce noise
    return { volunteerStats: stats, allRequiredWeeks: Array.from(allWeeks).sort(), ackSetByUser: ackByUser }
  }, [attendanceRows, ackRows, profiles])

  const filteredSorted = useMemo(() => {
    let list = volunteerStats
    if (!showInactive) list = list.filter(v => (v.status || 'active') === 'active')
    if (incompleteOnly) list = list.filter(v => v.required > 0 && v.completed < v.required)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(v => (v.name || '').toLowerCase().includes(q) || (v.email || '').toLowerCase().includes(q))
    }
    const arr = [...list]
    arr.sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '')
      if (sortBy === 'required') return b.required - a.required || (a.name || '').localeCompare(b.name || '')
      if (sortBy === 'completed') return b.completed - a.completed || (a.name || '').localeCompare(b.name || '')
      // rate sorts: treat null as -1
      const ra = a.rate == null ? -1 : a.rate
      const rb = b.rate == null ? -1 : b.rate
      if (sortBy === 'rate-desc') return rb - ra || b.required - a.required || (a.name || '').localeCompare(b.name || '')
      // rate-asc default
      return ra - rb || b.required - a.required || (a.name || '').localeCompare(b.name || '')
    })
    return arr
  }, [volunteerStats, showInactive, incompleteOnly, search, sortBy])

  const summary = useMemo(() => {
    const tracked = filteredSorted.length
    const complete = filteredSorted.filter(v => v.required > 0 && v.completed === v.required).length
    const withMissing = filteredSorted.filter(v => v.required > 0 && v.completed < v.required).length
    const totalReq = filteredSorted.reduce((s, v) => s + v.required, 0)
    const totalComp = filteredSorted.reduce((s, v) => s + v.completed, 0)
    const overall = pct(totalComp, totalReq)
    return { tracked, complete, withMissing, overall, totalReq, totalComp }
  }, [filteredSorted])

  const byWeekData = useMemo(() => {
    const wk = selectedWeek || allRequiredWeeks[allRequiredWeeks.length - 1] || ''
    if (!wk) return { week: '', completed: [], notCompleted: [] }
    const requiredForWeek = volunteerStats.filter(v => v.requiredWeeks.includes(wk))
    let list = requiredForWeek
    if (!showInactive) list = list.filter(v => (v.status || 'active') === 'active')
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(v => (v.name || '').toLowerCase().includes(q) || (v.email || '').toLowerCase().includes(q))
    }
    const completed = []
    const notCompleted = []
    for (const v of list) {
      (v.completedWeeksArr.includes(wk) ? completed : notCompleted).push(v)
    }
    completed.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    notCompleted.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    return { week: wk, completed, notCompleted }
  }, [selectedWeek, allRequiredWeeks, volunteerStats, showInactive, search])

  useEffect(() => {
    if (!selectedWeek && allRequiredWeeks.length > 0) {
      setSelectedWeek(allRequiredWeeks[allRequiredWeeks.length - 1])
    }
  }, [allRequiredWeeks, selectedWeek])

  function toggleExpand(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ ...card, textAlign: 'center', color: 'var(--muted)' }}>Loading weekly training completion data…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ ...card, borderColor: 'rgba(239,68,68,0.4)' }}>
          <p style={{ color: '#ef4444', margin: '0 0 0.75rem' }}>Could not load training completion data.</p>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>{error}</p>
          <button onClick={load} style={{ ...pillBtn(true), padding: '0.55rem 1rem' }}>Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Weekly Training Completion</h2>
            <p style={{ margin: '0.25rem 0 0', color: 'var(--muted)', fontSize: '0.85rem' }}>
              Required weeks are based on unexcused attendance records (Mondays, week-of shift date) tracked since {TRACKING_START_DATE}. Completion is matched by weekly training acknowledgment for the same week.
            </p>
          </div>
          <button onClick={load} style={{ ...pillBtn(false), whiteSpace: 'nowrap' }}>Refresh</button>
        </div>
        <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', background: 'transparent', border: '1px solid var(--border)' }}>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text)', lineHeight: 1.5 }}>
            <strong style={{ color: '#60a5fa' }}>Not real-time:</strong> Attendance records are typically updated <strong>2–3 days after</strong> shifts occur. Required weeks, completion counts, and &quot;missing&quot; statuses for recent dates may be incomplete or change once records are finalized.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button onClick={() => setView('overview')} style={pillBtn(view === 'overview')}>Overview</button>
        <button onClick={() => setView('byWeek')} style={pillBtn(view === 'byWeek')}>By Week</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
        <StatCard label="Volunteers Tracked" value={summary.tracked} sub={showInactive ? 'Including inactive' : 'Active only (with required weeks)'} />
        <StatCard label="Fully Complete" value={summary.complete} sub="No missing required weeks" color="#60a5fa" />
        <StatCard label="With Missing Weeks" value={summary.withMissing} sub="One or more incomplete" color={summary.withMissing ? '#60a5fa' : 'var(--text)'} />
        <StatCard label="Overall Completion" value={summary.overall == null ? '—' : `${summary.overall}%`} sub={`${summary.totalComp} / ${summary.totalReq} required weeks`} color={summary.overall != null && summary.overall >= 100 ? '#60a5fa' : 'var(--text)'} />
      </div>

      <div style={{ ...card, padding: '1rem 1.1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
          <div style={{ gridColumn: 'span 2', minWidth: '220px' }}>
            <label style={labelStyle}>Search volunteer</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or email…" style={inputStyle} />
          </div>
          {view === 'overview' ? (
            <>
              <div>
                <label style={labelStyle}>Sort</label>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={inputStyle}>
                  <option value="rate-asc">Completion % (low → high)</option>
                  <option value="rate-desc">Completion % (high → low)</option>
                  <option value="name">Name (A–Z)</option>
                  <option value="required">Required weeks (high → low)</option>
                  <option value="completed">Completed weeks (high → low)</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Include inactive
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={incompleteOnly} onChange={e => setIncompleteOnly(e.target.checked)} /> Only incomplete
                </label>
              </div>
            </>
          ) : (
            <>
              <div>
                <label style={labelStyle}>Week (required attendees)</label>
                <select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)} style={inputStyle}>
                  {allRequiredWeeks.length === 0 && <option value="">No weeks found</option>}
                  {[...allRequiredWeeks].sort((a,b)=>b.localeCompare(a)).map(wk => (
                    <option key={wk} value={wk}>{wk} (Mon {formatWeekRangeShort(wk)}){trainingWeekSet.has(wk) ? '' : ' — no training posted'}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Include inactive
                </label>
              </div>
            </>
          )}
        </div>
      </div>

      {view === 'overview' ? (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '0.9rem 1.1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Volunteers</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{filteredSorted.length} shown · default: all tracked time (since {TRACKING_START_DATE}), active only</span>
          </div>
          {filteredSorted.length === 0 ? (
            <div style={{ padding: '1.25rem', color: 'var(--muted)', fontStyle: 'italic' }}>No volunteers match the current filters (or no required attendance weeks found in the tracked range).</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filteredSorted.map((v, i) => {
                const isOpen = !!expanded[v.id]
                const isInactive = (v.status || 'active') === 'inactive'
                const complete = v.required > 0 && v.completed === v.required
                const rateColor = v.rate == null ? 'var(--muted)' : complete ? '#60a5fa' : v.rate >= 80 ? '#93c5fd' : v.rate >= 50 ? '#3b82f6' : '#1d4ed8'
                return (
                  <div key={v.id} style={{ borderBottom: i < filteredSorted.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <button
                      onClick={() => toggleExpand(v.id)}
                      style={{ width: '100%', textAlign: 'left', padding: '0.85rem 1.1rem', background: isOpen ? 'rgba(2,65,107,0.04)' : 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', color: 'var(--text)' }}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1.6fr) repeat(4, minmax(90px, auto))', gap: '0.75rem', alignItems: 'center' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600 }}>{v.name}</span>
                            {isInactive && <span style={badge('rgba(156,163,175,0.15)', '#9ca3af', 'rgba(156,163,175,0.4)')}>inactive</span>}
                            {complete && <span style={badge('rgba(96,165,250,0.12)', '#60a5fa', 'rgba(96,165,250,0.35)')}>complete</span>}
                            {!complete && v.required > 0 && <span style={badge('rgba(59,130,246,0.12)', '#3b82f6', 'rgba(59,130,246,0.35)')}>missing {v.missingWeeks.length}</span>}
                          </div>
                          <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {[v.default_role, v.email].filter(Boolean).join(' · ') || '—'}
                          </p>
                        </div>
                        <div><p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Required</p><p style={{ margin: 0, fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{v.required}</p></div>
                        <div><p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Completed</p><p style={{ margin: 0, fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{v.completed}</p></div>
                        <div><p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Rate</p><p style={{ margin: 0, fontFamily: 'DM Mono, monospace', fontWeight: 700, color: rateColor }}>{v.rate == null ? '—' : `${v.rate}%`}</p></div>
                        <div style={{ justifySelf: 'end', color: 'var(--muted)', fontSize: '0.85rem' }}>{isOpen ? '▾' : '›'} details</div>
                      </div>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '0 1.1rem 1rem', background: 'rgba(2,65,107,0.02)' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {v.requiredWeeks.map(wk => {
                            const done = v.completedWeeksArr.includes(wk)
                            const posted = trainingWeekSet.has(wk)
                            return (
                              <div key={wk} title={`${wk} (Mon ${formatWeekRangeShort(wk)})${posted ? '' : ' — no training posted'}`} style={{ padding: '0.35rem 0.55rem', borderRadius: '8px', fontSize: '0.78rem', fontFamily: 'DM Mono, monospace', background: done ? 'rgba(96,165,250,0.12)' : 'rgba(29,78,216,0.08)', color: done ? '#60a5fa' : '#1d4ed8', border: `1px solid ${done ? 'rgba(96,165,250,0.35)' : 'rgba(29,78,216,0.35)'}` }}>
                                {wk} {done ? '✓' : '✗'}{!posted ? ' · no post' : ''}
                              </div>
                            )
                          })}
                        </div>
                        {v.requiredWeeks.length === 0 && <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>No required weeks.</p>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '0.9rem 1.1rem', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
              Week: {byWeekData.week ? `${byWeekData.week} (Mon ${formatWeekRangeShort(byWeekData.week)})` : '—'}
            </h3>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
              {byWeekData.week && trainingWeekSet.has(byWeekData.week) ? 'Training was posted for this week.' : byWeekData.week ? 'No weekly training record found for this week (acknowledgments may still exist).' : ''}
              {' '}Required attendees = volunteers with unexcused attendance records in this week (subject to 2–3 day data delay).
            </p>
          </div>
          {!byWeekData.week ? (
            <div style={{ padding: '1.25rem', color: 'var(--muted)', fontStyle: 'italic' }}>No tracked weeks available.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 0 }}>
              <div style={{ padding: '1rem 1.1rem', borderRight: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem' }}>Completed</h4>
                  <span style={badge('rgba(96,165,250,0.12)', '#60a5fa', 'rgba(96,165,250,0.35)')}>{byWeekData.completed.length}</span>
                </div>
                {byWeekData.completed.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontStyle: 'italic', margin: 0 }}>No completions recorded for required attendees in this week.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {byWeekData.completed.map(v => (
                      <div key={v.id} style={{ padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                        <p style={{ margin: 0, fontWeight: 500, fontSize: '0.88rem' }}>{v.name}</p>
                        <p style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>{v.default_role || v.email || '—'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ padding: '1rem 1.1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem' }}>Not Completed</h4>
                  <span style={badge('rgba(59,130,246,0.12)', '#3b82f6', 'rgba(59,130,246,0.35)')}>{byWeekData.notCompleted.length}</span>
                </div>
                {byWeekData.notCompleted.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontStyle: 'italic', margin: 0 }}>All required attendees completed this week.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {byWeekData.notCompleted.map(v => (
                      <div key={v.id} style={{ padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.25)', background: 'rgba(59,130,246,0.04)' }}>
                        <p style={{ margin: 0, fontWeight: 500, fontSize: '0.88rem' }}>{v.name}</p>
                        <p style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>{v.default_role || v.email || '—'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        Notes: Required weeks are derived from unexcused <code style={{ fontFamily: 'DM Mono, monospace' }}>attendance_records</code> on/after {TRACKING_START_DATE}; records may arrive 2–3 days late, so recent weeks can appear missing until finalized. Volunteers with no required weeks in the tracked range are not listed.
      </p>
    </div>
  )
}
