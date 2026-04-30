import { app, BrowserWindow, ipcMain, nativeImage, shell } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { NotesDatabase } from './database'
import type { CreateNoteInput, NoteUpdate, SearchNotesInput } from '../shared/notes'

let notesDb: NotesDatabase
const appIconFileName = 'corenote_logo_new.png'

app.setName('CoreNote')
app.setAppUserModelId('CoreNote')

const getAppIcon = (): Electron.NativeImage => {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'assets', appIconFileName)
    : join(process.cwd(), 'assets', appIconFileName)

  return nativeImage.createFromPath(iconPath).resize({
    width: 256,
    height: 256,
    quality: 'best'
  })
}

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 560,
    show: false,
    title: 'CoreNote',
    icon: getAppIcon(),
    backgroundColor: '#0f0f0f',
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const registerIpc = (): void => {
  ipcMain.handle('notes:list', () => notesDb.listNotes())
  ipcMain.handle('notes:search', (_event, input: SearchNotesInput) => notesDb.searchNotes(input))
  ipcMain.handle('notes:create', (_event, input?: CreateNoteInput) => notesDb.createNote(input))
  ipcMain.handle('notes:get', (_event, id: string) => notesDb.getNote(id))
  ipcMain.handle('notes:update', (_event, input: NoteUpdate) => notesDb.updateNote(input))
  ipcMain.handle('notes:delete', (_event, id: string) => notesDb.deleteNote(id))
  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.handle('window:toggle-maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)

    if (!window) {
      return
    }

    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
  })
  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
}

app.whenReady().then(() => {
  notesDb = new NotesDatabase()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
