import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { Fragment } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import {
  CollapsibleSection,
  CollapsibleSectionContent,
  CollapsibleSectionTitle
} from './extensions/collapsibleSection'
import { SlashFormatting } from './extensions/slashFormatting'
import { TextColor } from './extensions/textColor'
import {
  Bold,
  Clipboard,
  ChevronRight,
  Copy,
  Download,
  Scissors,
  Eraser,
  FileText,
  Heading,
  Heading1,
  Heading2,
  Italic,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Square,
  Trash2,
  Underline as UnderlineIcon,
  X,
  type LucideIcon
} from 'lucide-react'
import type { Note, NoteSummary } from '../../shared/notes'
import type { UpdateStatus } from '../../shared/updates'

const coreNoteLogoUrl = new URL('../../../assets/corenote_logo_new.png', import.meta.url).href

const emptyDoc = {
  type: 'doc',
  content: [{ type: 'paragraph' }]
}

const normalizeEditorNode = (node: Record<string, unknown>): Record<string, unknown>[] => {
  if (node.type === 'paragraph' && Array.isArray(node.content)) {
    const checkboxIndex = node.content.findIndex(
      (child) => Boolean(child) && typeof child === 'object' && (child as Record<string, unknown>).type === 'inlineCheckbox'
    )

    if (checkboxIndex >= 0) {
      const checkbox = node.content[checkboxIndex] as Record<string, unknown>
      const checked = Boolean((checkbox.attrs as Record<string, unknown> | undefined)?.checked)
      const paragraphContent = node.content.filter((_, index) => index !== checkboxIndex)

      return [
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked },
              content: [
                {
                  ...node,
                  content: paragraphContent
                }
              ]
            }
          ]
        }
      ]
    }
  }

  const normalizedNode = { ...node }

  if (Array.isArray(node.content)) {
    normalizedNode.content = node.content.flatMap((child) => {
      if (!child || typeof child !== 'object') {
        return []
      }

      return normalizeEditorNode(child as Record<string, unknown>)
    })
  }

  return [normalizedNode]
}

const normalizeEditorDoc = (doc: Record<string, unknown>): Record<string, unknown> => ({
  ...doc,
  content: Array.isArray(doc.content)
    ? doc.content.flatMap((node) => {
        if (!node || typeof node !== 'object') {
          return []
        }

        return normalizeEditorNode(node as Record<string, unknown>)
      })
    : emptyDoc.content
})

const readJson = (value: string): Record<string, unknown> => {
  try {
    return normalizeEditorDoc(JSON.parse(value))
  } catch {
    return emptyDoc
  }
}

type EditorAction =
  | 'bold'
  | 'checkbox'
  | 'clear'
  | 'cut'
  | 'copy'
  | 'divider'
  | 'heading-1'
  | 'heading-2'
  | 'italic'
  | 'paste'
  | 'text-color-accent'
  | 'text-color-blue'
  | 'text-color-green'
  | 'text-color-red'
  | 'text-color-white'
  | 'underline'

type EditorMenuItem =
  {
    action: EditorAction
    icon: LucideIcon
    label: string
  }

const editorMenuItems: EditorMenuItem[] = [
  { action: 'cut', icon: Scissors, label: 'Cut' },
  { action: 'copy', icon: Copy, label: 'Copy' },
  { action: 'paste', icon: Clipboard, label: 'Paste' }
]

const contextTextColors = [
  { action: 'text-color-white', label: 'White', color: '#ffffff' },
  { action: 'text-color-accent', label: 'Accent', color: '#b7741d' },
  { action: 'text-color-red', label: 'Red', color: '#ff6b6b' },
  { action: 'text-color-blue', label: 'Blue', color: '#6ea8ff' },
  { action: 'text-color-green', label: 'Green', color: '#7bd88f' }
] satisfies { action: EditorAction; label: string; color: string }[]

type SlashSuggestion = {
  query: string
  mode: 'root' | 'textStyle' | 'heading' | 'insert' | 'textColor'
  items: {
    id: string
    label: string
    kind: 'command' | 'folder'
    color?: string
  }[]
  selectedIndex: number
  x: number
  y: number
}
type ActiveFormatState = {
  bold: boolean
  italic: boolean
  underline: boolean
  heading: 1 | 2 | null
  color: {
    id: string
    label: string
    value: string
  } | null
}
type FormatBadge = {
  id: 'bold' | 'italic' | 'underline' | 'heading' | 'color'
  label: string
  color?: string
}

const defaultNoteTitle = 'New Note'
const defaultNoteTitles = new Set([defaultNoteTitle, 'Neue Notiz'])
const plainFormatState: ActiveFormatState = {
  bold: false,
  italic: false,
  underline: false,
  heading: null,
  color: null
}
const plainUpdateStatus: UpdateStatus = {
  state: 'idle',
  currentVersion: '',
  isPackaged: false
}

const formatNoteDate = (value: string): string => {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayDiff = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000)

  if (dayDiff === 0) {
    return 'Today'
  }

  if (dayDiff === 1) {
    return 'Yesterday'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric'
  }).format(date)
}

const removeEditorMark = (editor: Editor, markName: string): void => {
  const markType = editor.state.schema.marks[markName]

  if (!markType) {
    return
  }

  const { from, to, empty, $from } = editor.state.selection
  const currentMarks = editor.state.storedMarks ?? $from.marks()
  const tr = empty
    ? editor.state.tr.setStoredMarks(currentMarks.filter((mark) => mark.type !== markType))
    : editor.state.tr.removeMark(from, to, markType)

  editor.view.dispatch(tr)
}

const clearEditorFormatting = (editor: Editor): void => {
  const { state } = editor
  const paragraphNode = state.schema.nodes.paragraph
  const { from, to, empty } = state.selection
  let tr = state.tr.setStoredMarks([])

  if (!empty) {
    Object.values(state.schema.marks).forEach((markType) => {
      tr = tr.removeMark(from, to, markType)
    })
  }

  if (paragraphNode && state.selection.$from.parent.type !== paragraphNode) {
    tr = tr.setBlockType(from, to, paragraphNode)
  }

  editor.view.dispatch(tr)
}

const setEditorTextColor = (editor: Editor, color: string): void => {
  const textColorMark = editor.state.schema.marks.textColor

  if (!textColorMark) {
    return
  }

  const { from, to, empty, $from } = editor.state.selection
  const activeMarks = editor.state.storedMarks ?? $from.marks()
  const textColor = textColorMark.create({ color })
  const tr = empty
    ? editor.state.tr.setStoredMarks([...activeMarks.filter((mark) => mark.type !== textColorMark), textColor])
    : editor.state.tr.removeMark(from, to, textColorMark).addMark(from, to, textColor)

  editor.view.dispatch(tr)
}

const insertEditorDivider = (editor: Editor): void => {
  const { state } = editor
  const horizontalRuleNode = state.schema.nodes.horizontalRule
  const paragraphNode = state.schema.nodes.paragraph

  if (!horizontalRuleNode || !paragraphNode || !state.selection.empty) {
    editor.chain().focus().setHorizontalRule().run()
    return
  }

  const { $from } = state.selection
  const blockFrom = $from.before($from.depth)
  const blockTo = $from.after($from.depth)
  const horizontalRule = horizontalRuleNode.create()
  const paragraph = paragraphNode.create()
  const nextCursorPosition = blockFrom + horizontalRule.nodeSize + 1
  const tr = state.tr.replaceWith(blockFrom, blockTo, Fragment.fromArray([horizontalRule, paragraph]))

  tr.setSelection(TextSelection.create(tr.doc, nextCursorPosition))

  editor.view.dispatch(tr.scrollIntoView())
}

export function App() {
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [activeNote, setActiveNote] = useState<Note | null>(null)
  const [query, setQuery] = useState('')
  const [title, setTitle] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [appError, setAppError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [editorMenu, setEditorMenu] = useState<{ x: number; y: number } | null>(null)
  const [slashSuggestion, setSlashSuggestion] = useState<SlashSuggestion | null>(null)
  const [activeFormats, setActiveFormats] = useState<ActiveFormatState>(plainFormatState)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(plainUpdateStatus)
  const saveTimerRef = useRef<number | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const activeNoteRef = useRef<Note | null>(null)
  const activeNoteIdRef = useRef<string | null>(null)
  const titleRef = useRef('')
  const toastTimerRef = useRef<number | null>(null)
  const activeNoteId = activeNote?.id ?? null

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TaskList,
      TaskItem.configure({
        nested: true
      }),
      CollapsibleSection,
      CollapsibleSectionTitle,
      CollapsibleSectionContent,
      TextColor,
      SlashFormatting,
      Placeholder.configure({
        placeholder: 'Start writing...'
      })
    ],
    content: emptyDoc,
    editorProps: {
      attributes: {
        class: 'editor-surface'
      }
    },
    onUpdate: ({ editor }) => {
      scheduleSave(titleRef.current, JSON.stringify(editor.getJSON()), editor.getText())
    }
  })

  const focusEditorSoon = useCallback(() => {
    window.setTimeout(() => {
      editorRef.current?.commands.focus('end')
    }, 0)
  }, [])

  const closeEditorMenu = useCallback(() => {
    setEditorMenu(null)
  }, [])

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
    }

    setToast(message)
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null)
    }, 2800)
  }, [])

  const isEmptyNote = useCallback((note: Note | null): boolean => {
    if (!note) {
      return false
    }

    const liveContentText =
      note.id === activeNoteIdRef.current ? (editorRef.current?.getText() ?? note.contentText) : note.contentText
    const trimmedTitle = titleRef.current.trim()
    const hasCustomTitle = trimmedTitle !== '' && !defaultNoteTitles.has(trimmedTitle)
    const hasContent = liveContentText.trim().length > 0

    return !hasCustomTitle && !hasContent
  }, [])

  const deleteIfEmptyNote = useCallback(
    async (note: Note | null): Promise<boolean> => {
      if (!note || !isEmptyNote(note)) {
        return false
      }

      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }

      await window.coreNote.deleteNote(note.id)
      showToast('Empty note deleted')

      return true
    },
    [isEmptyNote, showToast]
  )

  const openEditorMenu = useCallback(
    (event: MouseEvent) => {
      if (!activeNote || !editor) {
        return
      }

      event.preventDefault()
      setEditorMenu({
        x: Math.min(event.clientX, window.innerWidth - 420),
        y: Math.min(event.clientY, window.innerHeight - 432)
      })
    },
    [activeNote, editor]
  )

  const runEditorAction = useCallback(
    async (action: EditorAction) => {
      if (!editor) {
        return
      }

      editor.commands.focus()

      switch (action) {
        case 'bold':
          editor.chain().focus().toggleBold().run()
          break
        case 'checkbox':
          editor.chain().focus().toggleTaskList().run()
          break
        case 'clear':
          clearEditorFormatting(editor)
          break
        case 'cut':
          document.execCommand('cut')
          break
        case 'copy':
          document.execCommand('copy')
          break
        case 'divider':
          insertEditorDivider(editor)
          break
        case 'paste': {
          const text = await navigator.clipboard.readText()

          if (text) {
            editor.chain().focus().insertContent(text).run()
          }

          break
        }
        case 'heading-1':
          editor.chain().focus().toggleHeading({ level: 1 }).run()
          break
        case 'heading-2':
          editor.chain().focus().toggleHeading({ level: 2 }).run()
          break
        case 'italic':
          editor.chain().focus().toggleItalic().run()
          break
        case 'text-color-accent':
          setEditorTextColor(editor, '#b7741d')
          break
        case 'text-color-blue':
          setEditorTextColor(editor, '#6ea8ff')
          break
        case 'text-color-green':
          setEditorTextColor(editor, '#7bd88f')
          break
        case 'text-color-red':
          setEditorTextColor(editor, '#ff6b6b')
          break
        case 'text-color-white':
          setEditorTextColor(editor, '#ffffff')
          break
        case 'underline':
          editor.chain().focus().toggleUnderline().run()
          break
      }

      closeEditorMenu()
      window.setTimeout(() => {
        editor.commands.focus()
      }, 0)
    },
    [closeEditorMenu, editor]
  )

  const updateIsBusy = updateStatus.state === 'checking' || updateStatus.state === 'downloading'
  const updatePanelIsVisible = ['available', 'downloading', 'downloaded', 'error'].includes(updateStatus.state)
  const updateButtonTitle = updateStatus.isPackaged ? 'Check for updates' : 'Updates are available in installed builds'

  const updateAction = useMemo(() => {
    if (updateStatus.state === 'available') {
      return {
        label: 'Download',
        icon: Download,
        run: () => window.coreNote.downloadUpdate().then(setUpdateStatus)
      }
    }

    if (updateStatus.state === 'downloaded') {
      return {
        label: 'Restart',
        icon: RotateCcw,
        run: () => window.coreNote.installUpdate()
      }
    }

    if (updateStatus.state === 'error') {
      return {
        label: 'Check',
        icon: RefreshCw,
        run: () => window.coreNote.checkForUpdates().then(setUpdateStatus)
      }
    }

    return null
  }, [updateStatus.state])

  const checkForUpdates = useCallback(() => {
    if (updateIsBusy) {
      return
    }

    window.coreNote.checkForUpdates().then(setUpdateStatus)
  }, [updateIsBusy])

  const loadNotes = useCallback(async () => {
    try {
      const nextNotes = query.trim()
        ? await window.coreNote.searchNotes({ query })
        : await window.coreNote.listNotes()

      setNotes(nextNotes)

      if (!activeNoteId && nextNotes.length > 0) {
        const firstNote = await window.coreNote.getNote(nextNotes[0].id)
        activeNoteRef.current = firstNote
        setActiveNote(firstNote)
        setTitle(firstNote?.title ?? '')
        activeNoteIdRef.current = firstNote?.id ?? null
        titleRef.current = firstNote?.title ?? ''
      }
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Could not load notes.')
    }
  }, [activeNoteId, query])

  const openNote = useCallback(
    async (id: string) => {
      const noteToLeave = activeNoteRef.current
      const deletedEmptyNote = await deleteIfEmptyNote(noteToLeave)
      const note = await window.coreNote.getNote(id)
      const nextNotes = await window.coreNote.listNotes()

      setNotes(nextNotes)
      activeNoteRef.current = deletedEmptyNote && note?.id === noteToLeave?.id ? null : note
      setActiveNote(activeNoteRef.current)
      setTitle(note?.title ?? '')
      activeNoteIdRef.current = note?.id ?? null
      titleRef.current = note?.title ?? ''
      editor?.commands.setContent(note ? readJson(note.contentJson) : emptyDoc, false)
      focusEditorSoon()
      setSaveState('idle')
    },
    [deleteIfEmptyNote, editor, focusEditorSoon]
  )

  const createNote = useCallback(async () => {
    setIsCreating(true)
    setAppError(null)

    try {
      await deleteIfEmptyNote(activeNoteRef.current)
      const note = await window.coreNote.createNote({ title: defaultNoteTitle })
      setNotes(await window.coreNote.listNotes())
      activeNoteRef.current = note
      setActiveNote(note)
      setTitle(note.title)
      activeNoteIdRef.current = note.id
      titleRef.current = note.title
      editor?.commands.setContent(readJson(note.contentJson), false)
      focusEditorSoon()
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Could not create note.')
    } finally {
      setIsCreating(false)
    }
  }, [deleteIfEmptyNote, editor, focusEditorSoon])

  const deleteNote = useCallback(async (id: string) => {
    const noteIsActive = id === activeNoteIdRef.current

    await window.coreNote.deleteNote(id)
    const remaining = await window.coreNote.listNotes()
    setNotes(remaining)

    if (!noteIsActive) {
      return
    }

    const nextNote = remaining[0] ? await window.coreNote.getNote(remaining[0].id) : null
    activeNoteRef.current = nextNote
    setActiveNote(nextNote)
    setTitle(nextNote?.title ?? '')
    activeNoteIdRef.current = nextNote?.id ?? null
    titleRef.current = nextNote?.title ?? ''
    editor?.commands.setContent(nextNote ? readJson(nextNote.contentJson) : emptyDoc, false)
    focusEditorSoon()
  }, [editor, focusEditorSoon])

  const scheduleSave = useCallback(
    (nextTitle: string, contentJson?: string, contentText?: string) => {
      const noteId = activeNoteIdRef.current
      const currentEditor = editorRef.current

      if (!noteId || !currentEditor) {
        return
      }

      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
      }

      setSaveState('saving')

      saveTimerRef.current = window.setTimeout(async () => {
        const savedNote = await window.coreNote.updateNote({
          id: noteId,
          title: nextTitle,
          contentJson: contentJson ?? JSON.stringify(currentEditor.getJSON()),
          contentText: contentText ?? currentEditor.getText()
        })

        if (activeNoteIdRef.current === noteId) {
          activeNoteRef.current = savedNote
          setActiveNote(savedNote)
        }

        setNotes(await window.coreNote.listNotes())
        setSaveState('saved')
      }, 450)
    },
    []
  )

  const activePreview = useMemo(() => (activeNote ? formatNoteDate(activeNote.updatedAt) : ''), [activeNote])
  const searchPlaceholder = `Search ${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`
  const formatBadges = useMemo<FormatBadge[]>(() => {
    const badges: FormatBadge[] = []

    if (activeFormats.heading) {
      badges.push({ id: 'heading', label: `H${activeFormats.heading}` })
    }

    if (activeFormats.bold) {
      badges.push({ id: 'bold', label: 'B' })
    }

    if (activeFormats.italic) {
      badges.push({ id: 'italic', label: 'I' })
    }

    if (activeFormats.underline) {
      badges.push({ id: 'underline', label: 'U' })
    }

    if (activeFormats.color) {
      badges.push({
        id: 'color',
        label: activeFormats.color.label,
        color: activeFormats.color.value
      })
    }

    return badges
  }, [activeFormats])

  const removeActiveFormat = useCallback(
    (formatId: FormatBadge['id']) => {
      if (!editor) {
        return
      }

      editor.commands.focus()

      switch (formatId) {
        case 'bold':
          removeEditorMark(editor, 'bold')
          break
        case 'italic':
          removeEditorMark(editor, 'italic')
          break
        case 'underline':
          removeEditorMark(editor, 'underline')
          break
        case 'color':
          removeEditorMark(editor, 'textColor')
          break
        case 'heading':
          editor.chain().focus().setParagraph().run()
          break
      }

      window.dispatchEvent(new CustomEvent('corenote:format-state', {
        detail: {
          bold: formatId === 'bold' ? false : activeFormats.bold,
          italic: formatId === 'italic' ? false : activeFormats.italic,
          underline: formatId === 'underline' ? false : activeFormats.underline,
          heading: formatId === 'heading' ? null : activeFormats.heading,
          color: formatId === 'color' ? null : activeFormats.color
        }
      }))
    },
    [activeFormats, editor]
  )

  useEffect(() => {
    loadNotes()
  }, [loadNotes])

  useEffect(() => {
    window.coreNote.getUpdateStatus().then(setUpdateStatus)

    return window.coreNote.onUpdateStatus(setUpdateStatus)
  }, [])

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  useEffect(() => {
    activeNoteRef.current = activeNote
  }, [activeNote])

  useEffect(() => {
    activeNoteIdRef.current = activeNoteId
  }, [activeNoteId])

  useEffect(() => {
    titleRef.current = title
  }, [title])

  useEffect(() => {
    if (activeNote && editor) {
      editor.commands.setContent(readJson(activeNote.contentJson), false)
    }
  }, [activeNote?.id, editor])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
      }

      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!editorMenu) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeEditorMenu()
      }
    }

    window.addEventListener('click', closeEditorMenu)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', closeEditorMenu)

    return () => {
      window.removeEventListener('click', closeEditorMenu)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', closeEditorMenu)
    }
  }, [closeEditorMenu, editorMenu])

  useEffect(() => {
    const handleSlashQuery = (event: Event): void => {
      const detail = (event as CustomEvent).detail as
        | {
            query: string
            mode: 'root' | 'textStyle' | 'heading' | 'insert' | 'textColor'
            items: {
              id: string
              label: string
              kind: 'command' | 'folder'
              color?: string
            }[]
            selectedIndex: number
            rect: {
              x: number
              y: number
            }
          }
        | null

      if (!detail) {
        setSlashSuggestion(null)
        return
      }

      setSlashSuggestion({
        query: detail.query,
        mode: detail.mode,
        items: detail.items,
        selectedIndex: detail.selectedIndex,
        x: Math.min(detail.rect.x, window.innerWidth - 220),
        y: Math.min(detail.rect.y, window.innerHeight - 70)
      })
    }

    window.addEventListener('corenote:slash-query', handleSlashQuery)

    return () => {
      window.removeEventListener('corenote:slash-query', handleSlashQuery)
    }
  }, [])

  useEffect(() => {
    const handleFormatState = (event: Event): void => {
      setActiveFormats((event as CustomEvent<ActiveFormatState>).detail ?? plainFormatState)
    }

    window.addEventListener('corenote:format-state', handleFormatState)

    return () => {
      window.removeEventListener('corenote:format-state', handleFormatState)
    }
  }, [])

  const UpdateActionIcon = updateAction?.icon

  return (
    <main className="app-shell">
      <div className="titlebar-drag" />
      <div className="window-controls" aria-label="Window controls">
        <button type="button" title="Minimize" onClick={() => window.coreNote.minimizeWindow()}>
          <Minus size={15} />
        </button>
        <button type="button" title="Maximize" onClick={() => window.coreNote.toggleMaximizeWindow()}>
          <Square size={13} />
        </button>
        <button className="close-control" type="button" title="Close" onClick={() => window.coreNote.closeWindow()}>
          <X size={16} />
        </button>
      </div>
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-stack">
            <img className="brand-logo" src={coreNoteLogoUrl} alt="CoreNote" />
          </div>
          <button className="new-note-button" type="button" title="New note" onClick={createNote} disabled={isCreating}>
            <Plus size={18} />
            <span>New Note</span>
          </button>
        </div>

        {appError ? <div className="app-error">{appError}</div> : null}

        <label className="search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label="Search notes"
          />
        </label>

        <nav className="note-list" aria-label="Notes">
          {notes.map((note) => (
            <div className="note-row" key={note.id}>
              <button
                className={note.id === activeNote?.id ? 'note-item active' : 'note-item'}
                type="button"
                onClick={() => openNote(note.id)}
              >
                <FileText size={16} />
                <span>
                  <strong>{note.title}</strong>
                  <small>{note.preview || 'Empty'}</small>
                </span>
              </button>
              <button className="note-delete-button" type="button" title="Delete note" onClick={() => deleteNote(note.id)}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        {activeNote ? (
          <>
            <header className="note-header">
              <div className="title-stack">
                <input
                  className="title-input"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value)
                    titleRef.current = event.target.value
                    scheduleSave(event.target.value)
                  }}
                  aria-label="Note title"
                />
                <span>
                  {saveState === 'saving' ? 'Saving' : saveState === 'saved' ? 'Saved' : activePreview}
                </span>
              </div>
            </header>
            <EditorContent editor={editor} className="editor-frame" onContextMenu={openEditorMenu} />
          </>
        ) : (
          <div className="empty-state">
            <button className="primary-action" type="button" onClick={createNote} disabled={isCreating}>
              <Plus size={18} />
              New Note
            </button>
          </div>
        )}
      </section>

      {editorMenu ? (
        <div
          className="context-menu"
          style={{ left: editorMenu.x, top: editorMenu.y }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="context-menu-folder" role="menuitem" tabIndex={0}>
            <span className="context-menu-folder-label">
              <Bold size={16} />
              <span>Text Style</span>
            </span>
            <ChevronRight size={15} />
            <div className="context-submenu" role="menu">
              <button className="context-menu-item" type="button" role="menuitem" onClick={() => runEditorAction('bold')}>
                <Bold size={16} />
                <span>Bold</span>
              </button>
              <button className="context-menu-item" type="button" role="menuitem" onClick={() => runEditorAction('italic')}>
                <Italic size={16} />
                <span>Italic</span>
              </button>
              <button className="context-menu-item" type="button" role="menuitem" onClick={() => runEditorAction('underline')}>
                <UnderlineIcon size={16} />
                <span>Underline</span>
              </button>
              <button className="context-menu-item" type="button" role="menuitem" onClick={() => runEditorAction('clear')}>
                <Eraser size={16} />
                <span>Clear Formatting</span>
              </button>
            </div>
          </div>
          <div className="context-menu-folder" role="menuitem" tabIndex={0}>
            <span className="context-menu-folder-label">
              <Heading size={16} />
              <span>Heading</span>
            </span>
            <ChevronRight size={15} />
            <div className="context-submenu" role="menu">
              <button className="context-menu-item" type="button" role="menuitem" onClick={() => runEditorAction('heading-1')}>
                <Heading1 size={16} />
                <span>H1</span>
              </button>
              <button className="context-menu-item" type="button" role="menuitem" onClick={() => runEditorAction('heading-2')}>
                <Heading2 size={16} />
                <span>H2</span>
              </button>
            </div>
          </div>
          <div className="context-menu-folder" role="menuitem" tabIndex={0}>
            <span className="context-menu-folder-label">
              <Plus size={16} />
              <span>Insert</span>
            </span>
            <ChevronRight size={15} />
            <div className="context-submenu" role="menu">
              <button className="context-menu-item" type="button" role="menuitem" onClick={() => runEditorAction('checkbox')}>
                <Square size={16} />
                <span>Checkbox</span>
              </button>
              <button className="context-menu-item" type="button" role="menuitem" onClick={() => runEditorAction('divider')}>
                <Minus size={16} />
                <span>Divider</span>
              </button>
            </div>
          </div>
          <div className="context-menu-folder" role="menuitem" tabIndex={0}>
            <span className="context-menu-folder-label">
              <span className="context-menu-palette-icon" />
              <span>Text Color</span>
            </span>
            <ChevronRight size={15} />
            <div className="context-submenu" role="menu">
              {contextTextColors.map((textColor) => (
                <button
                  className="context-menu-item"
                  key={textColor.action}
                  type="button"
                  role="menuitem"
                  onClick={() => runEditorAction(textColor.action)}
                >
                  <span className="context-color-swatch" style={{ backgroundColor: textColor.color }} />
                  <span>{textColor.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="context-menu-separator" />
          {editorMenuItems.map((item) => {
            const Icon = item.icon

            return (
              <button
                className="context-menu-item"
                key={item.action}
                type="button"
                role="menuitem"
                onClick={() => runEditorAction(item.action)}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      {slashSuggestion ? (
        <div className="slash-menu" style={{ left: slashSuggestion.x, top: slashSuggestion.y }}>
          {slashSuggestion.items.map((item, index) => (
            <div className={index === slashSuggestion.selectedIndex ? 'slash-menu-item active' : 'slash-menu-item'} key={item.id}>
              <span className="slash-menu-item-label">
                {item.color ? <span className="slash-color-swatch" style={{ backgroundColor: item.color }} /> : null}
                {item.label}
              </span>
              <span className="slash-menu-item-action">
                {item.kind === 'folder' ? <ChevronRight size={14} /> : null}
                {index === slashSuggestion.selectedIndex ? <kbd>Tab</kbd> : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {activeNote ? (
        <div className="format-status" aria-label="Active formatting">
          {formatBadges.length > 0 ? (
            formatBadges.map((badge) => (
              <button
                className="format-status-badge"
                key={badge.id}
                type="button"
                title={`Remove ${badge.label}`}
                onClick={() => removeActiveFormat(badge.id)}
              >
                {badge.color ? <span className="format-status-swatch" style={{ backgroundColor: badge.color }} /> : null}
                {badge.label}
              </button>
            ))
          ) : (
            <span className="format-status-plain">Plain</span>
          )}
        </div>
      ) : null}

      {activeNote ? (
        <button
          className="update-refresh-button"
          type="button"
          title={updateButtonTitle}
          onClick={checkForUpdates}
          disabled={updateIsBusy}
        >
          <RefreshCw size={16} className={updateIsBusy ? 'spin-icon' : undefined} />
        </button>
      ) : null}

      {updatePanelIsVisible ? (
        <div className="update-panel" role="status">
          <span>{updateStatus.message ?? 'Update status unavailable.'}</span>
          {updateStatus.state === 'downloading' && typeof updateStatus.percent === 'number' ? (
            <div className="update-progress" aria-label="Update download progress">
              <span style={{ width: `${Math.max(0, Math.min(100, updateStatus.percent))}%` }} />
            </div>
          ) : null}
          {updateAction ? (
            <button type="button" onClick={updateAction.run} disabled={updateIsBusy}>
              {UpdateActionIcon ? <UpdateActionIcon size={15} /> : null}
              <span>{updateAction.label}</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {toast ? <div className="toast-message">{toast}</div> : null}
    </main>
  )
}
