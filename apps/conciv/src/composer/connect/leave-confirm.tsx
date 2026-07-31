import {splitProps, type JSX} from 'solid-js'
import {Button} from '@conciv/ui-kit-system'
import {HAND_BACK_CLOSE_LABEL, KEEP_WAITING_LABEL, LEAVING_HINT, LEAVING_UNRELOADED} from './connect-copy.js'

const LEAD = 'text-pw-text text-sm leading-normal m-0'
const HINT = 'text-pw-text-3 text-xs leading-normal m-0'

export function LeaveConfirm(props: {title: string; onKeepWaiting: () => void; onHandBack: () => void}): JSX.Element {
  const [local] = splitProps(props, ['title', 'onKeepWaiting', 'onHandBack'])
  return (
    <div class="flex flex-col gap-3">
      <p class={LEAD}>{LEAVING_UNRELOADED}</p>
      <p class={HINT}>
        <strong>{local.title}</strong> goes back to running on its own. {LEAVING_HINT}
      </p>
      <div class="flex justify-end items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => local.onHandBack()}>
          {HAND_BACK_CLOSE_LABEL}
        </Button>
        <Button size="sm" onClick={() => local.onKeepWaiting()}>
          {KEEP_WAITING_LABEL}
        </Button>
      </div>
    </div>
  )
}
