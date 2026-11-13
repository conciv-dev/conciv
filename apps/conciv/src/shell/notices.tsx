import {For, Show, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import Check from 'lucide-solid/icons/check'
import X from 'lucide-solid/icons/x'
import {Button, Loader, Toast, ToastGroup, TooltipIconButton, createToaster} from '@conciv/ui-kit-system'

export type NoticeTone = 'info' | 'success' | 'warn' | 'danger'

export type NoticeAction = {label: string; run: () => void}

export type NoticeIcon = Component<{class?: string}>

export type NoticeOptions = {
  key?: string
  tone?: NoticeTone
  description?: string
  icon?: NoticeIcon
  duration?: number
  loading?: boolean
  action?: NoticeAction
  actions?: readonly NoticeAction[]
  persist?: boolean
}

export type NoticeHandle = {dismiss: () => void}

export type Notify = (message: string, options?: NoticeOptions) => NoticeHandle

export type NoticeStore = {
  notify: Notify
  remove: (key: string) => void
  Toaster: () => JSX.Element
}

type NoticeExtras = {icon?: NoticeIcon; actions: readonly NoticeAction[]}

const FUSE_MS = 6_000
const STANDING_LIMIT = 3

const TOAST_TYPE: Record<NoticeTone, string> = {info: 'info', success: 'success', warn: 'warning', danger: 'error'}

const NOTICE =
  'w-full flex items-center gap-2 text-[0.75rem] leading-[1.4] font-medium font-chat px-2.5 py-2 border rounded-chat-surface-md shadow-chat-lg [word-break:break-word] anim-msg'
const ICON_SLOT = 'shrink-0 flex items-center h-1lh'
const ICON = 'size-3.5 block'
const DESCRIPTION = 'font-normal text-chat-text-3'
const ACTION_ROW = 'flex flex-wrap gap-x-3 gap-y-1 pt-1'
const ACTION = 'shrink-0 font-semibold'
const DISMISS = 'shrink-0 size-5 rounded-chat-pill'

const TONE_INFO = 'border-chat-line bg-chat-fill text-chat-text-2'
const TONE_SUCCESS = 'border-chat-success-18 bg-chat-fill text-chat-text-2'
const TONE_WARN = 'border-chat-warn-20 bg-chat-fill text-chat-warn'
const TONE_DANGER = 'border-chat-danger-line bg-chat-danger-10 text-chat-danger'

function toneClass(type: string | undefined): string {
  if (type === 'success') return TONE_SUCCESS
  if (type === 'warning') return TONE_WARN
  if (type === 'error') return TONE_DANGER
  return TONE_INFO
}

function noticeActions(options: NoticeOptions): readonly NoticeAction[] {
  if (options.actions) return options.actions
  return options.action ? [options.action] : []
}

function noticeDuration(options: NoticeOptions, actions: readonly NoticeAction[]): number {
  if (options.persist === true || options.loading === true) return Number.POSITIVE_INFINITY
  if (options.duration !== undefined) return options.duration
  return actions.length > 0 ? Number.POSITIVE_INFINITY : FUSE_MS
}

function NoticeIconSlot(props: {type: string | undefined; icon: NoticeIcon | undefined}): JSX.Element {
  const icon = (): NoticeIcon | undefined => props.icon ?? (props.type === 'success' ? Check : undefined)
  return (
    <Show
      when={props.type === 'loading'}
      fallback={
        <Show when={icon()}>
          {(Icon) => (
            <span class={ICON_SLOT} aria-hidden="true">
              <Dynamic component={Icon()} class={ICON} />
            </span>
          )}
        </Show>
      }
    >
      <span class={ICON_SLOT}>
        <Loader.Root size="sm" class="!p-0">
          <Loader.Indicator class={ICON} />
        </Loader.Root>
      </span>
    </Show>
  )
}

export function StandingNotice(props: {message: string; action?: NoticeAction}): JSX.Element {
  return (
    <div class="p-2.5">
      <div class={`${NOTICE} ${TONE_DANGER}`} role="alert">
        <p class="flex-1 min-w-0 m-0">{props.message}</p>
        <Show when={props.action}>
          {(action) => (
            <Button variant="link" size="bare" class={ACTION} onClick={() => action().run()}>
              {action().label}
            </Button>
          )}
        </Show>
      </div>
    </div>
  )
}

export function createNoticeStore(): NoticeStore {
  const toaster = createToaster({placement: 'bottom', gap: 8, max: STANDING_LIMIT})

  const notify: Notify = (message, options = {}) => {
    const actions = noticeActions(options)
    const single = actions.length === 1 ? actions[0] : undefined
    const extras: NoticeExtras = {icon: options.icon, actions: actions.length > 1 ? actions : []}
    const id = toaster.create({
      ...(options.key ? {id: options.key} : {}),
      ...(single ? {action: {label: single.label, onClick: single.run}} : {}),
      title: message,
      description: options.description,
      type: options.loading === true ? 'loading' : TOAST_TYPE[options.tone ?? 'info'],
      duration: noticeDuration(options, actions),
      meta: {notice: extras},
    })
    return {dismiss: () => toaster.remove(id)}
  }

  const remove = (key: string): void => toaster.remove(key)

  function Toaster(): JSX.Element {
    return (
      <ToastGroup toaster={toaster} class="p-2.5 empty:p-0" style={{position: 'static'}}>
        {(toast) => {
          const extras = (): NoticeExtras | undefined => toast().meta?.notice
          return (
            <Toast.Root
              class={`${NOTICE} ${toneClass(toast().type)}`}
              style={{position: 'relative'}}
              role={toast().type === 'error' ? 'alert' : 'status'}
            >
              <NoticeIconSlot type={toast().type} icon={extras()?.icon} />
              <div class="flex-1 min-w-0">
                <Toast.Title>{toast().title}</Toast.Title>
                <Show when={toast().description}>
                  {(description) => <Toast.Description class={DESCRIPTION}>{description()}</Toast.Description>}
                </Show>
                <Show when={extras()?.actions.length}>
                  <div class={ACTION_ROW}>
                    <For each={extras()?.actions}>
                      {(action) => (
                        <Toast.ActionTrigger
                          onClick={() => action.run()}
                          asChild={(triggerProps) => (
                            <Button variant="link" size="bare" class={ACTION} {...triggerProps()}>
                              {action.label}
                            </Button>
                          )}
                        />
                      )}
                    </For>
                  </div>
                </Show>
              </div>
              <Show when={toast().action}>
                {(action) => (
                  <Toast.ActionTrigger
                    asChild={(triggerProps) => (
                      <Button variant="link" size="bare" class={ACTION} {...triggerProps()}>
                        {action().label}
                      </Button>
                    )}
                  />
                )}
              </Show>
              <Toast.CloseTrigger
                asChild={(triggerProps) => (
                  <TooltipIconButton tooltip="Dismiss" class={DISMISS} {...triggerProps()}>
                    <X class="size-3.5 block" aria-hidden="true" />
                  </TooltipIconButton>
                )}
              />
            </Toast.Root>
          )
        }}
      </ToastGroup>
    )
  }

  return {notify, remove, Toaster}
}
