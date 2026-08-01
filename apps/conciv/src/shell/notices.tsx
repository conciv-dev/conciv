import {
  createContext,
  createSignal,
  For,
  onCleanup,
  useContext,
  type Accessor,
  type JSX,
  type ParentProps,
} from 'solid-js'
import {X} from 'lucide-solid'
import {Button, TooltipIconButton} from '@conciv/ui-kit-system'
import {
  dismissNotice,
  FUSE_MS,
  makeNotice,
  NO_NOTICES,
  pushNotice,
  type Notice,
  type NoticeTone,
  type Notify,
} from '../chat/notify.js'

const STRIP = 'flex flex-col gap-1.5 empty:hidden'
const NOTICE =
  'flex items-center gap-2 text-[0.75rem] leading-[1.4] font-medium font-pw px-2.5 py-2 border rounded-pw-md [word-break:break-word] anim-msg'
const ACTION = 'shrink-0 font-semibold'
const DISMISS = 'shrink-0 size-5 rounded-pw-pill'

const TONE: Record<NoticeTone, string> = {
  info: 'border-pw-line bg-pw-fill text-pw-text-2',
  success: 'border-pw-success-18 bg-pw-fill text-pw-text-2',
  warn: 'border-pw-warn-20 bg-pw-fill text-pw-warn',
  danger: 'border-pw-danger-line bg-pw-danger-10 text-pw-danger',
}

type NoticeApi = {
  notify: Notify
  visible: Accessor<Notice[]>
  dismiss: (id: number) => void
}

const NoticeContext = createContext<NoticeApi>()

export function NoticeProvider(
  props: ParentProps<{announce: (message: string, assertive?: boolean) => void}>,
): JSX.Element {
  const [queue, setQueue] = createSignal(NO_NOTICES)
  const fuses = new Map<number, ReturnType<typeof setTimeout>>()
  let lastId = 0

  const dismiss = (id: number) => {
    const fuse = fuses.get(id)
    if (fuse) clearTimeout(fuse)
    fuses.delete(id)
    setQueue((current) => dismissNotice(current, id))
  }

  const notify: Notify = (message, options) => {
    lastId += 1
    const notice = makeNotice(lastId, message, options)
    setQueue((current) => pushNotice(current, notice))
    props.announce(notice.action ? `${message} ${notice.action.label}.` : message, notice.tone === 'danger')
    if (notice.sticky) return
    fuses.set(
      notice.id,
      setTimeout(() => dismiss(notice.id), FUSE_MS),
    )
  }

  onCleanup(() => {
    for (const fuse of fuses.values()) clearTimeout(fuse)
    fuses.clear()
  })

  return (
    <NoticeContext.Provider value={{notify, visible: () => queue().visible, dismiss}}>
      {props.children}
    </NoticeContext.Provider>
  )
}

function useNotices(): NoticeApi {
  const api = useContext(NoticeContext)
  if (!api) throw new Error('notices are only available inside a NoticeProvider')
  return api
}

export function useNotify(): Notify {
  return useNotices().notify
}

export function NoticeStrip(): JSX.Element {
  const notices = useNotices()
  return (
    <div class={STRIP}>
      <For each={notices.visible()}>
        {(notice) => (
          <div class={`${NOTICE} ${TONE[notice.tone]}`} role={notice.tone === 'danger' ? 'alert' : 'status'}>
            <span class="flex-1 min-w-0">{notice.message}</span>
            <For each={notice.action ? [notice.action] : []}>
              {(action) => (
                <Button
                  variant="link"
                  size="bare"
                  class={ACTION}
                  onClick={() => {
                    notices.dismiss(notice.id)
                    action.run()
                  }}
                >
                  {action.label}
                </Button>
              )}
            </For>
            <TooltipIconButton tooltip="Dismiss" class={DISMISS} onClick={() => notices.dismiss(notice.id)}>
              <X class="size-3.5 block" aria-hidden="true" />
            </TooltipIconButton>
          </div>
        )}
      </For>
    </div>
  )
}
