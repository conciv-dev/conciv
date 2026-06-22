import {For, createMemo, createSignal, onCleanup, type JSX} from 'solid-js'
import {render} from 'solid-js/web'
import {useLiveQuery} from '@tanstack/solid-db'
import type * as Y from 'yjs'
import {PINS_KEY, type PinGeometry} from '../room.js'
import {getCommentsCollection} from '../comments-store.js'
import type {Comment} from '../schema.js'

export type MountPinsOpts = {
  container: HTMLElement
  doc: Y.Doc
  onOpen?: (cid: string) => void
}

const STATUS_COLOR: Record<Comment['status'], string> = {
  open: '#4263eb',
  resolved: '#2f9e44',
  drifted: '#f08c00',
  orphaned: '#868e96',
}

const authorLabel = (kind: Comment['author_kind'] | undefined): string =>
  kind === 'ai' ? 'AI' : kind === 'human' ? 'Human' : 'Unknown'

function PinsLayer(props: MountPinsOpts): JSX.Element {
  const pinsMap = props.doc.getMap<PinGeometry>(PINS_KEY)
  const [pins, setPins] = createSignal<PinGeometry[]>([...pinsMap.values()])
  const sync = (): void => {
    setPins([...pinsMap.values()])
  }
  pinsMap.observe(sync)
  onCleanup(() => pinsMap.unobserve(sync))

  const comments = useLiveQuery((q) => q.from({c: getCommentsCollection()}))
  const byCid = createMemo(() => new Map(comments.data.map((c) => [c.cid, c])))

  return (
    <For each={pins()}>
      {(pin) => {
        const row = (): Comment | undefined => byCid().get(pin.cid)
        const status = (): Comment['status'] => row()?.status ?? 'open'
        return (
          <button
            type="button"
            data-whiteboard-pin={pin.cid}
            data-status={status()}
            data-pin-state={pin.pinState}
            aria-label={`${authorLabel(row()?.author_kind)} comment, ${status()}`}
            onClick={() => props.onOpen?.(pin.cid)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') props.onOpen?.(pin.cid)
              if (event.key === 'Escape') event.currentTarget.blur()
            }}
            style={{
              position: 'absolute',
              left: `${pin.x}px`,
              top: `${pin.y}px`,
              transform: 'translate(-50%, -50%)',
              width: '24px',
              height: '24px',
              'border-radius': '50% 50% 50% 0',
              border: '2px solid #fff',
              background: STATUS_COLOR[status()],
              cursor: 'pointer',
              'pointer-events': 'auto',
              'box-shadow': '0 1px 4px rgba(0,0,0,0.3)',
            }}
          />
        )
      }}
    </For>
  )
}

export function mountPins(opts: MountPinsOpts): () => void {
  return render(() => <PinsLayer {...opts} />, opts.container)
}
