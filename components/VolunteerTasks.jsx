'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const STATUS_META = {
  open:     { label: 'Open',     color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.3)'   },
  blocked:  { label: 'Blocked',  color: '#f97316', bg: 'rgba(249,115,22,0.10)',  border: 'rgba(249,115,22,0.3)'   },
  closed:   { label: 'Done',     color: '#2563eb', bg: 'rgba(37,99,235,0.12)',   border: 'rgba(37,99,235,0.3)'    },
  inactive: { label: 'Inactive', color: '#6b7280', bg: 'rgba(107,114,128,0.10)', border: 'rgba(107,114,128,0.25)' },
}

const S = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '1.25rem',
  },
  input: {
    width: '100%',
    padding: '0.65rem 0.9rem',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text)',
    fontSize: '0.9rem',
    outline: 'none',
    fontFamily: 'DM Sans, sans-serif',
    boxSizing: 'border-box',
  },
  label: {
    display: 'block',
    fontSize: '0.75rem',
    color: 'var(--muted)',
    marginBottom: '0.35rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
}

function formatDue(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T12:00:00')
  const now = new Date()
  const diff = (d - now) / 86400000
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (diff < 0)  return { label, color: '#ef4444' }
  if (diff < 3)  return { label, color: '#f97316' }
  if (diff < 7)  return { label, color: '#eab308' }
  return { label, color: 'var(--muted)' }
}

// ── Task Row ─────────────────────────────────────────────────────────────────
// Distinct muted colors for team badges (cycles if >6 teams)
const TEAM_BADGE_COLORS = [
  { color: '#7c3aed', bg: 'rgba(124,58,237,0.12)', border: 'rgba(124,58,237,0.3)' },
  { color: '#0891b2', bg: 'rgba(8,145,178,0.12)',  border: 'rgba(8,145,178,0.3)'  },
  { color: '#b45309', bg: 'rgba(180,83,9,0.12)',   border: 'rgba(180,83,9,0.3)'   },
  { color: '#047857', bg: 'rgba(4,120,87,0.12)',   border: 'rgba(4,120,87,0.3)'   },
  { color: '#be185d', bg: 'rgba(190,24,93,0.12)',  border: 'rgba(190,24,93,0.3)'  },
  { color: '#1d4ed8', bg: 'rgba(29,78,216,0.12)',  border: 'rgba(29,78,216,0.3)'  },
]

function TaskRow({ task, currentUserId, teamMembers, onUpdate, showToast, teamBadge }) {
  const [notesOpen, setNotesOpen] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesVal, setNotesVal] = useState(task.notes || '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [updatingAssignee, setUpdatingAssignee] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(task.name)
  const [savingName, setSavingName] = useState(false)

  const isMine = task.assignee_id === currentUserId
  const due = formatDue(task.due_date)
  const sm = STATUS_META[task.status] || STATUS_META.open
  const assignee = teamMembers.find(m => m.id === task.assignee_id)

  async function cycleStatus() {
    if (task.status === 'inactive') return          // circle button does nothing for inactive
    const next = task.status === 'closed' ? 'open' : 'closed'
    setUpdatingStatus(true)
    const { error } = await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    if (error) showToast(error.message, 'error')
    else onUpdate(task.id, { status: next })
    setUpdatingStatus(false)
  }

  async function saveNotes() {
    setSavingNotes(true)
    const { error } = await supabase.from('tasks').update({ notes: notesVal }).eq('id', task.id)
    if (error) showToast(error.message, 'error')
    else { onUpdate(task.id, { notes: notesVal }); setEditingNotes(false) }
    setSavingNotes(false)
  }

  async function saveName() {
    if (!nameVal.trim()) return
    setSavingName(true)
    const { error } = await supabase.from('tasks').update({ name: nameVal.trim() }).eq('id', task.id)
    if (error) showToast(error.message, 'error')
    else { onUpdate(task.id, { name: nameVal.trim() }); setEditingName(false) }
    setSavingName(false)
  }

  async function changeAssignee(newId) {
    setUpdatingAssignee(true)
    const { error } = await supabase.from('tasks').update({ assignee_id: newId || null }).eq('id', task.id)
    if (error) showToast(error.message, 'error')
    else onUpdate(task.id, { assignee_id: newId || null })
    setUpdatingAssignee(false)
  }

  return (
    <div style={{
      background: isMine ? 'rgba(2,65,107,0.06)' : 'var(--bg)',
      border: `1px solid ${isMine ? 'rgba(2,65,107,0.25)' : 'var(--border)'}`,
      borderRadius: '10px',
      overflow: 'hidden',
      opacity: (task.status === 'closed' || task.status === 'inactive') ? 0.65 : 1,
    }}>
      {/* Main row */}
      <div style={{ padding: '0.85rem 1rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        {/* Status button */}
        <button
          onClick={cycleStatus}
          disabled={updatingStatus}
          title={task.status === 'closed' ? 'Mark as open' : 'Mark as done'}
          style={{
            flexShrink: 0,
            marginTop: '2px',
            width: '20px', height: '20px',
            borderRadius: '50%',
            border: `2px solid ${sm.color}`,
            background: task.status === 'closed' ? sm.color : 'transparent',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {task.status === 'closed'   && <span style={{ color: '#fff', fontSize: '0.65rem', lineHeight: 1 }}>✓</span>}
          {task.status === 'blocked'  && <span style={{ color: sm.color, fontSize: '0.65rem', lineHeight: 1, fontWeight: 700 }}>!</span>}
          {task.status === 'inactive' && <span style={{ color: sm.color, fontSize: '0.65rem', lineHeight: 1, fontWeight: 700 }}>✕</span>}
        </button>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {editingName ? (
              <>
                <input
                  value={nameVal}
                  onChange={e => setNameVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditingName(false); setNameVal(task.name) } }}
                  autoFocus
                  style={{ ...S.input, fontSize: '0.9rem', padding: '0.25rem 0.5rem', flex: 1, minWidth: '150px' }}
                />
                <button onClick={saveName} disabled={savingName} style={{ padding: '0.2rem 0.55rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                  {savingName ? '…' : '✓'}
                </button>
                <button onClick={() => { setEditingName(false); setNameVal(task.name) }} style={{ padding: '0.2rem 0.55rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '5px', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>✕</button>
              </>
            ) : (
              <span
                onClick={() => { setEditingName(true); setNameVal(task.name) }}
                title="Click to edit name"
                style={{
                  fontWeight: isMine ? 600 : 500,
                  fontSize: '0.9rem',
                  color: (task.status === 'closed' || task.status === 'inactive') ? 'var(--muted)' : 'var(--text)',
                  textDecoration: (task.status === 'closed' || task.status === 'inactive') ? 'line-through' : 'none',
                  cursor: 'text',
                }}
              >
                {task.name}
              </span>
            )}
            {isMine && !editingName && (
              <span style={{ fontSize: '0.65rem', background: 'rgba(2,65,107,0.15)', color: '#02416b', borderRadius: '4px', padding: '0.1rem 0.4rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                MINE
              </span>
            )}
            {teamBadge && !editingName && (
              <span style={{
                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.04em',
                color: teamBadge.color, background: teamBadge.bg,
                border: `1px solid ${teamBadge.border}`,
                borderRadius: '4px', padding: '0.1rem 0.4rem',
              }}>
                {task.team.toUpperCase()}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
            {/* Assignee */}

            <select
            value={task.assignee_id || ''}
            onChange={e => changeAssignee(e.target.value)}
            disabled={updatingAssignee}
            style={{
                fontSize: '0.75rem',
                color: 'var(--muted)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
                padding: 0,
                outline: 'none',
            }}
            >
            <option value="">Unassigned</option>
            {teamMembers.map(m => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
            </select>

            <select
            value={task.status}
            onChange={async e => {
                const next = e.target.value
                const { error } = await supabase.from('tasks').update({ status: next }).eq('id', task.id)
                if (error) showToast(error.message, 'error')
                else onUpdate(task.id, { status: next })
            }}
            style={{
                fontSize: '0.75rem',
                color: STATUS_META[task.status]?.color || 'var(--muted)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
                padding: 0,
                outline: 'none',
            }}
            >
            <option value="open">Open</option>
            <option value="blocked">Blocked</option>
            <option value="closed">Closed</option>
            <option value="inactive">Inactive</option>
            </select>

            {/* Due date */}
            {due && (
              <span style={{ fontSize: '0.75rem', color: due.color, fontFamily: 'DM Mono, monospace' }}>
                {due.label}
              </span>
            )}

            {/* Status badge */}
            <span style={{
              fontSize: '0.68rem', fontWeight: 600,
              color: sm.color, background: sm.bg,
              border: `1px solid ${sm.border}`,
              borderRadius: '4px', padding: '0.1rem 0.4rem',
              letterSpacing: '0.04em',
            }}>
              {sm.label.toUpperCase()}
            </span>

            {/* Notes toggle */}
            <button
              onClick={() => { setNotesOpen(o => !o); if (!notesOpen) setEditingNotes(false) }}
              style={{
                fontSize: '0.72rem', color: task.notes ? '#60a5fa' : 'var(--muted)',
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif', padding: 0, display: 'flex', alignItems: 'center', gap: '0.25rem',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16l4-2 4 2 4-2V4a2 2 0 00-2-2z"/>
              </svg>
              {task.notes ? 'Notes' : 'Add note'}
              <span style={{ transform: notesOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▾</span>
            </button>
          </div>
        </div>
      </div>

      {/* Notes panel */}
      {notesOpen && (
        <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ paddingTop: '0.75rem' }}>
            {!editingNotes ? (
              <div>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', whiteSpace: 'pre-wrap', minHeight: '2rem' }}>
                  {task.notes || <em>No notes yet.</em>}
                </p>
                <button
                  onClick={() => { setNotesVal(task.notes || ''); setEditingNotes(true) }}
                  style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', padding: 0 }}
                >
                  Edit notes
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <textarea
                  value={notesVal}
                  onChange={e => setNotesVal(e.target.value)}
                  rows={4}
                  placeholder="Add context, links, or updates…"
                  style={{ ...S.input, resize: 'vertical', fontSize: '0.85rem' }}
                />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={saveNotes}
                    disabled={savingNotes}
                    style={{ padding: '0.4rem 1rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
                  >
                    {savingNotes ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingNotes(false)}
                    style={{ padding: '0.4rem 1rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── New Task Form ─────────────────────────────────────────────────────────────
function NewTaskForm({ currentUserId, team, teamMembers, onCreated, showToast, onClose }) {
  const teams = Array.isArray(team) ? team : [team]
  const [name, setName]           = useState('')
  const [assigneeId, setAssigneeId] = useState(currentUserId)
  const [dueDate, setDueDate]     = useState('')
  const [selectedTeam, setSelectedTeam] = useState(teams[0])
  const [saving, setSaving]       = useState(false)

  // Filter assignees to members who belong to the selected team
  const assignableMembers = teamMembers.filter(m =>
    Array.isArray(m.team) ? m.team.includes(selectedTeam) : m.team === selectedTeam
  )

  async function submit() {
    if (!name.trim() || !dueDate) return
    setSaving(true)
    const { data, error } = await supabase.from('tasks').insert({
      name: name.trim(),
      assignee_id: assigneeId || null,
      status: 'open',
      due_date: dueDate || null,
      team: selectedTeam,
      created_by: currentUserId,
    }).select('*, assignee:profiles!tasks_assignee_id_fkey(id, full_name)').single()
    if (error) { showToast(error.message, 'error'); setSaving(false); return }
    onCreated(data)
    onClose()
    setSaving(false)
  }

  return (
    <div style={{ ...S.card, border: '1px solid var(--accent)', marginBottom: '1rem' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '1rem' }}>New Task</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* Team picker — only shown for multi-team users */}
        {teams.length > 1 && (
          <div>
            <label style={S.label}>Team *</label>
            <select
              value={selectedTeam}
              onChange={e => { setSelectedTeam(e.target.value); setAssigneeId('') }}
              style={S.input}
            >
              {teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={S.label}>Task name *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="What needs to be done?"
            style={S.input}
            autoFocus
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label style={S.label}>Assign to</label>
            <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} style={S.input}>
              <option value="">Unassigned</option>
              {assignableMembers.map(m => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={S.label}>Due date *</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={S.input} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={submit}
            disabled={saving || !name.trim() || !dueDate}
            style={{ flex: 1, padding: '0.7rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: saving || !name.trim() || !dueDate ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', opacity: !name.trim() || !dueDate ? 0.5 : 1 }}
          >
            {saving ? 'Creating…' : 'Create Task'}
          </button>
          <button
            onClick={onClose}
            style={{ padding: '0.7rem 1.25rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function VolunteerTasks({ userId, team }) {
  const [tasks, setTasks]             = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [loading, setLoading]         = useState(true)
  const [showDone, setShowDone]         = useState(false)
  const [showBlocked, setShowBlocked]   = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [showNewForm, setShowNewForm]   = useState(false)
  const [toast, setToast]             = useState(null)

  function showToast(text, type = 'success') {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    if (!team) return
    loadData()
  }, [team])

  async function loadData() {
    setLoading(true)
    const teamFilter = Array.isArray(team) ? team : [team]

    const [{ data: tasksData }, { data: membersData }] = await Promise.all([
      supabase
        .from('tasks')
        .select('*, assignee:profiles!tasks_assignee_id_fkey(id, full_name)')
        .in('team', teamFilter)                    // ← text column, use .in()
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('profiles')
        .select('id, full_name, team')
        .overlaps('team', teamFilter)              // ← array column, overlaps = member on ANY of the user's teams
        .order('full_name'),
    ])
    setTasks(tasksData || [])
    setTeamMembers(membersData || [])
    setLoading(false)
  }

  function handleUpdate(id, changes) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t))
  }

  function handleCreated(task) {
    setTasks(prev => [task, ...prev])
    showToast('Task created!', 'success')
  }

  const open     = tasks.filter(t => t.status === 'open')
  const blocked  = tasks.filter(t => t.status === 'blocked')
  const closed   = tasks.filter(t => t.status === 'closed')
  const inactive = tasks.filter(t => t.status === 'inactive')

  // Sort open: mine first, then by due date
  const sortedOpen = [...open].sort((a, b) => {
    const aMine = a.assignee_id === userId ? 0 : 1
    const bMine = b.assignee_id === userId ? 0 : 1
    if (aMine !== bMine) return aMine - bMine
    if (!a.due_date && !b.due_date) return 0
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return a.due_date.localeCompare(b.due_date)
  })

  const isMultiTeam = Array.isArray(team) && team.length > 1
  const teamList = isMultiTeam ? team : (team ? [team] : [])

  // Build a stable color map: team name → badge style
  const teamBadgeMap = Object.fromEntries(
    teamList.map((t, i) => [t, TEAM_BADGE_COLORS[i % TEAM_BADGE_COLORS.length]])
  )

  if (!team?.length) {
    return (
      <div style={{ ...S.card, textAlign: 'center', padding: '2.5rem' }}>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>You are not currently assigned to a team.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontWeight: 600, fontSize: '1rem' }}>
            {Array.isArray(team) ? team.join(' & ') : team} Tasks
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.1rem' }}>
            {open.length} open
            {blocked.length  > 0 ? ` · ${blocked.length} blocked`  : ''}
            {closed.length   > 0 ? ` · ${closed.length} completed` : ''}
            {inactive.length > 0 ? ` · ${inactive.length} inactive` : ''}
          </p>
        </div>
        <button
          onClick={() => setShowNewForm(f => !f)}
          style={{
            padding: '0.45rem 1rem', background: showNewForm ? 'var(--surface)' : 'var(--accent)',
            color: showNewForm ? 'var(--muted)' : '#fff',
            border: showNewForm ? '1px solid var(--border)' : 'none',
            borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
          }}
        >
          {showNewForm ? 'Cancel' : '+ New Task'}
        </button>
      </div>

      {/* New task form */}
      {showNewForm && (
        <NewTaskForm
          currentUserId={userId}
          team={team}
          teamMembers={teamMembers}
          onCreated={handleCreated}
          showToast={showToast}
          onClose={() => setShowNewForm(false)}
        />
      )}

      {/* Task list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', fontSize: '0.9rem' }}>Loading tasks…</div>
      ) : (
        <>
          {sortedOpen.length === 0 && !showDone && !showBlocked && !showInactive && (
            <div style={{ ...S.card, textAlign: 'center', padding: '2rem' }}>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No open tasks for this team.</p>
            </div>
          )}

          {/* Open tasks — grouped by team when multi-team */}
          {isMultiTeam ? (
            teamList.map(t => {
              const teamOpen = sortedOpen.filter(task => task.team === t)
              if (teamOpen.length === 0) return null
              const badge = teamBadgeMap[t]
              return (
                <div key={t}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', marginTop: '0.25rem' }}>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em',
                      color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`,
                      borderRadius: '5px', padding: '0.15rem 0.55rem',
                    }}>{t.toUpperCase()}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{teamOpen.length} open</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {teamOpen.map(task => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        currentUserId={userId}
                        teamMembers={teamMembers}
                        onUpdate={handleUpdate}
                        showToast={showToast}
                        teamBadge={null}
                      />
                    ))}
                  </div>
                </div>
              )
            })
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {sortedOpen.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  currentUserId={userId}
                  teamMembers={teamMembers}
                  onUpdate={handleUpdate}
                  showToast={showToast}
                  teamBadge={null}
                />
              ))}
            </div>
          )}

          {/* Blocked tasks toggle */}
          {blocked.length > 0 && (
            <div>
              <button
                onClick={() => setShowBlocked(s => !s)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--muted)', fontSize: '0.82rem',
                  fontFamily: 'DM Sans, sans-serif', padding: '0.25rem 0',
                }}
              >
                <span style={{ transform: showBlocked ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
                {showBlocked ? 'Hide' : 'Show'} {blocked.length} blocked task{blocked.length !== 1 ? 's' : ''}
              </button>
              {showBlocked && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {blocked.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      currentUserId={userId}
                      teamMembers={teamMembers}
                      onUpdate={handleUpdate}
                      showToast={showToast}
                      teamBadge={isMultiTeam ? teamBadgeMap[task.team] : null}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Completed tasks toggle */}
          {closed.length > 0 && (
            <div>
              <button
                onClick={() => setShowDone(s => !s)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--muted)', fontSize: '0.82rem',
                  fontFamily: 'DM Sans, sans-serif', padding: '0.25rem 0',
                }}
              >
                <span style={{ transform: showDone ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
                {showDone ? 'Hide' : 'Show'} {closed.length} completed task{closed.length !== 1 ? 's' : ''}
              </button>
              {showDone && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {closed.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      currentUserId={userId}
                      teamMembers={teamMembers}
                      onUpdate={handleUpdate}
                      showToast={showToast}
                      teamBadge={isMultiTeam ? teamBadgeMap[task.team] : null}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Inactive tasks toggle */}
          {inactive.length > 0 && (
            <div>
              <button
                onClick={() => setShowInactive(s => !s)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--muted)', fontSize: '0.82rem',
                  fontFamily: 'DM Sans, sans-serif', padding: '0.25rem 0',
                }}
              >
                <span style={{ transform: showInactive ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
                {showInactive ? 'Hide' : 'Show'} {inactive.length} inactive task{inactive.length !== 1 ? 's' : ''}
              </button>
              {showInactive && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {inactive.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      currentUserId={userId}
                      teamMembers={teamMembers}
                      onUpdate={handleUpdate}
                      showToast={showToast}
                      teamBadge={isMultiTeam ? teamBadgeMap[task.team] : null}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'success' ? 'var(--accent)' : '#ef4444',
          color: '#fff', padding: '0.75rem 1.5rem', borderRadius: '100px',
          fontWeight: 500, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          zIndex: 999, whiteSpace: 'nowrap',
        }}>
          {toast.text}
        </div>
      )}
    </div>
  )
}