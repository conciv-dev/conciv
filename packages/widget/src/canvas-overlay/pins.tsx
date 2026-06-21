import {createSignal, onCleanup, For} from 'solid-js'
import type {CanvasDoc, CanvasPin} from '../canvas/canvas-doc.js'

// Solid pin markers, driven by the canvas doc's pins map (the Yjs half of the comment join). Reactive
// via observe -> signal. Pins render absolutely positioned over the canvas; clicking one opens its
// thread (wired by onOpen). Appearance is a pure function of state — desaturated when resolved.
export function Pins(props: {doc: CanvasDoc; onOpen: (commentId: string) => void}) {
  const [pins, setPins] = createSignal<CanvasPin[]>([...props.doc.pins.values()])
  const sync = () => setPins([...props.doc.pins.values()])
  props.doc.pins.observe(sync)
  onCleanup(() => props.doc.pins.unobserve(sync))

  return (
    <For each={pins()}>
      {(pin) => (
        <button
          type="button"
          aria-label={`comment pin ${pin.commentId}`}
          onClick={() => props.onOpen(pin.commentId)}
          style={{
            position: 'absolute',
            left: `${pin.x}px`,
            top: `${pin.y}px`,
            width: '20px',
            height: '20px',
            'border-radius': '50% 50% 50% 0',
            background: pin.pinState === 'offset' ? '#f59e0b' : '#6366f1',
            border: '2px solid white',
            cursor: 'pointer',
            transform: 'translate(-50%, -100%)',
            'pointer-events': 'auto',
          }}
        />
      )}
    </For>
  )
}
