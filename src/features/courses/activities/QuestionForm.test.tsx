import '@/lib/i18n'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QuestionForm } from './QuestionForm'

function setup() {
  const onSubmit = vi.fn()
  render(<QuestionForm editable isEdit={false} pending={false} error={null}
    onSubmit={onSubmit} onCancel={() => undefined} />)
  fireEvent.change(screen.getByLabelText('Enunciado'), { target: { value: 'Capital de Perú' } })
  fireEvent.change(screen.getByLabelText('Opción 1'), { target: { value: 'Lima' } })
  fireEvent.change(screen.getByLabelText('Opción 2'), { target: { value: 'Cusco' } })
  return onSubmit
}

afterEach(cleanup)

describe('QuestionForm', () => {
  it('envía la forma esperada con dos opciones y una correcta', async () => {
    const onSubmit = setup()
    fireEvent.click(screen.getByLabelText('Marcar la opción 1 como correcta'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar pregunta' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      type: 'single', prompt: 'Capital de Perú', points: 1,
      options: [{ label: 'Lima' }, { label: 'Cusco' }], correct: [0],
    })
  })
  it('sin respuesta correcta muestra el error y no envía', async () => {
    const onSubmit = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar pregunta' }))
    expect(await screen.findByText('Marca exactamente una respuesta correcta')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
