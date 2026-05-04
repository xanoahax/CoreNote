import { Node, mergeAttributes } from '@tiptap/core'

export const createShortLinkLabel = (href: string): string => {
  try {
    const url = new URL(href)
    const host = url.hostname.replace(/^www\./, '')
    const path = url.pathname.replace(/\/$/, '')

    if (!path || path === '/') {
      return host
    }

    const pathParts = path
      .split('/')
      .filter(Boolean)
      .slice(0, 2)
      .join('/')

    return `${host}/${pathParts}${path.split('/').filter(Boolean).length > 2 ? '/...' : ''}`
  } catch {
    return href
  }
}

export const createFaviconUrl = (href: string): string => {
  try {
    const url = new URL(href)
    return `https://icons.duckduckgo.com/ip3/${url.hostname}.ico`
  } catch {
    return ''
  }
}

export const normalizeLinkUrl = (value: string): string | null => {
  const trimmed = value.trim()

  if (!trimmed || /\s/.test(trimmed)) {
    return null
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const url = new URL(withProtocol)

    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) {
      return null
    }

    return url.href
  } catch {
    return null
  }
}

export const LinkChip = Node.create({
  name: 'linkChip',

  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      href: {
        default: ''
      },
      label: {
        default: ''
      },
      faviconUrl: {
        default: ''
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-type="link-chip"]'
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const { href, label, faviconUrl, ...attributes } = HTMLAttributes

    return [
      'a',
      mergeAttributes(attributes, {
        'data-type': 'link-chip',
        href,
        title: href,
        target: '_blank',
        rel: 'noreferrer'
      }),
      ['img', { src: faviconUrl, alt: '', draggable: 'false' }],
      ['span', {}, label || href]
    ]
  }
})
