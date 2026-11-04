import { readdir } from 'node:fs/promises'
import path from 'node:path'

const BOOK_EXT = new Set(['.epub', '.mobi', '.azw', '.azw3', '.prc'])
const SKIP_DIR = new Set(['node_modules', '.git', '$RECYCLE.BIN', 'System Volume Information'])
const MANAGED = /^books[\\/][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[\\/]book\.(epub|mobi|azw3)$/i

export async function findLooseBooks(root: string, limit = 5000): Promise<string[]> {
  const found: string[] = []

  async function walk(dir: string): Promise<void> {
    if (found.length >= limit) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (found.length >= limit) return
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIR.has(entry.name)) continue
        await walk(full)
        continue
      }
      if (!entry.isFile()) continue
      if (!BOOK_EXT.has(path.extname(entry.name).toLowerCase())) continue
      const relative = path.relative(root, full)
      if (MANAGED.test(relative)) continue
      found.push(full)
    }
  }

  await walk(root)
  return found
}
