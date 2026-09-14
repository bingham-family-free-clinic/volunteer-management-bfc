'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'

const ConfirmContext = createContext(null)

const DEFAULTS = {
  label: 'Are you sure?',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  danger: false,
}

/* how to use the confirm dialog:

async function ACTION() {
  const ok = await confirm({
    label: 'LABEL',
    confirmText: 'YES',
    cancelText: 'NO',
    danger: T/F,
  })
  if (!ok) return
  // ...proceed with the action
}

If danger is true the confirmation button will be red.
*/
export function ConfirmDialogProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const resolver = useRef(null)

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      resolver.current = resolve
      setDialog({ ...DEFAULTS, ...options })
    })
  }, [])

  function handleChoice(result) {
    setDialog(null)
    if (resolver.current) {
      resolver.current(result)
      resolver.current = null
    }
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <div
          onClick={() => handleChoice(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '360px',
              width: '100%',
              boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            }}
          >
            <p
              style={{
                color: 'var(--text)',
                fontSize: '0.95rem',
                fontFamily: 'DM Sans, sans-serif',
                lineHeight: 1.5,
                marginBottom: '1.25rem',
              }}
            >
              {dialog.label}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => handleChoice(false)}
                style={{
                  padding: '0.6rem 1.1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: '0.9rem',
                  fontFamily: 'DM Sans, sans-serif',
                  cursor: 'pointer',
                }}
              >
                {dialog.cancelText}
              </button>
              <button
                onClick={() => handleChoice(true)}
                style={{
                  padding: '0.6rem 1.1rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: dialog.danger ? 'var(--danger)' : 'var(--accent)',
                  color: '#fff',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  fontFamily: 'DM Sans, sans-serif',
                  cursor: 'pointer',
                }}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    throw new Error('useConfirm must be used within a ConfirmDialogProvider')
  }
  return ctx
}
