import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildMobiBook, buildSampleEpub, sampleMobiHtml } from './sample-books'

const dir = path.join(process.cwd(), 'samples')
mkdirSync(dir, { recursive: true })
writeFileSync(path.join(dir, '夜读手册.epub'), buildSampleEpub())
writeFileSync(path.join(dir, '夜读手册.mobi'), buildMobiBook({
  title: '夜读手册',
  author: 'Codex',
  html: sampleMobiHtml(),
}))
console.log(dir)
