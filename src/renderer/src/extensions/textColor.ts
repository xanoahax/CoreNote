import { Mark, mergeAttributes } from '@tiptap/core'

export const TextColor = Mark.create({
  name: 'textColor',

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => element.style.color || null,
        renderHTML: (attributes) => {
          if (!attributes.color) {
            return {}
          }

          return {
            style: `color: ${attributes.color}`
          }
        }
      }
    }
  },

  parseHTML() {
    return [
      {
        style: 'color'
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  }
})
