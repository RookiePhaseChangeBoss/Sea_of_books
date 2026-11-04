export type BookFormat = 'EPUB' | 'MOBI' | 'AZW3'

export type ReadingProgress = {
  fraction: number
  cfi?: string
  sectionLabel?: string
  updatedAt: string
}

export type BookRecord = {
  id: string
  title: string
  author: string
  format: BookFormat
  sourceName: string
  sha256: string
  bytes: number
  addedAt: string
  cover: boolean
  language?: string
  progress?: ReadingProgress
}

export type Highlight = {
  id: string
  cfi: string
  text: string
  note: string
  chapter: string
  createdAt: string
}

export type NotesDocument = {
  highlights: Highlight[]
  freeform: string
  freeformUpdatedAt?: string
  markdown: string
}

export type NoteSummary = {
  bookId: string
  title: string
  author: string
  format: BookFormat
  count: number
  updatedAt?: string
  excerpt: string
}

export type Settings = {
  theme: 'dark' | 'light' | 'system'
  flow: 'paginated' | 'scrolled'
  fontSize: number
  lineHeight: number
  justify: boolean
  columns: 1 | 2
  stampHighlights: boolean
  stampFreeform: boolean
}

export const defaultSettings: Settings = {
  theme: 'dark',
  flow: 'paginated',
  fontSize: 19,
  lineHeight: 1.72,
  justify: true,
  columns: 2,
  stampHighlights: true,
  stampFreeform: true,
}

export type LibraryMove = {
  libraryRoot: string
  imported: ImportResult
}

export type ImportResult = {
  added: BookRecord[]
  skipped: { name: string; reason: string }[]
}

export type BootInfo = {
  settings: Settings
  dark: boolean
  portable: boolean
  libraryRoot: string
  version: string
}

export type NewHighlight = {
  cfi: string
  text: string
  note?: string
  chapter?: string
}
