'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    await supabase.auth.signOut()
    setDone(true)
    setLoading(false)
  }

  const inputStyle = {
    width: '100%', padding: '0.75rem 1rem',
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: '8px', color: 'var(--text)',
    fontSize: '0.95rem', outline: 'none',
    fontFamily: 'DM Sans, sans-serif',
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '1rem',
    }}>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        opacity: 0.3,
      }} />

      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: '400px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '2.5rem',
        boxShadow: '0 0 60px rgba(74,222,128,0.05)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img
            src="/logo3.png"
            alt="Logo"
            style={{ width: '120px', height: 'auto', display: 'block', margin: '0 auto 1rem', borderRadius: '12px' }}
          />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            New Password
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            {done ? 'Your password has been updated.' : 'Choose a new password for your account.'}
          </p>
        </div>

        {done ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{
              background: 'rgba(74,222,128,0.08)', border: '1px solid var(--accent)',
              borderRadius: '8px', padding: '0.75rem 1rem',
              color: 'var(--accent)', fontSize: '0.875rem', textAlign: 'center',
            }}>
              Password updated successfully! You can now sign in with your new password.
            </div>
            <a href="/" style={{
              display: 'block', textAlign: 'center', padding: '0.85rem',
              background: 'var(--accent)', color: '#fff', fontWeight: 600,
              border: 'none', borderRadius: '8px', fontSize: '0.95rem',
              textDecoration: 'none', fontFamily: 'DM Sans, sans-serif',
            }}>
              Go to Sign In
            </a>
          </div>
        ) : !ready ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem', padding: '1rem 0' }}>
            <p>Verifying your reset link…</p>
            <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
              If nothing happens, your link may have expired.{' '}
              <a href="/forgot-password" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                Request a new one.
              </a>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{
                display: 'block', fontSize: '0.8rem', color: 'var(--muted)',
                marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                New Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="Min 6 characters"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{
                display: 'block', fontSize: '0.8rem', color: 'var(--muted)',
                marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                Confirm Password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                placeholder="Repeat new password"
                style={inputStyle}
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(248,113,113,0.1)', border: '1px solid var(--danger)',
                borderRadius: '8px', padding: '0.75rem 1rem',
                color: 'var(--danger)', fontSize: '0.875rem',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '0.85rem',
                background: loading ? 'var(--accent-dim)' : 'var(--accent)',
                color: '#fff', fontWeight: 600,
                border: 'none', borderRadius: '8px',
                fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}