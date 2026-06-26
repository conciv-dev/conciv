import {For, Show, createMemo, createSignal, type JSX} from 'solid-js'
import {z} from 'zod'
import {useAll, useDb} from 'jazz-tools/solid'
import type {JsonValue} from 'jazz-tools'
import type {ToolViewCtx} from '@mandarax/protocol/tool-view-types'
import {ToolCallCard, builtinToolCards, type ToolCallCardProps} from '@mandarax/tool-ui'
import {Button, TextField} from '@mandarax/ui-kit-system'
import {app} from '../../shared/schema.js'

export type ThreadProps = {
  previewId: string
  sessionId: string
  rootCid: string
  ctx: ToolViewCtx
  onClose: () => void
}

const PANEL =
  'fixed right-4 bottom-4 w-90 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-auto pointer-events-auto bg-pw-panel text-pw-text border border-pw-line rounded-pw-lg shadow-pw-lg p-3 flex flex-col gap-2'

const TextPart = z.object({type: z.literal('text'), text: z.string()})
const ToolPart = z.object({
  type: z.literal('tool'),
  name: z.string(),
  arguments: z.unknown().optional(),
  output: z.unknown().optional(),
})
const authorLabel = (kind: string): string => (kind === 'ai' ? 'AI' : 'Human')

function renderPart(part: unknown, key: string, ctx: ToolViewCtx): JSX.Element {
  const text = TextPart.safeParse(part)
  if (text.success) return <p class="text-[0.8125rem] text-pw-text">{text.data.text}</p>
  const tool = ToolPart.safeParse(part)
  if (!tool.success) return <pre class="text-[0.6875rem] text-pw-text-3 overflow-auto">{JSON.stringify(part)}</pre>
  const callPart: ToolCallCardProps['part'] = {
    type: 'tool-call',
    id: key,
    name: tool.data.name,
    arguments: JSON.stringify(tool.data.arguments ?? {}),
    state: 'complete',
    output: tool.data.output,
  }
  const result: ToolCallCardProps['result'] =
    tool.data.output === undefined
      ? undefined
      : {type: 'tool-result', toolCallId: key, content: JSON.stringify(tool.data.output), state: 'complete'}
  return <ToolCallCard part={callPart} result={result} ctx={ctx} tools={() => builtinToolCards} />
}

export function Thread(props: ThreadProps): JSX.Element {
  const db = useDb()
  const comments = useAll(() => ({query: app.comments.where({previewId: props.previewId, sessionId: props.sessionId})}))
  const root = createMemo(() => (comments.data ?? []).find((comment) => comment.cid === props.rootCid))
  const thread = createMemo(() => {
    const threadId = root()?.threadId
    if (!threadId) return []
    return (comments.data ?? [])
      .filter((comment) => comment.threadId === threadId)
      .toSorted((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
  })
  const [draft, setDraft] = createSignal('')

  const send = (): void => {
    const text = draft().trim()
    const parent = root()
    if (!text || !parent) return
    setDraft('')
    const now = new Date()
    db().insert(app.comments, {
      previewId: props.previewId,
      sessionId: props.sessionId,
      cid: crypto.randomUUID(),
      threadId: parent.threadId,
      parentId: props.rootCid,
      parts: [{type: 'text', text}] as JsonValue,
      authorKind: 'human',
      status: 'open',
      kind: 'floating',
      createdAt: now,
      updatedAt: now,
    })
  }

  const resolve = (): void => {
    const parent = root()
    if (!parent) return
    const now = new Date()
    db().update(app.comments, parent.id, {status: 'resolved', resolvedAt: now, updatedAt: now})
  }

  return (
    <div role="dialog" aria-label="Comment thread" class={PANEL}>
      <div class="flex justify-between items-center">
        <strong class="text-pw-text">Thread</strong>
        <span class="flex gap-2">
          <Button variant="ghost" size="sm" aria-label="Resolve thread" onClick={() => resolve()}>
            Resolve
          </Button>
          <Button variant="ghost" size="sm" aria-label="Close thread" onClick={() => props.onClose()}>
            Close
          </Button>
        </span>
      </div>
      <For each={thread()}>
        {(comment) => (
          <article class="border-t border-pw-line pt-2 flex flex-col gap-1">
            <div class="text-[0.75rem] text-pw-text-3">{authorLabel(comment.authorKind)}</div>
            <For each={comment.parts as unknown[]}>
              {(part, index) => renderPart(part, `${comment.cid}-${index()}`, props.ctx)}
            </For>
          </article>
        )}
      </For>
      <Show when={root()}>
        <div class="flex gap-2 items-end mt-1">
          <TextField
            aria-label="Reply"
            class="flex-1"
            value={draft()}
            onInput={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') send()
            }}
          />
          <Button size="sm" aria-label="Send reply" onClick={() => send()}>
            Send
          </Button>
        </div>
      </Show>
    </div>
  )
}
