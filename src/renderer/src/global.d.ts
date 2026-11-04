import type { BootInfo, BookRecord, ImportResult, LibraryMove, NewHighlight, NoteSummary, NotesDocument, ReadingProgress, Settings } from '@shared/types'

export type CodexApi = {
  boot: BootInfo
  listBooks: () => Promise<BookRecord[]>
  importPaths: (paths: string[]) => Promise<ImportResult>
  pickAndImport: () => Promise<ImportResult>
  removeBook: (id: string) => Promise<void>
  updateBook: (id: string, patch: Partial<Pick<BookRecord, 'title' | 'author' | 'language' | 'cover'>>) => Promise<BookRecord>
  saveCover: (id: string, bytes: Uint8Array, ext: string) => Promise<void>
  saveProgress: (id: string, progress: ReadingProgress) => Promise<BookRecord>
  getNotes: (id: string) => Promise<NotesDocument>
  listNotes: () => Promise<NoteSummary[]>
  addHighlight: (id: string, input: NewHighlight) => Promise<NotesDocument>
  updateHighlight: (id: string, highlightId: string, note: string) => Promise<NotesDocument>
  deleteHighlight: (id: string, highlightId: string) => Promise<NotesDocument>
  saveFreeform: (id: string, freeform: string) => Promise<NotesDocument>
  openNote: (id: string) => Promise<void>
  revealLibrary: () => Promise<void>
  chooseLibrary: () => Promise<LibraryMove | null>
  setSettings: (patch: Partial<Settings>) => Promise<BootInfo>
  openExternal: (url: string) => Promise<void>
  setTitle: (title: string) => void
  pathForFile: (file: File) => string
  onTheme: (cb: (dark: boolean) => void) => () => void
  onOpenBook: (cb: (id: string) => void) => () => void
  onLibraryChanged: (cb: () => void) => () => void
  onImportRequest: (cb: () => void) => () => void
  onNavigate: (cb: (target: 'library' | 'notes') => void) => () => void
}

declare global {
  interface Window {
    codex: CodexApi
  }
}
