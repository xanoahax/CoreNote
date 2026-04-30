import { contextBridge, ipcRenderer } from 'electron'
import type { CoreNoteApi } from '../shared/api'
import type { CreateNoteInput, NoteUpdate, SearchNotesInput } from '../shared/notes'

const api: CoreNoteApi = {
  listNotes: () => ipcRenderer.invoke('notes:list'),
  searchNotes: (input: SearchNotesInput) => ipcRenderer.invoke('notes:search', input),
  createNote: (input?: CreateNoteInput) => ipcRenderer.invoke('notes:create', input),
  getNote: (id: string) => ipcRenderer.invoke('notes:get', id),
  updateNote: (input: NoteUpdate) => ipcRenderer.invoke('notes:update', input),
  deleteNote: (id: string) => ipcRenderer.invoke('notes:delete', id),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close')
}

contextBridge.exposeInMainWorld('coreNote', api)
contextBridge.exposeInMainWorld('notivate', api)
