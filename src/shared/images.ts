export type NoteImageAlign = 'left' | 'center' | 'right'
export type NoteImageSize = 'small' | 'medium' | 'large'

export type NoteImage = {
  src: string
  alt: string
}

export type SaveImageInput = {
  dataUrl: string
  fileName?: string
}
