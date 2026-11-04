export function cleanText(value: string | undefined | null): string {
  if (!value) return ''
  return value.replace(/\0/g, ' ').replace(/\s+/g, ' ').trim()
}

export function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export function fileStem(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() || name
  return base.replace(/\.[^.]+$/, '') || base
}

export function joinPeople(names: string[]): string {
  const list = names.map(cleanText).filter(Boolean)
  if (!list.length) return ''
  const cjk = list.some((name) => /[\u3400-\u9fff]/.test(name))
  return list.join(cjk ? '、' : ', ')
}

export function utf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}
