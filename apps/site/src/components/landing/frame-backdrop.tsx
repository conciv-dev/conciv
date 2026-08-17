import {ClientOnly} from '@tanstack/react-router'
import {SiltField} from './silt-field'

const FrameEffect = SiltField

export function FrameBackdrop() {
  return (
    <div aria-hidden className="od-frame-backdrop pointer-events-none absolute inset-0 overflow-hidden">
      <ClientOnly>
        <FrameEffect />
      </ClientOnly>
    </div>
  )
}
