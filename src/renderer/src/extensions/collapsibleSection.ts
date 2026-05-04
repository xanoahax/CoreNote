import { Node, mergeAttributes } from '@tiptap/core'
import { NodeSelection, Plugin } from '@tiptap/pm/state'

export const CollapsibleSection = Node.create({
  name: 'collapsibleSection',

  group: 'block',
  content: 'collapsibleSectionTitle collapsibleSectionContent',
  defining: true,
  isolating: true,
  selectable: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (element) => element.hasAttribute('open'),
        renderHTML: (attributes) => (attributes.open ? { open: '' } : {})
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'details[data-type="collapsible-section"]'
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['details', mergeAttributes(HTMLAttributes, { 'data-type': 'collapsible-section' }), 0]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        view(view) {
          const findSectionPosition = (details: HTMLDetailsElement): number | null => {
            let sectionPosition: number | null = null

            view.state.doc.descendants((node, position) => {
              if (node.type.name !== 'collapsibleSection') {
                return true
              }

              if (view.nodeDOM(position) === details) {
                sectionPosition = position
                return false
              }

              return true
            })

            return sectionPosition
          }

          const setSectionOpenState = (details: HTMLDetailsElement, open: boolean): boolean => {
            const position = findSectionPosition(details)

            if (position === null) {
              return false
            }

            const node = view.state.doc.nodeAt(position)

            if (!node || node.type.name !== 'collapsibleSection' || node.attrs.open === open) {
              return false
            }

            view.dispatch(view.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, open }))
            return true
          }

          const selectSection = (details: HTMLDetailsElement): boolean => {
            const position = findSectionPosition(details)

            if (position === null) {
              return false
            }

            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)))
            view.focus()
            return true
          }

          const handlePointerDown = (event: PointerEvent): void => {
            if (event.button !== 0) {
              return
            }

            const target = event.target

            if (!(target instanceof Element)) {
              return
            }

            if (target instanceof HTMLDetailsElement && target.dataset.type === 'collapsible-section') {
              event.preventDefault()
              event.stopPropagation()
              selectSection(target)
              return
            }

            const title = target.closest('summary[data-type="collapsible-section-title"]')

            if (!(title instanceof HTMLElement)) {
              return
            }

            const details = title.closest('details[data-type="collapsible-section"]')

            if (!(details instanceof HTMLDetailsElement)) {
              return
            }

            const titleRect = title.getBoundingClientRect()
            const clickedToggleArea = event.clientX <= titleRect.left + 34

            if (!clickedToggleArea) {
              return
            }

            event.preventDefault()
            event.stopPropagation()
            view.focus()
            setSectionOpenState(details, !details.open)
          }

          const handleToggle = (event: Event): void => {
            if (!(event.target instanceof HTMLDetailsElement)) {
              return
            }

            const details = event.target

            if (details.dataset.type !== 'collapsible-section') {
              return
            }

            setSectionOpenState(details, details.open)
          }

          view.dom.addEventListener('pointerdown', handlePointerDown, true)
          view.dom.addEventListener('toggle', handleToggle, true)

          return {
            destroy() {
              view.dom.removeEventListener('pointerdown', handlePointerDown, true)
              view.dom.removeEventListener('toggle', handleToggle, true)
            }
          }
        }
      })
    ]
  }
})

export const CollapsibleSectionTitle = Node.create({
  name: 'collapsibleSectionTitle',

  content: 'inline*',
  defining: true,

  parseHTML() {
    return [
      {
        tag: 'summary[data-type="collapsible-section-title"]'
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['summary', mergeAttributes(HTMLAttributes, { 'data-type': 'collapsible-section-title' }), 0]
  }
})

export const CollapsibleSectionContent = Node.create({
  name: 'collapsibleSectionContent',

  content: 'block+',
  defining: true,

  parseHTML() {
    return [
      {
        tag: 'div[data-type="collapsible-section-content"]'
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'collapsible-section-content' }), 0]
  }
})
