'use client'
import { useState, useEffect, useMemo } from 'react'
import { useConfirm } from '../lib/ConfirmDialog'

const card       = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
const inputStyle = { width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box' }
const labelStyle = { display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }
const primaryBtn = (disabled) => ({ padding: '0.75rem 1.5rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', opacity: disabled ? 0.7 : 1 })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PAGE = 1000 // Supabase returns max 1000 rows per request

// Fetch every row of a query, 1000 at a time.
async function fetchAll(buildQuery) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

export default function Newsletter({ supabase, profile }) {
  const confirmAction = useConfirm()
  const [profileEmails, setProfileEmails] = useState([])   // from profiles.email
  const [newsRows, setNewsRows]           = useState([])   // newsletter_campaign rows
  const [loading, setLoading]             = useState(true)
  const [loadError, setLoadError]         = useState('')
  const [newEmail, setNewEmail]           = useState('')
  const [adding, setAdding]               = useState(false)
  const [toast, setToast]                 = useState(null)
  const [copied, setCopied]               = useState(false)

  function msg(text, type = 'success') { setToast({ text, type }); setTimeout(() => setToast(null), 3500) }

  async function audit(action, target_id, target_name, details) {
    try {
      await supabase.from('audit_logs').insert({
        admin_id:    profile.id,
        action,
        target_type: 'newsletter',
        target_id:   target_id ? String(target_id) : null,
        target_name: target_name || null,
        details:     details || null,
      })
    } catch (e) { console.error('audit failed:', e) }
  }

  async function load() {
    setLoading(true); setLoadError('')
    try {
      const [profs, news] = await Promise.all([
        fetchAll(() => supabase.from('profiles').select('email').not('email', 'is', null).order('email')),
        fetchAll(() => supabase.from('newsletter_campaign').select('id,email,status,source').order('email')),
      ])
      setProfileEmails(profs.map(p => String(p.email).trim()).filter(Boolean))
      setNewsRows(news)
    } catch (e) {
      setLoadError(e.message || 'Failed to load emails.')
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Join: all profile emails + all newsletter emails, minus anything marked removed.
  const list = useMemo(() => {
    const removed = new Set(newsRows.filter(r => r.status === 'removed').map(r => r.email.toLowerCase()))
    const map = new Map() // lowercase email -> { email, inProfiles, inNewsletter }
    for (const e of profileEmails) {
      const k = e.toLowerCase()
      if (removed.has(k)) continue
      map.set(k, { email: e, inProfiles: true, inNewsletter: false })
    }
    for (const r of newsRows) {
      if (r.status === 'removed') continue
      const k = r.email.toLowerCase()
      const cur = map.get(k)
      if (cur) cur.inNewsletter = true
      else map.set(k, { email: r.email, inProfiles: false, inNewsletter: true })
    }
    return [...map.values()].sort((a, b) => a.email.toLowerCase().localeCompare(b.email.toLowerCase()))
  }, [profileEmails, newsRows])

  const copyText = list.map(l => l.email).join(', ')

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch {
      msg('Copy failed — select the text box and copy manually.', 'error')
    }
  }

  // Add one or more emails (comma / space / newline separated). Re-adding a removed email re-subscribes it.
  async function addEmails() {
    const parts = [...new Set(newEmail.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean))]
    if (parts.length === 0) return
    const bad = parts.filter(e => !EMAIL_RE.test(e))
    if (bad.length) { msg(`Invalid email: ${bad[0]}`, 'error'); return }
    setAdding(true)
    const existingByEmail = new Map(newsRows.map(r => [r.email.toLowerCase(), r]))
    const now = new Date().toISOString()
    let added = 0
    for (const email of parts) {
      const row = existingByEmail.get(email)
      let error
      if (row) {
        if (row.status === 'subscribed') continue            // already on the list
        ;({ error } = await supabase.from('newsletter_campaign').update({ status: 'subscribed', source: 'admin_manual', updated_at: now }).eq('id', row.id))
      } else {
        ;({ error } = await supabase.from('newsletter_campaign').insert({ email, status: 'subscribed', source: 'admin_manual' }))
      }
      if (error) { msg(error.message, 'error'); continue }
      added++
      await audit('added_newsletter_email', row?.id, email, 'Added manually to newsletter list')
    }
    setAdding(false)
    setNewEmail('')
    if (added) msg(`Added ${added} email${added === 1 ? '' : 's'}`)
    else msg('Those emails are already on the list', 'error')
    load()
  }

  // Remove = upsert a row with status 'removed'. The join above filters it out,
  // so this works for profile emails and newsletter-only emails alike.
  async function removeEmail(item) {
    const ok = await confirmAction({
      label: `Remove ${item.email} from the newsletter list?`,
      confirmText: 'Remove', cancelText: 'Cancel', danger: true,
    })
    if (!ok) return
    const row = newsRows.find(r => r.email.toLowerCase() === item.email.toLowerCase())
    const now = new Date().toISOString()
    const { error } = row
      ? await supabase.from('newsletter_campaign').update({ status: 'removed', updated_at: now }).eq('id', row.id)
      : await supabase.from('newsletter_campaign').insert({ email: item.email.toLowerCase(), status: 'removed', source: 'admin_removed' })
    if (error) { msg(error.message, 'error'); return }
    await audit('removed_newsletter_email', row?.id, item.email, item.inProfiles ? 'Removed from newsletter list (volunteer profile email)' : 'Removed from newsletter list')
    msg('Removed')
    load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={card}>
        <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.5, maxWidth: '600px' }}>
          Combined list of every volunteer profile email plus everyone who signed up through the public form
          (<span style={{ fontFamily: 'DM Mono, monospace' }}>/newsletter</span>). Removed emails stay off the list.
        </p>
      </div>

      <div style={card}>
        <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Add Emails</h2>
        <label style={labelStyle}>Email(s) — separate multiple with commas or new lines</label>
        <textarea value={newEmail} onChange={e => setNewEmail(e.target.value)} rows={2} placeholder="name@example.com" style={{ ...inputStyle, resize: 'vertical' }} />
        <div style={{ marginTop: '1rem' }}>
          <button onClick={addEmails} disabled={adding || !newEmail.trim()} style={primaryBtn(adding || !newEmail.trim())}>{adding ? 'Adding...' : 'Add to List'}</button>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ fontWeight: 600 }}>Copy List{!loading && <span style={{ marginLeft: '0.5rem', color: 'var(--muted)', fontWeight: 400, fontSize: '0.85rem' }}>— {list.length} emails</span>}</h2>
          <button onClick={copyAll} disabled={loading || list.length === 0} style={primaryBtn(loading || list.length === 0)}>{copied ? 'Copied!' : 'Copy All'}</button>
        </div>
        {loadError ? <p style={{ color: '#ef4444', fontSize: '0.9rem' }}>{loadError}</p>
          : loading ? <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading...</p>
          : <textarea readOnly value={copyText} rows={5} onFocus={e => e.target.select()} style={{ ...inputStyle, fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', resize: 'vertical' }} />}
      </div>

      <div style={card}>
        <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Manage List</h2>
        {loading ? <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading...</p>
          : list.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No emails yet.</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {list.map(item => (
                <div key={item.email.toLowerCase()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.6rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', minWidth: 0 }}>
                    <span style={{ fontSize: '0.9rem', wordBreak: 'break-all' }}>{item.email}</span>
                    {item.inProfiles && <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.5rem', borderRadius: '100px', fontWeight: 600, background: '#60a5fa18', color: '#60a5fa', border: '1px solid #60a5fa44' }}>Profile</span>}
                    {item.inNewsletter && <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.5rem', borderRadius: '100px', fontWeight: 600, background: '#a78bfa18', color: '#a78bfa', border: '1px solid #a78bfa44' }}>Signup</span>}
                  </div>
                  <button onClick={() => removeEmail(item)} style={{ padding: '0.4rem 0.85rem', background: 'var(--surface)', color: '#ef4444', border: '1px solid #ef444455', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', flexShrink: 0 }}>Remove</button>
                </div>
              ))}
            </div>
          )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'error' ? '#ef4444' : '#3b82f6', color: '#fff', padding: '0.75rem 1.5rem', borderRadius: '100px', fontWeight: 500, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 100, fontFamily: 'DM Sans, sans-serif' }}>
          {toast.text}
        </div>
      )}
    </div>
  )
}