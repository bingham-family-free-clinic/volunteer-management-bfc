'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { MessageCard } from './MessageCard'
import { formatDateTime } from '../lib/timeUtils'
import { ROLES } from '../lib/constants'
import { recipientLabel, parseGroupMemberIds } from '../lib/messageUtils'

const MSG_PAGE_SIZE = 10
const BROADCAST_TYPES = ['everyone', 'role', 'shift']

// Typing indicator tuning
const TYPING_THROTTLE_MS = 1500 // min gap between "typing: true" sends
const TYPING_IDLE_MS = 7000     // no keystrokes for this long → send "typing: false"
const TYPING_TTL_MS = 9000      // receiver drops a typer after this long without refresh

// Refreshes Supabase token if expired, missing, or about to expire
async function getFreshAccessToken(supabase) {
  let { data: { session } } = await supabase.auth.getSession()

  const EXPIRY_BUFFER_SECONDS = 30
  const isExpiredOrExpiring =
    !session ||
    !session.expires_at ||
    session.expires_at - Date.now() / 1000 < EXPIRY_BUFFER_SECONDS

  if (isExpiredOrExpiring) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    session = refreshed?.session ?? null
  }

  if (!session?.access_token) {
    throw new Error('Session expired. Refresh the page or sign out and sign in again.')
  }

  return session.access_token
}

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

// ── ReplyThread: renders a single top-level message + its replies ─────────────
function ReplyThread({
  message,
  replies,
  user,
  profile,
  supabase,
  showToast,
  readMessageIds,
  setLightboxUrl,
  allUsers,
  onReplySent,
  onMarkRead,
  senderLabel,
  collapsedLabel,
  startExpanded = false,
  previewMessage,
}) {
  const isUnread = readMessageIds && (
    // Received message not yet read
    (!readMessageIds.has(message.id) && message.sender_id !== user?.id) ||
    // Thread has an unread reply from someone else — regardless of who started the thread
    replies.some(r => !readMessageIds.has(r.id) && r.sender_id !== user?.id)
  )
  const [expanded, setExpanded]     = useState(startExpanded)
  // Sync expanded with startExpanded so deep-linked threads expand
  // even if MessageTab mounts before openMessageId is set
  useEffect(() => { setExpanded(startExpanded) }, [startExpanded])
  const [replyOpen, setReplyOpen]   = useState(false)
  const [replyBody, setReplyBody]   = useState('')
  const [sending, setSending]       = useState(false)
  const [replyToId, setReplyToId]     = useState(null)
  const [isReplyAll, setIsReplyAll]   = useState(false)
  const [followUpId, setFollowUpId]   = useState(null)
  const [locallyHighlightedReplies, setLocallyHighlightedReplies] = useState(new Set())

  const isGroupMessageSender = message.sender_id === user?.id && message.recipient_type !== 'volunteer'
  const isGroupThread = message.recipient_type === 'group'
  const isDirectThread = message.recipient_type === 'volunteer'
  // In a 1-on-1 thread the "other person" is whoever isn't the viewer.
  const otherParticipantId = isDirectThread
    ? (message.sender_id === user?.id ? message.recipient_volunteer_id : message.sender_id)
    : null

  // Auto size textboxes if browser supports it
  const replyRef = useRef(null)
  const replyScrollPosRef = useRef(null)
  const mostRecentReplyRef = useRef(null)
  const [replyFieldSizingSupported] = useState(() =>
    typeof CSS !== 'undefined' && CSS.supports && CSS.supports('field-sizing', 'content')
  )

  // ── Typing indicators (Supabase broadcast, keyed by thread root id) ───────
  const [typers, setTypers] = useState({})          // userId -> { name, expiresAt }
  const typingChannelRef = useRef(null)
  const lastTypingSentRef = useRef(0)               // timestamp of last "typing: true" send
  const typingIdleRef = useRef(null)

  function sendTypingBroadcast(typing) {
    const ch = typingChannelRef.current
    if (!ch) return
    try {
      Promise.resolve(ch.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: user?.id, name: profile?.full_name || 'Someone', typing },
      })).catch(() => { /* channel not joined yet — TTL covers it */ })
    } catch { /* ignore */ }
  }

  function sendTypingThrottled() {
    const now = Date.now()
    if (now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return
    lastTypingSentRef.current = now
    sendTypingBroadcast(true)
  }

  function stopTypingNow() {
    if (typingIdleRef.current) { clearTimeout(typingIdleRef.current); typingIdleRef.current = null }
    if (lastTypingSentRef.current > 0) {
      lastTypingSentRef.current = 0
      sendTypingBroadcast(false)
    }
  }

  function scheduleStopTyping() {
    if (typingIdleRef.current) clearTimeout(typingIdleRef.current)
    typingIdleRef.current = setTimeout(() => { typingIdleRef.current = null; stopTypingNow() }, TYPING_IDLE_MS)
  }

  function handleReplyInputChange(value) {
    setReplyBody(value)
    if (!value.trim()) { stopTypingNow(); return }
    sendTypingThrottled()
    scheduleStopTyping()
  }

  // Subscribe to this thread's typing broadcasts while it's expanded
  useEffect(() => {
    if (!expanded || !message?.id || !user?.id) return
    const channel = supabase
      .channel(`typing:${message.id}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const uid = payload?.userId
        if (!uid || uid === user.id) return
        setTypers(prev => {
          if (payload.typing) {
            return { ...prev, [uid]: { name: payload.name || 'Someone', expiresAt: Date.now() + TYPING_TTL_MS } }
          }
          if (!(uid in prev)) return prev
          const next = { ...prev }
          delete next[uid]
          return next
        })
      })
      .subscribe()
    typingChannelRef.current = channel

    // Expire stale typers (closed tab, dropped "typing: false" event)
    const prune = setInterval(() => {
      setTypers(prev => {
        const now = Date.now()
        const kept = Object.entries(prev).filter(([, t]) => t.expiresAt > now)
        if (kept.length === Object.keys(prev).length) return prev
        return Object.fromEntries(kept)
      })
    }, 1000)

    return () => {
      clearInterval(prune)
      stopTypingNow()
      typingChannelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [expanded, message?.id, user?.id, supabase])

  // Stop announcing as soon as the composer closes (send, cancel, Escape)
  useEffect(() => {
    if (!replyOpen) stopTypingNow()
  }, [replyOpen])

  // Clear browser notifications for a specific message ID
  async function clearNotificationForMessage(messageId) {
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      if (!reg) return
      const notifications = await reg.getNotifications()
      notifications.forEach(n => {
        if (n.data?.url?.includes(messageId)) n.close()
      })
    } catch (e) { /* ignore */ }
  }

  // Auto-scroll to most recent reply when expanded
  useEffect(() => {
    if (expanded && mostRecentReplyRef.current) {
      const elementTop = mostRecentReplyRef.current.getBoundingClientRect().top + window.pageYOffset
      window.scrollTo({ top: elementTop - 350, behavior: 'smooth' })
    }
  }, [expanded])

  // Auto-scroll to textbox when reply opens
  useEffect(() => {
    if (replyOpen && replyRef.current) {
      const elementTop = replyRef.current.getBoundingClientRect().top + window.pageYOffset
      window.scrollTo({ top: elementTop - 350, behavior: 'smooth' })
      replyScrollPosRef.current = null
    }
  }, [replyOpen])

  useEffect(() => {
    if (!replyOpen || replyScrollPosRef.current === null) return
    const savedScrollY = replyScrollPosRef.current
    replyScrollPosRef.current = null
    requestAnimationFrame(() => {
      window.scrollTo(0, savedScrollY)
    })
  }, [replyOpen])

  useEffect(() => {
    if (!replyOpen) return
    const el = replyRef.current
    if (!el) return
    if (replyFieldSizingSupported) return
    const computed = window.getComputedStyle(el)
    const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2 || 20
    const paddingTop = parseFloat(computed.paddingTop) || 0
    const paddingBottom = parseFloat(computed.paddingBottom) || 0
    const minHeight = lineHeight * 2 + paddingTop + paddingBottom

    el.style.height = 'auto'
    const contentHeight = el.scrollHeight
    el.style.height = Math.max(contentHeight, minHeight) + 'px'
  }, [replyOpen, replyFieldSizingSupported])

  // Deep-link highlight: when auto-expanded via notification, highlight unread replies
  // and mark as read. Highlight persists until user collapses or navigates away.
  const latestRef = useRef({ replies, readMessageIds, message, user, onMarkRead })
  useEffect(() => {
    latestRef.current = { replies, readMessageIds, message, user, onMarkRead }
  })

  useEffect(() => {
    if (!startExpanded) {
      setLocallyHighlightedReplies(new Set())
      return
    }
    const { replies, readMessageIds, message, user, onMarkRead } = latestRef.current
    const idsToHighlight = replies
      .filter(r => !readMessageIds.has(r.id) && r.sender_id !== user?.id)
      .map(r => r.id)
    // The deep-linked message itself may be the top-level message (no unread
    // replies at all) — highlight it too when it's the unread thing being opened.
    if (!readMessageIds.has(message.id) && message.sender_id !== user?.id) {
      idsToHighlight.push(message.id)
    }
    if (idsToHighlight.length > 0) {
      setLocallyHighlightedReplies(new Set(idsToHighlight))
    }
    onMarkRead(message.id, replies.map(r => r.id))
    clearNotificationForMessage(message.id)
  }, [startExpanded])

  // Realtime arrivals: a reply that lands while this thread is already
  // expanded gets the same treatment as expandThread — highlight it (the
  // highlight keeps the blue styling after read state clears) and mark the
  // thread read immediately, so the user doesn't have to collapse/re-expand
  // to clear the unread state.
  const knownReplyIdsRef = useRef(null)   // reply ids seen on a previous run
  const latestReplyAtRef = useRef(null)   // newest reply created_at seen so far
  useEffect(() => {
    if (knownReplyIdsRef.current === null) {
      // First run: everything already attached is history, not a new arrival.
      knownReplyIdsRef.current = new Set(replies.map(r => r.id))
      latestReplyAtRef.current = replies.reduce(
        (max, r) => (!max || Date.parse(r.created_at) > Date.parse(max) ? r.created_at : max),
        null
      )
      return
    }
    const fresh = replies.filter(r => !knownReplyIdsRef.current.has(r.id))
    if (fresh.length === 0) return
    fresh.forEach(r => knownReplyIdsRef.current.add(r.id))

    // Older rows trickling in from "Load older messages" are not arrivals.
    const baseline = Date.parse(latestReplyAtRef.current ?? message.created_at)
    const incoming = fresh.filter(r =>
      Date.parse(r.created_at) > baseline &&
      r.sender_id !== user?.id &&
      !readMessageIds.has(r.id)
    )
    incoming.forEach(r => {
      if (!latestReplyAtRef.current || Date.parse(r.created_at) > Date.parse(latestReplyAtRef.current)) {
        latestReplyAtRef.current = r.created_at
      }
    })
    // Collapsed threads keep their normal unread flow (blue dot, and
    // expandThread highlights + marks read when opened).
    if (incoming.length === 0 || !expanded) return

    setLocallyHighlightedReplies(prev => {
      const next = new Set(prev)
      incoming.forEach(r => next.add(r.id))
      return next
    })
    onMarkRead(message.id, replies.map(r => r.id))
    clearNotificationForMessage(message.id)
  }, [replies, expanded, readMessageIds, message.id, message.created_at, user, onMarkRead])

  const bodySnippet = message.body ? message.body.replace(/\n/g, ' ') : '📎 Image'
  const isHighlighted = locallyHighlightedReplies.has(message.id)
  const replyCount = replies.length

  // Surface the latest unread reply in the collapsed preview so admins
  // can tell which thread has new activity without expanding it.
  const latestUnreadReply = readMessageIds
    ? replies
        .filter(r => !readMessageIds.has(r.id) && r.sender_id !== user?.id)
        .at(-1) // replies are already sorted oldest→newest, so last = most recent
    : null

  const previewSource = previewMessage ?? latestUnreadReply ?? message
  const previewSnippet = previewSource.body
    ? previewSource.body.replace(/\n/g, ' ')
    : '📎 Image'
  const previewSenderName = latestUnreadReply
    ? (latestUnreadReply.sender?.full_name || 'HR')
    : (senderLabel || message.sender?.full_name || 'Unknown')
  // Condensed view shows the previewed message's recipient, mirroring the
  // expanded header format (timestamp, To: X). Skipped when it duplicates
  // the collapsed label (sent reply threads already show To: X as the title).
  const previewRecipientLabel = getRecipientLabel(previewSource)
  // Shown on its own sub-line inside the meta wrapper once the meta line
  // itself runs tight (the wrapper flex-wraps naturally). Skipped when it
  // duplicates the collapsed label (sent reply threads already show To: X
  // as the title).
  const previewRecipientText = previewRecipientLabel && previewRecipientLabel !== collapsedLabel
    ? previewRecipientLabel
    : null

  const isAdmin        = profile?.role === 'admin'
  const isThreadSender = message.sender_id === user?.id
  const canReply = Boolean(user?.id)

  // Group chat member names (Individuals tab, 2+ people), alphabetical.
  function getGroupMemberNames(m) {
    return parseGroupMemberIds(m)
      .map(id => allUsers.find(u => u.id === id)?.full_name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
  }

  // Recipient pill: show for every message, prefixed with "To: ".
  // Resolved per message (original or each reply), not from the thread root.
  function getRecipientLabel(m) {
    if (!m) return null
    if (m.recipient_type === 'volunteer') {
      if (m.recipient_volunteer_id === user?.id) return 'To: You'
      const name = allUsers.find(u => u.id === m.recipient_volunteer_id)?.full_name
      return `To: ${name || 'Individual'}`
    }
    return `To: ${recipientLabel(m)}`
  }

  async function handleSendReply() {
    if (!replyBody.trim()) return
    setSending(true)
    const targetReply = replies.find(r => r.id === replyToId)
    const followUpReply = followUpId ? replies.find(r => r.id === followUpId) : null
    const abort = (msg) => { showToast(msg, 'error'); setSending(false) }
    let replyTarget
    if (isReplyAll) {
      replyTarget = {
        recipient_type: message.recipient_type,
        recipient_day: message.recipient_day,
        recipient_shift: message.recipient_shift,
        recipient_role: message.recipient_role,
        recipient_volunteer_id: message.recipient_volunteer_id,
        // Group threads store members as JSON — the API requires the id
        // array, so forward it explicitly.
        recipient_volunteer_ids: message.recipient_type === 'group'
          ? parseGroupMemberIds(message)
          : undefined,
      }
    } else if (followUpReply && followUpReply.sender_id === user?.id) {
      // Follow-up on own reply: reply to that reply's recipient, not yourself.
      if (followUpReply.recipient_type !== 'volunteer') {
        replyTarget = {
          recipient_type: followUpReply.recipient_type,
          recipient_day: followUpReply.recipient_day,
          recipient_shift: followUpReply.recipient_shift,
          recipient_role: followUpReply.recipient_role,
          recipient_volunteer_id: followUpReply.recipient_volunteer_id,
          recipient_volunteer_ids: followUpReply.recipient_type === 'group'
            ? parseGroupMemberIds(followUpReply)
            : undefined,
        }
      } else {
        if (!followUpReply.recipient_volunteer_id || followUpReply.recipient_volunteer_id === user?.id) return abort("Could not determine who to follow up with")
        replyTarget = {
          recipient_type: 'volunteer',
          recipient_volunteer_id: followUpReply.recipient_volunteer_id,
        }
      }
    } else if (isDirectThread) {
      // 1-on-1: always reply to the other person in the string, never yourself.
      // This prevents self-only replies when replying in a thread you started.
      let otherId = otherParticipantId
      if (!otherId || otherId === user?.id) {
        const candidate = targetReply?.sender_id && targetReply.sender_id !== user?.id
          ? targetReply.sender_id
          : null
        otherId = candidate
          ?? (message.sender_id !== user?.id ? message.sender_id : message.recipient_volunteer_id)
      }
      if (!otherId || otherId === user?.id) return abort('Could not determine the other person in this conversation')
      replyTarget = {
        recipient_type: 'volunteer',
        recipient_volunteer_id: otherId,
      }
    } else if (isGroupThread && targetReply) {
      // Group threads: a Reply on someone else's reply goes to that person,
      // never to another replier or yourself.
      if (targetReply.sender_id === user?.id) return abort("You can't reply to yourself")
      replyTarget = {
        recipient_type: 'volunteer',
        recipient_volunteer_id: targetReply.sender_id,
      }
    } else if (!isGroupMessageSender && message.recipient_type !== 'volunteer') {
      // Broadcast threads (everyone/HR/shift/role): a recipient's Reply always
      // goes to the thread sender, never to another replier (or yourself).
      if (message.sender_id === user?.id) return abort("Use Reply All to respond to your own message")
      replyTarget = {
        recipient_type: 'volunteer',
        recipient_volunteer_id: message.sender_id,
      }
    } else if (targetReply) {
      if (targetReply.sender_id === user?.id) return abort("You can't reply to yourself")
      replyTarget = {
        recipient_type: 'volunteer',
        recipient_volunteer_id: targetReply.sender_id,
      }
    } else {
      if (message.sender_id === user?.id) return abort("Use Reply All to respond to your own group message")
      replyTarget = {
        recipient_type: 'volunteer',
        recipient_volunteer_id: message.sender_id,
      }
    }
    try {
      const accessToken = await getFreshAccessToken(supabase)
      const res = await fetch('/api/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          ...replyTarget,
          body: replyBody.trim(),
          image_url: null,
          parent_message_id: message.id,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        showToast(result.error || 'Failed to send reply', 'error')
      } else {
        showToast('Reply sent!', 'success')
        setReplyBody('')
        setReplyOpen(false)
        setReplyToId(null)
        setIsReplyAll(false)
        setFollowUpId(null)
        onReplySent()
      }
    } catch (err) {
      showToast(err.message || 'Failed to send reply', 'error')
    } finally {
      setSending(false)
    }
  }

  const hasReplies = replies.length > 0
  const typingNames = Object.values(typers).map(t => t.name)

  // Display name for the reply composer: in 1-on-1 threads always the
  // other person, for follow-ups the recipient of your own reply,
  // otherwise the sender of the message being replied to.
  const replyTargetName = (() => {
    if (isReplyAll) return null
    if (followUpId) {
      const f = replies.find(r => r.id === followUpId)
      if (f?.sender_id === user?.id && f?.recipient_type === 'volunteer') {
        if (f.recipient_volunteer_id === user?.id) return 'User'
        return allUsers.find(u => u.id === f.recipient_volunteer_id)?.full_name ?? 'User'
      }
    }
    if (isDirectThread) {
      const other = allUsers.find(u => u.id === otherParticipantId)
      if (other?.full_name) return other.full_name
      if (replyToId) {
        const t = replies.find(r => r.id === replyToId)
        if (t?.sender_id && t.sender_id !== user?.id) return t.sender?.full_name ?? 'User'
      }
      if (message.sender_id !== user?.id) return message.sender?.full_name ?? 'User'
      const recip = allUsers.find(u => u.id === message.recipient_volunteer_id)
      return recip?.full_name ?? 'User'
    }
    // Group threads: a Reply on someone's reply goes to that person; a Reply
    // on the thread root goes to the thread sender.
    if (isGroupThread && replyToId) {
      return replies.find(r => r.id === replyToId)?.sender?.full_name ?? 'User'
    }
    // Recipient view in broadcast threads: replies always go to the thread sender.
    if (!isGroupMessageSender && message.recipient_type !== 'volunteer') {
      return message.sender?.full_name ?? 'User'
    }
    if (replyToId) return replies.find(r => r.id === replyToId)?.sender?.full_name ?? 'User'
    return message.sender?.full_name ?? 'User'
  })()

  const expandThread = () => {
    const unreadReplyIds = replies.filter(r => !readMessageIds.has(r.id) && r.sender_id !== user?.id).map(r => r.id)
    setLocallyHighlightedReplies(new Set(unreadReplyIds))
    setExpanded(true)
    onMarkRead(message.id, replies.map(r => r.id))
    clearNotificationForMessage(message.id)
  }

  if (!expanded) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.45rem 0.75rem',
          borderRadius: '8px',
          border: `1px solid ${isUnread ? 'rgba(2,65,107,0.35)' : 'var(--border)'}`,
          background: isUnread ? 'rgba(2,65,107,0.04)' : 'var(--bg)',
          userSelect: 'none',
          cursor: 'pointer',
        }}
        onClick={expandThread}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
        onMouseLeave={e => e.currentTarget.style.background = isUnread ? 'rgba(2,65,107,0.04)' : 'var(--bg)'}
      >
        {/* Unread blue dot */}
        {isUnread && (
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, alignSelf: 'center' }} />
        )}

        {/* Line 1: sender + timestamp */}
        <div
          style={{ flex: 1, minWidth: 0 }}
        >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem 0.5rem', minWidth: 0 }}>
              <span style={{ fontWeight: isUnread ? 700 : 600, fontSize: '0.8rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {collapsedLabel ?? (latestUnreadReply ? `↩ ${previewSenderName}` : previewSenderName)}
              </span>
              <span style={{ display: 'inline-flex', flexWrap: 'wrap', columnGap: '0.35rem', fontSize: '0.68rem', color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>
                <span style={{ whiteSpace: 'nowrap' }}>{formatDateTime(previewSource.created_at)}{previewRecipientText ? ',' : ''}</span>
                {previewRecipientText && (
                  <span style={{ whiteSpace: 'nowrap' }}>{previewRecipientText}</span>
                )}
              </span>
            </div>
          {/* Line 2: reply count + snippet (only rendered if there is content) */}
          {(replyCount > 0 || bodySnippet) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.1rem' }}>
              {replyCount > 0 && (
                <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--accent)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {replyCount} {replyCount === 1 ? 'reply' : 'replies'} ·
                </span>
              )}
              <span style={{ fontSize: '0.92rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {previewSnippet}
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0', margin: '0.5rem 0' }}>
      {/* ── Original message (click to collapse) ── */}
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', cursor: 'pointer' }}
          onClick={() => { stopTypingNow(); setLocallyHighlightedReplies(new Set()); setExpanded(false); setReplyOpen(false); setReplyBody(''); setReplyToId(null); setIsReplyAll(false); setFollowUpId(null) }}
      >
        <MessageCard
          m={message}
          readMessageIds={readMessageIds}
          user={user}
          setLightboxUrl={setLightboxUrl}
          senderLabel={senderLabel}
          canReply={canReply && !isGroupMessageSender}
          canReplyAll={isGroupMessageSender || isGroupThread}
          replyOpen={replyOpen}
          onReply={() => { setLocallyHighlightedReplies(new Set()); replyScrollPosRef.current = window.scrollY; setReplyToId(null); setIsReplyAll(false); setFollowUpId(null); setReplyOpen(true) }}
          onReplyAll={() => { setLocallyHighlightedReplies(new Set()); replyScrollPosRef.current = window.scrollY; setReplyToId(null); setIsReplyAll(true); setFollowUpId(null); setReplyOpen(true) }}
          isHighlighted={isHighlighted}
          recipientLabel={getRecipientLabel(message)}
          groupMemberNames={message.recipient_type === 'group' ? getGroupMemberNames(message) : null}
        />
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
          {replies.map((reply, idx) => {
            const replyIsAdmin = reply.sender?.role === 'admin' || false
            const isReplyHighlighted = locallyHighlightedReplies.has(reply.id)
            const isMostRecent = idx === replies.length - 1
            const isMostRecentReply = true
            const isOwnReply = reply.sender_id === user?.id
            // A reply's audience decides its button: a reply sent to the whole
            // group gets Reply All when it's yours, everything else gets a
            // regular Reply.
            const ownReplyIsGroup = isOwnReply && reply.recipient_type !== 'volunteer'
            let replyCanReply, replyCanReplyAll
            if (isGroupThread) {
              // Group chats give every reply exactly one button, so recipients
              // get the same options as the thread sender.
              replyCanReplyAll = ownReplyIsGroup
              replyCanReply = canReply && !ownReplyIsGroup
            } else if (isGroupMessageSender) {
              replyCanReply = isOwnReply ? !ownReplyIsGroup : true
              replyCanReplyAll = ownReplyIsGroup
            } else {
              replyCanReply = canReply && isMostRecent && isMostRecentReply
              replyCanReplyAll = false
            }
            return (
              <div ref={isMostRecent ? mostRecentReplyRef : undefined} key={reply.id} style={{ display: 'flex', flexDirection: 'row', gap: '0.5rem', alignItems: 'flex-start', minWidth: 0, maxWidth: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1, minWidth: 0, maxWidth: '100%' }}>
                  <MessageCard
                    m={reply}
                    readMessageIds={readMessageIds}
                    user={user}
                    setLightboxUrl={setLightboxUrl}
                    isHighlighted={isReplyHighlighted}
                    canReply={replyCanReply}
                    canReplyAll={replyCanReplyAll}
                    replyOpen={replyOpen}
                    onReply={() => { setLocallyHighlightedReplies(new Set()); replyScrollPosRef.current = window.scrollY; if (isOwnReply && (isGroupThread || isGroupMessageSender)) { setReplyToId(null); setIsReplyAll(false); setFollowUpId(reply.id) } else { setReplyToId(reply.id); setIsReplyAll(false); setFollowUpId(null) } setReplyOpen(true) }}
                    onReplyAll={() => { setLocallyHighlightedReplies(new Set()); replyScrollPosRef.current = window.scrollY; setReplyToId(null); setFollowUpId(null); setIsReplyAll(true); setReplyOpen(true) }}
                    recipientLabel={getRecipientLabel(reply)}
                    groupMemberNames={reply.recipient_type === 'group' ? getGroupMemberNames(reply) : null}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Typing indicator ── */}
      {typingNames.length > 0 && (
        <div style={{
          marginTop: hasReplies ? '0.35rem' : '0.5rem',
          marginLeft: hasReplies ? '1rem' : '0',
          paddingLeft: hasReplies ? '0.875rem' : '0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.75rem',
          color: 'var(--muted)',
          fontStyle: 'italic',
        }}>
          <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'flex-end', gap: '2px' }}>
            <span className="typing-dot" style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--muted)', display: 'inline-block' }} />
            <span className="typing-dot" style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--muted)', display: 'inline-block' }} />
            <span className="typing-dot" style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--muted)', display: 'inline-block' }} />
          </span>
          <span>{typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing…</span>
          <style>{`
            .typing-dot { animation: typing-bounce 1.2s infinite ease-in-out; }
            .typing-dot:nth-child(2) { animation-delay: 0.15s; }
            .typing-dot:nth-child(3) { animation-delay: 0.3s; }
            @keyframes typing-bounce {
              0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
              30% { opacity: 1; transform: translateY(-3px); }
            }
          `}</style>
        </div>
      )}

      {/* ── Reply composer ── */}
      {canReply && replyOpen && (
        <div style={{
          marginTop: '0.5rem',
          marginLeft: hasReplies ? '1rem' : '0',
          paddingLeft: hasReplies ? '0.875rem' : '0',
          borderLeft: hasReplies ? '2px solid var(--border)' : 'none',
        }}>
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
              ref={replyRef}
              autoFocus
              value={replyBody}
              onChange={e => handleReplyInputChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSendReply()
                if (e.key === 'Escape') { setReplyOpen(false); setReplyBody(''); setReplyToId(null); setIsReplyAll(false); setFollowUpId(null) }
              }}
              placeholder={isReplyAll ? (message.recipient_type === 'group' ? 'Replying to Group…' : 'Replying to Everyone…') : `Replying to ${replyTargetName}…`}
              rows={2}
              style={{
                ...S.input,
                resize: replyFieldSizingSupported ? 'none' : 'vertical',
                overflowY: 'auto',
                overflowX: 'hidden',
                fieldSizing: 'content',
                minBlockSize: '3lh',
                fontSize: '0.82rem',
                padding: '0.6rem 0.75rem',
              }}
            />
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setReplyOpen(false); setReplyBody(''); setReplyToId(null); setIsReplyAll(false); setFollowUpId(null) }}
                  style={{
                  padding: '0.35rem 0.75rem',
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: '7px',
                  color: 'var(--muted)',
                  fontSize: '0.78rem',
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
                  padding: '0.35rem 0.75rem',
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: '7px',
                  color: '#fff',
                  fontSize: '0.78rem',
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
  onUnreadCountChange,
  openMessageId,
  // Bottom offset for the mobile recipients sheet (e.g. above the volunteer
  // BottomNav). Accepts any CSS length; 0 keeps the sheet flush to the bottom.
  sheetBottomOffset = 0,
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
  const [inboxFilter, setInboxFilter] = useState('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)
  const [inboxSearch, setInboxSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef(null)
  const [markingAllRead, setMarkingAllRead] = useState(false)

  // Compose state
  const [msgView, setMsgView]                 = useState('inbox')
  const [msgBody, setMsgBody]                 = useState('')
  const [msgRecipientType, setMsgRecipientType] = useState('admin')
  const [msgSelectedShift, setMsgSelectedShift] = useState(null)
  const [msgSelectedRole, setMsgSelectedRole]   = useState(null)
  const [msgRecipientVolIds, setMsgRecipientVolIds] = useState([])
  const [sendingMsg, setSendingMsg]           = useState(false)
  const [msgImageFile, setMsgImageFile]       = useState(null)
  const [msgImagePreview, setMsgImagePreview] = useState(null)
  const [uploadingImage, setUploadingImage]   = useState(false)
  const [comboQuery, setComboQuery]           = useState('')
  const [comboOpen, setComboOpen]             = useState(false)
  const fileInputRef = useRef(null)
  const comboRef     = useRef(null)
  const recipientInputRef = useRef(null)
  const msgBodyRef = useRef(null)
  const [msgBodyFieldSizingSupported] = useState(() =>
    typeof CSS !== 'undefined' && CSS.supports && CSS.supports('field-sizing', 'content')
  )

  useEffect(() => {
    if (msgView !== 'compose') return
    const el = msgBodyRef.current
    if (!el) return

    // Browsers that natively support field-sizing: content grow/shrink the
    // textarea themselves — no JS needed, no scroll-jump risk.
    if (msgBodyFieldSizingSupported) return

    // Failsafe for browsers without field-sizing support: size the box once,
    // when the compose view becomes visible, using its own default height
    // (rows=4) as the floor, rather than resizing on every keystroke.
    const computed = window.getComputedStyle(el)
    const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2 || 20
    const paddingTop = parseFloat(computed.paddingTop) || 0
    const paddingBottom = parseFloat(computed.paddingBottom) || 0
    const minHeight = lineHeight * 4 + paddingTop + paddingBottom

    el.style.height = 'auto'
    const contentHeight = el.scrollHeight
    el.style.height = Math.max(contentHeight, minHeight) + 'px'
  }, [msgView, msgBodyFieldSizingSupported])

  const isAdmin    = profile?.role === 'admin'
  const isProvider = profile?.default_role === 'Provider'

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (user) fetchMessages()
    function handleMouseDown(e) {
      if (comboRef.current && !comboRef.current.contains(e.target)) setComboOpen(false)
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [user])

  // ── Poll unread count every 30s so the badge stays current
  // even when the messages tab is not open ──
  useEffect(() => {
    if (!user) return
    const id = setInterval(fetchMessages, 30000)
    return () => clearInterval(id)
  }, [user])

  // ── Unlock pinch-to-zoom when lightbox is open on mobile ───────────────────
  useEffect(() => {
    const viewport = document.querySelector('meta[name="viewport"]')
    if (!viewport) return
    if (lightboxUrl) {
      viewport.setAttribute('content', 'width=device-width, initial-scale=1')
    } else {
      viewport.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    }
  }, [lightboxUrl])

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
        .limit(MSG_PAGE_SIZE * 5), // fetch extra to account for reply rows
      supabase
        .from('message_reads')
        .select('message_id')
        .eq('user_id', user.id),
      supabase
        .from('profiles')
        .select('id, full_name, default_role, status')
        .order('full_name'),
    ])

    const fetched = (msgs || []).filter(m => m != null)
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

  }, [user, supabase])

  // ── Realtime: new messages + new read receipts ─────────────────────────────
  // Debounced so bursts (e.g. a reply-all fan-out) collapse into one refetch,
  // which already re-resolves the sender join and broadcast read counts.
  // The 30s poll above stays as a fallback for dropped events/reconnects.
  useEffect(() => {
    if (!user) return
    let timer = null
    const scheduleRefetch = () => {
      if (timer) return
      timer = setTimeout(() => { timer = null; fetchMessages() }, 500)
    }
    const channel = supabase
      .channel(`messages-live:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, scheduleRefetch)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reads' }, scheduleRefetch)
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [user, supabase, fetchMessages])

  const markThreadRead = useCallback(async (messageId, replyIds = []) => {
    const allIds = [messageId, ...replyIds]
    const toMark = allIds.filter(id => !readMessageIds.has(id))
    if (toMark.length === 0) return
    const rows = toMark.map(id => ({ user_id: user.id, message_id: id }))
    await supabase.from('message_reads').upsert(rows, { onConflict: 'user_id,message_id' })
    setReadMessageIds(prev => {
      const next = new Set(prev)
      toMark.forEach(id => next.add(id))
      return next
    })
  }, [user, supabase, readMessageIds])

  async function markAllThreadsRead() {
    if (!user || markingAllRead) return
    const ids = []
    inboxThreads.forEach(m => {
      if (m.sender_id !== user?.id && !readMessageIds.has(m.id)) ids.push(m.id)
      ;(inboxRepliesMap[m.id] || []).forEach(r => {
        if (r.sender_id !== user?.id && !readMessageIds.has(r.id)) ids.push(r.id)
      })
    })
    const unique = [...new Set(ids)]
    if (unique.length === 0) return
    setMarkingAllRead(true)
    try {
      const rows = unique.map(id => ({ user_id: user.id, message_id: id }))
      const { error } = await supabase.from('message_reads').upsert(rows, { onConflict: 'user_id,message_id' })
      if (error) {
        showToast(error.message || 'Failed to mark all as read', 'error')
      } else {
        setReadMessageIds(prev => {
          const next = new Set(prev)
          unique.forEach(id => next.add(id))
          return next
        })
        showToast('All messages marked as read', 'success')
      }
    } catch (err) {
      showToast(err.message || 'Failed to mark all as read', 'error')
    } finally {
      setMarkingAllRead(false)
    }
  }

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

    const fetched = (older || []).filter(m => m != null)
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
      .filter(m => m && BROADCAST_TYPES.includes(m.recipient_type))
      .map(m => m.id)
    if (broadcastIds.length === 0) return
    const { data, error } = await supabase.rpc('get_broadcast_read_counts', { message_ids: broadcastIds })
    if (error) return
    const map = {}
    ;(data || []).forEach(r => { map[r.message_id] = Number(r.read_count) })
    setBroadcastReadCounts(prev => ({ ...prev, ...map }))
  }

  // ── Thread grouping ────────────────────────────────────────────────────────
  // Returns top-level messages with their replies keyed by parent id
  function buildThreadMap(msgs) {
    const validMsgs = msgs.filter(m => m != null)
    const repliesMap = {}
    validMsgs
      .filter(m => m.parent_message_id)
      .forEach(r => {
        if (!repliesMap[r.parent_message_id]) repliesMap[r.parent_message_id] = []
        repliesMap[r.parent_message_id].push(r)
      })
    // Sort each reply thread: the sender's reply-alls float above direct
    // messages to/from the sender, chronological within each group.
    const byId = new Map(validMsgs.map(m => [m.id, m]))
    Object.keys(repliesMap).forEach(k => {
      const parentSenderId = byId.get(k)?.sender_id
      const isBroadcast = (r) => parentSenderId && r.sender_id === parentSenderId && r.recipient_type !== 'volunteer'
      repliesMap[k].sort((a, b) => {
        const ag = isBroadcast(a) ? 0 : 1
        const bg = isBroadcast(b) ? 0 : 1
        if (ag !== bg) return ag - bg
        return new Date(a.created_at) - new Date(b.created_at)
      })
    })
    const topLevel = validMsgs.filter(m => !m.parent_message_id)
      .sort((a, b) => {
        const aLatest = Math.max(new Date(a.created_at), ...(repliesMap[a.id] || []).map(r => new Date(r.created_at)))
        const bLatest = Math.max(new Date(b.created_at), ...(repliesMap[b.id] || []).map(r => new Date(r.created_at)))
        return bLatest - aLatest
      })
    return { topLevel, repliesMap }
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const inboxMessages = user && profile && getInboxMessages
    ? getInboxMessages(messages.filter(m => !m.parent_message_id), user, profile)
    : messages.filter(m => !m.parent_message_id && m.sender_id !== user?.id)

  const { topLevel: inboxTopLevel, repliesMap: inboxRepliesMap } = buildThreadMap(
    // For inbox: show all top-level messages the user received + sent top-levels that got replies
    messages
  )

  // Sent messages: top-level sent messages + user-sent replies.
  // If the user sent the original message, that entry takes priority and
  // absorbs any of their replies (no duplicate reply-thread entry).
  // Otherwise replies are grouped by parent so one parent = one sent entry.
  const userSentReplies = messages.filter(m => m.sender_id === user?.id && m.parent_message_id)
  const topLevelSentIds = new Set(
    messages.filter(m => m.sender_id === user?.id && !m.parent_message_id).map(m => m.id)
  )
  const replyParentIds = [...new Set(
    userSentReplies
      .map(r => r.parent_message_id)
      .filter(pid => pid && !topLevelSentIds.has(pid))
  )]
  const sentMessages = messages
    .filter(m => m.sender_id === user?.id && !m.parent_message_id)
    .map(m => ({
      message: m,
      replies: inboxRepliesMap[m.id] || [],
      isReplyThread: false,
    }))
    .concat(
      replyParentIds.map(pid => {
        const parent = messages.find(m => m.id === pid)
        if (!parent) return null
        return {
          message: parent,
          replies: inboxRepliesMap[pid] || [],
          isReplyThread: true,
        }
      }).filter(Boolean)
    )
    .filter(e => e.message != null)
    .sort((a, b) => {
      const aLatest = Math.max(new Date(a.message.created_at), ...a.replies.map(r => new Date(r.created_at)))
      const bLatest = Math.max(new Date(b.message.created_at), ...b.replies.map(r => new Date(r.created_at)))
      return bLatest - aLatest
    })

  // Inbox threads: messages sent to this user (or admin) that are top-level
  const inboxThreads = inboxTopLevel.filter(m => {
    if (m.sender_id === user?.id) {
      // Fix #4: only show own sent messages in inbox if they have replies from someone ELSE
      return (inboxRepliesMap[m.id] || []).some(r => r.sender_id !== user?.id)
    }
    return true
  }).filter(m => {
    if (!getInboxMessages) return true
    return inboxMessages.find(im => im.id === m.id) || (inboxRepliesMap[m.id] || []).some(r => r.sender_id !== user?.id)
  })

  const filteredInboxThreads = inboxThreads.filter(m => {
    if (inboxFilter === 'hr') {
      return m.recipient_type === 'admin'
    }

    if (inboxFilter === 'role') {
      return (
          m.recipient_type === 'role' &&
          m.recipient_role === profile?.default_role
      )
    }

    if (inboxFilter === 'everyone') {
      return (
          m.recipient_type === 'everyone' &&
          m.sender_id !== user?.id
      )
    }

    if (inboxFilter === 'direct') {
      if (
          m.recipient_type === 'volunteer' &&
          m.recipient_volunteer_id === user?.id
      ) return true
      // Threads where someone sent you a direct reply (e.g. a 1-on-1 reply
      // inside a group thread), even when the top-level message is group.
      return (inboxRepliesMap[m.id] || []).some(r =>
          r.recipient_type === 'volunteer' &&
          r.recipient_volunteer_id === user?.id &&
          r.sender_id !== user?.id
      )
    }

    return true
  })

  // Unread count across all inbox threads (for tab badge and parent notification)
  const unreadThreadCount = readMessageIds ? inboxThreads.filter(m => {
    const isUnreadMsg = !readMessageIds.has(m.id) && m.sender_id !== user?.id
    const hasUnreadReplies = (inboxRepliesMap[m.id] || []).some(
      r => !readMessageIds.has(r.id) && r.sender_id !== user?.id
    )
    return isUnreadMsg || hasUnreadReplies
  }).length : 0

  // Notify parent whenever unread count changes so the Messages tab badge stays in sync
  useEffect(() => {
    onUnreadCountChange?.(unreadThreadCount)
  }, [unreadThreadCount, onUnreadCountChange])

  // Resolve a deep-linked message id (which may be a reply) to its thread's
  // top-level id, so notifications for replies still expand the right thread.
  const openThreadId = (() => {
    if (!openMessageId) return null
    const target = messages.find(m => m.id === openMessageId)
    if (!target) return openMessageId // not loaded locally yet — fall back to raw id
    return target.parent_message_id || target.id
  })()

  const recentRecipients = sentMessages
    .flatMap(s => {
      if (s.isReplyThread) {
        const my = [...s.replies].reverse().find(r => r.sender_id === user?.id) ?? s.replies.find(r => r.sender_id === user?.id)
        if (!my) return []
        if (my.recipient_type === 'volunteer' && my.recipient_volunteer_id) return [my.recipient_volunteer_id]
        return parseGroupMemberIds(my).filter(id => id !== user?.id)
      }
      const m = s.message
      if (m.recipient_type === 'volunteer' && m.recipient_volunteer_id) return [m.recipient_volunteer_id]
      return parseGroupMemberIds(m).filter(id => id !== user?.id)
    })
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .slice(0, 4)
    .map(id => allUsers.find(u => u.id === id))
    .filter(Boolean)
    .filter(m => m.status === 'active')

  const comboResults = (() => {
    const q = comboQuery.trim().toLowerCase()
    const baseList =
        allUsers
        .filter(u => u.id !== user?.id)
        .filter(u => u.status === 'active')
        .filter(u => !msgRecipientVolIds.includes(u.id))
    if (q.length === 0) {
      const selectedIds = new Set(msgRecipientVolIds)
      const usableRecents = recentRecipients.filter(u => !selectedIds.has(u.id))
      const recentIds = new Set(usableRecents.map(u => u.id))
      const rest = baseList.filter(u => !recentIds.has(u.id))
      return [...usableRecents, ...rest].slice(0, 20)
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

  // Admins can message any role — use the canonical ROLES constant so it's
  // always complete regardless of whether the admin has schedule entries.
  // Providers can message the Provider role group.
  const rolesForCompose = isAdmin ? ROLES : isProvider ? ['Provider', ...myRoles.filter(r => r !== 'Provider')] : myRoles

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

  const selectedRecipientUsers = msgRecipientVolIds
    .map(id => allUsers.find(u => u.id === id))
    .filter(Boolean)

  function addRecipient(vol, opts = {}) {
    const { closeAfter = false } = opts
    if (!vol || vol.id === user?.id) return
    setMsgRecipientVolIds(prev => prev.includes(vol.id) ? prev : [...prev, vol.id])
    setComboQuery('')
    if (closeAfter) {
      setComboOpen(false)
      if (typeof document !== 'undefined' && document.activeElement && document.activeElement.blur) {
        document.activeElement.blur()
      }
    } else {
      // Re-open (and re-focus) on the next frame so the textbox + dropdown
      // reliably come back after every selection, no matter how many names
      // are already picked or which closer ran during the click.
      setComboOpen(true)
      requestAnimationFrame(() => {
        setComboOpen(true)
        if (recipientInputRef.current && recipientInputRef.current.focus) {
          recipientInputRef.current.focus()
        }
      })
    }
  }

  function removeRecipient(id) {
    setMsgRecipientVolIds(prev => prev.filter(v => v !== id))
  }

  function handleRecipientKeyDown(e, closeAfter = false) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    // Only auto-select when the filter narrows to a single option.
    if (comboResults.length === 1) addRecipient(comboResults[0], { closeAfter })
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

    try {
      const imageUrl = await uploadImage(user.id)
      if (msgImageFile && !imageUrl) { setSendingMsg(false); return }

      const individualIds = msgRecipientType === 'user'
        ? [...new Set(msgRecipientVolIds.filter(id => id && id !== user?.id))]
        : []
      const isGroupCompose = msgRecipientType === 'user' && individualIds.length > 1
      const recipientType = isGroupCompose                        ? 'group'
                          : msgRecipientType === 'user'           ? 'volunteer'
                          : msgRecipientType === 'providers'      ? 'role'
                          : msgRecipientType
      const accessToken = await getFreshAccessToken(supabase)

      const res = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({
          recipient_type: recipientType,
          body: msgBody.trim(),
          image_url: imageUrl || null,
          recipient_shift:        msgRecipientType === 'shift' ? (msgSelectedShift?.shift_time || null) : null,
          recipient_day:          msgRecipientType === 'shift' ? (msgSelectedShift?.day || null) : null,
          recipient_role:         msgRecipientType === 'role'      ? (msgSelectedRole || null)
                                : msgRecipientType === 'providers' ? 'Provider'
                                : null,
          recipient_volunteer_id: recipientType === 'volunteer' ? (individualIds[0] || null) : null,
          recipient_volunteer_ids: isGroupCompose ? individualIds : undefined,
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
        setMsgRecipientVolIds([])
        setComboQuery('')
        setComboOpen(false)
        setMessages([])
        setMsgCursor(null)
        setHasMoreMsgs(false)
        await fetchMessages()
        setMsgView('inbox')
      }
    } catch (err) {
      showToast(err.message || 'Failed to send', 'error')
    } finally {
      setSendingMsg(false)
    }
  }

  // ── Inbox filter dropdown ──────────────────────────────────────────────────
  const inboxFilterOptions = [
    ['all', 'All'],
    ['direct', 'Directly to me'],
    ...(isAdmin ? [['hr', 'HR']] : []),
    ['role', 'My Role'],
    ['everyone', 'Everyone'],
  ]
  const activeFilterLabel = (inboxFilterOptions.find(([key]) => key === inboxFilter) ?? inboxFilterOptions[0])[1]

  // Inbox text search — matches sender name, recipient, or message body across
  // the whole thread (top-level + replies). Plain substring, re-run on every
  // keystroke, applied after the category filter.
  const inboxSearchQuery = inboxSearch.trim().toLowerCase()
  function threadMatchesSearch(topMsg, replies, q) {
    const msgs = [topMsg, ...(replies || [])]
    return msgs.some(m => {
      const senderName = (
        m.sender?.full_name || allUsers.find(u => u.id === m.sender_id)?.full_name || ''
      ).toLowerCase()
      let recip
      if (m.recipient_type === 'volunteer') {
        recip = m.recipient_volunteer_id === user?.id
          ? 'you'
          : (allUsers.find(u => u.id === m.recipient_volunteer_id)?.full_name || 'individual')
      } else if (m.recipient_type === 'group') {
        const names = parseGroupMemberIds(m)
          .map(id => allUsers.find(u => u.id === id)?.full_name)
          .filter(Boolean)
        recip = names.length ? `group ${names.join(' ')}` : 'group'
      } else {
        recip = recipientLabel(m) // Everyone, Admin, role, shift, missionaries…
      }
      const body = (m.body || '').toLowerCase()
      return senderName.includes(q) || recip.toLowerCase().includes(q) || body.includes(q)
    })
  }
  const searchedInboxThreads = inboxSearchQuery
    ? filteredInboxThreads.filter(m =>
        threadMatchesSearch(m, inboxRepliesMap[m.id], inboxSearchQuery)
      )
    : filteredInboxThreads

  // Auto-deepen search: freeze how many threads the unsearched inbox shows at
  // the moment a query starts, then keep pulling older pages until the search
  // has that many results (or messages run out). Without this, search would
  // only ever see the ~50 messages loaded so far.
  const searchTargetRef = useRef(null)
  useEffect(() => {
    if (inboxSearchQuery) {
      if (searchTargetRef.current === null) searchTargetRef.current = filteredInboxThreads.length
    } else {
      searchTargetRef.current = null
    }
  }, [inboxSearchQuery])

  useEffect(() => {
    if (!inboxSearchQuery || searchTargetRef.current === null) return
    if (searchedInboxThreads.length >= searchTargetRef.current) return
    if (!hasMoreMsgs || loadingMoreMsgs) return
    const t = setTimeout(() => { loadMoreMessages() }, 150)
    return () => clearTimeout(t)
  }, [inboxSearchQuery, searchedInboxThreads.length, hasMoreMsgs, loadingMoreMsgs, msgCursor])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* View switcher — matches the admin Pipeline tab style */}
      <div style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
        {[['inbox', 'Inbox'], ['sent', 'Sent'], ['compose', 'Compose']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMsgView(key)}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: msgView === key ? 700 : 500,
              cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif',
              background: msgView === key ? '#0369a1' + '18' : 'transparent',
              color:      msgView === key ? '#0369a1' : 'var(--muted)',
              border:     msgView === key ? '1px solid #0369a144' : '1px solid var(--border)',
              transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── INBOX ── */}
      {msgView === 'inbox' && (
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            <h2 style={{ fontWeight: 600, margin: 0 }}>Inbox</h2>
            <button
                key="mark-all-read"
                type="button"
                onClick={markAllThreadsRead}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                  background: '#fff',
                  color: 'var(--muted)',
                  border: '1px solid var(--border)',
                  marginLeft: 'auto',
                }}
            >
              {markingAllRead ? 'Loading...' : 'Mark all as read'}
            </button>
          </div>

          {/* Filter dropdown + message search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            <div
              ref={filterRef}
              style={{ position: 'relative', width: 'fit-content' }}
            >
              <button
                type="button"
                onClick={() => setFilterOpen(o => !o)}
                aria-haspopup="listbox"
                aria-expanded={filterOpen}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.45rem 1rem',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                  background: '#fff',
                  color: 'var(--muted)',
                  border: '1px solid var(--border)',
                  transition: 'all 0.15s',
                }}
              >
                {activeFilterLabel}
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  transform: filterOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.15s',
                }}>
                  {/* Solid down caret with slightly rounded corners */}
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" stroke="currentColor"
                       strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
                    <polygon points="3.5,5.5 12.5,5.5 8,11.5" />
                  </svg>
                </span>
              </button>

              {filterOpen && (
                <div
                  role="listbox"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 0.35rem)',
                    left: 0,
                    minWidth: '100%',
                    zIndex: 30,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    boxShadow: '0 8px 24px rgba(2,65,107,0.12)',
                    padding: '0.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.15rem',
                  }}
                >
                  {inboxFilterOptions.map(([key, label]) => {
                    const isActive = inboxFilter === key
                    return (
                      <button
                        key={key}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onClick={() => { setInboxFilter(key); setFilterOpen(false) }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = isActive ? '#0369a1' + '18' : 'transparent' }}
                        style={{
                          padding: '0.45rem 0.9rem',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          fontWeight: isActive ? 700 : 500,
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: 'DM Sans, sans-serif',
                          background: isActive ? '#0369a1' + '18' : 'transparent',
                          color: isActive ? '#0369a1' : 'var(--muted)',
                          border: 'none',
                          transition: 'background 0.15s',
                        }}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Message search — collapsed circle button, expands into a gray pill bar */}
            {!searchOpen ? (
              <button
                type="button"
                title="Search messages"
                aria-label="Search messages"
                onClick={() => setSearchOpen(true)}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  border: 'none',
                  background: 'transparent',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'var(--muted)',
                  transition: 'background 0.15s',
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </button>
            ) : (
              <div className="inbox-search-wrap" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <span style={{
                  position: 'absolute',
                  left: '0.85rem',
                  display: 'inline-flex',
                  color: 'var(--muted)',
                  pointerEvents: 'none',
                  zIndex: 1,
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                </span>
                <input
                  ref={searchInputRef}
                  className="inbox-search-input"
                  autoFocus
                  type="text"
                  value={inboxSearch}
                  onChange={e => setInboxSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setInboxSearch('') }}
                  onBlur={() => { if (!inboxSearch.trim()) setSearchOpen(false) }}
                  placeholder="Search..."
                  style={{
                    width: '16rem',
                    maxWidth: '100%',
                    padding: '0.5rem 2.9rem 0.5rem 2.35rem',
                    background: 'var(--bg)',
                    border: '1px solid transparent',
                    borderRadius: '100px',
                    color: 'var(--text)',
                    fontSize: '0.85rem',
                    fontFamily: 'DM Sans, sans-serif',
                    outline: 'none',
                  }}
                />
                {/* Close button — empties the query and collapses the bar */}
                {inboxSearch.length > 0 && (
                  <button
                    type="button"
                    title="Close search"
                    aria-label="Close search"
                    onMouseDown={e => e.preventDefault()} // avoid the blur-close race
                    onClick={() => { setInboxSearch(''); setSearchOpen(false) }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(17,17,17,0.08)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    style={{
                      position: 'absolute',
                      right: '0.5rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      border: 'none',
                      background: 'transparent',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      cursor: 'pointer',
                      color: 'var(--muted)',
                      transition: 'background 0.15s',
                      zIndex: 1,
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>

          {searchedInboxThreads.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No messages</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {searchedInboxThreads.map(m => (
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
                  onMarkRead={markThreadRead}
                  startExpanded={openThreadId === m.id}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {sentMessages.map(sent => {
                const m = sent.message
                const getToLabel = (msg) =>
                  msg.recipient_type === 'group' ? 'To: Group' :
                  msg.recipient_type === 'everyone' ? 'To: Everyone' :
                  msg.recipient_type === 'admin'    ? 'To: HR' :
                  msg.recipient_type === 'shift'    ? `To: ${msg.recipient_day ? msg.recipient_day.charAt(0).toUpperCase() + msg.recipient_day.slice(1, 3) : ''} ${msg.recipient_shift || ''}`.trim() + ' Shift' :
                  msg.recipient_type === 'role'     ? `To: ${msg.recipient_role}` :
                  msg.recipient_type === 'volunteer'? `To: ${allUsers.find(u => u.id === msg.recipient_volunteer_id)?.full_name || m.sender?.full_name || 'Individual'}` :
                  'To: ' + msg.recipient_type
                const myReply = sent.isReplyThread
                  ? [...sent.replies].reverse().find(r => r.sender_id === user?.id) ?? sent.replies.find(r => r.sender_id === user?.id)
                  : null
                const toLabel = sent.isReplyThread && myReply ? getToLabel(myReply) : getToLabel(m)
                return (
                  <ReplyThread
                    key={m.id}
                    message={m}
                    replies={sent.replies}
                    user={user}
                    profile={profile}
                    supabase={supabase}
                    showToast={showToast}
                    readMessageIds={readMessageIds}
                    broadcastReadCounts={broadcastReadCounts}
                    setLightboxUrl={setLightboxUrl}
                    allUsers={allUsers}
                    onReplySent={fetchMessages}
                    onMarkRead={markThreadRead}
                    senderLabel={sent.isReplyThread ? undefined : toLabel}
                    collapsedLabel={sent.isReplyThread ? toLabel : undefined}
                    startExpanded={openThreadId === m.id}
                    previewMessage={myReply ?? null}
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
                  { value: 'admin',    label: 'HR' },
                  ...(isAdmin ? [{ value: 'everyone', label: 'Everyone' }] : []),
                  ...(isProvider && !isAdmin ? [{ value: 'providers', label: 'All Providers' }] : []),
                  ...(!isProvider && !isAdmin ? [{ value: 'everyone', label: 'Everyone' }] : []),
                  ...(myShiftCombos.length > 0 ? [{ value: 'shift', label: 'My Shift' }] : []),
                  ...(rolesForCompose.length > 0 ? [{ value: 'role', label: isAdmin ? 'Role' : 'My Role' }] : []),
                  { value: 'user', label: 'Individuals' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setMsgRecipientType(opt.value)
                      setMsgSelectedShift(null)
                      setMsgSelectedRole(null)
                      setMsgRecipientVolIds([])
                      setComboQuery('')
                      setComboOpen(false)
                    }}
                    style={{
                      padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.85rem',
                      fontWeight: msgRecipientType === opt.value ? 700 : 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                      background: msgRecipientType === opt.value ? '#0369a1' + '18' : 'transparent',
                      color:      msgRecipientType === opt.value ? '#0369a1' : 'var(--muted)',
                      border:     msgRecipientType === opt.value ? '1px solid #0369a144' : '1px solid var(--border)',
                      transition: 'all 0.15s',
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
              {msgRecipientType === 'role' && rolesForCompose.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <select
                    value={msgSelectedRole || ''}
                    onChange={e => setMsgSelectedRole(e.target.value || null)}
                    style={{
                      ...S.input,
                      cursor: 'pointer',
                      color: msgSelectedRole ? 'var(--text)' : 'var(--muted)',
                    }}
                  >
                    <option value="">Select a role…</option>
                    {rolesForCompose.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Individuals multi-select (email-style bubbles) */}
              {msgRecipientType === 'user' && (
                <div style={{ marginTop: '0.75rem' }} ref={comboRef}>
                  <label style={S.label}>Select users</label>
                  {isMobile ? (
                    <>
                      <div
                        onClick={() => { setComboOpen(true); setComboQuery('') }}
                        style={{ ...S.input, display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', cursor: 'pointer', minHeight: '3rem' }}
                      >
                        {selectedRecipientUsers.map(u => (
                          <span
                            key={u.id}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                              padding: '0.2rem 0.3rem 0.2rem 0.6rem', borderRadius: '100px',
                              fontSize: '0.82rem', fontWeight: 600, fontFamily: 'DM Sans, sans-serif',
                              background: '#0369a1' + '18', color: '#0369a1',
                              border: '1px solid #0369a144',
                            }}
                          >
                            {u.full_name}
                            <button
                              type="button"
                              aria-label={`Remove ${u.full_name}`}
                              onClick={e => { e.stopPropagation(); removeRecipient(u.id) }}
                              style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: '1.1rem', height: '1.1rem', borderRadius: '50%',
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: '#0369a1', fontSize: '0.75rem', lineHeight: 1, padding: 0,
                              }}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                        <input
                          readOnly
                          tabIndex={-1}
                          value=""
                          placeholder="Add recipients..."
                          style={{ flex: '1 1 8rem', minWidth: '8rem', border: 'none', outline: 'none', background: 'transparent', fontSize: '0.95rem', fontFamily: 'DM Sans, sans-serif', color: 'var(--text)', padding: 0, cursor: 'pointer' }}
                        />
                      </div>
                      {comboOpen && (
                        <div onClick={() => { setComboOpen(false); setComboQuery('') }} style={{ position: 'fixed', inset: 0, bottom: sheetBottomOffset, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: '16px 16px 0 0', display: 'flex', flexDirection: 'column', height: `min(560px, calc(95vh - (${sheetBottomOffset || 0})))`, maxHeight: `calc(95vh - (${sheetBottomOffset || 0}))`, width: '100%' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem 0.75rem', borderBottom: '1px solid var(--border)' }}>
                              <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Select recipients</span>
                              <button type="button" onClick={() => { setComboOpen(false); setComboQuery('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1.2rem' }}>✕</button>
                            </div>
                            <input
                              autoFocus
                              type="text"
                              value={comboQuery}
                              onChange={e => setComboQuery(e.target.value)}
                              onKeyDown={e => handleRecipientKeyDown(e, true)}
                              placeholder="Search…"
                              style={{ ...S.input, borderRadius: 0, border: 'none', borderBottom: '1px solid var(--border)', padding: '0.75rem 1.25rem' }}
                            />
                            <div style={{ overflowY: 'auto', flex: 1 }}>
                              {comboResults.map(vol => (
                                <button
                                  key={vol.id}
                                  type="button"
                                  onClick={() => addRecipient(vol, { closeAfter: true })}
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
                      <div
                        onClick={() => { setComboOpen(true); recipientInputRef.current?.focus?.() }}
                        style={{ ...S.input, display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', cursor: 'text', minHeight: '3rem' }}
                      >
                        {selectedRecipientUsers.map(u => (
                          <span
                            key={u.id}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                              padding: '0.2rem 0.3rem 0.2rem 0.6rem', borderRadius: '100px',
                              fontSize: '0.82rem', fontWeight: 600, fontFamily: 'DM Sans, sans-serif',
                              background: '#0369a1' + '18', color: '#0369a1',
                              border: '1px solid #0369a144',
                            }}
                          >
                            {u.full_name}
                            <button
                              type="button"
                              aria-label={`Remove ${u.full_name}`}
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => removeRecipient(u.id)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: '1.1rem', height: '1.1rem', borderRadius: '50%',
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: '#0369a1', fontSize: '0.75rem', lineHeight: 1, padding: 0,
                              }}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                        <input
                          ref={recipientInputRef}
                          type="text"
                          value={comboQuery}
                          onChange={e => { setComboQuery(e.target.value); setComboOpen(true) }}
                          onFocus={() => setComboOpen(true)}
                          onBlur={() => { setComboQuery(''); setComboOpen(false) }}
                          onKeyDown={handleRecipientKeyDown}
                          placeholder="Add recipients..."
                          style={{ flex: '1 1 8rem', minWidth: '8rem', border: 'none', outline: 'none', background: 'transparent', fontSize: '0.95rem', fontFamily: 'DM Sans, sans-serif', color: 'var(--text)', padding: 0 }}
                        />
                      </div>
                      {comboOpen && comboResults.length > 0 && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', zIndex: 100, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
                          {comboResults.map(vol => (
                            <button
                              key={vol.id}
                              type="button"
                              onMouseDown={e => { e.preventDefault(); addRecipient(vol) }}
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
                ref={msgBodyRef}
                value={msgBody}
                onChange={e => setMsgBody(e.target.value)}
                rows={5}
                placeholder="Write your message…"
                style={{ ...S.input, resize: msgBodyFieldSizingSupported ? 'none' : 'vertical', overflowY: 'auto', overflowX: 'hidden', fieldSizing: 'content', minBlockSize: '5lh' }}
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
              disabled={sendingMsg || uploadingImage || (!msgBody.trim() && !msgImageFile) || (msgRecipientType === 'user' && msgRecipientVolIds.length === 0) || (msgRecipientType === 'shift' && !msgSelectedShift) || (msgRecipientType === 'role' && !msgSelectedRole)}
              style={{
                padding: '0.85rem',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: sendingMsg || uploadingImage ? 'not-allowed' : 'pointer',
                fontFamily: 'DM Sans, sans-serif',
                opacity: (sendingMsg || uploadingImage || (!msgBody.trim() && !msgImageFile) || (msgRecipientType === 'user' && msgRecipientVolIds.length === 0) || (msgRecipientType === 'shift' && !msgSelectedShift) || (msgRecipientType === 'role' && !msgSelectedRole)) ? 0.5 : 1,
              }}
            >
              {uploadingImage ? 'Uploading image…' : sendingMsg ? 'Sending…' : 'Send Message'}
            </button>
          </form>
        </div>
      )}

      {lightboxUrl && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            zIndex: 1000,
            overflow: 'auto',           // allows scroll when zoomed
            touchAction: 'pinch-zoom',  // enables native pinch-to-zoom
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {/* Tappable backdrop to close */}
          <div
            onClick={() => setLightboxUrl(null)}
            style={{
              position: 'fixed', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <img
              src={lightboxUrl}
              alt="Full size"
              style={{
                maxWidth: '100%',
                maxHeight: '90vh',
                borderRadius: '10px',
                objectFit: 'contain',
                boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
                touchAction: 'pinch-zoom', // critical — don't block touch on the image
              }}
              onClick={e => e.stopPropagation()} // tap image doesn't close
            />
          </div>

          {/* Close button */}
          <button
            onClick={() => setLightboxUrl(null)}
            style={{
              position: 'fixed', top: '1rem', right: '1rem',
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '50%', color: '#fff', width: '36px', height: '36px',
              cursor: 'pointer', fontSize: '1rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 1001,
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

