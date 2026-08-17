import {ClientOnly} from '@tanstack/react-router'
import {DitheringWarp} from './dithering-warp'
import {SiltField} from './silt-field'
import {SynthRibbon} from './synth-ribbon'

const FRAME_EFFECTS = {
  silt: SiltField,
  ditheringWarp: DitheringWarp,
  synthRibbon: SynthRibbon,
}

type FrameEffectName = keyof typeof FRAME_EFFECTS

const ACTIVE_FRAME_EFFECT: FrameEffectName = 'synthRibbon'

export function FrameBackdrop() {
  const FrameEffect = FRAME_EFFECTS[ACTIVE_FRAME_EFFECT]

  return (
    <div
      aria-hidden
      data-effect={ACTIVE_FRAME_EFFECT}
      className="od-frame-backdrop pointer-events-none absolute inset-0 overflow-hidden"
    >
      <ClientOnly>
        <FrameEffect />
      </ClientOnly>
    </div>
  )
}
