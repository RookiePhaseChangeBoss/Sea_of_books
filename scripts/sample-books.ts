import { zipSync, strToU8 } from 'fflate'

const text = new TextEncoder()

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function u16(value: number): Uint8Array {
  const bytes = new Uint8Array(2)
  new DataView(bytes.buffer).setUint16(0, value)
  return bytes
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value)
  return bytes
}

function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const chapters = [
  {
    title: '夜读',
    file: 'c1.xhtml',
    paragraphs: [
      '把灯调暗一点。纸页换成屏幕之后，句子还是原来的长度，只是书不再占地方。',
      'Codex 把 EPUB、MOBI 和 AZW3 收进同一个书架。合上窗口，进度还在；明天打开，从上次那一行继续。',
      '划下去的句子会自己落进一本 Markdown。你不必另找摘抄本。',
    ],
  },
  {
    title: '页边',
    file: 'c2.xhtml',
    paragraphs: [
      '读到想留下的地方，选中它。划线会带上章节名和时间，写进这本书的笔记。',
      '批注跟在引文后面。手记放在文末，更新划线时不会被盖掉。',
      '程序员大概会把那份 Markdown 再丢进自己的仓库。路径就在书库目录的 notes 里。',
    ],
  },
  {
    title: '下次从这里开始',
    file: 'c3.xhtml',
    paragraphs: [
      '读到哪儿，由一个位置记下来。可以是章节里的某一句，也可以只是整本书的百分比。',
      '暗色是默认的。明亮和跟随系统都在侧栏，随时换，不用重开这本书。',
      '安装版把书放在本机数据目录。便携版则把书库放在 exe 旁边，拷走就能继续读。',
    ],
  },
]

function chapterXhtml(title: string, paragraphs: string[]): string {
  const body = paragraphs.map((paragraph) => `<p>${xml(paragraph)}</p>`).join('\n')
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head><title>${xml(title)}</title></head>
<body>
<h1>${xml(title)}</h1>
${body}
</body>
</html>`
}

export function buildSampleEpub(): Uint8Array {
  const nav = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN">
<head><title>目录</title></head>
<body>
<nav epub:type="toc">
<ol>
${chapters.map((chapter) => `<li><a href="${chapter.file}">${xml(chapter.title)}</a></li>`).join('\n')}
</ol>
</nav>
</body>
</html>`
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="zh-CN">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">urn:codex:sample-night</dc:identifier>
<dc:title>夜读手册</dc:title>
<dc:creator>Codex</dc:creator>
<dc:language>zh-CN</dc:language>
<meta property="dcterms:modified">2026-11-04T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${chapters.map((chapter, index) => `<item id="c${index + 1}" href="${chapter.file}" media-type="application/xhtml+xml"/>`).join('\n')}
</manifest>
<spine>
${chapters.map((_, index) => `<itemref idref="c${index + 1}"/>`).join('\n')}
</spine>
</package>`
  const container = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>`
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(container),
    'OEBPS/content.opf': strToU8(opf),
    'OEBPS/nav.xhtml': strToU8(nav),
  }
  for (const chapter of chapters) {
    files[`OEBPS/${chapter.file}`] = strToU8(chapterXhtml(chapter.title, chapter.paragraphs))
  }
  return zipSync(files)
}

export function buildMobiBook(options: {
  title: string
  author?: string
  html: string
  version?: number
  encryption?: number
}): Uint8Array {
  const version = options.version ?? 6
  const encryption = options.encryption ?? 0
  const htmlBytes = text.encode(options.html)
  const chunks: Uint8Array[] = []
  for (let index = 0; index < htmlBytes.length; index += 4096) chunks.push(htmlBytes.subarray(index, index + 4096))
  if (!chunks.length) chunks.push(text.encode(' '))

  const exthRecords = [
    exthRecord(503, text.encode(options.title)),
    ...(options.author ? [exthRecord(100, text.encode(options.author))] : []),
    exthRecord(524, text.encode('zh')),
  ]
  const exthBody = concat(...exthRecords)
  const exthLength = 12 + exthBody.length + ((4 - ((12 + exthBody.length) % 4)) % 4)
  const exth = new Uint8Array(exthLength)
  exth.set(text.encode('EXTH'), 0)
  new DataView(exth.buffer).setUint32(4, exthLength)
  new DataView(exth.buffer).setUint32(8, exthRecords.length)
  exth.set(exthBody, 12)

  const headerLength = 232
  const exthStart = 16 + headerLength
  const titleBytes = text.encode(options.title)
  const titleOffset = exthStart + exth.length
  const record0 = new Uint8Array(titleOffset + titleBytes.length)
  const view = new DataView(record0.buffer)
  view.setUint16(0, 1)
  view.setUint32(4, htmlBytes.length)
  view.setUint16(8, chunks.length)
  view.setUint16(10, 4096)
  view.setUint16(12, encryption)
  record0.set(text.encode('MOBI'), 16)
  view.setUint32(20, headerLength)
  view.setUint32(24, 2)
  view.setUint32(28, 65001)
  view.setUint32(32, 1)
  view.setUint32(36, version)
  view.setUint32(84, titleOffset)
  view.setUint32(88, titleBytes.length)
  view.setUint32(108, 1 + chunks.length)
  view.setUint32(112, 0xffffffff)
  view.setUint32(128, 0x40)
  view.setUint32(240, 0)
  view.setUint32(244, 0xffffffff)
  record0.set(exth, exthStart)
  record0.set(titleBytes, titleOffset)

  return packPalm([record0, ...chunks], options.title)
}

function exthRecord(type: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, type)
  view.setUint32(4, out.length)
  out.set(data, 8)
  return out
}

function packPalm(records: Uint8Array[], name: string): Uint8Array {
  const count = records.length
  const dataStart = 78 + count * 8
  let cursor = dataStart
  const offsets = records.map((record) => {
    const offset = cursor
    cursor += record.length
    return offset
  })
  const file = new Uint8Array(cursor)
  const view = new DataView(file.buffer)
  file.set(text.encode(name).subarray(0, 31), 0)
  file.set(text.encode('BOOK'), 60)
  file.set(text.encode('MOBI'), 64)
  view.setUint16(76, count)
  records.forEach((record, index) => {
    const at = 78 + index * 8
    view.setUint32(at, offsets[index])
    view.setUint8(at + 7, index & 255)
    file.set(record, offsets[index])
  })
  return file
}

export function sampleMobiHtml(): string {
  const body = chapters.map((chapter) => `<h1>${xml(chapter.title)}</h1>${chapter.paragraphs.map((paragraph) => `<p>${xml(paragraph)}</p>`).join('')}`).join('<mbp:pagebreak/>')
  return `<html><head><title>夜读手册</title></head><body>${body}</body></html>`
}
