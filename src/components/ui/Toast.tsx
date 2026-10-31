import { useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'

type Toast = { id: number; message: string }
import { ToastContext } from './toast-context'
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const { t } = useTranslation()
  function notify(message: string) {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, message }])
    window.setTimeout(
      () => setToasts((current) => current.filter((item) => item.id !== id)),
      5000,
    )
  }
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div
        className="fixed bottom-5 right-5 z-50 grid gap-2"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="flex min-h-11 items-center gap-3 rounded-control border border-border bg-surface-elevated px-4 py-2 shadow-lg"
          >
            <span>{toast.message}</span>
            <Button
              variant="ghost"
              aria-label={t('toastClose')}
              className="px-2"
              onClick={() =>
                setToasts((current) =>
                  current.filter((item) => item.id !== toast.id),
                )
              }
            >
              <X size={18} />
            </Button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
