import type {Ref} from 'react'

export function LandingSpacer({ref}: {ref?: Ref<HTMLDivElement>}) {
  return (
    <div ref={ref} aria-hidden className="od-ruled od-band-grid">
      <div className="od-page">
        <div className="od-col h-3.5" />
      </div>
    </div>
  )
}
