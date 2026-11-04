import { useEffect, useRef, useState } from 'react'
import type { BookRecord, Highlight, ReadingProgress, Settings } from '@shared/types'
import { Overlayer } from '@foliate/overlayer.js'
import '@foliate/view.js'
import { applyReaderChrome, highlightColor, type FoliateView, type TocItem } from '../reader/book-style'
import { percent, plainText } from '../text'

type MenuState = {
  x: number
  y: number
  text: string
  index: number
  range: Range
  chapter: string
}

export function ReaderView({
  book,
  initialCfi,
  settings,
  dark,
  onBack,
  onSettings,
  onProgress,
  onChanged,
  notify,
}: {
  book?: BookRecord
  initialCfi?: string
  settings: Settings
  dark: boolean
  onBack: () => void
  onSettings: (patch: Partial<Settings>) => Promise<void>
  onProgress: (progress: ReadingProgress) => void
  onChanged: () => void
  notify: (text: string) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<FoliateView | null>(null)
  const settingsRef = useRef(settings)
  const darkRef = useRef(dark)
  const highlightsRef = useRef<Highlight[]>([])
  const progressRef = useRef<ReadingProgress | null>(null)
  const chapterRef = useRef('')
  settingsRef.current = settings
  darkRef.current = dark

  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [toc, setToc] = useState<TocItem[]>([])
  const [panel, setPanel] = useState<'toc' | 'type' | 'notes' | null>(null)
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [draft, setDraft] = useState('')
  const [noting, setNoting] = useState(false)
  const [location, setLocation] = useState('准备打开')
  const [fraction, setFraction] = useState(book?.progress?.fraction || 0)

  useEffect(() => { highlightsRef.current = highlights }, [highlights])

  useEffect(() => {
    const host = hostRef.current
    const current = book
    if (!host || !current) return
    let dead = false
    const view = document.createElement('foliate-view') as FoliateView
    viewRef.current = view
    host.appendChild(view)
    let annotationClick = false
    let saveTimer = 0

    const flush = () => {
      if (progressRef.current) void window.codex.saveProgress(current.id, progressRef.current)
    }

    view.addEventListener('draw-annotation', ((event: Event) => {
      const detail = (event as CustomEvent).detail
      detail.draw(Overlayer.highlight, { color: detail.annotation?.color || highlightColor(darkRef.current) })
    }) as EventListener)

    view.addEventListener('create-overlay', (() => {
      for (const item of highlightsRef.current) {
        void view.addAnnotation({ value: item.cfi, color: highlightColor(darkRef.current) })
      }
    }) as EventListener)

    view.addEventListener('show-annotation', ((event: Event) => {
      annotationClick = true
      const value = (event as CustomEvent).detail?.value as string
      const item = highlightsRef.current.find((highlight) => highlight.cfi === value)
      if (!item) return
      setDraft(item.note)
      setMenu({ x: 80, y: 80, text: item.text, index: 0, range: document.createRange(), chapter: item.chapter })
      setPanel('notes')
    }) as EventListener)

    view.addEventListener('external-link', ((event: Event) => {
      event.preventDefault()
      const href = (event as CustomEvent).detail?.href_ as string
      if (href) void window.codex.openExternal(href)
    }) as EventListener)

    view.addEventListener('relocate', ((event: Event) => {
      const detail = (event as CustomEvent).detail
      const nextFraction = typeof detail.fraction === 'number' ? detail.fraction : 0
      const progress: ReadingProgress = {
        fraction: nextFraction,
        cfi: typeof detail.cfi === 'string' ? detail.cfi : undefined,
        sectionLabel: detail.tocItem?.label || '',
        updatedAt: new Date().toISOString(),
      }
      chapterRef.current = progress.sectionLabel || ''
      progressRef.current = progress
      setFraction(nextFraction)
      setLocation([progress.sectionLabel, percent(nextFraction)].filter(Boolean).join(' · '))
      setMenu(null)
      window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(() => {
        void window.codex.saveProgress(current.id, progress)
        onProgress(progress)
      }, 350)
    }) as EventListener)

    view.addEventListener('load', ((event: Event) => {
      const { doc, index } = (event as CustomEvent).detail as { doc: Document; index: number }
      const root = doc.documentElement
      if (root.dataset.codexBound) return
      root.dataset.codexBound = '1'
      doc.addEventListener('mouseup', () => {
        window.setTimeout(() => {
          const selection = doc.getSelection()
          const text = selection?.toString().replace(/\s+/g, ' ').trim() || ''
          if (!selection || selection.isCollapsed || !selection.rangeCount || text.length < 1) return
          const range = selection.getRangeAt(0).cloneRange()
          const rect = range.getBoundingClientRect()
          const frame = doc.defaultView?.frameElement?.getBoundingClientRect()
          const x = (frame?.left || 0) + rect.left
          const y = (frame?.top || 0) + rect.bottom + 8
          setDraft('')
          setNoting(false)
          setMenu({
            x: Math.min(x, window.innerWidth - 240),
            y: Math.min(y, window.innerHeight - 56),
            text,
            index,
            range,
            chapter: chapterRef.current,
          })
        }, 0)
      })
      doc.addEventListener('click', (clickEvent) => {
        const anchor = (clickEvent.target as Element | null)?.closest?.('a')
        if (anchor) return
        window.setTimeout(() => {
          if (annotationClick) {
            annotationClick = false
            return
          }
          const selected = doc.getSelection()?.toString().trim()
          if (selected) return
          const width = doc.documentElement.clientWidth || 1
          if (clickEvent.clientX < width * 0.16) view.goLeft()
          else if (clickEvent.clientX > width * 0.84) view.goRight()
        }, 0)
      })
      doc.addEventListener('keydown', onKey)
    }) as EventListener)

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (event.key === 'ArrowLeft' || event.key === 'PageUp' || event.key === 'h') {
        event.preventDefault()
        view.goLeft()
      } else if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === 'l' || event.key === ' ') {
        event.preventDefault()
        view.goRight()
      } else if (event.key === 'Escape') setPanel(null)
    }
    window.addEventListener('keydown', onKey)

    ;(async () => {
      try {
        const response = await fetch(`codex://book/${current.id}`)
        if (!response.ok) throw new Error('书库里找不到文件')
        const blob = await response.blob()
        const file = new File([blob], current.sourceName || 'book')
        await view.open(file)
        if (dead) return
        applyReaderChrome(view, settingsRef.current, darkRef.current, host.clientWidth)
        const notes = await window.codex.getNotes(current.id)
        if (dead) return
        highlightsRef.current = notes.highlights
        setHighlights(notes.highlights)
        setToc(view.book.toc || [])
        const resume = initialCfi || current.progress?.cfi || (current.progress ? { fraction: current.progress.fraction } : undefined)
        await view.init({ lastLocation: resume, showTextStart: !resume })
        if (dead) return
        const title = plainText(view.book.metadata?.title)
        const author = plainText(view.book.metadata?.author)
        const stem = current.sourceName.replace(/\.[^.]+$/, '')
        if (title && (current.title === stem || current.title === current.sourceName)) {
          await window.codex.updateBook(current.id, { title, author: author || current.author })
          onChanged()
        }
        if (!current.cover && view.book.getCover) {
          const cover = await view.book.getCover()
          if (cover) {
            const bytes = new Uint8Array(await cover.arrayBuffer())
            const type = cover.type || ''
            const ext = type.includes('png') ? 'png' : type.includes('gif') ? 'gif' : type.includes('webp') ? 'webp' : 'jpg'
            await window.codex.saveCover(current.id, bytes, ext)
            onChanged()
          }
        }
        if (!dead) setReady(true)
      } catch (openError) {
        if (!dead) setError(openError instanceof Error ? openError.message : '这本书没有打开')
      }
    })()

    return () => {
      dead = true
      window.clearTimeout(saveTimer)
      flush()
      window.removeEventListener('keydown', onKey)
      viewRef.current = null
      try { view.close() } catch { /* already closed */ }
      view.remove()
    }
  }, [book?.id, initialCfi])

  useEffect(() => {
    const view = viewRef.current
    const host = hostRef.current
    if (!view || !host || !ready) return
    let frame = 0
    const apply = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const current = viewRef.current
        if (current) applyReaderChrome(current, settingsRef.current, darkRef.current, host.clientWidth)
      })
    }
    apply()
    for (const item of highlightsRef.current) {
      void view.addAnnotation({ value: item.cfi, color: highlightColor(dark) })
    }
    const observer = new ResizeObserver(apply)
    observer.observe(host)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [settings, dark, ready])

  async function commitHighlight(note: string) {
    if (!book || !menu || !viewRef.current) return
    let cfi = ''
    try {
      cfi = viewRef.current.getCFI(menu.index, menu.range)
    } catch {
      notify('这一处暂时标不了')
      return
    }
    try {
      const notes = await window.codex.addHighlight(book.id, {
        cfi,
        text: menu.text,
        note,
        chapter: menu.chapter,
      })
      highlightsRef.current = notes.highlights
      setHighlights(notes.highlights)
      await viewRef.current.addAnnotation({ value: cfi, color: highlightColor(dark) })
      setMenu(null)
      setDraft('')
      notify('划线已写入 Markdown')
    } catch (saveError) {
      notify(saveError instanceof Error ? saveError.message : '划线没有保存')
    }
  }

  if (!book) return <div className="reader-error">正在从书库取出这本书</div>

  return (
    <div className="reader">
      <div className="reader-bar">
        <button className="icon-btn" onClick={onBack} title="返回书库">←</button>
        <div className="titleblock">
          <strong>{book.title}</strong>
          <em>{book.author || '佚名'} · {book.format}</em>
        </div>
        <button className={`icon-btn ${panel === 'toc' ? 'active' : ''}`} onClick={() => setPanel(panel === 'toc' ? null : 'toc')}>目录</button>
        <button className={`icon-btn ${panel === 'notes' ? 'active' : ''}`} onClick={() => setPanel(panel === 'notes' ? null : 'notes')}>笔记</button>
        <button className={`icon-btn ${panel === 'type' ? 'active' : ''}`} onClick={() => setPanel(panel === 'type' ? null : 'type')}>版式</button>
        <button className="icon-btn" onClick={() => viewRef.current?.goLeft()}>上一页</button>
        <button className="icon-btn" onClick={() => viewRef.current?.goRight()}>下一页</button>
      </div>
      <div className="reader-stage">
        <div className="reader-host" ref={hostRef} />
        {!ready && !error && <div className="reader-status">正在排版</div>}
        {error && (
          <div className="reader-error">
            <div>
              <h2>没有打开</h2>
              <p>{error}</p>
              <button className="btn" onClick={onBack}>返回书库</button>
            </div>
          </div>
        )}
        {panel && <button className="scrim" aria-label="关闭" onClick={() => setPanel(null)} />}
        {panel === 'toc' && (
          <aside className="drawer left">
            <header><h2>目录</h2><button className="icon-btn" onClick={() => setPanel(null)}>×</button></header>
            <div className="body">
              {toc.length === 0 && <p>这本书没有目录</p>}
              <TocList items={toc} onPick={(href) => { void viewRef.current?.goTo(href); setPanel(null) }} />
            </div>
          </aside>
        )}
        {panel === 'notes' && (
          <aside className="drawer right">
            <header>
              <h2>划线</h2>
              <button className="btn quiet" onClick={() => { void window.codex.openNote(book.id) }}>打开 Markdown</button>
            </header>
            <div className="body">
              {highlights.length === 0 && <p>选中一段文字，划线会写入这本书的 Markdown。</p>}
              {highlights.map((item) => (
                <article className="highlight-card" key={item.id}>
                  <header>
                    <span>{item.chapter || '划线'}</span>
                    <button className="btn quiet" onClick={() => { void viewRef.current?.goTo(item.cfi); setPanel(null) }}>跳转</button>
                  </header>
                  <blockquote className="quote">{item.text}</blockquote>
                  {item.note && <p>{item.note}</p>}
                </article>
              ))}
            </div>
          </aside>
        )}
        {panel === 'type' && (
          <div className="popover">
            <header><h2>版式</h2></header>
            <label className="field">字号 <input type="range" min={14} max={28} value={settings.fontSize} onChange={(event) => { void onSettings({ fontSize: Number(event.target.value) }) }} /></label>
            <label className="field">行距 <input type="range" min={140} max={220} value={Math.round(settings.lineHeight * 100)} onChange={(event) => { void onSettings({ lineHeight: Number(event.target.value) / 100 }) }} /></label>
            <label className="check"><input type="checkbox" checked={settings.justify} onChange={(event) => { void onSettings({ justify: event.target.checked }) }} />两端对齐</label>
            <div className="row-actions" style={{ padding: '0 14px 8px' }}>
              <button className={`btn ${settings.flow === 'paginated' ? 'primary' : ''}`} onClick={() => { void onSettings({ flow: 'paginated' }) }}>翻页</button>
              <button className={`btn ${settings.flow === 'scrolled' ? 'primary' : ''}`} onClick={() => { void onSettings({ flow: 'scrolled' }) }}>滚动</button>
              <button className={`btn ${settings.columns === 1 ? 'primary' : ''}`} onClick={() => { void onSettings({ columns: 1 }) }}>单栏</button>
              <button className={`btn ${settings.columns === 2 ? 'primary' : ''}`} onClick={() => { void onSettings({ columns: 2 }) }}>双栏</button>
            </div>
          </div>
        )}
      </div>
      <div className="reader-foot">
        <span className="hint">{location}</span>
        <input
          className="slider"
          type="range"
          min={0}
          max={1000}
          value={Math.round(fraction * 1000)}
          onChange={(event) => {
            const next = Number(event.target.value) / 1000
            setFraction(next)
            void viewRef.current?.goToFraction(next)
          }}
        />
        <span className="hint">{percent(fraction)} · ← → 翻页</span>
      </div>
      {menu && panel !== 'notes' && (
        <div className="select-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(event) => event.preventDefault()}>
          <button className="btn primary" onClick={() => { void commitHighlight('') }}>划线</button>
          <button className="btn" onClick={() => setNoting(true)}>批注</button>
          <button className="btn quiet" onClick={() => { void navigator.clipboard.writeText(menu.text) }}>复制</button>
          {noting && (
            <form onSubmit={(event) => { event.preventDefault(); void commitHighlight(draft.trim()) }}>
              <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="写在划线下面" autoFocus />
              <button className="btn primary" type="submit">保存</button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

function TocList({ items, onPick }: { items: TocItem[]; onPick: (href: string) => void }) {
  return (
    <>
      {items.map((item) => (
        <div key={`${item.href}-${item.label}`}>
          <button className="toc-item" onClick={() => onPick(item.href)}>{item.label || '未命名'}</button>
          {item.subitems && item.subitems.length > 0 && item.subitems.map((sub) => (
            <button className="toc-sub" key={`${sub.href}-${sub.label}`} onClick={() => onPick(sub.href)}>{sub.label}</button>
          ))}
        </div>
      ))}
    </>
  )
}
