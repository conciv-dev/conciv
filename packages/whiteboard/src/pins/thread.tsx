import {For, Show, createMemo, createSignal, type JSX} from 'solid-js'
import {render} from 'solid-js/web'
import {z} from 'zod'
import {useLiveQuery} from '@tanstack/solid-db'
import type {ToolViewCtx} from '@mandarax/protocol/tool-view-types'
import {ToolCallCard, builtinTools, type ToolCallCardProps} from '@mandarax/tool-ui'
import {getCommentsCollection} from '../comments-store.js'
import type {Comment} from '../schema.js'

export type MountThreadOpts = {
  container: HTMLElement
  rootCid: string
  ctx: ToolViewCtx
  runTool: (name: string, input: unknown) => Promise<unknown>
  onClose?: () => void
}

const TextPart = z.object({type: z.literal('text'), text: z.string()})
const ToolPart = z.object({
  type: z.literal('tool'),
  name: z.string(),
  arguments: z.unknown().optional(),
  output: z.unknown().optional(),
})

const authorLabel = (kind: Comment['author_kind']): string => (kind === 'ai' ? 'AI' : 'Human')

function renderPart(part: unknown, key: string, props: MountThreadOpts): JSX.Element {
  const text = TextPart.safeParse(part)
  if (text.success) return <p data-comment-text>{text.data.text}</p>
  const tool = ToolPart.safeParse(part)
  if (!tool.success) return <pre data-comment-raw>{JSON.stringify(part)}</pre>
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
  return <ToolCallCard part={callPart} result={result} ctx={props.ctx} tools={() => builtinTools} />
}

function Thread(props: MountThreadOpts): JSX.Element {
  const comments = useLiveQuery((q) => q.from({c: getCommentsCollection()}))
  const root = createMemo(() => comments.data.find((c) => c.cid === props.rootCid))
  const thread = createMemo(() => {
    const threadId = root()?.thread_id
    if (!threadId) return []
    return comments.data
      .filter((c) => c.thread_id === threadId)
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
  })
  const [draft, setDraft] = createSignal('')
  const send = async (): Promise<void> => {
    const text = draft().trim()
    if (!text) return
    setDraft('')
    await props.runTool('comment.reply', {cid: props.rootCid, parts: [{type: 'text', text}], author_kind: 'human'})
  }
  return (
    <div
      role="dialog"
      aria-label="Comment thread"
      data-whiteboard-thread={props.rootCid}
      style={{
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        width: '360px',
        'max-height': '70vh',
        overflow: 'auto',
        background: '#fff',
        border: '1px solid #dee2e6',
        'border-radius': '8px',
        'box-shadow': '0 6px 24px rgba(0,0,0,0.18)',
        padding: '12px',
        'pointer-events': 'auto',
      }}
    >
      <div style={{display: 'flex', 'justify-content': 'space-between', 'align-items': 'center'}}>
        <strong>Thread</strong>
        <span style={{display: 'flex', gap: '8px'}}>
          <button
            type="button"
            aria-label="Resolve thread"
            onClick={() => void props.runTool('comment.resolve', {cid: props.rootCid})}
          >
            Resolve
          </button>
          <button type="button" aria-label="Close thread" onClick={() => props.onClose?.()}>
            Close
          </button>
        </span>
      </div>
      <For each={thread()}>
        {(comment) => (
          <article
            data-comment={comment.cid}
            style={{'border-top': '1px solid #f1f3f5', 'padding-top': '8px', 'margin-top': '8px'}}
          >
            <div style={{'font-size': '0.75rem', color: '#868e96'}}>{authorLabel(comment.author_kind)}</div>
            <For each={comment.parts}>{(part, index) => renderPart(part, `${comment.cid}-${index()}`, props)}</For>
          </article>
        )}
      </For>
      <Show when={root()}>
        <div style={{'margin-top': '12px', display: 'flex', gap: '8px'}}>
          <input
            aria-label="Reply"
            value={draft()}
            onInput={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void send()
            }}
            style={{flex: '1', padding: '6px', border: '1px solid #dee2e6', 'border-radius': '4px'}}
          />
          <button type="button" aria-label="Send reply" onClick={() => void send()}>
            Send
          </button>
        </div>
      </Show>
    </div>
  )
}

export function mountThread(opts: MountThreadOpts): () => void {
  return render(() => <Thread {...opts} />, opts.container)
}
