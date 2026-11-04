import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { BootInfo, NewHighlight, ReadingProgress, Settings } from '../shared/types'

const boot = ipcRenderer.sendSync('app:boot') as BootInfo

function applyDark(dark: boolean): void {
  const root = document.documentElement
  if (!root) return
  root.dataset.theme = dark ? 'dark' : 'light'
  root.style.colorScheme = dark ? 'dark' : 'light'
  root.style.background = dark ? '#14110f' : '#f4efe6'
}

function paintBoot(): void {
  try {
    if (document.documentElement) applyDark(boot.dark)
    else window.addEventListener('DOMContentLoaded', () => applyDark(boot.dark))
  } catch (error) {
    console.error(error)
  }
}

paintBoot()

contextBridge.exposeInMainWorld('codex', {
  boot,
  listBooks: () => ipcRenderer.invoke('library:list'),
  importPaths: (paths: string[]) => ipcRenderer.invoke('library:import', paths),
  pickAndImport: () => ipcRenderer.invoke('library:pick'),
  removeBook: (id: string) => ipcRenderer.invoke('library:remove', id),
  updateBook: (id: string, patch: { title?: string; author?: string; language?: string; cover?: boolean }) =>
    ipcRenderer.invoke('library:update', id, patch),
  saveCover: (id: string, bytes: Uint8Array, ext: string) => ipcRenderer.invoke('library:cover', id, bytes, ext),
  saveProgress: (id: string, progress: ReadingProgress) => ipcRenderer.invoke('library:progress', id, progress),
  getNotes: (id: string) => ipcRenderer.invoke('notes:get', id),
  listNotes: () => ipcRenderer.invoke('notes:list'),
  addHighlight: (id: string, input: NewHighlight) => ipcRenderer.invoke('notes:add', id, input),
  updateHighlight: (id: string, highlightId: string, note: string) =>
    ipcRenderer.invoke('notes:update', id, highlightId, note),
  deleteHighlight: (id: string, highlightId: string) => ipcRenderer.invoke('notes:delete', id, highlightId),
  saveFreeform: (id: string, freeform: string) => ipcRenderer.invoke('notes:freeform', id, freeform),
  openNote: (id: string) => ipcRenderer.invoke('notes:open', id),
  revealLibrary: () => ipcRenderer.invoke('library:reveal'),
  chooseLibrary: () => ipcRenderer.invoke('library:choose'),
  setSettings: (patch: Partial<Settings>) => ipcRenderer.invoke('settings:set', patch),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open', url),
  setTitle: (title: string) => ipcRenderer.send('window:title', title),
  pathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  onTheme: (cb: (dark: boolean) => void) => {
    const listener = (_event: unknown, dark: boolean) => {
      applyDark(dark)
      cb(dark)
    }
    ipcRenderer.on('theme:native', listener)
    return () => ipcRenderer.removeListener('theme:native', listener)
  },
  onOpenBook: (cb: (id: string) => void) => {
    const listener = (_event: unknown, id: string) => cb(id)
    ipcRenderer.on('library:open', listener)
    return () => ipcRenderer.removeListener('library:open', listener)
  },
  onLibraryChanged: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('library:changed', listener)
    return () => ipcRenderer.removeListener('library:changed', listener)
  },
  onImportRequest: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('library:import-request', listener)
    return () => ipcRenderer.removeListener('library:import-request', listener)
  },
  onNavigate: (cb: (target: 'library' | 'notes') => void) => {
    const library = () => cb('library')
    const notes = () => cb('notes')
    ipcRenderer.on('nav:library', library)
    ipcRenderer.on('nav:notes', notes)
    return () => {
      ipcRenderer.removeListener('nav:library', library)
      ipcRenderer.removeListener('nav:notes', notes)
    }
  },
})
