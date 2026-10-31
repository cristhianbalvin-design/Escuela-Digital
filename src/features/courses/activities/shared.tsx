export function errorText(error: unknown): string | null {
  if (!error) return null
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return 'Error desconocido'
}

export function MutationError({ error }: { error: unknown }) {
  const message = errorText(error)
  return message ? <p role="alert" className="text-sm text-error">{message}</p> : null
}

export function FieldError({ message }: { message?: string }) {
  return message ? <p role="alert" className="text-sm text-error">{message}</p> : null
}

export const controlClass =
  'min-h-11 w-full rounded-control border border-border bg-surface px-3 text-text focus-visible:outline-3 disabled:opacity-50'
export const areaClass =
  'min-h-24 w-full rounded-control border border-border bg-surface p-3 text-text focus-visible:outline-3 disabled:opacity-50'
