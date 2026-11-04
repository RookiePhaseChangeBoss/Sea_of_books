import type { BookFormat } from '../../shared/types'
import type { ParsedBook } from './epub'
import { cleanText, fileStem, joinPeople } from './text'

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function u16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) return 0
  return viewOf(bytes).getUint16(offset)
}

function u32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) return 0
  return viewOf(bytes).getUint32(offset)
}

function latin(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.length) return ''
  return Buffer.from(bytes.subarray(offset, offset + length)).toString('latin1')
}

export function isMobi(bytes: Uint8Array): boolean {
  return bytes.length > 68 && latin(bytes, 60, 8) === 'BOOKMOBI'
}

function recordSlice(file: Uint8Array, index: number, count: number): Uint8Array | null {
  const start = u32(file, 78 + index * 8)
  const end = index + 1 < count ? u32(file, 78 + (index + 1) * 8) : file.length
  if (start <= 0 || start >= file.length || end > file.length || end <= start) return null
  return file.subarray(start, end)
}

function imageExt(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg'
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return 'png'
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49) return 'gif'
  return 'img'
}

function decodeField(bytes: Uint8Array, encoding: number): string {
  const label = encoding === 65001 ? 'utf-8' : 'windows-1252'
  try {
    return cleanText(new TextDecoder(label).decode(bytes))
  } catch {
    return cleanText(new TextDecoder('utf-8').decode(bytes))
  }
}

type Exth = { title?: string; authors: string[]; language?: string; coverOffset?: number; boundary?: number }

function readExth(record: Uint8Array, start: number, encoding: number): Exth | null {
  if (start + 12 > record.length || latin(record, start, 4) !== 'EXTH') return null
  const count = u32(record, start + 8)
  const result: Exth = { authors: [] }
  let offset = start + 12
  for (let i = 0; i < count; i++) {
    if (offset + 8 > record.length) break
    const type = u32(record, offset)
    const length = u32(record, offset + 4)
    if (length < 8 || offset + length > record.length) break
    const data = record.subarray(offset + 8, offset + length)
    if (type === 100) {
      const author = decodeField(data, encoding)
      if (author) result.authors.push(author)
    } else if (type === 503) {
      const title = decodeField(data, encoding)
      if (title) result.title = title
    } else if (type === 524) {
      const language = decodeField(data, encoding)
      if (language) result.language = language
    } else if (type === 201 && data.length >= 4) {
      result.coverOffset = u32(data, 0)
    } else if (type === 121 && data.length >= 4) {
      result.boundary = u32(data, 0)
    }
    offset += length
  }
  return result
}

export function parseMobi(bytes: Uint8Array, filename: string): ParsedBook | null {
  if (!isMobi(bytes)) return null
  const count = u16(bytes, 76)
  if (count < 1) {
    return { format: extFormat(filename), title: fileStem(filename), author: '', drm: false }
  }
  const record = recordSlice(bytes, 0, count)
  if (!record || latin(record, 16, 4) !== 'MOBI') {
    return { format: extFormat(filename), title: fileStem(filename), author: '', drm: false }
  }

  const encryption = u16(record, 12)
  const headerLength = u32(record, 20)
  const encoding = u32(record, 28)
  const version = u32(record, 36)
  const titleOffset = u32(record, 84)
  const titleLength = u32(record, 88)
  const firstImage = u32(record, 108)
  const exthFlags = u32(record, 128)
  const exth = exthFlags & 0x40 ? readExth(record, 16 + headerLength, encoding) : null
  const fullName = titleOffset + titleLength <= record.length
    ? decodeField(record.subarray(titleOffset, titleOffset + titleLength), encoding)
    : ''
  const title = exth?.title || fullName || fileStem(filename)
  const author = joinPeople(exth?.authors || [])
  const hasKf8 = version >= 8 || (typeof exth?.boundary === 'number' && exth.boundary !== 0xffffffff && exth.boundary > 0)
  const format: BookFormat = hasKf8 ? 'AZW3' : 'MOBI'

  let cover: ParsedBook['cover']
  if (typeof exth?.coverOffset === 'number' && exth.coverOffset !== 0xffffffff && firstImage !== 0xffffffff) {
    const image = recordSlice(bytes, firstImage + exth.coverOffset, count)
    if (image && image.length > 32) cover = { bytes: image, ext: imageExt(image) }
  }

  return {
    format,
    title,
    author,
    language: exth?.language,
    cover,
    drm: encryption !== 0,
  }
}

function extFormat(filename: string): BookFormat {
  return /\.azw3?$/i.test(filename) && filename.toLowerCase().endsWith('3') ? 'AZW3' : 'MOBI'
}
