'use client'

import { useState, useEffect, useRef } from 'react'
import { ROLES } from '../lib/constants'

// ── Shared styles (matching admin page conventions) ───────────────────────────
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
const S = {
  card,
  input: {
    width: '100%',
    padding: '0.7rem 0.9rem',
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
    fontSize: '0.8rem',
    color: 'var(--muted)',
    marginBottom: '0.4rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
}

// Sizes a textarea once to fit its current content, floored at a minimum
// number of lines (matching its original `rows`), for browsers that don't
// support the native `field-sizing: content` CSS property.
function applyFallbackSizing(el, minLines) {
  const computed = window.getComputedStyle(el)
  const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2 || 20
  const paddingTop = parseFloat(computed.paddingTop) || 0
  const paddingBottom = parseFloat(computed.paddingBottom) || 0
  const minHeight = lineHeight * minLines + paddingTop + paddingBottom

  el.style.height = 'auto'
  const contentHeight = el.scrollHeight
  el.style.height = Math.max(contentHeight, minHeight) + 'px'
}

// ── Main component ────────────────────────────────────────────────────────────
// Role-based counterpart to WeeklyTraining: creates/edits the training material
// that new volunteers receive for a particular role. The content columns match
// weekly_trainings, but each row is identified by `role` instead of a week.
export default function RoleTrainings({
  supabase,
  profile,
  roles = ROLES,
  roleColumn = 'role',
}) {
  const roleList = roles?.length ? roles : ROLES

  const [selectedRole, setSelectedRole] = useState(() => roleList[0] || '')
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState(null)
  const [saved, setSaved]             = useState(false)

  const [recordId, setRecordId]                               = useState(null)
  const [roleoverview, setRoleoverview]                       = useState([''])
  const [traineeMaterial, setTraineeMaterial]                 = useState('')
  const [trainerRoleoverview, setTrainerRoleoverview]         = useState([''])
  const [trainerMaterial, setTrainerMaterial]                 = useState('')
  const [openRoles, setOpenRoles]                             = useState(new Set())

  // Auto size textboxes if browser supports it
  const [supportsFieldSizing] = useState(() =>
    typeof CSS !== 'undefined' && CSS.supports && CSS.supports('field-sizing', 'content')
  )
  const traineeMaterialRef   = useRef(null)
  const roleTextareaRefs     = useRef({})
  const roleRefFns           = useRef({})
  const trainerMaterialRef   = useRef(null)
  //  const roleTrainerTextareaRefs     = useRef({})
  //  const roleTrainerRefFns           = useRef({})

  // Vestigial code?
  function getRoleRefFn(role) {
    if (!roleRefFns.current[role]) {
      roleRefFns.current[role] = (el) => {
        if (el) {
          roleTextareaRefs.current[role] = el
          if (!supportsFieldSizing) applyFallbackSizing(el, 3)
        } else {
          delete roleTextareaRefs.current[role]
        }
      }
    }
    return roleRefFns.current[role]
  }

  useEffect(() => {
    if (loading || supportsFieldSizing) return
    if (traineeMaterialRef.current) applyFallbackSizing(traineeMaterialRef.current, 5)
    if (trainerMaterialRef.current) applyFallbackSizing(trainerMaterialRef.current, 5)
  }, [loading, supportsFieldSizing])

  // Keep the selected role valid if the caller supplies a custom role list.
  useEffect(() => {
    if (!roleList.includes(selectedRole)) setSelectedRole(roleList[0] || '')
  }, [roleList, selectedRole])

  // Load whatever exists for the selected role (or reset to blank)
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!supabase || !selectedRole) {
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      setSaved(false)
      const { data, error: err } = await supabase
        .from('volunteer_role_trainings')
        .select('*')
        .eq(roleColumn, selectedRole)
        .maybeSingle()
      if (cancelled) return
      if (err) {
        setError('Could not load training for this role.')
        setLoading(false)
        return
      }
      if (data) {
        setRecordId(data.id)
        setRoleoverview(data.roleoverview?.length ? data.roleoverview : [''])
        setTraineeMaterial(data.trainee_material || '')
        setTrainerRoleoverview(data.trainer_roleoverview?.length ? data.trainer_roleoverview : [''])
        setTrainerMaterial(data.trainer_material || '')
      } else {
        setRecordId(null)
        setRoleoverview([''])
        setTraineeMaterial('')
        setTrainerRoleoverview([''])
        setTrainerMaterial('')
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [selectedRole, supabase, roleColumn, roleList])

  function updateTrainerOverviewItem(idx, value) {
    setTrainerRoleoverview(prev => prev.map((a, i) => (i === idx ? value : a)))
  }
  function addTrainerOverviewItem() {
    setTrainerRoleoverview(prev => [...prev, ''])
  }
  function removeTrainerOverviewItem(idx) {
    setTrainerRoleoverview(prev => prev.length === 1 ? [''] : prev.filter((_, i) => i !== idx))
  }

  function updateOverviewItem(idx, value) {
    setRoleoverview(prev => prev.map((a, i) => (i === idx ? value : a)))
  }
  function addOverviewItem() {
    setRoleoverview(prev => [...prev, ''])
  }
  function removeOverviewItem(idx) {
    setRoleoverview(prev => prev.length === 1 ? [''] : prev.filter((_, i) => i !== idx))
  }

  function toggleRole(role) {
    setOpenRoles(prev => {
      const next = new Set(prev)
      next.has(role) ? next.delete(role) : next.add(role)
      return next
    })
  }

  async function handleSave() {
    if (!supabase || !selectedRole) return

    setSaving(true)
    setError(null)
    setSaved(false)

    const cleanedRoleoverview = roleoverview.map(a => a.trim()).filter(Boolean)
    const cleanedTrainerRoleoverview = trainerRoleoverview.map(a => a.trim()).filter(Boolean)

    const row = {
      [roleColumn]:           selectedRole,
      roleoverview:           cleanedRoleoverview,
      trainer_roleoverview:   cleanedTrainerRoleoverview,
      trainee_material:       traineeMaterial.trim() || null,
      trainer_material:       trainerMaterial.trim() || null,
      updated_at:             new Date().toISOString(),
      updated_by:             profile?.id || null,
      ...(recordId ? {} : { created_by: profile?.id || null }),
    }

    const query = recordId
      ? supabase.from('volunteer_role_trainings').update(row).eq('id', recordId).select().single()
      : supabase.from('volunteer_role_trainings').insert(row).select().single()
    const { data, error: err } = await query

    if (err) {
      setError('Something went wrong saving this training. Please try again.')
      setSaving(false)
      return
    }

    setRecordId(data.id)
    setSaving(false)
    setSaved(true)
  }


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Role selector */}
      <div style={card}>
        <p style={{ ...S.label, marginBottom: '0.75rem' }}>Role</p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.9rem' }}>
          <select
            aria-label="Select the role to create training for"
            value={selectedRole}
            onChange={e => setSelectedRole(e.target.value)}
            style={{ ...S.input, flex: '1 1 260px', maxWidth: '400px' }}
          >
            {roleList.map(role => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </div>
        <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>
          Training for {selectedRole}
        </p>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.3rem' }}>
          {recordId
            ? 'Editing the existing training for this role.'
            : 'No training has been set for this role yet.'}
        </p>
      </div>

      {loading ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>Loading…</div>
      ) : (
        <>
          {/* Roleoverview */}
          {/*<div style={card}>
            <p style={{ ...S.label, marginBottom: '0.75rem' }}>Roleoverview</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {roleoverview.map((a, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    value={a}
                    onChange={e => updateOverviewItem(idx, e.target.value)}
                    placeholder="Overview Item"
                    style={S.input}
                  />
                  <button
                    onClick={() => removeOverviewItem(idx)}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0 0.8rem', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addOyverviewItem}
              style={{ marginTop: '0.6rem', background: 'none', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.5rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'DM Sans, sans-serif' }}
            >
              + Add overview item
            </button>
          </div> */}

          {/* Trainee material */}
          <div style={card}>
            <label style={{ ...S.label, marginBottom: '0.5rem' }}>Trainee Material</label>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
              The main training material new {selectedRole} volunteers will see.
            </p>
            <textarea
              ref={traineeMaterialRef}
              value={traineeMaterial}
              onChange={e => setTraineeMaterial(e.target.value)}
              rows={5}
              placeholder={`Training material for new ${selectedRole} volunteers…`}
              style={{ ...S.input, resize: supportsFieldSizing ? 'none' : 'vertical', overflowY: 'auto', overflowX: 'hidden', fieldSizing: 'content', minBlockSize: '5lh', lineHeight: 1.55 }}
            />
          </div>

          {/* Trainer Roleoverview */}
          {/*<div style={card}>
            <p style={{ ...S.label, marginBottom: '0.75rem' }}>Trainer Roleoverview</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {trainerRoleoverview.map((a, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    value={a}
                    onChange={e => updateTrainerOverviewItem(idx, e.target.value)}
                    placeholder="Overview Item"
                    style={S.input}
                  />
                  <button
                    onClick={() => removeTrainerOverviewItem(idx)}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0 0.8rem', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addTrainerOverviewItem}
              style={{ marginTop: '0.6rem', background: 'none', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.5rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'DM Sans, sans-serif' }}
            >
              + Add overview item
            </button>
            </div>*/}

          {/* Trainer material */}
          <div style={card}>
            <label style={{ ...S.label, marginBottom: '0.5rem' }}>Trainer Material</label>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
              The main material the trainers assigned to trainees in {selectedRole} will see.
            </p>
            <textarea
              ref={trainerMaterialRef}
              value={trainerMaterial}
              onChange={e => setTrainerMaterial(e.target.value)}
              rows={5}
              placeholder={`Training material for ${selectedRole} trainers…`}
              style={{ ...S.input, resize: supportsFieldSizing ? 'none' : 'vertical', overflowY: 'auto', overflowX: 'hidden', fieldSizing: 'content', minBlockSize: '5lh', lineHeight: 1.55 }}
            />
          </div>

          {/* Error / save */}
          {error && <p style={{ fontSize: '0.85rem', color: 'var(--danger)', textAlign: 'center' }}>{error}</p>}
          {saved && !error && <p style={{ fontSize: '0.85rem', color: 'var(--accent)', textAlign: 'center' }}>Saved — trainers new volunteers in this role will see this training.</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '0.95rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '10px',
              fontWeight: 600, fontSize: '1rem', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : recordId ? 'Update Training' : 'Set Training'}
          </button>
        </>
      )}
    </div>
  )
}
