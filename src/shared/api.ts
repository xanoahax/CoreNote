import type { CreateNoteInput, Note, NoteSummary, NoteUpdate, SearchNotesInput } from './notes'
import type { UpdateStatus } from './updates'

export type CoreNoteApi = {
  listNotes: () => Promise<NoteSummary[]>
  searchNotes: (input: SearchNotesInput) => Promise<NoteSummary[]>
  createNote: (input?: CreateNoteInput) => Promise<Note>
  getNote: (id: string) => Promise<Note | null>
  updateNote: (input: NoteUpdate) => Promise<Note>
  deleteNote: (id: string) => Promise<void>
  minimizeWindow: () => Promise<void>
  toggleMaximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  getUpdateStatus: () => Promise<UpdateStatus>
  checkForUpdates: () => Promise<UpdateStatus>
  downloadUpdate: () => Promise<UpdateStatus>
  installUpdate: () => Promise<void>
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void
}

declare global {
  interface Window {
    coreNote: CoreNoteApi
    notivate: CoreNoteApi
  }
}
