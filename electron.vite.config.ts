import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const pdfStub = resolve('src/renderer/src/reader/pdf-stub.ts')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['fflate'] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    base: './',
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
        '@foliate': resolve('vendor/foliate-js'),
      },
    },
    plugins: [
      react(),
      {
        name: 'stub-foliate-pdf',
        enforce: 'pre',
        resolveId(source, importer) {
          if (!importer) return null
          const fromFoliate = importer.replace(/\\/g, '/').includes('/foliate-js/')
          if (fromFoliate && (source === './pdf.js' || source.endsWith('/pdf.js'))) return pdfStub
          if (source.includes('vendor/pdfjs')) return pdfStub
          return null
        },
      },
    ],
  },
})
