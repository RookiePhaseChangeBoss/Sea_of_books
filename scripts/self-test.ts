import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { detectBook } from '../src/main/format/detect'
import { findLooseBooks } from '../src/main/scan'
import { LibraryStore } from '../src/main/store'
import { buildMobiBook, buildSampleEpub, sampleMobiHtml } from './sample-books'

const root = mkdtempSync(path.join(tmpdir(), 'codex-'))
const epubPath = path.join(root, 'night.epub')
const mobiPath = path.join(root, 'night.mobi')
const azwPath = path.join(root, 'night.azw3')
const drmPath = path.join(root, 'locked.mobi')
writeFileSync(epubPath, buildSampleEpub())
writeFileSync(mobiPath, buildMobiBook({ title: '夜读手册', author: 'Codex', html: sampleMobiHtml() }))
writeFileSync(azwPath, buildMobiBook({ title: '夜读手册', author: 'Codex', html: '<html><body><p>azw3</p></body></html>', version: 8 }))
writeFileSync(drmPath, buildMobiBook({ title: '锁着', html: '<html><body><p>x</p></body></html>', encryption: 1 }))

const epub = detectBook(new Uint8Array(readFileSync(epubPath)), 'night.epub')
assert.equal(epub.ok, true)
if (epub.ok) {
  assert.equal(epub.book.format, 'EPUB')
  assert.equal(epub.book.title, '夜读手册')
  assert.equal(epub.book.author, 'Codex')
  assert.equal(epub.book.drm, false)
}

const mobi = detectBook(new Uint8Array(readFileSync(mobiPath)), 'night.mobi')
assert.equal(mobi.ok, true)
if (mobi.ok) {
  assert.equal(mobi.book.format, 'MOBI')
  assert.equal(mobi.book.title, '夜读手册')
  assert.equal(mobi.book.author, 'Codex')
}

const azw = detectBook(new Uint8Array(readFileSync(azwPath)), 'night.azw3')
assert.equal(azw.ok && azw.book.format, 'AZW3')

const drm = detectBook(new Uint8Array(readFileSync(drmPath)), 'locked.mobi')
assert.equal(drm.ok && drm.book.drm, true)

const unknown = detectBook(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 'notes.txt')
assert.equal(unknown.ok, false)

const store = new LibraryStore(path.join(root, 'library'))

async function main() {
const imported = await store.importPaths([epubPath, mobiPath])
assert.deepEqual(imported.added.map((book) => book.format), ['EPUB', 'MOBI'])
assert.equal(imported.added[0].title, '夜读手册')
assert.equal(imported.added[1].title, '夜读手册')
const again = await store.importPaths([epubPath])
assert.equal(again.added.length, 0)
assert.match(again.skipped[0].reason, /已经有/)
const locked = await store.importPaths([drmPath])
assert.match(locked.skipped[0].reason, /DRM/)

const epubBook = store.books.find((book) => book.format === 'EPUB')
assert.ok(epubBook)
const quoted = '把灯调暗一点。纸页换成屏幕之后，句子还是原来的长度，只是书不再占地方。'
await store.addHighlight(epubBook.id, { cfi: 'epubcfi(/6/2!/4/2/1:0)', text: quoted, chapter: '夜读' })
await store.saveFreeform(epubBook.id, '明天接着看页边。')
const notes = await store.addHighlight(epubBook.id, { cfi: 'epubcfi(/6/4!/4/2/1:0)', text: '划下去的句子会自己落进一本 Markdown。', note: '放进仓库', chapter: '页边' })
assert.equal(notes.highlights.length, 2)
assert.match(notes.markdown, new RegExp(quoted.slice(0, 8)))
assert.match(notes.markdown, /明天接着看页边/)
assert.match(notes.markdown, /放进仓库/)
assert.match(notes.markdown, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
assert.match(notes.freeform, /明天接着看页边/)
store.updateSettings({ stampHighlights: false, stampFreeform: false })
const quiet = await store.getNotes(epubBook.id)
assert.doesNotMatch(quiet.markdown, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
assert.match(quiet.markdown, /### 夜读/)
assert.match(quiet.markdown, /明天接着看页边/)

const saved = await store.saveProgress(epubBook.id, { fraction: 0.42, cfi: 'epubcfi(/6/4!/4)', sectionLabel: '页边', updatedAt: new Date().toISOString() })
assert.equal(saved.progress?.fraction, 0.42)
assert.equal(saved.progress?.sectionLabel, '页边')

await store.removeBook(epubBook.id)
assert.equal(store.books.some((book) => book.id === epubBook.id), false)

store.updateSettings({ theme: 'system', fontSize: 22, columns: 2 })
assert.equal(store.settings.theme, 'system')
assert.equal(store.settings.fontSize, 22)
assert.equal(store.settings.columns, 2)
assert.equal(store.settings.stampHighlights, false)

const shelf = path.join(root, 'shelf')
const loose = path.join(shelf, 'extra.epub')
const managed = path.join(shelf, 'books', '11111111-1111-4111-8111-111111111111', 'book.epub')
mkdirSync(path.dirname(managed), { recursive: true })
writeFileSync(loose, readFileSync(epubPath))
writeFileSync(managed, readFileSync(epubPath))
const found = await findLooseBooks(shelf)
assert.deepEqual(found, [loose])

rmSync(root, { recursive: true, force: true })
console.log('codex self-test ok')
}

main()
