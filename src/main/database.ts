import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import type { CreateNoteInput, Note, NoteSummary, NoteUpdate, SearchNotesInput } from '../shared/notes'

const now = (): string => new Date().toISOString()

const noteFromRow = (row: Record<string, unknown>): Note => ({
  id: String(row.id),
  title: String(row.title),
  preview: String(row.preview ?? ''),
  pinned: Boolean(row.pinned),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  contentJson: String(row.content_json),
  contentText: String(row.content_text ?? '')
})

const summaryFromRow = (row: Record<string, unknown>): NoteSummary => ({
  id: String(row.id),
  title: String(row.title),
  preview: String(row.preview ?? ''),
  pinned: Boolean(row.pinned),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
})

export class NotesDatabase {
  private readonly db: Database.Database

  constructor() {
    const dbPath = join(app.getPath('userData'), 'corenote.sqlite')
    const legacyDbPath = join(app.getPath('appData'), 'notivate', 'notivate.sqlite')

    mkdirSync(dirname(dbPath), { recursive: true })

    if (!existsSync(dbPath) && existsSync(legacyDbPath)) {
      copyFileSync(legacyDbPath, dbPath)
    }

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('secure_delete = ON')
    this.migrate()
  }

  listNotes(): NoteSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id, title, substr(content_text, 1, 140) AS preview, pinned, created_at, updated_at
         FROM notes
         ORDER BY pinned DESC, updated_at DESC`
      )
      .all() as Record<string, unknown>[]

    return rows.map(summaryFromRow)
  }

  searchNotes(input: SearchNotesInput): NoteSummary[] {
    const query = input.query.trim()

    if (!query) {
      return this.listNotes()
    }

    const rows = this.db
      .prepare(
        `SELECT n.id,
                n.title,
                snippet(notes_fts, 1, '', '', '...', 14) AS preview,
                n.pinned,
                n.created_at,
                n.updated_at
         FROM notes_fts
         JOIN notes n ON n.id = notes_fts.id
         WHERE notes_fts MATCH ?
         ORDER BY rank`
      )
      .all(this.escapeFtsQuery(query)) as Record<string, unknown>[]

    return rows.map(summaryFromRow)
  }

  createNote(input: CreateNoteInput = {}): Note {
    const id = crypto.randomUUID()
    const timestamp = now()
    const title = input.title?.trim() || 'Untitled'
    const contentJson = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph' }]
    })

    this.db
      .prepare(
        `INSERT INTO notes (id, title, content_json, content_text, pinned, created_at, updated_at)
         VALUES (?, ?, ?, '', 0, ?, ?)`
      )
      .run(id, title, contentJson, timestamp, timestamp)

    const note = this.getNote(id)

    if (!note) {
      throw new Error('Note creation failed.')
    }

    return note
  }

  getNote(id: string): Note | null {
    const row = this.db
      .prepare(
        `SELECT id,
                title,
                substr(content_text, 1, 140) AS preview,
                pinned,
                created_at,
                updated_at,
                content_json,
                content_text
         FROM notes
         WHERE id = ?`
      )
      .get(id) as Record<string, unknown> | undefined

    return row ? noteFromRow(row) : null
  }

  updateNote(input: NoteUpdate): Note {
    const timestamp = now()
    const title = input.title.trim() || 'Untitled'

    this.db
      .prepare(
        `UPDATE notes
         SET title = ?, content_json = ?, content_text = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(title, input.contentJson, input.contentText, timestamp, input.id)

    const note = this.getNote(input.id)

    if (!note) {
      throw new Error('Note not found.')
    }

    return note
  }

  deleteNote(id: string): void {
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content_json TEXT NOT NULL,
        content_text TEXT NOT NULL DEFAULT '',
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
        id UNINDEXED,
        title,
        content_text,
        tokenize = 'unicode61'
      );

      DROP TRIGGER IF EXISTS notes_ai;
      DROP TRIGGER IF EXISTS notes_ad;
      DROP TRIGGER IF EXISTS notes_au;

      CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
        INSERT INTO notes_fts(rowid, id, title, content_text)
        VALUES (new.rowid, new.id, new.title, new.content_text);
      END;

      CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
        DELETE FROM notes_fts WHERE rowid = old.rowid;
      END;

      CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
        DELETE FROM notes_fts WHERE rowid = old.rowid;
        INSERT INTO notes_fts(rowid, id, title, content_text)
        VALUES (new.rowid, new.id, new.title, new.content_text);
      END;
    `)
  }

  private escapeFtsQuery(query: string): string {
    return query
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `"${term.replaceAll('"', '""')}"*`)
      .join(' AND ')
  }
}
