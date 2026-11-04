import { useMemo, useState } from 'react'
import type { BookRecord } from '@shared/types'
import { coverHue, formatBytes, formatWhen, percent } from '../text'

export function LibraryView({
  books,
  ready,
  onOpen,
  onNotes,
  onImported,
  notify,
}: {
  books: BookRecord[]
  ready: boolean
  onOpen: (id: string) => void
  onNotes: (id: string) => void
  onImported: () => void
  notify: (text: string) => void
}) {
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<BookRecord | null>(null)
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = [...books].sort((a, b) => (b.progress?.updatedAt || b.addedAt).localeCompare(a.progress?.updatedAt || a.addedAt))
    if (!needle) return list
    return list.filter((book) => `${book.title} ${book.author} ${book.format}`.toLowerCase().includes(needle))
  }, [books, query])
  const recent = query.trim() ? undefined : books
    .filter((book) => book.progress)
    .sort((a, b) => (b.progress?.updatedAt || '').localeCompare(a.progress?.updatedAt || ''))[0]

  async function remove(book: BookRecord) {
    try {
      await window.codex.removeBook(book.id)
      setPending(null)
      onImported()
      notify(`已从书库移除《${book.title}》`)
    } catch (error) {
      notify(error instanceof Error ? error.message : '没有移除成功')
    }
  }

  return (
    <div className="stage">
      <div className="stage-head">
        <div>
          <h1>书库</h1>
          <p>{ready ? `${books.length} 本在本地` : '正在打开书架'}</p>
        </div>
        <input className="search" value={query} placeholder="搜索书名、作者" onChange={(event) => setQuery(event.target.value)} />
      </div>

      {!ready && <div className="empty">正在打开书架</div>}
      {ready && books.length === 0 && (
        <div className="empty">
          <div>
            <span className="mark" />
            <h2>书架还是空的</h2>
            <p>把 EPUB、MOBI、AZW3 拖进来，书洋会认格式并收进书库。</p>
          </div>
        </div>
      )}
      {recent && (
        <section className="hero">
          <Cover book={recent} />
          <div>
            <div className="meta">{recent.author || '佚名'} · {recent.format} · {formatBytes(recent.bytes)}</div>
            <h2>{recent.title}</h2>
            <div className="meta">
              {recent.progress?.sectionLabel ? `${recent.progress.sectionLabel} · ` : ''}
              {percent(recent.progress?.fraction)} · {formatWhen(recent.progress?.updatedAt)}
            </div>
            <button className="btn primary" onClick={() => onOpen(recent.id)}>继续阅读</button>
          </div>
        </section>
      )}
      {filtered.length > 0 && (
        <div className="grid">
          {filtered.map((book) => (
            <article key={book.id} className="card">
              <div className="cover-wrap">
                <button className="card" onClick={() => onOpen(book.id)} title={book.sourceName}>
                  <Cover book={book} />
                </button>
                <span className="badge">{book.format}</span>
                <div className="card-actions">
                  <button title="笔记" onClick={() => onNotes(book.id)}>笔</button>
                  <button title="移除" onClick={() => setPending(book)}>×</button>
                </div>
              </div>
              <button className="card" onClick={() => onOpen(book.id)}>
                <h3>{book.title}</h3>
                <div className="by">{book.author || '佚名'}</div>
                {book.progress && <div className="progress" title={percent(book.progress.fraction)}><span style={{ width: percent(book.progress.fraction) }} /></div>}
              </button>
            </article>
          ))}
        </div>
      )}
      {ready && books.length > 0 && filtered.length === 0 && <div className="empty"><p>没有和「{query}」对应的书</p></div>}

      {pending && (
        <div className="modal-back" onClick={() => setPending(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>移出书库</h2>
            <p>将删除《{pending.title}》在书库中的副本、阅读进度和笔记。你原来的文件留在原处。</p>
            <div className="row">
              <button className="btn quiet" onClick={() => setPending(null)}>留下</button>
              <button className="btn danger" onClick={() => { void remove(pending) }}>移除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function Cover({ book }: { book: BookRecord }) {
  const [failed, setFailed] = useState(false)
  if (!book.cover || failed) {
    return (
      <div className="cover-fallback" style={{ background: `linear-gradient(160deg, hsl(${coverHue(book.id)} 28% 28%), hsl(${coverHue(book.id)} 42% 46%))` }}>
        {(book.title || '书').slice(0, 4)}
      </div>
    )
  }
  return <img className="cover" alt="" src={`codex://cover/${book.id}`} onError={() => setFailed(true)} />
}
