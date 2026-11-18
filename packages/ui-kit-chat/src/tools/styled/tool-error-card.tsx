import {createMemo, Show, type JSX} from 'solid-js'
import OctagonAlert from 'lucide-solid/icons/octagon-alert'
import {ClipboardCopyButton, Collapsible, TruncatedText} from '@conciv/ui-kit-system'
import {
  BLOCK,
  FOLD_ROW,
  FoldIndicator,
  TRACE_HOVER_INDENT,
  TRACE_LINE,
  TRACE_MICROLABEL,
} from '../../styled/trace/trace-row.js'
import {TraceBodyFrame} from '../../styled/trace/output-block.js'
import {OUTCOME_TONE} from '../primitives/tool-presentation.js'

export interface ToolErrorCardProps {
  tool: string
  error: string
  title?: string
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  subtitle?: string
}

const ROW = `${TRACE_LINE} ${TRACE_HOVER_INDENT} ${FOLD_ROW}`
const ICON = `flex-none inline-flex w-chat-mark justify-center ${OUTCOME_TONE.error.text}`
const TITLE = `${TRACE_MICROLABEL} min-w-10 ${OUTCOME_TONE.error.text}`
const SUBTITLE =
  'flex-none min-w-0 max-w-1/2 truncate text-chat-sm leading-none [font-family:var(--chat-mono)] text-chat-target'
const SUMMARY = `flex-1 min-w-0 truncate text-chat-xs leading-none [font-family:var(--chat-mono)] ${OUTCOME_TONE.error.text}`
const COPY_ROW = 'flex justify-end'
const COPY_RESET_MS = 3000
const COPY_LABELS = {copied: 'Copied the error', failed: 'Could not copy the error'}
const COPY_TOOLTIPS = {idle: 'Copy error'}

export function ToolErrorCard(props: ToolErrorCardProps): JSX.Element {
  const name = () => props.title ?? props.tool
  const cleaned = createMemo(() => props.error.replace(/^Error:\s*/, '').trim())
  const tail = createMemo(() => {
    const prefix = `${props.tool} `
    return cleaned().startsWith(prefix) ? cleaned().slice(prefix.length) : cleaned()
  })
  const summary = createMemo(() => {
    const head = (tail().split(': ')[0] ?? '').trim()
    if (!head) return 'Failed'
    return `${head.charAt(0).toUpperCase()}${head.slice(1)}`
  })
  return (
    <Collapsible.Root
      open={props.open}
      defaultOpen={props.defaultOpen}
      onOpenChange={(details) => props.onOpenChange?.(details.open)}
      class="min-w-0 w-full"
    >
      <Collapsible.Trigger class={ROW}>
        <span class={ICON} aria-hidden="true">
          <OctagonAlert class="size-3" />
        </span>
        <span class={TITLE}>{name()}</span>
        <Show when={props.subtitle}>{(subtitle) => <TruncatedText class={SUBTITLE} text={subtitle()} />}</Show>
        <Collapsible.Context>
          {(collapsible) => (
            <Show when={!collapsible().open}>
              <span class={SUMMARY}>{summary()}</span>
            </Show>
          )}
        </Collapsible.Context>
        <FoldIndicator />
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div class={BLOCK}>
          <TraceBodyFrame tone="error">
            <div class={COPY_ROW}>
              <ClipboardCopyButton
                text={cleaned()}
                resetMs={COPY_RESET_MS}
                labels={COPY_LABELS}
                tooltips={COPY_TOOLTIPS}
                class="shrink-0 size-6"
              />
            </div>
            <p class="m-0 whitespace-pre-wrap">{cleaned()}</p>
          </TraceBodyFrame>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
