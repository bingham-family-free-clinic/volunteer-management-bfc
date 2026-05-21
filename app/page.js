'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [showPassword, setShowPassword] = useState(false)

  // Forgot password state
  const [forgotMode, setForgotMode] = useState(false)
  const [resetSubmitted, setResetSubmitted] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        window.location.href = '/volunteer'
      } else {
        setLoading(false)
      }
    })
  }, [])

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    window.location.href = '/volunteer'
  }

  async function handleForgotPassword(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://volunteer-management-bfc.vercel.app/reset-password',
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setResetSubmitted(true)
    setLoading(false)
  }

  function switchToForgot() {
    setForgotMode(true)
    setError('')
    setEmail('')
  }

  function switchToLogin() {
    setForgotMode(false)
    setError('')
    setEmail('')
    setResetSubmitted(false)
  }

  const inputStyle = {
    width: '100%', padding: '0.75rem 1rem',
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: '8px', color: 'var(--text)',
    fontSize: '0.95rem', outline: 'none',
    fontFamily: 'DM Sans, sans-serif',
  }

  if (loading) return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)'
    }}>
      <p style={{ color: 'var(--muted)' }}>Loading...</p>
    </div>
  )

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
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        background: `
          radial-gradient(
            ellipse at center,
            rgba(0,0,0,0) 0%,
            rgba(0,0,0,0.25) 100%
          ),
          var(--bg)
        `,
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

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img
            src="/logo3.png"
            alt="Logo"
            style={{ width: '120px', height: 'auto', display: 'block', margin: '0 auto 1rem', borderRadius: '12px' }}
          />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 1500, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            {forgotMode ? 'Reset Password' : 'BFC Portal'}
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            {forgotMode
              ? resetSubmitted
                ? 'Check your email for a reset link.'
                : "Enter your email and we'll send you a reset link."
              : 'Sign in to your account'}
          </p>
        </div>

        {/* Forgot Password Flow */}
        {forgotMode ? (
          resetSubmitted ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{
                background: 'rgba(74,222,128,0.08)', border: '1px solid var(--accent)',
                borderRadius: '8px', padding: '0.75rem 1rem',
                color: 'var(--accent)', fontSize: '0.875rem', textAlign: 'center',
              }}>
                Email sent to <strong>{email}</strong>. Follow the link to reset your password. Check your spam folder if you don't see it.
              </div>
              <button
                type="button"
                onClick={switchToLogin}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  textAlign: 'center', color: 'var(--muted)', fontSize: '0.875rem',
                  marginTop: '0.5rem', fontFamily: 'DM Sans, sans-serif',
                }}
              >
                ← Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{
                  display: 'block', fontSize: '0.8rem', color: 'var(--muted)',
                  marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
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
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>

              <button
                type="button"
                onClick={switchToLogin}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  textAlign: 'center', color: 'var(--muted)', fontSize: '0.875rem',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                ← Back to sign in
              </button>
            </form>
          )

        ) : (

          /* Login Flow */
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{
                display: 'block', fontSize: '0.8rem', color: 'var(--muted)',
                marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                style={inputStyle}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label style={{
                  fontSize: '0.8rem', color: 'var(--muted)',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  Password
                </label>
                <button
                  type="button"
                  onClick={switchToForgot}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--muted)', fontSize: '0.75rem',
                    fontFamily: 'DM Sans, sans-serif', padding: 0,
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  style={{ ...inputStyle, padding: '0.75rem 2.5rem 0.75rem 1rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  style={{
                    position: 'absolute', right: '10px', top: '50%',
                    transform: 'translateY(-50%)', background: 'transparent',
                    border: 'none', cursor: 'pointer', color: 'var(--muted)',
                    fontSize: '0.9rem',
                  }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
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
                color: '#ffffff', fontWeight: 600,
                border: 'none', borderRadius: '8px',
                fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}

      </div>
    </div>
  )
}