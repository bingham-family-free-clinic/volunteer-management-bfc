import { useState } from 'react'

export default function ChatBot() {
  const [question, setQuestion] = useState('')
  const [entry, setEntry] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
  const inputStyle = { width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', fontFamily: 'DM Sans, sans-serif' }
  const labelStyle = { display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }

  const isRetryable = (code) =>
    code === 'gemini' || code === 'rate_limit' || code === 'unknown'

  async function ask(e, qOverride) {
    e.preventDefault()
    const q = (qOverride || question || '').trim()
    if (!q || loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const data = await res.json()
      const next = {
        question: q,
        answer: data.answer,
        error: data.error,
        errorCode: data.errorCode,
        sources: data.sources || [],
        placeholder: Boolean(data.placeholder),
        at: new Date(),
      }
      setEntry(next)
      setHistory(prev => [next, ...prev])
    } catch (err) {
      const next = {
        question: q,
        error: err.message || 'Request failed. Please check your connection and try again.',
        errorCode: 'unknown',
        sources: [],
        placeholder: false,
        at: new Date(),
      }
      setEntry(next)
      setHistory(prev => [next, ...prev])
    } finally {
      setLoading(false)
    }
  }

  function retry() {
    if (entry && entry.question) {
      ask({ preventDefault: () => {} }, entry.question)
    }
  }

  function errorBanner(entry) {
    const code = entry.errorCode
    const retryable = isRetryable(code)
    const title =
      code === 'config'
        ? 'Not configured'
        : code === 'retrieval'
        ? 'No relevant documentation'
        : code === 'rate_limit'
        ? 'Too many requests'
        : code === 'gemini'
        ? 'AI service unavailable'
        : 'Something went wrong'
    const detail =
      code === 'config'
        ? 'A Gemini API key is missing. Ask your administrator to set GEMINI_API_KEY.'
        : code === 'retrieval'
        ? "Try rephrasing your question or ask about scheduling, attendance, volunteers, messaging, or permissions."
        : code === 'rate_limit'
        ? 'You have sent too many requests. Please wait a moment before trying again.'
        : code === 'gemini'
        ? 'The AI service is having trouble right now.'
        : 'The chatbot encountered an unexpected error.'

    return (
      <div
        style={{
          padding: '0.9rem 1.1rem',
          borderRadius: '10px',
          border: '1px solid rgba(239,68,68,0.25)',
          background: 'rgba(239,68,68,0.06)',
          color: '#ef4444',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#ef4444',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {title}
          </span>
          {retryable && (
            <button
              onClick={retry}
              style={{
                padding: '0.25rem 0.6rem',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              Try again
            </button>
          )}
        </div>
        <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>{detail}</p>
        {code && (
          <div
            style={{
              marginTop: '0.4rem',
              padding: '0.4rem 0.7rem',
              background: 'rgba(15, 23, 42, 0.05)',
              borderRadius: '6px',
              border: '1px dashed rgba(15, 23, 42, 0.15)',
            }}
          >
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>error code</span>
            <span
              style={{
                display: 'inline-block',
                marginLeft: '0.5rem',
                fontSize: '0.78rem',
                fontFamily: 'DM Mono, monospace',
                color: 'var(--text)',
              }}
            >
              {code}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '820px' }}>
      <h2 style={{ fontWeight: 600, fontSize: '1.15rem', margin: 0, color: 'var(--text)' }}>BFC ChatBot</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>
        Ask about scheduling, attendance, volunteers, messaging, permissions, and more. Answers come from the generated knowledge base.
      </p>

      <form onSubmit={ask} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <label style={labelStyle}>Question</label>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="e.g. How do I handle a shift callout?"
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', minHeight: '90px' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="submit"
            disabled={loading || !question.trim()}
            style={{ flex: 1, padding: '0.85rem 1.5rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', opacity: loading || !question.trim() ? 0.6 : 1 }}
          >
            {loading ? 'Asking…' : 'Ask'}
          </button>
          <button
            type="button"
            onClick={() => { setQuestion(''); setEntry(null) }}
            style={{ padding: '0.85rem 1.5rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
          >
            Clear
          </button>
        </div>
      </form>

      {entry && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {entry.error ? (
            errorBanner(entry)
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Answer</span>
                {entry.placeholder && (
                  <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '100px', background: 'rgba(156,163,175,0.12)', color: 'var(--muted)', border: '1px solid rgba(156,163,175,0.25)', fontWeight: 600 }}>placeholder</span>
                )}
              </div>
              <div style={{ background: 'var(--bg)', padding: '1rem 1.25rem', borderRadius: '10px', border: '1px solid var(--border)', whiteSpace: 'pre-wrap', fontSize: '0.95rem', lineHeight: 1.55, color: 'var(--text)' }}>{entry.answer}</div>
              {entry.sources && entry.sources.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sources:</span>
                  {entry.sources.map((s, i) => (
                    <span key={i} style={{ fontSize: '0.8rem', padding: '0.2rem 0.55rem', borderRadius: '6px', background: 'rgba(2,65,107,0.08)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.25)', fontFamily: 'DM Mono, monospace' }}>{s}</span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {history.length > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recent</div>
          {history.slice(1).map((h, i) => (
            <div
              key={i}
              style={{
                padding: '0.6rem 0.9rem',
                borderRadius: '8px',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onClick={() => setEntry(h)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.question}</p>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>{h.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {h.error ? (
                <p style={{ fontSize: '0.75rem', color: '#ef4444', margin: '0.3rem 0 0', fontStyle: 'italic' }}>{h.error}</p>
              ) : h.sources && h.sources.length > 0 && (
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '0.3rem 0 0', fontStyle: 'italic' }}>Sources: {h.sources.join(', ')}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
