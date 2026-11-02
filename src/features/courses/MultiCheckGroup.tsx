import { useId, useState } from 'react'
import { Button } from '@/components/ui'

export type CheckOption = { value: string; label: string }

export function MultiCheckGroup({
  legend, options, value, onChange, error, customLabel, customAdd,
}: {
  legend: string
  options: readonly CheckOption[]
  value: string[]
  onChange: (next: string[]) => void
  error?: string
  customLabel?: string
  customAdd?: string
}) {
  const id = useId()
  const [draft, setDraft] = useState('')
  const known = new Set(options.map((option) => option.value))
  const extras = value.filter((item) => !known.has(item))
  const all: CheckOption[] = [...options, ...extras.map((item) => ({ value: item, label: item }))]

  function toggle(item: string, checked: boolean) {
    onChange(checked ? [...value, item] : value.filter((current) => current !== item))
  }
  function addCustom() {
    const text = draft.trim().replace(/,/g, ' ')
    if (!text) return
    if (!value.includes(text)) onChange([...value, text])
    setDraft('')
  }

  return (
    <fieldset className="grid gap-2" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="text-sm font-semibold">{legend}</legend>
      <div className="grid gap-1 sm:grid-cols-2">
        {all.map((option) => (
          <label key={option.value} className="flex min-h-11 items-center gap-3">
            <input type="checkbox" className="size-5 accent-brand"
              checked={value.includes(option.value)}
              onChange={(event) => toggle(option.value, event.target.checked)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {customLabel && (
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label={customLabel} placeholder={customLabel} value={draft} maxLength={60}
            className="min-h-11 flex-1 rounded-control border border-border bg-surface px-3"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); addCustom() }
            }} />
          <Button variant="secondary" disabled={!draft.trim()} onClick={addCustom}>
            {customAdd ?? 'Agregar'}
          </Button>
        </div>
      )}
      {error && <p id={`${id}-error`} role="alert" className="text-error">{error}</p>}
    </fieldset>
  )
}
