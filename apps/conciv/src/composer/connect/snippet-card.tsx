import {splitProps, type JSX} from 'solid-js'
import {Button} from '@conciv/ui-kit-system'
import {CopyCommand} from './copy-command.js'
import {CLOSE_LABEL, SNIPPET_HINT} from './connect-copy.js'

const LEAD = 'text-pw-text text-sm leading-normal m-0'
const HINT = 'text-pw-text-3 text-xs leading-normal m-0'
const TOUCH = 'min-h-11 px-3'

export function SnippetCard(props: {
  command: string
  detail: string
  focusRef: (el: HTMLElement) => void
  onClose: () => void
}): JSX.Element {
  const [local] = splitProps(props, ['command', 'detail', 'focusRef', 'onClose'])
  return (
    <div class="flex flex-col gap-3">
      <p class={LEAD}>{local.detail}</p>
      <p class={HINT}>{SNIPPET_HINT}</p>
      <CopyCommand command={local.command} focusRef={local.focusRef} />
      <div class="flex justify-end gap-2">
        <Button size="sm" class={TOUCH} onClick={() => local.onClose()}>
          {CLOSE_LABEL}
        </Button>
      </div>
    </div>
  )
}
