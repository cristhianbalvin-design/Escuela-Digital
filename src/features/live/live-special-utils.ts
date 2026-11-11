export function countdownSeconds(openedAt: string, total: number, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(openedAt) + total * 1000 - now) / 1000))
}

export function streakBadge(streak: number, language = 'es'): string | null {
  if (language.startsWith('en')) {
    if (streak >= 4) return `🏆 ${streak} in a row`
    if (streak === 3) return '🔥 3 in a row'
    if (streak === 2) return '2 in a row'
    return null
  }
  if (streak >= 4) return `🏆 Racha de ${streak}`
  if (streak === 3) return '🔥 Racha de 3'
  if (streak === 2) return '2 seguidas'
  return null
}

export type MarkdownBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'paragraph'; lines: string[] }

/** Keeps all source text as text nodes when rendered by React. */
export function parseSafeMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const isTableStart = (position: number) => position + 1 < lines.length && lines[position]!.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[position + 1]!)
  const blocks: MarkdownBlock[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]!
    if (!line.trim()) { index++; continue }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading) { blocks.push({ kind: 'heading', level: heading[1]!.length, text: heading[2]! }); index++; continue }
    const list = /^(\s*)(-|\d+\.)\s+(.+)$/.exec(line)
    if (list) {
      const ordered = list[2] !== '-'; const items: string[] = []
      while (index < lines.length) {
        const match = /^(\s*)(-|\d+\.)\s+(.+)$/.exec(lines[index]!)
        if (!match || (match[2] !== '-') !== ordered) break
        items.push(match[3]!); index++
      }
      blocks.push({ kind: 'list', ordered, items }); continue
    }
    if (isTableStart(index)) {
      const cells = (value: string) => value.trim().replace(/^\||\|$/g, '').split('|').map((part) => part.trim())
      const rows = [cells(line)]; index += 2
      while (index < lines.length && lines[index]!.includes('|') && lines[index]!.trim()) rows.push(cells(lines[index++]!))
      blocks.push({ kind: 'table', rows }); continue
    }
    const paragraph: string[] = []
    while (index < lines.length && lines[index]!.trim() && !isTableStart(index) && !/^(#{1,6}\s|\s*(?:-|\d+\.)\s)/.test(lines[index]!)) paragraph.push(lines[index++]!)
    blocks.push({ kind: 'paragraph', lines: paragraph })
  }
  return blocks
}
