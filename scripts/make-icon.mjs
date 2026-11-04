import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const build = path.join(process.cwd(), 'build')
const images = [16, 32, 48, 256].map((size) => {
  const png = readFileSync(path.join(build, `icon-${size}.png`))
  return { size, png }
})

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(images.length, 4)
const directory = Buffer.alloc(16 * images.length)
let offset = 6 + directory.length
const parts = [header, directory]
images.forEach((image, index) => {
  const entry = index * 16
  directory[entry] = image.size >= 256 ? 0 : image.size
  directory[entry + 1] = image.size >= 256 ? 0 : image.size
  directory.writeUInt16LE(1, entry + 4)
  directory.writeUInt16LE(32, entry + 6)
  directory.writeUInt32LE(image.png.length, entry + 8)
  directory.writeUInt32LE(offset, entry + 12)
  offset += image.png.length
  parts.push(image.png)
})

writeFileSync(path.join(build, 'icon.ico'), Buffer.concat(parts))
console.log(path.join(build, 'icon.ico'))
