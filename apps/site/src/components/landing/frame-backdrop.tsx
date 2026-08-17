import {ClientOnly} from '@tanstack/react-router'
import {DitheringWarp} from './dithering-warp'
import {SiltField} from './silt-field'

const FRAME_EFFECTS = {
  silt: SiltField,
  ditheringWarp: DitheringWarp,
}

type FrameEffectName = keyof typeof FRAME_EFFECTS

const ACTIVE_FRAME_EFFECT: FrameEffectName = 'ditheringWarp'

export function FrameBackdrop() {
  const FrameEffect = FRAME_EFFECTS[ACTIVE_FRAME_EFFECT]

  return (
    <div aria-hidden className="od-frame-backdrop pointer-events-none absolute inset-0 overflow-hidden">
      <ClientOnly>
        <FrameEffect />
      </ClientOnly>
    </div>
  )
}
