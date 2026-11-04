import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  net,
  protocol,
  shell,
} from 'electron'
import { pathToFileURL } from 'node:url'
import type { BookRecord, ImportResult, LibraryMove, NewHighlight, ReadingProgress, Settings } from '../shared/types'
import { findLooseBooks } from './scan'
import { LibraryStore } from './store'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'codex',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
])

app.setName('书洋')
app.setAppUserModelId('app.shuyang.desktop')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

let store: LibraryStore
let mainWindow: BrowserWindow | null = null

function configFile(): string {
  const portable = process.env.PORTABLE_EXECUTABLE_DIR
  if (portable) return path.join(portable, '书洋.json')
  return path.join(app.getPath('userData'), 'config.json')
}

function readLibraryOverride(): string | null {
  try {
    const parsed = JSON.parse(readFileSync(configFile(), 'utf8')) as { libraryRoot?: unknown }
    return typeof parsed.libraryRoot === 'string' && parsed.libraryRoot.trim() ? parsed.libraryRoot : null
  } catch {
    return null
  }
}

function writeLibraryOverride(libraryRoot: string): void {
  const file = configFile()
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({ libraryRoot }, null, 2))
}

function defaultLibraryRoot(): string {
  const portable = process.env.PORTABLE_EXECUTABLE_DIR
  if (portable) {
    const next = path.join(portable, '书库')
    const legacy = path.join(portable, 'CodexLibrary')
    if (!existsSync(next) && existsSync(legacy)) return legacy
    return next
  }
  return path.join(app.getPath('userData'), 'library')
}

function libraryRoot(): string {
  const saved = readLibraryOverride()
  if (saved && existsSync(saved)) return saved
  return defaultLibraryRoot()
}

async function relocateLibrary(dir: string): Promise<LibraryMove> {
  const resolved = path.resolve(dir)
  mkdirSync(resolved, { recursive: true })
  writeLibraryOverride(resolved)
  store = new LibraryStore(resolved)
  const found = await findLooseBooks(resolved)
  const imported: ImportResult = await store.importPaths(found)
  mainWindow?.webContents.send('library:changed')
  return { libraryRoot: store.root, imported }
}

function isDark(): boolean {
  return nativeTheme.shouldUseDarkColors
}

function chrome(dark = isDark()) {
  return {
    color: dark ? '#14110f' : '#f4efe6',
    symbolColor: dark ? '#f3ece4' : '#1d1814',
    height: 44,
  }
}

function appearance() {
  return {
    settings: store.settings,
    dark: isDark(),
    portable: Boolean(process.env.PORTABLE_EXECUTABLE_DIR),
    libraryRoot: store.root,
    version: app.getVersion(),
  }
}

function publishTheme(): void {
  const dark = isDark()
  for (const win of BrowserWindow.getAllWindows()) {
    win.setTitleBarOverlay(chrome(dark))
    win.setBackgroundColor(dark ? '#14110f' : '#f4efe6')
    win.webContents.send('theme:native', dark)
  }
}

function contentSecurityPolicy(): string {
  const dev = Boolean(process.env.ELECTRON_RENDERER_URL)
  const script = dev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'"
  const connect = dev
    ? "connect-src 'self' codex: blob: data: ws: http://localhost:* http://127.0.0.1:*"
    : "connect-src 'self' codex: blob: data:"
  return [
    "default-src 'self' codex: blob: data:",
    script,
    "style-src 'self' 'unsafe-inline' blob:",
    "img-src 'self' codex: blob: data:",
    "font-src 'self' blob: data:",
    connect,
    "worker-src 'self' blob:",
    "frame-src 'self' blob: data:",
    "media-src 'self' blob: data:",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ')
}

function bookArgs(argv: string[]): string[] {
  return argv.filter((arg) => /\.(epub|mobi|azw3?|prc)$/i.test(arg) && existsSync(arg))
}

async function importAndOpen(filePaths: string[]): Promise<void> {
  if (!filePaths.length) return
  const result = await store.importPaths(filePaths)
  const book = result.added[0] || store.books.find((item) => item.sourceName === path.basename(filePaths[0]))
  mainWindow?.webContents.send('library:changed')
  if (book) mainWindow?.webContents.send('library:open', book.id)
  if (!result.added.length && result.skipped.length) {
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: '书洋',
      message: result.skipped[0].reason,
      detail: result.skipped.map((item) => `${item.name}：${item.reason}`).join('\n'),
    })
  }
}

function registerProtocol(): void {
  protocol.handle('codex', async (request) => {
    try {
      const url = new URL(request.url)
      const id = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      if (url.hostname === 'book') {
        const file = store.bookPath(id)
        if (!file || !existsSync(file)) return new Response('missing', { status: 404 })
        return net.fetch(pathToFileURL(file).href)
      }
      if (url.hostname === 'cover') {
        const file = store.coverPath(id)
        if (!file || !existsSync(file)) return new Response('missing', { status: 404 })
        return net.fetch(pathToFileURL(file).href)
      }
      return new Response('missing', { status: 404 })
    } catch {
      return new Response('error', { status: 500 })
    }
  })
}

function registerIpc(): void {
  ipcMain.on('app:boot', (event) => {
    event.returnValue = appearance()
  })
  ipcMain.handle('library:list', () => store.books)
  ipcMain.handle('library:import', (_event, paths: string[]) => store.importPaths(paths))
  ipcMain.handle('library:pick', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '收入书库',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '电子书', extensions: ['epub', 'mobi', 'azw', 'azw3', 'prc'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    })
    if (result.canceled) return { added: [], skipped: [] }
    return store.importPaths(result.filePaths)
  })
  ipcMain.handle('library:remove', (_event, id: string) => store.removeBook(id))
  ipcMain.handle('library:update', (_event, id: string, patch: Partial<BookRecord>) => store.updateBook(id, patch))
  ipcMain.handle('library:cover', (_event, id: string, bytes: Uint8Array, ext: string) => store.saveCover(id, bytes, ext))
  ipcMain.handle('library:progress', (_event, id: string, progress: ReadingProgress) => store.saveProgress(id, progress))
  ipcMain.handle('notes:get', (_event, id: string) => store.getNotes(id))
  ipcMain.handle('notes:list', () => store.listNotes())
  ipcMain.handle('notes:add', (_event, id: string, input: NewHighlight) => store.addHighlight(id, input))
  ipcMain.handle('notes:update', (_event, id: string, highlightId: string, note: string) => store.updateHighlight(id, highlightId, note))
  ipcMain.handle('notes:delete', (_event, id: string, highlightId: string) => store.deleteHighlight(id, highlightId))
  ipcMain.handle('notes:freeform', (_event, id: string, freeform: string) => store.saveFreeform(id, freeform))
  ipcMain.handle('notes:open', async (_event, id: string) => {
    await store.getNotes(id)
    const error = await shell.openPath(store.noteMdPath(id))
    if (error) throw new Error(error)
  })
  ipcMain.handle('library:reveal', () => shell.openPath(store.root))
  ipcMain.handle('library:choose', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择书库位置',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return relocateLibrary(result.filePaths[0])
  })
  ipcMain.handle('settings:set', (_event, patch: Partial<Settings>) => {
    store.updateSettings(patch)
    nativeTheme.themeSource = store.settings.theme
    publishTheme()
    return appearance()
  })
  ipcMain.handle('shell:open', (_event, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
    return undefined
  })
  ipcMain.on('window:title', (event, title: string) => {
    const text = String(title || '书洋').slice(0, 140)
    BrowserWindow.fromWebContents(event.sender)?.setTitle(text)
  })
}

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '收入书库…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('library:import-request'),
        },
        { label: '打开书库文件夹', click: () => shell.openPath(store.root) },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '书库', accelerator: 'CmdOrCtrl+Shift+L', click: () => mainWindow?.webContents.send('nav:library') },
        { label: '笔记', accelerator: 'CmdOrCtrl+Shift+N', click: () => mainWindow?.webContents.send('nav:notes') },
        { type: 'separator' },
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具', visible: !app.isPackaged },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  const dark = isDark()
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: dark ? '#14110f' : '#f4efe6',
    title: '书洋',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: chrome(dark),
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    const allowed = url.startsWith('file:') || url.startsWith('devtools:') || (devUrl && url.startsWith(devUrl))
    if (!allowed) event.preventDefault()
  })
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders }
    headers['Content-Security-Policy'] = [contentSecurityPolicy()]
    callback({ responseHeaders: headers })
  })

  if (process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
}

function iconPath(): string | undefined {
  const candidates = [
    path.join(process.resourcesPath, 'icon.png'),
    path.join(app.getAppPath(), 'build', 'icon.png'),
  ]
  return candidates.find((file) => existsSync(file))
}

if (gotLock) {
  app.whenReady().then(async () => {
    const { mkdirSync } = await import('node:fs')
    const root = libraryRoot()
    mkdirSync(root, { recursive: true })
    store = new LibraryStore(root)
    nativeTheme.themeSource = store.settings.theme
    registerProtocol()
    registerIpc()
    createMenu()
    createWindow()
    nativeTheme.on('updated', publishTheme)
    app.on('second-instance', (_event, argv) => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
      }
      void importAndOpen(bookArgs(argv))
    })
    const opened = bookArgs(process.argv)
    if (opened.length) mainWindow?.webContents.once('did-finish-load', () => { void importAndOpen(opened) })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
