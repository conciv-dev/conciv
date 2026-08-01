import {Match, Switch, splitProps, type JSX} from 'solid-js'
import {Button, StatusDot} from '@conciv/ui-kit-system'
import type {Adopted} from './connect-steps.js'
import {CopyCommand} from './copy-command.js'
import {
  BACK_LABEL,
  CANNOT_TELL,
  CONTACT_LOST,
  DIALLED_IN,
  DONE_LABEL,
  RELOAD_HEADS_UP,
  WAITING_TO_DIAL_IN,
} from './connect-copy.js'

const LEAD = 'text-pw-text text-sm leading-normal m-0'
const HINT = 'text-pw-text-3 text-xs leading-normal m-0'
const LINK = 'self-start min-h-11 text-xs'
const STATUS = 'flex items-center gap-2 text-xs m-0'
const WAITING = `${STATUS} text-pw-text-3`
const LOST = `${STATUS} text-pw-danger`
const CONNECTED = `${STATUS} text-pw-success`
const TOUCH = 'min-h-11 px-3'

export function ReloadCard(props: {
  adopted: Adopted
  dialledIn: boolean
  contactLost: boolean
  unreachable: boolean
  focusRef: (el: HTMLElement) => void
  onBack: () => void
  onDone: () => void
}): JSX.Element {
  const [local] = splitProps(props, [
    'adopted',
    'dialledIn',
    'contactLost',
    'unreachable',
    'focusRef',
    'onBack',
    'onDone',
  ])
  return (
    <div class="flex flex-col gap-3 anim-now">
      <p class={LEAD}>
        Following <strong>{local.adopted.title}</strong>.
      </p>
      <p class={HINT}>
        That session started before conciv was installed, so one step happens in the terminal. Run this there once, and
        never again in this project.
      </p>
      <CopyCommand
        command={local.adopted.reloadCommand}
        focusRef={local.focusRef}
        lead={
          <Button variant="link" size="bare" class={LINK} onClick={() => local.onBack()}>
            {BACK_LABEL}
          </Button>
        }
      />
      <p class={HINT}>{RELOAD_HEADS_UP}</p>
      <Switch>
        <Match when={local.dialledIn}>
          <div class="flex justify-between items-center gap-2">
            <p class={CONNECTED} role="status">
              <StatusDot tone="success" />
              {DIALLED_IN}
            </p>
            <Button size="sm" class={TOUCH} onClick={() => local.onDone()}>
              {DONE_LABEL}
            </Button>
          </div>
        </Match>
        <Match when={local.unreachable}>
          <p class={LOST} role="alert">
            <StatusDot tone="danger" />
            {CANNOT_TELL}
          </p>
        </Match>
        <Match when={local.contactLost}>
          <p class={LOST} role="alert">
            <StatusDot tone="danger" />
            {CONTACT_LOST}
          </p>
        </Match>
        <Match when={true}>
          <p class={WAITING} role="status">
            <StatusDot tone="accent" pulse />
            {WAITING_TO_DIAL_IN}
          </p>
        </Match>
      </Switch>
    </div>
  )
}
