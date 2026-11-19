import {createMemo, Show, type JSX} from 'solid-js'
import OctagonAlert from 'lucide-solid/icons/octagon-alert'
import {ClipboardCopyButton, Collapsible, TruncatedText} from '@conciv/ui-kit-system'
import {BLOCK, FOLD_ROW, FoldIndicator, TRACE_HOVER_INDENT, TRACE_LINE} from '../../styled/trace/trace-row.js'
import {TraceBodyFrame} from '../../styled/trace/output-block.js'
import {OUTCOME_TONE} from '../primitives/tool-presentation.js'
import {toolErrorTitle} from '../primitives/tool-error-subtitle.js'

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
const TITLE = 'flex-none min-w-0 truncate text-chat-sm leading-none [font-family:var(--chat-mono)] text-chat-target'
const SUBTITLE =
  'flex-initial min-w-0 max-w-1/2 truncate text-chat-sm leading-none [font-family:var(--chat-mono)] text-chat-text-2'
const SUMMARY = `flex-1 min-w-0 truncate text-chat-sm leading-none [font-family:var(--chat-mono)] ${OUTCOME_TONE.error.text}`
const CONTENT = 'relative pe-8'
const COPY =
  'absolute top-0 end-0 [transition:opacity_150ms_var(--chat-ease)] motion-reduce:[transition:none] [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:group-hover/error:opacity-100 [@media(hover:hover)]:group-hover/error:pointer-events-auto [@media(hover:hover)]:group-focus-within/error:opacity-100 [@media(hover:hover)]:group-focus-within/error:pointer-events-auto'
const COPY_RESET_MS = 3000
const COPY_LABELS = {copied: 'Copied the error', failed: 'Could not copy the error'}
const COPY_TOOLTIPS = {idle: 'Copy error'}

export function ToolErrorCard(props: ToolErrorCardProps): JSX.Element {
  const name = () => props.title || toolErrorTitle(props.tool)
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
      class="group/error min-w-0 w-full"
    >
      <Collapsible.Trigger class={ROW}>
        <span class={ICON} role="img" aria-label="error">
          <OctagonAlert class="size-3" aria-hidden="true" />
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
            <div class={CONTENT}>
              <Collapsible.Context>
                {(collapsible) => (
                  <Show when={collapsible().open}>
                    <div class={COPY}>
                      <ClipboardCopyButton
                        text={cleaned()}
                        resetMs={COPY_RESET_MS}
                        labels={COPY_LABELS}
                        tooltips={COPY_TOOLTIPS}
                        class="shrink-0 size-6"
                      />
                    </div>
                  </Show>
                )}
              </Collapsible.Context>
              <p class="m-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{cleaned()}</p>
            </div>
          </TraceBodyFrame>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
