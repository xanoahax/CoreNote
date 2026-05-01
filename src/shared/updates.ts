export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'disabled'

export type UpdateStatus = {
  state: UpdateState
  currentVersion: string
  isPackaged: boolean
  version?: string
  percent?: number
  message?: string
}
