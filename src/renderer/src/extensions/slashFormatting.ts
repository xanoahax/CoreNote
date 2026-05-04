import { Extension } from '@tiptap/core'
import { Fragment } from '@tiptap/pm/model'
import { Plugin, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import {
  dateFormats,
  formatCurrentDate,
  formatCurrentTime,
  timeFormats,
  type DateFormatId,
  type TimeFormatId
} from '../dateTimeFormats'

type SlashCommand = (view: EditorView) => boolean
type SlashMenuMode = 'root' | 'textStyle' | 'heading' | 'insert' | 'date' | 'time' | 'timer' | 'textColor'
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
type SmartCommandMatch = {
  commandName: '/timer-duration' | '/timer-start' | '/timer-pause' | '/timer-stop'
  argument?: string
  from: number
  to: number
}
type SmartCommandDraftMatch = {
  from: number
  to: number
}

const slashCommands = new Map<string, SlashCommand>()
const checkboxCommandAliases = ['/check', '/checklist', '/todo', '/task']
const collapsibleSectionCommandAliases = ['/collapsible-section', '/collapsible', '/section', '/toggle-section']
const imageCommandAliases = ['/img', '/picture', '/photo']
const timerCommandAliases = ['/timer-duration', '/timer-start', '/timer-pause', '/timer-stop']
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
  { id: 'date', label: 'Date', kind: 'folder', folder: 'date', aliases: ['/date', '/today'] },
  { id: 'time', label: 'Time', kind: 'folder', folder: 'time', aliases: ['/time', '/now'] },
  { id: 'timer', label: 'Timer', kind: 'folder', folder: 'timer', aliases: ['/timer', ...timerCommandAliases] },
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
    {
      id: 'collapsible-section',
      label: 'Collapsible Section',
      kind: 'command',
      commandName: '/collapsible-section',
      aliases: collapsibleSectionCommandAliases
    },
    { id: 'image', label: 'Image', kind: 'command', commandName: '/image', aliases: imageCommandAliases },
    { id: 'divider', label: 'Divider', kind: 'command', commandName: '/divider', aliases: ['/hr', '/line'] }
  ],
  date: dateFormats.map((dateFormat) => ({
    id: `date-${dateFormat.id}`,
    label: dateFormat.label,
    kind: 'command',
    commandName: dateFormat.commandName
  })),
  time: timeFormats.map((timeFormat) => ({
    id: `time-${timeFormat.id}`,
    label: timeFormat.label,
    kind: 'command',
    commandName: timeFormat.commandName
  })),
  timer: [
    {
      id: 'timer-duration',
      label: 'Timer Duration',
      kind: 'command',
      commandName: '/timer-duration',
      aliases: ['/timer-duration 25']
    },
    { id: 'timer-start', label: 'Timer Start', kind: 'command', commandName: '/timer-start' },
    { id: 'timer-pause', label: 'Timer Pause', kind: 'command', commandName: '/timer-pause' },
    { id: 'timer-stop', label: 'Timer Stop', kind: 'command', commandName: '/timer-stop' }
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
    const directCommandItems = Object.values(folderItems).flat()
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

const getSmartCommandMatch = (state: EditorView['state']): SmartCommandMatch | null => {
  if (!state.selection.empty) {
    return null
  }

  const { $from } = state.selection
  const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  const match = textBeforeCursor.match(
    /(?:^|\s)(\/timer-duration\s+([0-9]{1,4})|\/timer-start|\/timer-pause|\/timer-stop)$/i
  )

  if (!match) {
    return null
  }

  const commandText = match[1]
  const commandName = commandText.toLowerCase().split(/\s+/)[0] as SmartCommandMatch['commandName']

  return {
    commandName,
    argument: match[2],
    from: $from.pos - commandText.length,
    to: $from.pos
  }
}

const getSmartCommandDraftMatch = (state: EditorView['state']): SmartCommandDraftMatch | null => {
  if (!state.selection.empty) {
    return null
  }

  const { $from } = state.selection
  const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  const match = textBeforeCursor.match(/(?:^|\s)(\/timer-duration(?:\s+[0-9]{0,4})?)$/i)

  if (!match) {
    return null
  }

  return {
    from: $from.pos - match[1].length,
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

const runSmartCommand = (view: EditorView): boolean => {
  const smartCommand = getSmartCommandMatch(view.state)

  if (!smartCommand) {
    return false
  }

  const minutes = smartCommand.argument ? Number.parseInt(smartCommand.argument, 10) : undefined

  if (smartCommand.commandName === '/timer-duration' && (!minutes || minutes < 1 || minutes > 1440)) {
    return false
  }

  const activeMarks = view.state.storedMarks ?? view.state.selection.$from.marks()

  view.dispatch(view.state.tr.delete(smartCommand.from, smartCommand.to).setStoredMarks(activeMarks))
  window.dispatchEvent(
    new CustomEvent('corenote:timer-command', {
      detail: {
        commandName: smartCommand.commandName,
        minutes
      }
    })
  )
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

const createCollapsibleSection = (view: EditorView): boolean => {
  const { state } = view
  const collapsibleSectionNode = state.schema.nodes.collapsibleSection
  const collapsibleSectionTitleNode = state.schema.nodes.collapsibleSectionTitle
  const collapsibleSectionContentNode = state.schema.nodes.collapsibleSectionContent
  const paragraphNode = state.schema.nodes.paragraph

  if (
    !collapsibleSectionNode ||
    !collapsibleSectionTitleNode ||
    !collapsibleSectionContentNode ||
    !paragraphNode ||
    !state.selection.empty
  ) {
    return false
  }

  const { $from } = state.selection
  const blockFrom = $from.before($from.depth)
  const blockTo = $from.after($from.depth)
  const title = collapsibleSectionTitleNode.create(null, state.schema.text('Section title'))
  const bodyParagraph = paragraphNode.create()
  const sectionContent = collapsibleSectionContentNode.create(null, bodyParagraph)
  const section = collapsibleSectionNode.create({ open: true }, [title, sectionContent])
  const trailingParagraph = paragraphNode.create()
  const bodyCursorPosition = blockFrom + 1 + title.nodeSize + 2
  const tr = state.tr.replaceWith(blockFrom, blockTo, Fragment.fromArray([section, trailingParagraph]))

  tr.setSelection(TextSelection.near(tr.doc.resolve(bodyCursorPosition)))

  view.dispatch(tr.scrollIntoView())

  return true
}

const requestImageInsert = (): boolean => {
  window.dispatchEvent(new CustomEvent('corenote:insert-image'))
  return true
}

const insertCurrentDate = (view: EditorView, formatId: DateFormatId): boolean => {
  const { state } = view
  const activeMarks = state.storedMarks ?? state.selection.$from.marks()
  const dateText = state.schema.text(formatCurrentDate(formatId), activeMarks)
  const tr = state.tr.replaceSelectionWith(dateText, false)

  tr.setStoredMarks(activeMarks)
  view.dispatch(tr.scrollIntoView())

  return true
}

const insertCurrentTime = (view: EditorView, formatId: TimeFormatId): boolean => {
  const { state } = view
  const activeMarks = state.storedMarks ?? state.selection.$from.marks()
  const timeText = state.schema.text(formatCurrentTime(formatId), activeMarks)
  const tr = state.tr.replaceSelectionWith(timeText, false)

  tr.setStoredMarks(activeMarks)
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
    slashCommands.set('/collapsible-section', createCollapsibleSection)
    slashCommands.set('/image', requestImageInsert)
    slashCommands.set('/divider', createDivider)
    slashCommands.set('/hr', createDivider)
    slashCommands.set('/line', createDivider)
    slashCommands.set('/h1', (view) => toggleHeading(view, 1))
    slashCommands.set('/h2', (view) => toggleHeading(view, 2))
    slashCommands.set('/checkbox', createCheckbox)
    slashCommands.set('/timer-duration', (view) => {
      const { state } = view
      const activeMarks = state.storedMarks ?? state.selection.$from.marks()
      const text = state.schema.text('/timer-duration ', activeMarks)
      const tr = state.tr.replaceSelectionWith(text, false).setStoredMarks(activeMarks)

      view.dispatch(tr.scrollIntoView())
      return true
    })
    slashCommands.set('/timer-start', () => {
      window.dispatchEvent(new CustomEvent('corenote:timer-command', { detail: { commandName: '/timer-start' } }))
      return true
    })
    slashCommands.set('/timer-pause', () => {
      window.dispatchEvent(new CustomEvent('corenote:timer-command', { detail: { commandName: '/timer-pause' } }))
      return true
    })
    slashCommands.set('/timer-stop', () => {
      window.dispatchEvent(new CustomEvent('corenote:timer-command', { detail: { commandName: '/timer-stop' } }))
      return true
    })
    checkboxCommandAliases.forEach((alias) => {
      slashCommands.set(alias, createCheckbox)
    })
    collapsibleSectionCommandAliases.forEach((alias) => {
      slashCommands.set(alias, createCollapsibleSection)
    })
    imageCommandAliases.forEach((alias) => {
      slashCommands.set(alias, requestImageInsert)
    })
    dateFormats.forEach((dateFormat) => {
      slashCommands.set(dateFormat.commandName, (view) => insertCurrentDate(view, dateFormat.id))
    })
    timeFormats.forEach((timeFormat) => {
      slashCommands.set(timeFormat.commandName, (view) => insertCurrentTime(view, timeFormat.id))
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
            const smartCommandDraftMatch = getSmartCommandDraftMatch(state)

            if (smartCommandDraftMatch) {
              return DecorationSet.create(state.doc, [
                Decoration.inline(smartCommandDraftMatch.from, smartCommandDraftMatch.to, {
                  class: 'slash-command-highlight'
                })
              ])
            }

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

            if ((event.key === 'Tab' || event.key === 'Enter') && runSmartCommand(view)) {
              event.preventDefault()
              return true
            }

            if (event.key === 'Tab' && getSmartCommandDraftMatch(view.state)) {
              event.preventDefault()
              return true
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
