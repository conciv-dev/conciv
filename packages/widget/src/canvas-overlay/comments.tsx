import {createSignal, For, Show, onCleanup} from 'solid-js'
import type {CanvasDoc, CanvasPin} from '../canvas/canvas-doc.js'
import type {CommentClient, CommentRecord} from '../canvas/comment-client.js'

// The comment interaction layer over the canvas: in comment mode a click places a pin + opens a
// composer (creates a floating comment through core, which writes the row + Yjs pin in one execute);
// clicking any pin opens its thread (parts + replies + a reply box). Pins come from the synced doc, so
// AI- and peer-created comments appear here too. Status drives appearance (resolved -> dimmed).
const textOf = (c: CommentRecord) => c.parts.map((p) => p.text ?? '').join(' ')

export function Comments(props: {
  doc: CanvasDoc
  client: CommentClient
  commentMode: () => boolean
  onPlaced: () => void
}) {
  const [pins, setPins] = createSignal<CanvasPin[]>([...props.doc.pins.values()])
  const syncPins = () => setPins([...props.doc.pins.values()])
  props.doc.pins.observe(syncPins)
  onCleanup(() => props.doc.pins.unobserve(syncPins))

  const [comments, setComments] = createSignal<CommentRecord[]>([])
  const refresh = async () => setComments(await props.client.list({}).catch(() => []))
  void refresh()

  const [compose, setCompose] = createSignal<{x: number; y: number} | null>(null)
  const [openId, setOpenId] = createSignal<string | null>(null)
  const [draft, setDraft] = createSignal('')

  const placeAt = (e: MouseEvent) => {
    if (!props.commentMode()) return
    setCompose({x: e.clientX, y: e.clientY})
    setDraft('')
  }

  const save = async () => {
    const at = compose()
    if (!at || !draft().trim()) return
    await props.client.create({
      parts: [{type: 'text', text: draft().trim()}],
      kind: 'floating',
      pin: {x: at.x, y: at.y, pinState: 'locked'},
    })
    setCompose(null)
    props.onPlaced()
    await refresh()
  }

  const reply = async (parentId: string) => {
    if (!draft().trim()) return
    await props.client.reply({parentId, parts: [{type: 'text', text: draft().trim()}]})
    setDraft('')
    await refresh()
  }

  const thread = (id: string) => {
    const root = comments().find((c) => c.id === id)
    if (!root) return []
    return comments()
      .filter((c) => c.threadId === root.threadId)
      .sort((a, b) => (a.createdAt as number) - (b.createdAt as number))
  }

  const card = {
    position: 'absolute',
    width: '260px',
    padding: '10px',
    'border-radius': '10px',
    background: 'white',
    color: '#111',
    'box-shadow': '0 6px 24px rgba(0,0,0,0.25)',
    'pointer-events': 'auto',
    'font-size': '13px',
    'z-index': '10',
  } as const
  const input = {width: '100%', 'box-sizing': 'border-box', 'min-height': '54px', 'margin-bottom': '6px'} as const

  return (
    <>
      {/* Capture layer: only interactive in comment mode, to catch the placement click. */}
      <Show when={props.commentMode()}>
        <div
          style={{position: 'absolute', inset: '0', 'pointer-events': 'auto', cursor: 'crosshair'}}
          onClick={placeAt}
        />
      </Show>

      {/* Pins (also clickable to open their thread). */}
      <For each={pins()}>
        {(pin) => {
          const c = () => comments().find((x) => x.id === pin.commentId)
          const resolved = () => c()?.status === 'resolved'
          return (
            <button
              type="button"
              aria-label={`comment pin ${pin.commentId}`}
              onClick={() => setOpenId(pin.commentId)}
              style={{
                position: 'absolute',
                left: `${pin.x}px`,
                top: `${pin.y}px`,
                width: '22px',
                height: '22px',
                'border-radius': '50% 50% 50% 0',
                background: resolved() ? '#9ca3af' : pin.pinState === 'offset' ? '#f59e0b' : '#6366f1',
                opacity: resolved() ? '0.6' : '1',
                border: '2px solid white',
                cursor: 'pointer',
                transform: 'translate(-50%, -100%)',
                'pointer-events': 'auto',
              }}
            />
          )
        }}
      </For>

      {/* Compose popover (placement). */}
      <Show when={compose()}>
        {(at) => (
          <div style={{...card, left: `${at().x + 14}px`, top: `${at().y}px`}}>
            <textarea
              style={input}
              placeholder="Leave a comment…"
              value={draft()}
              onInput={(e) => setDraft(e.currentTarget.value)}
            />
            <div style={{display: 'flex', gap: '6px', 'justify-content': 'flex-end'}}>
              <button type="button" onClick={() => setCompose(null)}>
                Cancel
              </button>
              <button type="button" onClick={save}>
                Comment
              </button>
            </div>
          </div>
        )}
      </Show>

      {/* Thread popover. */}
      <Show when={openId()}>
        {(id) => {
          const pin = () => pins().find((p) => p.commentId === id())
          return (
            <Show when={pin()}>
              {(p) => (
                <div
                  style={{...card, left: `${p().x + 14}px`, top: `${p().y}px`}}
                  role="dialog"
                  aria-label="comment thread"
                >
                  <For each={thread(id())}>
                    {(c) => (
                      <div style={{'margin-bottom': '8px', opacity: c.status === 'resolved' ? '0.6' : '1'}}>
                        <div style={{'font-weight': '600', 'font-size': '11px', color: '#666'}}>
                          {c.authorKind === 'ai' ? '🤖 AI' : '🧑 You'} {c.status === 'resolved' ? '· resolved' : ''}
                        </div>
                        <div>{textOf(c)}</div>
                      </div>
                    )}
                  </For>
                  <textarea
                    style={input}
                    placeholder="Reply…"
                    value={draft()}
                    onInput={(e) => setDraft(e.currentTarget.value)}
                  />
                  <div style={{display: 'flex', gap: '6px', 'justify-content': 'space-between'}}>
                    <button type="button" onClick={async () => (await props.client.resolve(id()), refresh())}>
                      Resolve
                    </button>
                    <div style={{display: 'flex', gap: '6px'}}>
                      <button type="button" onClick={() => setOpenId(null)}>
                        Close
                      </button>
                      <button type="button" onClick={() => reply(id())}>
                        Reply
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </Show>
          )
        }}
      </Show>
    </>
  )
}
