import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SafeMarkdown } from './SafeMarkdown'
import { countdownSeconds, parseSafeMarkdown, streakBadge } from './live-special-utils'

describe('special live utilities', () => {
  it('renders markdown as escaped text', () => {
    const html = renderToStaticMarkup(<SafeMarkdown source={'# Title\n<script>alert(1)</script> **bold** `code`\n\n| a | b |\n|---|---|\n| <img> | x |'} />)
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;img&gt;')
    expect(html).not.toContain('<script>')
    expect(parseSafeMarkdown('- one\n- two')[0]).toMatchObject({ kind: 'list', items: ['one', 'two'] })
    expect(parseSafeMarkdown('Paragraph\n| a | b |\n|---|---|\n| x | y |').map((block) => block.kind)).toEqual(['paragraph', 'table'])
  })
  it('computes badges and countdown boundaries', () => {
    expect([0, 1, 2, 3, 4].map((streak) => streakBadge(streak))).toEqual([null, null, '2 seguidas', '🔥 Racha de 3', '🏆 Racha de 4'])
    expect(streakBadge(3, 'en')).toBe('🔥 3 in a row')
    expect(countdownSeconds('2026-01-01T00:00:00Z', 10, Date.parse('2026-01-01T00:00:03Z'))).toBe(7)
    expect(countdownSeconds('2026-01-01T00:00:00Z', 10, Date.parse('2026-01-01T00:00:11Z'))).toBe(0)
  })
})
