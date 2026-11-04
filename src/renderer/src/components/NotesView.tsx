import { useEffect, useState } from 'react'
import type { BookRecord, Highlight, NotesDocument, Settings } from '@shared/types'
import { clock, formatWhen } from '../text'

export function NotesView({
  books,
  selectedId,
  onSelect,
  onOpen,
  settings,
  notify,
}: {
  books: BookRecord[]
  selectedId?: string
  onSelect: (id: string) => void
  onOpen: (id: string, cfi?: string) => void
  settings: Settings
  notify: (text: string) => void
}) {
  const selected = books.find((book) => book.id === selectedId) || books[0]
  const [doc, setDoc] = useState<NotesDocument | null>(null)
  const [freeform, setFreeform] = useState('')
  const [source, setSource] = useState(false)

  useEffect(() => {
    if (!selected) return
    let cancel = false
    window.codex.getNotes(selected.id).then((notes) => {
      if (cancel) return
      setDoc(notes)
      setFreeform(notes.freeform)
    }).catch((error: Error) => notify(error.message))
    return () => { cancel = true }
  }, [selected?.id, settings.stampHighlights, settings.stampFreeform])

  useEffect(() => {
    if (!selected || !doc || freeform === doc.freeform) return
    const timer = window.setTimeout(() => {
      window.codex.saveFreeform(selected.id, freeform).then(setDoc).catch((error: Error) => notify(error.message))
    }, 500)
    return () => window.clearTimeout(timer)
  }, [freeform, selected?.id])

  async function changeNote(item: Highlight, note: string) {
    if (!selected) return
    setDoc(await window.codex.updateHighlight(selected.id, item.id, note))
  }

  async function remove(item: Highlight) {
    if (!selected) return
    setDoc(await window.codex.deleteHighlight(selected.id, item.id))
  }

  if (!selected) {
    return <div className="empty"><div><h2>还没有笔记</h2><p>先把书收入书库，划线会写进 Markdown。</p></div></div>
  }

  return (
    <div className="notes-layout">
      <div className="notes-list">
        {books.map((book) => (
          <button key={book.id} className={`note-pick ${book.id === selected.id ? 'active' : ''}`} onClick={() => onSelect(book.id)}>
            <strong>{book.title}</strong>
            <span>{book.author || '佚名'} · {book.format}</span>
          </button>
        ))}
      </div>
      <div className="notes-detail">
        <div className="stage-head">
          <div>
            <h1>{selected.title}</h1>
            <p>{selected.author || '佚名'} · 笔记保存在 Markdown 文件里</p>
          </div>
          <div className="row-actions">
            <button className="btn" onClick={() => setSource((value) => !value)}>{source ? '查看划线' : '查看 Markdown'}</button>
            <button className="btn" onClick={() => { void window.codex.openNote(selected.id) }}>用编辑器打开</button>
          </div>
        </div>
        {source && <pre className="md-source">{doc?.markdown || ''}</pre>}
        {!source && (
          <>
            {(doc?.highlights || []).map((item) => (
              <article className="highlight-card" key={item.id}>
                <header>
                  <span>{highlightLabel(item, settings.stampHighlights)}</span>
                  <span className="row-actions">
                    <button className="btn quiet" onClick={() => onOpen(selected.id, item.cfi)}>回到此处</button>
                    <button className="btn quiet" onClick={() => { void remove(item) }}>删除</button>
                  </span>
                </header>
                <blockquote className="quote">{item.text}</blockquote>
                <textarea
                  className="freeform"
                  value={item.note}
                  placeholder="写一条批注"
                  onChange={(event) => {
                    const note = event.target.value
                    setDoc((current) => current && ({
                      ...current,
                      highlights: current.highlights.map((highlight) => highlight.id === item.id ? { ...highlight, note } : highlight),
                    }))
                  }}
                  onBlur={(event) => { void changeNote(item, event.target.value) }}
                />
              </article>
            ))}
            {doc && doc.highlights.length === 0 && <p className="meta">还没有划线。在阅读时选中文字，它会写到这里。</p>}
            <h2>手记</h2>
            {settings.stampFreeform && doc?.freeformUpdatedAt && <p className="meta">{clock(doc.freeformUpdatedAt)}</p>}
            <textarea className="freeform" style={{ minHeight: 160 }} value={freeform} placeholder="写一点不会被划线覆盖的笔记" onChange={(event) => setFreeform(event.target.value)} />
          </>
        )}
      </div>
    </div>
  )
}

function highlightLabel(item: Highlight, stamp: boolean): string {
  const when = stamp ? formatWhen(item.createdAt) : ''
  return [when, item.chapter].filter(Boolean).join(' · ') || '划线'
}
