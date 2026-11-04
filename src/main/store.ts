import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  BookRecord,
  Highlight,
  ImportResult,
  NewHighlight,
  NoteSummary,
  NotesDocument,
  Settings,
} from '../shared/types'
import { defaultSettings } from '../shared/types'
import { detectBook } from './format/detect'
import { createHighlight, highlightsFromMarkdown, renderMarkdown, splitMarkdown } from './notes'

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type NotesData = { highlights: Highlight[]; freeform: string; freeformUpdatedAt?: string }

export class LibraryStore {
  books: BookRecord[] = []
  settings: Settings = { ...defaultSettings }

  constructor(readonly root: string) {
    this.reload()
  }

  reload(): void {
    this.books = this.readJson<BookRecord[]>(this.indexPath, [])
    this.settings = { ...defaultSettings, ...this.readJson<Partial<Settings>>(this.settingsPath, {}) }
    this.settings = sanitizeSettings(this.settings)
  }

  async importPaths(filePaths: string[]): Promise<ImportResult> {
    const added: BookRecord[] = []
    const skipped: ImportResult['skipped'] = []
    for (const filePath of filePaths) {
      const name = path.basename(filePath)
      let bytes: Buffer
      try {
        bytes = await fs.readFile(filePath)
      } catch {
        skipped.push({ name, reason: '读不到这个文件' })
        continue
      }
      const detected = detectBook(new Uint8Array(bytes), name)
      if (!detected.ok) {
        skipped.push({ name, reason: detected.error })
        continue
      }
      if (detected.book.drm) {
        skipped.push({ name, reason: '文件带有 DRM，打不开加密书' })
        continue
      }
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      if (this.books.some((book) => book.sha256 === sha256)) {
        skipped.push({ name, reason: '书库里已经有这本' })
        continue
      }
      const id = randomUUID()
      const dir = path.join(this.root, 'books', id)
      await fs.mkdir(dir, { recursive: true })
      const ext = extensionFor(detected.book.format)
      await fs.writeFile(path.join(dir, `book.${ext}`), bytes)
      let cover = false
      if (detected.book.cover?.bytes.length) {
        const safeExt = detected.book.cover.ext.replace(/[^a-z0-9]/gi, '') || 'img'
        await fs.writeFile(path.join(dir, `cover.${safeExt}`), detected.book.cover.bytes)
        cover = true
      }
      const record: BookRecord = {
        id,
        title: detected.book.title || name,
        author: detected.book.author,
        format: detected.book.format,
        sourceName: name,
        sha256,
        bytes: bytes.length,
        addedAt: new Date().toISOString(),
        cover,
        language: detected.book.language,
      }
      this.books.unshift(record)
      added.push(record)
    }
    if (added.length) await this.saveIndex()
    return { added, skipped }
  }

  async removeBook(id: string): Promise<void> {
    const book = this.require(id)
    await fs.rm(path.join(this.root, 'books', book.id), { recursive: true, force: true })
    await fs.rm(this.noteJsonPath(book.id), { force: true })
    await fs.rm(this.noteMdPath(book.id), { force: true })
    this.books = this.books.filter((item) => item.id !== id)
    await this.saveIndex()
  }

  bookPath(id: string): string | null {
    const book = this.books.find((item) => item.id === id)
    if (!book) return null
    const file = path.join(this.root, 'books', book.id, `book.${extensionFor(book.format)}`)
    return file
  }

  coverPath(id: string): string | null {
    if (!this.validId(id)) return null
    const dir = path.join(this.root, 'books', id)
    try {
      const name = readdirSync(dir).find((entry) => entry.startsWith('cover.'))
      return name ? path.join(dir, name) : null
    } catch {
      return null
    }
  }

  async updateBook(id: string, patch: Partial<Pick<BookRecord, 'title' | 'author' | 'language' | 'cover'>>): Promise<BookRecord> {
    const book = this.require(id)
    if (typeof patch.title === 'string' && patch.title.trim()) book.title = patch.title.trim()
    if (typeof patch.author === 'string') book.author = patch.author.trim()
    if (typeof patch.language === 'string') book.language = patch.language.trim()
    if (typeof patch.cover === 'boolean') book.cover = patch.cover
    await this.saveIndex()
    return book
  }

  async saveCover(id: string, bytes: Uint8Array, ext: string): Promise<void> {
    const book = this.require(id)
    const dir = path.join(this.root, 'books', book.id)
    const entries = await fs.readdir(dir)
    await Promise.all(entries.filter((name) => name.startsWith('cover.')).map((name) => fs.rm(path.join(dir, name), { force: true })))
    const safeExt = ext.replace(/[^a-z0-9]/gi, '') || 'img'
    await fs.writeFile(path.join(dir, `cover.${safeExt}`), bytes)
    book.cover = true
    await this.saveIndex()
  }

  async saveProgress(id: string, progress: BookRecord['progress']): Promise<BookRecord> {
    const book = this.require(id)
    if (!progress || typeof progress.fraction !== 'number' || Number.isNaN(progress.fraction)) return book
    book.progress = {
      fraction: Math.min(1, Math.max(0, progress.fraction)),
      cfi: progress.cfi,
      sectionLabel: progress.sectionLabel || '',
      updatedAt: progress.updatedAt || new Date().toISOString(),
    }
    await this.saveIndex()
    return book
  }

  async getNotes(id: string): Promise<NotesDocument> {
    const book = this.require(id)
    const data = await this.ensureNotes(book)
    return { ...data, markdown: this.render(book, data) }
  }

  listNotes(): NoteSummary[] {
    return this.books.map((book) => {
      const data = this.readNotesSync(book)
      const latest = [...data.highlights].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      const excerpt = data.freeform.trim().split('\n').find((line) => line.trim()) || latest?.text || ''
      return {
        bookId: book.id,
        title: book.title,
        author: book.author,
        format: book.format,
        count: data.highlights.length,
        updatedAt: latest?.createdAt,
        excerpt: excerpt.replace(/\s+/g, ' ').slice(0, 80),
      }
    })
  }

  async addHighlight(id: string, input: NewHighlight): Promise<NotesDocument> {
    const book = this.require(id)
    const data = await this.ensureNotes(book)
    const highlight = createHighlight(input)
    if (!highlight) throw new Error('划线是空的')
    data.highlights.push(highlight)
    await this.writeNotes(book, data)
    return this.getNotes(id)
  }

  async updateHighlight(id: string, highlightId: string, note: string): Promise<NotesDocument> {
    const book = this.require(id)
    const data = await this.ensureNotes(book)
    const highlight = data.highlights.find((item) => item.id === highlightId)
    if (!highlight) throw new Error('找不到这条划线')
    highlight.note = note.trim()
    await this.writeNotes(book, data)
    return this.getNotes(id)
  }

  async deleteHighlight(id: string, highlightId: string): Promise<NotesDocument> {
    const book = this.require(id)
    const data = await this.ensureNotes(book)
    data.highlights = data.highlights.filter((item) => item.id !== highlightId)
    await this.writeNotes(book, data)
    return this.getNotes(id)
  }

  async saveFreeform(id: string, freeform: string): Promise<NotesDocument> {
    const book = this.require(id)
    const data = await this.ensureNotes(book)
    const next = freeform.replace(/\r\n/g, '\n')
    if (next !== data.freeform) {
      data.freeform = next
      if (this.settings.stampFreeform) data.freeformUpdatedAt = new Date().toISOString()
    }
    await this.writeNotes(book, data)
    return this.getNotes(id)
  }

  noteMdPath(id: string): string {
    this.assertId(id)
    return path.join(this.root, 'notes', `${id}.md`)
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const previous = this.settings
    this.settings = sanitizeSettings({ ...this.settings, ...patch })
    this.writeJson(this.settingsPath, this.settings)
    if (previous.stampHighlights !== this.settings.stampHighlights || previous.stampFreeform !== this.settings.stampFreeform) {
      this.rewriteNotes()
    }
    return this.settings
  }

  private get indexPath(): string {
    return path.join(this.root, 'index.json')
  }

  private get settingsPath(): string {
    return path.join(this.root, 'settings.json')
  }

  private noteJsonPath(id: string): string {
    return path.join(this.root, 'notes', `${id}.json`)
  }

  private assertId(id: string): void {
    if (!this.validId(id)) throw new Error('无效的书目')
  }

  private validId(id: string): boolean {
    return ID.test(id)
  }

  private require(id: string): BookRecord {
    this.assertId(id)
    const book = this.books.find((item) => item.id === id)
    if (!book) throw new Error('书库里没有这本书')
    return book
  }

  private async ensureNotes(book: BookRecord): Promise<NotesData> {
    await fs.mkdir(path.join(this.root, 'notes'), { recursive: true })
    const existing = this.readNotesSync(book)
    if (!(await exists(this.noteMdPath(book.id)))) await this.writeNotes(book, existing)
    return existing
  }

  private readNotesSync(book: BookRecord): NotesData {
    const json = this.readJson<NotesData | null>(this.noteJsonPath(book.id), null)
    if (json && Array.isArray(json.highlights)) {
      return { highlights: json.highlights, freeform: json.freeform || '' }
    }
    const markdown = this.readText(this.noteMdPath(book.id))
    if (!markdown) return { highlights: [], freeform: '' }
    return { highlights: highlightsFromMarkdown(markdown), freeform: splitMarkdown(markdown).freeform }
  }

  private async writeNotes(book: BookRecord, data: NotesData): Promise<void> {
    await fs.mkdir(path.join(this.root, 'notes'), { recursive: true })
    const markdown = this.render(book, data)
    await this.writeText(this.noteJsonPath(book.id), JSON.stringify(data, null, 2))
    await this.writeText(this.noteMdPath(book.id), markdown)
  }

  private render(book: BookRecord, data: NotesData): string {
    return renderMarkdown(book, data.highlights, data.freeform, {
      stampHighlights: this.settings.stampHighlights,
      stampFreeform: this.settings.stampFreeform,
      freeformUpdatedAt: data.freeformUpdatedAt,
    })
  }

  private rewriteNotes(): void {
    for (const book of this.books) {
      const json = this.noteJsonPath(book.id)
      const markdownPath = this.noteMdPath(book.id)
      if (!existsSync(json) && !existsSync(markdownPath)) continue
      const data = this.readNotesSync(book)
      mkdirSync(path.dirname(markdownPath), { recursive: true })
      writeFileSync(markdownPath, this.render(book, data), 'utf8')
    }
  }

  private async saveIndex(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true })
    await this.writeText(this.indexPath, JSON.stringify({ books: this.books }, null, 2))
  }

  private readJson<T>(file: string, fallback: T): T {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      if (file.endsWith('index.json')) return (parsed.books ?? fallback) as T
      return parsed as T
    } catch {
      return fallback
    }
  }

  private readText(file: string): string {
    try {
      return readFileSync(file, 'utf8')
    } catch {
      return ''
    }
  }

  private writeJson(file: string, value: unknown): void {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(value, null, 2))
  }

  private async writeText(file: string, value: string): Promise<void> {
    const tmp = `${file}.${process.pid}.tmp`
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(tmp, value, 'utf8')
    try {
      await fs.rename(tmp, file)
    } catch {
      await fs.rm(file, { force: true })
      await fs.rename(tmp, file)
    }
  }
}

function extensionFor(format: BookRecord['format']): string {
  if (format === 'EPUB') return 'epub'
  if (format === 'MOBI') return 'mobi'
  return 'azw3'
}

function sanitizeSettings(settings: Settings): Settings {
  const theme = settings.theme === 'light' || settings.theme === 'system' ? settings.theme : 'dark'
  const flow = settings.flow === 'scrolled' ? 'scrolled' : 'paginated'
  const fontSize = clamp(Number(settings.fontSize) || defaultSettings.fontSize, 14, 32)
  const lineHeight = clamp(Number(settings.lineHeight) || defaultSettings.lineHeight, 1.35, 2.3)
  const columns = settings.columns === 2 ? 2 : 1
  return {
    theme,
    flow,
    fontSize,
    lineHeight,
    justify: settings.justify !== false,
    columns,
    stampHighlights: settings.stampHighlights !== false,
    stampFreeform: settings.stampFreeform !== false,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}
