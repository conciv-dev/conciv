import {Show, type JSX} from 'solid-js'
import {X} from 'lucide-solid'
import {Button, Toast, ToastGroup, TooltipIconButton, createToaster} from '@conciv/ui-kit-system'

export type NoticeTone = 'info' | 'success' | 'warn' | 'danger'

export type NoticeAction = {label: string; run: () => void}

export type NoticeOptions = {key?: string; tone?: NoticeTone; action?: NoticeAction; persist?: boolean}

export type Notify = (message: string, options?: NoticeOptions) => void

const FUSE_MS = 6_000
const STANDING_LIMIT = 2

const TOAST_TYPE: Record<NoticeTone, string> = {info: 'info', success: 'success', warn: 'warning', danger: 'error'}

const NOTICE =
  'w-full flex items-center gap-2 text-[0.75rem] leading-[1.4] font-medium font-pw px-2.5 py-2 border rounded-pw-md shadow-pw-lg [word-break:break-word] anim-msg'
const ACTION = 'shrink-0 font-semibold'
const DISMISS = 'shrink-0 size-5 rounded-pw-pill'

const TONE_INFO = 'border-pw-line bg-pw-fill text-pw-text-2'
const TONE_SUCCESS = 'border-pw-success-18 bg-pw-fill text-pw-text-2'
const TONE_WARN = 'border-pw-warn-20 bg-pw-fill text-pw-warn'
const TONE_DANGER = 'border-pw-danger-line bg-pw-danger-10 text-pw-danger'

function toneClass(type: string | undefined): string {
  if (type === 'success') return TONE_SUCCESS
  if (type === 'warning') return TONE_WARN
  if (type === 'error') return TONE_DANGER
  return TONE_INFO
}

export const toaster = createToaster({placement: 'bottom', gap: 8, max: STANDING_LIMIT, offsets: '1rem'})

export const notify: Notify = (message, options = {}) => {
  const action = options.action
  const standing = options.persist === true || action !== undefined
  toaster.create({
    ...(options.key ? {id: options.key} : {}),
    ...(action ? {action: {label: action.label, onClick: action.run}} : {}),
    title: message,
    type: TOAST_TYPE[options.tone ?? 'info'],
    duration: standing ? Number.POSITIVE_INFINITY : FUSE_MS,
  })
}

export function NoticeToaster(): JSX.Element {
  return (
    <ToastGroup toaster={toaster} class="pb-2 empty:hidden" style={{position: 'static'}}>
      {(toast) => (
        <Toast.Root
          class={`${NOTICE} ${toneClass(toast().type)}`}
          style={{position: 'relative'}}
          role={toast().type === 'error' ? 'alert' : 'status'}
        >
          <Toast.Title class="flex-1 min-w-0">{toast().title}</Toast.Title>
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
      )}
    </ToastGroup>
  )
}
