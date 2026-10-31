import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LessonContent } from './LessonContent'

describe('LessonContent', () => {
  it('muestra content.text como texto y conserva los saltos de línea', () => {
    render(<LessonContent content={{ text: 'Primera línea\nSegunda línea', format: 'plain' }} />)
    const content = screen.getByText('Primera línea\nSegunda línea', {
      normalizer: (text) => text,
    })
    expect(content).toHaveClass('whitespace-pre-wrap')
    expect(content).not.toHaveTextContent('"text"')
  })

  it('mantiene JSON de solo lectura para otras formas de contenido', () => {
    render(<LessonContent content={{ url: 'https://example.com' }} />)
    expect(screen.getByText(/"url": "https:\/\/example.com"/)).toBeInTheDocument()
  })
})
