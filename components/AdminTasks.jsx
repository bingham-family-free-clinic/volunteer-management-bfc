'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ── Constants ────────────────────────────────────────────────────────────────
const TEAMS = [
  'Office Manager',
  'Information Systems',
  'Administrative Assistant',
  'Communications',
  'Volunteer Credentialing',
  'Provider Credentialing',
  'Executive Assistant',
  'OSSM',
]

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
  const diff = (d - new Date()) / 86400000
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (diff < 0)  return { label, color: '#ef4444', tag: 'OVERDUE' }
  if (diff < 3)  return { label, color: '#f97316', tag: null }
  if (diff < 7)  return { label, color: '#eab308', tag: null }
  return { label, color: 'var(--muted)', tag: null }
}

// ── Admin Task Row ────────────────────────────────────────────────────────────
function AdminTaskRow({ task, allMembers, onUpdate, onDelete, showToast }) {
  const [notesOpen, setNotesOpen]     = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesVal, setNotesVal]       = useState(task.notes || '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal]         = useState(task.name)
  const [savingName, setSavingName]   = useState(false)

  const due = formatDue(task.due_date)
  const sm = STATUS_META[task.status] || STATUS_META.open
  const teamMembers = allMembers.filter(m => Array.isArray(m.team) && m.team.includes(task.team))

  async function updateField(field, value) {
    const { error } = await supabase.from('tasks').update({ [field]: value }).eq('id', task.id)
    if (error) showToast(error.message, 'error')
    else onUpdate(task.id, { [field]: value })
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

  async function handleDelete() {

    if (!confirm(`Delete task "${task.name}"?`)) return
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    if (error) showToast(error.message, 'error')
    else onDelete(task.id)
  }

  return (
    <div style={{
      background: 'var(--bg)',
      border: `1px solid ${(task.status === 'closed' || task.status === 'inactive') ? 'var(--border)' : sm.border}`,
      borderRadius: '10px',
      overflow: 'hidden',
      opacity: (task.status === 'closed' || task.status === 'inactive') ? 0.7 : 1,
    }}>
      <div style={{ padding: '0.9rem 1rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        {/* Status select */}
        <select
          value={task.status}
          onChange={e => updateField('status', e.target.value)}
          style={{
            fontSize: '0.72rem', fontWeight: 600,
            color: sm.color, background: sm.bg,
            border: `1px solid ${sm.border}`,
            borderRadius: '4px', padding: '0.2rem 0.5rem',
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            flexShrink: 0,
          }}
        >
          {Object.entries(STATUS_META).map(([val, meta]) => (
            <option key={val} value={val}>{meta.label.toUpperCase()}</option>
          ))}
        </select>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: '200px' }}>
          {editingName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
              <input
                value={nameVal}
                onChange={e => setNameVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditingName(false); setNameVal(task.name) } }}
                autoFocus
                style={{ ...S.input, fontSize: '0.9rem', padding: '0.25rem 0.5rem', flex: 1 }}
              />
              <button onClick={saveName} disabled={savingName} style={{ padding: '0.25rem 0.6rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                {savingName ? '…' : '✓'}
              </button>
              <button onClick={() => { setEditingName(false); setNameVal(task.name) }} style={{ padding: '0.25rem 0.6rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '5px', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>✕</button>
            </div>
          ) : (
            <p
              onClick={() => { setEditingName(true); setNameVal(task.name) }}
              title="Click to edit name"
              style={{
                fontWeight: 500, fontSize: '0.9rem',
                color: (task.status === 'closed' || task.status === 'inactive') ? 'var(--muted)' : 'var(--text)',
                textDecoration: (task.status === 'closed' || task.status === 'inactive') ? 'line-through' : 'none',
                marginBottom: '0.4rem', cursor: 'text',
              }}
            >
              {task.name}
            </p>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Team badge */}
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.1rem 0.45rem' }}>
              {task.team}
            </span>

            {/* Assignee */}
            <select
              value={task.assignee_id || ''}
              onChange={e => updateField('assignee_id', e.target.value || null)}
              style={{
                fontSize: '0.78rem', color: 'var(--muted)',
                background: 'transparent', border: 'none',
                cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', padding: 0, outline: 'none',
              }}
            >
              <option value="">Unassigned</option>
              {teamMembers.map(m => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>

            {/* Due date */}
            {due ? (
              <span style={{ fontSize: '0.75rem', color: due.color, fontFamily: 'DM Mono, monospace' }}>
                {due.label}{due.tag && <span style={{ marginLeft: '0.3rem', fontWeight: 700 }}>· {due.tag}</span>}
              </span>
            ) : (
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontStyle: 'italic' }}>No due date</span>
            )}

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
            </button>
          </div>
        </div>

        {/* Due date editor + delete */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <input
            type="date"
            value={task.due_date || ''}
            onChange={e => updateField('due_date', e.target.value || null)}
            style={{ ...S.input, width: '140px', fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
          />
          <button
            onClick={handleDelete}
            title="Delete task"
            style={{
              width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: '1px solid var(--border)', borderRadius: '6px',
              color: 'var(--muted)', cursor: 'pointer', fontSize: '0.8rem',
            }}
          >✕</button>
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
                  <button onClick={saveNotes} disabled={savingNotes} style={{ padding: '0.4rem 1rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                    {savingNotes ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => setEditingNotes(false)} style={{ padding: '0.4rem 1rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Cancel</button>
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
function NewTaskForm({ currentUserId, allMembers, onCreated, showToast, onClose }) {
  const [name, setName]         = useState('')
  const [team, setTeam]         = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate]   = useState('')
  const [saving, setSaving]     = useState(false)

  const teamMembers = allMembers.filter(m => Array.isArray(m.team) && m.team.includes(team))

  async function submit() {
    if (!name.trim() || !team || !dueDate) return
    setSaving(true)
    const { data, error } = await supabase.from('tasks').insert({
      name: name.trim(),
      assignee_id: assigneeId || null,
      status: 'open',
      due_date: dueDate || null,
      team,
      created_by: currentUserId,
    }).select().single()
    if (error) { showToast(error.message, 'error'); setSaving(false); return }
    onCreated(data)
    showToast('Task created!', 'success')
    onClose()
    setSaving(false)
  }

  return (
    <div style={{ ...S.card, border: '1px solid var(--accent)', marginBottom: '1rem' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '1rem' }}>New Task</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <label style={S.label}>Task name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="What needs to be done?" style={S.input} autoFocus />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label style={S.label}>Team *</label>
            <select value={team} onChange={e => { setTeam(e.target.value); setAssigneeId('') }} style={S.input}>
              <option value="">Select team…</option>
              {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Assign to</label>
            <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} style={S.input} disabled={!team}>
              <option value="">Unassigned</option>
              {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={S.label}>Due date *</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ ...S.input, maxWidth: '200px' }} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={submit}
            disabled={saving || !name.trim() || !team || !dueDate}
            style={{ flex: 1, padding: '0.7rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: saving || !name.trim() || !team || !dueDate ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', opacity: (!name.trim() || !team || !dueDate) ? 0.5 : 1 }}
          >
            {saving ? 'Creating…' : 'Create Task'}
          </button>
          <button onClick={onClose} style={{ padding: '0.7rem 1.25rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Team Status Editor ────────────────────────────────────────────────────────
function TeamStatusEditor({ volunteers, onTeamUpdated, showToast }) {
  const [filterTeam, setFilterTeam] = useState('')
  const [saving, setSaving] = useState(null)
  const [addingToTeam, setAddingToTeam] = useState(null)
  const [addVolId, setAddVolId] = useState('')

  const displayed = filterTeam
    ? volunteers.filter(v => Array.isArray(v.team) && v.team.includes(filterTeam))
    : volunteers.filter(v => v.team?.length)

  const unassigned = volunteers.filter(v => !v.team?.length)

  async function addToTeam(volId, teamToAdd) {
    const vol = volunteers.find(v => v.id === volId)
    const current = Array.isArray(vol?.team) ? vol.team : []
    if (current.includes(teamToAdd)) return
    const updated = [...current, teamToAdd]
    setSaving(volId)
    const { error } = await supabase.from('profiles').update({ team: updated }).eq('id', volId)
    if (error) showToast(error.message, 'error')
    else { onTeamUpdated(volId, updated); showToast('Team updated.', 'success') }
    setSaving(null)
  }

  async function removeFromTeam(volId, teamToRemove) {
    const vol = volunteers.find(v => v.id === volId)
    const updated = (Array.isArray(vol?.team) ? vol.team : []).filter(t => t !== teamToRemove)
    setSaving(volId)
    const { error } = await supabase.from('profiles').update({ team: updated.length ? updated : null }).eq('id', volId)
    if (error) showToast(error.message, 'error')
    else { onTeamUpdated(volId, updated.length ? updated : null); showToast('Team updated.', 'success') }
    setSaving(null)
  }

  async function handleAdd() {
    if (!addVolId || !addingToTeam) return
    await addToTeam(addVolId, addingToTeam)
    setAddVolId('')
    setAddingToTeam(null)
  }

  return (
    <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>Team Assignments</h3>
        <select
          value={filterTeam}
          onChange={e => { setFilterTeam(e.target.value); setAddingToTeam(null); setAddVolId('') }}
          style={{ ...S.input, width: 'auto', fontSize: '0.82rem', flex: '0 0 auto' }}
        >
          <option value="">All teams</option>
          {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {displayed.length === 0 ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', fontStyle: 'italic' }}>No volunteers assigned to a team.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {displayed.map(v => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 500, minWidth: '120px' }}>{v.full_name}</span>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', flex: 1 }}>
                {(v.team || []).map(t => (
                  <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', padding: '0.15rem 0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--muted)' }}>
                    {t}
                    <button onClick={() => removeFromTeam(v.id, t)} disabled={saving === v.id} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.7rem', padding: 0, lineHeight: 1 }}>✕</button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add member to a specific team */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
        {addingToTeam ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
              Adding to <strong style={{ color: 'var(--text)' }}>{addingToTeam}</strong>
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select
                value={addVolId}
                onChange={e => setAddVolId(e.target.value)}
                style={{ ...S.input, flex: 1, fontSize: '0.85rem' }}
              >
                <option value="">— Select person —</option>
                {volunteers
                  .filter(v => !Array.isArray(v.team) || !v.team.includes(addingToTeam))
                  .map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}
              </select>
              <button
                onClick={handleAdd}
                disabled={!addVolId || !!saving}
                style={{ padding: '0.5rem 0.9rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '0.82rem', fontWeight: 600, cursor: !addVolId ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', opacity: !addVolId ? 0.5 : 1 }}
              >
                Add
              </button>
              <button
                onClick={() => { setAddingToTeam(null); setAddVolId('') }}
                style={{ padding: '0.5rem 0.75rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Add someone to:</span>
            {TEAMS.map(t => (
              <button
                key={t}
                onClick={() => { setAddingToTeam(t); setFilterTeam(''); setAddVolId('') }}
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem', fontWeight: 500, background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AdminTasks({ currentUserId, volunteers: externalVolunteers, onVolunteerTeamUpdate }) {
  const [tasks, setTasks]           = useState([])
  const [allMembers, setAllMembers] = useState([])
  const [loading, setLoading]       = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)
  const [showDone, setShowDone]       = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [filterTeam, setFilterTeam]   = useState('')
  const [filterDue, setFilterDue]   = useState('') // 'overdue' | 'week' | 'month' | ''
  const [toast, setToast]           = useState(null)
  const [showTeamEditor, setShowTeamEditor] = useState(false)

  function showToast(text, type = 'success') {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: tasksData }, { data: membersData }] = await Promise.all([
      supabase
        .from('tasks')
        .select('*')
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('profiles')
        .select('id, full_name, team')
        .order('full_name'),
    ])
    setTasks(tasksData || [])
    setAllMembers(membersData || [])
    setLoading(false)
  }

  function handleUpdate(id, changes) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t))
  }

  function handleDelete(id) {
    setTasks(prev => prev.filter(t => t.id !== id))
    showToast('Task deleted.', 'success')
  }

  function handleCreated(task) {
    setTasks(prev => [task, ...prev])
  }

  // Filter logic
  const now = new Date()
  const filtered = tasks.filter(task => {
    if (filterTeam && task.team !== filterTeam) return false
    if (filterDue) {
      if (!task.due_date) return filterDue === '' // no due date only shows when no filter
      const d = new Date(task.due_date + 'T12:00:00')
      const diff = (d - now) / 86400000
      if (filterDue === 'overdue' && diff >= 0) return false
      if (filterDue === 'week'    && (diff < 0 || diff > 7)) return false
      if (filterDue === 'month'   && (diff < 0 || diff > 30)) return false
    }
    return true
  })

  const openTasks     = filtered.filter(t => t.status === 'open' || t.status === 'blocked')
  const closedTasks   = filtered.filter(t => t.status === 'closed')
  const inactiveTasks = filtered.filter(t => t.status === 'inactive')

  // Stats
  const allOpen     = tasks.filter(t => t.status === 'open').length
  const allBlocked  = tasks.filter(t => t.status === 'blocked').length
  const allOverdue  = tasks.filter(t => {
    if (t.status === 'closed' || t.status === 'inactive' || !t.due_date) return false
    return new Date(t.due_date + 'T12:00:00') < now
  }).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
        {[
          { label: 'Open', value: allOpen,    color: '#60a5fa' },
          { label: 'Blocked', value: allBlocked, color: '#f97316' },
          { label: 'Overdue', value: allOverdue, color: '#ef4444' },
        ].map(stat => (
          <div key={stat.label} style={{ ...S.card, padding: '0.85rem 1rem', textAlign: 'center' }}>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: stat.color }}>{stat.value}</p>
            <p style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Controls row */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={filterTeam}
          onChange={e => setFilterTeam(e.target.value)}
          style={{ ...S.input, width: 'auto', fontSize: '0.85rem', flex: '1 1 160px' }}
        >
          <option value="">All teams</option>
          {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          value={filterDue}
          onChange={e => setFilterDue(e.target.value)}
          style={{ ...S.input, width: 'auto', fontSize: '0.85rem', flex: '1 1 140px' }}
        >
          <option value="">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="week">Due this week</option>
          <option value="month">Due this month</option>
        </select>

        <button
          onClick={() => setShowNewForm(f => !f)}
          style={{
            padding: '0.65rem 1.1rem', background: showNewForm ? 'var(--surface)' : 'var(--accent)',
            color: showNewForm ? 'var(--muted)' : '#fff',
            border: showNewForm ? '1px solid var(--border)' : 'none',
            borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap',
          }}
        >
          {showNewForm ? 'Cancel' : '+ New Task'}
        </button>
        {externalVolunteers && externalVolunteers.length > 0 && (
          <button
            onClick={() => setShowTeamEditor(s => !s)}
            style={{
              padding: '0.65rem 1.1rem',
              background: showTeamEditor ? 'rgba(2,65,107,0.12)' : 'var(--surface)',
              color: showTeamEditor ? 'var(--accent)' : 'var(--muted)',
              border: `1px solid ${showTeamEditor ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap',
            }}
          >
            {showTeamEditor ? 'Hide Teams' : 'Edit Teams'}
          </button>
        )}
      </div>

      {/* Team status editor */}
      {showTeamEditor && externalVolunteers && (
        <TeamStatusEditor
          volunteers={externalVolunteers}
          onTeamUpdated={(volId, newTeam) => onVolunteerTeamUpdate && onVolunteerTeamUpdate(volId, newTeam)}
          showToast={showToast}
        />
      )}

      {/* New task form */}
      {showNewForm && (
        <NewTaskForm
          currentUserId={currentUserId}
          allMembers={allMembers}
          onCreated={handleCreated}
          showToast={showToast}
          onClose={() => setShowNewForm(false)}
        />
      )}

      {/* Results summary */}
      <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
        Showing {openTasks.length} open task{openTasks.length !== 1 ? 's' : ''}
        {(filterTeam || filterDue) ? ' (filtered)' : ''}
      </p>

      {/* Open tasks */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', fontSize: '0.9rem' }}>Loading tasks…</div>
      ) : (
        <>
          {openTasks.length === 0 ? (
            <div style={{ ...S.card, textAlign: 'center', padding: '2rem' }}>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No open tasks match your filters.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {openTasks.map(task => (
                <AdminTaskRow
                  key={task.id}
                  task={task}
                  allMembers={allMembers}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  showToast={showToast}
                />
              ))}
            </div>
          )}

          {/* Completed tasks */}
          {closedTasks.length > 0 && (
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
                {showDone ? 'Hide' : 'Show'} {closedTasks.length} completed task{closedTasks.length !== 1 ? 's' : ''}
              </button>
              {showDone && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {closedTasks.map(task => (
                    <AdminTaskRow
                      key={task.id}
                      task={task}
                      allMembers={allMembers}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                      showToast={showToast}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Inactive tasks */}
          {inactiveTasks.length > 0 && (
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
                {showInactive ? 'Hide' : 'Show'} {inactiveTasks.length} inactive task{inactiveTasks.length !== 1 ? 's' : ''}
              </button>
              {showInactive && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {inactiveTasks.map(task => (
                    <AdminTaskRow
                      key={task.id}
                      task={task}
                      allMembers={allMembers}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                      showToast={showToast}
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