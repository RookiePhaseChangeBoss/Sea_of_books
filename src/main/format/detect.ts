import type { ParsedBook } from './epub'
import { parseEpub } from './epub'
import { isMobi, parseMobi } from './mobi'

export type DetectResult = { ok: true; book: ParsedBook } | { ok: false; error: string }

export function detectBook(bytes: Uint8Array, filename: string): DetectResult {
  if (bytes.length < 8) return { ok: false, error: '文件是空的' }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const book = parseEpub(bytes, filename)
    if (!book) return { ok: false, error: '这不是 EPUB、MOBI 或 AZW3' }
    return { ok: true, book }
  }
  if (isMobi(bytes)) {
    const book = parseMobi(bytes, filename)
    if (!book) return { ok: false, error: '这本 MOBI / AZW3 读不了' }
    return { ok: true, book }
  }
  return { ok: false, error: '这不是 EPUB、MOBI 或 AZW3' }
}
