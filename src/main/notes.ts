import type { BookRecord, Highlight, NewHighlight } from '../shared/types'

const HAND = '\n## 手记\n'

function quoteBlock(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => `> ${line.trim()}`)
    .join('\n')
}

function stamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function renderMarkdown(
  book: Pick<BookRecord, 'title' | 'author' | 'format'>,
  highlights: Highlight[],
  freeform: string,
  options?: { stampHighlights?: boolean; stampFreeform?: boolean; freeformUpdatedAt?: string },
): string {
  const stampHighlights = options?.stampHighlights !== false
  const stampFreeform = options?.stampFreeform !== false
  const lines = [
    `# ${book.title || '未命名'}`,
    '',
    `- 作者：${book.author || '佚名'}`,
    `- 格式：${book.format}`,
    '',
    '划线写在这一节。文末「手记」留给手写内容，更新划线时会原样保留。',
    '',
    '## 划线',
    '',
  ]
  const ordered = [...highlights].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  if (!ordered.length) lines.push('还没有划线。', '')
  for (const item of ordered) {
    const chapter = item.chapter.trim()
    const heading = stampHighlights
      ? (chapter ? `${stamp(item.createdAt)} · ${chapter}` : stamp(item.createdAt))
      : (chapter || '划线')
    lines.push(`### ${heading}`, '', quoteBlock(item.text), '')
    if (item.note.trim()) lines.push(`批注：${item.note.trim()}`, '')
    lines.push(`<!-- codex:id=${item.id}&cfi=${encodeURIComponent(item.cfi)} -->`, '')
  }
  const tail = freeform.replace(/^\n+/, '').replace(/\s+$/, '')
  const when = stampFreeform && tail && options?.freeformUpdatedAt ? `${stamp(options.freeformUpdatedAt)}\n\n` : ''
  return `${lines.join('\n')}${HAND}${when}${tail ? `${tail}\n` : ''}`
}

export function splitMarkdown(markdown: string): { freeform: string } {
  const index = markdown.indexOf(HAND)
  if (index < 0) return { freeform: '' }
  const freeform = markdown.slice(index + HAND.length).replace(/^\n/, '').replace(/\s+$/, '')
  return { freeform: freeform.replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}\n+/, '') }
}

export function highlightsFromMarkdown(markdown: string): Highlight[] {
  const body = markdown.split(HAND)[0] || ''
  const chunks = body.split(/^### /m).slice(1)
  const highlights: Highlight[] = []
  for (const chunk of chunks) {
    const marker = chunk.match(/<!--\s*codex:([^>]+?)\s*-->/)
    if (!marker) continue
    const params = new URLSearchParams(marker[1].replace(/&amp;/g, '&'))
    const id = params.get('id') || ''
    const cfi = params.get('cfi') ? decodeURIComponent(params.get('cfi') || '') : ''
    if (!id || !cfi) continue
    const quoted = [...chunk.matchAll(/^> ?(.*)$/gm)].map((match) => match[1]).join('\n').trim()
    const note = chunk.match(/^批注：(.+)$/m)?.[1]?.trim() || ''
    const heading = (chunk.split('\n')[0] || '').trim()
    const chapter = /^\d{4}-\d{2}-\d{2}/.test(heading)
      ? (heading.includes(' · ') ? heading.split(' · ').slice(1).join(' · ').trim() : '')
      : (heading === '划线' ? '' : heading)
    highlights.push({
      id,
      cfi,
      text: quoted,
      note,
      chapter,
      createdAt: new Date().toISOString(),
    })
  }
  return highlights
}

export function createHighlight(input: NewHighlight): Highlight | null {
  const text = input.text.replace(/\r\n/g, '\n').trim()
  const cfi = input.cfi.trim()
  if (!text || !cfi) return null
  return {
    id: crypto.randomUUID(),
    cfi,
    text: text.slice(0, 8000),
    note: (input.note || '').trim(),
    chapter: (input.chapter || '').trim(),
    createdAt: new Date().toISOString(),
  }
}
