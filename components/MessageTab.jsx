'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { MessageCard } from './MessageCard'

const MSG_PAGE_SIZE = 10
const BROADCAST_TYPES = ['everyone', 'role', 'shift']

// ── Shared style tokens (mirror page.js S object) ─────────────────────────────
const S = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '1.5rem',
  },
  input: {
    width: '100%',
    padding: '0.75rem 1rem',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text)',
    fontSize: '0.95rem',
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

// ── ViewCountBadge (broadcast read count) ─────────────────────────────────────
function ViewCountBadge({ message, broadcastReadCounts }) {
  if (!BROADCAST_TYPES.includes(message?.recipient_type)) return null
  const count = broadcastReadCounts[message.id] ?? null
  return (
    <span
      title={count === null ? 'Loading views…' : `${count} ${count === 1 ? 'person has' : 'people have'} read this`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
        fontSize: '0.72rem', fontWeight: 500, color: 'var(--muted)',
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: '100px', padding: '0.15rem 0.55rem', marginTop: '0.35rem',
        fontFamily: 'DM Mono, monospace', letterSpacing: '0.01em',
        userSelect: 'none', whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
        <path d="M1 10s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" />
        <circle cx="10" cy="10" r="2.5" />
      </svg>
      {count === null ? '…' : count}
    </span>
  )
}

// ── ReplyThread: renders a single top-level message + its replies ─────────────
function ReplyThread({
  message,
  replies,
  user,
  profile,
  supabase,
  showToast,
  readMessageIds,
  broadcastReadCounts,
  setLightboxUrl,
  allUsers,
  onReplySent,
  senderLabel,
}) {
  const [replyOpen, setReplyOpen]   = useState(false)
  const [replyBody, setReplyBody]   = useState('')
  const [sending, setSending]       = useState(false)

  // Who can reply:
  //   - Any admin (role === 'admin') can reply to admin-directed messages
  //   - The original sender can reply to any admin response in their thread
  const isAdmin        = profile?.role === 'admin'
  const isThreadSender = message.sender_id === user?.id
  const canReply       = message.recipient_type === 'admin' && (isAdmin || isThreadSender)

  async function handleSendReply() {
    if (!replyBody.trim()) return
    setSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          recipient_type: 'admin',
          body: replyBody.trim(),
          image_url: null,
          parent_message_id: message.id,
          // Route back to the original sender if admin is replying
          recipient_volunteer_id: isAdmin && !isThreadSender ? message.sender_id : null,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        showToast(result.error || 'Failed to send reply', 'error')
      } else {
        showToast('Reply sent!', 'success')
        setReplyBody('')
        setReplyOpen(false)
        onReplySent()
      }
    } catch (err) {
      showToast(err.message || 'Failed to send reply', 'error')
    } finally {
      setSending(false)
    }
  }

  const hasReplies = replies.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      {/* ── Original message ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <MessageCard
          m={message}
          readMessageIds={readMessageIds}
          user={user}
          setLightboxUrl={setLightboxUrl}
          senderLabel={senderLabel}
        />
        {BROADCAST_TYPES.includes(message?.recipient_type) && (
          <div style={{ paddingLeft: '0.25rem' }}>
            <ViewCountBadge message={message} broadcastReadCounts={broadcastReadCounts} />
          </div>
        )}
      </div>

      {/* ── Threaded replies ── */}
      {hasReplies && (
        <div style={{
          marginTop: '0.5rem',
          marginLeft: '1rem',
          paddingLeft: '0.875rem',
          borderLeft: '2px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}>
          {replies.map(reply => {
            const replyIsAdmin = reply.sender?.role === 'admin' ||
              // fall back to checking if the sender name matches an admin — 
              // MessageCard only gets sender.full_name, so we tag the label
              false
            return (
              <div key={reply.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                {/* Admin-replied indicator pill */}
                {reply.sender_id !== message.sender_id && (
                  <span style={{
                    alignSelf: 'flex-start',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--accent)',
                    background: 'rgba(2,65,107,0.08)',
                    border: '1px solid rgba(2,65,107,0.2)',
                    borderRadius: '100px',
                    padding: '0.1rem 0.5rem',
                    marginBottom: '0.1rem',
                  }}>
                    Admin replied
                  </span>
                )}
                <MessageCard
                  m={reply}
                  readMessageIds={readMessageIds}
                  user={user}
                  setLightboxUrl={setLightboxUrl}
                />
              </div>
            )
          })}
        </div>
      )}

      {/* ── Reply composer ── */}
      {canReply && (
        <div style={{
          marginTop: '0.5rem',
          marginLeft: hasReplies ? '1rem' : '0',
          paddingLeft: hasReplies ? '0.875rem' : '0',
          borderLeft: hasReplies ? '2px solid var(--border)' : 'none',
        }}>
          {!replyOpen ? (
            <button
              onClick={() => setReplyOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.3rem 0.75rem',
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: '100px',
                color: 'var(--muted)',
                fontSize: '0.78rem',
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 14 4 9 9 4" />
                <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
              </svg>
              {hasReplies ? 'Reply again' : 'Reply'}
            </button>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              padding: '0.75rem',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
            }}>
              <textarea
                autoFocus
                value={replyBody}
                onChange={e => setReplyBody(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSendReply()
                  if (e.key === 'Escape') { setReplyOpen(false); setReplyBody('') }
                }}
                placeholder="Write a reply… (⌘↵ to send)"
                rows={2}
                style={{
                  ...S.input,
                  resize: 'vertical',
                  fontSize: '0.88rem',
                  padding: '0.6rem 0.75rem',
                }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setReplyOpen(false); setReplyBody('') }}
                  style={{
                    padding: '0.4rem 0.85rem',
                    background: 'none',
                    border: '1px solid var(--border)',
                    borderRadius: '7px',
                    color: 'var(--muted)',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendReply}
                  disabled={sending || !replyBody.trim()}
                  style={{
                    padding: '0.4rem 0.85rem',
                    background: 'var(--accent)',
                    border: 'none',
                    borderRadius: '7px',
                    color: '#fff',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: (sending || !replyBody.trim()) ? 'not-allowed' : 'pointer',
                    opacity: !replyBody.trim() ? 0.5 : 1,
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main MessageTab export ─────────────────────────────────────────────────────
export function MessageTab({
  user,
  profile,
  supabase,
  showToast,
  isMobile,
  allUsers: allUsersProp = [],
  getInboxMessages,
  MAX_FILE_SIZE,
  schedule = [],
}) {
  // ── Local state ────────────────────────────────────────────────────────────
  const [messages, setMessages]               = useState([])
  const [msgCursor, setMsgCursor]             = useState(null)
  const [hasMoreMsgs, setHasMoreMsgs]         = useState(false)
  const [loadingMoreMsgs, setLoadingMoreMsgs] = useState(false)
  const [readMessageIds, setReadMessageIds]   = useState(new Set())
  const [broadcastReadCounts, setBroadcastReadCounts] = useState({})
  const [allUsers, setAllUsers]               = useState(allUsersProp)
  const [lightboxUrl, setLightboxUrl]         = useState(null)

  // Compose state
  const [msgView, setMsgView]                 = useState('inbox')
  const [msgBody, setMsgBody]                 = useState('')
  const [msgRecipientType, setMsgRecipientType] = useState('admin')
  const [msgSelectedShift, setMsgSelectedShift] = useState(null)
  const [msgSelectedRole, setMsgSelectedRole]   = useState(null)
  const [msgRecipientVolId, setMsgRecipientVolId] = useState('')
  const [sendingMsg, setSendingMsg]           = useState(false)
  const [msgImageFile, setMsgImageFile]       = useState(null)
  const [msgImagePreview, setMsgImagePreview] = useState(null)
  const [uploadingImage, setUploadingImage]   = useState(false)
  const [comboQuery, setComboQuery]           = useState('')
  const [comboOpen, setComboOpen]             = useState(false)
  const fileInputRef = useRef(null)
  const comboRef     = useRef(null)

  const isAdmin = profile?.role === 'admin'

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (user) fetchMessages()
    function handleMouseDown(e) {
      if (comboRef.current && !comboRef.current.contains(e.target)) setComboOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [user])

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    if (!user) return

    const [{ data: msgs }, { data: reads }, { data: usersData }] = await Promise.all([
      // Fetch top-level messages AND their replies in one query.
      // We fetch all messages and group client-side for simplicity.
      supabase
        .from('messages')
        .select(`
          id, created_at, body, image_url,
          recipient_type, recipient_shift, recipient_day, recipient_role,
          recipient_volunteer_id, sender_id, parent_message_id,
          sender:profiles!messages_sender_id_fkey(full_name, role)
        `)
        .order('created_at', { ascending: false })
        .limit(MSG_PAGE_SIZE * 2), // fetch extra to account for reply rows
      supabase
        .from('message_reads')
        .select('message_id')
        .eq('user_id', user.id),
      supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name'),
    ])

    const fetched = msgs || []
    setMessages(fetched)

    // Cursor = oldest top-level message fetched
    const topLevel = fetched.filter(m => !m.parent_message_id)
    setHasMoreMsgs(topLevel.length >= MSG_PAGE_SIZE)
    if (topLevel.length > 0) {
      setMsgCursor(topLevel[topLevel.length - 1].created_at)
    }

    const readSet = new Set((reads || []).map(r => r.message_id))
    setReadMessageIds(readSet)
    setAllUsers(usersData || [])
    await loadBroadcastReadCounts(fetched)

    // Mark unread messages as read
    const unreadIds = fetched
      .filter(m => m.sender_id !== user.id && !readSet.has(m.id))
      .map(m => m.id)
    if (unreadIds.length > 0) {
      const rows = unreadIds.map(id => ({ user_id: user.id, message_id: id }))
      await supabase.from('message_reads').upsert(rows, { onConflict: 'user_id,message_id' })
      setReadMessageIds(prev => {
        const next = new Set(prev)
        unreadIds.forEach(id => next.add(id))
        return next
      })
    }
  }, [user, supabase])

  async function loadMoreMessages() {
    if (!user || !msgCursor || loadingMoreMsgs) return
    setLoadingMoreMsgs(true)
    const { data: older } = await supabase
      .from('messages')
      .select(`
        id, created_at, body, image_url,
        recipient_type, recipient_shift, recipient_day, recipient_role,
        recipient_volunteer_id, sender_id, parent_message_id,
        sender:profiles!messages_sender_id_fkey(full_name, role)
      `)
      .order('created_at', { ascending: false })
      .lt('created_at', msgCursor)
      .limit(MSG_PAGE_SIZE * 2)

    const fetched = older || []
    setMessages(prev => {
      const existingIds = new Set(prev.map(m => m.id))
      return [...prev, ...fetched.filter(m => !existingIds.has(m.id))]
    })
    const topLevel = fetched.filter(m => !m.parent_message_id)
    setHasMoreMsgs(topLevel.length >= MSG_PAGE_SIZE)
    if (topLevel.length > 0) setMsgCursor(topLevel[topLevel.length - 1].created_at)
    if (fetched.length > 0) await loadBroadcastReadCounts(fetched)
    setLoadingMoreMsgs(false)
  }

  async function loadBroadcastReadCounts(msgs) {
    const broadcastIds = (msgs || [])
      .filter(m => BROADCAST_TYPES.includes(m.recipient_type))
      .map(m => m.id)
    if (broadcastIds.length === 0) return
    const { data, error } = await supabase.rpc('get_broadcast_read_counts', { message_ids: broadcastIds })
    if (error) {
      const { data: fallback } = await supabase
        .from('message_read_counts')
        .select('message_id, read_count')
        .in('message_id', broadcastIds)
      const map = {}
      ;(fallback || []).forEach(r => { map[r.message_id] = Number(r.read_count) })
      setBroadcastReadCounts(prev => ({ ...prev, ...map }))
      return
    }
    const map = {}
    ;(data || []).forEach(r => { map[r.message_id] = Number(r.read_count) })
    setBroadcastReadCounts(prev => ({ ...prev, ...map }))
  }

  // ── Thread grouping ────────────────────────────────────────────────────────
  // Returns top-level messages with their replies keyed by parent id
  function buildThreadMap(msgs) {
    const topLevel = msgs.filter(m => !m.parent_message_id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const repliesMap = {}
    msgs
      .filter(m => m.parent_message_id)
      .forEach(r => {
        if (!repliesMap[r.parent_message_id]) repliesMap[r.parent_message_id] = []
        repliesMap[r.parent_message_id].push(r)
      })
    // Sort each reply thread oldest-first
    Object.keys(repliesMap).forEach(k => {
      repliesMap[k].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    })
    return { topLevel, repliesMap }
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const inboxMessages = user && profile && getInboxMessages
    ? getInboxMessages(messages.filter(m => !m.parent_message_id), user, profile)
    : messages.filter(m => !m.parent_message_id && m.sender_id !== user?.id)

  const sentMessages = messages.filter(m => m.sender_id === user?.id && !m.parent_message_id)

  const { topLevel: inboxTopLevel, repliesMap: inboxRepliesMap } = buildThreadMap(
    // For inbox: show all top-level messages the user received + sent top-levels that got replies
    messages
  )

  // Inbox threads: messages sent to this user (or admin) that are top-level
  const inboxThreads = inboxTopLevel.filter(m => {
    if (m.sender_id === user?.id) {
      // Only show own sent messages in inbox if they have replies
      return (inboxRepliesMap[m.id] || []).length > 0
    }
    return true
  }).filter(m => {
    // Apply the same inbox filter as getInboxMessages would
    if (!getInboxMessages) return true
    return inboxMessages.find(im => im.id === m.id) || (inboxRepliesMap[m.id] || []).length > 0
  })

  const recentRecipients = sentMessages
    .filter(m => m.recipient_type === 'volunteer' && m.recipient_volunteer_id)
    .map(m => m.recipient_volunteer_id)
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .slice(0, 4)
    .map(id => allUsers.find(u => u.id === id))
    .filter(Boolean)

  const comboResults = (() => {
    const q = comboQuery.trim().toLowerCase()
    const baseList = allUsers.filter(u => u.id !== user?.id)
    if (q.length === 0) {
      const recentIds = new Set(recentRecipients.map(u => u.id))
      const rest = baseList.filter(u => !recentIds.has(u.id))
      return [...recentRecipients, ...rest].slice(0, 20)
    }
    const startsWith = baseList.filter(u => u.full_name.toLowerCase().startsWith(q))
    const midString  = baseList.filter(u =>
      !u.full_name.toLowerCase().startsWith(q) && u.full_name.toLowerCase().includes(q)
    )
    return [...startsWith, ...midString].slice(0, 20)
  })()

  const myShiftCombos = schedule.reduce((acc, s) => {
    const key = `${s.day_of_week}|${s.shift_time}`
    if (!acc.find(x => x.key === key)) {
      acc.push({ key, day: s.day_of_week, shift_time: s.shift_time, label: `${s.day_of_week.charAt(0).toUpperCase() + s.day_of_week.slice(1, 3)} ${s.shift_time}` })
    }
    return acc
  }, [])

  const myRoles = [...new Set([
    ...schedule.filter(s => s.volunteer_id === user?.id).map(s => s.role).filter(Boolean),
  ])]

  // ── Image helpers ──────────────────────────────────────────────────────────
  function handleImageSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (MAX_FILE_SIZE && file.size > MAX_FILE_SIZE) { showToast('Image must be under 5 MB', 'error'); return }
    setMsgImageFile(file)
    setMsgImagePreview(URL.createObjectURL(file))
  }

  function clearImage() {
    setMsgImageFile(null)
    setMsgImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function selectRecipient(vol) {
    setMsgRecipientVolId(vol.id)
    setComboQuery(vol.full_name)
    setComboOpen(false)
  }

  async function uploadImage(userId) {
    if (!msgImageFile) return null
    setUploadingImage(true)
    const ext = msgImageFile.name.split('.').pop()
    const path = `${userId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('message-images')
      .upload(path, msgImageFile, { contentType: msgImageFile.type, upsert: false })
    setUploadingImage(false)
    if (error) { showToast('Image upload failed: ' + error.message, 'error'); return null }
    const { data: { publicUrl } } = supabase.storage.from('message-images').getPublicUrl(path)
    return publicUrl
  }

  // ── Send new top-level message ─────────────────────────────────────────────
  async function handleSendMessage(e) {
    e.preventDefault()
    if (!msgBody.trim() && !msgImageFile) return
    setSendingMsg(true)

    const imageUrl = await uploadImage(user.id)
    if (msgImageFile && !imageUrl) { setSendingMsg(false); return }

    const recipientType = msgRecipientType === 'user' ? 'volunteer' : msgRecipientType
    const { data: { session } } = await supabase.auth.getSession()

    const res = await fetch('/api/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({
        recipient_type: recipientType,
        body: msgBody.trim(),
        image_url: imageUrl || null,
        recipient_shift:        msgRecipientType === 'shift' ? (msgSelectedShift?.shift_time || null) : null,
        recipient_day:          msgRecipientType === 'shift' ? (msgSelectedShift?.day || null) : null,
        recipient_role:         msgRecipientType === 'role'  ? (msgSelectedRole || null) : null,
        recipient_volunteer_id: recipientType === 'volunteer' ? (msgRecipientVolId || null) : null,
        parent_message_id: null, // always null for new top-level compose
      }),
    })

    const result = await res.json()
    if (!res.ok) {
      showToast(result.error || 'Failed to send', 'error')
    } else {
      showToast('Message sent!', 'success')
      setMsgBody('')
      clearImage()
      setMsgRecipientType('admin')
      setMsgSelectedShift(null)
      setMsgSelectedRole(null)
      setMsgRecipientVolId('')
      setComboQuery('')
      setComboOpen(false)
      setMessages([])
      setMsgCursor(null)
      setHasMoreMsgs(false)
      await fetchMessages()
      setMsgView('inbox')
    }
    setSendingMsg(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* View switcher */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {[['inbox', 'Inbox'], ['sent', 'Sent'], ['compose', 'Compose']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMsgView(key)}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif',
              background: msgView === key ? 'var(--accent)' : 'var(--surface)',
              color:      msgView === key ? '#fff' : 'var(--muted)',
              border:     msgView === key ? 'none' : '1px solid var(--border)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── INBOX ── */}
      {msgView === 'inbox' && (
        <div style={S.card}>
          <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Inbox</h2>
          {inboxThreads.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No messages yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {inboxThreads.map(m => (
                <ReplyThread
                  key={m.id}
                  message={m}
                  replies={inboxRepliesMap[m.id] || []}
                  user={user}
                  profile={profile}
                  supabase={supabase}
                  showToast={showToast}
                  readMessageIds={readMessageIds}
                  broadcastReadCounts={broadcastReadCounts}
                  setLightboxUrl={setLightboxUrl}
                  allUsers={allUsers}
                  onReplySent={fetchMessages}
                />
              ))}
            </div>
          )}
          {hasMoreMsgs && (
            <button
              onClick={loadMoreMessages}
              disabled={loadingMoreMsgs}
              style={{
                marginTop: '1rem', width: '100%', padding: '0.65rem',
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: '8px', color: 'var(--muted)',
                cursor: loadingMoreMsgs ? 'not-allowed' : 'pointer',
                fontSize: '0.85rem', fontFamily: 'DM Sans, sans-serif',
              }}
            >
              {loadingMoreMsgs ? 'Loading…' : 'Load older messages'}
            </button>
          )}
        </div>
      )}

      {/* ── SENT ── */}
      {msgView === 'sent' && (
        <div style={S.card}>
          <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Sent Messages</h2>
          {sentMessages.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No sent messages yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {sentMessages.map(m => {
                const toLabel =
                  m.recipient_type === 'everyone' ? 'To: Everyone' :
                  m.recipient_type === 'admin'    ? 'To: Admin' :
                  m.recipient_type === 'shift'    ? `To: ${m.recipient_day ? m.recipient_day.charAt(0).toUpperCase() + m.recipient_day.slice(1, 3) : ''} ${m.recipient_shift || ''}`.trim() :
                  m.recipient_type === 'role'     ? `To: ${m.recipient_role}` :
                  m.recipient_type === 'volunteer'? `To: ${allUsers.find(u => u.id === m.recipient_volunteer_id)?.full_name || 'Individual'}` :
                  'To: ' + m.recipient_type
                return (
                  <ReplyThread
                    key={m.id}
                    message={m}
                    replies={inboxRepliesMap[m.id] || []}
                    user={user}
                    profile={profile}
                    supabase={supabase}
                    showToast={showToast}
                    readMessageIds={readMessageIds}
                    broadcastReadCounts={broadcastReadCounts}
                    setLightboxUrl={setLightboxUrl}
                    allUsers={allUsers}
                    onReplySent={fetchMessages}
                    senderLabel={toLabel}
                  />
                )
              })}
            </div>
          )}
          {hasMoreMsgs && (
            <button
              onClick={loadMoreMessages}
              disabled={loadingMoreMsgs}
              style={{
                marginTop: '1rem', width: '100%', padding: '0.65rem',
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: '8px', color: 'var(--muted)',
                cursor: loadingMoreMsgs ? 'not-allowed' : 'pointer',
                fontSize: '0.85rem', fontFamily: 'DM Sans, sans-serif',
              }}
            >
              {loadingMoreMsgs ? 'Loading…' : 'Load older messages'}
            </button>
          )}
        </div>
      )}

      {/* ── COMPOSE ── */}
      {msgView === 'compose' && (
        <div style={S.card}>
          <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>New Message</h2>
          <form onSubmit={handleSendMessage} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={S.label}>Send to</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {[
                  { value: 'admin',    label: 'Admin' },
                  { value: 'everyone', label: 'Everyone' },
                  ...(myShiftCombos.length > 0 ? [{ value: 'shift', label: 'My Shift' }] : []),
                  ...(myRoles.length > 0       ? [{ value: 'role',  label: 'My Role'  }] : []),
                  { value: 'user', label: 'Individual' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setMsgRecipientType(opt.value)
                      setMsgSelectedShift(null)
                      setMsgSelectedRole(null)
                      setMsgRecipientVolId('')
                      setComboQuery('')
                      setComboOpen(false)
                    }}
                    style={{
                      padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.85rem',
                      fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                      background: msgRecipientType === opt.value ? 'var(--accent)' : 'var(--surface)',
                      color:      msgRecipientType === opt.value ? '#fff' : 'var(--muted)',
                      border:     msgRecipientType === opt.value ? 'none' : '1px solid var(--border)',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Shift sub-selector */}
              {msgRecipientType === 'shift' && myShiftCombos.length > 0 && (
                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {myShiftCombos.map(s => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setMsgSelectedShift(s)}
                      style={{
                        padding: '0.35rem 0.75rem', borderRadius: '8px', fontSize: '0.82rem',
                        cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                        background: msgSelectedShift?.key === s.key ? 'var(--accent)' : 'var(--bg)',
                        color:      msgSelectedShift?.key === s.key ? '#fff' : 'var(--muted)',
                        border:     msgSelectedShift?.key === s.key ? 'none' : '1px solid var(--border)',
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Role sub-selector */}
              {msgRecipientType === 'role' && myRoles.length > 0 && (
                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {myRoles.map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setMsgSelectedRole(r)}
                      style={{
                        padding: '0.35rem 0.75rem', borderRadius: '8px', fontSize: '0.82rem',
                        cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                        background: msgSelectedRole === r ? 'var(--accent)' : 'var(--bg)',
                        color:      msgSelectedRole === r ? '#fff' : 'var(--muted)',
                        border:     msgSelectedRole === r ? 'none' : '1px solid var(--border)',
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}

              {/* Individual user selector */}
              {msgRecipientType === 'user' && (
                <div style={{ marginTop: '0.75rem' }} ref={comboRef}>
                  <label style={S.label}>Select user</label>
                  {isMobile ? (
                    <>
                      <button
                        type="button"
                        onClick={() => { setComboOpen(true); setComboQuery('') }}
                        style={{ ...S.input, textAlign: 'left', cursor: 'pointer', color: msgRecipientVolId ? 'var(--text)' : 'var(--muted)' }}
                      >
                        {msgRecipientVolId ? allUsers.find(u => u.id === msgRecipientVolId)?.full_name : 'Tap to select recipient…'}
                      </button>
                      {comboOpen && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                          <div style={{ background: 'var(--surface)', borderRadius: '16px 16px 0 0', maxHeight: '60vh', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem 0.75rem', borderBottom: '1px solid var(--border)' }}>
                              <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Select recipient</span>
                              <button type="button" onClick={() => setComboOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1.2rem' }}>✕</button>
                            </div>
                            <input
                              autoFocus
                              type="text"
                              value={comboQuery}
                              onChange={e => setComboQuery(e.target.value)}
                              placeholder="Search…"
                              style={{ ...S.input, borderRadius: 0, border: 'none', borderBottom: '1px solid var(--border)', padding: '0.75rem 1.25rem' }}
                            />
                            <div style={{ overflowY: 'auto', flex: 1 }}>
                              {comboResults.map(vol => (
                                <button
                                  key={vol.id}
                                  type="button"
                                  onClick={() => selectRecipient(vol)}
                                  style={{ width: '100%', padding: '0.75rem 1.25rem', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text)', fontFamily: 'DM Sans, sans-serif', borderBottom: '1px solid var(--border)' }}
                                >
                                  {vol.full_name}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        value={comboQuery}
                        onChange={e => { setComboQuery(e.target.value); setComboOpen(true); setMsgRecipientVolId('') }}
                        onFocus={() => setComboOpen(true)}
                        placeholder="Search by name…"
                        style={S.input}
                      />
                      {comboOpen && comboResults.length > 0 && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', zIndex: 100, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
                          {comboResults.map(vol => (
                            <button
                              key={vol.id}
                              type="button"
                              onMouseDown={e => { e.preventDefault(); selectRecipient(vol) }}
                              style={{ width: '100%', padding: '0.6rem 1rem', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer', fontSize: '0.88rem', color: 'var(--text)', fontFamily: 'DM Sans, sans-serif' }}
                            >
                              {vol.full_name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Message body */}
            <div>
              <label style={S.label}>Message</label>
              <textarea
                value={msgBody}
                onChange={e => setMsgBody(e.target.value)}
                rows={4}
                placeholder="Write your message…"
                style={{ ...S.input, resize: 'vertical' }}
              />
            </div>

            {/* Image attachment */}
            <div>
              <label style={S.label}>Attach image (optional)</label>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} />
              {!msgImagePreview ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ ...S.input, cursor: 'pointer', color: 'var(--muted)', textAlign: 'left' }}
                >
                  Choose image…
                </button>
              ) : (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img src={msgImagePreview} alt="Preview" style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px', border: '1px solid var(--border)' }} />
                  <button
                    type="button"
                    onClick={clearImage}
                    style={{ position: 'absolute', top: '0.35rem', right: '0.35rem', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', color: '#fff', width: '24px', height: '24px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={sendingMsg || uploadingImage || (!msgBody.trim() && !msgImageFile) || (msgRecipientType === 'user' && !msgRecipientVolId) || (msgRecipientType === 'shift' && !msgSelectedShift) || (msgRecipientType === 'role' && !msgSelectedRole)}
              style={{
                padding: '0.85rem',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: sendingMsg || uploadingImage ? 'not-allowed' : 'pointer',
                fontFamily: 'DM Sans, sans-serif',
                opacity: (!msgBody.trim() && !msgImageFile) ? 0.5 : 1,
              }}
            >
              {uploadingImage ? 'Uploading image…' : sendingMsg ? 'Sending…' : 'Send Message'}
            </button>
          </form>
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1.5rem', cursor: 'zoom-out' }}
        >
          <img
            src={lightboxUrl}
            alt="Full size"
            style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: '10px', objectFit: 'contain', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            style={{ position: 'fixed', top: '1rem', right: '1rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%', color: '#fff', width: '36px', height: '36px', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
