import type { Json } from '@/lib/supabase/database.types'

export function LessonContent({ content }: { content: Json }) {
  if (content && typeof content === 'object' && !Array.isArray(content) &&
    typeof content.text === 'string') {
    return <div className="whitespace-pre-wrap text-sm">{content.text}</div>
  }

  return (
    <pre className="overflow-auto whitespace-pre-wrap text-sm">
      {JSON.stringify(content, null, 2)}
    </pre>
  )
}
