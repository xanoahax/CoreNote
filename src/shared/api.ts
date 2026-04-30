import type { CreateNoteInput, Note, NoteSummary, NoteUpdate, SearchNotesInput } from './notes'

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
}

declare global {
  interface Window {
    coreNote: CoreNoteApi
    notivate: CoreNoteApi
  }
}
