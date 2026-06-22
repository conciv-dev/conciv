import type {JSX} from 'solid-js'

export type DragPromptProps = {
  x: number
  y: number
  onDisconnect: () => void
  onKeep: () => void
  onCancel: () => void
}

const BTN = {
  display: 'block',
  width: '100%',
  'text-align': 'left',
  padding: '6px 10px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  'font-size': '0.8125rem',
} as const

// Shown when a source-linked pin is dragged off its element: disconnect to a floating pin, keep the
// source link but accept the drift (offset + tether), or cancel and snap back.
export function DragPrompt(props: DragPromptProps): JSX.Element {
  return (
    <div
      role="dialog"
      aria-label="Pin drift"
      data-whiteboard-drag-prompt
      style={{
        position: 'absolute',
        left: `${props.x + 16}px`,
        top: `${props.y}px`,
        background: '#fff',
        border: '1px solid #dee2e6',
        'border-radius': '8px',
        'box-shadow': '0 6px 24px rgba(0,0,0,0.18)',
        padding: '4px',
        'pointer-events': 'auto',
        'min-width': '180px',
      }}
    >
      <button type="button" style={BTN} onClick={() => props.onDisconnect()}>
        Disconnect from source
      </button>
      <button type="button" style={BTN} onClick={() => props.onKeep()}>
        Keep link, accept drift
      </button>
      <button type="button" style={BTN} onClick={() => props.onCancel()}>
        Cancel
      </button>
    </div>
  )
}
