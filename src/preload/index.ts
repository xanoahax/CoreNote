import { contextBridge, ipcRenderer } from 'electron'
import type { CoreNoteApi } from '../shared/api'
import type { SaveImageInput } from '../shared/images'
import type { CreateNoteInput, NoteUpdate, SearchNotesInput } from '../shared/notes'
import type { UpdateStatus } from '../shared/updates'

const api: CoreNoteApi = {
  listNotes: () => ipcRenderer.invoke('notes:list'),
  searchNotes: (input: SearchNotesInput) => ipcRenderer.invoke('notes:search', input),
  createNote: (input?: CreateNoteInput) => ipcRenderer.invoke('notes:create', input),
  getNote: (id: string) => ipcRenderer.invoke('notes:get', id),
  updateNote: (input: NoteUpdate) => ipcRenderer.invoke('notes:update', input),
  deleteNote: (id: string) => ipcRenderer.invoke('notes:delete', id),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  getUpdateStatus: () => ipcRenderer.invoke('updates:get-status'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  chooseImage: () => ipcRenderer.invoke('images:choose'),
  saveImage: (input: SaveImageInput) => ipcRenderer.invoke('images:save', input),
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void => {
      callback(status)
    }

    ipcRenderer.on('updates:status', listener)

    return () => {
      ipcRenderer.removeListener('updates:status', listener)
    }
  }
}

contextBridge.exposeInMainWorld('coreNote', api)
contextBridge.exposeInMainWorld('notivate', api)
