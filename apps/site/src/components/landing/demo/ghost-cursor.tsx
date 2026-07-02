import {type RefObject} from 'react'

export function GhostCursor({cursorRef}: {cursorRef: RefObject<HTMLDivElement | null>}) {
  return (
    <div ref={cursorRef} aria-hidden className="pointer-events-none absolute left-0 top-0 z-30 opacity-0 drop-shadow">
      <svg width="22" height="22" viewBox="0 0 22 22" fill="white" stroke="#222" strokeWidth="1.3">
        <path d="M3 2l5 15 2.5-6.2L17 8.5z" />
      </svg>
    </div>
  )
}
