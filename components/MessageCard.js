import { formatDateTime } from '../lib/timeUtils'
import { recipientLabel } from '../lib/messageUtils'

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

export function MessageCard({ m, readMessageIds, user, setLightboxUrl, senderLabel, canReply, replyOpen, onReply }) {
  const isUnread =
    readMessageIds &&
    !readMessageIds.has(m.id) &&
    m.sender_id !== user?.id

  return (
    <div
      style={{
        padding: '0.75rem 1rem',
        background: isUnread ? 'rgba(2,65,107,0.04)' : 'var(--bg)',
        borderRadius: '8px',
        border: `1px solid ${
          isUnread ? 'rgba(2,65,107,0.35)' : 'var(--border)'
        }`,
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
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isUnread && (
            <div
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#ef4444',
                flexShrink: 0,
              }}
            />
          )}
          <span
            style={{
              fontWeight: isUnread ? 700 : 600,
              fontSize: '0.8rem',
            }}
          >
            {senderLabel || m.sender?.full_name || 'Unknown'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            style={{
              fontSize: '0.8rem',
              padding: '0.15rem 0.5rem',
              borderRadius: '100px',
              background: 'var(--surface)',
              color: 'var(--muted)',
              border: '1px solid var(--border)',
            }}
          >
            {recipientLabel(m)}
          </span>

          <span
            style={{
              color: 'var(--muted)',
              fontSize: '0.8rem',
              fontFamily: 'DM Mono, monospace',
            }}
          >
            {formatDateTime(m.created_at)}
          </span>

          {canReply && !replyOpen && (
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