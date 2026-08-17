import {ClientOnly} from '@tanstack/react-router'
import {DitheringWarp} from './dithering-warp'
import {Ferrofluid} from './ferrofluid'
import {SiltField} from './silt-field'
import {SynthRibbon} from './synth-ribbon'

const FRAME_EFFECTS = {
  silt: SiltField,
  ditheringWarp: DitheringWarp,
  synthRibbon: SynthRibbon,
  ferrofluid: Ferrofluid,
}

type FrameEffectName = keyof typeof FRAME_EFFECTS

const ACTIVE_FRAME_EFFECT: FrameEffectName = 'ferrofluid'

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
