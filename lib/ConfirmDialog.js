/* how to use the confirm dialog:

add this to imports:
import { useConfirm } from '../../lib/ConfirmDialog'

add this to the main component:
// ── Confirmation modal hook ─────────────────────────────────────────────
const confirmAction = useConfirm()

insert before the action you want to confirm:
const ok = await confirmAction({
  label: 'LABEL',
  confirmText: 'YES',
  cancelText: 'NO',
  danger: T/F,
})
if (!ok) return

//If danger is true the confirmation button will be red.
*/

'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'

const ConfirmContext = createContext(null)

const DEFAULTS = {
  label: 'Are you sure?',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  danger: false,
}

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
            background: 'rgba(0,0,0,0.6)',
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
              background: '#fff',
              borderRadius: '16px',
              padding: '1.75rem 1.5rem',
              maxWidth: '340px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
            }}
          >
            <p
              style={{
                fontSize: '1rem',
                fontWeight: 500,
                color: '#1a1a1a',
                lineHeight: 1.5,
                marginBottom: '1.5rem',
              }}
            >
              {dialog.label}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => handleChoice(true)}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: dialog.danger ? '#8a0101' : '#02416B',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                {dialog.confirmText}
              </button>
              <button
                onClick={() => handleChoice(false)}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: '#fff',
                  color: '#02416B',
                  border: '1px solid #02416B',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                {dialog.cancelText}
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