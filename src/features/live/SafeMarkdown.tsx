import type { ReactNode } from 'react'
import { parseSafeMarkdown } from './live-special-utils'

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> :
      part.startsWith('`') && part.endsWith('`') ? <code key={index} className="rounded bg-brand-soft px-1">{part.slice(1, -1)}</code> : part)
}

export function SafeMarkdown({ source }: { source: string }) {
  return <div className="space-y-3 break-words">{parseSafeMarkdown(source).map((block, index) => {
    if (block.kind === 'heading') {
      const className = block.level <= 2 ? 'text-2xl font-bold' : 'text-lg font-semibold'
      return <div key={index} role="heading" aria-level={block.level} className={className}>{inline(block.text)}</div>
    }
    if (block.kind === 'list') {
      const Tag = block.ordered ? 'ol' : 'ul'
      return <Tag key={index} className={block.ordered ? 'list-decimal pl-6' : 'list-disc pl-6'}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}</Tag>
    }
    if (block.kind === 'table') return <div key={index} className="overflow-x-auto"><table className="w-full border-collapse text-left"><thead><tr>{block.rows[0]?.map((cell, cellIndex) => <th key={cellIndex} className="border border-border p-2">{inline(cell)}</th>)}</tr></thead><tbody>{block.rows.slice(1).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="border border-border p-2">{inline(cell)}</td>)}</tr>)}</tbody></table></div>
    return <p key={index}>{block.lines.map((line, lineIndex) => <span key={lineIndex}>{lineIndex > 0 && <br />}{inline(line)}</span>)}</p>
  })}</div>
}
