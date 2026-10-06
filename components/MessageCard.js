import { useState, useRef, useEffect } from 'react'
import { formatDateTime } from '../lib/timeUtils'
import { recipientLabel, isMultiRecipient, splitToLabel, parseAttachments, isImageAttachment, downloadAttachment } from '../lib/messageUtils'

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

export function MessageCard({ m, readMessageIds, user, setLightboxUrl, senderLabel, canReply, onReply, isHighlighted, recipientLabel: recipientLabelProp, groupMemberNames }) {
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

  // ── Reply header layout ────────────────────────────────────────────────────
  const showReply = Boolean(canReply)

  // Attachments live in image_url as JSON (legacy rows hold a bare image URL).
  // Images stack vertically after the text; every other file gets its own
  // one-line download card below them.
  const attachments = parseAttachments(m.image_url)
  const imageAttachments = attachments.filter(isImageAttachment)
  const fileAttachments = attachments.filter(a => !isImageAttachment(a))
  const hasBody = Boolean(m.body)
  const hasAttachments = attachments.length > 0

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
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.4rem',
          flexWrap: 'wrap',
          gap: '0.4rem',
          minHeight: '24px',
          position: 'relative',
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
            <span style={{ whiteSpace: 'nowrap' }}>
              {formatDateTime(m.created_at)}{recipientLabelProp ? ',' : ''}
            </span>
            {!isGroupChat && recipientLabelProp && (
              <span style={{ whiteSpace: 'nowrap' }}>{toPrefix}{emphasise(toName)}</span>
            )}
            {isGroupChat && recipientLabelProp && (
              <span style={{ whiteSpace: 'nowrap' }}>To:{' '}
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
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {showReply && (
            <button
              onClick={e => { e.stopPropagation(); onReply?.() }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.15rem 0.55rem',
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
            marginBottom: hasAttachments ? '0.75rem' : 0,
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
          }}
        >
          {formatBody(m.body)}
        </div>
      )}

      {imageAttachments.map((att, idx) => (
        <img
          key={att.url}
          src={att.url}
          alt={att.name || 'Attached image'}
          onClick={() => setLightboxUrl(att.url)}
          style={{
            maxWidth: '100%',
            maxHeight: '260px',
            borderRadius: '8px',
            objectFit: 'cover',
            cursor: 'zoom-in',
            border: '1px solid var(--border)',
            display: 'block',
            marginTop: (hasBody || idx > 0) ? '0.5rem' : 0,
          }}
        />
      ))}

      {fileAttachments.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
            marginTop: (hasBody || imageAttachments.length) ? '0.5rem' : 0,
          }}
        >
          {fileAttachments.map(att => (
            <button
              key={att.url}
              type="button"
              title={`Download ${att.name}`}
              onClick={() => downloadAttachment(att)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                width: '100%',
                height: '2.25rem',
                padding: '0 0.7rem',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              <span
                style={{
                  fontSize: '0.85rem',
                  color: '#0369a1',
                  textDecoration: 'underline',
                  textUnderlineOffset: '2px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {att.name || 'File'}
              </span>
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ flexShrink: 0 }}
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}