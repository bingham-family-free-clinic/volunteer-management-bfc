import { useState, useRef, useEffect } from 'react'
import { formatDateTime } from '../lib/timeUtils'
import { recipientLabel, isMultiRecipient, splitToLabel } from '../lib/messageUtils'

// Matches http/https URLs
const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/g

/**
 * Converts a plain-text body into React nodes with:
 *   - Preserved line breaks (\n → <br />)
 *   - Clickable URLs
 */
function formatBody(text) {
  if (!text) return null

  const lines = text.split('\n')

  return lines.map((line, lineIndex) => {
    const parts = []
    let lastIndex = 0
    let match

    URL_REGEX.lastIndex = 0

    while ((match = URL_REGEX.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index))
      }
      const url = match[0]
      parts.push(
        <a
          key={`link-${lineIndex}-${match.index}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--accent)',
            textDecoration: 'underline',
            wordBreak: 'break-all',
          }}
          onClick={e => e.stopPropagation()}
        >
          {url}
        </a>
      )
      lastIndex = match.index + url.length
    }

    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex))
    }

    // Empty line — zero-width space preserves the line's height
    const content = parts.length > 0 ? parts : ['\u200B']

    return (
      <span key={`line-${lineIndex}`}>
        {content}
        {lineIndex < lines.length - 1 && <br />}
      </span>
    )
  })
}

export function MessageCard({ m, readMessageIds, user, setLightboxUrl, senderLabel, canReply, canReplyAll, replyOpen, onReply, onReplyAll, isHighlighted, recipientLabel: recipientLabelProp, groupMemberNames }) {
  const isUnread =
    readMessageIds &&
    !readMessageIds.has(m.id) &&
    m.sender_id !== user?.id
  const [groupOpen, setGroupOpen] = useState(false)
  const groupRef = useRef(null)
  // Group chats (Individuals tab, 2+ people) show an inline "To: Group"
  // toggle that overlays the member list Gmail-style. Clicking out collapses.
  const isGroupChat = m.recipient_type === 'group'
  const [toPrefix, toName] = splitToLabel(recipientLabelProp || '')
  const groupShort = toName || 'Group'
  // Only the recipient's name is bolded when the message goes to more than one
  // person ("To: **Everyone**", "To: **Group**"); the "To: " prefix and the
  // group's expand caret stay plain.
  const emphasise = text => isMultiRecipient(m)
    ? <strong style={{ fontWeight: 700 }}>{text}</strong>
    : text

  // ── Reply / Reply All header layout ────────────────────────────────────────
  // With both buttons side by side the header is one line tall. Once the
  // "To:" label has to drop onto its own line there is a free row of height,
  // so Reply stacks underneath Reply All instead. The pair is then taken out
  // of flow (absolutely positioned, centred on where the lone Reply button
  // sits) so the card only grows by the relocated "To:" line.
  const headerRef = useRef(null)
  const sentInfoRef = useRef(null)
  const toInfoRef = useRef(null)
  const buttonsRef = useRef(null)
  const replyBtnRef = useRef(null)
  const replyAllBtnRef = useRef(null)
  const [stacked, setStacked] = useState(false)
  const [gutter, setGutter] = useState(0)
  const [stackOffset, setStackOffset] = useState(0)

  const showReply = Boolean(canReply) && !replyOpen
  const showReplyAll = Boolean(canReplyAll) && !replyOpen
  const bothButtonsVisible = showReply && showReplyAll
  // Stacked buttons have to live inside the height the "To:" line frees up,
  // so they shed a little vertical padding rather than growing the card.
  const btnPadding = stacked ? '0.05rem 0.55rem' : '0.15rem 0.55rem'

  useEffect(() => {
    const header = headerRef.current
    const sentInfo = sentInfoRef.current
    const toInfo = toInfoRef.current
    if (!header || !sentInfo || !toInfo || !bothButtonsVisible) {
      setStacked(false)
      setGutter(0)
      setStackOffset(0)
      return
    }

    let alive = true
    const HEADER_GAP = 6.4 // gap between the info column and the buttons

    const evaluate = () => {
      if (!alive) return
      const wrapped = toInfo.getBoundingClientRect().top > sentInfo.getBoundingClientRect().top + 2
      if (wrapped && !stacked) {
        // Measured while still laid out in a row, before we switch modes.
        const replyWidth = replyBtnRef.current?.offsetWidth || 0
        const replyAllWidth = replyAllBtnRef.current?.offsetWidth || 0
        const stackWidth = Math.max(replyWidth, replyAllWidth)
        const rowWidth = buttonsRef.current?.offsetWidth || stackWidth
        setGutter(rowWidth + HEADER_GAP)
        setStackOffset((replyWidth - stackWidth) / 2)
        setStacked(true)
      } else if (!wrapped && stacked) {
        setGutter(0)
        setStackOffset(0)
        setStacked(false)
      }
    }

    evaluate()
    const observer = new ResizeObserver(evaluate)
    observer.observe(header)
    window.addEventListener('resize', evaluate)
    if (document.fonts?.ready) document.fonts.ready.then(evaluate).catch(() => {})
    return () => {
      alive = false
      observer.disconnect()
      window.removeEventListener('resize', evaluate)
    }
  }, [bothButtonsVisible, stacked, recipientLabelProp, m.id])

  useEffect(() => {
    if (!groupOpen) return
    function onDown(e) {
      if (groupRef.current && !groupRef.current.contains(e.target)) setGroupOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [groupOpen])

  return (
    <div
      style={{
        padding: '0.75rem 1rem',
        background: isUnread || isHighlighted ? 'rgba(2,65,107,0.06)' : 'var(--bg)',
        borderRadius: '8px',
        border: `1px solid ${isUnread || isHighlighted ? 'rgba(2,65,107,0.5)' : 'var(--border)'}`,
      }}
    >
      <div
        ref={headerRef}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.4rem',
          flexWrap: 'wrap',
          gap: '0.4rem',
          minHeight: '24px',
          position: 'relative',
          paddingRight: stacked ? gutter : 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', flex: '1 1 0%', minWidth: 0 }}>
          {isUnread || isHighlighted ? (
            <div
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: 'var(--accent)',
                flexShrink: 0,
              }}
            />
          ) : null}
          <span
            style={{
              fontWeight: isUnread || isHighlighted ? 700 : 600,
              fontSize: '0.8rem',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {senderLabel || m.sender?.full_name || 'Unknown'}
          </span>
          <span
            style={{
              display: 'inline-flex',
              flexWrap: 'wrap',
              columnGap: '0.35rem',
              color: 'var(--muted)',
              fontSize: '0.68rem',
              fontFamily: 'DM Mono, monospace',
            }}
          >
            <span ref={sentInfoRef} style={{ whiteSpace: 'nowrap' }}>
              {formatDateTime(m.created_at)}{recipientLabelProp ? ',' : ''}
            </span>
            {!isGroupChat && recipientLabelProp && (
              <span ref={toInfoRef} style={{ whiteSpace: 'nowrap' }}>{toPrefix}{emphasise(toName)}</span>
            )}
            {isGroupChat && recipientLabelProp && (
              <span ref={toInfoRef} style={{ whiteSpace: 'nowrap' }}>To:{' '}
              <span ref={groupRef} style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  onClick={e => { e.stopPropagation(); setGroupOpen(o => !o) }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: 'var(--muted)',
                    fontSize: '0.68rem',
                    fontFamily: 'DM Mono, monospace',
                    textDecoration: 'underline',
                    textUnderlineOffset: '2px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {emphasise(groupShort)} {groupOpen ? '˄' : '˅'}
                </button>
                {groupOpen && (
                  <span
                    onClick={e => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: 0,
                      zIndex: 200,
                      cursor: 'default',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                      padding: '0.5rem 0.75rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.15rem',
                      minWidth: '10rem',
                      whiteSpace: 'normal',
                    }}
                  >
                    {(groupMemberNames && groupMemberNames.length > 0
                      ? groupMemberNames
                      : ['No members found']
                    ).map(name => (
                      <span key={name} style={{ fontSize: '0.78rem', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        {name}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              </span>
            )}
          </span>
        </div>

        <div
          ref={buttonsRef}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            ...(stacked
              ? {
                  position: 'absolute',
                  right: stackOffset,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  flexDirection: 'column',
                  gap: '0.15rem',
                }
              : null),
          }}
        >
          {showReplyAll && (
            <button
              ref={replyAllBtnRef}
              onClick={e => { e.stopPropagation(); onReplyAll?.() }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: btnPadding,
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: '100px',
                color: 'var(--muted)',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
            >
              <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 14 4 9 9 4" />
                <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
              </svg>
              Reply All
            </button>
          )}
          {showReply && (
            <button
              ref={replyBtnRef}
              onClick={e => { e.stopPropagation(); onReply?.() }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: btnPadding,
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: '100px',
                color: 'var(--muted)',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
            >
              <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 14 4 9 9 4" />
                <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
              </svg>
              Reply
            </button>
          )}
        </div>
      </div>

      {m.body && (
        <div
          style={{
            fontSize: '0.92rem',
            lineHeight: 1.5,
            margin: 0,
            marginBottom: m.image_url ? '0.75rem' : 0,
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
          }}
        >
          {formatBody(m.body)}
        </div>
      )}

      {m.image_url && (
        <img
          src={m.image_url}
          alt="Attached"
          onClick={() => setLightboxUrl(m.image_url)}
          style={{
            maxWidth: '100%',
            maxHeight: '260px',
            borderRadius: '8px',
            objectFit: 'cover',
            cursor: 'zoom-in',
            border: '1px solid var(--border)',
            display: 'block',
            marginTop: m.body ? '0.5rem' : 0,
          }}
        />
      )}
    </div>
  )
}