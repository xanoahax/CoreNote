export type NoteSummary = {
  id: string
  title: string
  preview: string
  pinned: boolean
  createdAt: string
  updatedAt: string
}

export type Note = NoteSummary & {
  contentJson: string
  contentText: string
}

export type NoteUpdate = {
  id: string
  title: string
  contentJson: string
  contentText: string
}

export type CreateNoteInput = {
  title?: string
}

export type SearchNotesInput = {
  query: string
}
