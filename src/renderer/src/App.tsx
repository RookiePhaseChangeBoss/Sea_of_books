import { useEffect, useRef, useState } from 'react'
import type { BookRecord, ImportResult, Settings } from '@shared/types'
import { LibraryView } from './components/LibraryView'
import { NotesView } from './components/NotesView'
import { ReaderView } from './components/ReaderView'

type Route = { name: 'library' } | { name: 'notes'; bookId?: string } | { name: 'reader'; bookId: string; cfi?: string }
type Toast = { id: number; text: string }

export function App() {
  const boot = window.codex.boot
  const [settings, setSettings] = useState<Settings>(boot.settings)
  const [dark, setDark] = useState(boot.dark)
  const [books, setBooks] = useState<BookRecord[]>([])
  const [route, setRoute] = useState<Route>({ name: 'library' })
  const [toasts, setToasts] = useState<Toast[]>([])
  const [drag, setDrag] = useState(0)
  const [ready, setReady] = useState(false)
  const [libraryRoot, setLibraryRoot] = useState(boot.libraryRoot)
  const pickRef = useRef<() => void>(() => {})

  const notify = (text: string) => {
    const id = Date.now() + Math.random()
    setToasts((items) => [...items, { id, text }])
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4600)
  }

  const refresh = async () => setBooks(await window.codex.listBooks())

  useEffect(() => {
    refresh().finally(() => setReady(true))
  }, [])

  useEffect(() => window.codex.onTheme(setDark), [])
  useEffect(() => window.codex.onLibraryChanged(() => { void refresh() }), [])
  useEffect(() => window.codex.onOpenBook((id) => {
    void refresh()
    setRoute({ name: 'reader', bookId: id })
  }), [])
  useEffect(() => window.codex.onImportRequest(() => pickRef.current()), [])
  useEffect(() => window.codex.onNavigate((target) => setRoute({ name: target })), [])

  useEffect(() => {
    const book = route.name === 'reader' ? books.find((item) => item.id === route.bookId) : undefined
    const title = book ? `${book.title} · 书洋` : '书洋'
    document.title = title
    window.codex.setTitle(title)
  }, [route, books])

  async function applyImport(result: ImportResult) {
    await refresh()
    if (result.added.length === 1) setRoute({ name: 'reader', bookId: result.added[0].id })
    else if (result.added.length > 1) notify(`已收入 ${result.added.length} 本`)
    for (const item of result.skipped) notify(`${item.name}：${item.reason}`)
  }

  async function pick() {
    try {
      await applyImport(await window.codex.pickAndImport())
    } catch (error) {
      notify(error instanceof Error ? error.message : '导入没有完成')
    }
  }
  pickRef.current = () => { void pick() }

  async function importPaths(paths: string[]) {
    if (!paths.length) return
    try {
      await applyImport(await window.codex.importPaths(paths))
    } catch (error) {
      notify(error instanceof Error ? error.message : '导入没有完成')
    }
  }

  async function chooseLibrary() {
    try {
      const result = await window.codex.chooseLibrary()
      if (!result) return
      setLibraryRoot(result.libraryRoot)
      setRoute({ name: 'library' })
      await refresh()
      const count = result.imported.added.length
      notify(count ? `已从该位置收入 ${count} 本` : '这个位置没有新的电子书')
      for (const item of result.imported.skipped) notify(`${item.name}：${item.reason}`)
    } catch (error) {
      notify(error instanceof Error ? error.message : '书库位置没有改成')
    }
  }

  async function updateSettings(patch: Partial<Settings>) {
    const next = await window.codex.setSettings(patch)
    setSettings(next.settings)
    setDark(next.dark)
  }

  return (
    <div
      className="app"
      onDragEnter={(event) => { event.preventDefault(); setDrag((count) => count + 1) }}
      onDragLeave={(event) => { event.preventDefault(); setDrag((count) => Math.max(0, count - 1)) }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        setDrag(0)
        const paths = [...event.dataTransfer.files].map((file) => window.codex.pathForFile(file)).filter(Boolean)
        void importPaths(paths)
      }}
    >
      <header className="titlebar">
        <button className="brand" onClick={() => setRoute({ name: 'library' })}>
          <span className="mark" />
          <div>
            <strong>书洋</strong>
            <span>离线书库</span>
          </div>
        </button>
        <div className="titlebar-fill" />
      </header>
      <div className="shell">
        {route.name !== 'reader' && (
          <aside className="side">
            <button className={`nav-btn ${route.name === 'library' ? 'active' : ''}`} onClick={() => setRoute({ name: 'library' })}>书库</button>
            <button className={`nav-btn ${route.name === 'notes' ? 'active' : ''}`} onClick={() => setRoute({ name: 'notes' })}>笔记</button>
            <button className="btn primary" onClick={() => { void pick() }}>收入书库</button>
            <div className="side-spacer" />
            <div className="side-label">记下时间</div>
            <label className="check side-check">
              <input type="checkbox" checked={settings.stampHighlights} onChange={(event) => { void updateSettings({ stampHighlights: event.target.checked }) }} />
              划线
            </label>
            <label className="check side-check">
              <input type="checkbox" checked={settings.stampFreeform} onChange={(event) => { void updateSettings({ stampFreeform: event.target.checked }) }} />
              手记
            </label>
            <div className="theme-switch" role="group" aria-label="主题">
              {(['dark', 'light', 'system'] as const).map((theme) => (
                <button key={theme} className={settings.theme === theme ? 'active' : ''} onClick={() => { void updateSettings({ theme }) }}>
                  {theme === 'dark' ? '暗色' : theme === 'light' ? '明亮' : '系统'}
                </button>
              ))}
            </div>
            <button className="side-link" onClick={() => { void window.codex.revealLibrary() }}>打开书库文件夹</button>
            <button className="side-link" onClick={() => { void chooseLibrary() }}>更改位置</button>
            <div className="library-path">{libraryRoot}</div>
          </aside>
        )}
        <main className="main">
          {route.name === 'library' && (
            <LibraryView
              books={books}
              ready={ready}
              onOpen={(id) => setRoute({ name: 'reader', bookId: id })}
              onNotes={(id) => setRoute({ name: 'notes', bookId: id })}
              onImported={() => { void refresh() }}
              notify={notify}
            />
          )}
          {route.name === 'notes' && (
            <NotesView
              books={books}
              selectedId={route.bookId}
              onSelect={(bookId) => setRoute({ name: 'notes', bookId })}
              onOpen={(bookId, cfi) => setRoute({ name: 'reader', bookId, cfi })}
              settings={settings}
              notify={notify}
            />
          )}
          {route.name === 'reader' && (
            <ReaderView
              book={books.find((item) => item.id === route.bookId)}
              initialCfi={route.cfi}
              settings={settings}
              dark={dark}
              onBack={() => setRoute({ name: 'library' })}
              onSettings={updateSettings}
              onProgress={(progress) => {
                setBooks((items) => items.map((item) => item.id === route.bookId ? { ...item, progress } : item))
              }}
              onChanged={() => { void refresh() }}
              notify={notify}
            />
          )}
        </main>
      </div>
      {drag > 0 && <div className="drop">松开，收入书库</div>}
      <div className="toasts">
        {toasts.map((toast) => <div className="toast" key={toast.id}>{toast.text}</div>)}
      </div>
    </div>
  )
}
