import { app, BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log/main.js'
import electronUpdater from 'electron-updater'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'
import type { UpdateStatus } from '../shared/updates'

const { autoUpdater } = electronUpdater

let updateStatus: UpdateStatus = {
  state: app.isPackaged ? 'idle' : 'disabled',
  currentVersion: app.getVersion(),
  isPackaged: app.isPackaged,
  message: app.isPackaged ? 'Ready to check for updates.' : 'Updates are available in installed builds.'
}

const publishUpdateStatus = (status: UpdateStatus): UpdateStatus => {
  updateStatus = status

  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send('updates:status', updateStatus)
  })

  return updateStatus
}

const setUpdateStatus = (status: Partial<UpdateStatus>): UpdateStatus =>
  publishUpdateStatus({
    ...updateStatus,
    ...status,
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged
  })

const getUpdateVersion = (info: UpdateInfo): string => info.version || updateStatus.version || app.getVersion()

export const registerUpdateIpc = (): void => {
  ipcMain.handle('updates:get-status', () => updateStatus)

  ipcMain.handle('updates:check', async () => {
    if (!app.isPackaged) {
      return setUpdateStatus({
        state: 'disabled',
        message: 'Updates are available in installed builds.'
      })
    }

    if (updateStatus.state === 'checking' || updateStatus.state === 'downloading') {
      return updateStatus
    }

    setUpdateStatus({ state: 'checking', percent: undefined, message: 'Checking for updates...' })
    await autoUpdater.checkForUpdates()

    return updateStatus
  })

  ipcMain.handle('updates:download', async () => {
    if (!app.isPackaged) {
      return setUpdateStatus({
        state: 'disabled',
        message: 'Updates are available in installed builds.'
      })
    }

    if (updateStatus.state !== 'available') {
      return updateStatus
    }

    setUpdateStatus({ state: 'downloading', percent: 0, message: 'Downloading update...' })
    await autoUpdater.downloadUpdate()

    return updateStatus
  })

  ipcMain.handle('updates:install', () => {
    if (updateStatus.state === 'downloaded') {
      autoUpdater.quitAndInstall(false, true)
    }
  })
}

export const configureAutoUpdater = (): void => {
  log.initialize()
  autoUpdater.logger = log
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => {
    setUpdateStatus({ state: 'checking', percent: undefined, message: 'Checking for updates...' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    setUpdateStatus({
      state: 'available',
      version: getUpdateVersion(info),
      percent: undefined,
      message: `CoreNote ${getUpdateVersion(info)} is available.`
    })
  })

  autoUpdater.on('update-not-available', () => {
    setUpdateStatus({
      state: 'not-available',
      percent: undefined,
      message: 'CoreNote is up to date.'
    })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    setUpdateStatus({
      state: 'downloading',
      percent: Math.round(progress.percent),
      message: `Downloading update ${Math.round(progress.percent)}%...`
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    setUpdateStatus({
      state: 'downloaded',
      version: getUpdateVersion(info),
      percent: 100,
      message: `CoreNote ${getUpdateVersion(info)} is ready to install.`
    })
  })

  autoUpdater.on('error', (error: Error) => {
    setUpdateStatus({
      state: 'error',
      percent: undefined,
      message: error.message || 'Update check failed.'
    })
  })
}

export const checkForUpdatesAfterStartup = (): void => {
  if (!app.isPackaged) {
    return
  }

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Update check failed.'
      setUpdateStatus({ state: 'error', message })
    })
  }, 4500)
}
