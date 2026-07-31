import {splitProps, type JSX} from 'solid-js'
import {Button} from '@conciv/ui-kit-system'
import {CLOSE_LABEL, COPY_LABEL, SNIPPET_HINT} from './connect-copy.js'

const LEAD = 'text-pw-text text-sm leading-normal m-0'
const HINT = 'text-pw-text-3 text-xs leading-normal m-0'
const CODE = 'font-mono text-xs text-pw-text bg-pw-fill rounded-pw-sm py-1.5 px-2 break-all max-h-24 overflow-y-auto'

export function SnippetCard(props: {
  command: string
  detail: string
  onCopy: (text: string) => void
  onClose: () => void
}): JSX.Element {
  const [local] = splitProps(props, ['command', 'detail', 'onCopy', 'onClose'])
  return (
    <div class="flex flex-col gap-3">
      <p class={LEAD}>{local.detail}</p>
      <p class={HINT}>{SNIPPET_HINT}</p>
      <code class={CODE}>{local.command}</code>
      <div class="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => local.onCopy(local.command)}>
          {COPY_LABEL}
        </Button>
        <Button size="sm" onClick={() => local.onClose()}>
          {CLOSE_LABEL}
        </Button>
      </div>
    </div>
  )
}
