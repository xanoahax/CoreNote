import { Extension } from '@tiptap/core'
import { Fragment } from '@tiptap/pm/model'
import { Plugin, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

type SlashCommand = (view: EditorView) => boolean
type SlashMenuMode = 'root' | 'textStyle' | 'heading' | 'insert' | 'textColor'
type SlashMenuItem = {
  id: string
  label: string
  kind: 'command' | 'folder'
  commandName?: string
  folder?: Exclude<SlashMenuMode, 'root'>
  color?: string
  aliases?: string[]
}
type SlashQuery = {
  query: string
  mode: SlashMenuMode
  items: SlashMenuItem[]
  selectedIndex: number
  from: number
  to: number
  rect: {
    x: number
    y: number
  }
}
type FormatState = {
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

const slashCommands = new Map<string, SlashCommand>()
const checkboxCommandAliases = ['/check', '/checklist', '/todo', '/task']
const textColors = [
  { id: 'white', label: 'White', color: '#ffffff' },
  { id: 'accent', label: 'Accent', color: '#b7741d' },
  { id: 'red', label: 'Red', color: '#ff6b6b' },
  { id: 'blue', label: 'Blue', color: '#6ea8ff' },
  { id: 'green', label: 'Green', color: '#7bd88f' }
]
const rootItems: SlashMenuItem[] = [
  { id: 'text-style', label: 'Text Style', kind: 'folder', folder: 'textStyle', aliases: ['/text', '/style', '/format'] },
  { id: 'heading', label: 'Heading', kind: 'folder', folder: 'heading', aliases: ['/heading', '/h'] },
  { id: 'insert', label: 'Insert', kind: 'folder', folder: 'insert', aliases: ['/insert', '/add'] },
  { id: 'text-color', label: 'Text Color', kind: 'folder', folder: 'textColor', aliases: ['/color', '/textcolor', '/text-color'] }
]
const folderItems: Record<Exclude<SlashMenuMode, 'root'>, SlashMenuItem[]> = {
  textStyle: [
    { id: 'bold', label: 'Bold', kind: 'command', commandName: '/bold' },
    { id: 'italic', label: 'Italic', kind: 'command', commandName: '/italic' },
    { id: 'underline', label: 'Underline', kind: 'command', commandName: '/underline' },
    { id: 'clear', label: 'Clear Formatting', kind: 'command', commandName: '/clear' }
  ],
  heading: [
    { id: 'h1', label: 'H1', kind: 'command', commandName: '/h1' },
    { id: 'h2', label: 'H2', kind: 'command', commandName: '/h2' }
  ],
  insert: [
    { id: 'checkbox', label: 'Checkbox', kind: 'command', commandName: '/checkbox', aliases: checkboxCommandAliases },
    { id: 'divider', label: 'Divider', kind: 'command', commandName: '/divider', aliases: ['/hr', '/line'] }
  ],
  textColor: textColors.map((textColor) => ({
    id: `color-${textColor.id}`,
    label: textColor.label,
    kind: 'command',
    commandName: `/${textColor.id}`,
    color: textColor.color
  }))
}
let selectedIndex = 0
let activeMode: SlashMenuMode = 'root'

const slashItemCommandMatches = (item: SlashMenuItem, query: string): boolean => {
  const tokens = [item.commandName, ...(item.aliases ?? [])]
    .filter(Boolean)
    .map((token) => token!.toLowerCase())

  return tokens.some((token) => token.startsWith(query))
}

const slashItemMatches = (item: SlashMenuItem, query: string): boolean => {
  if (activeMode !== 'root') {
    return true
  }

  const tokens = [item.commandName, ...item.label.toLowerCase().split(/\s+/).map((token) => `/${token}`), ...(item.aliases ?? [])]
    .filter(Boolean)
    .map((token) => token!.toLowerCase())

  return tokens.some((token) => token.startsWith(query))
}

const getVisibleItems = (query: string): SlashMenuItem[] => {
  if (activeMode === 'root') {
    const matchingRootItems = rootItems.filter((item) => slashItemMatches(item, query))
    const directCommandItems = [
      ...folderItems.textStyle,
      ...folderItems.heading,
      ...folderItems.insert,
      ...folderItems.textColor
    ]
    const matchingDirectCommandItems =
      query.length > 1
        ? directCommandItems.filter((item) => slashItemCommandMatches(item, query))
        : []

    return matchingRootItems.length > 0 ? matchingRootItems : matchingDirectCommandItems
  }

  return folderItems[activeMode]
}

const getSlashMatch = (
  state: EditorView['state']
): { query: string; items: SlashMenuItem[]; from: number; to: number } | null => {
  if (!state.selection.empty) {
    return null
  }

  const { $from } = state.selection
  const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  const match = textBeforeCursor.match(/(?:^|\s)(\/[a-z0-9-]*)$/i)

  if (!match) {
    return null
  }

  const query = match[1].toLowerCase()
  const items = getVisibleItems(query)

  if (items.length === 0) {
    return null
  }

  return {
    query,
    items,
    from: $from.pos - query.length,
    to: $from.pos
  }
}

const hideSlashMenu = (): void => {
  selectedIndex = 0
  activeMode = 'root'
  window.dispatchEvent(new CustomEvent('corenote:slash-query', { detail: null }))
}

const getSlashQuery = (view: EditorView): SlashQuery | null => {
  const { state } = view
  const { $from } = state.selection
  const slashMatch = getSlashMatch(state)

  if (!slashMatch) {
    activeMode = 'root'
    selectedIndex = 0
    return null
  }

  if (selectedIndex > slashMatch.items.length - 1) {
    selectedIndex = 0
  }

  const cursor = view.coordsAtPos($from.pos)

  return {
    query: slashMatch.query,
    mode: activeMode,
    items: slashMatch.items,
    selectedIndex,
    from: slashMatch.from,
    to: slashMatch.to,
    rect: {
      x: cursor.left,
      y: cursor.bottom + 8
    }
  }
}

const emitSlashQuery = (view: EditorView): void => {
  const detail = getSlashQuery(view)
  window.dispatchEvent(new CustomEvent('corenote:slash-query', { detail }))
}

const normalizeColor = (color: string): string => color.trim().toLowerCase()

const getFormatState = (view: EditorView): FormatState => {
  const { state } = view
  const activeMarks = state.storedMarks ?? state.selection.$from.marks()
  const textColorMark = state.schema.marks.textColor
  const activeTextColor = textColorMark?.isInSet(activeMarks)
  const activeColor = activeTextColor?.attrs.color
  const textColor = typeof activeColor === 'string'
    ? textColors.find((color) => normalizeColor(color.color) === normalizeColor(activeColor))
    : null
  const headingNode = state.schema.nodes.heading
  const parent = state.selection.$from.parent
  const heading = headingNode && parent.type === headingNode && (parent.attrs.level === 1 || parent.attrs.level === 2)
    ? parent.attrs.level
    : null

  return {
    bold: Boolean(state.schema.marks.bold?.isInSet(activeMarks)),
    italic: Boolean(state.schema.marks.italic?.isInSet(activeMarks)),
    underline: Boolean(state.schema.marks.underline?.isInSet(activeMarks)),
    heading,
    color: textColor ? { id: textColor.id, label: textColor.label, value: textColor.color } : null
  }
}

const emitFormatState = (view: EditorView): void => {
  window.dispatchEvent(new CustomEvent('corenote:format-state', { detail: getFormatState(view) }))
}

const selectSlashItem = (view: EditorView): boolean => {
  const slashQuery = getSlashQuery(view)

  if (!slashQuery) {
    return false
  }

  const item = slashQuery.items[slashQuery.selectedIndex] ?? slashQuery.items[0]

  if (!item) {
    return false
  }

  if (item.kind === 'folder' && item.folder) {
    activeMode = item.folder
    selectedIndex = 0
    emitSlashQuery(view)
    return true
  }

  if (!item.commandName) {
    return false
  }

  const runCommand = slashCommands.get(item.commandName)

  if (!runCommand) {
    return false
  }

  const activeMarks = view.state.storedMarks ?? view.state.selection.$from.marks()
  view.dispatch(view.state.tr.delete(slashQuery.from, slashQuery.to).setStoredMarks(activeMarks))
  runCommand(view)
  emitFormatState(view)
  hideSlashMenu()

  return true
}

const moveSlashSelection = (view: EditorView, direction: 1 | -1): boolean => {
  const slashQuery = getSlashQuery(view)

  if (!slashQuery || slashQuery.items.length < 2) {
    return false
  }

  selectedIndex = (slashQuery.selectedIndex + direction + slashQuery.items.length) % slashQuery.items.length
  emitSlashQuery(view)

  return true
}

const returnToRootMenu = (view: EditorView): boolean => {
  if (activeMode === 'root' || !getSlashQuery(view)) {
    return false
  }

  activeMode = 'root'
  selectedIndex = 0
  emitSlashQuery(view)

  return true
}

const toggleStoredMark = (view: EditorView, markName: string): boolean => {
  const { state } = view
  const markType = state.schema.marks[markName]

  if (!markType) {
    return false
  }

  const { $from } = state.selection
  const activeMarks = state.storedMarks ?? $from.marks()
  const isActive = Boolean(markType.isInSet(activeMarks))
  const tr = state.tr

  if (isActive) {
    tr.removeStoredMark(markType)
  } else {
    tr.addStoredMark(markType.create())
  }

  view.dispatch(tr)

  return true
}

const setStoredTextColor = (view: EditorView, color: string): boolean => {
  const { state } = view
  const textColorMark = state.schema.marks.textColor

  if (!textColorMark) {
    return false
  }

  const activeMarks = state.storedMarks ?? state.selection.$from.marks()
  const tr = state.tr.setStoredMarks([
    ...activeMarks.filter((mark) => mark.type !== textColorMark),
    textColorMark.create({ color })
  ])
  view.dispatch(tr)

  return true
}

const clearStoredFormatting = (view: EditorView): boolean => {
  const { state } = view
  const paragraphNode = state.schema.nodes.paragraph
  let tr = state.tr.setStoredMarks([])

  if (paragraphNode && state.selection.$from.parent.type !== paragraphNode) {
    tr = tr.setBlockType(state.selection.from, state.selection.to, paragraphNode)
  }

  view.dispatch(tr)

  return true
}

const createDivider = (view: EditorView): boolean => {
  const { state } = view
  const horizontalRuleNode = state.schema.nodes.horizontalRule
  const paragraphNode = state.schema.nodes.paragraph

  if (!horizontalRuleNode || !paragraphNode || !state.selection.empty) {
    return false
  }

  const { $from } = state.selection
  const blockFrom = $from.before($from.depth)
  const blockTo = $from.after($from.depth)
  const horizontalRule = horizontalRuleNode.create()
  const paragraph = paragraphNode.create()
  const nextCursorPosition = blockFrom + horizontalRule.nodeSize + 1
  const tr = state.tr.replaceWith(blockFrom, blockTo, Fragment.fromArray([horizontalRule, paragraph]))

  tr.setSelection(TextSelection.create(tr.doc, nextCursorPosition))

  view.dispatch(tr.scrollIntoView())

  return true
}

const toggleHeading = (view: EditorView, level: 1 | 2): boolean => {
  const { state } = view
  const headingNode = state.schema.nodes.heading
  const paragraphNode = state.schema.nodes.paragraph

  if (!headingNode || !paragraphNode) {
    return false
  }

  const isActiveHeading =
    state.selection.$from.parent.type === headingNode && state.selection.$from.parent.attrs.level === level
  const targetNode = isActiveHeading ? paragraphNode : headingNode
  const targetAttrs = isActiveHeading ? null : { level }
  const tr = state.tr.setBlockType(state.selection.from, state.selection.to, targetNode, targetAttrs)

  view.dispatch(tr)

  return true
}

export const SlashFormatting = Extension.create({
  name: 'slashFormatting',

  addProseMirrorPlugins() {
    const createCheckbox = (): boolean => this.editor.chain().focus().toggleTaskList().run()

    slashCommands.set('/bold', (view) => toggleStoredMark(view, 'bold'))
    slashCommands.set('/italic', (view) => toggleStoredMark(view, 'italic'))
    slashCommands.set('/underline', (view) => toggleStoredMark(view, 'underline'))
    slashCommands.set('/clear', clearStoredFormatting)
    slashCommands.set('/divider', createDivider)
    slashCommands.set('/hr', createDivider)
    slashCommands.set('/line', createDivider)
    slashCommands.set('/h1', (view) => toggleHeading(view, 1))
    slashCommands.set('/h2', (view) => toggleHeading(view, 2))
    slashCommands.set('/checkbox', createCheckbox)
    checkboxCommandAliases.forEach((alias) => {
      slashCommands.set(alias, createCheckbox)
    })
    textColors.forEach((textColor) => {
      slashCommands.set(`/${textColor.id}`, (view) => setStoredTextColor(view, textColor.color))
    })

    return [
      new Plugin({
        view(view) {
          emitFormatState(view)

          return {
            update(nextView) {
              emitFormatState(nextView)
            }
          }
        },
        props: {
          decorations(state) {
            const slashMatch = getSlashMatch(state)

            if (!slashMatch) {
              return DecorationSet.empty
            }

            return DecorationSet.create(state.doc, [
              Decoration.inline(slashMatch.from, slashMatch.to, {
                class: 'slash-command-highlight'
              })
            ])
          },
          handleKeyDown(view, event) {
            if (!['ArrowDown', 'ArrowUp', 'Backspace', 'Tab'].includes(event.key)) {
              selectedIndex = 0
              activeMode = 'root'
            }

            if (event.key === 'ArrowDown' && moveSlashSelection(view, 1)) {
              event.preventDefault()
              return true
            }

            if (event.key === 'ArrowUp' && moveSlashSelection(view, -1)) {
              event.preventDefault()
              return true
            }

            if (event.key === 'Backspace' && returnToRootMenu(view)) {
              event.preventDefault()
              return true
            }

            if (event.key === 'Tab' && selectSlashItem(view)) {
              event.preventDefault()
              return true
            }

            return false
          },
          handleDOMEvents: {
            keyup(view) {
              emitSlashQuery(view)
              emitFormatState(view)
              return false
            },
            click(view) {
              emitSlashQuery(view)
              emitFormatState(view)
              return false
            },
            blur() {
              hideSlashMenu()
              return false
            }
          }
        }
      })
    ]
  }
})
