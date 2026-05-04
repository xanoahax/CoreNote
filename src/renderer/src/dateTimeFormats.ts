export const dateFormatIds = ['minimal', 'short', 'medium', 'long', 'detailed'] as const
export type DateFormatId = (typeof dateFormatIds)[number]

export const dateFormats: Array<{ id: DateFormatId; label: string; commandName: string }> = [
  { id: 'minimal', label: 'Minimal Date', commandName: '/date-minimal' },
  { id: 'short', label: 'Short Date', commandName: '/date-short' },
  { id: 'medium', label: 'Medium Date', commandName: '/date-medium' },
  { id: 'long', label: 'Long Date', commandName: '/date-long' },
  { id: 'detailed', label: 'Detailed Date', commandName: '/date-detailed' }
]

export const timeFormatIds = ['minimal', 'short', 'medium', 'long', 'detailed'] as const
export type TimeFormatId = (typeof timeFormatIds)[number]

export const timeFormats: Array<{ id: TimeFormatId; label: string; commandName: string }> = [
  { id: 'minimal', label: 'Minimal Time', commandName: '/time-minimal' },
  { id: 'short', label: 'Short Time', commandName: '/time-short' },
  { id: 'medium', label: 'Medium Time', commandName: '/time-medium' },
  { id: 'long', label: 'Long Time', commandName: '/time-long' },
  { id: 'detailed', label: 'Detailed Time', commandName: '/time-detailed' }
]

const getIsoWeek = (date: Date): number => {
  const weekDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = weekDate.getUTCDay() || 7

  weekDate.setUTCDate(weekDate.getUTCDate() + 4 - day)

  const yearStart = new Date(Date.UTC(weekDate.getUTCFullYear(), 0, 1))

  return Math.ceil(((weekDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

export const formatCurrentDate = (formatId: DateFormatId): string => {
  const date = new Date()

  if (formatId === 'minimal') {
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    }).format(date)
  }

  if (formatId === 'short') {
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date)
  }

  if (formatId === 'medium') {
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date)
  }

  if (formatId === 'long') {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date)
  }

  const detailedDate = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date)

  return `${detailedDate}, KW ${getIsoWeek(date)}`
}

export const formatCurrentTime = (formatId: TimeFormatId): string => {
  const date = new Date()

  if (formatId === 'minimal') {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    }).format(date)
  }

  if (formatId === 'short') {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date)
  }

  if (formatId === 'medium') {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    }).format(date)
  }

  if (formatId === 'long') {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    }).format(date)
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    timeZoneName: 'long'
  }).format(date)
}
