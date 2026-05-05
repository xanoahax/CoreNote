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
        default: '',
        parseHTML: (element) => element.getAttribute('href') ?? element.getAttribute('data-href') ?? ''
      },
      label: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-label') ?? element.textContent ?? ''
      },
      faviconUrl: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-favicon-url') ?? ''
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-type="link-chip"]'
      },
      {
        tag: 'span[data-type="link-chip"]'
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const { href, label, faviconUrl, ...attributes } = HTMLAttributes

    return [
      'span',
      mergeAttributes(attributes, {
        'data-type': 'link-chip',
        'data-href': href,
        'data-label': label,
        'data-favicon-url': faviconUrl,
        title: href,
        role: 'link'
      }),
      ['img', { src: faviconUrl, alt: '', draggable: 'false' }],
      ['span', {}, label || href]
    ]
  }
})
