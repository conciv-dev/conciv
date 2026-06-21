// A small control bar for what Excalidraw's own chrome doesn't cover: Comment mode (place pins),
// Browse (pass-through so the app beneath is clickable), and Close. Drawing + zoom use Excalidraw's
// native toolbar. Pinned top-right with pointer-events on, above the canvas, so it's always reachable.
export function Controls(props: {
  commentMode: () => boolean
  passThrough: () => boolean
  onComment: (on: boolean) => void
  onPassThrough: (on: boolean) => void
  onClose: () => void
}) {
  const bar = {
    position: 'absolute',
    top: '12px',
    right: '12px',
    display: 'flex',
    gap: '4px',
    padding: '4px',
    'border-radius': '10px',
    background: 'rgba(20,20,28,0.85)',
    'box-shadow': '0 4px 16px rgba(0,0,0,0.3)',
    'pointer-events': 'auto',
    'z-index': '20',
  } as const
  const btn = (active: boolean) =>
    ({
      height: '30px',
      padding: '0 10px',
      border: 'none',
      'border-radius': '7px',
      background: active ? '#6366f1' : 'transparent',
      color: 'white',
      'font-size': '13px',
      cursor: 'pointer',
    }) as const

  return (
    <div style={bar}>
      <button
        type="button"
        style={btn(props.commentMode())}
        aria-label={props.commentMode() ? 'Stop commenting' : 'Comment'}
        onClick={() => props.onComment(!props.commentMode())}
      >
        💬 {props.commentMode() ? 'Click to pin' : 'Comment'}
      </button>
      <button
        type="button"
        style={btn(props.passThrough())}
        aria-label={props.passThrough() ? 'Resume editing the canvas' : 'Browse the app underneath'}
        onClick={() => props.onPassThrough(!props.passThrough())}
      >
        {props.passThrough() ? '👆 Browsing' : '👆 Browse'}
      </button>
      <button type="button" style={btn(false)} aria-label="Close canvas" onClick={props.onClose}>
        ✕
      </button>
    </div>
  )
}
