'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getMountainNow } from '../lib/timeUtils'
import { TASK_TEAMS as TEAMS } from '../lib/constants'

// ── Constants ────────────────────────────────────────────────────────────────
const STATUS_META = {
  open:     { label: 'Open',     color: '#02416b', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.3)'   },
  blocked:  { label: 'Blocked',  color: '#02416b', bg: 'rgba(249,115,22,0.10)',  border: 'rgba(249,115,22,0.3)'   },
  closed:   { label: 'Done',     color: '#02416b', bg: 'rgba(2,65,107,0.12)',    border: 'rgba(2,65,107,0.3)'     },
  inactive: { label: 'Inactive', color: '#02416b', bg: 'rgba(107,114,128,0.10)', border: 'rgba(107,114,128,0.25)' },
}

const S = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 0,
    padding: '1.25rem',
  },
  input: {
    width: '100%',
    padding: '0.65rem 0.9rem',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 0,
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

function daysUntilDue(dateStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  const dueLocal = new Date(y, m - 1, d)
  const mtnNow = getMountainNow()
  const todayLocal = new Date(mtnNow.getFullYear(), mtnNow.getMonth(), mtnNow.getDate())
  return (dueLocal - todayLocal) / 86400000
}

function formatDue(dateStr, status) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  const label = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  // Completed tasks are never overdue or urgent — show the plain date only.
  if (status === 'closed') return { label, color: 'var(--muted)' }
  const diff = daysUntilDue(dateStr)
  if (diff < 0)  return { label, color: '#02416b' }
  if (diff < 3)  return { label, color: '#02416b' }
  if (diff < 7)  return { label, color: '#02416b' }
  return { label, color: 'var(--muted)' }
}

// ── Admin Task Row ────────────────────────────────────────────────────────────
function AdminTaskRow({ task, currentUserId, allMembers, onUpdate, onDelete, showToast }) {
  const [notesOpen, setNotesOpen] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesVal, setNotesVal] = useState(task.notes || '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [updatingAssignee, setUpdatingAssignee] = useState(false)
  const [updatingDue, setUpdatingDue] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(task.name)
  const [savingName, setSavingName] = useState(false)
  const notesRef = useRef(null)
  const dateInputRef = useRef(null)
  const notesScrollPosRef = useRef(null)
  const [supportsFieldSizing] = useState(() =>
    typeof CSS !== 'undefined' && CSS.supports && CSS.supports('field-sizing', 'content')
  )

  // Saves the scroll height when opening the notes editor
  useEffect(() => {
    if (!editingNotes || notesScrollPosRef.current === null) return
    const savedScrollY = notesScrollPosRef.current
    notesScrollPosRef.current = null
    requestAnimationFrame(() => {
      window.scrollTo(0, savedScrollY)
    })
  }, [editingNotes])

  useEffect(() => {
    const el = notesRef.current
    if (!el) return

    // Browsers that support field-sizing dynamically adjust the textbox height
    if (supportsFieldSizing) return

    // Failsafe for browsers without field-sizing support keep the textbox static
    const computed = window.getComputedStyle(el)
    const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2 || 20
    const paddingTop = parseFloat(computed.paddingTop) || 0
    const paddingBottom = parseFloat(computed.paddingBottom) || 0
    const minHeight = lineHeight * 10 + paddingTop + paddingBottom

    el.style.height = 'auto'
    const contentHeight = el.scrollHeight
    el.style.height = Math.max(contentHeight, minHeight) + 'px'
  }, [editingNotes])

  const isMine = task.assignee_id === currentUserId
  const due = formatDue(task.due_date, task.status)
  const sm = STATUS_META[task.status] || STATUS_META.open
  // A task's team is a default role: everyone with that default role is on the team.
  const teamMembers = allMembers.filter(m => m.default_role === task.team)

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

  function openDatePicker() {
    const el = dateInputRef.current
    if (!el) return
    try { el.showPicker() } catch { el.focus(); el.click() }
  }

  async function changeDueDate(newDate) {
    setUpdatingDue(true)
    const { error } = await supabase.from('tasks').update({ due_date: newDate || null }).eq('id', task.id)
    if (error) showToast(error.message, 'error')
    else onUpdate(task.id, { due_date: newDate || null })
    setUpdatingDue(false)
  }

  async function handleDelete() {
    if (!confirm(`Delete task "${task.name}"?`)) return
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    if (error) showToast(error.message, 'error')
    else onDelete(task.id)
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
      borderRadius: 0,
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
                <button onClick={saveName} disabled={savingName} style={{ padding: '0.2rem 0.55rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 0, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                  {savingName ? '…' : '✓'}
                </button>
                <button onClick={() => { setEditingName(false); setNameVal(task.name) }} style={{ padding: '0.2rem 0.55rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 0, fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>✕</button>
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
            {!editingName && (
              <span style={{ fontSize: '0.7rem', color: 'var(--muted)', border: '1px solid var(--border)', padding: '0.1rem 0.45rem' }}>
                {task.team}
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
                color: '#000',
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

            {/* Due date (editable) — click to open a calendar */}
            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <button
                type="button"
                onClick={openDatePicker}
                disabled={updatingDue}
                title="Change due date"
                style={{
                  fontSize: '0.75rem',
                  color: '#000',
                  fontFamily: 'DM Mono, monospace',
                  fontStyle: due ? 'normal' : 'italic',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline dotted',
                  textUnderlineOffset: '3px',
                }}
              >
                {due ? due.label : 'Set due date'}
              </button>
              <input
                ref={dateInputRef}
                type="date"
                value={task.due_date || ''}
                onChange={e => { if (e.target.value) changeDueDate(e.target.value) }}
                tabIndex={-1}
                aria-hidden="true"
                style={{
                  position: 'absolute', left: 0, bottom: 0,
                  width: '100%', height: '100%',
                  opacity: 0, pointerEvents: 'none', border: 'none', padding: 0,
                }}
              />
            </span>

            {/* Notes toggle */}
            <button
              onClick={() => { setNotesOpen(o => !o); if (!notesOpen) setEditingNotes(false) }}
              style={{
                fontSize: '0.72rem', color: '#000',
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif', padding: 0, display: 'flex', alignItems: 'center', gap: '0.25rem',
              }}
            >
              {task.notes ? 'Notes' : 'Add note'}
              <span style={{ transform: notesOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▾</span>
            </button>
          </div>
        </div>

        {/* Delete */}
        <button
          onClick={handleDelete}
          title="Delete task"
          style={{
            flexShrink: 0, width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: '1px solid var(--border)', borderRadius: 0,
            color: 'var(--muted)', cursor: 'pointer', fontSize: '0.8rem',
          }}
        >✕</button>
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
                  onClick={() => { notesScrollPosRef.current = window.scrollY; setNotesVal(task.notes || ''); setEditingNotes(true) }}
                  style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', padding: 0 }}
                >
                  Edit notes
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <textarea
                  ref={notesRef}
                  value={notesVal}
                  onChange={e => setNotesVal(e.target.value)}
                  rows={4}
                  placeholder="Add context, links, or updates…"
                  style={{ ...S.input, resize: supportsFieldSizing ? 'none' : 'vertical', overflowY: 'auto', overflowX: 'hidden', fieldSizing: 'content', fontSize: '0.85rem' }}
                />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={saveNotes}
                    disabled={savingNotes}
                    style={{ padding: '0.4rem 1rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 0, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
                  >
                    {savingNotes ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingNotes(false)}
                    style={{ padding: '0.4rem 1rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 0, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
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
function NewTaskForm({ currentUserId, allMembers, onCreated, showToast, onClose }) {
  const [name, setName]         = useState('')
  const [team, setTeam]         = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate]   = useState('')
  const [saving, setSaving]     = useState(false)

  const teamMembers = allMembers.filter(m => m.default_role === team)

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
            style={{ flex: 1, padding: '0.7rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 0, fontWeight: 600, cursor: saving || !name.trim() || !team || !dueDate ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', opacity: (!name.trim() || !team || !dueDate) ? 0.5 : 1 }}
          >
            {saving ? 'Creating…' : 'Create Task'}
          </button>
          <button onClick={onClose} style={{ padding: '0.7rem 1.25rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 0, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AdminTasks({ currentUserId }) {
  const [tasks, setTasks]           = useState([])
  const [allMembers, setAllMembers] = useState([])
  const [loading, setLoading]       = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)
  const [showDone, setShowDone]       = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [showBlocked, setShowBlocked] = useState(false)
  const [filterTeam, setFilterTeam]   = useState('')
  const [filterDue, setFilterDue]   = useState('') // 'overdue' | 'week' | 'month' | ''
  const [toast, setToast]           = useState(null)

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
        .select('id, full_name, default_role')
        .in('default_role', TEAMS)
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
  const filtered = tasks.filter(task => {
    if (filterTeam && task.team !== filterTeam) return false
    if (filterDue) {
      if (!task.due_date) return filterDue === '' // no due date only shows when no filter
      const diff = daysUntilDue(task.due_date)
      if (filterDue === 'overdue' && (diff >= 0 || task.status === 'closed')) return false
      if (filterDue === 'week'    && (diff < 0 || diff > 7)) return false
      if (filterDue === 'month'   && (diff < 0 || diff > 30)) return false
    }
    return true
  })

  const openTasks     = filtered.filter(t => t.status === 'open')
  const blockedTasks  = filtered.filter(t => t.status === 'blocked')
  const closedTasks   = filtered.filter(t => t.status === 'closed')
  const inactiveTasks = filtered.filter(t => t.status === 'inactive')

  // Stats
  const allOpen     = tasks.filter(t => t.status === 'open').length
  const allBlocked  = tasks.filter(t => t.status === 'blocked').length
  const allOverdue  = tasks.filter(t => {
    if (t.status === 'closed' || t.status === 'inactive' || !t.due_date) return false
    return daysUntilDue(t.due_date) < 0
  }).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
        {[
          { label: 'Open', value: allOpen,    color: '#02416b' },
          { label: 'Blocked', value: allBlocked, color: '#02416b' },
          { label: 'Overdue', value: allOverdue, color: '#02416b' },
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
            borderRadius: 0, fontSize: '0.85rem', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap',
          }}
        >
          {showNewForm ? 'Cancel' : '+ New Task'}
        </button>
      </div>

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

      {/* Blocked tasks banner (collapsed by default, above open list) */}
      {blockedTasks.length > 0 && (
        <div>
          <button
            onClick={() => setShowBlocked(s => !s)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: STATUS_META.blocked.bg,
              border: `1px solid ${STATUS_META.blocked.border}`,
              borderRadius: 0, cursor: 'pointer',
              color: STATUS_META.blocked.color, fontSize: '0.82rem', fontWeight: 600,
              fontFamily: 'DM Sans, sans-serif', padding: '0.5rem 0.75rem', width: '100%',
            }}
          >
            <span style={{ transform: showBlocked ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
            {showBlocked ? 'Hide' : 'Show'} {blockedTasks.length} blocked task{blockedTasks.length !== 1 ? 's' : ''}
          </button>
          {showBlocked && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
              {blockedTasks.map(task => (
                <AdminTaskRow
                  currentUserId={currentUserId}
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
                  currentUserId={currentUserId}
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
                  currentUserId={currentUserId}
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
                  currentUserId={currentUserId}
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