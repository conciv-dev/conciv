import {Match, Switch, splitProps, type JSX} from 'solid-js'
import {Button} from '@conciv/ui-kit-system'
import type {Adopted} from './connect-steps.js'
import {
  BACK_LABEL,
  CONTACT_LOST,
  COPY_LABEL,
  DIALLED_IN,
  DONE_LABEL,
  RELOAD_HEADS_UP,
  WAITING_TO_DIAL_IN,
} from './connect-copy.js'

const LEAD = 'text-pw-text text-sm leading-normal m-0'
const HINT = 'text-pw-text-3 text-xs leading-normal m-0'
const CODE = 'font-mono text-xs text-pw-text bg-pw-fill rounded-pw-sm py-1.5 px-2 break-all max-h-24 overflow-y-auto'
const LINK =
  'self-start [border:none] bg-transparent p-0 text-xs text-pw-accent-link cursor-pointer underline underline-offset-2 focus-ring'
const STATUS = 'flex items-center gap-2 text-xs m-0'
const WAITING = `${STATUS} text-pw-text-3`
const LOST = `${STATUS} text-pw-danger`
const CONNECTED = `${STATUS} text-pw-success`
const DOT = 'size-1.75 rounded-pw-pill shrink-0'
const SPINNER = `${DOT} bg-pw-accent anim-pulse`
const LOST_DOT = `${DOT} bg-pw-danger`
const CONNECTED_DOT = `${DOT} bg-pw-success`

export function ReloadCard(props: {
  adopted: Adopted
  dialledIn: boolean
  contactLost: boolean
  onCopy: (text: string) => void
  onBack: () => void
  onDone: () => void
}): JSX.Element {
  const [local] = splitProps(props, ['adopted', 'dialledIn', 'contactLost', 'onCopy', 'onBack', 'onDone'])
  return (
    <div class="flex flex-col gap-3">
      <p class={LEAD}>
        Following <strong>{local.adopted.title}</strong>.
      </p>
      <p class={HINT}>
        That session started before conciv was installed, so one step happens in the terminal. Run this there once, and
        never again in this project.
      </p>
      <code class={CODE}>{local.adopted.reloadCommand}</code>
      <div class="flex justify-between items-center gap-2">
        <button type="button" class={LINK} onClick={() => local.onBack()}>
          {BACK_LABEL}
        </button>
        <Button variant="ghost" size="sm" onClick={() => local.onCopy(local.adopted.reloadCommand)}>
          {COPY_LABEL}
        </Button>
      </div>
      <p class={HINT}>{RELOAD_HEADS_UP}</p>
      <Switch>
        <Match when={local.dialledIn}>
          <div class="flex justify-between items-center gap-2">
            <p class={CONNECTED} role="status">
              <span class={CONNECTED_DOT} />
              {DIALLED_IN}
            </p>
            <Button size="sm" onClick={() => local.onDone()}>
              {DONE_LABEL}
            </Button>
          </div>
        </Match>
        <Match when={local.contactLost}>
          <p class={LOST} role="alert">
            <span class={LOST_DOT} />
            {CONTACT_LOST}
          </p>
        </Match>
        <Match when={true}>
          <p class={WAITING} role="status">
            <span class={SPINNER} />
            {WAITING_TO_DIAL_IN}
          </p>
        </Match>
      </Switch>
    </div>
  )
}
