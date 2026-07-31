export type NoticeTone = 'info' | 'success' | 'warn' | 'danger'

export type NoticeAction = {label: string; run: () => void}

export type NoticeOptions = {key?: string; tone?: NoticeTone; action?: NoticeAction}

export type Notice = {
  id: number
  key: string | null
  message: string
  tone: NoticeTone
  action: NoticeAction | null
  sticky: boolean
}

export type Notify = (message: string, options?: NoticeOptions) => void

export type NoticeQueue = {visible: Notice[]; waiting: Notice[]}

export const NO_NOTICES: NoticeQueue = {visible: [], waiting: []}

const VISIBLE_LIMIT = 2

export const FUSE_MS = 6_000

export function makeNotice(id: number, message: string, options: NoticeOptions = {}): Notice {
  return {
    id,
    key: options.key ?? null,
    message,
    tone: options.tone ?? 'info',
    action: options.action ?? null,
    sticky: options.action !== undefined,
  }
}

function withoutKey(notices: Notice[], key: string | null): Notice[] {
  if (key === null) return notices
  return notices.filter((notice) => notice.key !== key)
}

function promote(queue: NoticeQueue): NoticeQueue {
  const room = VISIBLE_LIMIT - queue.visible.length
  if (room <= 0 || queue.waiting.length === 0) return queue
  const moving = queue.waiting.slice(0, room)
  return {visible: [...moving.toReversed(), ...queue.visible], waiting: queue.waiting.slice(room)}
}

export function pushNotice(queue: NoticeQueue, notice: Notice): NoticeQueue {
  const visible = withoutKey(queue.visible, notice.key)
  const waiting = withoutKey(queue.waiting, notice.key)
  if (visible.length < VISIBLE_LIMIT) return {visible: [notice, ...visible], waiting}
  const expiring = visible.findLastIndex((current) => !current.sticky)
  if (expiring < 0) return {visible, waiting: [...waiting, notice]}
  return {visible: [notice, ...visible.toSpliced(expiring, 1)], waiting}
}

export function dismissNotice(queue: NoticeQueue, id: number): NoticeQueue {
  return promote({
    visible: queue.visible.filter((notice) => notice.id !== id),
    waiting: queue.waiting.filter((notice) => notice.id !== id),
  })
}
