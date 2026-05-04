import { app, BrowserWindow, dialog, ipcMain, nativeImage, protocol, shell } from 'electron'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, extname, join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { NotesDatabase } from './database'
import { checkForUpdatesAfterStartup, configureAutoUpdater, registerUpdateIpc } from './updater'
import type { NoteImage, SaveImageInput } from '../shared/images'
import type { CreateNoteInput, NoteUpdate, SearchNotesInput } from '../shared/notes'

let notesDb: NotesDatabase
const appIconFileName = 'corenote_logo_new.png'
const imageProtocol = 'corenote-image'
const allowedImageExtensions = new Set(['.apng', '.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp'])
const dataUrlImageTypes = new Map([
  ['image/apng', '.apng'],
  ['image/avif', '.avif'],
  ['image/gif', '.gif'],
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp']
])
const imageContentTypes = new Map([
  ['.apng', 'image/apng'],
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp']
])

app.setName('CoreNote')
app.setAppUserModelId('CoreNote')
protocol.registerSchemesAsPrivileged([
  {
    scheme: imageProtocol,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
])

const getImagesDirectory = (): string => join(app.getPath('userData'), 'images')

const getImageUrl = (fileName: string): string => `${imageProtocol}://local/${encodeURIComponent(fileName)}`

const saveImageFile = async (sourcePath: string): Promise<NoteImage> => {
  const extension = extname(sourcePath).toLowerCase()

  if (!allowedImageExtensions.has(extension)) {
    throw new Error('Unsupported image format.')
  }

  await mkdir(getImagesDirectory(), { recursive: true })

  const fileName = `${randomUUID()}${extension}`
  const destinationPath = join(getImagesDirectory(), fileName)

  await copyFile(sourcePath, destinationPath)

  return {
    src: getImageUrl(fileName),
    alt: basename(sourcePath, extension)
  }
}

const saveImageDataUrl = async (input: SaveImageInput): Promise<NoteImage> => {
  const match = input.dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i)

  if (!match) {
    throw new Error('Unsupported image data.')
  }

  const mimeType = match[1].toLowerCase()
  const extension = dataUrlImageTypes.get(mimeType)

  if (!extension) {
    throw new Error('Unsupported image format.')
  }

  await mkdir(getImagesDirectory(), { recursive: true })

  const fileName = `${randomUUID()}${extension}`
  const destinationPath = join(getImagesDirectory(), fileName)

  await writeFile(destinationPath, Buffer.from(match[2], 'base64'))

  return {
    src: getImageUrl(fileName),
    alt: input.fileName ? basename(input.fileName, extname(input.fileName)) : 'Pasted image'
  }
}

const registerImageProtocol = (): void => {
  protocol.handle(imageProtocol, async (request) => {
    const url = new URL(request.url)
    const fileName = basename(decodeURIComponent(url.pathname))
    const extension = extname(fileName).toLowerCase()

    if (!allowedImageExtensions.has(extension)) {
      return new Response(null, { status: 404 })
    }

    const imagePath = join(getImagesDirectory(), fileName)
    const image = await readFile(imagePath)

    return new Response(image, {
      headers: {
        'content-type': imageContentTypes.get(extension) ?? 'application/octet-stream'
      }
    })
  })
}

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

  const showMainWindow = (): void => {
    if (mainWindow.isDestroyed() || mainWindow.isVisible()) {
      return
    }

    mainWindow.show()
    mainWindow.focus()
  }

  mainWindow.on('ready-to-show', showMainWindow)
  mainWindow.webContents.on('did-finish-load', showMainWindow)
  setTimeout(() => {
    showMainWindow()
  }, 1600)

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
  ipcMain.handle('images:choose', async (event): Promise<NoteImage | null> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const dialogOptions: Electron.OpenDialogOptions = {
      title: 'Insert image',
      properties: ['openFile'],
      filters: [
        {
          name: 'Images',
          extensions: ['apng', 'avif', 'gif', 'jpeg', 'jpg', 'png', 'webp']
        }
      ]
    }
    const result = window
      ? await dialog.showOpenDialog(window, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (result.canceled || !result.filePaths[0]) {
      return null
    }

    return saveImageFile(result.filePaths[0])
  })
  ipcMain.handle('images:save', (_event, input: SaveImageInput): Promise<NoteImage> => saveImageDataUrl(input))
}

app.whenReady().then(() => {
  notesDb = new NotesDatabase()
  registerImageProtocol()
  configureAutoUpdater()
  registerIpc()
  registerUpdateIpc()
  createWindow()
  checkForUpdatesAfterStartup()

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
