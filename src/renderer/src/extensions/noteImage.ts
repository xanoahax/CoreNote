import { Node, mergeAttributes } from '@tiptap/core'
import type { NoteImageAlign, NoteImageSize } from '../../../shared/images'

export const NoteImage = Node.create({
  name: 'noteImage',

  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null
      },
      alt: {
        default: ''
      },
      align: {
        default: 'center',
        parseHTML: (element): NoteImageAlign => {
          const align = element.getAttribute('data-align')
          return align === 'left' || align === 'right' ? align : 'center'
        }
      },
      size: {
        default: 'medium',
        parseHTML: (element): NoteImageSize => {
          const size = element.getAttribute('data-size')
          return size === 'small' || size === 'large' ? size : 'medium'
        }
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-type="note-image"]'
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const { src, alt, align, size, ...figureAttributes } = HTMLAttributes

    return [
      'figure',
      mergeAttributes(figureAttributes, {
        'data-type': 'note-image',
        'data-align': align,
        'data-size': size
      }),
      ['img', { src, alt, draggable: 'false' }]
    ]
  }
})
