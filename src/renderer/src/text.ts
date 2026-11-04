export function plainText(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) return value.map(plainText).filter(Boolean).join('、')
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if ('name' in record) return plainText(record.name)
    const preferred = record.zh || record['zh-CN'] || record['zh-Hans'] || record.en
    if (preferred) return plainText(preferred)
    const first = Object.values(record)[0]
    return first ? plainText(first) : ''
  }
  return String(value).trim()
}

export function percent(fraction?: number): string {
  if (typeof fraction !== 'number' || Number.isNaN(fraction)) return '0%'
  return `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`
}

export function formatWhen(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const days = Math.round((start(new Date()) - start(date)) / 86400000)
  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function clock(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function coverHue(id: string): string {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const hues = [28, 152, 210, 340, 18]
  return String(hues[hash % hues.length])
}
