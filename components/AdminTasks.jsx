'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '../app/tasks.css'
import { supabase } from '../lib/supabase'
import { getMountainNow } from '../lib/timeUtils'
import { TASK_TEAMS } from '../lib/constants'
import { useConfirm } from '../lib/ConfirmDialog'

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'closed', label: 'Closed' },
  { value: 'inactive', label: 'Inactive' },
]

const DUE_FILTERS = [
  { value: '', label: 'Any due date' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'week', label: 'Due in 7 days' },
  { value: 'month', label: 'Due in 30 days' },
]

const GROUPS = [
  { status: 'open', label: 'Open' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'closed', label: 'Closed' },
  { status: 'inactive', label: 'Inactive' },
]

// ── Due date helpers ─────────────────────────────────────────────────────────
// due_date is a plain calendar date (e.g. "2026-07-30"), not a UTC instant — it
// has no time-of-day to convert, so it must NOT be run through
// asUTC/formatDateMountain (that would treat it as UTC-midnight and shift it
// back a day once converted to Mountain Time). Instead we anchor "today" to
// Mountain Time via getMountainNow(), so everyone sees the same due/overdue
// status regardless of their own browser's timezone.

function daysUntilDue(dateStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  const dueLocal = new Date(y, m - 1, d)
  const mtnNow = getMountainNow()
  const todayLocal = new Date(mtnNow.getFullYear(), mtnNow.getMonth(), mtnNow.getDate())
  return (dueLocal - todayLocal) / 86400000
}

// Monochrome by design: urgency is carried by font weight and a short text flag,
// never by colour. Keep this identical to the volunteer board so the two never
// drift apart.
function dueMeta(dateStr, status) {
  if (!dateStr) return { label: 'No due date', tone: 'muted' }
  const [y, m, d] = dateStr.split('-').map(Number)
  const label = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  // Closed tasks are never overdue or urgent — show the plain date only.
  if (status === 'closed' || status === 'inactive') return { label, tone: 'muted' }
  const diff = daysUntilDue(dateStr)
  if (diff < 0) return { label, tone: 'overdue', flag: 'Overdue' }
  if (diff === 0) return { label, tone: 'soon', flag: 'Today' }
  if (diff < 3) return { label, tone: 'soon', flag: `In ${diff}d` }
  if (diff < 7) return { label, tone: 'normal', flag: `In ${diff}d` }
  return { label, tone: 'muted' }
}

// Overdue first, then soonest due. Tasks with no due date sink to the bottom.
function compareByDue(a, b) {
  if (a.due_date && !b.due_date) return -1
  if (!a.due_date && b.due_date) return 1
  if (!a.due_date && !b.due_date) return a.name.localeCompare(b.name)
  return a.due_date.localeCompare(b.due_date)
}

function matchesDueFilter(task, filter) {
  if (!filter) return true
  if (!task.due_date) return false
  const diff = daysUntilDue(task.due_date)
  if (filter === 'overdue') return diff < 0 && (task.status === 'open' || task.status === 'blocked')
  if (filter === 'week') return diff >= 0 && diff <= 7
  if (filter === 'month') return diff >= 0 && diff <= 30
  return true
}

// ── Row ──────────────────────────────────────────────────────────────────────

function AdminTaskRow({
  task,
  currentUserId,
  members,
  expanded,
  onToggle,
  onSave,
  onDelete,
  onSetClosed,
  busy,
}) {
  const [form, setForm] = useState(null)

  useEffect(() => {
    if (!expanded) return
    setForm({
      name: task.name,
      team: task.team,
      assignee_id: task.assignee_id || '',
      status: task.status,
      due_date: task.due_date || '',
      notes: task.notes || '',
    })
  }, [expanded, task.id])

  // A task's team is a default role: everyone with that default role is on the team.
  const teamMembers = useMemo(
    () => (form ? members.filter(m => m.default_role === form.team) : []),
    [members, form],
  )

  const assignee = members.find(m => m.id === task.assignee_id) || null
  const due = dueMeta(task.due_date, task.status)
  const isMine = task.assignee_id === currentUserId
  const isClosed = task.status === 'closed'
  const isInactive = task.status === 'inactive'

  function set(key, value) {
    setForm(prev => (prev ? { ...prev, [key]: value } : prev))
  }

  async function submit(e) {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) return
    const ok = await onSave(task.id, {
      name,
      team: form.team,
      assignee_id: form.assignee_id || null,
      status: form.status,
      due_date: form.due_date || null,
      notes: form.notes,
    })
    if (ok) onToggle()
  }

  const titleClass =
    isClosed ? 'tk-title tk-title-done' : isInactive ? 'tk-title tk-title-off' : 'tk-title'

  return (
    <li className={isMine ? 'tk-row tk-row-mine' : 'tk-row'}>
      <div className="tk-row-main">
        <input
          type="checkbox"
          className="tk-check"
          checked={isClosed}
          disabled={isInactive || busy}
          onChange={e => onSetClosed(task, e.target.checked)}
          aria-label={isClosed ? `Reopen ${task.name}` : `Mark ${task.name} done`}
        />

        <span className={titleClass}>{task.name}</span>

        <span className="tk-tag">{task.team}</span>

        {task.status === 'blocked' && <span className="tk-tag">Blocked</span>}
        {isInactive && <span className="tk-tag">Inactive</span>}
        {task.notes ? <span className="tk-tag">Note</span> : null}

        <span className="tk-spacer" />

        <span className={assignee ? 'tk-assignee' : 'tk-assignee tk-assignee-none'}>
          {assignee ? assignee.full_name : 'Unassigned'}
        </span>

        <span className={`tk-due tk-due-${due.tone}`}>
          {due.label}
          {due.flag ? ` · ${due.flag}` : ''}
        </span>

        <button
          type="button"
          className="tk-btn tk-btn-sm"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          {expanded ? 'Close' : 'Edit'}
        </button>
      </div>

      {expanded && form && (
        <form className="tk-detail" onSubmit={submit}>
          <div className="tk-field">
            <label className="tk-label" htmlFor={`task-name-${task.id}`}>Task name</label>
            <input
              id={`task-name-${task.id}`}
              className="tk-input"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              required
            />
          </div>

          <div className="tk-detail-grid">
            <div className="tk-field">
              <label className="tk-label" htmlFor={`task-team-${task.id}`}>Team</label>
              <select
                id={`task-team-${task.id}`}
                className="tk-select"
                value={form.team}
                onChange={e => { set('team', e.target.value); set('assignee_id', '') }}
              >
                {TASK_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="tk-field">
              <label className="tk-label" htmlFor={`task-assignee-${task.id}`}>Assign to</label>
              <select
                id={`task-assignee-${task.id}`}
                className="tk-select"
                value={form.assignee_id}
                onChange={e => set('assignee_id', e.target.value)}
              >
                <option value="">Unassigned</option>
                {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>

            <div className="tk-field">
              <label className="tk-label" htmlFor={`task-status-${task.id}`}>Status</label>
              <select
                id={`task-status-${task.id}`}
                className="tk-select"
                value={form.status}
                onChange={e => set('status', e.target.value)}
              >
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="tk-field">
              <label className="tk-label" htmlFor={`task-due-${task.id}`}>Due date</label>
              <input
                id={`task-due-${task.id}`}
                type="date"
                className="tk-input"
                value={form.due_date}
                onChange={e => set('due_date', e.target.value)}
              />
            </div>
          </div>

          <div className="tk-field">
            <label className="tk-label" htmlFor={`task-notes-${task.id}`}>Notes</label>
            <textarea
              id={`task-notes-${task.id}`}
              className="tk-textarea"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Context, links, or updates"
            />
          </div>

          <div className="tk-detail-actions">
            <button type="submit" className="tk-btn tk-btn-primary" disabled={busy}>
              {busy ? 'Saving' : 'Save'}
            </button>
            <button type="button" className="tk-btn" onClick={onToggle} disabled={busy}>
              Cancel
            </button>
            <span className="tk-spacer" />
            <button
              type="button"
              className="tk-btn tk-btn-danger"
              onClick={() => onDelete(task)}
              disabled={busy}
            >
              Delete
            </button>
          </div>
        </form>
      )}
    </li>
  )
}

// ── Create form ──────────────────────────────────────────────────────────────
// Always visible rather than toggled: it is four fields on one row, and removing
// the toggle removes a button and the page reflow that came with it.

function NewTaskPanel({ members, onCreate }) {
  const [name, setName] = useState('')
  const [team, setTeam] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  const teamMembers = useMemo(
    () => (team ? members.filter(m => m.default_role === team) : []),
    [members, team],
  )

  const ready = Boolean(name.trim() && team && dueDate)

  async function submit(e) {
    e.preventDefault()
    if (!ready || saving) return
    setSaving(true)
    const created = await onCreate({
      name: name.trim(),
      assignee_id: assigneeId || null,
      due_date: dueDate,
      team,
    })
    if (created) {
      setName('')
      setAssigneeId('')
      setDueDate('')
    }
    setSaving(false)
  }

  return (
    <form className="tk-panel" onSubmit={submit}>
      <div className="tk-form-body">
        <div className="tk-form-row">
          <div className="tk-field tk-field-wide">
            <label className="tk-label" htmlFor="new-task-name">Task name</label>
            <input
              id="new-task-name"
              className="tk-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="What needs to be done?"
            />
          </div>

          <div className="tk-field">
            <label className="tk-label" htmlFor="new-task-team">Team</label>
            <select
              id="new-task-team"
              className="tk-select"
              value={team}
              onChange={e => { setTeam(e.target.value); setAssigneeId('') }}
            >
              <option value="">Select team</option>
              {TASK_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="tk-field">
            <label className="tk-label" htmlFor="new-task-assignee">Assign to</label>
            <select
              id="new-task-assignee"
              className="tk-select"
              value={assigneeId}
              onChange={e => setAssigneeId(e.target.value)}
              disabled={!team}
            >
              <option value="">Unassigned</option>
              {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>

          <div className="tk-field">
            <label className="tk-label" htmlFor="new-task-due">Due date</label>
            <input
              id="new-task-due"
              type="date"
              className="tk-input"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </div>

          <div className="tk-form-actions">
            <button type="submit" className="tk-btn tk-btn-primary" disabled={!ready || saving}>
              {saving ? 'Creating' : 'Create task'}
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function AdminTasks({ currentUserId }) {
  const [tasks, setTasks] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [filterTeam, setFilterTeam] = useState('')
  const [filterDue, setFilterDue] = useState('')
  const [toast, setToast] = useState(null)
  const confirmAction = useConfirm()
  const toastTimer = useRef(null)

  const showToast = useCallback((text, tone = 'success') => {
    clearTimeout(toastTimer.current)
    setToast({ text, tone })
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }, [])

  useEffect(() => () => clearTimeout(toastTimer.current), [])
  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: taskRows }, { data: memberRows }] = await Promise.all([
      supabase
        .from('tasks')
        .select('*')
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('profiles')
        .select('id, full_name, default_role')
        .in('default_role', TASK_TEAMS)
        .order('full_name'),
    ])
    setTasks(taskRows || [])
    setMembers(memberRows || [])
    setLoading(false)
  }

  const filtered = useMemo(
    () => tasks
      .filter(t => (!filterTeam || t.team === filterTeam) && matchesDueFilter(t, filterDue))
      .sort(compareByDue),
    [tasks, filterTeam, filterDue],
  )

  const groups = useMemo(
    () => GROUPS
      .map(g => ({ ...g, items: filtered.filter(t => t.status === g.status) }))
      .filter(g => g.items.length > 0),
    [filtered],
  )

  const counts = useMemo(() => ({
    open: filtered.filter(t => t.status === 'open').length,
    blocked: filtered.filter(t => t.status === 'blocked').length,
    overdue: filtered.filter(t => {
      if (t.status !== 'open' && t.status !== 'blocked') return false
      const diff = daysUntilDue(t.due_date)
      return diff !== null && diff < 0
    }).length,
  }), [filtered])

  const filtersActive = Boolean(filterTeam || filterDue)

  async function create(values) {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        name: values.name,
        assignee_id: values.assignee_id,
        status: 'open',
        due_date: values.due_date,
        team: values.team,
        created_by: currentUserId,
      })
      .select()
      .single()

    if (error) {
      showToast(error.message, 'error')
      return false
    }
    setTasks(prev => [data, ...prev])
    showToast('Task created.', 'success')
    return true
  }

  async function save(id, patch) {
    setBusyId(id)
    const { error } = await supabase.from('tasks').update(patch).eq('id', id)
    setBusyId(null)
    if (error) {
      showToast(error.message, 'error')
      return false
    }
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)))
    showToast('Task updated.', 'success')
    return true
  }

  async function setClosed(task, closed) {
    const next = closed ? 'closed' : 'open'
    setBusyId(task.id)
    const { error } = await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    setBusyId(null)
    if (error) {
      showToast(error.message, 'error')
      return
    }
    setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, status: next } : t)))
    // Dismiss any open editor so its (now stale) status field cannot overwrite this.
    setExpandedId(prev => (prev === task.id ? null : prev))
  }

  async function remove(task) {
    const ok = await confirmAction({
      label: `Delete "${task.name}"? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    if (error) {
      showToast(error.message, 'error')
      return
    }
    setTasks(prev => prev.filter(t => t.id !== task.id))
    setExpandedId(prev => (prev === task.id ? null : prev))
    showToast('Task deleted.', 'success')
  }

  const summary = [
    `${counts.open} open`,
    counts.blocked > 0 ? `${counts.blocked} blocked` : null,
    counts.overdue > 0 ? `${counts.overdue} overdue` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="tk-root">
      <div>
        <h2 className="tk-heading">Tasks</h2>
      </div>

      <NewTaskPanel members={members} onCreate={create} />

      <div className="tk-panel tk-toolbar">
        <div className="tk-field">
          <label className="tk-label" htmlFor="filter-team">Team</label>
          <select
            id="filter-team"
            className="tk-select"
            value={filterTeam}
            onChange={e => setFilterTeam(e.target.value)}
          >
            <option value="">All teams</option>
            {TASK_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="tk-field">
          <label className="tk-label" htmlFor="filter-due">Due</label>
          <select
            id="filter-due"
            className="tk-select"
            value={filterDue}
            onChange={e => setFilterDue(e.target.value)}
          >
            {DUE_FILTERS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {filtersActive && (
          <button
            type="button"
            className="tk-btn tk-btn-sm"
            onClick={() => { setFilterTeam(''); setFilterDue('') }}
          >
            Clear
          </button>
        )}

        <span className="tk-summary">{summary}</span>
      </div>

      {loading ? (
        <p className="tk-loading">Loading tasks.</p>
      ) : groups.length === 0 ? (
        <div className="tk-panel tk-empty">
          {filtersActive ? 'No tasks match these filters.' : 'No tasks yet.'}
        </div>
      ) : (
        <div className="tk-groups">
          {groups.map(group => (
            <details className="tk-panel tk-group" key={group.status} open={group.status === 'open'}>
              <summary>
                {group.label}
                <span className="tk-group-count">{group.items.length}</span>
              </summary>
              <ul className="tk-list">
                {group.items.map(task => (
                  <AdminTaskRow
                    key={task.id}
                    task={task}
                    currentUserId={currentUserId}
                    members={members}
                    expanded={expandedId === task.id}
                    onToggle={() => setExpandedId(prev => (prev === task.id ? null : task.id))}
                    onSave={save}
                    onDelete={remove}
                    onSetClosed={setClosed}
                    busy={busyId === task.id}
                  />
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}

      {toast && (
        <div className="tk-toast" data-tone={toast.tone} role="status" aria-live="polite">
          {toast.text}
        </div>
      )}
    </div>
  )
}