import { unzipSync } from 'fflate'
import type { BookFormat } from '../../shared/types'
import { cleanText, decodeXml, fileStem, joinPeople } from './text'

export type CoverAsset = { bytes: Uint8Array; ext: string }

export type ParsedBook = {
  format: BookFormat
  title: string
  author: string
  language?: string
  cover?: CoverAsset
  drm: boolean
}

const decoder = new TextDecoder('utf-8')

function looksLikeEpub(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 8192))).toString('latin1')
  return head.includes('application/epub+zip') || head.includes('container.xml')
}

function indexZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const files = unzipSync(bytes)
  const map = new Map<string, Uint8Array>()
  for (const [name, data] of Object.entries(files)) map.set(name.replace(/\\/g, '/'), data)
  return map
}

function findFile(map: Map<string, Uint8Array>, path: string): Uint8Array | undefined {
  if (map.has(path)) return map.get(path)
  const lower = path.toLowerCase()
  for (const [name, data] of map) if (name.toLowerCase() === lower) return data
  return undefined
}

function findBy(map: Map<string, Uint8Array>, pred: (name: string) => boolean): { name: string; data: Uint8Array } | undefined {
  for (const [name, data] of map) if (pred(name)) return { name, data }
  return undefined
}

function tagTexts(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}>`, 'gi')
  return [...xml.matchAll(re)]
    .map((match) => cleanText(decodeXml(match[1].replace(/<[^>]+>/g, ' '))))
    .filter(Boolean)
}

function attr(source: string, name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(source)
    || new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i').exec(source)
  return match?.[1] ? decodeXml(match[1]) : ''
}

function resolveZipPath(baseFile: string, href: string): string {
  const decoded = decodeURIComponent(href.split('#')[0])
  const dir = baseFile.includes('/') ? baseFile.slice(0, baseFile.lastIndexOf('/') + 1) : ''
  const parts = `${dir}${decoded}`.split('/')
  const out: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

function imageExt(name: string, bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg'
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  if (bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif'
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) return 'webp'
  const lower = name.toLowerCase()
  if (lower.endsWith('.svg')) return 'svg'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpg'
  if (lower.endsWith('.png')) return 'png'
  if (lower.endsWith('.gif')) return 'gif'
  if (lower.endsWith('.webp')) return 'webp'
  return 'img'
}

export function parseEpub(bytes: Uint8Array, filename: string): ParsedBook | null {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return null
  let map: Map<string, Uint8Array>
  try {
    map = indexZip(bytes)
  } catch {
    if (!looksLikeEpub(bytes)) return null
    return { format: 'EPUB', title: fileStem(filename), author: '', drm: false }
  }

  const container = findBy(map, (name) => name.toLowerCase() === 'meta-inf/container.xml')
  const mimetype = findBy(map, (name) => name.toLowerCase() === 'mimetype')
  const mimeText = mimetype ? decoder.decode(mimetype.data) : ''
  if (!container && !mimeText.includes('application/epub+zip')) return null

  const containerXml = container ? decoder.decode(container.data) : ''
  const opfPath = attr(containerXml.match(/<rootfile\b[^>]*>/i)?.[0] || containerXml, 'full-path')
  const opfBytes = opfPath ? findFile(map, opfPath) : undefined
  if (!opfBytes) {
    return { format: 'EPUB', title: fileStem(filename), author: '', drm: false }
  }
  const opf = decoder.decode(opfBytes)
  const encryption = findBy(map, (name) => name.toLowerCase() === 'meta-inf/encryption.xml')
  const drm = encryption ? epubHasDrm(decoder.decode(encryption.data)) : false

  const title = tagTexts(opf, 'title')[0] || fileStem(filename)
  const author = joinPeople(tagTexts(opf, 'creator'))
  const language = tagTexts(opf, 'language')[0]

  const items = [...opf.matchAll(/<item\b[^>]*>/gi)].map((match) => ({
    id: attr(match[0], 'id'),
    href: attr(match[0], 'href'),
    properties: attr(match[0], 'properties'),
  }))
  const coverMeta = [...opf.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((meta) => attr(meta, 'name').toLowerCase() === 'cover')
  const coverId = coverMeta ? attr(coverMeta, 'content') : ''
  const coverItem = items.find((item) => item.properties.toLowerCase().includes('cover-image'))
    || items.find((item) => coverId && item.id === coverId)
    || items.find((item) => /cover/i.test(item.id) && /\.(jpe?g|png|gif|webp|svg)$/i.test(item.href))
  let cover: CoverAsset | undefined
  if (coverItem?.href && opfPath) {
    const coverPath = resolveZipPath(opfPath, coverItem.href)
    const data = findFile(map, coverPath)
    if (data?.length) cover = { bytes: data, ext: imageExt(coverPath, data) }
  }

  return { format: 'EPUB', title, author, language, cover, drm }
}

function epubHasDrm(xml: string): boolean {
  const methods = [...xml.matchAll(/Algorithm\s*=\s*"([^"]+)"/gi)].map((match) => match[1])
  if (!methods.length) return /encrypteddata/i.test(xml)
  return methods.some((method) => !/idpf\.org\/2008\/embedding/i.test(method))
}
