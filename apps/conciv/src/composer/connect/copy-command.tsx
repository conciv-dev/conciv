import {createSignal, onCleanup, Show, splitProps, type JSX} from 'solid-js'
import {Button} from '@conciv/ui-kit-system'
import {CLIPBOARD_BLOCKED, COPIED_LABEL, COPY_LABEL, SELECT_COMMAND_LABEL} from './connect-copy.js'

const CHIP_MS = 2_500

const CODE =
  'font-mono text-xs text-pw-text bg-pw-fill rounded-pw-sm py-1.5 px-2 break-all max-h-24 overflow-y-auto [unicode-bidi:plaintext]'
const ROW = 'flex justify-between items-center gap-2 flex-wrap'
const CHIP = 'text-pw-success text-xs m-0'
const BLOCKED = 'text-pw-warn text-xs leading-normal m-0'
const TOUCH = 'min-h-11 px-3'

async function writeToClipboard(command: string): Promise<boolean> {
  const board = navigator.clipboard
  if (!board) return false
  try {
    await board.writeText(command)
    return true
  } catch {
    return false
  }
}

function selectAll(node: HTMLElement): void {
  const range = document.createRange()
  range.selectNodeContents(node)
  const selection = window.getSelection()
  if (!selection) return
  selection.removeAllRanges()
  selection.addRange(range)
}

export function CopyCommand(props: {
  command: string
  lead?: JSX.Element
  focusRef?: (el: HTMLElement) => void
}): JSX.Element {
  const [local] = splitProps(props, ['command', 'lead', 'focusRef'])
  const [copied, setCopied] = createSignal(false)
  const [blocked, setBlocked] = createSignal(false)
  let code: HTMLElement | undefined
  let chip: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(chip))

  const run = async (): Promise<void> => {
    if (blocked()) {
      if (code) selectAll(code)
      return
    }
    const ok = await writeToClipboard(local.command)
    if (!ok) {
      setBlocked(true)
      if (code) selectAll(code)
      return
    }
    setCopied(true)
    clearTimeout(chip)
    chip = setTimeout(() => setCopied(false), CHIP_MS)
  }

  return (
    <div class="flex flex-col gap-2">
      <code
        ref={(element: HTMLElement) => {
          code = element
        }}
        class={CODE}
        dir="ltr"
        onClick={() => code && selectAll(code)}
      >
        {local.command}
      </code>
      <Show when={blocked()}>
        <p class={BLOCKED}>{CLIPBOARD_BLOCKED}</p>
      </Show>
      <div class={ROW}>
        {local.lead}
        <span class="flex items-center gap-2 ms-auto">
          <Show when={copied()}>
            <span class={CHIP} role="status">
              {COPIED_LABEL}
            </span>
          </Show>
          <Button
            ref={(element: HTMLElement) => local.focusRef?.(element)}
            variant="ghost"
            size="sm"
            class={`${TOUCH} focus-ring-always`}
            onClick={() => void run()}
          >
            <Show when={blocked()} fallback={COPY_LABEL}>
              {SELECT_COMMAND_LABEL}
            </Show>
          </Button>
        </span>
      </div>
    </div>
  )
}
